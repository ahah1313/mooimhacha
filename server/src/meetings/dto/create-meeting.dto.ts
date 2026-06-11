import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { MeetingType } from '../../entities/meeting.entity';

export class CreateMeetingDto {
  @ApiProperty({ description: '팀 ID' })
  @IsInt()
  team_id!: number;

  @ApiProperty({ description: '회의 일시 (ISO8601)' })
  @IsISO8601()
  scheduled_at!: string;

  @ApiProperty({ description: '총 예상 시간(분)' })
  @IsInt()
  @Min(1)
  total_minutes!: number;

  @ApiPropertyOptional({ description: '주제 (선택)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiPropertyOptional({ enum: ['regular', 'partial', 'test'] })
  @IsOptional()
  @IsIn(['regular', 'partial', 'test'])
  meeting_type?: MeetingType;
}
