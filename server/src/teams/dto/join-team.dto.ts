import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinTeamDto {
  @ApiProperty({ example: 'A1B2C3D4' })
  @IsString()
  @Length(8, 8)
  invite_code!: string;
}
