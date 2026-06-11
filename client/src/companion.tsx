import React from "react";
import ReactDOM from "react-dom/client";
import MeetingRoom from "@/pages/meeting/MeetingRoom";
import "@/styles/global.css";
import "@/styles/companion.css";

// 회의 중 보조 창(window.open 대상) 진입점.
// 쿼리: /companion.html?meeting=<id>&team=<id>
const params = new URLSearchParams(window.location.search);
const meetingId = Number(params.get("meeting"));
const teamId = Number(params.get("team"));

ReactDOM.createRoot(
  document.getElementById("companion-root") as HTMLElement,
).render(
  <React.StrictMode>
    <MeetingRoom meetingId={meetingId} teamId={teamId} />
  </React.StrictMode>,
);
