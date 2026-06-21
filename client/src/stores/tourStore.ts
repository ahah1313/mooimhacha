import { create } from "zustand";
import type { TourStep } from "@/components/tour/steps";

// 가이드 투어 진행 상태. 라우트 전환에도 유지(스토어가 React 트리 밖).
// 투어는 1회성이라 localStorage 영속은 하지 않는다.
// steps 를 인자로 받아 여러 종류의 투어(홈/대시보드 등)를 같은 오버레이로 돌린다.
interface TourState {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  start: (steps: TourStep[]) => void;
  next: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  stepIndex: 0,
  steps: [],
  start: (steps) => set({ active: true, stepIndex: 0, steps }),
  next: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
  stop: () => set({ active: false, stepIndex: 0, steps: [] }),
}));
