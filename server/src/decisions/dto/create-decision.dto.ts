import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import type { DecisionSource } from '../../entities/decision.entity';

export class CreateDecisionDto {
  @ApiProperty()
  @IsInt()
  meeting_id!: number;

  @ApiProperty({ description: '결정 내용 (한 줄)' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: '연결 안건 ID (입력 시점 진행 중 안건)' })
  @IsOptional()
  @IsInt()
  agenda_id?: number;

  @ApiPropertyOptional({ enum: ['manual', 'ai_extracted'] })
  @IsOptional()
  @IsIn(['manual', 'ai_extracted'])
  source?: DecisionSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  source_utterance_id?: number;
}
