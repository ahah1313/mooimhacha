import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import Card from "@/components/Card";
import { apiGet } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ActionItem, Meeting, TeamContribution } from "@/lib/types";
import type { TeamContext } from "../DashboardPage";

const BAR_COLORS = [
  "var(--green)",
  "var(--blue)",
  "var(--pink)",
  "var(--amber)",
];
const AV_CLS = ["a1", "a2", "a3", "a4"];

const pct = (v: number | null | undefined): number | null =>
  v == null ? null : Math.round(v * 100);

// SVG를 innerHTML로 직접 생성. 외부 차트 라이브러리 없이 의존성 최소화를 위한 선택.
// getComputedStyle로 CSS 변수를 읽어 다크모드 색상을 SVG에 반영.
// 3축(출석·참여도·태스크) 레이더. me/avg는 0~100 스케일.
function drawRadar(svgEl: SVGSVGElement, me: number[], avg: number[]) {
  const cx = 120,
    cy = 120,
    R = 88,
    axes = 3;
  const labels = ["출석", "참여도", "태스크"];
  const css = getComputedStyle(document.documentElement);
  const ang = (i: number) => (Math.PI * 2 * i) / axes - Math.PI / 2;
  const pt = (i: number, v: number): [number, number] => [
    cx + (Math.cos(ang(i)) * R * v) / 100,
    cy + (Math.sin(ang(i)) * R * v) / 100,
  ];
  let h = "";
  [25, 50, 75, 100].forEach((v) => {
    let p = "";
    for (let i = 0; i < axes; i++) {
      const [x, y] = pt(i, v);
      p += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    h += `<path d="${p}Z" fill="none" stroke="${css.getPropertyValue("--border")}" stroke-width="1"/>`;
  });
  for (let i = 0; i < axes; i++) {
    const [x, y] = pt(i, 100);
    h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${css.getPropertyValue("--border")}" stroke-width="1"/>`;
    const [lx, ly] = pt(i, 128);
    h += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${css.getPropertyValue("--text-mut")}">${labels[i]}</text>`;
  }
  const poly = (data: number[], stroke: string, fill: string) => {
    let p = "";
    for (let i = 0; i < axes; i++) {
      const [x, y] = pt(i, data[i] ?? 0);
      p += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return `<path d="${p}Z" fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round"/>`;
  };
  h += poly(avg, css.getPropertyValue("--text-soft"), "rgba(150,160,150,.16)");
  h += poly(me, css.getPropertyValue("--green"), "rgba(29,158,117,.2)");
  for (let i = 0; i < axes; i++) {
    const [x, y] = pt(i, me[i] ?? 0);
    h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${css.getPropertyValue("--green")}"/>`;
  }
  svgEl.innerHTML = h;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ReportPage() {
  const team = useOutletContext<TeamContext | null>();
  const me = useCurrentUser();
  const [members, setMembers] = useState<TeamContribution[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (!team) return;
    let alive = true;
    void Promise.allSettled([
      apiGet<{ members: TeamContribution[] }>(
        `/teams/${team.id}/contributions`,
      ),
      apiGet<Meeting[]>(`/meetings?team_id=${team.id}`),
      apiGet<ActionItem[]>(`/action-items?team_id=${team.id}`),
    ]).then(([cs, ms, ts]) => {
      if (!alive) return;
      if (cs.status === "fulfilled")
        setMembers(
          [...cs.value.members].sort(
            (a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1),
          ),
        );
      if (ms.status === "fulfilled") setMeetings(ms.value);
      if (ts.status === "fulfilled")
        setTasks(ts.value.filter((t) => t.status !== "cancelled"));
    });
    return () => {
      alive = false;
    };
  }, [team]);

  // 종합 달성률 = 측정된 종합 점수 평균
  const overall = useMemo(() => {
    const vals = members
      .map((m) => m.composite_score)
      .filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 100);
  }, [members]);

  // 레이더: 나 vs 팀 평균 (출석·참여도·태스크)
  const radar = useMemo(() => {
    if (members.length === 0) return null;
    const target =
      (me ? members.find((m) => m.user_id === me.id) : undefined) ?? members[0];
    const mine = [
      pct(target.attendance_avg) ?? 0,
      pct(target.speech_avg) ?? 0,
      pct(target.task_score) ?? 0,
    ];
    const avgOf = (sel: (m: TeamContribution) => number | null | undefined) => {
      const vs = members.map(sel).filter((v): v is number => v != null);
      return vs.length ? (vs.reduce((a, v) => a + v, 0) / vs.length) * 100 : 0;
    };
    const avg = [
      avgOf((m) => m.attendance_avg),
      avgOf((m) => m.speech_avg),
      avgOf((m) => m.task_score),
    ];
    return { mine, avg, name: target.name, isMe: me?.id === target.user_id };
  }, [members, me]);

  // 마운트 후 DOM 접근이 필요하므로 effect에서 호출
  useEffect(() => {
    const el = document.getElementById("radar") as SVGSVGElement | null;
    if (el && radar) drawRadar(el, radar.mine, radar.avg);
  }, [radar]);

  const ended = meetings.filter((m) => m.status === "ended");
  const period = meetings.length
    ? `${shortDate(
        [...meetings].sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() -
            new Date(b.scheduled_at).getTime(),
        )[0].scheduled_at,
      )} ~ ${shortDate(
        [...meetings].sort(
          (a, b) =>
            new Date(b.scheduled_at).getTime() -
            new Date(a.scheduled_at).getTime(),
        )[0].scheduled_at,
      )}`
    : "기간 없음";

  const sessions = [...meetings]
    .filter((m) => m.status !== "scheduled")
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  const now = new Date();
  const yearMonth = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="report-wrap">
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <button
          className="btn btn-primary btn-sm"
          onClick={() => window.print()}
          title="이 리포트 화면을 인쇄하거나 PDF로 저장해요"
        >
          <i className="ti ti-file-export" /> PDF 저장 (제출용)
        </button>
      </div>

      {/* 배너 */}
      <div className="report-banner">
        <div>
          <div className="rb-title">팀플 기여도 최종 리포트</div>
          <div className="rb-sub">
            {team?.name ?? "팀"}
            {team?.course_name ? ` · ${team.course_name}` : ""} · {yearMonth}
          </div>
          <div className="rb-meta">
            총 회의 {ended.length}회 · 태스크 {tasks.length}개 · {period}
          </div>
        </div>
        <div>
          <div className="rb-score-lbl">종합 달성률</div>
          <div className="rb-score">
            {overall == null ? "—" : `${overall}%`}
          </div>
        </div>
      </div>

      {/* 팀원별 기여도 */}
      <Card
        icon="ti ti-chart-bar"
        title="팀원별 기여도"
        style={{ marginBottom: 14 }}
      >
        <div style={{ padding: "0 18px 14px" }}>
          {members.length === 0 && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-soft)",
                padding: "10px 0",
              }}
            >
              아직 산정된 기여도가 없습니다. 회의를 진행하면 집계돼요.
            </div>
          )}
          {members.map((m, i) => {
            const score = pct(m.composite_score);
            const scoreCls =
              score == null
                ? "md"
                : score >= 50
                  ? "hi"
                  : score >= 25
                    ? "md"
                    : "lo";
            const myTasks = tasks.filter((t) => t.assignee_id === m.user_id);
            const myDone = myTasks.filter((t) => t.status === "done");
            const actionPct = myTasks.length
              ? Math.round((myDone.length / myTasks.length) * 100)
              : null;
            const speech = pct(m.speech_avg);
            const attend = pct(m.attendance_avg);
            const barColor =
              score != null && score < 10
                ? "var(--coral)"
                : BAR_COLORS[i % BAR_COLORS.length];
            return (
              <div key={m.user_id} className="mrc">
                <div className="mrc-head">
                  <div className={`av ${AV_CLS[i % 4]} av-lg`}>{m.name[0]}</div>
                  <div>
                    <div className="mrc-name">
                      {m.name}{" "}
                      {me?.id === m.user_id && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-soft)",
                            fontWeight: 400,
                          }}
                        >
                          나
                        </span>
                      )}
                    </div>
                    <div className="mrc-role">
                      {m.role === "leader" ? "팀장" : "팀원"}
                    </div>
                  </div>
                  <div className={`mrc-score ${scoreCls}`}>
                    {score == null ? "미산정" : `${score}점`}
                    {score != null && score < 10 ? " ⚠️" : ""}
                  </div>
                </div>
                <div className="mrc-stats">
                  {[
                    {
                      l: "발언 비중",
                      v: speech == null ? "—" : `${speech}%`,
                      vc:
                        speech != null && speech < 10
                          ? "var(--coral)"
                          : BAR_COLORS[i % BAR_COLORS.length],
                    },
                    {
                      l: "태스크",
                      v: myTasks.length
                        ? `${myDone.length}/${myTasks.length}`
                        : "—",
                      vc:
                        myTasks.length && myDone.length === 0
                          ? "var(--coral)"
                          : undefined,
                    },
                    { l: "출석", v: attend == null ? "—" : `${attend}%` },
                    {
                      l: "액션 완료",
                      v: actionPct == null ? "—" : `${actionPct}%`,
                      vc: actionPct === 0 ? "var(--coral)" : undefined,
                    },
                  ].map((s) => (
                    <div key={s.l} className="mrc-stat">
                      <div className="mrc-stat-l">{s.l}</div>
                      <div
                        className="mrc-stat-v"
                        style={s.vc ? { color: s.vc } : undefined}
                      >
                        {s.v}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mrc-bar">
                  <i
                    style={{ width: `${score ?? 0}%`, background: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 레이더 차트 */}
      <Card
        icon="ti ti-chart-dots"
        title="기여도 레이더"
        extra={
          <span className="card-link" style={{ cursor: "default" }}>
            {radar
              ? `${radar.name}${radar.isMe ? " (나)" : ""} vs 팀 평균`
              : ""}
          </span>
        }
        style={{ marginBottom: 14 }}
      >
        <div className="radar-wrap">
          {radar ? (
            <svg id="radar" width="240" height="240" viewBox="0 0 240 240" />
          ) : (
            <div
              style={{ fontSize: 12.5, color: "var(--text-soft)", padding: 18 }}
            >
              회의를 진행하면 레이더가 채워집니다.
            </div>
          )}
          <div className="radar-legend">
            <div className="rl-item">
              <span
                className="rl-swatch"
                style={{ background: "var(--green)" }}
              />{" "}
              {radar ? `${radar.name}${radar.isMe ? " (나)" : ""}` : "나"}
            </div>
            <div className="rl-item">
              <span
                className="rl-swatch"
                style={{ background: "var(--text-soft)" }}
              />{" "}
              팀 평균
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-soft)",
                lineHeight: 1.7,
                marginTop: 4,
              }}
            >
              출석 · 참여도(발언) · 태스크
              <br />
              3개 축 기준 정규화 점수
            </div>
          </div>
        </div>
      </Card>

      {/* 회의별 요약 */}
      <Card icon="ti ti-calendar" title="회의별 요약">
        <div style={{ padding: "0 18px 14px" }}>
          {sessions.length === 0 && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-soft)",
                padding: "10px 0",
              }}
            >
              진행한 회의가 없습니다.
            </div>
          )}
          {sessions.map((m, i) => {
            const mins =
              m.t0_timestamp && m.ended_at
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(m.ended_at).getTime() -
                        new Date(m.t0_timestamp).getTime()) /
                        60000,
                    ),
                  )
                : m.total_minutes;
            return (
              <div key={m.id} className="ms-row">
                <div className="ms-num">{i + 1}</div>
                <div>
                  <div className="ms-title">
                    {m.topic ?? "제목 없는 회의"}{" "}
                    <span>
                      {shortDate(m.scheduled_at)} ·{" "}
                      {m.status === "active" ? "진행 중" : `${mins}분`}
                    </span>
                  </div>
                  <div className="ms-body">
                    {m.one_liner ?? "요약이 아직 없습니다."}
                  </div>
                  <div className="ms-meta">
                    {m.status === "active"
                      ? "진행 중"
                      : m.meeting_type === "regular"
                        ? "정규 회의 · 기여도 반영"
                        : "기여도 누적 미반영"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
