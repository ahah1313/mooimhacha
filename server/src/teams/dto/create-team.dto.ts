import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({ example: '클컴 4조' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '클라우드 컴퓨팅' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  course_name!: string;
}
