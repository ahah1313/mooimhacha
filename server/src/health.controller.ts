import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

// 공개 헬스체크 (인증 불필요) — docker healthcheck·외부 모니터링용.
// DB 까지 왕복 확인해 '살아있지만 응답 못하는' 상태(DB 단절 등)도 잡는다.
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<{ status: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException(
        '데이터베이스 연결을 확인할 수 없습니다.',
      );
    }
    return { status: 'ok' };
  }
}
