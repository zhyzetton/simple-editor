import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import {applyFontSettings, readFontSettings} from "./lib/appearance";
import {isTheme, THEME_STORAGE_KEY} from "./lib/themes";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/editor.css";

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = isTheme(savedTheme)
  ? savedTheme
  : prefersDark
    ? "dark"
    : "light";
applyFontSettings(readFontSettings());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
