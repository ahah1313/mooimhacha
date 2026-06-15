/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_JS_KEY: string;
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import("electron").IpcRenderer;
  Kakao: {
    init: (key: string) => void;
    isInitialized: () => boolean;
    Share: {
      sendCustom: (options: {
        templateId: number;
        templateArgs?: Record<string, string>;
      }) => void;
    };
  };
}
