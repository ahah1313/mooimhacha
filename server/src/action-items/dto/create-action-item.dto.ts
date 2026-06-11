import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import type {
  ActionSource,
  ActionStatus,
} from '../../entities/action-item.entity';

export class CreateActionItemDto {
  @ApiProperty({ description: '팀 ID (액션은 팀 스코프)' })
  @IsInt()
  team_id!: number;

  @ApiProperty({ description: '내용' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: '담당자 user_id' })
  @IsOptional()
  @IsInt()
  assignee_id?: number;

  @ApiPropertyOptional({ description: '마감일 (ISO8601)' })
  @IsOptional()
  @IsISO8601()
  due_date?: string;

  @ApiPropertyOptional({ description: '난이도 상/중/하 = 3/2/1 (기본 2)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  difficulty?: number;

  @ApiPropertyOptional({ description: '다음 회의 전까지' })
  @IsOptional()
  @IsBoolean()
  is_for_next_meeting?: boolean;

  @ApiPropertyOptional({ description: '입력 시점 진행 중 안건 ID' })
  @IsOptional()
  @IsInt()
  agenda_id?: number;

  @ApiPropertyOptional({ description: '자료 외부 링크' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  link_url?: string;

  @ApiPropertyOptional({ enum: ['manual', 'ai_extracted'] })
  @IsOptional()
  @IsIn(['manual', 'ai_extracted'])
  source?: ActionSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  source_utterance_id?: number;

  @ApiPropertyOptional({ enum: ['todo', 'in_progress', 'done', 'cancelled'] })
  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done', 'cancelled'])
  status?: ActionStatus;
}
