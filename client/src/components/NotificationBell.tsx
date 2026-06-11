import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

interface Noti {
  id: number;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

// 인앱 알림 벨. 60초마다 폴링. (브라우저 Notifications API 권한은 별도 설정에서)
export default function NotificationBell() {
  const [items, setItems] = useState<Noti[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await apiGet<Noti[]>("/notifications"));
    } catch {
      // 비로그인 등 — 무시
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = async (id: number) => {
    await apiPatch(`/notifications/${id}/read`);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const markAll = async () => {
    await apiPost("/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="noti-bell">
      <button
        className="noti-bell__btn"
        onClick={() => setOpen((o) => !o)}
        title="알림"
      >
        <i className="ti ti-bell" />
        {unread > 0 && <span className="noti-bell__dot">{unread}</span>}
      </button>
      {open && (
        <div className="noti-bell__panel">
          <div className="noti-bell__head">
            <span>알림</span>
            <button onClick={markAll}>모두 읽음</button>
          </div>
          {items.length === 0 && (
            <div className="noti-bell__empty">알림이 없습니다.</div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`noti-bell__item ${n.read ? "read" : ""}`}
              onClick={() => void markRead(n.id)}
            >
              <strong>{n.title}</strong>
              {n.body && <span>{n.body}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
