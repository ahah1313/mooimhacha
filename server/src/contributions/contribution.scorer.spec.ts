import { LocalContributionScorer } from './contribution.scorer';
import {
  MeetingScoreRequest,
  TeamContributionRequest,
  TeamSettingsPayload,
} from './contribution.types';

const SETTINGS: TeamSettingsPayload = {
  punctuality_grace_ratio: 0.1,
  presence_grace_seconds: 30,
  max_utterance_chars: 500,
  deadline_penalty_curve: 'standard',
  absent_meeting_handling: 'exclude',
  min_meeting_minutes: 5,
  final_task_weight: 0.5,
  leader_bonus_multiplier: 1.0,
};

// t0=0, ended=60분 회의
const T0 = '2026-06-01T00:00:00.000Z';
const ENDED = '2026-06-01T01:00:00.000Z'; // 60분

function baseMeetingReq(
  partial: Partial<MeetingScoreRequest>,
): MeetingScoreRequest {
  return {
    meeting: {
      id: 1,
      total_minutes: 60,
      t0_timestamp: T0,
      ended_at: ENDED,
      meeting_type: 'regular',
    },
    team_settings: SETTINGS,
    participant_user_ids: [1, 2],
    utterances: [],
    agendas: [],
    presence_events: [],
    anomaly_events: [],
    ...partial,
  };
}

describe('LocalContributionScorer — ① 회의 기여도', () => {
  const scorer = new LocalContributionScorer();

  it('두 명이 균등 발언·완전 참석·정시 → 발언비중 0.5씩, meeting_score 만점', () => {
    const req = baseMeetingReq({
      utterances: [
        { user_id: 1, char_count: 100, agenda_id: 10, confidence: 0.9 },
        { user_id: 2, char_count: 100, agenda_id: 10, confidence: 0.9 },
      ],
      agendas: [{ id: 10, status: 'done' }],
      presence_events: [
        {
          user_id: 1,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
        {
          user_id: 2,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
      ],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    expect(u1.speech_ratio).toBeCloseTo(0.5, 5);
    // 발언비중 점수 = min(1, 0.5 × 2) = 1.0, speech_consistency = 1/1 = 1 → 발언축 1.0
    // 참석 1.0, 정시 1.0 → 참석축 1.0 → meeting_score 1.0
    expect(u1.meeting_score).toBeCloseTo(1.0, 5);
    expect(u1.attendance_ratio).toBeCloseTo(1.0, 5);
    expect(u1.punctuality_score).toBeCloseTo(1.0, 5);
    expect(u1.excluded_indicators).toBeNull();
  });

  it('무발언 참석자도 N에 포함 — 말한 사람 만점선이 낮아짐', () => {
    // 3명 참석, 1명만 발언. N=3, 발언자 비중 1.0 → ×3 = 3 → min 1.0(만점)
    const req = baseMeetingReq({
      participant_user_ids: [1, 2, 3],
      utterances: [
        { user_id: 1, char_count: 300, agenda_id: 10, confidence: 0.9 },
      ],
      agendas: [{ id: 10, status: 'done' }],
      presence_events: [
        {
          user_id: 1,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
        {
          user_id: 2,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
        {
          user_id: 3,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
      ],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    const u2 = scores.find((s) => s.user_id === 2)!;
    expect(u1.speech_ratio).toBeCloseTo(1.0, 5); // 혼자 발언
    // u2: 발언 0 → 발언비중 점수 0, speech_consistency 0 → 발언축 0; 참석 1·정시 1 → 참석축 1
    // meeting_score = (0×0.6 + 1×0.4)/(1.0) = 0.4
    expect(u2.meeting_score).toBeCloseTo(0.4, 5);
  });

  it('지각(6분, grace 6분 초과 직전)·자발 자리비움 grace 미만은 무시', () => {
    // 60분 회의, grace_ratio 0.1 → 허용 지각 6분. 6분 지각이면 정시점수 0.
    const req = baseMeetingReq({
      participant_user_ids: [1],
      utterances: [
        { user_id: 1, char_count: 100, agenda_id: 10, confidence: 0.9 },
      ],
      agendas: [{ id: 10, status: 'done' }],
      presence_events: [
        {
          user_id: 1,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 6 * 60000,
        },
      ],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    expect(u1.punctuality_score).toBeCloseTo(0, 5); // 6분 지각 = 허용분과 동일 → 1-1=0
  });

  it('비자발 끊김은 출석 분모·분자에서 제외(불이익 없음)', () => {
    // 30분 시점 비자발 disconnect, 회의 끝까지 미복귀 → involuntary 30분
    // denom = 60 - 30 = 30, numer = 30 - 0 = 30 → attendance 1.0
    const req = baseMeetingReq({
      participant_user_ids: [1],
      presence_events: [
        {
          user_id: 1,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
        {
          user_id: 1,
          event_type: 'disconnect',
          disconnect_classification: 'involuntary',
          timestamp_offset_ms: 30 * 60000,
        },
      ],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    expect(u1.attendance_ratio).toBeCloseTo(1.0, 5);
  });

  it('자발 자리비움(grace 이상)은 출석 차감', () => {
    // 30분 시점 자발 leave, 끝까지 미복귀 → voluntary 30분(>30s)
    // denom = 60, numer = 60 - 30 = 30 → attendance 0.5
    const req = baseMeetingReq({
      participant_user_ids: [1],
      presence_events: [
        {
          user_id: 1,
          event_type: 'join',
          disconnect_classification: null,
          timestamp_offset_ms: 0,
        },
        {
          user_id: 1,
          event_type: 'leave',
          disconnect_classification: null,
          timestamp_offset_ms: 30 * 60000,
        },
      ],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    expect(u1.attendance_ratio).toBeCloseTo(0.5, 5);
  });

  it('무단결석(입장 기록 없음) → 출석·정시 측정 불가, 발언 0이면 meeting_score null', () => {
    const req = baseMeetingReq({
      participant_user_ids: [1],
      utterances: [],
      agendas: [],
      presence_events: [],
    });
    const { scores } = scorer.computeMeetingScores(req);
    const u1 = scores.find((s) => s.user_id === 1)!;
    expect(u1.meeting_score).toBeNull();
    expect(u1.excluded_indicators).toEqual(
      expect.arrayContaining([
        'speech_ratio',
        'speech_consistency',
        'attendance_ratio',
        'punctuality_score',
      ]),
    );
  });
});

describe('LocalContributionScorer — ②③④ 팀 기여도', () => {
  const scorer = new LocalContributionScorer();
  const NOW = new Date('2026-06-10T00:00:00.000Z');

  function teamReq(
    partial: Partial<TeamContributionRequest>,
  ): TeamContributionRequest {
    return {
      team_id: 1,
      team_settings: SETTINGS,
      members: [{ user_id: 1, role: 'leader' }],
      meeting_scores: [],
      action_items: [],
      ...partial,
    };
  }

  it('② 회의 종합 = 실측 시간 가중 평균, partial·무효·짧은 회의 제외', () => {
    const req = teamReq({
      meeting_scores: [
        {
          user_id: 1,
          meeting_id: 1,
          meeting_score: 1.0,
          total_minutes: 60,
          actual_minutes: 60,
          meeting_type: 'regular',
          is_invalidated: false,
        },
        {
          user_id: 1,
          meeting_id: 2,
          meeting_score: 0.0,
          total_minutes: 120, // 예상 120분이어도 실측 20분으로 가중
          actual_minutes: 20,
          meeting_type: 'regular',
          is_invalidated: false,
        },
        {
          user_id: 1,
          meeting_id: 3,
          meeting_score: 0.0,
          total_minutes: 100,
          actual_minutes: 100,
          meeting_type: 'partial',
          is_invalidated: false,
        }, // 제외
        {
          user_id: 1,
          meeting_id: 4,
          meeting_score: 0.0,
          total_minutes: 120, // 예상 120분이지만 실측 3분 → 최소시간 필터 제외
          actual_minutes: 3,
          meeting_type: 'regular',
          is_invalidated: false,
        }, // 실측 <5분 제외
      ],
    });
    const { members } = scorer.computeTeamContributions(req, NOW);
    // 실측 기준 (1.0×60 + 0×20)/(60+20) = 0.75
    expect(members[0].meeting_aggregate).toBeCloseTo(0.75, 5);
  });

  it('③ 테스크: 확정 액션만, 난이도 가중 완료율·마감준수', () => {
    const req = teamReq({
      meeting_scores: [],
      action_items: [
        // done 난이도3, 정시 완료 → 완료1·마감1
        {
          assignee_id: 1,
          status: 'done',
          difficulty: 3,
          due_date: '2026-06-05T00:00:00.000Z',
          completed_at: '2026-06-04T00:00:00.000Z',
          confirmed: true,
        },
        // overdue 미완료 난이도1 → 완료0·마감0 (분모 포함)
        {
          assignee_id: 1,
          status: 'todo',
          difficulty: 1,
          due_date: '2026-06-01T00:00:00.000Z',
          completed_at: null,
          confirmed: true,
        },
        // 기한 전 미완료 → 보류(분모 제외)
        {
          assignee_id: 1,
          status: 'todo',
          difficulty: 2,
          due_date: '2026-06-20T00:00:00.000Z',
          completed_at: null,
          confirmed: true,
        },
        // 미확정 → 제외
        {
          assignee_id: 1,
          status: 'done',
          difficulty: 3,
          due_date: '2026-06-05T00:00:00.000Z',
          completed_at: '2026-06-04T00:00:00.000Z',
          confirmed: false,
        },
      ],
    });
    const { members } = scorer.computeTeamContributions(req, NOW);
    // Σdiff = 3+1 = 4; 완료율 = (3)/4 = 0.75; 마감준수 = (1×3 + 0×1)/4 = 0.75
    // ③ = (0.75 + 0.75)/2 = 0.75
    expect(members[0].task_score).toBeCloseTo(0.75, 5);
  });

  it('④ 종합 = ③×0.5 + ②×0.5, 측정가능만 정규화, 1.0 캡', () => {
    const req = teamReq({
      members: [{ user_id: 1, role: 'member' }],
      meeting_scores: [
        {
          user_id: 1,
          meeting_id: 1,
          meeting_score: 0.8,
          total_minutes: 60,
          actual_minutes: 60,
          meeting_type: 'regular',
          is_invalidated: false,
        },
      ],
      action_items: [
        {
          assignee_id: 1,
          status: 'done',
          difficulty: 2,
          due_date: '2026-06-05T00:00:00.000Z',
          completed_at: '2026-06-04T00:00:00.000Z',
          confirmed: true,
        },
      ],
    });
    const { members } = scorer.computeTeamContributions(req, NOW);
    // ② = 0.8, ③ = (1 + 1)/2 = 1.0 → ④ = 1.0×0.5 + 0.8×0.5 = 0.9
    expect(members[0].composite_score).toBeCloseTo(0.9, 5);
  });

  it('마감 곡선 standard: 2일 초과 → 0.6', () => {
    const req = teamReq({
      action_items: [
        {
          assignee_id: 1,
          status: 'done',
          difficulty: 1,
          due_date: '2026-06-01T00:00:00.000Z',
          completed_at: '2026-06-03T00:00:00.000Z',
          confirmed: true,
        },
      ],
    });
    const { members } = scorer.computeTeamContributions(req, NOW);
    // 완료율 1.0, 마감준수 = 1 - 0.2×2 = 0.6 → ③ = (1.0+0.6)/2 = 0.8
    expect(members[0].task_score).toBeCloseTo(0.8, 5);
  });
});
