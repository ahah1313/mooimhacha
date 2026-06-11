import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// LLM 입력(컨텍스트) 절단 상한 — 발화 원문 등 무한 증가 입력을 막는다 (호출부 공용)
export const LLM_INPUT_CHAR_LIMIT = 8000;
// 환각 방어 — LLM이 추출한 결정/태스크 배열 길이 상한
const MAX_EXTRACTED_ITEMS = 20;
// JSON 응답이 중간에 잘려 파싱 실패하지 않도록 넉넉한 출력 상한
const MAX_OUTPUT_TOKENS = 2000;
// 429/5xx 일시 오류 재시도 백오프
const RETRY_BACKOFF_MS = 2000;

// GPT-4o-mini 호출 래퍼. 회의 중 안건 요약(안건당 1회) + 회의 후 종합 정리·다음 회의 안건 생성.
// OPENAI_API_KEY 미설정 시 호출을 건너뛰고 null 을 반환해 흐름이 끊기지 않게 한다.
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly model = 'gpt-4o-mini';

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY');
  }

  // 완료된 안건의 발화들을 한국어로 3~5문장 요약
  async summarizeAgenda(
    title: string,
    utterances: string[],
  ): Promise<string | null> {
    if (utterances.length === 0) return null;
    const prompt =
      `다음은 "${title}" 안건에서 오간 발언이다. 핵심 논의와 결론을 한국어로 3~5문장으로 요약해라.\n\n` +
      utterances.map((u, i) => `${i + 1}. ${u}`).join('\n');
    return this.chat(
      '너는 회의 안건 요약을 돕는 비서다. 군더더기 없이 핵심만 요약한다.',
      prompt,
    );
  }

  // 회의 종합 정리 — 회의 요약·누락된 결정·정리된 태스크 (각 항목 출처 utterance_id 포함)
  async summarizeMeeting(context: string): Promise<{
    summary: string;
    missed_decisions: { content: string; source_utterance_id: number | null }[];
    tasks: {
      description: string;
      assignee_hint: string | null;
      source_utterance_id: number | null;
    }[];
  } | null> {
    const prompt =
      '아래 회의 자료(안건별 요약·회의록·수동 입력된 결정·액션)를 바탕으로 회의를 종합 정리해라.\n' +
      '반드시 아래 JSON 형식만 출력한다.\n' +
      '{"summary": string, ' +
      '"missed_decisions": [{"content": string, "source_utterance_id": number|null}], ' +
      '"tasks": [{"description": string, "assignee_hint": string|null, "source_utterance_id": number|null}]}\n\n' +
      context;
    const raw = await this.chat(
      '너는 팀플 회의록을 정리하는 비서다. JSON 외 텍스트는 출력하지 않는다.',
      prompt,
    );
    if (!raw) return null;
    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('회의 종합 JSON 파싱 실패');
      return null;
    }
    const validated = this.validateMeetingSummary(parsed);
    if (!validated) {
      this.logger.warn('회의 종합 응답이 기대한 구조가 아니라 버립니다.');
    }
    return validated;
  }

  // LLM 응답 구조 검증 — 필드 존재·타입 불일치 시 null(기능 실패 처리),
  // 항목 단위 불량은 걸러내고 배열 길이는 환각 방어 상한으로 절단.
  private validateMeetingSummary(parsed: unknown): {
    summary: string;
    missed_decisions: { content: string; source_utterance_id: number | null }[];
    tasks: {
      description: string;
      assignee_hint: string | null;
      source_utterance_id: number | null;
    }[];
  } | null {
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.summary !== 'string') return null;
    if (!Array.isArray(obj.missed_decisions) || !Array.isArray(obj.tasks)) {
      return null;
    }
    const asRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null;
    const asId = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;

    const missed_decisions = obj.missed_decisions
      .filter(asRecord)
      .filter((d) => typeof d.content === 'string' && d.content.trim() !== '')
      .slice(0, MAX_EXTRACTED_ITEMS)
      .map((d) => ({
        content: d.content as string,
        source_utterance_id: asId(d.source_utterance_id),
      }));
    const tasks = obj.tasks
      .filter(asRecord)
      .filter(
        (t) => typeof t.description === 'string' && t.description.trim() !== '',
      )
      .slice(0, MAX_EXTRACTED_ITEMS)
      .map((t) => ({
        description: t.description as string,
        assignee_hint:
          typeof t.assignee_hint === 'string' ? t.assignee_hint : null,
        source_utterance_id: asId(t.source_utterance_id),
      }));
    return { summary: obj.summary, missed_decisions, tasks };
  }

  // 다음 회의 안건 목록 생성 (출력: JSON 문자열)
  async generateAgendas(context: string): Promise<string | null> {
    const prompt =
      '아래 이번 회의 결과를 바탕으로 다음 회의 안건을 제안해라. ' +
      '반드시 JSON 배열만 출력하고 각 항목은 {"title": string, "estimated_minutes": number, "source_label": string} 형식이다.\n\n' +
      context;
    return this.chat(
      '너는 팀플 회의 안건을 설계하는 비서다. JSON 외 텍스트는 출력하지 않는다.',
      prompt,
    );
  }

  private async chat(system: string, user: string): Promise<string | null> {
    if (!this.enabled) {
      this.logger.warn('OPENAI_API_KEY 미설정 — LLM 호출을 건너뜁니다.');
      return null;
    }
    // 429/5xx 일시 오류만 1회 재시도. 동기 HTTP 응답 안에서 도는 호출이라
    // 총 지연이 클라이언트 타임아웃을 넘지 않게 재시도는 1회·백오프 2초로 제한.
    const first = await this.chatOnce(system, user);
    if (!first.retryable) return first.content;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    const second = await this.chatOnce(system, user);
    return second.content;
  }

  private async chatOnce(
    system: string,
    user: string,
  ): Promise<{ content: string | null; retryable: boolean }> {
    // 무한 대기로 회의 종료/요약 흐름이 멈추지 않도록 20초 타임아웃
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.get<string>('OPENAI_API_KEY')}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.3,
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`OpenAI 응답 오류: ${res.status}`);
        return {
          content: null,
          retryable: res.status === 429 || res.status >= 500,
        };
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return {
        content: data.choices?.[0]?.message?.content ?? null,
        retryable: false,
      };
    } catch (e) {
      this.logger.error('OpenAI 호출 실패 또는 타임아웃', e as Error);
      return { content: null, retryable: false };
    } finally {
      clearTimeout(timeout);
    }
  }
}
