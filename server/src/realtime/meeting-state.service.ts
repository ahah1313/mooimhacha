import { Injectable } from '@nestjs/common';

// 회의 중 실시간 기여도 바를 위한 인메모리 집계.
// 사용자별 누적 글자수를 메모리에 유지하고, 발언 비중(raw speech_ratio)을 즉시 계산한다.
// 발화 원본(utterances)은 별도로 RDS에 저장되므로 여기서는 표시용 캐시만 다룬다.
@Injectable()
export class MeetingStateService {
  // meetingId → (userId → 누적 char_count)
  private readonly charCounts = new Map<number, Map<number, number>>();
  // meetingId → contribution:update 디바운스 타이머
  private readonly debounceTimers = new Map<number, NodeJS.Timeout>();

  addChars(meetingId: number, userId: number, chars: number) {
    let perUser = this.charCounts.get(meetingId);
    if (!perUser) {
      perUser = new Map();
      this.charCounts.set(meetingId, perUser);
    }
    perUser.set(userId, (perUser.get(userId) ?? 0) + chars);
  }

  // 서버 재시작 후 DB(utterances 집계)에서 복원한 절대값 시딩.
  // (재수화 완료 여부는 게이트웨이의 rehydratedMeetings Set이 별도 추적한다)
  seed(meetingId: number, entries: { user_id: number; char_count: number }[]) {
    let perUser = this.charCounts.get(meetingId);
    if (!perUser) {
      perUser = new Map();
      this.charCounts.set(meetingId, perUser);
    }
    for (const e of entries) {
      perUser.set(e.user_id, e.char_count);
    }
  }

  ensureParticipant(meetingId: number, userId: number) {
    let perUser = this.charCounts.get(meetingId);
    if (!perUser) {
      perUser = new Map();
      this.charCounts.set(meetingId, perUser);
    }
    if (!perUser.has(userId)) perUser.set(userId, 0);
  }

  // 발언 비중(%) 스냅샷 — 기여도 바 표시용 (글자수 비율)
  snapshot(meetingId: number): {
    user_id: number;
    char_count: number;
    ratio: number;
  }[] {
    const perUser = this.charCounts.get(meetingId);
    if (!perUser) return [];
    const total = [...perUser.values()].reduce((a, b) => a + b, 0);
    return [...perUser.entries()].map(([user_id, char_count]) => ({
      user_id,
      char_count,
      ratio: total > 0 ? char_count / total : 0,
    }));
  }

  // 1초 트레일링 디바운스 — 콜백은 호출 측(게이트웨이)이 broadcast 수행
  scheduleBroadcast(meetingId: number, cb: () => void, delayMs = 1000) {
    if (this.debounceTimers.has(meetingId)) return;
    const timer = setTimeout(() => {
      this.debounceTimers.delete(meetingId);
      cb();
    }, delayMs);
    this.debounceTimers.set(meetingId, timer);
  }

  clear(meetingId: number) {
    this.charCounts.delete(meetingId);
    const t = this.debounceTimers.get(meetingId);
    if (t) clearTimeout(t);
    this.debounceTimers.delete(meetingId);
  }
}
