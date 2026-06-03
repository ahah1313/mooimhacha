# 04. API 명세

## REST 엔드포인트

### 인증 (Auth)

| 메서드 | 경로                | 설명                                  |
| ------ | ------------------- | ------------------------------------- |
| POST   | `/api/auth/kakao`   | 카카오 인가 코드로 로그인/회원가입    |
| PATCH  | `/api/auth/profile` | 신규 가입자 대학교·학과 등록          |
| POST   | `/api/auth/refresh` | refresh_token으로 access_token 재발급 |
| POST   | `/api/auth/logout`  | 토큰 무효화                           |

### 팀 / 멤버십 (Teams)

| 메서드 | 경로                             | 설명                         |
| ------ | -------------------------------- | ---------------------------- |
| GET    | `/api/teams`                     | 내가 속한 팀 목록            |
| POST   | `/api/teams`                     | 팀 생성 (생성자 자동 leader) |
| GET    | `/api/teams/:id`                 | 팀 상세 + 멤버 목록          |
| PATCH  | `/api/teams/:id`                 | 팀명·과목명 수정 (팀장만)    |
| POST   | `/api/teams/join`                | 초대 코드로 합류             |
| POST   | `/api/teams/:id/invite-code`     | 초대 코드 재발급 (팀장만)    |
| DELETE | `/api/teams/:id/members/:userId` | 탈퇴 또는 추방               |

### 팀 설정 (Team Settings)

| 메서드 | 경로                      | 설명                  |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/teams/:id/settings` | 기여도 산정 설정 조회 |
| PATCH  | `/api/teams/:id/settings` | 설정 수정 (팀장만)    |

### 마일스톤 (Milestones) — P1

| 메서드 | 경로                              | 설명                                     |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/teams/:id/milestones`       | 마일스톤 목록 (order 순)                 |
| POST   | `/api/teams/:id/milestones`       | 마일스톤 생성 (팀장만)                   |
| PATCH  | `/api/milestones/:id`             | 수정 (팀장만)                            |
| DELETE | `/api/milestones/:id`             | 삭제 (팀장만)                            |
| POST   | `/api/milestones/:id/recalculate` | 하위 안건 완료율로 progress_ratio 재계산 |

### 회의 (Meetings)

| 메서드 | 경로                      | 설명                                  |
| ------ | ------------------------- | ------------------------------------- |
| GET    | `/api/teams/:id/meetings` | 팀 회의 목록 (`?status=scheduled`)    |
| POST   | `/api/teams/:id/meetings` | 회의 생성                             |
| GET    | `/api/meetings/:id`       | 회의 상세 + 안건 + 결정               |
| PATCH  | `/api/meetings/:id`       | 회의 수정                             |
| DELETE | `/api/meetings/:id`       | 회의 삭제                             |
| POST   | `/api/meetings/:id/start` | T0 발행, status → ongoing             |
| POST   | `/api/meetings/:id/end`   | 종료, 회의 기여도(①) 계산·저장 트리거 |

### 안건 (Agendas)

| 메서드 | 경로                                 | 설명                                        |
| ------ | ------------------------------------ | ------------------------------------------- |
| GET    | `/api/meetings/:id/agendas`          | 안건 목록                                   |
| POST   | `/api/meetings/:id/agendas`          | 안건 생성                                   |
| PATCH  | `/api/agendas/:id`                   | 안건 수정                                   |
| DELETE | `/api/agendas/:id`                   | 안건 삭제                                   |
| POST   | `/api/agendas/:id/status`            | 상태 변경 (active 시 기존 active → pending) |
| POST   | `/api/meetings/:id/agendas/generate` | LLM 안건 자동 생성 (팀장만, 회의당 1회)     |

### 발화 (Utterances)

| 메서드 | 경로                           | 설명                                    |
| ------ | ------------------------------ | --------------------------------------- |
| POST   | `/api/utterances`              | 로컬 STT 완료 후 텍스트 전송 (오디오 X) |
| GET    | `/api/meetings/:id/utterances` | 회의 발화 목록 (`?agenda_id=`)          |

### 결정사항 (Decisions)

| 메서드 | 경로                          | 설명                            |
| ------ | ----------------------------- | ------------------------------- |
| GET    | `/api/meetings/:id/decisions` | 결정 목록                       |
| POST   | `/api/meetings/:id/decisions` | 결정 추가 (WebSocket broadcast) |
| PATCH  | `/api/decisions/:id`          | 내용 수정 또는 확정 처리        |
| DELETE | `/api/decisions/:id`          | 결정 삭제                       |

### 액션 아이템 (Action Items) — v4: 팀 단위, meeting_id 없음

| 메서드 | 경로                                 | 설명                                              |
| ------ | ------------------------------------ | ------------------------------------------------- |
| GET    | `/api/action-items`                  | 액션 목록 (`?team_id`, `?assignee_id`, `?status`) |
| POST   | `/api/action-items`                  | 액션 추가 (team_id 필수)                          |
| PATCH  | `/api/action-items/:id`              | 내용·상태·확정 수정                               |
| DELETE | `/api/action-items/:id`              | soft delete                                       |
| GET    | `/api/action-items/for-next-meeting` | is_for_next_meeting=true 미완료 액션 (`?team_id`) |

### 기여도 (Contributions)

기여도 4종 ([06](06-기여도-산정.md)):

| #   | 이름             | 범위         | 산출                                            | 엔드포인트                            |
| --- | ---------------- | ------------ | ----------------------------------------------- | ------------------------------------- |
| ①   | 회의 기여도      | user×meeting | 발언×0.6 + 참석×0.4 (저장값)                    | `GET /api/meetings/:id/contributions` |
| ②   | 회의 종합 기여도 | user×team    | Σ(meeting_score×회의시간)/Σ(회의시간)           | `GET /api/teams/:id/contributions`    |
| ③   | 테스크 기여도    | user×team    | (완료율+마감준수)/2 — `action_items`에서 라이브 | `GET /api/teams/:id/contributions`    |
| ④   | 종합 기여도      | user×team    | min(1.0, (③×w + ②×(1−w)) × (1+n))               | `GET /api/teams/:id/contributions`    |

| 메서드 | 경로                                          | 설명                                   |
| ------ | --------------------------------------------- | -------------------------------------- |
| GET    | `/api/meetings/:id/contributions`             | ① 회의 참여자별 meeting_score (저장값) |
| GET    | `/api/teams/:id/contributions`                | ②③④ 팀 멤버별 종합 기여도 (동적 계산)  |
| POST   | `/api/meetings/:id/contributions/recalculate` | 회의 기여도(①) 강제 재계산 (팀장만)    |

### 사유 결석 (Meeting Absences) — P1

| 메서드 | 경로                         | 설명             |
| ------ | ---------------------------- | ---------------- |
| GET    | `/api/meetings/:id/absences` | 사유 결석 목록   |
| POST   | `/api/meetings/:id/absences` | 결석 신청 (본인) |
| PATCH  | `/api/absences/:id/approve`  | 승인 (팀장만)    |
| DELETE | `/api/absences/:id`          | 삭제/거절        |

## WebSocket 이벤트

| 이벤트                                 | 방향            | 용도                                |
| -------------------------------------- | --------------- | ----------------------------------- |
| `meeting:join` / `meeting:leave`       | client → server | 회의 룸 입·퇴장                     |
| `meeting:t0`                           | server → client | 시각 동기화 기준점 broadcast        |
| `utterance:new`                        | client → server | 확정 발화(텍스트) 전송              |
| `contribution:update`                  | server → client | 기여도 갱신 (1초 디바운스)          |
| `agenda:status-change`                 | 양방향          | 안건 상태 변경 broadcast            |
| `agenda:summary`                       | server → client | 완료 안건의 LLM 요약 도착 broadcast |
| `decision:new` / `action:new`          | 양방향          | 결정·액션 추가 broadcast            |
| `user:speaking-start` / `speaking-end` | 양방향          | 발화 중 🎤 표시                     |

## 발화 전송 페이로드 (`utterance:new`)

- `utterance_id`, `text`, `char_count`
- `started_at_offset_ms`, `ended_at_offset_ms`
- `confidence` — Moonshine 추론 신뢰도 (산출 방식 검증 필요, [09](09-미결정-사항.md))
- 전송 시점: VAD가 발화 종료를 감지하고 Moonshine 추론이 완료된 직후 (발화 단위, 디바운스 없음)
- 전송 내용은 텍스트와 메타데이터뿐 — 오디오는 전송하지 않음
