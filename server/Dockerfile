# 무임하차 백엔드(NestJS) — 멀티스테이지 빌드
# 단계: deps(전체 의존성) → build(nest build) → runtime(production 의존성 + dist만)

# ─── 1) deps: package-lock.json 기반 재현 가능한 전체 설치 ───────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── 2) build: 소스 컴파일 (nest build → dist/) ─────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .
RUN npm run build

# ─── 3) runtime: production 의존성만 + 빌드 산출물 ──────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# production 의존성만 재현 가능하게 설치
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 빌드 산출물 복사
COPY --from=build /app/dist ./dist

# 비루트 유저로 실행 (node:alpine 기본 제공 'node' 유저)
USER node

EXPOSE 3000
CMD ["node", "dist/main"]
