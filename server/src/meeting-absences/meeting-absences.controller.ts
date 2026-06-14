import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { MeetingAbsencesService } from './meeting-absences.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';

@ApiTags('출결/사유결석')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MeetingAbsencesController {
  constructor(private absencesService: MeetingAbsencesService) {}

  @Get('teams/:id/attendance-summary')
  @ApiOperation({
    summary: '팀 회의 출결 요약 (목록용 — 내 출결 + 미처리 동의 수)',
  })
  teamSummary(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.absencesService.getTeamSummary(req.user.id, id);
  }

  @Get('meetings/:id/attendance')
  @ApiOperation({ summary: '회의 출결 현황 (출석/지각/결석 + 사유·동의)' })
  attendance(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.absencesService.getAttendance(req.user.id, id);
  }

  @Post('meetings/:id/absences')
  @ApiOperation({ summary: '결석 사유 입력 (본인, 종료된 회의)' })
  createAbsence(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAbsenceDto,
  ) {
    return this.absencesService.createAbsence(req.user.id, id, dto);
  }

  @Post('absences/:id/consent')
  @ApiOperation({ summary: '결석 사유 동의 (결석자 제외 팀원)' })
  consent(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.absencesService.consent(req.user.id, id);
  }

  @Delete('absences/:id/consent')
  @ApiOperation({ summary: '결석 사유 동의 취소' })
  cancelConsent(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.absencesService.cancelConsent(req.user.id, id);
  }
}
