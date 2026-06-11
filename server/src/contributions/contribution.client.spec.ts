import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContributionClient } from './contribution.client';
import {
  ExternalMemberMeetingData,
  ExternalTeamSettings,
} from './contribution.mapper';
import {
  MeetingScoreRequest,
  TeamContributionRequest,
  TeamSettingsPayload,
} from './contribution.types';

// fetch mock 의 요청 본문(JSON.parse 결과) 타이핑용
type MeetingScoreBody = {
  data: ExternalMemberMeetingData;
  cfg: ExternalTeamSettings;
};

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

const MEETING_REQ: MeetingScoreRequest = {
  meeting: {
    id: 7,
    total_minutes: 60,
    t0_timestamp: '2026-06-01T00:00:00.000Z',
    ended_at: '2026-06-01T01:00:00.000Z',
    meeting_type: 'regular',
  },
  team_settings: SETTINGS,
  participant_user_ids: [1, 2],
  utterances: [
    { user_id: 1, char_count: 300, agenda_id: 10, confidence: 0.9 },
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
  anomaly_events: [],
};

const TEAM_REQ: TeamContributionRequest = {
  team_id: 1,
  team_settings: SETTINGS,
  members: [{ user_id: 1, role: 'leader' }],
  meeting_scores: [
    {
      user_id: 1,
      meeting_id: 7,
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
      due_date: '2026-06-01T00:00:00.000Z',
      completed_at: '2026-06-01T00:00:00.000Z',
      confirmed: true,
    },
  ],
};

function makeClient(url?: string): ContributionClient {
  const config = {
    get: (key: string) =>
      (
        ({ CONTRIBUTION_SERVICE_URL: url }) as Record<
          string,
          string | undefined
        >
      )[key],
  } as unknown as ConfigService;
  return new ContributionClient(config);
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

const extMeetingResponse = (name: string) => ({
  name,
  meeting_id: '7',
  meeting_total_sec: 3600,
  speech_score: 0.9,
  attend_score: 1.0,
  meeting_contribution: 0.94,
  reliability: 'High',
  low_attend_flag: false,
  weights_used: { speech: 0.6, attend: 0.4 },
  is_official: true,
  excused_absence: false,
  absent: false,
});

describe('ContributionClient — 외부 기여도 API 연동', () => {
  let fetchMock: jest.SpyInstance;

  afterEach(() => fetchMock?.mockRestore());

  it('URL 미설정 시 호출 없이 null 반환', async () => {
    fetchMock = jest.spyOn(global, 'fetch');
    const client = makeClient(undefined);
    expect(client.configured).toBe(false);
    expect(await client.computeMeetingScores(MEETING_REQ)).toBeNull();
    expect(await client.computeTeamContributions(TEAM_REQ)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('① 참여자별 /meeting/score 병렬 호출 후 우리 응답 형태로 조립', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as MeetingScoreBody;
        return Promise.resolve(
          jsonResponse(extMeetingResponse(body.data.name)),
        );
      });
    const client = makeClient('http://contrib.test');

    const res = await client.computeMeetingScores(MEETING_REQ);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://contrib.test/meeting/score',
      expect.objectContaining({ method: 'POST' }),
    );
    // 요청 본문: 파생 지표 + 0.6/0.4 가중치 설정
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(firstInit.body as string) as MeetingScoreBody;
    expect(firstBody.cfg.weight_speech_in_meeting).toBe(0.6);
    expect(firstBody.data.meeting_total_sec).toBe(3600);

    expect(res!.scores).toHaveLength(2);
    const u1 = res!.scores.find((s) => s.user_id === 1)!;
    expect(u1.meeting_score).toBe(0.94);
    expect(u1.attendance_ratio).toBe(1.0);
    expect(u1.confidence_level).toBe('high');
    expect(u1.speech_ratio).toBeCloseTo(0.75); // 300/400 원시 비율
  });

  it('②③④ 멤버별 cumulative→task→final 호출 후 조립 (weights_used 비면 null)', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        // 테스트에서 fetch 는 항상 문자열 URL 로 호출된다
        const url = input as string;
        if (url.endsWith('/cumulative/score')) {
          return Promise.resolve(
            jsonResponse({
              name: '1',
              score: 0.8,
              meeting_count: 1,
              included_count: 1,
              excluded_count: 0,
            }),
          );
        }
        if (url.endsWith('/task/score')) {
          return Promise.resolve(
            jsonResponse({
              name: '1',
              score: 1.0,
              total_actions: 1,
              completed_actions: 1,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            name: '1',
            meeting_score: 0.8,
            task_score: 1.0,
            final: 0.9,
            weights_used: { meeting: 0.5, task: 0.5 },
            leader_applied: false,
          }),
        );
      });
    const client = makeClient('http://contrib.test');

    const res = await client.computeTeamContributions(TEAM_REQ);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, finalInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const finalBody = JSON.parse(finalInit.body as string) as {
      is_leader: boolean;
    };
    expect(finalBody.is_leader).toBe(true);
    expect(res!.members).toEqual([
      {
        user_id: 1,
        meeting_aggregate: 0.8,
        task_score: 1.0,
        composite_score: 0.9,
      },
    ]);
  });

  it('②: included_count=0 → meeting_aggregate null, weights_used 빈 객체 → composite null', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        // 테스트에서 fetch 는 항상 문자열 URL 로 호출된다
        const url = input as string;
        if (url.endsWith('/cumulative/score')) {
          return Promise.resolve(
            jsonResponse({
              name: '1',
              score: 0,
              meeting_count: 0,
              included_count: 0,
              excluded_count: 0,
            }),
          );
        }
        if (url.endsWith('/task/score')) {
          return Promise.resolve(
            jsonResponse({
              name: '1',
              score: null,
              total_actions: 0,
              completed_actions: 0,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            name: '1',
            meeting_score: 0,
            task_score: null,
            final: 0,
            weights_used: {},
            leader_applied: false,
          }),
        );
      });
    const client = makeClient('http://contrib.test');

    const res = await client.computeTeamContributions(TEAM_REQ);

    expect(res!.members[0]).toEqual({
      user_id: 1,
      meeting_aggregate: null,
      task_score: null,
      composite_score: null,
    });
  });

  it('외부 서버 오류 응답 → ServiceUnavailableException', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 500 } as Response);
    const client = makeClient('http://contrib.test');

    await expect(client.computeMeetingScores(MEETING_REQ)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('네트워크 실패 → ServiceUnavailableException', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const client = makeClient('http://contrib.test');

    await expect(client.computeTeamContributions(TEAM_REQ)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
