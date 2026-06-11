import {
  Controller,
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
import { NotificationsService } from './notifications.service';

@ApiTags('알림')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '내 알림 목록 (unread=true로 미읽음만)' })
  list(@Request() req: { user: User }, @Query('unread') unread?: string) {
    return this.notificationsService.listForUser(
      req.user.id,
      unread === 'true',
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '알림 읽음 처리' })
  markRead(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(req.user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: '전체 읽음 처리' })
  markAllRead(@Request() req: { user: User }) {
    return this.notificationsService.markAllRead(req.user.id);
  }
}
