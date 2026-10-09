"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Icon } from "@/components/Icon";
import { EditorToolbox } from "@/components/EditorToolbox";
import {
  storageSnapshot,
  STORAGE_EVENT,
  subscribeStorage,
} from "@/lib/client-storage";
import {
  EDITOR_PREFERENCES_KEY,
  findText,
  MAX_FIND_LENGTH,
  MAX_REPLACEMENT_LENGTH,
  nextTextMatch,
  parseEditorPreferences,
  replaceText,
  type EditorPreferences,
  type MarkdownStructure,
  type TextEdit,
  type TextRange,
} from "@/lib/editor-tools";

export type EditorCommand = "find" | "replace" | "focus" | "download" | "save" | "tools";
const preferencesSnapshot = () => storageSnapshot(EDITOR_PREFERENCES_KEY);

export function useEditorPreferences() {
  const raw = useSyncExternalStore(
    subscribeStorage,
    preferencesSnapshot,
    () => "",
  );
  const [fallback, setFallback] = useState<EditorPreferences | null>(null);
  const preferences = useMemo(
    () => fallback ?? parseEditorPreferences(raw),
    [fallback, raw],
  );
  const updatePreferences = useCallback((next: EditorPreferences) => {
    const safe = { fontSize: next.fontSize, lineNumbers: next.lineNumbers };
    try {
      localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(safe));
      setFallback(null);
      window.dispatchEvent(new Event(STORAGE_EVENT));
      return true;
    } catch {
      setFallback(safe);
      return false;
    }
  }, []);
  return { preferences, updatePreferences };
}

type EditorToolsProps = {
  layoutOptions?: ReactNode;
  onDocument: () => void;
  initialTool?: string;
  compact?: boolean;
  content: string;
  contentType: string;
  selection: TextRange;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  preferences: EditorPreferences;
  onPreferences: (preferences: EditorPreferences) => void;
  onUndo: () => void;
  onRedo: () => void;
  onEdit: (edit: TextEdit) => void;
  onSelect: (selection: TextRange) => void;
  onStructure: (kind: MarkdownStructure) => void;
  onJson: (action: "format" | "minify" | "validate") => void;
  onDownload: () => void;
  onMessage: (message: string, error?: boolean) => void;
};

export function EditorTools(props: EditorToolsProps) {
  const [open, setOpen] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(Boolean(props.initialTool));
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const toolboxTriggerRef = useRef<HTMLButtonElement>(null);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () =>
      open && deferredQuery
        ? findText(props.content, { query: deferredQuery, caseSensitive })
        : null,
    [caseSensitive, deferredQuery, open, props.content],
  );

  const showFind = useCallback((replace = false) => {
    if (toolsRef.current) toolsRef.current.open = true;
    setToolsExpanded(true);
    setOpen(true);
    setReplaceOpen(replace);
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const showToolbox = useCallback(() => {
    if (toolsRef.current) toolsRef.current.open = true;
    setToolsExpanded(true);
    setToolboxOpen(true);
  }, []);

  useEffect(() => {
    function command(event: Event) {
      if (props.disabled) return;
      const detail = (event as CustomEvent<{ action?: EditorCommand }>).detail;
      if (detail?.action === "find") showFind();
      if (detail?.action === "replace") showFind(true);
      if (detail?.action === "tools") showToolbox();
    }
    function shortcut(event: KeyboardEvent) {
      if (
        props.disabled ||
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector("dialog[open]") ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-paste-editor]")
      )
        return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        showFind();
      }
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        showFind(true);
      }
    }
    window.addEventListener("march7th-editor-command", command);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("march7th-editor-command", command);
      window.removeEventListener("keydown", shortcut);
    };
  }, [props.disabled, showFind, showToolbox]);

  function navigate(direction: "next" | "previous") {
    const result = nextTextMatch(
      props.content,
      { query, caseSensitive },
      props.selection,
      direction,
    );
    if (!result.ok) {
      props.onMessage(result.message, true);
      return;
    }
    if (!result.value) {
      props.onMessage("没有找到匹配内容。");
      return;
    }
    props.onSelect(result.value);
  }

  function replace(all: boolean) {
    const result = replaceText(
      props.content,
      { query, caseSensitive },
      replacement,
      props.selection,
      all,
    );
    if (!result.ok) {
      props.onMessage(result.message, true);
      return;
    }
    if (result.value.count) props.onEdit(result.value);
    props.onMessage(`已替换 ${result.value.count.toLocaleString()} 处。`);
  }

  return (
    <details
      ref={toolsRef}
      className="editor-workbench-tools"
      open={!props.compact || toolsExpanded || toolboxOpen || open}
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          setToolsExpanded(false);
          setToolboxOpen(false);
          setOpen(false);
        }
      }}
    >
      <summary className="editor-tools-summary">
        <Icon name="settings" size={16} />
        更多编辑工具<span>工具箱 · 查找 · JSON</span>
      </summary>
      <div className="editor-tool-actions">
        <button
          type="button"
          className="toolbar-button"
          disabled={props.disabled || !props.canUndo}
          title="撤销（Ctrl / Cmd + Z）"
          aria-label="撤销"
          onClick={props.onUndo}
        >
          ↶ <span>撤销</span>
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={props.disabled || !props.canRedo}
          title="重做（Ctrl / Cmd + Shift + Z）"
          aria-label="重做"
          onClick={props.onRedo}
        >
          ↷ <span>重做</span>
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={props.disabled}
          onClick={() => showFind(false)}
        >
          <Icon name="search" size={14} />
          <span>查找</span>
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={props.disabled}
          onClick={() => showFind(true)}
        >
          替换
        </button>
        <button
          ref={toolboxTriggerRef}
          type="button"
          className="toolbar-button editor-toolbox-trigger"
          disabled={props.disabled}
          aria-expanded={toolboxOpen}
          aria-controls="editor-toolbox"
          onClick={() => {
            if (toolboxOpen) setToolboxOpen(false);
            else showToolbox();
          }}
        >
          <Icon name="settings" size={14} />
          <span>工具箱</span>
        </button>
        <button type="button" className="toolbar-button" onClick={props.onDocument} disabled={props.disabled}><Icon name="list" size={14} /><span>文档导航</span></button>
        <details className="editor-display-options" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } if (event.key === "Enter" && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) event.preventDefault(); }}><summary><Icon name="settings" size={14} />显示</summary><div className="editor-display-menu">
        <label className="editor-font-label">
          <span className="sr-only">编辑字号</span>
          <select
            className="toolbar-select editor-font-select"
            aria-label="编辑字号"
            value={props.preferences.fontSize}
            disabled={props.disabled}
            onChange={(event) =>
              props.onPreferences({
                ...props.preferences,
                fontSize: Number(
                  event.target.value,
                ) as EditorPreferences["fontSize"],
              })
            }
          >
            <option value="14">14 px</option>
            <option value="16">16 px</option>
            <option value="18">18 px</option>
          </select>
        </label>
        <label className="editor-line-toggle">
          <input
            type="checkbox"
            checked={props.preferences.lineNumbers}
            disabled={props.disabled}
            onChange={(event) =>
              props.onPreferences({
                ...props.preferences,
                lineNumbers: event.target.checked,
              })
            }
          />
          逻辑行号
        </label>
        {props.layoutOptions}
        </div></details>
      </div>
      <EditorToolbox
        initialQuery={props.initialTool}
        open={toolboxOpen}
        content={props.content}
        contentType={props.contentType}
        selection={props.selection}
        disabled={props.disabled}
        onEdit={props.onEdit}
        onJson={props.onJson}
        onMessage={props.onMessage}
        onClose={() => {
          setToolboxOpen(false);
          toolboxTriggerRef.current?.focus();
        }}
      />
      {open && (
        <div
          className="editor-find-panel"
          role="search"
          aria-label="正文查找替换"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="editor-find-fields">
            <input
              ref={findInputRef}
              className="editor-find-input"
              aria-label="查找内容"
              placeholder="查找纯文本…"
              value={query}
              maxLength={MAX_FIND_LENGTH}
              disabled={props.disabled}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  navigate(event.shiftKey ? "previous" : "next");
                }
              }}
            />
            <label className="editor-find-options">
              <input
                type="checkbox"
                checked={caseSensitive}
                disabled={props.disabled}
                onChange={(event) => setCaseSensitive(event.target.checked)}
              />
              区分大小写
            </label>
            <button
              className="toolbar-button"
              type="button"
              aria-label="上一个匹配"
              disabled={props.disabled || !query}
              onClick={() => navigate("previous")}
            >
              ↑ 上一个
            </button>
            <button
              className="toolbar-button"
              type="button"
              aria-label="下一个匹配"
              disabled={props.disabled || !query}
              onClick={() => navigate("next")}
            >
              ↓ 下一个
            </button>
            <button
              className="toolbar-button"
              type="button"
              aria-label="关闭查找"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="editor-find-summary" aria-live="polite">
            {!query
              ? "纯文本查找，不使用正则表达式。Enter 下一个，Shift + Enter 上一个。"
              : matches?.ok
                ? `共 ${matches.value.total.toLocaleString()} 处匹配`
                : matches
                  ? matches.message
                  : "正在查找…"}
            <button
              className="toolbar-button"
              type="button"
              onClick={() => setReplaceOpen(!replaceOpen)}
            >
              {replaceOpen ? "收起替换" : "展开替换"}
            </button>
          </div>
          {replaceOpen && (
            <div className="editor-find-fields">
              <input
                className="editor-find-input"
                aria-label="替换为"
                placeholder="替换为（可留空删除）"
                value={replacement}
                maxLength={MAX_REPLACEMENT_LENGTH}
                disabled={props.disabled}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    replace(false);
                  }
                }}
              />
              <button
                className="btn btn-ghost btn-small"
                type="button"
                disabled={props.disabled || !query}
                onClick={() => replace(false)}
              >
                替换当前
              </button>
              <button
                className="btn btn-ghost btn-small"
                type="button"
                disabled={props.disabled || !query}
                onClick={() => replace(true)}
              >
                替换全部
              </button>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
