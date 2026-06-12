import { IsArray, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MeetingDataDto } from './meeting-data.dto';

export class CalculateContributionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeetingDataDto)
  meetings!: MeetingDataDto[];

  @IsBoolean()
  @IsOptional()
  is_leader?: boolean;
}
