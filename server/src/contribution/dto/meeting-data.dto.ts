import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ActionItemDto } from './action-item.dto';

export class MeetingDataDto {
  @IsString()
  name!: string;

  @IsString()
  meeting_id!: string;

  @IsNumber()
  meeting_total_sec!: number;

  @IsNumber()
  actual_attend_sec!: number;

  @IsNumber()
  @IsOptional()
  late_sec?: number;

  @IsNumber()
  @IsOptional()
  own_chars?: number;

  @IsNumber()
  @IsOptional()
  utterance_count?: number;

  @IsNumber()
  @IsOptional()
  total_chars_during?: number;

  @IsNumber()
  @IsOptional()
  team_size?: number;

  @IsNumber()
  @IsOptional()
  audio_loss_pct?: number;

  @IsNumber()
  @IsOptional()
  speech_confidence?: number;

  @IsBoolean()
  @IsOptional()
  excused_absence?: boolean;

  @IsBoolean()
  @IsOptional()
  absent?: boolean;

  @IsBoolean()
  @IsOptional()
  is_official?: boolean;

  @IsBoolean()
  @IsOptional()
  is_leader?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionItemDto)
  @IsOptional()
  actions?: ActionItemDto[];
}
