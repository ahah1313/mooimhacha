// 투어 단계의 "다음으로 넘어가는 조건"
export type Advance =
  | { on: "route"; path: string } // 경로가 path(prefix)로 바뀌면 진행
  | { on: "appear"; target: string } // 해당 data-tour 요소가 나타나면 진행
  | { on: "input"; target: string }; // 해당 data-tour 입력을 채운 뒤 포커스를 떠나면 진행

// step마다 다른 accent 색 — global.css 토큰명과 1:1 (tour.css 의 .acc-* 가 받는다)
export type Accent = "green" | "blue" | "violet" | "amber" | "coral" | "pink";

export interface TourStep {
  id: string;
  target: string | null; // 가리킬 요소의 data-tour 값 (null = 중앙 축하)
  title: string;
  body: string;
  icon?: string; // 제목 앞 픽토그래프 (Tabler 아이콘 클래스, 예: "ti-pencil")
  placement: "top" | "bottom" | "left" | "right";
  accent: Accent;
  advance: Advance | null; // null = 자동 진행 없음(축하 단계, 버튼으로 종료)
  goto?: string; // 이 단계가 활성화될 때 이동할 라우트(연속 투어가 페이지를 함께 넘긴다)
  optional?: boolean; // 대상이 없으면(빈 데이터·비동기 미로드) 투어를 멈추지 않고 건너뛴다
  demo?: "drag"; // 말풍선 안에 보여줄 예시 모션(현재 드래그 데모만)
  skipIfPresent?: string; // 이 data-tour 요소가 보이면(=다른 상태) 이 단계를 즉시 건너뛴다
}

// 경로 prefix 매칭 — 정확히 같거나 하위 경로(prefix + "/")일 때만 true
export function pathMatches(prefix: string, current: string): boolean {
  if (current === prefix) return true;
  return current.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

export interface AdvanceCtx {
  path: string;
  hasTarget: (t: string) => boolean;
  inputFilled: (t: string) => boolean;
}

// 진행 조건이 충족됐는지 (순수 판정)
export function advanceSatisfied(
  advance: Advance | null,
  ctx: AdvanceCtx,
): boolean {
  if (!advance) return false;
  switch (advance.on) {
    case "route":
      return pathMatches(advance.path, ctx.path);
    case "appear":
      return ctx.hasTarget(advance.target);
    case "input":
      return ctx.inputFilled(advance.target);
  }
}

// Phase 1: 그룹 생성 흐름 (홈 → 온보딩 마법사 → 대시보드 진입)
export const HOME_STEPS: TourStep[] = [
  {
    id: "home-new-group",
    target: "new-group-card",
    title: "환영해요!",
    icon: "ti-mood-smile",
    body: "먼저 우리 팀을 만들어볼까요? 가운데 '새 그룹 만들기'를 눌러보세요.",
    placement: "right",
    accent: "green",
    advance: { on: "route", path: "/onboarding" },
  },
  {
    id: "ob-name",
    target: "team-name-input",
    title: "팀 이름 짓기",
    icon: "ti-pencil",
    body: "우리 팀 이름을 정하고 Enter 를 눌러주세요. (예: 캡스톤 팀플 B)",
    placement: "left",
    accent: "blue",
    advance: { on: "input", target: "team-name-input" },
  },
  {
    id: "ob-course",
    target: "course-chips",
    title: "과목 유형 골라두기",
    icon: "ti-book",
    body: "어떤 수업의 팀플인가요? 칩을 고르거나 아래 칸에 직접 입력할 수 있어요. (선택)",
    placement: "right",
    accent: "violet",
    advance: null,
  },
  {
    id: "ob-deadline",
    target: "deadline-field",
    title: "마감일 정하기",
    icon: "ti-calendar",
    body: "프로젝트 마감일을 정해두면 일정 관리와 마감 패널티 계산에 반영돼요. (선택)",
    placement: "left",
    accent: "amber",
    advance: null,
  },
  {
    id: "ob-members",
    target: "member-count",
    title: "최대 인원",
    icon: "ti-users",
    body: "팀의 최대 인원수를 정해요. (선택)",
    placement: "right",
    accent: "green",
    advance: null,
  },
  {
    id: "ob-settings",
    target: "team-settings",
    title: "팀 설정 맞추기",
    icon: "ti-settings",
    body: "기여도 집계 규칙이에요. 우리 팀에 맞게 조정해 두면 리포트가 더 정확해져요. (선택)",
    placement: "right",
    accent: "coral",
    advance: null,
  },
  {
    id: "ob-create",
    target: "create-team-btn",
    title: "팀 생성!",
    icon: "ti-rocket",
    body: "다 정했다면 이 버튼을 눌러 팀을 만들어요.",
    placement: "left",
    accent: "pink",
    advance: { on: "appear", target: "invite-code" },
  },
  {
    id: "ob-invite",
    target: "invite-code",
    title: "팀원 초대",
    icon: "ti-key",
    body: "이 초대코드를 팀원에게 공유하면 바로 합류할 수 있어요.",
    placement: "right",
    accent: "green",
    advance: { on: "appear", target: "dashboard-go" },
  },
  {
    id: "ob-dashboard",
    target: "dashboard-go",
    title: "거의 끝났어요!",
    icon: "ti-flag",
    body: "이제 대시보드로 가서 팀플을 시작해볼까요?",
    placement: "left",
    accent: "blue",
    advance: { on: "route", path: "/dashboard" },
  },
  {
    id: "done",
    target: null,
    title: "첫 팀 완성!",
    icon: "ti-confetti",
    body: "축하해요! 가이드 1단계를 클리어했어요. 이제 무임하차를 자유롭게 둘러보세요.",
    placement: "bottom",
    accent: "pink",
    advance: null,
  },
];

// Phase 2: 대시보드 연속 둘러보기.
// 각 페이지로 자동 이동(goto)하면서 그 페이지 내부 기능까지 설명한다.
// 모두 '다음'으로 직접 진행(advance: null). goto 가 있는 단계에서 해당 페이지로 라우팅된다.
// teamId 가 라우트에 필요하므로 런타임에 빌더로 생성한다.
export function makeDashboardSteps(teamId: string | number): TourStep[] {
  const base = `/dashboard/${teamId}`;
  return [
    // ── 대시보드 홈(overview) ──
    {
      id: "dash-overview",
      target: "ov-stats",
      title: "대시보드 홈",
      icon: "ti-layout-dashboard",
      body: "팀 현황을 한눈에 — 회의·태스크·기여도 핵심 지표가 여기 모여요.",
      placement: "bottom",
      accent: "green",
      advance: null,
      goto: `${base}/overview`,
    },
    {
      id: "dash-ov-contrib",
      target: "ov-contrib",
      title: "기여도 현황",
      icon: "ti-chart-bar",
      body: "팀원별 기여도 진행 상황이 실시간으로 표시돼요.",
      placement: "bottom",
      accent: "green",
      advance: null,
    },
    {
      id: "dash-ov-meeting",
      target: "ov-meeting",
      title: "예정된 회의",
      icon: "ti-calendar-event",
      body: "다음 회의 요약과 빠른 참여 버튼이 여기 있어요.",
      placement: "top",
      accent: "green",
      advance: null,
    },
    {
      id: "dash-ov-tasks",
      target: "ov-tasks",
      title: "할 일 한눈에",
      icon: "ti-checklist",
      body: "처리해야 할 미완료 태스크가 마감 임박순으로 모여요.",
      placement: "top",
      accent: "green",
      advance: null,
    },
    // ── 회의 관리(meeting) ──
    {
      id: "dash-meeting",
      target: "mt-sidebar",
      title: "회의 관리",
      icon: "ti-headset",
      body: "여기서 회의 목록과 진행 상태(진행 중·예정·완료)를 봐요.",
      placement: "right",
      accent: "blue",
      advance: null,
      goto: `${base}/meeting`,
    },
    {
      id: "dash-mt-new",
      target: "mt-new",
      title: "새 회의 만들기",
      icon: "ti-plus",
      body: "이 버튼으로 회의를 열면 발언 시간·출석이 자동 기록되고, 아젠다·발언 기록·출결·결정 사항·AI 요약 탭으로 진행·정리해요.",
      placement: "right",
      accent: "blue",
      advance: null,
    },
    // ── 태스크(tasks) ──
    {
      id: "dash-tasks",
      target: "tk-controls",
      title: "태스크",
      icon: "ti-checklist",
      body: "할 일을 보드/목록으로 관리해요. 위에서 보기와 필터를 바꿀 수 있어요.",
      placement: "bottom",
      accent: "violet",
      advance: null,
      goto: `${base}/tasks`,
    },
    {
      id: "dash-tk-views",
      target: "tk-views",
      title: "보기 전환",
      icon: "ti-layout-kanban",
      body: "칸반 보드와 목록 보기를 전환하고, 전체/내 태스크로 필터링할 수 있어요.",
      placement: "bottom",
      accent: "violet",
      advance: null,
    },
    {
      id: "dash-tk-drag",
      target: "tk-board",
      title: "드래그로 상태 변경",
      icon: "ti-drag-drop",
      body: "카드를 잡아 다른 칸(할 일·진행 중·완료)으로 끌어다 놓으면 상태가 바뀌어요. 아래처럼요!",
      placement: "top",
      accent: "violet",
      advance: null,
      optional: true, // 목록 뷰면 보드가 없으니 건너뛴다
      demo: "drag",
    },
    {
      id: "dash-tk-add",
      target: "tk-add",
      title: "태스크 추가",
      icon: "ti-plus",
      body: "여기서 태스크를 추가하고 담당자·마감일·난이도를 정해요.",
      placement: "bottom",
      accent: "violet",
      advance: null,
    },
    {
      id: "dash-tk-progress",
      target: "tk-progress",
      title: "전체 진행률",
      icon: "ti-progress",
      body: "팀 전체 태스크 완료율이 여기 표시돼요.",
      placement: "bottom",
      accent: "violet",
      advance: null,
    },
    // ── 기여도 리포트(report) ── 잠금/열림 상태에 따라 한쪽만 표시(즉시 전환)
    {
      id: "dash-report-lock",
      target: "rp-lock",
      title: "리포트는 잠금 상태예요",
      icon: "ti-lock",
      body: "정확한 측정을 위해 회의를 여러 번 진행하면 기여도 리포트가 자동으로 열려요. 지금은 준비 중이에요.",
      placement: "bottom",
      accent: "amber",
      advance: null,
      goto: `${base}/report`,
      optional: true,
      skipIfPresent: "rp-banner", // 이미 열려 있으면(배너 보임) 잠금 안내는 건너뛴다
    },
    {
      id: "dash-report",
      target: "rp-banner",
      title: "기여도 리포트",
      icon: "ti-chart-line",
      body: "회의·태스크가 자동 집계된 우리 팀 최종 기여도 리포트예요.",
      placement: "bottom",
      accent: "amber",
      advance: null,
      goto: `${base}/report`,
      optional: true, // 잠겨 있으면 타깃이 없으니 건너뜀
      skipIfPresent: "rp-lock", // 잠금 상태면(자물쇠 보임) 기능 단계는 즉시 건너뛴다
    },
    {
      id: "dash-rp-contrib",
      target: "rp-contrib",
      title: "팀원별 기여도",
      icon: "ti-users",
      body: "발언·출석·태스크로 나눈 기여도 점수와 세부 내역을 팀원별로 봐요.",
      placement: "top",
      accent: "amber",
      advance: null,
      optional: true,
      skipIfPresent: "rp-lock",
    },
    {
      id: "dash-rp-radar",
      target: "rp-radar",
      title: "기여도 레이더",
      icon: "ti-radar",
      body: "팀원마다 발언·출석·태스크 모양을 팀 평균(회색)과 비교하는 레이더예요.",
      placement: "right",
      accent: "amber",
      advance: null,
      optional: true,
      skipIfPresent: "rp-lock",
    },
    {
      id: "dash-rp-pdf",
      target: "rp-pdf",
      title: "PDF로 제출",
      icon: "ti-file-export",
      body: "리포트를 제출용 PDF로 저장할 수 있어요.",
      placement: "bottom",
      accent: "amber",
      advance: null,
      optional: true,
      skipIfPresent: "rp-lock",
    },
    // ── 팀 설정(settings) ──
    {
      id: "dash-settings",
      target: "st-info",
      title: "팀 설정",
      icon: "ti-settings",
      body: "팀 이름·과목 등 기본 정보를 관리해요.",
      placement: "bottom",
      accent: "coral",
      advance: null,
      goto: `${base}/settings`,
    },
    {
      id: "dash-st-invite",
      target: "st-invite",
      title: "팀원 초대",
      icon: "ti-key",
      body: "초대 코드를 공유하거나 재발급해 팀원을 더 합류시킬 수 있어요.",
      placement: "bottom",
      accent: "coral",
      advance: null,
    },
    {
      id: "dash-st-members",
      target: "st-members",
      title: "멤버 관리",
      icon: "ti-users-group",
      body: "팀원 목록과 역할을 보고, 팀장은 위임·내보내기를 할 수 있어요.",
      placement: "top",
      accent: "coral",
      advance: null,
    },
    {
      id: "dash-st-settings",
      target: "st-settings",
      title: "기여도 규칙",
      icon: "ti-adjustments",
      body: "공개 범위·무단결석 처리·마감 패널티·가중치를 팀에 맞게 조정해요.",
      placement: "top",
      accent: "coral",
      advance: null,
      optional: true, // 설정은 비동기 로드 후 렌더되므로 아직 없으면 건너뛴다
    },
    {
      id: "dash-st-danger",
      target: "st-danger",
      title: "위험 구역",
      icon: "ti-alert-triangle",
      body: "팀 나가기·삭제는 여기에서. 삭제는 되돌릴 수 없어요.",
      placement: "top",
      accent: "coral",
      advance: null,
    },
    // ── 마무리 ──
    {
      id: "dash-done",
      target: null,
      title: "대시보드 둘러보기 끝!",
      icon: "ti-confetti",
      body: "이제 팀플을 시작해보세요. 첫 회의부터 만들어볼까요?",
      placement: "bottom",
      accent: "pink",
      advance: null,
      goto: `${base}/overview`, // 투어가 끝나면 대시보드(개요) 화면으로 복귀
    },
  ];
}
