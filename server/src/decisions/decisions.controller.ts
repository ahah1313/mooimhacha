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
import { DecisionsService } from './decisions.service';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { UpdateDecisionDto } from './dto/update-decision.dto';

@ApiTags('결정사항')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('decisions')
export class DecisionsController {
  constructor(private decisionsService: DecisionsService) {}

  @Get()
  @ApiOperation({ summary: '회의 결정사항 목록 (meeting_id 필수)' })
  list(
    @Request() req: { user: User },
    @Query('meeting_id', ParseIntPipe) meetingId: number,
  ) {
    return this.decisionsService.list(req.user.id, meetingId);
  }

  @Post()
  @ApiOperation({ summary: '결정사항 추가' })
  create(@Request() req: { user: User }, @Body() dto: CreateDecisionDto) {
    return this.decisionsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '결정사항 수정·확정' })
  update(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDecisionDto,
  ) {
    return this.decisionsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '결정사항 삭제' })
  remove(
    @Request() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.decisionsService.remove(req.user.id, id);
  }
}
