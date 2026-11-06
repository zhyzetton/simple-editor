import {Check, RotateCcw, X} from "lucide-react";
import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {
  BODY_FONTS,
  CODE_FONTS,
  DEFAULT_FONT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  systemFontFamily,
  systemFontId,
} from "../lib/appearance";
import type {FontOption, FontSettings, SystemFont} from "../lib/appearance";
import {listSystemFonts} from "../lib/storage";
import {THEMES} from "../lib/themes";
import type {Theme} from "../types";

interface SettingsDialogProps {
  open: boolean;
  theme: Theme;
  fontSettings: FontSettings;
  onSelectTheme: (theme: Theme) => void;
  onChangeFontSettings: (patch: Partial<FontSettings>) => void;
  onClose: () => void;
}

function systemFontLabel(font: SystemFont): string {
  const local = font.aliases.find(
    (alias) => alias !== font.family && /[\u3400-\u9fff]/.test(alias),
  );
  return local ? `${font.family}（${local}）` : font.family;
}

interface FontOptionsProps {
  presets: FontOption[];
  fonts: SystemFont[];
  loading: boolean;
  currentId: string;
  currentFamily: string | null;
}

function FontOptions({presets, fonts, loading, currentId, currentFamily}: FontOptionsProps) {
  const currentListed =
    currentFamily !== null && fonts.some((font) => font.family === currentFamily);
  return (
    <>
      <optgroup label="推荐字体">
        {presets.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </optgroup>
      {currentFamily !== null && !currentListed ? (
        <optgroup label="当前字体">
          <option value={currentId}>{currentFamily}</option>
        </optgroup>
      ) : null}
      <optgroup label={loading ? "系统字体（读取中…）" : `系统字体（${fonts.length}）`}>
        {fonts.length === 0 ? (
          <option value="" disabled>
            {loading ? "正在读取系统字体…" : "未读取到系统字体"}
          </option>
        ) : (
          fonts.map((font) => (
            <option key={font.family} value={systemFontId(font.family)}>
              {systemFontLabel(font)}
            </option>
          ))
        )}
      </optgroup>
    </>
  );
}

export function SettingsDialog({
  open,
  theme,
  fontSettings,
  onSelectTheme,
  onChangeFontSettings,
  onClose,
}: SettingsDialogProps) {
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);
  const bodySystemFamily = systemFontFamily(fontSettings.bodyFont);
  const codeSystemFamily = systemFontFamily(fontSettings.codeFont);

  useEffect(() => {
    if (!open) {
      return;
    }
    let disposed = false;
    setFontsLoading(true);
    void listSystemFonts()
      .then((fonts) => {
        if (!disposed) {
          setSystemFonts(fonts);
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!disposed) {
          setFontsLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal settings-dialog" role="dialog" aria-label="设置">
        <div className="settings-dialog__header">
          <div>
            <div className="settings-dialog__title">设置</div>
            <div className="settings-dialog__subtitle">主题和阅读体验，修改后立即生效并自动保存</div>
          </div>
          <button type="button" className="icon-button" title="关闭设置" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-dialog__body">
          <section className="settings-section">
            <div className="settings-section__title">主题</div>
            <div className="settings-themes">
              {THEMES.map((option) => {
                const active = option.id === theme;
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`theme-card${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onSelectTheme(option.id)}
                  >
                    <span className="theme-card__swatch" aria-hidden="true">
                      {option.swatches.map((color) => (
                        <span key={color} style={{background: color}} />
                      ))}
                    </span>
                    <span className="theme-card__label">{option.label}</span>
                    {active ? <Check size={15} className="theme-card__check" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section__title">文字</div>
            <div className="settings-section__hint">
              字体和字号只影响编辑区；列表会读取本机安装的字体。
            </div>

            <label className="settings-row">
              <span className="settings-row__label">正文字体</span>
              <select
                className="settings-select"
                value={fontSettings.bodyFont}
                onChange={(event) => onChangeFontSettings({bodyFont: event.target.value})}
              >
                <FontOptions
                  presets={BODY_FONTS}
                  fonts={systemFonts}
                  loading={fontsLoading}
                  currentId={fontSettings.bodyFont}
                  currentFamily={bodySystemFamily}
                />
              </select>
            </label>

            <label className="settings-row">
              <span className="settings-row__label">代码字体</span>
              <select
                className="settings-select"
                value={fontSettings.codeFont}
                onChange={(event) => onChangeFontSettings({codeFont: event.target.value})}
              >
                <FontOptions
                  presets={CODE_FONTS}
                  fonts={systemFonts}
                  loading={fontsLoading}
                  currentId={fontSettings.codeFont}
                  currentFamily={codeSystemFamily}
                />
              </select>
            </label>

            <div className="settings-row">
              <span className="settings-row__label">编辑器字号</span>
              <div className="settings-row__control">
                <input
                  className="settings-range"
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={fontSettings.fontSize}
                  aria-label="编辑器字号"
                  onChange={(event) =>
                    onChangeFontSettings({fontSize: Number(event.target.value)})
                  }
                />
                <span className="settings-size-value">{fontSettings.fontSize} px</span>
              </div>
            </div>

            <div className="settings-preview">
              <p>
                编辑区预览：打开文件夹，开始写作。The quick brown fox jumps over 123.
              </p>
              <p className="settings-preview__code">
                <code>const notes = await listTree();</code>
              </p>
            </div>
          </section>
        </div>

        <div className="settings-dialog__footer">
          <button
            type="button"
            className="button button--ghost settings-reset"
            onClick={() => onChangeFontSettings(DEFAULT_FONT_SETTINGS)}
          >
            <RotateCcw size={13} />
            恢复默认字体
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
