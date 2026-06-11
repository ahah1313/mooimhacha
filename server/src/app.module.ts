import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { TeamsModule } from './teams/teams.module';
import { ContributionModule } from './contribution/contribution.module';
import { ContributionsModule } from './contributions/contributions.module';
import { MeetingsModule } from './meetings/meetings.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AgendasModule } from './agendas/agendas.module';
import { DecisionsModule } from './decisions/decisions.module';
import { ActionItemsModule } from './action-items/action-items.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { buildTypeOrmOptions } from './data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 전역 레이트리밋 — 분당 300회의 넉넉한 기본 한도로 비정상 트래픽만 차단.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot(),
    EventsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        // DB 옵션 단일 출처 — data-source.ts(마이그레이션 CLI)와 공유
        ...buildTypeOrmOptions((key) => config.get<string>(key)),
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    TeamsModule,
    ContributionModule,
    ContributionsModule,
    MeetingsModule,
    ReportsModule,
    RealtimeModule,
    AgendasModule,
    DecisionsModule,
    ActionItemsModule,
    NotificationsModule,
    ProjectsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
