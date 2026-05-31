import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: '인하대학교' })
  @IsString()
  @MaxLength(100)
  university: string;

  @ApiProperty({ example: '컴퓨터공학과' })
  @IsString()
  @MaxLength(100)
  department: string;
}
