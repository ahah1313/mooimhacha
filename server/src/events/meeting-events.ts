import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface MeetingT0Event {
  meeting_id: number;
  t0_timestamp: Date | null;
  status: string;
}

export interface MeetingEndedEvent {
  meeting_id: number;
  team_id: number;
}

// 도메인 서비스(MeetingsService)와 WebSocket 게이트웨이(RealtimeGateway)를
// 순환 의존 없이 연결하는 경량 인프로세스 이벤트 버스.
// 예: 회의 start()가 T0를 발행하면 게이트웨이가 룸 전체에 broadcast.
@Injectable()
export class MeetingEvents extends EventEmitter {
  emitT0(payload: MeetingT0Event) {
    this.emit('meeting:t0', payload);
  }

  onT0(handler: (payload: MeetingT0Event) => void) {
    this.on('meeting:t0', handler);
  }

  emitEnded(payload: MeetingEndedEvent) {
    this.emit('meeting:ended', payload);
  }

  onEnded(handler: (payload: MeetingEndedEvent) => void) {
    this.on('meeting:ended', handler);
  }
}
