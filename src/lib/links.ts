import {openUrl} from "@tauri-apps/plugin-opener";
import {isTauri} from "./storage";

const MARKDOWN_TARGET = /\.(md|markdown)$/i;

export async function openExternal(href: string) {
  if (!href) {
    return;
  }
  if (isTauri()) {
    await openUrl(href);
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolvePath(baseDir: string, target: string): string {
  const raw = target.startsWith("/")
    ? target
    : `${baseDir.replace(/[/\\]+$/, "")}/${target}`;
  const segments: string[] = [];
  for (const segment of raw.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      const last = segments[segments.length - 1];
      if (last !== undefined && !last.includes(":")) {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** 解析出本地 Markdown 文件的绝对路径；外链、锚点、非 .md 目标返回 null。 */
export function resolveMarkdownTarget(href: string, baseDir: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  // 单字母前缀是 Windows 盘符（C:/…），不能当成 URL scheme
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1];
  if (scheme && scheme.length > 1) {
    return null;
  }
  const path = decodePath(trimmed.split(/[?#]/)[0]);
  if (!MARKDOWN_TARGET.test(path)) {
    return null;
  }
  return resolvePath(baseDir, path);
}
