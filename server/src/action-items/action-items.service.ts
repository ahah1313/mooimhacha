import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { ActionItem } from '../entities/action-item.entity';
import {
  ActionItemLog,
  ActionItemChange,
} from '../entities/action-item-log.entity';
import { Team } from '../entities/team.entity';
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
    @InjectRepository(ActionItemLog)
    private logRepo: Repository<ActionItemLog>,
    @InjectRepository(Team)
    private teamRepo: Repository<Team>,
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

    // 변경 전 값 스냅샷
    const oldDescription = action.description;
    const oldDifficulty = action.difficulty;
    const oldAssigneeId = action.assignee_id;
    const oldDueDate = action.due_date;
    const oldStatus = action.status;

    if (dto.description !== undefined) action.description = dto.description;
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

    // 로그 기록 (변경 사항이 있을 때만)
    const changes = await this.buildChanges(
      {
        description: oldDescription,
        difficulty: oldDifficulty,
        assignee_id: oldAssigneeId,
        due_date: oldDueDate,
        status: oldStatus,
      },
      {
        description: dto.description,
        difficulty: dto.difficulty,
        assignee_id: dto.assignee_id,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
        status: dto.status,
      },
    );
    if (changes.length > 0) {
      const actor = await this.userRepo.findOne({ where: { id: userId } });
      await this.logRepo.save(
        this.logRepo.create({
          action_item_id: saved.id,
          team_id: saved.team_id,
          actor_id: userId,
          actor_name: actor?.name ?? '알 수 없음',
          action: 'edit',
          task_description: saved.description,
          changes,
        }),
      );
    }

    if (dto.status === 'done') {
      void this.notifyTaskDone(saved);
    }

    return saved;
  }

  async remove(userId: number, id: number) {
    const action = await this.requireAction(userId, id);
    const actor = await this.userRepo.findOne({ where: { id: userId } });

    // 삭제 전에 로그 먼저 기록
    await this.logRepo.save(
      this.logRepo.create({
        action_item_id: action.id,
        team_id: action.team_id,
        actor_id: userId,
        actor_name: actor?.name ?? '알 수 없음',
        action: 'delete',
        task_description: action.description,
        changes: null,
      }),
    );

    await this.actionRepo.remove(action);
    return { deleted: true };
  }

  async getTeamLogs(userId: number, teamId: number) {
    await this.teamsService.requireMembership(userId, teamId);
    const logs = await this.logRepo.find({
      where: { team_id: teamId },
      order: { created_at: 'DESC' },
    });
    return logs.map((l) => ({
      id: Number(l.id),
      action_item_id: l.action_item_id ? Number(l.action_item_id) : null,
      actor_name: l.actor_name,
      action: l.action,
      task_description: l.task_description,
      changes: l.changes,
      created_at: this.logDateToIso(l.created_at),
    }));
  }

  async getLogs(userId: number, actionItemId: number) {
    const action = await this.actionRepo.findOne({
      where: { id: actionItemId },
    });
    if (!action) throw new NotFoundException('태스크를 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, action.team_id);

    const logs = await this.logRepo.find({
      where: { action_item_id: actionItemId },
      order: { created_at: 'DESC' },
    });
    return logs.map((l) => ({
      id: Number(l.id),
      actor_name: l.actor_name,
      action: l.action,
      task_description: l.task_description,
      changes: l.changes,
      created_at: this.logDateToIso(l.created_at),
    }));
  }

  // @CreateDateColumn()은 MySQL CURRENT_TIMESTAMP(UTC)로 저장되지만,
  // 커넥션 timezone '+09:00' 때문에 mysql2가 DATETIME 값을 KST로 해석해
  // Date 객체가 실제 UTC보다 9시간 앞당겨진다. 9시간을 더해 올바른 UTC를 복원한다.
  private logDateToIso(d: Date): string {
    return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString();
  }

  private async buildChanges(
    before: {
      description: string;
      difficulty: number;
      assignee_id: number | null;
      due_date: Date | null;
      status: string;
    },
    after: {
      description?: string;
      difficulty?: number;
      assignee_id?: number | null;
      due_date?: Date;
      status?: string;
    },
  ): Promise<ActionItemChange[]> {
    const changes: ActionItemChange[] = [];

    if (
      after.description !== undefined &&
      after.description !== before.description
    ) {
      changes.push({
        field: 'description',
        from: before.description,
        to: after.description,
      });
    }
    if (
      after.difficulty !== undefined &&
      after.difficulty !== before.difficulty
    ) {
      changes.push({
        field: 'difficulty',
        from: String(before.difficulty),
        to: String(after.difficulty),
      });
    }
    if (
      after.due_date !== undefined &&
      after.due_date?.getTime() !== before.due_date?.getTime()
    ) {
      changes.push({
        field: 'due_date',
        from: before.due_date?.toISOString() ?? null,
        to: after.due_date?.toISOString() ?? null,
      });
    }
    if (
      after.assignee_id !== undefined &&
      after.assignee_id !== before.assignee_id
    ) {
      const ids = [before.assignee_id, after.assignee_id].filter(
        (x): x is number => x != null,
      );
      const users =
        ids.length > 0
          ? await this.userRepo.find({ where: { id: In(ids) } })
          : [];
      const nameOf = (id: number | null) =>
        id == null
          ? '미지정'
          : (users.find((u) => u.id === id)?.name ?? '알 수 없음');
      changes.push({
        field: 'assignee',
        from: nameOf(before.assignee_id),
        to: nameOf(after.assignee_id ?? null),
      });
    }

    return changes;
  }

  private async requireAction(userId: number, id: number) {
    const action = await this.actionRepo.findOne({ where: { id } });
    if (!action) throw new NotFoundException('액션을 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, action.team_id);
    return action;
  }

  private async notifyTaskDone(action: ActionItem): Promise<void> {
    const [settings, team] = await Promise.all([
      this.settingsRepo.findOne({ where: { team_id: action.team_id } }),
      this.teamRepo.findOne({ where: { id: action.team_id } }),
    ]);
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
      [
        `✅ *태스크 완료* — ${team?.name ?? '팀'}`,
        `> *${assigneeName}* · ${action.description}`,
      ].join('\n'),
    );
  }
}
