import "@/styles/tour.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTourStore } from "@/stores/tourStore";
import { advanceSatisfied } from "./steps";
import {
  arrowGeom,
  BUBBLE_H,
  BUBBLE_W,
  placeBubble,
  resolvePlacement,
  type Rect,
  type Size,
} from "./placement";

function readRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
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
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: BUBBLE_W, h: BUBBLE_H }); // 말풍선 실측 크기

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

  // 말풍선 실제 크기 측정 — 본문 길이·드래그 데모 유무로 높이가 크게 달라지므로
  // 추정값 대신 실측해 배치·경계 판정 정확도를 높인다(scale 애니메이션과 무관한 offset* 사용).
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
  }, [active, stepIndex, rect]);

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
  // 화면에 들어가도록 배치를 보정(좁은 창·거대 대상에서 말풍선이 화면 밖으로 나가지 않게).
  const placement = rect ? resolvePlacement(rect, step.placement, size) : step.placement;
  const placed = rect ? placeBubble(rect, placement, size) : null;
  const style: React.CSSProperties = placed
    ? placed.style
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  // drawT 가 0 보다 커진 뒤(말풍선 등장 후)부터 화살표를 그린다.
  const arrow =
    placed && !isCelebration && drawT > 0.001
      ? arrowGeom(rect!, placement, [placed.ox, placed.oy], drawT)
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
          ref={bubbleRef}
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
