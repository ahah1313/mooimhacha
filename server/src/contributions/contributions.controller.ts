import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { ContributionsService } from './contributions.service';

@ApiTags('기여도')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ContributionsController {
  constructor(private contributionsService: ContributionsService) {}

  @Get('meetings/:id/contributions')
  @ApiOperation({
    summary: '① 회의 기여도 — 참여자별 meeting_score (저장값)',
  })
  meeting(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contributionsService.getMeetingContributions(req.user.id, id);
  }

  @Get('teams/:id/contributions')
  @ApiOperation({
    summary: '②③④ 회의 종합·테스크·종합 기여도 (조회 시점 동적 계산)',
  })
  team(@Request() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    return this.contributionsService.getTeamContributions(req.user.id, id);
  }
}
