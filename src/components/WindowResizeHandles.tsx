import {getCurrentWindow} from "@tauri-apps/api/window";
import {useEffect, useState} from "react";
import type {CSSProperties} from "react";
import {isMacOS} from "../lib/platform";
import {isTauri} from "../lib/storage";

type ResizeDirection = Parameters<
  ReturnType<typeof getCurrentWindow>["startResizeDragging"]
>[0];

const EDGE = 4;
const CORNER = 10;

const HANDLES: {direction: ResizeDirection; style: CSSProperties}[] = [
  {
    direction: "North",
    style: {top: 0, left: CORNER, right: CORNER, height: EDGE, cursor: "ns-resize"},
  },
  {
    direction: "South",
    style: {bottom: 0, left: CORNER, right: CORNER, height: EDGE, cursor: "ns-resize"},
  },
  {
    direction: "West",
    style: {left: 0, top: CORNER, bottom: CORNER, width: EDGE, cursor: "ew-resize"},
  },
  {
    direction: "East",
    style: {right: 0, top: CORNER, bottom: CORNER, width: EDGE, cursor: "ew-resize"},
  },
  {
    direction: "NorthWest",
    style: {top: 0, left: 0, width: CORNER, height: CORNER, cursor: "nwse-resize"},
  },
  {
    direction: "NorthEast",
    style: {top: 0, right: 0, width: CORNER, height: CORNER, cursor: "nesw-resize"},
  },
  {
    direction: "SouthWest",
    style: {bottom: 0, left: 0, width: CORNER, height: CORNER, cursor: "nesw-resize"},
  },
  {
    direction: "SouthEast",
    style: {bottom: 0, right: 0, width: CORNER, height: CORNER, cursor: "nwse-resize"},
  },
];

/**
 * 无边框窗口没有系统自带的缩放边框，用贴边的透明热区补回来。
 * 最大化时不需要缩放，直接隐藏，避免挡住屏幕边缘。
 */
export function WindowResizeHandles() {
  const tauri = isTauri();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.isMaximized().then((value) => {
      if (!disposed) {
        setMaximized(value);
      }
    });
    void appWindow
      .onResized(async () => {
        const value = await appWindow.isMaximized();
        if (!disposed) {
          setMaximized(value);
        }
      })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [tauri]);

  if (!tauri || isMacOS() || maximized) {
    return null;
  }

  return (
    <>
      {HANDLES.map(({direction, style}) => (
        <div
          key={direction}
          className="window-resize-handle"
          style={style}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            void getCurrentWindow().startResizeDragging(direction).catch(() => undefined);
          }}
        />
      ))}
    </>
  );
}
