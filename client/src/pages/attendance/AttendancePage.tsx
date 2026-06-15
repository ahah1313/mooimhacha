import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { MeetingAttendance, AttendanceMember, Meeting } from "@/lib/types";
import "@/styles/attendance.css";

const STATUS_LABEL: Record<string, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
  excused: "결석 인정",
};

export default function AttendancePage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const currentUser = useCurrentUser();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendance, setAttendance] = useState<MeetingAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!meetingId) return;
    Promise.all([
      apiGet<Meeting>(`/meetings/${meetingId}`),
      apiGet<MeetingAttendance>(`/meetings/${meetingId}/attendance`),
    ])
      .then(([m, att]) => {
        setMeeting(m);
        setAttendance(att);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const handleConsent = async (member: AttendanceMember) => {
    const absenceId = member.absence!.id;
    setPending((p) => new Set(p).add(absenceId));
    try {
      if (member.absence!.my_consent) {
        await apiDelete(`/absences/${absenceId}/consent`);
      } else {
        await apiPost(`/absences/${absenceId}/consent`);
      }
      const updated = await apiGet<MeetingAttendance>(
        `/meetings/${meetingId}/attendance`,
      );
      setAttendance(updated);
    } catch {
      // 실패 시 현 상태 유지
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(absenceId);
        return next;
      });
    }
  };

  if (loading) return <div className="att-loading">불러오는 중…</div>;
  if (error) return <div className="att-error">{error}</div>;
  if (!attendance || !meeting) return null;

  const dateStr = meeting.scheduled_at
    ? new Date(meeting.scheduled_at).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      })
    : "";

  return (
    <div className="att-page">
      <div className="att-header">
        <h1 className="att-header__topic">
          {meeting.topic ?? "제목 없는 회의"}
        </h1>
        {dateStr && <p className="att-header__date">{dateStr}</p>}
      </div>

      <p className="att-title">출결 현황</p>

      <ul className="att-list">
        {attendance.members.map((m) => {
          const isSelf = currentUser?.id === m.user_id;
          const absence = m.absence;
          const absenceId = absence?.id;
          const isPending = absenceId !== undefined && pending.has(absenceId);

          return (
            <li key={m.user_id} className="att-card">
              <div className="att-card__top">
                {m.profile_image_url ? (
                  <img
                    className="att-avatar"
                    src={m.profile_image_url}
                    alt={m.name}
                  />
                ) : (
                  <div className="att-avatar--placeholder">
                    {m.name.charAt(0)}
                  </div>
                )}
                <span className="att-card__name">
                  {m.name}
                  {isSelf && " (나)"}
                </span>
                <span className={`att-badge att-badge--${m.status}`}>
                  {STATUS_LABEL[m.status]}
                </span>
              </div>

              {m.status === "late" && m.late_minutes != null && (
                <p className="att-late-note">{m.late_minutes}분 지각</p>
              )}

              {(m.status === "absent" || m.status === "excused") && (
                <div className="att-absence">
                  <p className="att-absence__label">결석 사유</p>
                  {absence?.reason ? (
                    <p className="att-absence__reason">{absence.reason}</p>
                  ) : (
                    <p className="att-absence__no-reason">사유 미입력</p>
                  )}

                  {absence && absence.status === "approved" && (
                    <span className="att-approved-badge">✓ 동의 완료</span>
                  )}

                  {absence && absence.status === "pending" && !isSelf && (
                    <div className="att-consent-row">
                      <span className="att-consent-count">
                        동의 <strong>{absence.consent_count}</strong> /{" "}
                        {attendance.consent_required}명
                      </span>
                      <button
                        className={`att-btn ${absence.my_consent ? "att-btn--cancel" : "att-btn--consent"}`}
                        onClick={() => handleConsent(m)}
                        disabled={isPending}
                      >
                        {isPending
                          ? "처리 중…"
                          : absence.my_consent
                            ? "동의 취소"
                            : "동의"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
