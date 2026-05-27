# UI 화면 구현 스펙 — 무임하차 클라이언트

## 목표

`design/무임하차.html` 목업을 Electron + Vite + React + TypeScript로 4개 화면 구현.

## 기술 스택

- Electron 33 + Vite 5 + React 18 + TypeScript 5
- CSS: HTML 목업 CSS 그대로 포팅 (Tailwind 미사용)
- 상태 관리: React local state (백엔드 연결 없음, 목업 데이터)
- 라우팅: 단순 상태 기반 (`currentScreen` state)

## 화면 목록

| 화면 | ID | 주요 컴포넌트 |
|---|---|---|
| 로그인 | `login` | 좌우 분할, 카카오 버튼 |
| 온보딩 | `onboard` | 3단계 마법사 (그룹 생성 → 초대 → 완료) |
| 홈 | `home` | 상단 nav + 그룹 그리드 + 태스크 + 활동 + 예정 회의 |
| 대시보드 | `dashboard` | 사이드바 + 4개 탭 (대시 / 회의 / 태스크 / 기여도) |

## 파일 구조

```
client/src/
  index.css                   ← CSS 변수 + 공통 컴포넌트 (HTML → 그대로 이식)
  App.tsx                     ← 앱 셸 (타이틀바 + 다크모드 + 화면 라우팅)
  screens/
    LoginScreen.tsx + login.css
    OnboardingScreen.tsx + onboarding.css
    HomeScreen.tsx + home.css
    DashboardScreen.tsx + dashboard.css
```

## 핵심 결정

- **라우팅**: `type Screen = 'login' | 'onboard' | 'home' | 'dashboard'`
- **다크모드**: `data-theme` attribute → `document.documentElement`에 적용
- **목업 데이터**: 인라인 상수 (실제 API 연결은 이후 단계)
- **인터랙션**: HTML `onclick` → React 이벤트 핸들러 1:1 변환
- **애니메이션**: HTML CSS 키프레임 그대로 이식

## 구현 순서

1. `index.css` — CSS 전체 이식 (변수, 공통, 그레인 오버레이)
2. `App.tsx` — 앱 셸 + 타이틀바 + 라우팅
3. `LoginScreen` — 화면 1
4. `OnboardingScreen` — 화면 2 (3단계)
5. `HomeScreen` — 화면 3
6. `DashboardScreen` — 화면 4 (가장 복잡)
