import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class ActionItemDto {
  @IsBoolean()
  completed!: boolean;

  @IsNumber()
  @IsOptional()
  days_late?: number | null;

  @IsNumber()
  @IsOptional()
  difficulty?: number;

  @IsString()
  @IsOptional()
  assigned_at?: string | null;
}
