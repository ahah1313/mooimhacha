import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExtensionDto {
  @ApiProperty({ description: '희망 새 기한 (ISO datetime)' })
  @IsDateString()
  requested_due_date!: string;

  @ApiProperty({ example: '추가 자료 조사가 더 필요합니다.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
