import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
  },
  plugins: [react()],
  // 멀티 페이지: 메인 탭(index.html) + 회의 중 보조 창(companion.html)
  build: {
    rollupOptions: {
      input: {
        main: path.join(__dirname, "index.html"),
        companion: path.join(__dirname, "companion.html"),
      },
    },
  },
  server: {
    // 백엔드(localhost:3000)와 포트 충돌 방지
    port: 5173,
  },
});
