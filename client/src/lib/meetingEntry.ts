// 홈·대시보드 개요·회의 관리에서 회의를 시작/참여하는 공용 진입 로직.
// MeetingLauncher의 startMeeting과 동일한 흐름 (scheduled → start 후 보조 창).
import { apiPost } from "@/lib/api";
import { openCompanion } from "@/lib/companion";
import type { Meeting } from "@/lib/types";

// 시작 API await 뒤의 window.open은 user gesture를 잃어 차단될 수 있다.
// blocked=true면 호출측이 재클릭 안내를 띄운다 (재클릭은 이미 active라 동기 호출 → 열림).
export async function enterMeeting(
  m: Pick<Meeting, "id" | "status">,
  teamId: number,
): Promise<{ blocked: boolean }> {
  if (m.status === "scheduled") {
    await apiPost(`/meetings/${m.id}/start`);
  }
  const win = openCompanion(m.id, teamId);
  const blocked = !window.mooimhacha?.isElectron && win === null;
  return { blocked };
}

// 시각이 도래한 예정 회의 — "시작하기" 노출 판단
export function isDue(
  m: Pick<Meeting, "status" | "scheduled_at">,
  now: Date = new Date(),
): boolean {
  return (
    m.status === "scheduled" &&
    new Date(m.scheduled_at).getTime() <= now.getTime()
  );
}
