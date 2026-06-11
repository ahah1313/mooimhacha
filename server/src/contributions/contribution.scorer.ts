import { Injectable } from '@nestjs/common';
import {
  MeetingScoreRequest,
  MeetingScoreResponse,
  MeetingScoreResult,
  TeamContributionRequest,
  TeamContributionResponse,
  TeamContributionResult,
} from './contribution.types';

// 기여도 산정 공식(docs/06-기여도-산정.md)을 서버 내부에서 직접 계산하는 로컬 스코어러.
// CONTRIBUTION_SERVICE_URL(외부 산정 서버)이 설정되지 않은 환경에서 ContributionsService 가
// 이 클래스를 폴백으로 사용한다. 외부 클라이언트(ContributionClient)와 동일한 요청/응답 계약을
// 따르므로, 외부 서버를 붙이면 그대로 교체된다.
//
// 측정 불가 항목은 0점이 아니라 분모에서 제외(정규화)한다(06 §측정 불가 항목 정규화).
@Injectable()
export class LocalContributionScorer {
  private readonly DAY_MS = 24 * 60 * 60 * 1000;

  // === 트랙1 (① 회의 기여도) — 발언×0.6 + 참석×0.4, 측정가능 축만 정규화 ===
  computeMeetingScores(req: MeetingScoreRequest): MeetingScoreResponse {
    const s = req.team_settings;
    const maxChars = s.max_utterance_chars ?? 500;
    const participants = req.participant_user_ids;
    const N = participants.length;

    // 발언: 절단 후 합산한 전체/사용자별 글자수
    const truncate = (c: number) => Math.min(Math.max(c, 0), maxChars);
    const totalChars = req.utterances.reduce(
      (sum, u) => sum + truncate(u.char_count),
      0,
    );
    const ownChars = new Map<number, number>();
    const spokenAgendas = new Map<number, Set<number>>();
    for (const u of req.utterances) {
      ownChars.set(
        u.user_id,
        (ownChars.get(u.user_id) ?? 0) + truncate(u.char_count),
      );
      if (u.agenda_id != null) {
        if (!spokenAgendas.has(u.user_id))
          spokenAgendas.set(u.user_id, new Set());
        spokenAgendas.get(u.user_id)!.add(u.agenda_id);
      }
    }

    // 진행된 안건 수 (pending 제외 = active/done)
    const progressedAgendaIds = new Set(
      req.agendas.filter((a) => a.status !== 'pending').map((a) => a.id),
    );
    const progressedCount = progressedAgendaIds.size;

    // 실제 진행시간(ms): ended_at − t0_timestamp, 없으면 total_minutes 환산
    const durationMs = this.meetingDurationMs(req.meeting);

    // 사용자별 발화 신뢰도 입력(이상 이벤트)
    const sttFail = this.countByUser(req.anomaly_events, 'stt_failure');
    const capLoss = this.countByUser(req.anomaly_events, 'capture_loss');
    const utterCount = new Map<number, number>();
    for (const u of req.utterances)
      utterCount.set(u.user_id, (utterCount.get(u.user_id) ?? 0) + 1);

    const scores: MeetingScoreResult[] = participants.map((uid) => {
      const excluded: string[] = [];

      // --- 발언 축 ---
      const own = ownChars.get(uid) ?? 0;
      const speechRatioRaw = totalChars > 0 ? own / totalChars : null; // 바 표시용(%)
      let speechShareScore: number | null = null; // 산정용(1/N 정규화)
      if (totalChars > 0 && N > 0) {
        speechShareScore = Math.min(1, (own / totalChars) * N);
      } else {
        excluded.push('speech_ratio');
      }
      let speechConsistency: number | null = null;
      if (progressedCount > 0) {
        const mine = spokenAgendas.get(uid);
        const spokenProgressed = mine
          ? [...mine].filter((id) => progressedAgendaIds.has(id)).length
          : 0;
        speechConsistency = spokenProgressed / progressedCount;
      } else {
        excluded.push('speech_consistency');
      }
      const speechAxis = this.avg([speechShareScore, speechConsistency]);

      // --- 참석 축 ---
      const att = this.attendance(req.presence_events, uid, durationMs, s);
      if (att.attendanceRatio == null) excluded.push('attendance_ratio');
      if (att.punctualityScore == null) excluded.push('punctuality_score');
      const attendanceAxis = this.avg([
        att.attendanceRatio,
        att.punctualityScore,
      ]);

      // --- ① 종합(측정가능 축 가중 정규화: 발언0.6 / 참석0.4) ---
      const meetingScore = this.weightedMeasurable([
        { value: speechAxis, weight: 0.6 },
        { value: attendanceAxis, weight: 0.4 },
      ]);

      return {
        user_id: uid,
        speech_ratio: speechRatioRaw,
        speech_consistency: speechConsistency,
        attendance_ratio: att.attendanceRatio,
        punctuality_score: att.punctualityScore,
        meeting_score: meetingScore,
        confidence_level: this.confidenceLevel(
          utterCount.get(uid) ?? 0,
          sttFail.get(uid) ?? 0,
          capLoss.get(uid) ?? 0,
        ),
        excluded_indicators: excluded.length ? excluded : null,
      };
    });

    return { scores };
  }

  // === 트랙2·종합 (②③④) — 저장된 ① 누적 + action_items 라이브 계산 ===
  computeTeamContributions(
    req: TeamContributionRequest,
    now: Date = new Date(),
  ): TeamContributionResponse {
    const s = req.team_settings;
    const w = s.final_task_weight ?? 0.5;
    const leaderMult = Math.min(1, s.leader_bonus_multiplier ?? 1);
    const minMinutes = s.min_meeting_minutes ?? 5;

    const members: TeamContributionResult[] = req.members.map((m) => {
      const uid = m.user_id;

      // ② 회의 종합: regular·미무효·최소시간 이상·측정가능 회의만, 시간 가중 평균
      // (필터·가중 모두 실측 진행시간 actual_minutes 기준 — 예상시간 왜곡 방지)
      const rows = req.meeting_scores.filter(
        (r) =>
          r.user_id === uid &&
          r.meeting_type === 'regular' &&
          !r.is_invalidated &&
          r.actual_minutes >= minMinutes &&
          r.meeting_score != null,
      );
      let meetingAggregate: number | null = null;
      const totalMin = rows.reduce((a, r) => a + r.actual_minutes, 0);
      if (totalMin > 0) {
        meetingAggregate =
          rows.reduce(
            (a, r) => a + (r.meeting_score as number) * r.actual_minutes,
            0,
          ) / totalMin;
      }

      // ③ 테스크: 본인 확정 액션의 완료율·마감준수
      const taskScore = this.taskScore(req.action_items, uid, s, now);

      // ④ 종합: (③×w + ②×(1−w)) × 팀장배율, 1.0 캡. 측정가능 항목만 정규화.
      const composite = this.composite(
        taskScore,
        meetingAggregate,
        w,
        m.role === 'leader' ? leaderMult : 1,
      );

      return {
        user_id: uid,
        meeting_aggregate: meetingAggregate,
        task_score: taskScore,
        composite_score: composite,
      };
    });

    return { members };
  }

  // --- ③ 테스크 기여도 (완료율 + 마감준수)/2 ---
  private taskScore(
    actions: TeamContributionRequest['action_items'],
    userId: number,
    s: TeamContributionRequest['team_settings'],
    now: Date,
  ): number | null {
    const mine = actions.filter((a) => a.assignee_id === userId && a.confirmed);
    let sumDifficulty = 0;
    let sumComplete = 0; // Σ(done × difficulty)
    let sumDeadline = 0; // Σ(마감점수 × difficulty)
    for (const a of mine) {
      const diff = a.difficulty > 0 ? a.difficulty : 1;
      const due = a.due_date ? new Date(a.due_date) : null;
      const overdue = due ? now.getTime() > due.getTime() : false;

      if (a.status === 'done') {
        sumDifficulty += diff;
        sumComplete += diff; // done = 1 × difficulty
        sumDeadline +=
          this.deadlineScore(
            a.completed_at,
            a.due_date,
            s.deadline_penalty_curve,
          ) * diff;
      } else if (a.status === 'cancelled') {
        // 무단 취소 = 0 (분모 포함)
        sumDifficulty += diff;
      } else if (a.status === 'todo' || a.status === 'in_progress') {
        if (overdue) {
          // 기한 지난 미완료 = 0 (분모 포함)
          sumDifficulty += diff;
        }
        // 기한 전 미완료 = 평가 보류 → 분모 제외
      }
      // 그 외(deleted 등) = 분모 제외
    }
    if (sumDifficulty <= 0) return null; // 측정 불가
    const completionRatio = sumComplete / sumDifficulty;
    const deadlineAdherence = sumDeadline / sumDifficulty;
    return (completionRatio + deadlineAdherence) / 2;
  }

  // 마감점수 (일자별 공식 3종)
  private deadlineScore(
    completedAt: string | null,
    dueDate: string | null,
    curve: string,
  ): number {
    if (!dueDate) return 1; // 마감 없음 → 감점 없음
    if (!completedAt) return 0; // 완료 시각 없음(미완료) → 0
    const completed = new Date(completedAt).getTime();
    const due = new Date(dueDate).getTime();
    const overdueDays =
      completed <= due ? 0 : Math.ceil((completed - due) / this.DAY_MS);
    switch (curve) {
      case 'lenient':
        return Math.max(0, 1 - 0.1 * overdueDays);
      case 'strict':
        return overdueDays === 0 ? 1 : 0;
      case 'standard':
      default:
        return Math.max(0, 1 - 0.2 * overdueDays);
    }
  }

  // ④ 종합 — 측정가능(③/②)만 정규화 후 가중합 × 팀장배율, 1.0 캡
  private composite(
    task: number | null,
    meeting: number | null,
    w: number,
    leaderMult: number,
  ): number | null {
    const parts: { value: number; weight: number }[] = [];
    if (task != null) parts.push({ value: task, weight: w });
    if (meeting != null) parts.push({ value: meeting, weight: 1 - w });
    if (parts.length === 0) return null;
    const totalW = parts.reduce((a, p) => a + p.weight, 0);
    if (totalW <= 0) return null;
    const base = parts.reduce((a, p) => a + p.value * p.weight, 0) / totalW;
    return Math.min(1, base * leaderMult);
  }

  // --- 참석 축: attendance_ratio + punctuality_score ---
  private attendance(
    events: MeetingScoreRequest['presence_events'],
    userId: number,
    durationMs: number,
    s: MeetingScoreRequest['team_settings'],
  ): { attendanceRatio: number | null; punctualityScore: number | null } {
    const mine = events
      .filter((e) => e.user_id === userId)
      .sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms);

    const firstJoin = mine.find(
      (e) => e.event_type === 'join' || e.event_type === 'reconnect',
    );
    if (!firstJoin || durationMs <= 0) {
      // 무단결석(입장 기록 없음) 또는 진행시간 0 → 출석·정시 측정 불가
      return { attendanceRatio: null, punctualityScore: null };
    }

    // 정시 도착: 지각분 = max(0, 첫 입장 offset) (분)
    const lateMs = Math.max(0, firstJoin.timestamp_offset_ms);
    const totalMinutes = durationMs / 60000;
    const graceRatio = s.punctuality_grace_ratio ?? 0.1;
    const graceMinutes = totalMinutes * graceRatio;
    let punctualityScore: number;
    if (graceMinutes <= 0) {
      punctualityScore = lateMs <= 0 ? 1 : 0;
    } else {
      punctualityScore = Math.max(0, 1 - lateMs / 60000 / graceMinutes);
    }

    // 자리비움/끊김 누적 — 입장 이후 구간을 voluntary/involuntary 로 분류
    const graceMs = (s.presence_grace_seconds ?? 30) * 1000;
    let voluntaryAwayMs = 0;
    let involuntaryAwayMs = 0;
    let present = false;
    let lastTs = 0;
    let lastAwayKind: 'voluntary' | 'involuntary' | null = null;

    const clamp = (t: number) => Math.min(Math.max(t, 0), durationMs);
    for (const e of mine) {
      const ts = clamp(e.timestamp_offset_ms);
      if (e.event_type === 'join' || e.event_type === 'reconnect') {
        if (!present) {
          // 자리비움 구간 종료 (단, 첫 입장 전 구간=지각은 출석에서 제외)
          if (lastAwayKind) {
            const away = ts - lastTs;
            this.addAway(
              away,
              graceMs,
              lastAwayKind,
              (v) => (voluntaryAwayMs += v),
              (iv) => (involuntaryAwayMs += iv),
            );
          }
          present = true;
          lastTs = ts;
          lastAwayKind = null;
        }
      } else if (e.event_type === 'leave' || e.event_type === 'disconnect') {
        if (present) {
          present = false;
          lastTs = ts;
          lastAwayKind =
            e.event_type === 'leave'
              ? 'voluntary'
              : e.disconnect_classification === 'involuntary'
                ? 'involuntary'
                : 'voluntary';
        }
      }
    }
    // 종료 시점까지 자리비움이 이어진 경우
    if (!present && lastAwayKind) {
      const away = durationMs - lastTs;
      this.addAway(
        away,
        graceMs,
        lastAwayKind,
        (v) => (voluntaryAwayMs += v),
        (iv) => (involuntaryAwayMs += iv),
      );
    }

    // attendance_ratio = (진행시간 − 자발자리비움 − 비자발끊김) / (진행시간 − 비자발끊김)
    const denom = durationMs - involuntaryAwayMs;
    if (denom <= 0) return { attendanceRatio: null, punctualityScore };
    const numer = Math.max(0, denom - voluntaryAwayMs);
    const attendanceRatio = Math.min(1, numer / denom);
    return { attendanceRatio, punctualityScore };
  }

  private addAway(
    away: number,
    graceMs: number,
    kind: 'voluntary' | 'involuntary',
    addVol: (v: number) => void,
    addInv: (v: number) => void,
  ) {
    if (away <= 0) return;
    if (kind === 'involuntary') {
      addInv(away);
    } else if (away >= graceMs) {
      // grace 이상 이탈만 자발 자리비움으로 차감
      addVol(away);
    }
  }

  private meetingDurationMs(m: MeetingScoreRequest['meeting']): number {
    if (m.t0_timestamp && m.ended_at) {
      const d =
        new Date(m.ended_at).getTime() - new Date(m.t0_timestamp).getTime();
      if (d > 0) return d;
    }
    return Math.max(0, (m.total_minutes ?? 0) * 60000);
  }

  private confidenceLevel(
    utterCount: number,
    sttFail: number,
    capLoss: number,
  ): string {
    const sttDenom = utterCount + sttFail;
    const capDenom = utterCount + capLoss;
    const sttRatio = sttDenom > 0 ? sttFail / sttDenom : 0;
    const capRatio = capDenom > 0 ? capLoss / capDenom : 0;
    if (capRatio < 0.05 && sttRatio < 0.1) return 'high';
    if (capRatio <= 0.2 && sttRatio <= 0.2) return 'medium';
    return 'low';
  }

  private countByUser(
    events: { user_id: number; event_type: string }[],
    type: string,
  ): Map<number, number> {
    const m = new Map<number, number>();
    for (const e of events)
      if (e.event_type === type) m.set(e.user_id, (m.get(e.user_id) ?? 0) + 1);
    return m;
  }

  // 측정가능 지표들의 평균(모두 null이면 축 자체가 측정 불가 → null)
  private avg(values: (number | null)[]): number | null {
    const ok = values.filter((v): v is number => v != null);
    if (ok.length === 0) return null;
    return ok.reduce((a, v) => a + v, 0) / ok.length;
  }

  // 측정가능 축만 가중 정규화
  private weightedMeasurable(
    axes: { value: number | null; weight: number }[],
  ): number | null {
    const ok = axes.filter((a) => a.value != null);
    const totalW = ok.reduce((a, x) => a + x.weight, 0);
    if (totalW <= 0) return null;
    return ok.reduce((a, x) => a + (x.value as number) * x.weight, 0) / totalW;
  }
}
