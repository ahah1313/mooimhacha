// 투어 말풍선·화살표의 화면 좌표 계산(순수 함수). DOM·React 렌더와 분리해 단위 테스트한다.
// vw/vh 는 호출 시점의 window 에서 읽는다(테스트는 window 를 stub 한다).
import type { CSSProperties } from "react";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Placement = "top" | "bottom" | "left" | "right";

export interface Size {
  w: number;
  h: number;
}

export const BUBBLE_GAP = 52; // 대상과 말풍선 간격 (곡선 화살표가 들어갈 공간)
export const BUBBLE_W = 240; // .tour-bubble 너비(px) — 가장자리 클램프용 (tour.css 와 동일)
export const BUBBLE_H = 170; // 말풍선 높이 기본 추정값(실측 전 fallback)

// 화면 안으로 끌어들이는 클램프 — 말풍선이 화면보다 크면 시작 모서리(좌/상)를 우선 보이게.
export function clampInto(ideal: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(ideal, hi));
}

// 요청한 배치가 화면 밖으로 나가면 반대쪽으로 뒤집고, 그래도 안 되면 들어가는 쪽으로 바꾼다.
// (실측 말풍선 크기 size 로 판정 — 드래그 데모처럼 키 큰 말풍선도 정확히 들어맞는지 본다.)
export function resolvePlacement(
  rect: Rect,
  placement: Placement,
  size: Size,
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 12;
  const fits = {
    right: rect.left + rect.width + BUBBLE_GAP + size.w <= vw - m,
    left: rect.left - BUBBLE_GAP - size.w >= m,
    bottom: rect.top + rect.height + BUBBLE_GAP + size.h <= vh - m,
    top: rect.top - BUBBLE_GAP - size.h >= m,
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

// 말풍선을 좌상단 좌표로 직접 배치(transform 없음)하고, 화면 밖이면 안으로 클램프한다.
// 어느 방향도 공간이 모자란 거대 대상(예: 보드 전체)에서도 말풍선이 항상 화면 안에 든다.
// 함께 화살표 시작점(말풍선의 대상 쪽 면 중앙)을 클램프된 실제 위치 기준으로 돌려준다.
export function placeBubble(
  rect: Rect,
  placement: Placement,
  size: Size,
): { style: CSSProperties; ox: number; oy: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = 12; // 화면 가장자리 여백
  const { w, h } = size;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let left = 0;
  let top = 0;
  switch (placement) {
    case "bottom":
      left = cx - w / 2;
      top = rect.top + rect.height + BUBBLE_GAP;
      break;
    case "top":
      left = cx - w / 2;
      top = rect.top - BUBBLE_GAP - h;
      break;
    case "right":
      left = rect.left + rect.width + BUBBLE_GAP;
      top = cy - h / 2;
      break;
    case "left":
      left = rect.left - BUBBLE_GAP - w;
      top = cy - h / 2;
      break;
  }
  left = clampInto(left, m, vw - m - w);
  top = clampInto(top, m, vh - m - h);
  // 화살표 시작점: 말풍선에서 대상을 향한 면의 중앙(클램프된 위치 반영).
  let ox = 0;
  let oy = 0;
  switch (placement) {
    case "bottom":
      ox = clampInto(cx, left, left + w);
      oy = top;
      break;
    case "top":
      ox = clampInto(cx, left, left + w);
      oy = top + h;
      break;
    case "right":
      ox = left;
      oy = clampInto(cy, top, top + h);
      break;
    case "left":
      ox = left + w;
      oy = clampInto(cy, top, top + h);
      break;
  }
  return { style: { top, left }, ox, oy };
}

// 말풍선 한 면의 정중앙 → 대상 박스 한 면의 정중앙을 잇는 곡선 + 끝점 화살촉.
// 시작점(start)은 placeBubble 이 클램프해 돌려준 말풍선 실제 면 중앙 — 말풍선이 어디로
// 밀려나든 화살표가 그 위치에서 출발한다. 화살촉 색은 step accent 를 그대로 입힌다.
export function arrowGeom(
  rect: Rect,
  placement: Placement,
  start: [number, number],
  t: number, // 그리기 진행도 0..1 — 곡선의 0~t 구간만 그린다
): { d: string; head: string } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const o = 6; // 화살촉 끝을 박스 면에서 살짝 띄워 테두리에 닿지 않게
  // tip = 대상 박스 면의 중앙(o 만큼만 바깥)
  let tip: [number, number];
  switch (placement) {
    case "right":
      tip = [right + o, cy];
      break;
    case "left":
      tip = [rect.left - o, cy];
      break;
    case "bottom":
      tip = [cx, bottom + o];
      break;
    case "top":
    default:
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
