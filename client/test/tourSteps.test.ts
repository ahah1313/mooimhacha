import { describe, it, expect } from "vitest";
import {
  HOME_STEPS,
  makeDashboardSteps,
  pathMatches,
  advanceSatisfied,
} from "../src/components/tour/steps";

describe("pathMatches", () => {
  it("정확히 일치하면 true", () => {
    expect(pathMatches("/onboarding", "/onboarding")).toBe(true);
  });
  it("하위 경로면 true", () => {
    expect(pathMatches("/dashboard", "/dashboard/12/overview")).toBe(true);
  });
  it("다른 경로면 false", () => {
    expect(pathMatches("/onboarding", "/home")).toBe(false);
  });
  it("접두만 겹치는 가짜 경로는 false", () => {
    expect(pathMatches("/dashboard", "/dashboardx")).toBe(false);
  });
});

describe("advanceSatisfied", () => {
  const ctx = {
    path: "/dashboard/1",
    hasTarget: (t: string) => t === "present",
    inputFilled: (t: string) => t === "filled",
  };
  it("route: 경로가 일치하면 true", () => {
    expect(advanceSatisfied({ on: "route", path: "/dashboard" }, ctx)).toBe(true);
  });
  it("appear: 대상이 존재하면 true", () => {
    expect(advanceSatisfied({ on: "appear", target: "present" }, ctx)).toBe(true);
    expect(advanceSatisfied({ on: "appear", target: "absent" }, ctx)).toBe(false);
  });
  it("input: 대상 입력이 채워졌으면 true", () => {
    expect(advanceSatisfied({ on: "input", target: "filled" }, ctx)).toBe(true);
    expect(advanceSatisfied({ on: "input", target: "empty" }, ctx)).toBe(false);
  });
  it("advance가 null이면 false", () => {
    expect(advanceSatisfied(null, ctx)).toBe(false);
  });
});

describe("HOME_STEPS", () => {
  it("10개 단계", () => {
    expect(HOME_STEPS).toHaveLength(10);
  });
  it("id는 모두 고유", () => {
    expect(new Set(HOME_STEPS.map((s) => s.id)).size).toBe(HOME_STEPS.length);
  });
  it("마지막 축하 단계만 target·advance가 null", () => {
    const last = HOME_STEPS[HOME_STEPS.length - 1];
    expect(last.target).toBeNull();
    expect(last.advance).toBeNull();
    for (let i = 0; i < HOME_STEPS.length - 1; i++) {
      expect(HOME_STEPS[i].target).not.toBeNull();
    }
  });
});

describe("makeDashboardSteps", () => {
  it("teamId가 goto 경로에 반영된다", () => {
    const steps = makeDashboardSteps(7);
    const withGoto = steps.filter((s) => s.goto);
    expect(withGoto.length).toBeGreaterThan(0);
    expect(withGoto.every((s) => s.goto!.startsWith("/dashboard/7"))).toBe(true);
  });
  it("마지막 단계는 축하(target null)", () => {
    const steps = makeDashboardSteps(1);
    expect(steps[steps.length - 1].target).toBeNull();
  });
});
