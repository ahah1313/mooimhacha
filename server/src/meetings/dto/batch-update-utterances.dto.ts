import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

// 병합 그룹 발화 일괄 정정 — 그룹 전체 텍스트를 한 번에 받아 서버가 분배/삭제한다.
// text가 null 또는 빈 문자열(트림 후)이면 그룹 전체 삭제.
export class BatchUpdateUtterancesDto {
  @ApiProperty({
    description: '정정 대상 발화 id 목록 (병합 그룹의 시간순)',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  utterance_ids!: number[];

  @ApiProperty({
    description: '정정할 그룹 전체 텍스트 — null/빈 문자열이면 전체 삭제',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  text!: string | null;
}
