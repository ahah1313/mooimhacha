import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MeetingScoreRequest,
  MeetingScoreResponse,
  TeamContributionRequest,
  TeamContributionResponse,
} from './contribution.types';
import {
  ExternalCumulativeScoreResponse,
  ExternalFinalScoreResponse,
  ExternalMeetingScoreResponse,
  ExternalTaskScoreResponse,
  deriveMemberData,
  mapMeetingResult,
  mapTeamSettings,
  toCumulativeItems,
  toTaskActions,
} from './contribution.mapper';

// 외부 기여도 산정 서버(cc-team-8/Contribution, FastAPI) HTTP 클라이언트.
// 외부 API 는 멤버 1명 단위 엔드포인트라 여기서 멤버별 fan-out 후 기존 응답 계약으로 조립한다.
// CONTRIBUTION_SERVICE_URL 미설정 시 호출을 건너뛰고 null 을 반환해
// (개발/데모 환경에서) 회의 종료·조회 흐름이 끊기지 않도록 한다.
@Injectable()
export class ContributionClient {
  private readonly logger = new Logger(ContributionClient.name);

  constructor(private config: ConfigService) {}

  private get baseUrl(): string | undefined {
    return this.config.get<string>('CONTRIBUTION_SERVICE_URL');
  }

  get configured(): boolean {
    return !!this.baseUrl;
  }

  // ① 회의 기여도 — 참여자별 /meeting/score 병렬 호출
  async computeMeetingScores(
    payload: MeetingScoreRequest,
  ): Promise<MeetingScoreResponse | null> {
    if (!this.baseUrl) {
      this.warnUnconfigured('/meeting/score');
      return null;
    }
    const cfg = mapTeamSettings(payload.team_settings);
    const scores = await Promise.all(
      payload.participant_user_ids.map(async (uid) => {
        const { data, rawSpeechRatio } = deriveMemberData(payload, uid);
        const ext = await this.post<ExternalMeetingScoreResponse>(
          '/meeting/score',
          { data, cfg },
        );
        return mapMeetingResult(uid, ext, rawSpeechRatio);
      }),
    );
    return { scores };
  }

  // ②③④ — 멤버별 cumulative → task → final 순차 호출 (멤버 간은 병렬)
  async computeTeamContributions(
    payload: TeamContributionRequest,
  ): Promise<TeamContributionResponse | null> {
    if (!this.baseUrl) {
      this.warnUnconfigured('/cumulative·/task·/final');
      return null;
    }
    const cfg = mapTeamSettings(payload.team_settings);
    const now = new Date();
    const members = await Promise.all(
      payload.members.map(async (m) => {
        const name = String(m.user_id);
        const cumulative = await this.post<ExternalCumulativeScoreResponse>(
          '/cumulative/score',
          { name, meeting_scores: toCumulativeItems(payload, m.user_id), cfg },
        );
        const task = await this.post<ExternalTaskScoreResponse>('/task/score', {
          name,
          actions: toTaskActions(payload.action_items, m.user_id, now),
          cfg,
        });
        const fin = await this.post<ExternalFinalScoreResponse>(
          '/final/score',
          {
            cumulative_name: name,
            cumulative_score: cumulative.score,
            cumulative_meeting_count: cumulative.meeting_count,
            cumulative_included_count: cumulative.included_count,
            cumulative_excluded_count: cumulative.excluded_count,
            task_name: name,
            task_score: task.score,
            task_total_actions: task.total_actions,
            task_completed_actions: task.completed_actions,
            is_leader: m.role === 'leader',
            cfg,
          },
        );
        return {
          user_id: m.user_id,
          // 포함 회의 0건이면 엔진은 0.0 을 주지만 "측정 불가"는 null 로 구분 (로컬 스코어러와 동일)
          meeting_aggregate:
            cumulative.included_count > 0 ? cumulative.score : null,
          task_score: task.score,
          // 측정 축이 하나도 없으면 weights_used 가 빈 객체 → 종합 점수 없음
          composite_score:
            Object.keys(fin.weights_used).length > 0 ? fin.final : null,
        };
      }),
    );
    return { members };
  }

  private warnUnconfigured(path: string) {
    this.logger.warn(
      `CONTRIBUTION_SERVICE_URL 미설정 — 기여도 산정(${path})을 건너뜁니다.`,
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const apiKey = this.config.get<string>('CONTRIBUTION_SERVICE_API_KEY');
    // 외부 서버 행에도 회의 종료·대시보드 조회가 멈추지 않게 20초 타임아웃
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`기여도 서버 응답 오류(${path}): ${res.status}`);
        throw new ServiceUnavailableException('기여도 산정 서버 오류');
      }
      return (await res.json()) as T;
    } catch (e) {
      // abort(타임아웃) 에러도 여기로 들어와 동일하게 503으로 변환된다
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`기여도 서버 호출 실패(${path})`, e as Error);
      throw new ServiceUnavailableException(
        '기여도 산정 서버에 연결할 수 없습니다.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
