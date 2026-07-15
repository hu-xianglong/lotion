import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./lib/i18n";
import { SettingsProvider } from "./lib/settings";
import "./styles.css";
import { installBuiltinPlugins } from "./plugin-host/builtin-plugins";

installBuiltinPlugins();

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </SettingsProvider>
  </React.StrictMode>
);
