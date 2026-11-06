/** 运行平台判断（用于无边框窗口的标题栏布局） */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Macintosh|Mac OS X/.test(navigator.userAgent);
}
