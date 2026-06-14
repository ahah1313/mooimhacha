import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../entities/user.entity';
import { TaskExtensionsService } from './task-extensions.service';
import { CreateExtensionDto } from './dto/create-extension.dto';

@ApiTags('태스크 기한 연장')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TaskExtensionsController {
  constructor(private extensionsService: TaskExtensionsService) {}

  @Post('action-items/:id/extension')
  @ApiOperation({ summary: '기한 연장 요청 (담당자, 기한 지난 태스크)' })
  request(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateExtensionDto,
  ) {
    return this.extensionsService.requestExtension(req.user.id, id, dto);
  }

  @Get('teams/:id/extensions')
  @ApiOperation({ summary: '팀 연장 요청 목록 (status로 필터)' })
  list(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
  ) {
    return this.extensionsService.list(req.user.id, id, status);
  }

  @Post('extensions/:id/approve')
  @ApiOperation({ summary: '연장 요청 수락 (팀장만)' })
  approve(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.extensionsService.approve(req.user.id, id);
  }

  @Post('extensions/:id/reject')
  @ApiOperation({ summary: '연장 요청 거절 (팀장만)' })
  reject(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.extensionsService.reject(req.user.id, id);
  }
}
