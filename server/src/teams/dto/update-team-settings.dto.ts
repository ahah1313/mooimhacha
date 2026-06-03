import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTeamSettingsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 0.3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.3)
  punctuality_grace_ratio?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_utterance_chars?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  presence_grace_seconds?: number;

  @ApiPropertyOptional({ enum: ['exclude', 'zero', 'attendance_only'] })
  @IsOptional()
  @IsEnum(['exclude', 'zero', 'attendance_only'])
  absent_meeting_handling?: 'exclude' | 'zero' | 'attendance_only';

  @ApiPropertyOptional({ enum: ['standard', 'lenient', 'strict'] })
  @IsOptional()
  @IsEnum(['standard', 'lenient', 'strict'])
  deadline_penalty_curve?: 'standard' | 'lenient' | 'strict';

  @ApiPropertyOptional({ enum: ['team', 'self', 'leader'] })
  @IsOptional()
  @IsEnum(['team', 'self', 'leader'])
  contribution_visibility?: 'team' | 'self' | 'leader';

  @ApiPropertyOptional({ minimum: 1, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  min_meeting_minutes?: number;

  @ApiPropertyOptional({ maximum: 1.0 })
  @IsOptional()
  @IsNumber()
  @Max(1.0)
  leader_bonus_multiplier?: number;
}
