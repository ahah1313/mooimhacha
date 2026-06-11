import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ActionItem } from '../entities/action-item.entity';
import { TeamsService } from '../teams/teams.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private actionRepo: Repository<ActionItem>,
    private teamsService: TeamsService,
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
    });
    return this.actionRepo.save(action);
  }

  async list(userId: number, teamId: number, assigneeId?: number) {
    await this.teamsService.requireMembership(userId, teamId);
    const where: FindOptionsWhere<ActionItem> = { team_id: teamId };
    if (assigneeId) where.assignee_id = assigneeId;
    return this.actionRepo.find({
      where,
      order: { due_date: 'ASC', created_at: 'ASC' },
    });
  }

  async update(userId: number, id: number, dto: UpdateActionItemDto) {
    const action = await this.requireAction(userId, id);
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
      // 완료 시각은 마감 준수 산정에 쓰임
      action.completed_at = dto.status === 'done' ? new Date() : null;
    }
    return this.actionRepo.save(action);
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
}
