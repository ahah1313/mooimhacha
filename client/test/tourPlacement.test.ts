import { describe, it, expect, afterEach, vi } from "vitest";
import {
  clampInto,
  placeBubble,
  resolvePlacement,
  type Rect,
  type Size,
} from "../src/components/tour/placement";

// placement.ts 는 window.innerWidth/Height 를 읽으므로 화면 크기를 stub 한다.
function setViewport(vw: number, vh: number) {
  vi.stubGlobal("window", { innerWidth: vw, innerHeight: vh });
}
afterEach(() => vi.unstubAllGlobals());

const M = 12; // placement.ts 의 화면 가장자리 여백과 동일

// 말풍선 박스가 화면 여백 안에 완전히 드는지
function fullyInside(
  pos: { style: { top?: number | string; left?: number | string } },
  size: Size,
  vw: number,
  vh: number,
) {
  const left = pos.style.left as number;
  const top = pos.style.top as number;
  return (
    left >= M &&
    top >= M &&
    left + size.w <= vw - M &&
    top + size.h <= vh - M
  );
}

describe("clampInto", () => {
  it("범위 안 값은 그대로", () => {
    expect(clampInto(50, 0, 100)).toBe(50);
  });
  it("하한 아래는 하한으로", () => {
    expect(clampInto(-30, 0, 100)).toBe(0);
  });
  it("상한 위는 상한으로", () => {
    expect(clampInto(200, 0, 100)).toBe(100);
  });
  it("hi < lo(대상이 화면보다 큼)면 시작 모서리(lo) 우선", () => {
    expect(clampInto(-50, 12, -10)).toBe(12);
  });
});

describe("placeBubble — 드래그 가이드(거대 대상 + 키 큰 말풍선) 회귀", () => {
  // dash-tk-drag: target=tk-board(보드 전체), placement=top, demo 말풍선이라 키가 크다.
  const board: Rect = { top: 180, left: 24, width: 1232, height: 580 };
  const bigBubble: Size = { w: 240, h: 280 }; // 드래그 데모 포함 실측 높이

  it("top 배치라도 말풍선이 화면 위로 벗어나지 않는다", () => {
    setViewport(1280, 800);
    const pos = placeBubble(board, "top", bigBubble);
    // 기존 버그: top = 180 - 52 - 280 = -152 (화면 위로 잘림). 클램프로 화면 안에 들어와야 한다.
    expect((pos.style.top as number) >= M).toBe(true);
    expect(fullyInside(pos, bigBubble, 1280, 800)).toBe(true);
  });

  it("세로가 짧은 화면에서도 말풍선이 화면 안에 든다", () => {
    setViewport(1280, 600);
    const pos = placeBubble(board, "top", bigBubble);
    expect(fullyInside(pos, bigBubble, 1280, 600)).toBe(true);
  });

  it("화살표 시작점(ox,oy)은 말풍선 면 위에 있다", () => {
    setViewport(1280, 800);
    const pos = placeBubble(board, "top", bigBubble);
    const left = pos.style.left as number;
    const top = pos.style.top as number;
    expect(pos.ox).toBeGreaterThanOrEqual(left);
    expect(pos.ox).toBeLessThanOrEqual(left + bigBubble.w);
    expect(pos.oy).toBe(top + bigBubble.h); // top 배치 → 말풍선 아랫면 중앙
  });
});

describe("placeBubble — 일반 배치의 경계 클램프", () => {
  const size: Size = { w: 240, h: 170 };

  it("bottom 배치에서 대상이 화면 하단이면 말풍선이 아래로 넘치지 않는다", () => {
    setViewport(1280, 800);
    const target: Rect = { top: 700, left: 600, width: 80, height: 40 };
    const pos = placeBubble(target, "bottom", size);
    expect(fullyInside(pos, size, 1280, 800)).toBe(true);
  });

  it("right 배치에서 대상이 세로 끝이면 말풍선이 위/아래로 넘치지 않는다", () => {
    setViewport(1280, 800);
    const target: Rect = { top: 760, left: 100, width: 80, height: 40 };
    const pos = placeBubble(target, "right", size);
    expect(fullyInside(pos, size, 1280, 800)).toBe(true);
  });

  it("left 배치에서 좌측 끝 대상도 가로로 화면 안에 든다", () => {
    setViewport(1280, 800);
    const target: Rect = { top: 300, left: 40, width: 80, height: 40 };
    const pos = placeBubble(target, "left", size);
    expect(fullyInside(pos, size, 1280, 800)).toBe(true);
  });
});

describe("resolvePlacement — 실측 크기 기반 판정", () => {
  it("키 큰 말풍선은 좁은 위쪽 공간에 top 으로 들어가지 않는다고 본다", () => {
    setViewport(1280, 800);
    const target: Rect = { top: 250, left: 600, width: 80, height: 40 };
    // 170 추정으론 top 이 들어맞지만(250-52-170=28), 실제 280 이면 위로 벗어난다.
    const big: Size = { w: 240, h: 280 };
    expect(resolvePlacement(target, "top", big)).not.toBe("top");
  });

  it("충분한 공간이면 요청한 배치를 유지한다", () => {
    setViewport(1280, 800);
    const target: Rect = { top: 400, left: 600, width: 80, height: 40 };
    const small: Size = { w: 240, h: 150 };
    expect(resolvePlacement(target, "top", small)).toBe("top");
  });
});
