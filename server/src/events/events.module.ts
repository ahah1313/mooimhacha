import { Global, Module } from '@nestjs/common';
import { MeetingEvents } from './meeting-events';
import { TaskEvents } from './task-events';

// 전역 이벤트 버스 — 어느 모듈에서나 주입 가능.
@Global()
@Module({
  providers: [MeetingEvents, TaskEvents],
  exports: [MeetingEvents, TaskEvents],
})
export class EventsModule {}
