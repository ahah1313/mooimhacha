import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { AgendasService } from './agendas.service';
import { CreateAgendaDto } from './dto/create-agenda.dto';
import { UpdateAgendaDto } from './dto/update-agenda.dto';

@ApiTags('아젠다')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AgendasController {
  constructor(private agendasService: AgendasService) {}

  @Get('meetings/:meetingId/agendas')
  @ApiOperation({ summary: '회의 안건 목록' })
  list(
    @Request() req: { user: User },
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.agendasService.listForMeeting(req.user.id, meetingId);
  }

  @Post('meetings/:meetingId/agendas')
  @ApiOperation({ summary: '안건 추가 (회의 중 즉석 추가 포함)' })
  create(
    @Request() req: { user: User },
    @Param('meetingId', ParseIntPipe) meetingId: number,
    @Body() dto: CreateAgendaDto,
  ) {
    return this.agendasService.create(req.user.id, meetingId, dto);
  }

  @Patch('agendas/:id')
  @ApiOperation({ summary: '안건 수정 (상태 변경 포함)' })
  update(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgendaDto,
  ) {
    return this.agendasService.update(req.user.id, id, dto);
  }

  @Delete('agendas/:id')
  @ApiOperation({ summary: '안건 삭제' })
  remove(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agendasService.remove(req.user.id, id);
  }

  // LLM 호출 라우트 — 비용 방어용 스로틀 (전역 ThrottlerGuard 기준)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('meetings/:meetingId/agendas/generate')
  @ApiOperation({ summary: '다음 회의 아젠다 LLM 생성 (직전 회의 결과 기반)' })
  generate(
    @Request() req: { user: User },
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.agendasService.generate(req.user.id, meetingId);
  }

  @Post('agendas/:id/activate')
  @ApiOperation({ summary: '안건 활성화 (진행 중으로 전환)' })
  activate(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agendasService.activate(req.user.id, id);
  }

  @Post('agendas/:id/summarize')
  @ApiOperation({ summary: '안건 LLM 요약 (완료 시)' })
  summarize(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agendasService.summarize(req.user.id, id);
  }
}
