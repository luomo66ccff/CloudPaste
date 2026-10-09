"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { templates } from "@/lib/templates";
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement>(null);
  const restoreFocus = useRef(true);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  const router = useRouter(),
    path = usePathname();
  useEffect(() => {
    dialog.current
      ?.querySelector(`#command-${selected}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  function open(trigger?: HTMLElement) {
    if (document.querySelector("dialog[open]")) return;
    opener.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    restoreFocus.current = true;
    setQuery("");
    setSelected(0);
    dialog.current?.showModal();
    input.current?.focus();
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const commands = useMemo(() => {
    const items = [
      { label: "新建 Markdown 片段", hint: "创作", href: "/new?type=markdown" },
      { label: "新建代码片段", hint: "创作", href: "/new?type=code" },
      { label: "新建纯文本片段", hint: "创作", href: "/new?type=plain" },
      {
        label: "打开本机草稿库",
        hint: "本机资料库",
        href: "/recent?tab=drafts",
      },
      {
        label: "查看分享记录",
        hint: "本机资料库",
        href: "/recent?tab=history",
      },
      {
        label: "打开收藏夹",
        hint: "本机资料库",
        href: "/recent?tab=bookmarks",
      },
      { label: "浏览灵感模板", hint: `${templates.length} 个模板`, href: "/templates" },
      { label: "逛逛公开广场", hint: "发现", href: "/public" },
      { label: "查看开发者 API", hint: "接口文档", href: "/api-docs" },
      { label: "切换浅色 / 深色", hint: "外观", action: "theme" },
      { label: "外观跟随系统", hint: "自动适配", action: "system" },
    ];
    if (path === "/new" || path.startsWith("/edit/"))
      items.push(
        ...[
          { label: "在编辑器中查找", hint: "编辑工具", action: "find" },
          { label: "查找并替换", hint: "编辑工具", action: "replace" },
          { label: "打开编辑工具箱", hint: "排版 · 行处理 · 文本转换", action: "tools" },
          { label: "切换专注模式", hint: "编辑工具", action: "focus" },
          { label: "下载当前编辑内容", hint: "编辑工具", action: "download" },
          { label: "保存当前草稿", hint: "Ctrl / ⌘ S", action: "save" },
        ],
      );
    return items;
  }, [path]);
  const results = commands.filter((c) =>
    `${c.label} ${c.hint}`.toLowerCase().includes(query.toLowerCase()),
  );
  function execute(index: number) {
    const command = results[index];
    if (!command) return;
    restoreFocus.current = false;
    dialog.current?.close();
    if ("href" in command && command.href) router.push(command.href);
    else if ("action" in command) {
      if (command.action === "theme" || command.action === "system") {
        const theme =
          command.action === "system"
            ? "system"
            : document.documentElement.dataset.theme === "dark"
              ? "light"
              : "dark";
        try {
          localStorage.setItem("march7th-theme-v1", theme);
        } catch {}
        document.documentElement.dataset.theme =
          theme === "system"
            ? matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
            : theme;
        window.dispatchEvent(new Event("march7th-theme"));
      } else
        window.dispatchEvent(
          new CustomEvent("march7th-editor-command", {
            detail: { action: command.action },
          }),
        );
    }
  }
  return (
    <>
      <button
        type="button"
        className="icon-button command-trigger"
        aria-label="打开快捷命令（Ctrl 或 Command K）"
        title="快捷命令 · Ctrl / ⌘ K"
        onClick={(event) => open(event.currentTarget)}
      >
        <Icon name="search" />
      </button>
      <dialog
        ref={dialog}
        className="app-dialog command-dialog"
        aria-labelledby="command-dialog-title"
        onClose={() => {
          if (restoreFocus.current && opener.current?.isConnected)
            opener.current.focus({ preventScroll: true });
        }}
      >
        <div className="dialog-heading">
          <h2 id="command-dialog-title">想去哪里，或者做点什么</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭快捷命令"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <label className="search-field">
          <Icon name="search" />
          <input
            ref={input}
            role="combobox"
            aria-label="搜索快捷命令"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={
              results[selected] ? `command-${selected}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="搜索页面、操作或外观…"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((v) => Math.min(v + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((v) => Math.max(0, v - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                execute(selected);
              }
            }}
          />
        </label>
        <div
          id="command-results"
          role="listbox"
          className="command-results"
          aria-label="可用命令"
        >
          {results.map((c, i) => (
            <button
              role="option"
              aria-selected={selected === i}
              id={`command-${i}`}
              type="button"
              key={c.label}
              className={selected === i ? "selected" : ""}
              onMouseMove={() => setSelected(i)}
              onClick={() => execute(i)}
            >
              <span>{c.label}</span>
              <small>{c.hint}</small>
            </button>
          ))}
          {!results.length && (
            <p className="muted">没有找到命令，换个关键词试试。</p>
          )}
        </div>
        <div className="command-footer">
          <span>↑ ↓ 选择 · Enter 执行 · Esc 关闭</span>
          <kbd>Ctrl / ⌘ K</kbd>
        </div>
        <details className="shortcut-help">
          <summary>编辑器快捷键</summary>
          <p>
            <kbd>Ctrl / ⌘ Enter</kbd> 提交片段　<kbd>Ctrl / ⌘ S</kbd>{" "}
            保存本机草稿
          </p>
          <p>
            <kbd>Esc</kbd> 退出专注模式或关闭对话框
          </p>
          <p className="muted">正在中文输入时不会触发提交。</p>
        </details>
      </dialog>
    </>
  );
}
