import { MeetingAbsencesService } from './meeting-absences.service';

// isLateByPresence는 주입 의존성(this.*Repo 등)을 쓰지 않고 인자만 사용하므로
// null 의존성으로 인스턴스화해 경계 동작만 검증한다.
describe('MeetingAbsencesService.isLateByPresence', () => {
  const service = new MeetingAbsencesService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  const meeting = { t0_timestamp: new Date('2026-01-01T00:00:00Z') };
  const isLate = (offsetMs: number, thresholdMin: number): boolean =>
    (
      service as unknown as {
        isLateByPresence: (
          m: unknown,
          p: unknown,
          u: number,
          t: number,
        ) => boolean;
      }
    ).isLateByPresence(
      meeting,
      [{ user_id: 1, event_type: 'join', timestamp_offset_ms: offsetMs }],
      1,
      thresholdMin,
    );

  it('기준 5분: 정확히 5:00(300초) 입장은 출석(지각 아님)', () => {
    expect(isLate(300_000, 5)).toBe(false);
  });

  it('기준 5분: 5:01(301초) 입장은 지각', () => {
    expect(isLate(301_000, 5)).toBe(true);
  });

  it('기준 10분: 7:00 입장은 출석 — 설정값이 실제로 반영된다', () => {
    expect(isLate(420_000, 10)).toBe(false);
  });

  it('입장 기록이 없으면 지각이 아니다', () => {
    expect(
      (
        service as unknown as {
          isLateByPresence: (
            m: unknown,
            p: unknown,
            u: number,
            t: number,
          ) => boolean;
        }
      ).isLateByPresence(meeting, [], 1, 5),
    ).toBe(false);
  });
});
