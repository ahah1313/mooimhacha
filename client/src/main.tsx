import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// global.css만 여기서 import. 페이지 전용 CSS는 각 페이지 컴포넌트에서 직접 import.
import "./styles/global.css";

const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY;
if (kakaoKey && window.Kakao && !window.Kakao.isInitialized()) {
  window.Kakao.init(kakaoKey);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
