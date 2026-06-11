import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decision } from '../entities/decision.entity';
import { Meeting } from '../entities/meeting.entity';
import { TeamsService } from '../teams/teams.service';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { UpdateDecisionDto } from './dto/update-decision.dto';

@Injectable()
export class DecisionsService {
  constructor(
    @InjectRepository(Decision)
    private decisionRepo: Repository<Decision>,
    @InjectRepository(Meeting)
    private meetingRepo: Repository<Meeting>,
    private teamsService: TeamsService,
  ) {}

  async create(userId: number, dto: CreateDecisionDto) {
    await this.requireMeetingAccess(userId, dto.meeting_id);
    const decision = this.decisionRepo.create({
      meeting_id: dto.meeting_id,
      content: dto.content,
      created_by: userId,
      agenda_id: dto.agenda_id ?? null,
      source: dto.source ?? 'manual',
      source_utterance_id: dto.source_utterance_id ?? null,
    });
    return this.decisionRepo.save(decision);
  }

  async list(userId: number, meetingId: number) {
    await this.requireMeetingAccess(userId, meetingId);
    return this.decisionRepo.find({
      where: { meeting_id: meetingId },
      order: { created_at: 'ASC' },
    });
  }

  async update(userId: number, id: number, dto: UpdateDecisionDto) {
    const decision = await this.requireDecision(userId, id);
    if (dto.content !== undefined) decision.content = dto.content;
    if (dto.confirmed !== undefined) decision.confirmed = dto.confirmed;
    return this.decisionRepo.save(decision);
  }

  async remove(userId: number, id: number) {
    const decision = await this.requireDecision(userId, id);
    await this.decisionRepo.remove(decision);
    return { deleted: true };
  }

  private async requireDecision(userId: number, id: number) {
    const decision = await this.decisionRepo.findOne({ where: { id } });
    if (!decision) throw new NotFoundException('결정사항을 찾을 수 없습니다.');
    await this.requireMeetingAccess(userId, decision.meeting_id);
    return decision;
  }

  private async requireMeetingAccess(userId: number, meetingId: number) {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('회의를 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, meeting.team_id);
    return meeting;
  }
}
