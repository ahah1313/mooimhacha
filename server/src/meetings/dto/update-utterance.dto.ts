import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// 발화 정정 — 오인식 STT 텍스트 교정용 (2000자 초과는 서버가 400으로 거부)
export class UpdateUtteranceDto {
  @ApiProperty({ description: '정정할 발화 텍스트' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}
