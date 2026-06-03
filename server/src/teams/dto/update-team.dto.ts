import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: '클컴 4조 (수정)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '클라우드 컴퓨팅' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  course_name?: string;
}
