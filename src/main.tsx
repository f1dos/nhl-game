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
installDomLocalization();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
import "./ui/scouting.css";
import "./ui/conversation.css";
import "./ui/trade-desk.css";
import "./ui/manager-control.css";
import "./ui/free-agency.css";
import "./ui/matchday.css";
import "./ui/tactics-board.css";
import "./ui/leadership.css";
