# 무임하차 웹 클라이언트(Vite/React) — 빌드 전용 멀티스테이지
# 산출물(dist/)을 /export 로 복사하는 1회성 컨테이너.
# docker compose가 /export 를 named volume(web-dist)에 마운트 → Caddy가 그 볼륨을 서빙.

# ─── 1) build: 정적 산출물 생성 (tsc && vite build → dist/) ─────────────
FROM node:20-alpine AS build
WORKDIR /app

# 빌드타임 주입값. 기본 빈 문자열 = 상대경로(동일 오리진, Caddy 프록시 전제)
ARG VITE_API_BASE_URL=""
ARG VITE_WS_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

# 웹 빌드는 Electron(V2 데스크탑) 바이너리가 필요 없다 — 설치 시 ~100MB 다운로드 생략.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# 재현 가능한 설치 (.npmrc 설정 존중)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# 소스 복사 후 빌드 (devDependencies 필요: tsc, vite)
COPY . .
RUN npm run build

# ─── 2) export: dist/ 만 담은 작은 스테이지 ─────────────────────────────
# compose가 /export 를 web-dist 볼륨에 마운트하고 이 컨테이너를 1회 실행하면,
# 산출물을 볼륨에 복사한 뒤 종료한다 (restart: "no").
#
# 배포 원자성: Caddy가 같은 볼륨을 실시간 서빙 중이므로 rm -rf 로 먼저 비우면
# 수 초간 404 창이 생긴다. 대신 ①해시 자산 먼저 복사 → ②진입점 HTML 마지막 교체
# → ③새 dist 에 없는 구버전 파일 정리 순서로 진행한다.
FROM alpine:3 AS export
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY <<'DEPLOY' /app/deploy.sh
#!/bin/sh
set -e
cd /app/dist
# 1) 디렉터리 구조 + 해시 자산(JS/CSS 등) 먼저 복사 — 진입점 HTML은 아직 구버전 유지
find . -type d | while read -r d; do mkdir -p "/export/$d"; done
find . -type f ! -name index.html ! -name companion.html \
  | while read -r f; do cp -a "$f" "/export/$f"; done
# 2) 진입점 HTML을 마지막에 교체 (임시 파일 복사 후 mv = 같은 볼륨 내 원자적 rename)
for f in index.html companion.html; do
  if [ -f "$f" ]; then
    cp -a "$f" "/export/$f.new"
    mv "/export/$f.new" "/export/$f"
  fi
done
# 3) 새 dist 에 없는 구버전 파일·빈 디렉터리 정리
cd /export
find . -type f | while read -r f; do [ -f "/app/dist/$f" ] || rm -f "$f"; done
find . -mindepth 1 -depth -type d \
  | while read -r d; do [ -d "/app/dist/$d" ] || rmdir "$d" 2>/dev/null || true; done
DEPLOY
CMD ["sh", "/app/deploy.sh"]
