import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { ReportsService } from './reports.service';

@ApiTags('리포트')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('meetings/:id/report')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: '교수 제출용 회의 리포트 (인쇄용 HTML)' })
  report(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.reportsService.buildHtml(req.user.id, id);
  }
}
