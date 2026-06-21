import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ActionStatus } from '../../entities/action-item.entity';

export class UpdateActionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '세부사항(선택 메모, null=비우기)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  assignee_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  due_date?: string;

  @ApiPropertyOptional({ enum: ['todo', 'in_progress', 'done', 'cancelled'] })
  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done', 'cancelled'])
  status?: ActionStatus;

  @ApiPropertyOptional({ description: '난이도 1~3' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  difficulty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_for_next_meeting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  link_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
