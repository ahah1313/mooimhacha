import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebClient } from '@slack/web-api';
import { TeamSettings } from '../entities/team-settings.entity';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(TeamSettings)
    private settingsRepo: Repository<TeamSettings>,
  ) {}

  async sendChannelMessage(
    botToken: string,
    channelId: string,
    text: string,
  ): Promise<void> {
    try {
      const client = new WebClient(botToken);
      await client.chat.postMessage({ channel: channelId, text });
    } catch (e) {
      this.logger.error('Slack 채널 메시지 전송 실패', e as Error);
    }
  }

  async sendDm(
    botToken: string,
    slackUserId: string,
    text: string,
  ): Promise<void> {
    try {
      const client = new WebClient(botToken);
      const res = await client.conversations.open({ users: slackUserId });
      const dmChannelId = res.channel?.id;
      if (!dmChannelId) return;
      await client.chat.postMessage({ channel: dmChannelId, text });
    } catch (e) {
      this.logger.error('Slack DM 전송 실패', e as Error);
    }
  }

  async sendDmWithBlocks(
    botToken: string,
    slackUserId: string,
    blocks: object[],
    text: string,
  ): Promise<void> {
    try {
      const client = new WebClient(botToken);
      const res = await client.conversations.open({ users: slackUserId });
      const dmChannelId = res.channel?.id;
      if (!dmChannelId) return;
      await client.chat.postMessage({
        channel: dmChannelId,
        text,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        blocks: blocks as any, // Slack SDK blocks 타입 불일치 우회
      });
    } catch (e) {
      this.logger.error('Slack DM(blocks) 전송 실패', e as Error);
    }
  }

  getOAuthUrl(teamId: number): string {
    const clientId = this.config.get<string>('SLACK_CLIENT_ID') ?? '';
    const redirectUri = this.config.get<string>('SLACK_REDIRECT_URI') ?? '';
    const state = Buffer.from(String(teamId)).toString('base64');
    return (
      `https://slack.com/oauth/v2/authorize` +
      `?client_id=${clientId}` +
      `&scope=chat:write,im:write` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`
    );
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const clientId = this.config.get<string>('SLACK_CLIENT_ID') ?? '';
    const clientSecret = this.config.get<string>('SLACK_CLIENT_SECRET') ?? '';
    const redirectUri = this.config.get<string>('SLACK_REDIRECT_URI') ?? '';
    const clientUrl = this.config.get<string>('CLIENT_URL') ?? '';

    let teamId: number;
    try {
      teamId = Number(Buffer.from(state, 'base64').toString('utf-8'));
    } catch {
      return `${clientUrl}?slack=error`;
    }

    try {
      const client = new WebClient();
      const result = await client.oauth.v2.access({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      const botToken = result.access_token;
      if (!botToken) throw new Error('bot token 없음');

      let settings = await this.settingsRepo.findOne({
        where: { team_id: teamId },
      });
      if (!settings) {
        settings = this.settingsRepo.create({ team_id: teamId });
      }
      settings.slack_bot_token = botToken;
      await this.settingsRepo.save(settings);

      return `${clientUrl}/dashboard/${teamId}/settings?slack=connected`;
    } catch (e) {
      this.logger.error('Slack OAuth 콜백 실패', e as Error);
      return `${clientUrl}/dashboard/${teamId}/settings?slack=error`;
    }
  }
}
