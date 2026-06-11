// 렌더러용 preload API 타입 보강.
// preload 의 window.mooimhacha API 표면을 렌더러(웹 tsconfig include 대상)에서 인식하도록 전역 보강한다.
// 이 파일은 src 하위라 웹 tsc 가 자동 인식하며, 브라우저(비-Electron) 환경에서도 optional 이라 타입체크가 통과한다.
// 실제 구현은 electron/preload/index.ts. 두 곳의 시그니처를 동일하게 유지할 것.

export interface SttPartialEvent {
  type: "partial";
  text: string;
}
export interface SttFinalEvent {
  type: "final";
  text: string;
  started_at_ms?: number;
  ended_at_ms?: number;
}
export interface SttErrorEvent {
  type: "error";
  code?: string;
  message: string;
}
export interface SttStatusEvent {
  type: "status";
  state: string;
  [k: string]: unknown;
}

export interface SttStartOptions {
  language?: string;
  model?: string;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface MooimhachaBridge {
  readonly isElectron: true;
  readonly platform: string;
  openCompanion(meetingId: number, teamId: number): Promise<void>;
  closeCompanion(): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  saveWindowState(name: string, bounds: WindowBounds): Promise<void>;
  loadWindowState(name: string): Promise<WindowBounds>;
  stt: {
    start(opts?: SttStartOptions): Promise<void>;
    stop(): Promise<void>;
    /** 구독 해제 함수를 반환. */
    onPartial(cb: (e: SttPartialEvent) => void): () => void;
    onFinal(cb: (e: SttFinalEvent) => void): () => void;
    onError(cb: (e: SttErrorEvent) => void): () => void;
    onStatus(cb: (e: SttStatusEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    // 데스크탑(Electron)에서만 주입. 브라우저에서는 undefined.
    mooimhacha?: MooimhachaBridge;
  }
}
