import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet, apiPost, API_BASE, getAccessToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import type {
  Meeting,
  Decision,
  ActionItem,
  MeetingContribution,
  TeamContribution,
} from "@/lib/types";
import "@/styles/live.css";

interface TranscriptSection {
  agenda_id: number;
  title: string;
  summary: string | null;
  groups: { user_id: number; text: string }[];
}

// 회의 후 검토·확정 + 기여도 대시보드.
// AI 종합 정리 → 검토·확정 → 교수 제출용 리포트, 그리고 ①②③④ 기여도.
export default function ContributionDashboard() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const id = Number(meetingId);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meetingScores, setMeetingScores] = useState<MeetingContribution[]>([]);
  const [teamScores, setTeamScores] = useState<TeamContribution[]>([]);
  const [computed, setComputed] = useState(true);
  const [sections, setSections] = useState<TranscriptSection[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const m = await apiGet<Meeting>(`/meetings/${id}`);
      setMeeting(m);
      const [mc, tc, tr, dec, act] = await Promise.all([
        apiGet<{ scores: MeetingContribution[] }>(
          `/meetings/${id}/contributions`,
        ),
        apiGet<{ members: TeamContribution[]; computed: boolean }>(
          `/teams/${m.team_id}/contributions`,
        ),
        apiGet<{ sections: TranscriptSection[] }>(`/meetings/${id}/transcript`),
        apiGet<Decision[]>(`/decisions?meeting_id=${id}`),
        apiGet<ActionItem[]>(`/action-items?team_id=${m.team_id}`),
      ]);
      setMeetingScores(mc.scores);
      setTeamScores(tc.members);
      setComputed(tc.computed);
      setSections(tr.sections);
      setDecisions(dec);
      setActions(act);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openReport = async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/api/meetings/${id}/report`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const html = await res.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
  };

  const pct = (v: number | null) =>
    v === null ? "—" : `${Math.round(v * 100)}%`;

  return (
    <div className="live">
      <div className="live-row" style={{ marginBottom: 16, gap: 8 }}>
        <button
          className="live-btn live-btn--ghost"
          onClick={() => navigate("/meetings")}
        >
          ← 회의 목록
        </button>
        <button
          className="live-btn live-btn--ghost"
          onClick={() => navigate("/home")}
        >
          내 그룹으로
        </button>
      </div>
      <h1>회의 정리 · 기여도</h1>
      <p className="live-sub">{meeting?.topic ?? "회의"}</p>

      {/* 액션 바 */}
      <div className="live-card">
        <div className="live-row">
          <button
            className="live-btn"
            disabled={busy !== null}
            onClick={() =>
              run("summarize", async () => {
                // 서버가 LLM 실패 시 200 + summarized:false 로 응답 — 무음 실패 방지
                const res = await apiPost<{
                  summarized: boolean;
                  reason?: string;
                }>(`/meetings/${id}/summarize`);
                if (!res.summarized) {
                  showToast(
                    res.reason === "llm_not_configured"
                      ? "이 서버에는 AI 요약이 설정되어 있지 않아요"
                      : "요약 생성에 실패했어요 — 다시 시도해 주세요",
                    "error",
                  );
                }
              })
            }
          >
            {busy === "summarize" ? "정리 중…" : "AI 종합 정리"}
          </button>
          <button
            className="live-btn live-btn--ghost"
            disabled={busy !== null}
            onClick={() =>
              run("confirm", async () => {
                const res = await apiPost<{ confirmed_actions: number }>(
                  `/meetings/${id}/confirm`,
                );
                showToast(
                  res.confirmed_actions > 0
                    ? `결정·액션을 확정했어요 — 액션 ${res.confirmed_actions}건 담당자에게 알림을 보냈어요`
                    : "결정·액션을 확정했어요",
                );
              })
            }
          >
            검토·확정
          </button>
          <button className="live-btn live-btn--ghost" onClick={openReport}>
            교수 제출용 리포트
          </button>
        </div>
        {meeting?.summary && (
          <p className="live-note" style={{ marginTop: 12 }}>
            <strong>AI 요약:</strong> {meeting.summary}
          </p>
        )}
      </div>

      {/* ① 회의 기여도 */}
      <div className="live-card">
        <h2>① 이번 회의 기여도</h2>
        <p className="live-note" style={{ marginTop: 0 }}>
          발언량과 참석을 합쳐 이번 회의 참여도를 0~100%로 보여줘요. 정답이 아니라
          참고용 추정치예요.
        </p>
        {loading ? (
          <p className="live-sub">불러오는 중…</p>
        ) : meetingScores.length === 0 ? (
          <>
            <p className="live-sub">
              {meeting?.status === "ended"
                ? "산정된 회의 점수가 없어요. 아래에서 다시 계산할 수 있어요."
                : "아직 산정된 회의 점수가 없어요. 회의를 종료하면 계산돼요."}
            </p>
            {meeting?.status === "ended" && (
              <button
                className="live-btn"
                disabled={busy !== null}
                onClick={() =>
                  run("recompute", () =>
                    apiPost(`/meetings/${id}/contributions/recompute`),
                  )
                }
              >
                {busy === "recompute" ? "계산 중…" : "기여도 다시 계산"}
              </button>
            )}
          </>
        ) : (
          <table className="live-table">
            <thead>
              <tr>
                <th>멤버</th>
                <th>발언 비중</th>
                <th>참석</th>
                <th>회의 점수</th>
                <th>신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {meetingScores.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.name}</td>
                  <td>{pct(s.speech_ratio)}</td>
                  <td>{pct(s.attendance_ratio)}</td>
                  <td>
                    <strong>{pct(s.meeting_score)}</strong>
                  </td>
                  <td>{s.confidence_level ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ②③④ 팀 종합 */}
      <div className="live-card">
        <h2>팀 누적 기여도</h2>
        <p className="live-note" style={{ marginTop: 0 }}>
          여러 회의와 태스크 완료를 합산한 누적 참여도예요.
        </p>
        {!computed && (
          <p className="live-note">
            기여도를 계산할 데이터가 아직 충분하지 않습니다.
          </p>
        )}
        <table className="live-table">
          <thead>
            <tr>
              <th>멤버</th>
              <th>② 회의 종합</th>
              <th>③ 태스크</th>
              <th>④ 종합</th>
            </tr>
          </thead>
          <tbody>
            {teamScores.map((s) => (
              <tr key={s.user_id}>
                <td>
                  {s.name}
                  {s.role === "leader" && " 👑"}
                </td>
                <td>{pct(s.meeting_aggregate)}</td>
                <td>{pct(s.task_score)}</td>
                <td>
                  <strong>{pct(s.composite_score)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 결정사항 */}
      <div className="live-card">
        <h2>결정사항</h2>
        {decisions.length === 0 ? (
          <p className="live-sub">결정사항이 없습니다.</p>
        ) : (
          <ul>
            {decisions.map((d) => (
              <li key={d.id} style={{ fontSize: 14, marginBottom: 4 }}>
                {d.content}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 액션 */}
      <div className="live-card">
        <h2>액션 아이템</h2>
        {actions.length === 0 ? (
          <p className="live-sub">액션이 없습니다.</p>
        ) : (
          <table className="live-table">
            <thead>
              <tr>
                <th>내용</th>
                <th>마감</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td>{a.description}</td>
                  <td>
                    {a.due_date
                      ? new Date(a.due_date).toLocaleDateString("ko-KR")
                      : "-"}
                  </td>
                  <td>{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 회의록 */}
      <div className="live-card">
        <h2>회의록</h2>
        {sections.length === 0 ? (
          <p className="live-sub">발화 기록이 없습니다.</p>
        ) : (
          sections.map((s) => (
            <div key={s.agenda_id} style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>{s.title}</h3>
              {s.summary && <p className="live-note">{s.summary}</p>}
              <ul>
                {s.groups.map((g, i) => (
                  <li key={i} style={{ fontSize: 13 }}>
                    {g.text}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {error && <p className="live-error">{error}</p>}
    </div>
  );
}
