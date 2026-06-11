import { Global, Module } from '@nestjs/common';
import { MeetingEvents } from './meeting-events';

// 전역 이벤트 버스 — 어느 모듈에서나 MeetingEvents 주입 가능.
@Global()
@Module({
  providers: [MeetingEvents],
  exports: [MeetingEvents],
})
export class EventsModule {}
