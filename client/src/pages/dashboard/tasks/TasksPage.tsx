import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { todayStr, timeMinForDate } from "@/lib/dateUtils";
import { useToast } from "@/hooks/useToast";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { ActionItem, TeamContribution, TaskExtension } from "@/lib/types";
import type { TeamContext } from "../DashboardPage";

type Status = "할 일" | "진행 중" | "완료";

const STATUS_TO_API: Record<Status, ActionItem["status"]> = {
  "할 일": "todo",
  "진행 중": "in_progress",
  완료: "done",
};
const API_TO_STATUS: Record<string, Status> = {
  todo: "할 일",
  in_progress: "진행 중",
  done: "완료",
};

const STATUS_COLS: Status[] = ["할 일", "진행 중", "완료"];
const COL_COLOR = {
  "할 일": "var(--text-soft)",
  "진행 중": "var(--blue)",
  완료: "var(--green)",
};
const COL_BADGE = { "할 일": "", "진행 중": "b-blue", 완료: "b-green" };

function dueState(due: string | null): {
  danger: boolean;
  warn: boolean;
  label: string;
  timeLabel: string;
  dDay: string;
} {
  if (!due)
    return { danger: false, warn: false, label: "", timeLabel: "", dDay: "" };
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(d);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const label = `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
  const timeLabel = fmtTime(d);
  const dDay = diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`;
  return {
    danger: diff <= 0,
    warn: diff >= 1 && diff <= 3,
    label,
    timeLabel,
    dDay,
  };
}

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 || 12;
  return `${ampm} ${h12}:${String(m).padStart(2, "0")}`;
}

function fmtCompleted(iso: string): string {
  const d = new Date(iso);
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]}) ${fmtTime(d)}`;
}

// Date → datetime-local input 값 ("YYYY-MM-DDTHH:mm")
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DIFF_CHIPS = [
  { value: 1, label: "★ 낮음" },
  { value: 2, label: "★★ 보통" },
  { value: 3, label: "★★★ 높음" },
] as const;

const STATUS_CHIP_CLS: Record<Status, string> = {
  "할 일": "chip-todo",
  "진행 중": "chip-inprog",
  완료: "chip-done",
};

export default function TasksPage() {
  const { showToast } = useToast();
  const team = useOutletContext<TeamContext | null>();
  const currentUser = getUser();
  const [view, setView] = useState<"board" | "list">("board");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [tasks, setTasks] = useState<ActionItem[]>([]);
  const [members, setMembers] = useState<TeamContribution[]>([]);

  // 추가 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newDue, setNewDue] = useState(todayStr());
  const [newTime, setNewTime] = useState("");
  const [newStatus, setNewStatus] = useState<Status>("할 일");
  const [newDifficulty, setNewDifficulty] = useState(2);

  // 수정 모달
  const [editTarget, setEditTarget] = useState<ActionItem | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDifficulty, setEditDifficulty] = useState(2);
  const [editReason, setEditReason] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [pendingRequestBody, setPendingRequestBody] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [statusChangePending, setStatusChangePending] = useState<{
    task: ActionItem;
    newStatus: Status;
  } | null>(null);

  // 드래그 앤 드롭
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);

  // 카카오 공유 배치
  const [shareBatches, setShareBatches] = useState<
    { title: string; desc: string; img: string }[][]
  >([]);
  const [shareBatchIdx, setShareBatchIdx] = useState(0);
  const [shareTitle, setShareTitle] = useState("");

  // 기한 연장: 태스크별 최신 요청 (action_item_id → 요청)
  const [extensions, setExtensions] = useState<Map<number, TaskExtension>>(
    new Map(),
  );
  const [viewingExt, setViewingExt] = useState<TaskExtension | null>(null);

  // 팀의 연장 요청 로드 — 태스크별 최신 1건만 (list는 created_at DESC)
  const loadExtensions = useCallback(async () => {
    if (!team) return;
    try {
      const list = await apiGet<TaskExtension[]>(
        `/teams/${team.id}/extensions`,
      );
      const byTask = new Map<number, TaskExtension>();
      for (const e of list) {
        if (!byTask.has(e.action_item_id)) byTask.set(e.action_item_id, e);
      }
      setExtensions(byTask);
    } catch {
      /* 부가 정보 — 실패는 조용히 무시 */
    }
  }, [team]);

  const load = useCallback(async () => {
    if (!team) return;
    try {
      const [ts, cs] = await Promise.all([
        apiGet<ActionItem[]>(`/action-items?team_id=${team.id}&confirmed=true`),
        apiGet<{ members: TeamContribution[] }>(
          `/teams/${team.id}/contributions`,
        ),
      ]);
      setTasks(ts.filter((t) => t.status !== "cancelled"));
      setMembers(cs.members);
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }, [team, showToast]);

  useEffect(() => {
    void load();
    void loadExtensions();
  }, [load, loadExtensions]);

  async function approveExt(extId: number) {
    try {
      await apiPost(`/extensions/${extId}/approve`);
      await Promise.all([load(), loadExtensions()]);
      showToast("연장을 수락했습니다");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function rejectExt(extId: number) {
    try {
      await apiPost(`/extensions/${extId}/reject`);
      await loadExtensions();
      showToast("연장을 거절했습니다");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  // 태스크 카드 인라인 연장 영역 — board/list 공용
  function renderExtension(t: ActionItem) {
    const status = API_TO_STATUS[t.status];
    const dd = dueState(t.due_date);
    const overdue = status !== "완료" && dd.danger;
    const ext = extensions.get(t.id);
    const isLeader = team?.my_role === "leader";
    const isMine = t.assignee_id === currentUser?.id;

    if (ext?.status === "pending") {
      const isDelete = ext.type === "delete";
      const parts: string[] = [];
      if (!isDelete) {
        if (ext.requested_description) parts.push("이름");
        if (ext.requested_difficulty != null) parts.push("난이도");
        if (ext.requested_assignee_id != null) parts.push("담당자");
        if (ext.requested_due_date) parts.push("마감일");
      }
      const leaderActions = (
        <span className="tc-ext-acts">
          <button
            className="tc-ext-reason-btn"
            onClick={(e) => {
              e.stopPropagation();
              setViewingExt(ext);
            }}
            title="사유 보기"
          >
            <i className="ti ti-message-circle" /> 사유 확인
          </button>
          <button className="tc-ext-ok" onClick={() => void approveExt(ext.id)}>
            수락
          </button>
          <button className="tc-ext-no" onClick={() => void rejectExt(ext.id)}>
            거절
          </button>
        </span>
      );
      return (
        <div className="tc-ext" onClick={(e) => e.stopPropagation()}>
          {isDelete ? (
            <span className="tc-ext-label" style={{ color: "var(--coral)" }}>
              <i className="ti ti-trash" /> 삭제 요청 중…
            </span>
          ) : (
            <span className="tc-ext-label">
              <i className="ti ti-clock-hour-4" />
              {parts.map((p) => (
                <span key={p} className="tc-ext-field-badge">
                  {p}
                </span>
              ))}{" "}
              변경 요청 중…
            </span>
          )}
          {isLeader ? (
            leaderActions
          ) : (
            <span className="tc-ext-wait">대기 중</span>
          )}
        </div>
      );
    }
    if (ext?.status === "rejected" && (overdue || isMine)) {
      const isDelete = ext.type === "delete";
      return (
        <span className="tc-ext-label" style={{ color: "var(--coral)" }}>
          <i className="ti ti-x" /> {isDelete ? "삭제 거절됨" : "수정 거절됨"} ·
          카드를 눌러 재요청
        </span>
      );
    }
    return null;
  }

  const nameOf = (id: number | null) =>
    members.find((m) => m.user_id === id)?.name ?? "미지정";
  const avOf = (id: number | null) => {
    const i = members.findIndex((m) => m.user_id === id);
    return `a${((i < 0 ? 0 : i) % 4) + 1}`;
  };
  const MEMBER_STRIPE = [
    "var(--green)",
    "var(--blue)",
    "var(--pink)",
    "var(--amber)",
  ];
  const colorOf = (id: number | null) => {
    const i = members.findIndex((m) => m.user_id === id);
    return i < 0 ? null : MEMBER_STRIPE[i % 4];
  };
  const stripeStyle = (
    assigneeId: number | null,
    danger: boolean,
    warn: boolean,
  ) => {
    if (danger || warn) return undefined;
    const c = colorOf(assigneeId);
    return c ? { borderLeft: `3px solid ${c}` } : undefined;
  };

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;

  // 마감일 오름차순, 동일 날짜면 난이도 내림차순(높은 것 먼저)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.due_date && b.due_date) {
      const diff =
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (diff !== 0) return diff;
    } else if (a.due_date) return -1;
    else if (b.due_date) return 1;
    return (b.difficulty ?? 1) - (a.difficulty ?? 1);
  });
  const filteredTasks =
    filter === "mine"
      ? sortedTasks.filter((t) => t.assignee_id === currentUser?.id)
      : sortedTasks;

  useEffect(() => {
    requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>(".prog-fill[data-w]")
        .forEach((b) => {
          b.style.width = b.dataset.w + "%";
        });
    });
  }, [done, total]);

  const canEdit = (t: ActionItem) =>
    !t.assignee_id || t.assignee_id === currentUser?.id;

  function openEdit(task: ActionItem) {
    setEditTarget(task);
    setEditDesc(task.description);
    setEditDetail(task.detail ?? "");
    setEditAssignee(task.assignee_id ? String(task.assignee_id) : "");
    if (task.due_date) {
      const dt = new Date(task.due_date);
      setEditDue(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
      );
      setEditTime(
        `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
      );
    } else {
      setEditDue("");
      setEditTime("");
    }
    setEditDifficulty(task.difficulty ?? 2);
    setEditReason("");
  }

  async function submitChangeRequest() {
    if (!editTarget || editSaving) return;

    const body: Record<string, unknown> = {};
    let hasChange = false;

    if (editDesc.trim() !== editTarget.description) {
      if (!editDesc.trim()) {
        showToast("태스크 이름을 입력해 주세요", "error");
        return;
      }
      body.requested_description = editDesc.trim();
      hasChange = true;
    }

    const newDiff = editDifficulty;
    if (newDiff !== (editTarget.difficulty ?? 2)) {
      body.requested_difficulty = newDiff;
      hasChange = true;
    }

    const newAssigneeId = editAssignee ? Number(editAssignee) : null;
    if (newAssigneeId !== (editTarget.assignee_id ?? null)) {
      body.requested_assignee_id = newAssigneeId === null ? -1 : newAssigneeId;
      hasChange = true;
    }

    const newDue = editDue
      ? new Date(`${editDue}T${editTime || "23:59"}`)
      : null;
    const origDue = editTarget.due_date ? new Date(editTarget.due_date) : null;
    if ((newDue?.getTime() ?? null) !== (origDue?.getTime() ?? null)) {
      if (newDue) body.requested_due_date = newDue.toISOString();
      hasChange = true;
    }

    // 세부사항은 점수에 영향 없는 메모 → 승인 없이 즉시 반영
    const detailChanged = editDetail.trim() !== (editTarget.detail ?? "");

    if (!hasChange && !detailChanged) {
      showToast("변경된 항목이 없습니다", "error");
      return;
    }
    // 점수에 영향 주는 변경(이름·난이도·담당자·마감일)만 팀장 승인 필요
    if (hasChange && !editReason.trim()) {
      showToast("수정 사유를 입력해 주세요", "error");
      return;
    }

    if (detailChanged) {
      const nextDetail = editDetail.trim() || null;
      try {
        await apiPatch(`/action-items/${editTarget.id}`, {
          detail: nextDetail,
        });
        setTasks((ts) =>
          ts.map((t) =>
            t.id === editTarget.id ? { ...t, detail: nextDetail } : t,
          ),
        );
      } catch (e) {
        showToast((e as Error).message, "error");
        return;
      }
    }

    if (hasChange) {
      body.reason = editReason.trim();
      if (extensions.get(editTarget.id)?.status === "pending") {
        setPendingRequestBody(body);
        setConfirmOverwrite(true);
        return;
      }
      await doSendRequest(editTarget.id, body);
      return;
    }

    // 세부사항만 변경된 경우 — 즉시 반영 후 종료
    setEditTarget(null);
    showToast("세부사항을 수정했어요");
  }

  async function doSendRequest(taskId: number, body: Record<string, unknown>) {
    setEditSaving(true);
    try {
      await apiPost(`/action-items/${taskId}/extension`, body);
      setEditTarget(null);
      setConfirmOverwrite(false);
      setPendingRequestBody(null);
      await loadExtensions();
      showToast("수정 요청을 보냈어요. 팀장 승인을 기다려 주세요");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setEditSaving(false);
    }
  }

  async function requestDeletion() {
    if (!editTarget || deleting) return;
    if (!deleteReason.trim()) {
      showToast("삭제 사유를 입력해 주세요", "error");
      return;
    }
    setDeleting(true);
    try {
      await apiPost(`/action-items/${editTarget.id}/extension`, {
        type: "delete",
        reason: deleteReason.trim(),
      });
      setConfirmDelete(false);
      setDeleteReason("");
      setEditTarget(null);
      await loadExtensions();
      showToast("삭제 요청을 보냈어요. 팀장 승인을 기다려 주세요");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  async function changeStatus(task: ActionItem, status: Status) {
    const prev = tasks;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === task.id ? { ...t, status: STATUS_TO_API[status] } : t,
      ),
    );
    try {
      await apiPatch(`/action-items/${task.id}`, {
        status: STATUS_TO_API[status],
      });
    } catch (e) {
      setTasks(prev);
      showToast((e as Error).message, "error");
    }
  }

  function requestStatusChange(task: ActionItem, newStatus: Status) {
    if (task.status === "done") {
      setStatusChangePending({ task, newStatus });
    } else {
      void changeStatus(task, newStatus);
    }
  }

  function toggleList(task: ActionItem) {
    requestStatusChange(task, task.status === "done" ? "할 일" : "완료");
  }

  function shareTaskStatus() {
    if (!team) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayExpiring = tasks.filter((t) => {
      if (t.status === "done" || !t.due_date) return false;
      const dueDay = new Date(t.due_date);
      dueDay.setHours(0, 0, 0, 0);
      return dueDay >= today && dueDay < tomorrow;
    });

    const overdue = tasks.filter((t) => {
      if (t.status === "done" || !t.due_date) return false;
      const dueDay = new Date(t.due_date);
      dueDay.setHours(0, 0, 0, 0);
      return dueDay < today;
    });

    if (todayExpiring.length === 0 && overdue.length === 0) {
      showToast("공유할 내용이 없습니다.");
      return;
    }

    if (!window.Kakao?.isInitialized()) {
      showToast("카카오 SDK가 초기화되지 않았습니다.", "error");
      return;
    }

    const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${DAYS[now.getDay()]})`;

    const origin = window.location.origin;
    const IMG_DONE = `${origin}/icon-done.png`;
    const IMG_WARN = `${origin}/icon-warning.png`;

    const items: { title: string; desc: string; img: string }[] = [
      ...todayExpiring.map((t) => ({
        title: `🔔 ${t.description}`,
        desc: `오늘 마감 · ${nameOf(t.assignee_id)}`,
        img: IMG_DONE,
      })),
      ...overdue.map((t) => {
        const dueDay = new Date(t.due_date!);
        dueDay.setHours(0, 0, 0, 0);
        const days = Math.round(
          (today.getTime() - dueDay.getTime()) / 86400000,
        );
        return {
          title: `⚠️ ${t.description}`,
          desc: `D+${days} · ${nameOf(t.assignee_id)}`,
          img: IMG_WARN,
        };
      }),
    ];

    const batches: { title: string; desc: string; img: string }[][] = [];
    for (let i = 0; i < items.length; i += 5) {
      batches.push(items.slice(i, i + 5));
    }

    setShareTitle(`태스크 현황 (${dateStr})`);
    setShareBatches(batches);
    setShareBatchIdx(0);
  }

  function sendCurrentBatch() {
    const batch = shareBatches[shareBatchIdx];
    if (!batch) return;

    const templateArgs: Record<string, string> = { title: shareTitle };
    for (let i = 0; i < 5; i++) {
      templateArgs[`t${i + 1}`] = batch[i]?.title ?? "";
      templateArgs[`d${i + 1}`] = batch[i]?.desc ?? "";
      templateArgs[`img${i + 1}`] = batch[i]?.img ?? "";
    }

    window.Kakao.Share.sendCustom({ templateId: 134415, templateArgs });

    if (shareBatchIdx + 1 >= shareBatches.length) {
      setShareBatches([]);
    } else {
      setShareBatchIdx(shareBatchIdx + 1);
    }
  }

  async function addTask() {
    if (!team || saving) return;
    if (!newDesc.trim()) {
      showToast("태스크 이름을 입력해 주세요", "error");
      return;
    }
    if (newDue && newTime) {
      if (new Date(`${newDue}T${newTime}`) <= new Date()) {
        showToast("현재 시각 이후로 설정해 주세요", "error");
        return;
      }
    }
    setSaving(true);
    try {
      await apiPost("/action-items", {
        team_id: team.id,
        description: newDesc.trim(),
        detail: newDetail.trim() || undefined,
        assignee_id: newAssignee ? Number(newAssignee) : undefined,
        due_date: newDue
          ? new Date(`${newDue}T${newTime || "23:59"}`).toISOString()
          : undefined,
        status: STATUS_TO_API[newStatus],
        difficulty: newDifficulty,
      });
      setModalOpen(false);
      setNewDesc("");
      setNewDetail("");
      setNewAssignee("");
      setNewDue(todayStr());
      setNewTime("");
      setNewStatus("할 일");
      setNewDifficulty(2);
      showToast("태스크가 추가되었습니다");
      await load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="task-top">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="view-toggle">
            <button
              className={`vt ${view === "board" ? "active" : ""}`}
              onClick={() => setView("board")}
            >
              <i className="ti ti-layout-columns" /> 보드
            </button>
            <button
              className={`vt ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
            >
              <i className="ti ti-list" /> 목록
            </button>
          </div>
          <div className="view-toggle">
            <button
              className={`vt ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              전체
            </button>
            <button
              className={`vt ${filter === "mine" ? "active" : ""}`}
              onClick={() => setFilter("mine")}
            >
              내 태스크
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {team?.my_role === "leader" && (
            <button className="btn btn-sm" onClick={shareTaskStatus}>
              <i className="ti ti-share" /> 공유하기
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setModalOpen(true)}
          >
            <i className="ti ti-plus" /> 태스크 추가
          </button>
        </div>
      </div>

      <div className="prog-strip">
        <span className="lbl">전체 진행률</span>
        <div className="prog-bg">
          <div
            className="prog-fill"
            data-w={total ? Math.round((done / total) * 100) : 0}
          />
        </div>
        <span className="num">
          {done} / {total} 완료
        </span>
      </div>

      {/* 보드 뷰 */}
      {view === "board" && (
        <div className="board">
          {STATUS_COLS.map((col) => {
            const colTasks = filteredTasks.filter(
              (t) => API_TO_STATUS[t.status] === col,
            );
            return (
              <div
                key={col}
                className={`board-col ${dragOverCol === col ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  setDraggingId(null);
                  const id = Number(e.dataTransfer.getData("taskId"));
                  const task = tasks.find((t) => t.id === id);
                  if (
                    task &&
                    canEdit(task) &&
                    API_TO_STATUS[task.status] !== col
                  ) {
                    requestStatusChange(task, col);
                  }
                }}
              >
                <div className="col-head">
                  <span
                    className="col-dot"
                    style={{ background: COL_COLOR[col] }}
                  />
                  <span className="col-title">{col}</span>
                  <span
                    className="col-cnt"
                    style={
                      col !== "할 일"
                        ? {
                            background: `var(--${col === "진행 중" ? "blue" : "green"}-soft)`,
                            color: COL_COLOR[col],
                          }
                        : undefined
                    }
                  >
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.map((t) => {
                  const status = API_TO_STATUS[t.status];
                  const dd = dueState(t.due_date);
                  const danger = status !== "완료" && dd.danger;
                  const warn = status !== "완료" && dd.warn;
                  const who = nameOf(t.assignee_id);
                  return (
                    <div
                      key={t.id}
                      draggable={canEdit(t)}
                      className={`tcard ${danger ? "danger" : ""} ${warn ? "warn" : ""} ${status === "완료" ? "done-card" : ""} ${draggingId === t.id ? "dragging" : ""}`}
                      style={{
                        cursor: canEdit(t)
                          ? draggingId === t.id
                            ? "grabbing"
                            : "grab"
                          : "default",
                        ...stripeStyle(t.assignee_id, danger, warn),
                      }}
                      onDragStart={(e) => {
                        if (!canEdit(t)) return;
                        setDraggingId(t.id);
                        e.dataTransfer.setData("taskId", String(t.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => canEdit(t) && openEdit(t)}
                    >
                      <div className="tc-head">
                        <div
                          className={`tc-title ${status === "완료" ? "done" : ""}`}
                        >
                          {t.description}
                        </div>
                        <span className="tc-diff">
                          {"★".repeat(t.difficulty ?? 1)}
                          <span className="tc-diff-off">
                            {"★".repeat(3 - (t.difficulty ?? 1))}
                          </span>
                        </span>
                      </div>
                      {t.detail && <div className="tc-detail">{t.detail}</div>}
                      <div className="tc-foot">
                        <span className="tc-who">
                          <span
                            className={`av ${avOf(t.assignee_id)} av-sm`}
                            style={{ width: 20, height: 20, fontSize: 9 }}
                          >
                            {who[0]}
                          </span>
                          {who}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 2,
                          }}
                        >
                          {dd.label && (
                            <div
                              className="tc-due"
                              style={{
                                color: danger
                                  ? "var(--coral)"
                                  : warn
                                    ? "var(--amber)"
                                    : "var(--text-soft)",
                              }}
                            >
                              <i className="ti ti-calendar" />
                              {dd.label}
                              {dd.timeLabel && (
                                <span
                                  style={{ fontWeight: 500, marginLeft: 2 }}
                                >
                                  {dd.timeLabel}
                                </span>
                              )}
                              {dd.dDay && (
                                <span
                                  style={{ fontWeight: 700, marginLeft: 4 }}
                                >
                                  {dd.dDay}
                                </span>
                              )}
                            </div>
                          )}
                          {status === "완료" && t.completed_at && (
                            <div
                              className="tc-due"
                              style={{ color: "var(--green)" }}
                            >
                              <i className="ti ti-check" />
                              {fmtCompleted(t.completed_at)} 완료
                              {t.due_date &&
                                new Date(t.completed_at) >
                                  new Date(t.due_date) && (
                                  <span
                                    style={{
                                      marginLeft: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "var(--coral)",
                                      background: "var(--coral-soft)",
                                      borderRadius: 4,
                                      padding: "1px 5px",
                                    }}
                                  >
                                    기한 초과
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                      {renderExtension(t)}
                    </div>
                  );
                })}
                <button className="add-col" onClick={() => setModalOpen(true)}>
                  <i className="ti ti-plus" /> 추가
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 목록 뷰 */}
      {view === "list" && (
        <div>
          {filteredTasks.map((t) => {
            const status = API_TO_STATUS[t.status];
            const dd = dueState(t.due_date);
            const danger = status !== "완료" && dd.danger;
            const warn = status !== "완료" && dd.warn;
            return (
              <div key={t.id} className="lrow-wrap">
                <div
                  className={`lrow ${danger ? "danger" : ""} ${warn ? "warn" : ""}`}
                  style={{
                    cursor: canEdit(t) ? "pointer" : "default",
                    ...stripeStyle(t.assignee_id, danger, warn),
                  }}
                  onClick={() => canEdit(t) && openEdit(t)}
                >
                  <div
                    className={`t-check ${status === "완료" ? "done" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canEdit(t)) toggleList(t);
                    }}
                  >
                    <i className="ti ti-check" />
                  </div>
                  <div className="lrow-titlebox">
                    <div
                      className={`lrow-title ${status === "완료" ? "done" : ""}`}
                    >
                      {t.description}
                    </div>
                    {t.detail && <div className="lrow-detail">{t.detail}</div>}
                  </div>
                  <span className={`badge ${COL_BADGE[status] || "b-gray"}`}>
                    {status}
                  </span>
                  <div className={`av ${avOf(t.assignee_id)} av-sm`}>
                    {nameOf(t.assignee_id)[0]}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 2,
                      minWidth: 140,
                    }}
                  >
                    <div
                      className={`lrow-due ${danger ? "due-red" : warn ? "due-amber" : "due-soft"}`}
                    >
                      {dd.label ? (
                        <>
                          {dd.label}
                          {dd.timeLabel && ` ${dd.timeLabel}`}
                          {dd.dDay && (
                            <span style={{ fontWeight: 700, marginLeft: 5 }}>
                              {dd.dDay}
                            </span>
                          )}
                        </>
                      ) : (
                        "기한 없음"
                      )}
                    </div>
                    {status === "완료" && t.completed_at && (
                      <div
                        className="lrow-due"
                        style={{ color: "var(--green)" }}
                      >
                        <i className="ti ti-check" style={{ marginRight: 3 }} />
                        {fmtCompleted(t.completed_at)} 완료
                        {t.due_date &&
                          new Date(t.completed_at) > new Date(t.due_date) && (
                            <span
                              style={{
                                marginLeft: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--coral)",
                                background: "var(--coral-soft)",
                                borderRadius: 4,
                                padding: "1px 5px",
                              }}
                            >
                              기한 초과
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                  <span className="tc-diff">
                    {"★".repeat(t.difficulty ?? 1)}
                    <span className="tc-diff-off">
                      {"★".repeat(3 - (t.difficulty ?? 1))}
                    </span>
                  </span>
                </div>
                {renderExtension(t)}
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <div
              style={{ padding: 18, fontSize: 13, color: "var(--text-soft)" }}
            >
              {filter === "mine"
                ? "나에게 배정된 태스크가 없습니다."
                : "등록된 태스크가 없습니다. 태스크를 추가해 보세요."}
            </div>
          )}
        </div>
      )}

      {/* 태스크 추가 모달 */}
      {modalOpen && (
        <Modal
          title="태스크 추가"
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void addTask()}
                disabled={saving}
              >
                {saving ? "추가 중…" : "추가"}
              </button>
            </>
          }
        >
          <div className="modal-sub">
            담당자와 마감일을 지정하면 기여도에 자동 반영됩니다.
          </div>
          <div className="field">
            <label className="field-label">태스크 이름</label>
            <input
              className="input"
              placeholder="예) 발표 자료 수정"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">세부사항 (선택)</label>
            <textarea
              className="input"
              rows={2}
              maxLength={2000}
              placeholder="예) 참고 링크, 작업 범위 등 메모"
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">담당자</label>
              <select
                className="input"
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
              >
                <option value="">미지정</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">마감일</label>
              <div className="field-row" style={{ gap: 6 }}>
                <input
                  className="input"
                  type="date"
                  style={{ flex: 2 }}
                  min={todayStr()}
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                />
                <input
                  className="input"
                  type="time"
                  style={{ flex: 1 }}
                  placeholder="23:59"
                  min={timeMinForDate(newDue)}
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
              <div className="field-hint">시간 미입력 시 23:59</div>
            </div>
          </div>
          <div className="field">
            <label className="field-label">상태</label>
            <div className="chip-row">
              {(["할 일", "진행 중", "완료"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-opt ${STATUS_CHIP_CLS[s]} ${newStatus === s ? "active" : ""}`}
                  onClick={() => setNewStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">난이도</label>
            <div className="chip-row">
              {DIFF_CHIPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`chip-opt chip-diff ${newDifficulty === c.value ? "active" : ""}`}
                  onClick={() => setNewDifficulty(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* 태스크 수정 모달 */}
      {editTarget && !confirmDelete && (
        <Modal
          title="태스크 수정"
          onClose={() => setEditTarget(null)}
          actions={
            <>
              <button
                className="btn btn-danger"
                style={{ marginRight: "auto" }}
                onClick={() => setConfirmDelete(true)}
              >
                삭제
              </button>
              <button className="btn" onClick={() => setEditTarget(null)}>
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void submitChangeRequest()}
                disabled={editSaving}
              >
                {editSaving ? "요청 중…" : "수정 요청"}
              </button>
            </>
          }
        >
          <div className="modal-sub">
            팀장이 수락하면 변경 사항이 적용됩니다.
          </div>
          <div className="field">
            <label className="field-label">태스크 이름</label>
            <input
              className="input"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">세부사항 (선택)</label>
            <textarea
              className="input"
              rows={2}
              maxLength={2000}
              placeholder="예) 참고 링크, 작업 범위 등 메모"
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
            />
            <div className="field-hint">세부사항은 승인 없이 바로 반영돼요</div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">담당자</label>
              <select
                className="input"
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
              >
                <option value="">미지정</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">마감일</label>
              <div className="field-row" style={{ gap: 6 }}>
                <input
                  className="input"
                  type="date"
                  style={{ flex: 2 }}
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
                <input
                  className="input"
                  type="time"
                  style={{ flex: 1 }}
                  placeholder="23:59"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </div>
              <div className="field-hint">시간 미입력 시 23:59</div>
            </div>
          </div>
          <div className="field">
            <label className="field-label">난이도</label>
            <div className="chip-row">
              {DIFF_CHIPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`chip-opt chip-diff ${editDifficulty === c.value ? "active" : ""}`}
                  onClick={() => setEditDifficulty(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">수정 사유</label>
            <textarea
              className="input"
              rows={3}
              placeholder="예) 일정이 변경되어 마감일 조정이 필요합니다."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* 기존 요청 덮어쓰기 확인 모달 */}
      {confirmOverwrite && editTarget && pendingRequestBody && (
        <ConfirmModal
          title="기존 요청 덮어쓰기"
          message={
            <>
              <strong>{editTarget.description}</strong>에 아직 처리되지 않은
              수정 요청이 있습니다.
              <br />새 요청으로 덮어쓸까요?
            </>
          }
          confirmLabel="덮어쓰기"
          busy={editSaving}
          onConfirm={() =>
            void doSendRequest(editTarget.id, pendingRequestBody)
          }
          onClose={() => {
            setConfirmOverwrite(false);
            setPendingRequestBody(null);
          }}
        />
      )}

      {/* 삭제 요청 모달 */}
      {confirmDelete && editTarget && (
        <Modal
          title="태스크 삭제 요청"
          onClose={() => {
            setConfirmDelete(false);
            setDeleteReason("");
          }}
          actions={
            <>
              <button
                className="btn"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteReason("");
                }}
              >
                취소
              </button>
              <button
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void requestDeletion()}
              >
                삭제 요청 보내기
              </button>
            </>
          }
        >
          <p style={{ marginBottom: 12, color: "var(--text-soft)" }}>
            <strong style={{ color: "var(--text-main)" }}>
              {editTarget.description}
            </strong>{" "}
            태스크의 삭제를 팀장에게 요청합니다.
          </p>
          <div className="field">
            <label className="field-label">삭제 사유</label>
            <textarea
              className="input"
              rows={3}
              placeholder="삭제가 필요한 이유를 입력해 주세요"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{ resize: "none" }}
            />
          </div>
        </Modal>
      )}

      {/* 완료 → 다른 상태 변경 경고 모달 */}
      {statusChangePending && (
        <ConfirmModal
          title="완료 상태 변경"
          message={
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                textAlign: "center",
                padding: "4px 0 8px",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "rgba(240,193,79,.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <i
                  className="ti ti-alert-triangle"
                  style={{ fontSize: 26, color: "var(--amber, #b8860b)" }}
                />
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "var(--text-main)",
                }}
              >
                완료 처리된 태스크를{" "}
                <strong>{statusChangePending.newStatus}</strong>으로 변경하면
                <br />
                <strong style={{ color: "var(--amber, #b8860b)" }}>
                  완료 날짜가 초기화
                </strong>
                됩니다.
              </div>
            </div>
          }
          confirmLabel="변경"
          onConfirm={() => {
            void changeStatus(
              statusChangePending.task,
              statusChangePending.newStatus,
            );
            setStatusChangePending(null);
          }}
          onClose={() => setStatusChangePending(null)}
        />
      )}

      {/* 카카오 공유 미리보기 모달 */}
      {shareBatches.length > 0 && (
        <Modal
          title={`카카오 공유 ${shareBatchIdx + 1}/${shareBatches.length}`}
          onClose={() => setShareBatches([])}
          actions={
            <>
              <button className="btn" onClick={() => setShareBatches([])}>
                취소
              </button>
              <button className="btn btn-primary" onClick={sendCurrentBatch}>
                <i className="ti ti-brand-kakao" /> {shareBatchIdx + 1}/
                {shareBatches.length} 보내기
              </button>
            </>
          }
        >
          <div className="modal-sub">아래 내용이 카카오톡으로 공유됩니다.</div>
          {shareBatches[shareBatchIdx].map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid var(--border-2)",
              }}
            >
              <img
                src={item.img}
                alt=""
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-main)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-soft)",
                    marginTop: 2,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {viewingExt && (
        <Modal
          title="수정 요청 내용"
          onClose={() => setViewingExt(null)}
          actions={
            <button className="btn" onClick={() => setViewingExt(null)}>
              닫기
            </button>
          }
        >
          {/* 요청자 + 태스크 헤더 */}
          <div className="ext-req-header">
            <div className="ext-req-who">
              <i className="ti ti-user-circle" />
              <strong>{viewingExt.requester_name}</strong>님의{" "}
              {viewingExt.type === "delete" ? "삭제" : "수정"} 요청
            </div>
            <div className="ext-req-task">{viewingExt.task_description}</div>
          </div>

          {/* 삭제 요청 안내 */}
          {viewingExt.type === "delete" && (
            <div
              className="ext-changes"
              style={{ borderColor: "var(--coral)", marginBottom: 12 }}
            >
              <div
                className="ext-changes-title"
                style={{
                  background: "var(--coral-soft)",
                  color: "var(--coral)",
                }}
              >
                <i className="ti ti-trash" /> 태스크 삭제 요청
              </div>
              <div className="ext-diff-row">
                이 태스크를 완전히 삭제하길 요청합니다.
              </div>
            </div>
          )}

          {/* 변경 항목 diff */}
          {viewingExt.type !== "delete" &&
            (viewingExt.requested_description ||
              viewingExt.requested_difficulty != null ||
              viewingExt.requested_assignee_id != null ||
              viewingExt.requested_due_date) && (
              <div className="ext-changes">
                <div className="ext-changes-title">변경 내용</div>
                {viewingExt.requested_description && (
                  <div className="ext-diff-row">
                    <span className="ext-diff-label">이름</span>
                    <div className="ext-diff-val">
                      <span className="ext-diff-before">
                        {viewingExt.task_description}
                      </span>
                      <i className="ti ti-arrow-right ext-diff-arrow" />
                      <span className="ext-diff-after">
                        {viewingExt.requested_description}
                      </span>
                    </div>
                  </div>
                )}
                {viewingExt.requested_difficulty != null && (
                  <div className="ext-diff-row">
                    <span className="ext-diff-label">난이도</span>
                    <div className="ext-diff-val">
                      <span className="ext-diff-before">
                        {"★".repeat(viewingExt.current_difficulty ?? 1)}
                      </span>
                      <i className="ti ti-arrow-right ext-diff-arrow" />
                      <span className="ext-diff-after">
                        {"★".repeat(viewingExt.requested_difficulty)}
                      </span>
                    </div>
                  </div>
                )}
                {viewingExt.requested_assignee_id != null && (
                  <div className="ext-diff-row">
                    <span className="ext-diff-label">담당자</span>
                    <div className="ext-diff-val">
                      <span className="ext-diff-before">
                        {viewingExt.current_assignee_id != null
                          ? (members.find(
                              (m) =>
                                m.user_id === viewingExt.current_assignee_id,
                            )?.name ?? "알 수 없음")
                          : "미지정"}
                      </span>
                      <i className="ti ti-arrow-right ext-diff-arrow" />
                      <span className="ext-diff-after">
                        {viewingExt.requested_assignee_id === -1
                          ? "미지정"
                          : (members.find(
                              (m) =>
                                m.user_id === viewingExt.requested_assignee_id,
                            )?.name ?? "알 수 없음")}
                      </span>
                    </div>
                  </div>
                )}
                {viewingExt.requested_due_date && (
                  <div className="ext-diff-row">
                    <span className="ext-diff-label">마감일</span>
                    <div className="ext-diff-val">
                      <span className="ext-diff-before">
                        {viewingExt.current_due_date
                          ? new Date(
                              viewingExt.current_due_date,
                            ).toLocaleDateString("ko-KR")
                          : "없음"}
                      </span>
                      <i className="ti ti-arrow-right ext-diff-arrow" />
                      <span className="ext-diff-after">
                        {new Date(
                          viewingExt.requested_due_date,
                        ).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* 사유 */}
          <div className="ext-reason-box">
            <div className="ext-reason-label">
              <i className="ti ti-message-circle" />
              {viewingExt.type === "delete" ? "삭제 사유" : "수정 사유"}
            </div>
            <div className="ext-reason-body">
              {viewingExt.reason || "(작성된 사유가 없습니다)"}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
