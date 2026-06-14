import {
  BadRequestException,
  ForbiddenException,
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

  // 담당자가 기한 지난·미완료 태스크에 연장 요청
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

    if (Number(action.assignee_id) !== userId) {
      throw new ForbiddenException('담당자만 연장을 요청할 수 있습니다.');
    }
    if (action.status !== 'todo' && action.status !== 'in_progress') {
      throw new BadRequestException(
        '진행 중인 태스크만 연장을 요청할 수 있습니다.',
      );
    }
    if (!action.due_date) {
      throw new BadRequestException('기한이 없는 태스크입니다.');
    }
    const now = new Date();
    if (action.due_date.getTime() >= now.getTime()) {
      throw new BadRequestException('아직 기한이 지나지 않았습니다.');
    }
    const requested = new Date(dto.requested_due_date);
    if (requested.getTime() <= action.due_date.getTime()) {
      throw new BadRequestException('새 기한은 기존 기한 이후여야 합니다.');
    }
    const existing = await this.extRepo.findOne({
      where: { action_item_id: actionItemId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException(
        '이미 처리 대기 중인 연장 요청이 있습니다.',
      );
    }

    return this.extRepo.save(
      this.extRepo.create({
        action_item_id: actionItemId,
        requester_id: userId,
        requested_due_date: requested,
        reason: dto.reason,
        status: 'pending',
      }),
    );
  }

  // 팀의 연장 요청 목록 (status 필터) — 팀장 처리 목록 + 본인 요청 조회
  async list(userId: number, teamId: number, status?: string) {
    await this.teamsService.requireMembership(userId, teamId);
    const actions = await this.actionRepo.find({
      where: { team_id: teamId },
      select: { id: true, description: true, due_date: true },
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
        requested_due_date: e.requested_due_date.toISOString(),
        reason: e.reason,
        status: e.status,
        created_at: e.created_at.toISOString(),
      };
    });
  }

  // 팀장 수락 — 태스크 기한을 요청한 날짜로 변경
  async approve(userId: number, extensionId: number) {
    const { ext, action } = await this.requirePendingForLeader(
      userId,
      extensionId,
    );
    if (!ext || !action) return { status: 'closed' };
    action.due_date = ext.requested_due_date;
    await this.actionRepo.save(action);
    ext.status = 'approved';
    await this.extRepo.save(ext);
    return { status: 'approved' };
  }

  // 팀장 거절 — 태스크는 그대로, 담당자는 재요청 가능
  async reject(userId: number, extensionId: number) {
    const { ext } = await this.requirePendingForLeader(userId, extensionId);
    if (!ext) return { status: 'closed' };
    ext.status = 'rejected';
    await this.extRepo.save(ext);
    return { status: 'rejected' };
  }

  // 팀장 권한 확인 + pending 요청 로드 (이미 처리됐으면 ext=null 반환 → 멱등)
  private async requirePendingForLeader(userId: number, extensionId: number) {
    const ext = await this.extRepo.findOne({ where: { id: extensionId } });
    if (!ext) throw new NotFoundException('연장 요청을 찾을 수 없습니다.');
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
