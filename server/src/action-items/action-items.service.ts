import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ActionItem } from '../entities/action-item.entity';
import { TeamSettings } from '../entities/team-settings.entity';
import { User } from '../entities/user.entity';
import { TeamsService } from '../teams/teams.service';
import { SlackService } from '../slack/slack.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private actionRepo: Repository<ActionItem>,
    @InjectRepository(TeamSettings)
    private settingsRepo: Repository<TeamSettings>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private teamsService: TeamsService,
    private slackService: SlackService,
  ) {}

  async create(userId: number, dto: CreateActionItemDto) {
    await this.teamsService.requireMembership(userId, dto.team_id);
    const action = this.actionRepo.create({
      team_id: dto.team_id,
      description: dto.description,
      detail: dto.detail ?? null,
      assignee_id: dto.assignee_id ?? null,
      due_date: dto.due_date ? new Date(dto.due_date) : null,
      difficulty: dto.difficulty ?? 2,
      is_for_next_meeting: dto.is_for_next_meeting ?? false,
      agenda_id: dto.agenda_id ?? null,
      link_url: dto.link_url ?? null,
      source: dto.source ?? 'manual',
      source_utterance_id: dto.source_utterance_id ?? null,
      status: dto.status ?? 'todo',
      completed_at: dto.status === 'done' ? new Date() : null,
      confirmed: dto.source === 'ai_extracted' ? false : true,
    });
    return this.actionRepo.save(action);
  }

  async list(
    userId: number,
    teamId: number,
    assigneeId?: number,
    meetingId?: number,
    confirmed?: boolean,
  ) {
    await this.teamsService.requireMembership(userId, teamId);
    const where: FindOptionsWhere<ActionItem> = { team_id: teamId };
    if (assigneeId) where.assignee_id = assigneeId;
    if (meetingId !== undefined) where.meeting_id = meetingId;
    if (confirmed !== undefined) where.confirmed = confirmed;
    return this.actionRepo.find({
      where,
      order: { due_date: 'ASC', created_at: 'ASC' },
    });
  }

  async update(userId: number, id: number, dto: UpdateActionItemDto) {
    const action = await this.requireAction(userId, id);
    if (dto.description !== undefined) action.description = dto.description;
    if (dto.detail !== undefined) action.detail = dto.detail;
    if (dto.assignee_id !== undefined) action.assignee_id = dto.assignee_id;
    if (dto.due_date !== undefined) action.due_date = new Date(dto.due_date);
    if (dto.difficulty !== undefined) action.difficulty = dto.difficulty;
    if (dto.is_for_next_meeting !== undefined)
      action.is_for_next_meeting = dto.is_for_next_meeting;
    if (dto.link_url !== undefined) action.link_url = dto.link_url;
    if (dto.confirmed !== undefined) action.confirmed = dto.confirmed;
    if (dto.status !== undefined) {
      action.status = dto.status;
      action.completed_at = dto.status === 'done' ? new Date() : null;
    }
    const saved = await this.actionRepo.save(action);

    if (dto.status === 'done') {
      void this.notifyTaskDone(saved);
    }

    return saved;
  }

  async remove(userId: number, id: number) {
    const action = await this.requireAction(userId, id);
    await this.actionRepo.remove(action);
    return { deleted: true };
  }

  private async requireAction(userId: number, id: number) {
    const action = await this.actionRepo.findOne({ where: { id } });
    if (!action) throw new NotFoundException('액션을 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, action.team_id);
    return action;
  }

  private async notifyTaskDone(action: ActionItem): Promise<void> {
    const settings = await this.settingsRepo.findOne({
      where: { team_id: action.team_id },
    });
    if (!settings?.slack_bot_token || !settings.slack_channel_id) return;

    let assigneeName = '담당자';
    if (action.assignee_id) {
      const user = await this.userRepo.findOne({
        where: { id: action.assignee_id },
      });
      if (user) assigneeName = user.name;
    }

    await this.slackService.sendChannelMessage(
      settings.slack_bot_token,
      settings.slack_channel_id,
      `✅ ${assigneeName} [${action.description}] 완료`,
    );
  }
}
