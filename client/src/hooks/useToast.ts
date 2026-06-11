import { useCallback, useRef } from "react";

// React 상태 대신 DOM을 직접 조작하는 이유:
// 토스트는 어느 컴포넌트에서든 호출되고 리렌더 없이 즉시 표시되어야 함.
// App.tsx의 #toast 엘리먼트가 대상.
export function useToast() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, variant: "success" | "error" = "success") => {
      const t = document.getElementById("toast");
      if (!t) return;
      t.querySelector("span")!.textContent = msg;
      // 성공/실패에 따라 아이콘·색을 바꿔 실패가 성공처럼 보이지 않게 한다
      const icon = t.querySelector("i");
      if (icon) {
        icon.className =
          variant === "error" ? "ti ti-alert-circle" : "ti ti-circle-check";
        icon.style.color =
          variant === "error" ? "var(--coral)" : "var(--green-bright)";
      }
      t.classList.add("show");
      // 이전 타이머가 남아있으면 취소 후 재시작 (연속 호출 시 타이머 중첩 방지)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => t.classList.remove("show"), 2400);
    },
    [],
  );

  return { showToast };
}
