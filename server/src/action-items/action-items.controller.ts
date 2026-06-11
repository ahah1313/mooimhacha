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
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';

@ApiTags('액션 아이템')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('action-items')
export class ActionItemsController {
  constructor(private actionItemsService: ActionItemsService) {}

  @Get()
  @ApiOperation({ summary: '액션 목록 (team_id 필수, assignee_id 선택)' })
  list(
    @Request() req: { user: User },
    @Query('team_id', ParseIntPipe) teamId: number,
    @Query('assignee_id') assigneeId?: string,
  ) {
    return this.actionItemsService.list(
      req.user.id,
      teamId,
      assigneeId ? Number(assigneeId) : undefined,
    );
  }

  @Post()
  @ApiOperation({ summary: '액션 추가' })
  create(@Request() req: { user: User }, @Body() dto: CreateActionItemDto) {
    return this.actionItemsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '액션 수정 (상태·완료 처리)' })
  update(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActionItemDto,
  ) {
    return this.actionItemsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '액션 삭제' })
  remove(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.actionItemsService.remove(req.user.id, id);
  }
}
