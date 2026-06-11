import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Milestone } from '../entities/milestone.entity';
import { Agenda } from '../entities/agenda.entity';
import { TeamsService } from '../teams/teams.service';
import {
  CreateMilestoneDto,
  CreateProjectDto,
  UpdateMilestoneDto,
  UpdateProjectDto,
} from './dto/project.dto';

// 3계층 목표: 프로젝트 > 마일스톤 > 회의별 목표(agenda.milestone_id).
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Milestone)
    private milestoneRepo: Repository<Milestone>,
    @InjectRepository(Agenda)
    private agendaRepo: Repository<Agenda>,
    private teamsService: TeamsService,
  ) {}

  async listProjects(userId: number, teamId: number) {
    await this.teamsService.requireMembership(userId, teamId);
    return this.projectRepo.find({ where: { team_id: teamId } });
  }

  async createProject(userId: number, dto: CreateProjectDto) {
    await this.teamsService.requireMembership(userId, dto.team_id);
    return this.projectRepo.save(
      this.projectRepo.create({
        team_id: dto.team_id,
        title: dto.title,
        status: 'active',
      }),
    );
  }

  async updateProject(userId: number, id: number, dto: UpdateProjectDto) {
    const project = await this.requireProject(userId, id);
    if (dto.title !== undefined) project.title = dto.title;
    if (dto.status !== undefined) project.status = dto.status;
    return this.projectRepo.save(project);
  }

  async removeProject(userId: number, id: number) {
    const project = await this.requireProject(userId, id);
    // 고아 방지 — 하위 마일스톤 동반 삭제
    await this.milestoneRepo.delete({ project_id: id });
    await this.projectRepo.remove(project);
    return { deleted: true };
  }

  // 마일스톤 목록 + 진척도(연결 안건 완료율) 동적 계산
  async listMilestones(userId: number, projectId: number) {
    await this.requireProject(userId, projectId);
    const milestones = await this.milestoneRepo.find({
      where: { project_id: projectId },
      order: { order_index: 'ASC' },
    });
    return Promise.all(
      milestones.map(async (m) => ({
        ...m,
        progress_ratio: await this.computeProgress(m.id),
      })),
    );
  }

  async createMilestone(
    userId: number,
    projectId: number,
    dto: CreateMilestoneDto,
  ) {
    await this.requireProject(userId, projectId);
    return this.milestoneRepo.save(
      this.milestoneRepo.create({
        project_id: projectId,
        title: dto.title,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        order_index: dto.order_index ?? 0,
      }),
    );
  }

  async updateMilestone(userId: number, id: number, dto: UpdateMilestoneDto) {
    const milestone = await this.requireMilestone(userId, id);
    if (dto.title !== undefined) milestone.title = dto.title;
    if (dto.deadline !== undefined) milestone.deadline = new Date(dto.deadline);
    if (dto.order_index !== undefined) milestone.order_index = dto.order_index;
    return this.milestoneRepo.save(milestone);
  }

  async removeMilestone(userId: number, id: number) {
    const milestone = await this.requireMilestone(userId, id);
    await this.milestoneRepo.remove(milestone);
    return { deleted: true };
  }

  // 진척도 = 연결 안건 중 완료(done) 비율
  private async computeProgress(milestoneId: number): Promise<number> {
    const agendas = await this.agendaRepo.find({
      where: { milestone_id: milestoneId },
    });
    if (agendas.length === 0) return 0;
    const done = agendas.filter((a) => a.status === 'done').length;
    return done / agendas.length;
  }

  private async requireProject(userId: number, id: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    await this.teamsService.requireMembership(userId, project.team_id);
    return project;
  }

  private async requireMilestone(userId: number, id: number) {
    const milestone = await this.milestoneRepo.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('마일스톤을 찾을 수 없습니다.');
    await this.requireProject(userId, milestone.project_id);
    return milestone;
  }
}
