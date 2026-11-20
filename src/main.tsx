import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { installDomLocalization } from "./i18n/runtime";
import "./ui/styles.css";
import "./ui/workspace.css";
import "./ui/premium.css";
import "./ui/draft.css";
import "./ui/organization.css";
import "./ui/management-revolution.css";
import BroadcastDemo from "./ui/BroadcastDemo";
installDomLocalization();
// `?demo=broadcast` (or a packaged preview) opens a live match broadcast
// without a career, for quick previews of the 3D match.
const demo =
  new URLSearchParams(location.search).get("demo") ??
  (globalThis as { __NHL_DEMO__?: string }).__NHL_DEMO__;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {demo === "broadcast" ? <BroadcastDemo /> : <App />}
  </React.StrictMode>,
);
import "./ui/scouting.css";
import "./ui/conversation.css";
import "./ui/trade-desk.css";
import "./ui/ratings.css";
import "./ui/manager-control.css";
import "./ui/free-agency.css";
import "./ui/matchday.css";
import "./ui/tactics-board.css";
import "./ui/competitions.css";
import "./ui/leadership.css";
import "./ui/broadcast.css";
import "./ui/cards.css";
import "./ui/player-requests.css";
import "./ui/polish.css";
import "./ui/select.css";
