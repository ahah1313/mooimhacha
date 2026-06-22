import {
  BadRequestException,
  Body,
  Controller,
  forwardRef,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Post,
  Query,
  Redirect,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { TeamSettings } from '../entities/team-settings.entity';
import { MeetingAbsencesService } from '../meeting-absences/meeting-absences.service';
import { TeamsService } from '../teams/teams.service';
import { SlackService } from './slack.service';

interface SlackInteractionPayload {
  type: string;
  user: { id: string };
  actions?: Array<{ action_id: string; value: string }>;
}

@Controller('slack')
export class SlackController {
  constructor(
    private slackService: SlackService,
    private teamsService: TeamsService,
    @Inject(forwardRef(() => MeetingAbsencesService))
    private absencesService: MeetingAbsencesService,
    @InjectRepository(TeamSettings)
    private settingsRepo: Repository<TeamSettings>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Team)
    private teamRepo: Repository<Team>,
  ) {}

  @Get('oauth/url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Slack OAuth 설치 URL 생성' })
  getOAuthUrl(@Request() _req: unknown, @Query('team_id') teamId: string) {
    return { url: this.slackService.getOAuthUrl(Number(teamId)) };
  }

  @Get('oauth/callback')
  @Redirect()
  @ApiOperation({ summary: 'Slack OAuth 콜백' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const url = await this.slackService.handleOAuthCallback(code, state);
    return { url };
  }

  // Slack 테스트 전송 (팀장 전용) — type: 'channel' | 'dm'
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Slack 채널/DM 테스트 전송 (팀장만)' })
  async testSlack(
    @Request() req: { user: { id: number } },
    @Query('team_id') teamIdStr: string,
    @Query('type') type: 'channel' | 'dm',
  ) {
    const teamId = Number(teamIdStr);
    await this.teamsService.requireLeader(req.user.id, teamId);

    const [settings, team] = await Promise.all([
      this.settingsRepo.findOne({ where: { team_id: teamId } }),
      this.teamRepo.findOne({ where: { id: teamId } }),
    ]);
    if (!settings?.slack_bot_token) {
      throw new BadRequestException('Slack 봇이 연결되지 않았습니다.');
    }
    const teamName = team?.name ?? '팀';

    if (type === 'channel') {
      if (!settings.slack_channel_id) {
        throw new BadRequestException('채널 ID가 설정되지 않았습니다.');
      }
      await this.slackService.sendChannelMessage(
        settings.slack_bot_token,
        settings.slack_channel_id,
        `✅ *Slack 연동 테스트* — ${teamName}\n채널 메시지가 정상 전송됩니다.`,
      );
      return { ok: true };
    }

    const user = await this.userRepo.findOne({ where: { id: req.user.id } });
    if (!user?.slack_user_id) {
      throw new BadRequestException('내 Slack User ID가 설정되지 않았습니다.');
    }

    if (type === 'dm') {
      await this.slackService.sendDm(
        settings.slack_bot_token,
        user.slack_user_id,
        `✅ *Slack 연동 테스트* — ${teamName}\n개인 DM이 정상 전송됩니다.`,
      );
      return { ok: true };
    }

    if (type === 'button') {
      await this.slackService.sendDmWithBlocks(
        settings.slack_bot_token,
        user.slack_user_id,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🧪 *버튼 연동 테스트* — ${teamName}\n버튼을 클릭하면 서버까지 인터랙션이 정상 전달되는지 확인합니다.`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '🔘 클릭해서 테스트' },
                action_id: 'test_interaction',
                value: 'test',
              },
            ],
          },
        ],
        `버튼 연동 테스트 — ${teamName}`,
      );
      return { ok: true };
    }

    throw new InternalServerErrorException(
      'type은 channel, dm, button 중 하나여야 합니다.',
    );
  }

  // Slack Block Kit 버튼 클릭 수신 (공개 엔드포인트 — JWT 불필요)
  @Post('interactions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Slack 인터랙티브 컴포넌트 핸들러 (동의·테스트 버튼)',
  })
  async handleInteraction(
    @Body('payload') rawPayload: string,
  ): Promise<object> {
    if (!rawPayload) return {};
    try {
      const payload = JSON.parse(rawPayload) as SlackInteractionPayload;
      if (payload.type === 'block_actions') {
        for (const action of payload.actions ?? []) {
          if (action.action_id === 'test_interaction') {
            return {
              replace_original: true,
              text: '✅ 버튼 연동 정상 작동! 슬랙 인터랙션이 서버에 도달했습니다.',
            };
          }
          if (action.action_id === 'consent_absence') {
            const absenceId = Number(action.value);
            if (!isNaN(absenceId)) {
              void this.absencesService.consentBySlack(
                payload.user.id,
                absenceId,
              );
            }
          }
        }
      }
    } catch {
      // 파싱 오류 무시 — Slack은 200을 기대함
    }
    return {};
  }
}
