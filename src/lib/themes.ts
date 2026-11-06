import type {Theme} from "../types";

export const THEME_STORAGE_KEY = "md-editor:theme";

export interface ThemeOption {
  id: Theme;
  label: string;
  /** 菜单里用来示意配色：背景、面板、强调色 */
  swatches: [string, string, string];
}

export const THEMES: ThemeOption[] = [
  {
    id: "light",
    label: "亮色",
    swatches: ["#ffffff", "#f6f6f6", "#3575f0"],
  },
  {
    id: "dark",
    label: "暗色",
    swatches: ["#1e1e1e", "#2c2c2c", "#3575f0"],
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    swatches: ["#eff1f5", "#e6e9ef", "#1e66f5"],
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    swatches: ["#1e1e2e", "#181825", "#89b4fa"],
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    swatches: ["#1a1b26", "#16161e", "#7aa2f7"],
  },
];

export function isTheme(value: string | null | undefined): value is Theme {
  return THEMES.some((option) => option.id === value);
}
