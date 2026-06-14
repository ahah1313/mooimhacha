import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "@/lib/api";
import { openCompanion, createCompanionChannel } from "@/lib/companion";
import { useTeamStore } from "@/stores/teamStore";
import { useToast } from "@/hooks/useToast";
import NotificationBell from "@/components/NotificationBell";
import Modal from "@/components/Modal";
import HeadsetGateModal from "@/components/HeadsetGateModal";
import type { Team, Meeting, Decision, ActionItem } from "@/lib/types";
import "@/styles/live.css";

// 메인 탭의 실시간 회의 플로우 진입점.
// 팀 선택/생성/합류 → 회의 생성 → 시작(보조 창 열기) → 종료 후 리포트.
export default function MeetingLauncher() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const teamId = useTeamStore((s) => s.teamId);
  const setTeamId = useTeamStore((s) => s.setTeamId);
  const [teams, setTeams] = useState<Team[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddTeam, setShowAddTeam] = useState(false);
  // 초기 로드에만 사용 — 액션 후 재호출 시에는 깜빡임 방지를 위해 다시 세우지 않는다
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  // 이중 제출 방지용 busy 가드
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [joining, setJoining] = useState(false);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  // 팝업 차단으로 보조 창이 안 열린 회의 id
  const [blockedMeetingId, setBlockedMeetingId] = useState<number | null>(
    null,
  );
  // 회의 입장 전 헤드셋 권장 안내 — 대상 회의를 담으면 모달 노출, 확인 시 입장 진행
  const [headsetPrompt, setHeadsetPrompt] = useState<Meeting | null>(null);

  const [teamName, setTeamName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [meetingType, setMeetingType] = useState<
    "regular" | "partial" | "test"
  >("regular");
  // 회의 생성 모달 + 지난 회의 참고 (AI 안건 생성과 같은 소스: 직전 요약·결정·미해결 액션)
  const [showCreate, setShowCreate] = useState(false);
  const [prevRef, setPrevRef] = useState<{
    meeting: Meeting;
    decisions: Decision[];
    actions: ActionItem[];
  } | null>(null);
  const [prevRefLoading, setPrevRefLoading] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      // 서버(PR #6 계약)는 { teams: [...] } 형태로 반환한다
      const t = (await apiGet<{ teams: Team[] }>("/teams")).teams;
      setTeams(t);
      if (!useTeamStore.getState().teamId && t[0]) setTeamId(t[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const loadMeetings = useCallback(async (tid: number) => {
    try {
      setMeetings(await apiGet<Meeting[]>(`/meetings?team_id=${tid}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (teamId) void loadMeetings(teamId);
  }, [teamId, loadMeetings]);

  // 보조 창에서 회의가 종료되면 목록 갱신
  useEffect(() => {
    const ch = createCompanionChannel();
    ch.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; meeting_id?: number };
      if (msg.type === "meeting:ended" && msg.meeting_id) {
        if (teamId) void loadMeetings(teamId);
        // 회의가 끝나면 곧장 결과(리포트)로 데려간다 — 사용자가 찾아 헤매지 않도록
        navigate(`/meetings/${msg.meeting_id}/report`);
      }
    };
    return () => ch.close();
  }, [teamId, loadMeetings, navigate]);

  const createTeam = async () => {
    // course_name은 서버 CreateTeamDto 필수값 — 누락 시 400
    if (!teamName.trim() || !courseName.trim() || creatingTeam) return;
    setCreatingTeam(true);
    try {
      const team = await apiPost<Team & { id: number }>("/teams", {
        name: teamName.trim(),
        course_name: courseName.trim(),
      });
      setTeamName("");
      setCourseName("");
      setShowAddTeam(false);
      await loadTeams();
      setTeamId(team.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingTeam(false);
    }
  };

  const joinTeam = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.replace(/-/g, "").length < 4) {
      showToast("올바른 초대코드를 입력해 주세요", "error");
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      const team = await apiPost<{ id: number }>("/teams/join", {
        invite_code: code,
      });
      setJoinCode("");
      setShowAddTeam(false);
      showToast("그룹에 합류했습니다");
      await loadTeams();
      setTeamId(team.id);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setJoining(false);
    }
  };

  // 생성 모달 열기 — 직전 종료 회의의 요약·결정·미해결 액션을 참고용으로 로드
  const openCreate = () => {
    setShowCreate(true);
    const prev = [...meetings]
      .filter((m) => m.status === "ended")
      .sort(
        (a, b) =>
          new Date(b.scheduled_at).getTime() -
          new Date(a.scheduled_at).getTime(),
      )[0];
    if (!prev || !teamId) {
      setPrevRef(null);
      return;
    }
    setPrevRefLoading(true);
    Promise.all([
      apiGet<Decision[]>(`/decisions?meeting_id=${prev.id}`),
      apiGet<ActionItem[]>(`/action-items?team_id=${teamId}`),
    ])
      .then(([dec, act]) =>
        setPrevRef({
          meeting: prev,
          decisions: dec,
          actions: act.filter(
            (a) => a.status === "todo" || a.status === "in_progress",
          ),
        }),
      )
      // 참고 로드 실패는 치명적이지 않음 — 회의 자체는 그대로 만들 수 있게 한다
      .catch(() => setPrevRef({ meeting: prev, decisions: [], actions: [] }))
      .finally(() => setPrevRefLoading(false));
  };

  const createMeeting = async () => {
    if (!teamId || creatingMeeting) return;
    setCreatingMeeting(true);
    try {
      await apiPost<Meeting>("/meetings", {
        team_id: teamId,
        scheduled_at: new Date().toISOString(),
        total_minutes: minutes,
        topic: topic.trim() || undefined,
        meeting_type: meetingType,
      });
      setTopic("");
      setShowCreate(false);
      await loadMeetings(teamId);
      showToast('회의가 만들어졌어요. 목록에서 "시작"을 누르세요');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingMeeting(false);
    }
  };

  const startMeeting = async (m: Meeting) => {
    if (!teamId) return;
    try {
      if (m.status === "scheduled") {
        await apiPost(`/meetings/${m.id}/start`);
      }
      const win = openCompanion(m.id, teamId);
      // Electron 경로는 의도적으로 null을 반환하므로 브라우저에서만 차단 판정
      if (!window.mooimhacha?.isElectron && win === null) {
        setBlockedMeetingId(m.id);
      } else {
        setBlockedMeetingId(null);
      }
      await loadMeetings(teamId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // 팝업 차단 후 재시도 — 클릭 핸들러에서 동기 호출이라 새 user gesture 로 열린다
  const reopenCompanion = (m: Meeting) => {
    if (!teamId) return;
    const win = openCompanion(m.id, teamId);
    if (window.mooimhacha?.isElectron || win !== null) {
      setBlockedMeetingId(null);
    }
  };

  return (
    <>
    <div className="live-topbar">
      <div className="live-row" style={{ gap: 10 }}>
        <button
          className="live-btn live-btn--ghost"
          onClick={() => navigate("/home")}
        >
          ← 내 그룹으로
        </button>
        <span className="live-topbar__title">무임하차</span>
      </div>
      <NotificationBell />
    </div>
    <div className="live">
      <h1>실시간 회의</h1>
      <p className="live-sub">
        회의를 시작하면 작은 회의 창이 따로 열려요. 회의 자료 옆에 띄워 두고 쓰면
        편해요.
      </p>

      {/* 그룹 */}
      <div className="live-card">
        <h2>그룹</h2>
        {teamsLoading ? (
          <p className="live-sub">불러오는 중…</p>
        ) : (
          <>
        {teams.length > 0 ? (
          <div className="live-row">
            <select
              value={teamId ?? ""}
              onChange={(e) => setTeamId(Number(e.target.value))}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="live-sub">
            아직 참여한 그룹이 없어요. 새 그룹을 만들거나 초대코드로 합류해보세요.
          </p>
        )}

        {teams.length > 0 && !showAddTeam ? (
          <button
            className="live-btn live-btn--ghost"
            style={{ marginTop: 12 }}
            onClick={() => setShowAddTeam(true)}
          >
            + 다른 그룹 추가
          </button>
        ) : (
          <div className="live-row" style={{ marginTop: 12 }}>
            <input
              placeholder="새 그룹 이름 (예: 캡스톤 B조)"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <input
              placeholder="과목명 (예: 클라우드 컴퓨팅)"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
            <button
              className="live-btn"
              disabled={creatingTeam}
              onClick={createTeam}
            >
              {creatingTeam ? "만드는 중…" : "그룹 만들기"}
            </button>
            <input
              placeholder="초대 코드 8자리"
              maxLength={8}
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value
                    .replace(/[^A-Za-z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 8),
                )
              }
            />
            <button
              className="live-btn live-btn--ghost"
              disabled={joining}
              onClick={joinTeam}
            >
              {joining ? "참가 중…" : "참가"}
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* 회의 목록 */}
      {teamId && (
        <div className="live-card">
          <div className="live-row" style={{ justifyContent: "space-between" }}>
            <h2>회의 목록</h2>
            <button className="live-btn" onClick={openCreate}>
              + 새 회의
            </button>
          </div>
          {meetingsLoading ? (
            <p className="live-sub">불러오는 중…</p>
          ) : (
            meetings.length === 0 && (
              <p className="live-sub">
                아직 만든 회의가 없어요. ‘새 회의’를 누르면 첫 회의를 시작할 수
                있어요.
              </p>
            )
          )}
          {meetings.map((m) => (
            <Fragment key={m.id}>
              <div className="live-meeting">
                <div className="live-meeting__info">
                  <strong>{m.topic ?? "제목 없는 회의"}</strong>
                  <span>
                    {new Date(m.scheduled_at).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {m.total_minutes}분
                  </span>
                </div>
                {m.meeting_type !== "regular" && (
                  <span className="live-badge">
                    {m.meeting_type === "partial" ? "부분" : "테스트"}
                  </span>
                )}
                <span className={`live-badge live-badge--${m.status}`}>
                  {m.status === "active"
                    ? "진행 중"
                    : m.status === "ended"
                      ? "완료"
                      : "예정"}
                </span>
                {m.status === "ended" ? (
                  <button
                    className="live-btn live-btn--ghost"
                    onClick={() => navigate(`/meetings/${m.id}/report`)}
                  >
                    리포트
                  </button>
                ) : (
                  <button className="live-btn" onClick={() => setHeadsetPrompt(m)}>
                    {m.status === "active" ? "회의 창 다시 열기" : "회의 시작"}
                  </button>
                )}
              </div>
              {blockedMeetingId === m.id && (
                <p className="live-error" style={{ marginTop: 0 }}>
                  브라우저가 팝업을 차단했어요 — 주소창의 팝업 허용 후 다시 열어
                  주세요{" "}
                  <button
                    className="live-btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => reopenCompanion(m)}
                  >
                    다시 열기
                  </button>
                </p>
              )}
            </Fragment>
          ))}
        </div>
      )}

      {error && <p className="live-error">{error}</p>}

      {/* 회의 입장 전 헤드셋 권장 안내 — 보조 창을 열기 전에 띄우고, 확인 시 입장 진행 */}
      {headsetPrompt && (
        <HeadsetGateModal
          confirmLabel="확인하고 입장"
          onClose={() => setHeadsetPrompt(null)}
          onConfirm={() => {
            const m = headsetPrompt;
            setHeadsetPrompt(null);
            startMeeting(m);
          }}
        />
      )}

      {/* 회의 생성 모달 — 지난 회의 내용을 참고하며 안건·주제를 정할 수 있게 */}
      {showCreate && (
        <Modal
          title="새 회의"
          onClose={() => setShowCreate(false)}
          actions={
            <>
              <button className="btn" onClick={() => setShowCreate(false)}>
                취소
              </button>
              <button
                className="btn btn-primary"
                disabled={creatingMeeting}
                onClick={createMeeting}
              >
                {creatingMeeting ? "만드는 중…" : "회의 생성"}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">주제 (선택)</label>
            <input
              className="input"
              placeholder="예) 중간 발표 준비"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="live-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">시간 (분)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">유형</label>
              <select
                className="input"
                value={meetingType}
                onChange={(e) =>
                  setMeetingType(
                    e.target.value as "regular" | "partial" | "test",
                  )
                }
              >
                <option value="regular">정규</option>
                <option value="partial">부분 (누적 제외)</option>
                <option value="test">테스트 (누적 제외)</option>
              </select>
            </div>
          </div>
          {meetingType !== "regular" && (
            <p className="live-sub" style={{ marginTop: 0 }}>
              부분·테스트 회의는 팀 종합 기여도 집계에 들어가지 않아요.
            </p>
          )}
          <div className="field">
            <label className="field-label">지난 회의 참고</label>
            {prevRefLoading ? (
              <p className="live-sub">불러오는 중…</p>
            ) : prevRef ? (
              <div className="live-prev-ref">
                <strong>
                  {prevRef.meeting.topic ?? "제목 없는 회의"}
                  <span>
                    {" · "}
                    {new Date(prevRef.meeting.scheduled_at).toLocaleDateString(
                      "ko-KR",
                      { month: "numeric", day: "numeric" },
                    )}
                  </span>
                </strong>
                <p>{prevRef.meeting.summary ?? "요약이 아직 없어요."}</p>
                {prevRef.decisions.length > 0 && (
                  <>
                    <em>결정사항</em>
                    <ul>
                      {prevRef.decisions.map((d) => (
                        <li key={d.id}>{d.content}</li>
                      ))}
                    </ul>
                  </>
                )}
                {prevRef.actions.length > 0 && (
                  <>
                    <em>미해결 액션</em>
                    <ul>
                      {prevRef.actions.map((a) => (
                        <li key={a.id}>{a.description}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <p className="live-sub" style={{ marginBottom: 0 }}>
                아직 끝난 회의가 없어요 — 첫 회의예요!
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
    </>
  );
}
