import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActionItem } from '../entities/action-item.entity';
import { TaskExtensionRequest } from '../entities/task-extension-request.entity';
import { User } from '../entities/user.entity';
import { TeamsService } from '../teams/teams.service';
import { CreateExtensionDto } from './dto/create-extension.dto';

@Injectable()
export class TaskExtensionsService {
  constructor(
    @InjectRepository(TaskExtensionRequest)
    private extRepo: Repository<TaskExtensionRequest>,
    @InjectRepository(ActionItem)
    private actionRepo: Repository<ActionItem>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private teamsService: TeamsService,
  ) {}

  // 팀원 누구나 진행 중인 태스크의 이름·난이도·담당자·마감일 변경 요청
  async requestExtension(
    userId: number,
    actionItemId: number,
    dto: CreateExtensionDto,
  ) {
    const action = await this.actionRepo.findOne({
      where: { id: actionItemId },
    });
    if (!action) throw new NotFoundException('태스크를 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, action.team_id);

    if (action.status !== 'todo' && action.status !== 'in_progress') {
      throw new BadRequestException(
        '진행 중인 태스크만 수정을 요청할 수 있습니다.',
      );
    }

    const hasChange =
      dto.requested_due_date !== undefined ||
      dto.requested_description !== undefined ||
      dto.requested_difficulty !== undefined ||
      dto.requested_assignee_id !== undefined;
    if (!hasChange) throw new BadRequestException('변경할 항목이 없습니다.');

    const existing = await this.extRepo.findOne({
      where: { action_item_id: actionItemId, status: 'pending' },
    });

    const payload = {
      action_item_id: actionItemId,
      requester_id: userId,
      requested_due_date: dto.requested_due_date
        ? new Date(dto.requested_due_date)
        : null,
      requested_description: dto.requested_description ?? null,
      requested_difficulty: dto.requested_difficulty ?? null,
      requested_assignee_id: dto.requested_assignee_id ?? null,
      reason: dto.reason,
      status: 'pending' as const,
    };

    if (existing) {
      return this.extRepo.save({ ...existing, ...payload });
    }
    return this.extRepo.save(this.extRepo.create(payload));
  }

  // 팀의 수정 요청 목록 (status 필터)
  async list(userId: number, teamId: number, status?: string) {
    await this.teamsService.requireMembership(userId, teamId);
    const actions = await this.actionRepo.find({
      where: { team_id: teamId },
      select: {
        id: true,
        description: true,
        due_date: true,
        difficulty: true,
        assignee_id: true,
      },
    });
    if (actions.length === 0) return [];
    const actionById = new Map(actions.map((a) => [Number(a.id), a]));

    const exts = await this.extRepo.find({
      where: {
        action_item_id: In(actions.map((a) => a.id)),
        ...(status ? { status: status as TaskExtensionRequest['status'] } : {}),
      },
      order: { created_at: 'DESC' },
    });
    const names = await this.userNames(exts.map((e) => Number(e.requester_id)));
    return exts.map((e) => {
      const action = actionById.get(Number(e.action_item_id));
      return {
        id: Number(e.id),
        action_item_id: Number(e.action_item_id),
        requester_id: Number(e.requester_id),
        requester_name: names.get(Number(e.requester_id)) ?? '알 수 없음',
        task_description: action?.description ?? '',
        current_due_date: action?.due_date?.toISOString() ?? null,
        current_difficulty: action?.difficulty ?? null,
        current_assignee_id:
          action?.assignee_id != null ? Number(action.assignee_id) : null,
        requested_due_date: e.requested_due_date?.toISOString() ?? null,
        requested_description: e.requested_description,
        requested_difficulty: e.requested_difficulty,
        requested_assignee_id: e.requested_assignee_id,
        reason: e.reason,
        status: e.status,
        created_at: e.created_at.toISOString(),
      };
    });
  }

  // 팀장 수락 — 요청된 항목만 적용
  async approve(userId: number, extensionId: number) {
    const { ext, action } = await this.requirePendingForLeader(
      userId,
      extensionId,
    );
    if (!ext || !action) return { status: 'closed' };

    if (ext.requested_due_date !== null)
      action.due_date = ext.requested_due_date;
    if (ext.requested_description !== null)
      action.description = ext.requested_description;
    if (ext.requested_difficulty !== null)
      action.difficulty = ext.requested_difficulty;
    if (ext.requested_assignee_id !== null) {
      // -1 = 담당자 해제, 양수 = 새 담당자
      action.assignee_id =
        ext.requested_assignee_id === -1 ? null : ext.requested_assignee_id;
    }

    await this.actionRepo.save(action);
    ext.status = 'approved';
    await this.extRepo.save(ext);
    return { status: 'approved' };
  }

  // 팀장 거절
  async reject(userId: number, extensionId: number) {
    const { ext } = await this.requirePendingForLeader(userId, extensionId);
    if (!ext) return { status: 'closed' };
    ext.status = 'rejected';
    await this.extRepo.save(ext);
    return { status: 'rejected' };
  }

  private async requirePendingForLeader(userId: number, extensionId: number) {
    const ext = await this.extRepo.findOne({ where: { id: extensionId } });
    if (!ext) throw new NotFoundException('수정 요청을 찾을 수 없습니다.');
    const action = await this.actionRepo.findOne({
      where: { id: ext.action_item_id },
    });
    if (!action) throw new NotFoundException('태스크를 찾을 수 없습니다.');
    await this.teamsService.requireLeader(userId, action.team_id);
    if (ext.status !== 'pending') return { ext: null, action: null };
    return { ext, action };
  }

  private async userNames(ids: number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.userRepo.find({ where: { id: In(ids) } });
    return new Map(users.map((u) => [Number(u.id), u.name]));
  }
}
