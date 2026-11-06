export const FONT_SIZE_KEY = "md-editor:font-size-editor";
export const BODY_FONT_KEY = "md-editor:font-family";
export const CODE_FONT_KEY = "md-editor:font-family-code";

export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 24;

export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

export interface FontSettings {
  fontSize: number;
  bodyFont: string;
  codeFont: string;
}

export interface SystemFont {
  family: string;
  aliases: string[];
}

export const SYSTEM_FONT_PREFIX = "sys:";

export const BODY_FONTS: FontOption[] = [
  {
    id: "system",
    label: "系统默认（无衬线）",
    stack:
      'BlinkMacSystemFont, Helvetica, "PingFang SC", "Luxi Sans", "DejaVu Sans", arial, "Microsoft Yahei", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans SC", sans-serif',
  },
  {
    id: "source-han",
    label: "思源黑体 / 苹方",
    stack:
      '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: "yahei",
    label: "微软雅黑",
    stack: '"Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  },
  {
    id: "serif",
    label: "宋体 / 衬线",
    stack:
      '"Songti SC", SimSun, "Source Han Serif SC", "Noto Serif SC", Georgia, serif',
  },
  {
    id: "kaiti",
    label: "楷体",
    stack: '"Kaiti SC", KaiTi, STKaiti, "Noto Serif SC", serif',
  },
  {
    id: "mono",
    label: "等宽",
    stack:
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Code", monospace',
  },
];

export const CODE_FONTS: FontOption[] = [
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack:
      '"JetBrains Mono", "JetBrainsMono-Regular", mononoki, Consolas, "Liberation Mono", "Cascadia Code", monospace',
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "consolas",
    label: "Consolas",
    stack: 'Consolas, "Cascadia Code", "Liberation Mono", monospace',
  },
  {
    id: "fira",
    label: "Fira Code",
    stack: '"Fira Code", "Cascadia Code", Consolas, monospace',
  },
  {
    id: "system-mono",
    label: "系统等宽",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontSize: 16,
  bodyFont: "system",
  codeFont: "jetbrains",
};

function findOption(options: FontOption[], id: string): FontOption {
  return options.find((option) => option.id === id) ?? options[0];
}

export function isSystemFontId(id: string): boolean {
  return id.startsWith(SYSTEM_FONT_PREFIX);
}

export function systemFontId(family: string): string {
  return `${SYSTEM_FONT_PREFIX}${family}`;
}

export function systemFontFamily(id: string): string | null {
  return isSystemFontId(id) ? id.slice(SYSTEM_FONT_PREFIX.length) : null;
}

function quoteFamily(name: string): string {
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 把设置里的字体 id 解析成 CSS font-family；系统字体直接用英文家族名并在后面接默认字体栈兜底 */
export function fontStack(options: FontOption[], id: string): string {
  const family = systemFontFamily(id);
  if (family !== null) {
    const fallback = options[0].stack;
    return family.trim() ? `${quoteFamily(family)}, ${fallback}` : fallback;
  }
  return findOption(options, id).stack;
}

export function readFontSettings(): FontSettings {
  let storedSize: number | null = null;
  let storedBody: string | null = null;
  let storedCode: string | null = null;
  try {
    const size = Number(localStorage.getItem(FONT_SIZE_KEY));
    storedSize = Number.isFinite(size) && size > 0 ? size : null;
    storedBody = localStorage.getItem(BODY_FONT_KEY);
    storedCode = localStorage.getItem(CODE_FONT_KEY);
  } catch {
    // 隐私模式下 localStorage 可能不可用，退回默认值
  }
  return {
    fontSize:
      storedSize !== null && storedSize >= FONT_SIZE_MIN && storedSize <= FONT_SIZE_MAX
        ? Math.round(storedSize)
        : DEFAULT_FONT_SETTINGS.fontSize,
    bodyFont: isValidFontId(BODY_FONTS, storedBody)
      ? (storedBody as string)
      : DEFAULT_FONT_SETTINGS.bodyFont,
    codeFont: isValidFontId(CODE_FONTS, storedCode)
      ? (storedCode as string)
      : DEFAULT_FONT_SETTINGS.codeFont,
  };
}

function isValidFontId(options: FontOption[], id: string | null): boolean {
  if (!id) {
    return false;
  }
  if (isSystemFontId(id)) {
    return id.length > SYSTEM_FONT_PREFIX.length;
  }
  return options.some((option) => option.id === id);
}

export function applyFontSettings(settings: FontSettings) {
  const root = document.documentElement;
  root.style.setProperty("--b3-font-size-editor", `${settings.fontSize}px`);
  root.style.setProperty("--b3-font-family-editor", fontStack(BODY_FONTS, settings.bodyFont));
  root.style.setProperty("--b3-font-family-code", fontStack(CODE_FONTS, settings.codeFont));
}

export function saveFontSettings(settings: FontSettings) {
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(settings.fontSize));
    localStorage.setItem(BODY_FONT_KEY, settings.bodyFont);
    localStorage.setItem(CODE_FONT_KEY, settings.codeFont);
  } catch {
    // 忽略写入失败
  }
}
