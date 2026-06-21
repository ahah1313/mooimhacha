import { describe, it, expect, beforeEach } from "vitest";
import { useTourStore } from "../src/stores/tourStore";
import { HOME_STEPS } from "../src/components/tour/steps";

describe("tourStore", () => {
  beforeEach(() => {
    useTourStore.setState({ active: false, stepIndex: 0 });
  });

  it("초기 상태는 비활성·0단계", () => {
    const s = useTourStore.getState();
    expect(s.active).toBe(false);
    expect(s.stepIndex).toBe(0);
  });

  it("start()는 활성화하고 0단계로", () => {
    useTourStore.setState({ active: false, stepIndex: 3 });
    useTourStore.getState().start(HOME_STEPS);
    const s = useTourStore.getState();
    expect(s.active).toBe(true);
    expect(s.stepIndex).toBe(0);
  });

  it("next()는 단계를 1 증가", () => {
    useTourStore.getState().start(HOME_STEPS);
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(1);
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(2);
  });

  it("stop()은 비활성·0단계로 리셋", () => {
    useTourStore.setState({ active: true, stepIndex: 4 });
    useTourStore.getState().stop();
    const s = useTourStore.getState();
    expect(s.active).toBe(false);
    expect(s.stepIndex).toBe(0);
  });
});
