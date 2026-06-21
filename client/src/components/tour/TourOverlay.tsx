import "@/styles/tour.css";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTourStore } from "@/stores/tourStore";
import { advanceSatisfied } from "./steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const BUBBLE_GAP = 52; // 대상과 말풍선 간격 (곡선 화살표가 들어갈 공간)
const BUBBLE_W = 240; // .tour-bubble 너비(px) — 가장자리 클램프용 (tour.css 와 동일)

function readRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const BUBBLE_H = 170; // 말풍선 높이 추정(상/하 배치가 화면에 들어가는지 판정용)

// 요청한 배치가 화면 밖으로 나가면 반대쪽으로 뒤집고, 그래도 안 되면 들어가는 쪽으로 바꾼다.
// (좌/우 배치는 가로 클램프가 없어 좁은 창에서 말풍선이 화면 밖으로 사라지던 문제 해결)
function resolvePlacement(
  rect: Rect,
  placement: "top" | "bottom" | "left" | "right",
): "top" | "bottom" | "left" | "right" {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 12;
  const fits = {
    right: rect.left + rect.width + BUBBLE_GAP + BUBBLE_W <= vw - m,
    left: rect.left - BUBBLE_GAP - BUBBLE_W >= m,
    bottom: rect.top + rect.height + BUBBLE_GAP + BUBBLE_H <= vh - m,
    top: rect.top - BUBBLE_GAP - BUBBLE_H >= m,
  } as const;
  if (fits[placement]) return placement;
  const opposite = {
    right: "left",
    left: "right",
    top: "bottom",
    bottom: "top",
  } as const;
  if (fits[opposite[placement]]) return opposite[placement];
  // 상/하는 가로 클램프로 항상 보이므로 폴백 우선순위로 둔다.
  for (const p of ["bottom", "top", "right", "left"] as const) {
    if (fits[p]) return p;
  }
  return placement;
}

function bubblePosition(
  rect: Rect | null,
  placement: "top" | "bottom" | "left" | "right",
): React.CSSProperties {
  if (!rect) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 12; // 화면 가장자리 여백
  // 말풍선 중심을 뷰포트 안으로 클램프 — 가장자리 요소에서도 잘리지 않게
  const clampX = (x: number) =>
    Math.min(Math.max(x, BUBBLE_W / 2 + m), vw - BUBBLE_W / 2 - m);
  const clampY = (y: number) => Math.min(Math.max(y, m), vh - m);
  switch (placement) {
    case "bottom":
      return {
        top: rect.top + rect.height + BUBBLE_GAP,
        left: clampX(rect.left + rect.width / 2),
        transform: "translateX(-50%)",
      };
    case "top":
      return {
        top: rect.top - BUBBLE_GAP,
        left: clampX(rect.left + rect.width / 2),
        transform: "translate(-50%, -100%)",
      };
    case "right":
      return {
        top: clampY(rect.top + rect.height / 2),
        left: rect.left + rect.width + BUBBLE_GAP,
        transform: "translateY(-50%)",
      };
    case "left":
      return {
        top: clampY(rect.top + rect.height / 2),
        left: rect.left - BUBBLE_GAP,
        transform: "translate(-100%, -50%)",
      };
  }
}

// 말풍선 한 면의 정중앙 → 대상 박스 한 면의 정중앙을 잇는 곡선 + 끝점 화살촉.
// 시작점은 bubblePosition 과 동일한 clamp 로 말풍선의 실제 가장자리 중앙에 맞춘다.
// 화살촉은 marker 대신 직접 계산해 step accent 색을 그대로 입힌다. 뷰포트 좌표(px).
function arrowGeom(
  rect: Rect,
  placement: "top" | "bottom" | "left" | "right",
  gap: number,
  t: number, // 그리기 진행도 0..1 — 곡선의 0~t 구간만 그린다
): { d: string; head: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 12;
  const clampX = (x: number) =>
    Math.min(Math.max(x, BUBBLE_W / 2 + m), vw - BUBBLE_W / 2 - m);
  const clampY = (y: number) => Math.min(Math.max(y, m), vh - m);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const o = 6; // 화살촉 끝을 박스 면에서 살짝 띄워 테두리에 닿지 않게
  // start = 대상 쪽을 향한 말풍선 면의 중앙(= 대상 면에서 gap 만큼 떨어진 지점)
  // tip   = 대상 박스 면의 중앙(o 만큼만 바깥)
  let start: [number, number];
  let tip: [number, number];
  switch (placement) {
    case "right":
      start = [right + gap, clampY(cy)];
      tip = [right + o, cy];
      break;
    case "left":
      start = [rect.left - gap, clampY(cy)];
      tip = [rect.left - o, cy];
      break;
    case "bottom":
      start = [clampX(cx), bottom + gap];
      tip = [cx, bottom + o];
      break;
    case "top":
    default:
      start = [clampX(cx), rect.top - gap];
      tip = [cx, rect.top - o];
      break;
  }
  // 직선 대신 살짝 휜 곡선(2차 베지에) — 좀 더 아기자기한 느낌.
  // 양 끝(start=말풍선 면 중앙, tip=대상 면 중앙)은 그대로 두고 중간만 수직으로 bow 만큼 휜다.
  const dx = tip[0] - start[0];
  const dy = tip[1] - start[1];
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(24, len * 0.42); // 곡률
  const ctrl: [number, number] = [
    (start[0] + tip[0]) / 2 + (-dy / len) * bow,
    (start[1] + tip[1]) / 2 + (dx / len) * bow,
  ];
  // 곡선을 0~t 구간만 그린다(De Casteljau 분할). t<1 이면 말풍선에서 출발해
  // 버튼 쪽으로 뻗어가는 도중 — 점선 패턴은 정적이라 "점선이 그려지는" 느낌이 난다.
  const lerp = (
    a: [number, number],
    b: [number, number],
    u: number,
  ): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const A = lerp(start, ctrl, t);
  const B = lerp(ctrl, tip, t);
  const P = lerp(A, B, t); // 진행 끝점 = 곡선의 t 지점
  const d = `M ${start[0]} ${start[1]} Q ${A[0]} ${A[1]} ${P[0]} ${P[1]}`;
  // 화살촉: 진행 끝점 P 의 접선 방향(B - A)을 따라 — 끝점과 함께 버튼까지 이동한다.
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const L = 11; // 화살촉 길이
  const spread = 0.5; // 벌어짐(rad)
  const a1 = [P[0] - L * Math.cos(ang - spread), P[1] - L * Math.sin(ang - spread)];
  const a2 = [P[0] - L * Math.cos(ang + spread), P[1] - L * Math.sin(ang + spread)];
  const head = `M ${a1[0]} ${a1[1]} L ${P[0]} ${P[1]} L ${a2[0]} ${a2[1]}`;
  return { d, head };
}

export default function TourOverlay() {
  const active = useTourStore((s) => s.active);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const steps = useTourStore((s) => s.steps);
  const next = useTourStore((s) => s.next);
  const stop = useTourStore((s) => s.stop);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [rect, setRect] = useState<Rect | null>(null);
  const [drawT, setDrawT] = useState(0); // 화살표 그리기 진행도(0=없음 → 1=완성)
  const [bubbleShown, setBubbleShown] = useState(false); // 말풍선 등장 애니메이션 완료 여부

  const step = active ? steps[stepIndex] : undefined;

  // 단계 인덱스가 범위를 벗어나면 안전하게 종료
  useEffect(() => {
    if (active && steps.length > 0 && !steps[stepIndex]) stop();
  }, [active, steps, stepIndex, stop]);

  // 연속 투어: goto 가 있는 단계로 들어가면 해당 페이지로 이동한다(단계 활성화 시 1회).
  // pathname 변화에는 재실행하지 않아(사용자가 떠난 뒤 다시 끌고 오지 않음).
  useEffect(() => {
    if (!active) return;
    const s = steps[stepIndex];
    if (s && s.goto && window.location.pathname !== s.goto) {
      navigate(s.goto);
    }
  }, [active, steps, stepIndex, navigate]);

  // Enter 키: 수동 단계는 다음으로, 축하 단계는 완료. (자동 진행 단계는 자체 Enter 처리 — 중복 방지)
  useEffect(() => {
    if (!active || !step) return;
    const celeb = !step.target && !step.advance;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (celeb) {
        stop();
      } else if (!step.advance) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, next, stop]);

  // 대상 요소가 유예시간(페이지 이동·비동기 렌더 흡수)이 지나도 없을 때:
  //  - optional 단계(빈 데이터·미로드 가능) → 다음 단계로 건너뛴다(투어 유지).
  //  - 그 외(다른 화면으로 이동 등) → 투어를 종료한다(말풍선이 남지 않게).
  useEffect(() => {
    if (!active || !step || !step.target || rect) return;
    // skipIfPresent(다른 상태 표시)가 보이면 즉시 건너뛴다(예: 리포트 잠금↔열림 전환).
    const skipFast =
      !!step.skipIfPresent &&
      !!document.querySelector(`[data-tour="${step.skipIfPresent}"]`);
    // optional(빈 데이터 가능) 단계는 빨리 건너뛰고, 그 외(이동 중 렌더 대기)는 넉넉히 기다린다.
    const delay = skipFast ? 0 : step.optional ? 400 : 1400;
    const id = window.setTimeout(() => {
      if (skipFast || step.optional) next();
      else stop();
    }, delay);
    return () => window.clearTimeout(id);
  }, [active, step, rect, next, stop]);

  // 대상 요소 위치 계산 + 스크롤/리사이즈 추종
  useLayoutEffect(() => {
    if (!step || !step.target) {
      setRect(null);
      return;
    }
    // 새 단계: 화살표를 숨기고 말풍선 등장 완료 신호를 리셋(페인트 전 → 깜빡임 없음).
    // 말풍선이 완전히 나온 뒤에야 화살표를 그리기 시작한다.
    setDrawT(0);
    setBubbleShown(false);
    const sel = `[data-tour="${step.target}"]`;
    let raf = 0;
    let prev = ""; // 같은 위치면 setState 생략(불필요한 리렌더 방지)
    const measure = () => {
      const e = document.querySelector(sel);
      if (!e) {
        setRect(null);
        return;
      }
      const r = readRect(e);
      const key = `${r.top},${r.left},${r.width},${r.height}`;
      if (key !== prev) {
        prev = key;
        setRect(r);
      }
    };
    const el = document.querySelector(sel);
    const accClass = `acc-${step.accent}`; // 링 색을 step accent 에 맞춘다
    if (el) {
      el.classList.add("tour-highlight", accClass); // 버튼 자체가 빛난다 — 딤·박스 없음
      // 대상이 화면 밖일 때만 스크롤 — 이미 보이면 가만히 둔다(타이핑 중 버튼이 움직이지 않게)
      const r = el.getBoundingClientRect();
      const visible =
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= window.innerHeight &&
        r.right <= window.innerWidth;
      if (!visible) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    measure();
    // 진입 애니메이션(.reveal translateY)·부드러운 스크롤로 대상이 움직여도
    // scroll·resize 이벤트가 안 뜰 수 있다 → 마운트 직후 ~800ms 동안 rAF 로
    // 재측정해 화살표·말풍선 정렬을 맞춘다(시간이 지나면 자동 종료).
    let settleRaf = 0;
    const t0 = performance.now();
    const settle = () => {
      measure();
      if (performance.now() - t0 < 800) settleRaf = requestAnimationFrame(settle);
    };
    settleRaf = requestAnimationFrame(settle);
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    // 대상 자체 크기가 바뀌면(예: 기여도 현황이 인원 수에 따라 늘거나 줄면) 재측정해
    // 말풍선·화살표·강조 링을 새 크기/위치에 맞춘다. (강조 링은 box-shadow라 자동 추종)
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onMove);
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(settleRaf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      ro?.disconnect();
      if (el) el.classList.remove("tour-highlight", accClass);
    };
  }, [step, stepIndex, pathname]);

  // 말풍선이 "완전히" 나타난 뒤(bubbleShown)에야 화살표가 말풍선→버튼으로 천천히 그려진다.
  useEffect(() => {
    const s = active ? steps[stepIndex] : undefined;
    if (!s || !s.target) {
      setDrawT(1); // 축하·대상 없는 단계는 그릴 화살표 없음
      return;
    }
    if (!bubbleShown) {
      setDrawT(0); // 아직 말풍선이 다 안 나옴 → 화살표 대기
      return;
    }
    let raf = 0;
    const delay = 90; // 말풍선이 완전히 나온 뒤 한 박자 텀
    const dur = 560; // 화살표가 천천히 그려지는 시간
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start - delay;
      const p = elapsed <= 0 ? 0 : Math.min(1, elapsed / dur);
      setDrawT(1 - Math.pow(1 - p, 3)); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, steps, stepIndex, bubbleShown]);

  // 진행 조건 감시 (route / appear / input)
  useEffect(() => {
    if (!step || !step.advance) return;
    const adv = step.advance;
    const check = () => {
      const ok = advanceSatisfied(adv, {
        path: pathname,
        hasTarget: (t) => !!document.querySelector(`[data-tour="${t}"]`),
        inputFilled: (t) => {
          const el = document.querySelector(`[data-tour="${t}"]`);
          return (
            !!el &&
            "value" in el &&
            String((el as HTMLInputElement).value).trim().length > 0
          );
        },
      });
      if (ok) next();
    };

    if (adv.on === "route") {
      check();
      return;
    }
    if (adv.on === "appear") {
      check();
      const mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    // input: 값이 채워진 채 Enter 를 누르거나 포커스를 떠날 때(blur) 진행한다.
    // (첫 글자 입력마다 진행하면 이름을 치는 도중에 다음 단계로 넘어가 버튼이 움직였다)
    // 대상이 나중에 생길 수 있어 MutationObserver 로 리스너를 (재)부착.
    let attached: HTMLInputElement | null = null;
    const onDone = () => check();
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === "Enter") check();
    };
    const attach = () => {
      const el = document.querySelector(`[data-tour="${adv.target}"]`);
      if (el && el !== attached) {
        attached?.removeEventListener("blur", onDone);
        attached?.removeEventListener("keydown", onKey);
        attached = el as HTMLInputElement;
        attached.addEventListener("blur", onDone);
        attached.addEventListener("keydown", onKey);
        check(); // 이미 채워져 있으면 즉시 진행
      }
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      attached?.removeEventListener("blur", onDone);
      attached?.removeEventListener("keydown", onKey);
    };
  }, [step, stepIndex, pathname, next]);

  if (!active || !step) return null;
  // 대상이 있어야 하는 단계인데 요소가 없으면(다른 화면으로 이동 등) 아무것도 띄우지 않는다.
  // (말풍선이 화면 가운데에 남아 "그대로 넘어가는" 문제 방지 — 위 effect 가 곧 투어를 종료한다.)
  if (step.target && !rect) return null;

  const total = steps.length;
  const isCelebration = !step.target && !step.advance;
  // 화면에 들어가도록 배치를 보정(좁은 창에서 좌/우 말풍선이 화면 밖으로 나가지 않게).
  const placement = rect ? resolvePlacement(rect, step.placement) : step.placement;
  const style = bubblePosition(rect, placement);
  // drawT 가 0 보다 커진 뒤(말풍선 등장 후)부터 화살표를 그린다.
  const arrow =
    rect && !isCelebration && drawT > 0.001
      ? arrowGeom(rect, placement, BUBBLE_GAP, drawT)
      : null;

  return createPortal(
    <div
      className={`tour-root acc-${step.accent}`}
      role="dialog"
      aria-modal="true"
    >
      {/* 버튼 자체가 .tour-highlight로 빛난다 — 딤·박스 없음.
          축하 단계만 전체 딤(대상이 없으므로). */}
      {isCelebration && <div className="tour-dim" />}

      {/* 말풍선 → 대상으로 천천히 그려지는 SVG 점선 곡선 화살표 + 끝점 화살촉 (step accent 색).
          처음 구간은 opacity 로 살짝 페이드인해 화살촉이 툭 튀어나오지 않게. */}
      {!isCelebration && arrow && (
        <svg
          className="tour-arrow-svg"
          aria-hidden="true"
          style={{ opacity: Math.min(1, drawT * 4) }}
        >
          <path className="tour-arrow-line" d={arrow.d} />
          <path className="tour-arrow-head" d={arrow.head} />
        </svg>
      )}

      <div className="tour-anchor" style={style}>
        <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          className={`tour-bubble ${isCelebration ? "celebrate" : `place-${placement}`}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          // 고정 duration tween — 등장 완료 시점이 시각적 완료와 일치(스프링의 늦은 완료 콜백 회피).
          // back-out 이징으로 살짝 통통 튀는 팝은 유지.
          transition={{ duration: 0.32, ease: [0.34, 1.4, 0.64, 1] }}
          // 등장(scale→1) 완료 시점에만 화살표 그리기를 허용 (exit 는 scale 0.92 → 무시)
          onAnimationComplete={(def) => {
            if ((def as { scale?: number })?.scale === 1) setBubbleShown(true);
          }}
        >
          {isCelebration ? (
            <>
              <div className="tour-confetti">
                <i className={`ti ${step.icon ?? "ti-confetti"}`} />
              </div>
              <div className="tour-title">{step.title}</div>
              <div className="tour-body">{step.body}</div>
              <button className="btn btn-primary btn-full" onClick={stop}>
                완료
              </button>
            </>
          ) : (
            <>
              <div className="tour-title">
                {step.icon && <i className={`ti ${step.icon}`} />}
                {step.title}
              </div>
              <div className="tour-body">{step.body}</div>
              {step.demo === "drag" && (
                <div className="tour-demo" aria-hidden="true">
                  <span className="tour-demo-col">할 일</span>
                  <span className="tour-demo-col">진행 중</span>
                  <span className="tour-demo-card">
                    <i className="ti ti-grip-vertical" />
                    태스크
                  </span>
                </div>
              )}
              <div className="tour-foot">
                <span className="tour-count">
                  {stepIndex + 1} / {total}
                </span>
                <div className="tour-actions">
                  <button
                    className="tour-skip"
                    onClick={stop}
                    aria-label="건너뛰기"
                  >
                    건너뛰기
                  </button>
                  {/* 자동 진행 조건이 없는 선택 단계(과목·마감일·팀 설정)는 '다음'으로 직접 진행 */}
                  {!step.advance && (
                    <button className="tour-next" onClick={next}>
                      다음 <span className="tour-kbd">↵</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
