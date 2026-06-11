import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { ProjectsService } from './projects.service';
import {
  CreateMilestoneDto,
  CreateProjectDto,
  UpdateMilestoneDto,
  UpdateProjectDto,
} from './dto/project.dto';

@ApiTags('프로젝트·마일스톤')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get('projects')
  @ApiOperation({ summary: '팀 프로젝트 목록 (team_id 필수)' })
  listProjects(
    @Request() req: { user: User },
    @Query('team_id', ParseIntPipe) teamId: number,
  ) {
    return this.projectsService.listProjects(req.user.id, teamId);
  }

  @Post('projects')
  @ApiOperation({ summary: '프로젝트 생성' })
  createProject(@Request() req: { user: User }, @Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(req.user.id, dto);
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: '프로젝트 수정' })
  updateProject(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(req.user.id, id, dto);
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: '프로젝트 삭제' })
  removeProject(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projectsService.removeProject(req.user.id, id);
  }

  @Get('projects/:id/milestones')
  @ApiOperation({ summary: '마일스톤 목록 (진척도 동적 계산)' })
  listMilestones(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projectsService.listMilestones(req.user.id, id);
  }

  @Post('projects/:id/milestones')
  @ApiOperation({ summary: '마일스톤 추가' })
  createMilestone(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.projectsService.createMilestone(req.user.id, id, dto);
  }

  @Patch('milestones/:id')
  @ApiOperation({ summary: '마일스톤 수정' })
  updateMilestone(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.projectsService.updateMilestone(req.user.id, id, dto);
  }

  @Delete('milestones/:id')
  @ApiOperation({ summary: '마일스톤 삭제' })
  removeMilestone(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projectsService.removeMilestone(req.user.id, id);
  }
}
