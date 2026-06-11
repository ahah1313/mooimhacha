import { motion } from "framer-motion";
import type { TeamMember } from "@/lib/types";
import type { ContributionScoreLive } from "@/lib/ws";

// 실시간 기여도 바 (★) — 회의 중 발언 비중 한 축만 표시.
// 막대 = 비율(%), 라벨 = 절대 글자수. WebSocket 1초 디바운스로 갱신.
const BAR_COLORS = [
  "var(--green)",
  "var(--blue)",
  "var(--violet)",
  "var(--amber)",
  "var(--coral)",
  "var(--pink)",
];

interface Props {
  scores: ContributionScoreLive[];
  members: TeamMember[];
  speaking: Set<number>;
}

export default function ContributionBar({ scores, members, speaking }: Props) {
  const nameOf = (id: number) =>
    members.find((m) => m.user_id === id)?.name ?? `사용자 ${id}`;

  // 참여자 전원 노출 (발언 0 포함), 비율 내림차순
  const byUser = new Map(scores.map((s) => [s.user_id, s]));
  const rows = members
    .map((m) => byUser.get(m.user_id) ?? { user_id: m.user_id, char_count: 0, ratio: 0 })
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <section className="cmp-section cmp-contrib">
      <header className="cmp-section__head">
        <h2>
          발언 비중
          <span className="cmp-info" title="발언 글자수 기반 추정치입니다.">
            ⓘ
          </span>
        </h2>
      </header>
      <div className="cmp-bars">
        {rows.map((row, i) => (
          <div className="cmp-bar-row" key={row.user_id}>
            <div className="cmp-bar-label">
              <span className="cmp-bar-name">
                {speaking.has(row.user_id) && <span className="cmp-mic">🎤</span>}
                {nameOf(row.user_id)}
              </span>
              <span className="cmp-bar-count">{row.char_count}자</span>
            </div>
            <div className="cmp-bar-track">
              <motion.div
                className="cmp-bar-fill"
                style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                initial={false}
                animate={{ width: `${Math.round(row.ratio * 100)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
              <span className="cmp-bar-pct">{Math.round(row.ratio * 100)}%</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="cmp-empty">아직 발언이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
