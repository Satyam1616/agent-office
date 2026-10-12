import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isDesktop, setCloseToTray } from "./desktop";
import { watchNotifications } from "./notify";
import { useSettings } from "./settings";
import { connect, pollStats } from "./store";
import "./index.css";

connect();
pollStats();
watchNotifications();
// The tray behaviour lives in the desktop shell; tell it what the user picked.
if (isDesktop) void setCloseToTray(useSettings.getState().closeToTray).catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Transparent so the 3D scene shows through; panels bring their own glass background. */}
    <FluentProvider theme={webDarkTheme} style={{ background: "transparent", height: "100%" }}>
      <App />
    </FluentProvider>
  </StrictMode>,
);
