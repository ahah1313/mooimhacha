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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { UpdateUtteranceDto } from './dto/update-utterance.dto';
import { BatchUpdateUtterancesDto } from './dto/batch-update-utterances.dto';

@ApiTags('회의')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Get()
  @ApiOperation({ summary: '회의 목록 (team_id로 필터 가능)' })
  list(@Request() req: { user: User }, @Query('team_id') teamId?: string) {
    return this.meetingsService.list(
      req.user.id,
      teamId ? Number(teamId) : undefined,
    );
  }

  @Post()
  @ApiOperation({ summary: '회의 생성' })
  create(@Request() req: { user: User }, @Body() dto: CreateMeetingDto) {
    return this.meetingsService.create(req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '회의 상세' })
  get(@Request() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    return this.meetingsService.get(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '회의 수정' })
  update(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '회의 삭제 (팀장)' })
  remove(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.remove(req.user.id, id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: '회의 시작 — T0 발행' })
  start(@Request() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    return this.meetingsService.start(req.user.id, id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: '회의 종료 — 그루핑 + 기여도 산정 트리거' })
  end(@Request() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    return this.meetingsService.end(req.user.id, id);
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: '회의록 (안건별 그루핑)' })
  transcript(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.getTranscript(req.user.id, id);
  }

  // LLM 호출 라우트 — 비용 방어용 스로틀 (전역 ThrottlerGuard 기준)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post(':id/summarize')
  @ApiOperation({ summary: 'AI 회의 종합 정리 (요약·누락 결정·태스크)' })
  summarize(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.summarize(req.user.id, id);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: '회의 산출물 확정 (팀장)' })
  confirm(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.confirm(req.user.id, id);
  }

  @Post(':id/attend')
  @ApiOperation({ summary: '회의 참가 기록 (active 회의)' })
  attend(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.attend(req.user.id, id);
  }

  @Get(':id/joined-count')
  @ApiOperation({ summary: '회의 참가 인원 수' })
  joinedCount(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.getJoinedCount(req.user.id, id);
  }

  @Post(':id/contributions/recompute')
  @ApiOperation({ summary: '기여도 재산정 (종료된 회의 — 산정 실패 복구용)' })
  recomputeContributions(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.meetingsService.recomputeContributions(req.user.id, id);
  }

  // ⚠ 'utterances/:utteranceId' PATCH보다 먼저 선언해야 'batch'가 :utteranceId로 매칭되지 않는다
  @Patch(':id/utterances/batch')
  @ApiOperation({ summary: '병합 그룹 발화 일괄 정정 (트랜잭션 + 재산정 1회)' })
  batchUpdateUtterances(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BatchUpdateUtterancesDto,
  ) {
    return this.meetingsService.batchUpdateUtterances(req.user.id, id, dto);
  }

  @Patch(':id/utterances/:utteranceId')
  @ApiOperation({ summary: '발화 정정 (본인 발화, 종료된 회의만)' })
  updateUtterance(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Param('utteranceId', ParseIntPipe) utteranceId: number,
    @Body() dto: UpdateUtteranceDto,
  ) {
    return this.meetingsService.updateUtterance(
      req.user.id,
      id,
      utteranceId,
      dto,
    );
  }

  @Delete(':id/utterances/:utteranceId')
  @ApiOperation({ summary: '발화 삭제 (본인 발화, 종료된 회의만)' })
  removeUtterance(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Param('utteranceId', ParseIntPipe) utteranceId: number,
  ) {
    return this.meetingsService.removeUtterance(req.user.id, id, utteranceId);
  }
}
