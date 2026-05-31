import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class KakaoLoginDto {
  @ApiProperty({ description: '카카오에서 받은 인가 코드' })
  @IsString()
  authorization_code: string;
}
