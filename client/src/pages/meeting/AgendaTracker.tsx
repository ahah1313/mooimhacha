import { useState } from "react";
import type { Agenda } from "@/lib/types";

// 안건 추적 (★) — 상태 3단계(대기/진행 중/완료) + 시간 시각화.
// 예상 시간이 있으면 게이지: 70% 경고색 → 100% 초과(펄스 + 다음 안건 제안) → 150% 강한 신호.
// 예상 시간이 없으면(0 = 미설정) 경과 시간만 카운트업 — 목표 없는 게이지는 그리지 않는다.
interface Props {
  agendas: Agenda[];
  t0ms: number | null;
  now: number;
  summaries: Record<number, string>;
  onActivate: (id: number) => void;
  onDone: (id: number) => void;
  onAdd: (title: string) => void;
}

function stageClass(ratio: number): string {
  if (ratio >= 1.5) return "over-150";
  if (ratio >= 1) return "over-100";
  if (ratio >= 0.7) return "warn-70";
  return "";
}

function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function AgendaTracker({
  agendas,
  t0ms,
  now,
  summaries,
  onActivate,
  onDone,
  onAdd,
}: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [openSummary, setOpenSummary] = useState<number | null>(null);

  const submitNew = () => {
    const t = newTitle.trim();
    if (!t) return;
    onAdd(t);
    setNewTitle("");
  };

  return (
    <section className="cmp-section cmp-agenda">
      <header className="cmp-section__head">
        <h2>안건</h2>
      </header>
      <ul className="cmp-agenda-list">
        {agendas.map((a) => {
          const isActive = a.status === "active";
          let elapsedMs: number | null = null;
          let ratio = 0;
          if (isActive && t0ms !== null && a.started_at_offset_ms !== null) {
            elapsedMs = now - (t0ms + a.started_at_offset_ms);
            if (a.estimated_minutes > 0)
              ratio = elapsedMs / (a.estimated_minutes * 60000);
          }
          const hasGauge =
            isActive && elapsedMs !== null && a.estimated_minutes > 0;
          const summary = summaries[a.id] ?? a.summary;
          // 초과 시 '다음 안건으로' 제안 대상 — 목록 순서상 첫 대기 안건
          const nextPending = agendas.find(
            (p) => p.status === "pending" && Number(p.id) !== Number(a.id),
          );
          return (
            <li
              key={a.id}
              className={`cmp-agenda-item cmp-agenda-item--${a.status} ${
                isActive ? stageClass(ratio) : ""
              }`}
            >
              <div className="cmp-agenda-row">
                <span className={`cmp-dot cmp-dot--${a.status}`} />
                <span className="cmp-agenda-title">{a.title}</span>
                {isActive && elapsedMs !== null ? (
                  <span className="cmp-agenda-est">
                    {hasGauge
                      ? `${fmtMmSs(elapsedMs)} / ${a.estimated_minutes}분`
                      : fmtMmSs(elapsedMs)}
                  </span>
                ) : (
                  a.estimated_minutes > 0 && (
                    <span className="cmp-agenda-est">
                      {a.estimated_minutes}분
                    </span>
                  )
                )}
                <div className="cmp-agenda-actions">
                  {a.status === "pending" && (
                    <button onClick={() => onActivate(a.id)} title="진행 시작">
                      ▶ 시작
                    </button>
                  )}
                  {a.status === "active" && (
                    <button onClick={() => onDone(a.id)} title="완료">
                      ✓ 완료
                    </button>
                  )}
                  {a.status === "done" && summary && (
                    <button
                      onClick={() =>
                        setOpenSummary(openSummary === a.id ? null : a.id)
                      }
                      title="요약 보기"
                    >
                      요약
                    </button>
                  )}
                </div>
              </div>
              {hasGauge && (
                <div className="cmp-agenda-gauge">
                  <i style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                </div>
              )}
              {isActive && ratio >= 1 && elapsedMs !== null && (
                <div className="cmp-agenda-overrun">
                  <span>
                    ⏰ +{fmtMmSs(elapsedMs - a.estimated_minutes * 60000)} 초과
                  </span>
                  {nextPending && (
                    <button
                      className="cmp-agenda-next"
                      onClick={() => onDone(a.id)}
                    >
                      다음 안건으로 →
                    </button>
                  )}
                </div>
              )}
              {openSummary === a.id && summary && (
                <div className="cmp-agenda-summary">{summary}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="cmp-agenda-add">
        <input
          value={newTitle}
          placeholder="즉석 안건 추가"
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitNew()}
        />
        <button onClick={submitNew}>+</button>
      </div>
    </section>
  );
}
