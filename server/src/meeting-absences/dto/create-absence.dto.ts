import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAbsenceDto {
  @ApiProperty({ example: '가족 행사로 참석하지 못했습니다.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
