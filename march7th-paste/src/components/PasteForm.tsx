"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type DragEvent,
} from "react";

import { Icon, type IconName } from "@/components/Icon";
import { PasteSuccess, type CreatedPaste } from "@/components/PasteSuccess";
import {
  EditorTools,
  useEditorPreferences,
  type EditorCommand,
} from "@/components/EditorTools";
import {
  useEditorDrafts,
  type DraftVersion,
} from "@/components/EditorToolsDrafts";
import {
  rememberPaste,
  type DraftDocument,
  type DraftFields,
} from "@/lib/client-storage";
import {
  createHistory,
  cursorStatistics,
  editorFilename,
  insertMarkdownStructure,
  moveHistory,
  recordHistory,
  transformJson,
  type MarkdownStructure,
  type TextEdit,
  type TextRange,
} from "@/lib/editor-tools";
import { templates } from "@/lib/templates";
import { runEditorOperation, type EditorOperation } from "@/lib/editor-operations";
import { EditorDocumentPanel } from "@/components/EditorDocumentPanel";
import { escapeHtml, htmlDocument, htmlExportBody, sourceRange, textareaRange } from "@/lib/editor-document";
import { MAX_CONTENT_LENGTH } from "@/lib/validation";

const MarkdownPreview = memo(dynamic(
  () =>
    import("@/components/MarkdownView").then((module) => module.MarkdownView),
  { loading: () => <p className="muted">正在载入预览…</p>, ssr: false },
));
const CodePreview = memo(dynamic(
  () => import("@/components/CodeView").then((module) => module.CodeView),
  { loading: () => <p className="muted">正在载入代码预览…</p>, ssr: false },
));
const PREVIEW_LIMIT = 100_000;
const noSubscription = () => () => {};
const smallScreenSnapshot = () =>
  window.matchMedia("(max-width: 600px)").matches;
const subscribeScreen = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 600px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

type ContentType = "markdown" | "code" | "plain";
type ViewMode = "edit" | "preview" | "split";
type FormState = {
  title: string;
  content: string;
  contentType: ContentType;
  language: string;
  visibility: "unlisted" | "public";
  password: string;
  burnAfterRead: boolean;
};
type PasteFormProps = {
  initialTool?: string;
  mode: "create" | "edit";
  slug?: string;
  token?: string;
  draftId?: string;
  initial?: {
    title: string;
    content: string;
    contentType: string;
    language: string | null;
    visibility: string;
    password?: string;
    burnAfterRead?: boolean;
    expireAt?: string | null;
    hasPassword?: boolean;
  };
};
type ApiResult = {
  error?: string;
  url?: string;
  rawUrl?: string;
  rawMarkdownUrl?: string;
  editUrl?: string;
  deleteUrl?: string;
  paste?: {
    slug: string;
    title: string;
    contentType: string;
    createdAt: string;
    expireAt: string | null;
    burnAfterRead: boolean;
  };
};

const emptyPaste: FormState = {
  title: "",
  content: "",
  contentType: "markdown",
  language: "",
  visibility: "unlisted",
  password: "",
  burnAfterRead: false,
};
const typeOptions: { value: ContentType; label: string; icon: IconName }[] = [
  { value: "markdown", label: "Markdown", icon: "markdown" },
  { value: "code", label: "代码", icon: "code" },
  { value: "plain", label: "纯文本", icon: "text" },
];
const languages = [
  ["", "不高亮"],
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["python", "Python"],
  ["json", "JSON"],
  ["html", "HTML"],
  ["xml", "XML"],
  ["css", "CSS"],
  ["sql", "SQL"],
  ["yaml", "YAML"],
  ["bash", "Shell"],
  ["rust", "Rust"],
  ["go", "Go"],
  ["java", "Java"],
  ["cpp", "C / C++"],
] as const;
const codeExtensions: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  xml: "xml",
  vue: "xml",
  svelte: "xml",
  css: "css",
  scss: "css",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  rs: "rust",
  go: "go",
  java: "java",
  c: "cpp",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  ps1: "powershell",
  toml: "ini",
};
const fileAccept = [
  ".md",
  ".markdown",
  ".txt",
  ".log",
  ...Object.keys(codeExtensions).map((extension) => `.${extension}`),
].join(",");

function normalizeType(value?: string): ContentType {
  return value === "code" || value === "plain" ? value : "markdown";
}

function byteLength(content: string) {
  return new TextEncoder().encode(content).byteLength;
}

function guessLanguage(content: string) {
  const text = content.slice(0, 10000).trim();
  if (/^\s*[\[{]/.test(text)) {
    try {
      JSON.parse(content);
      return "json";
    } catch {
      /* Continue with syntax hints. */
    }
  }
  if (
    /\b(interface\s+\w+|type\s+\w+\s*=|:\s*(string|number|boolean)\b)/.test(
      text,
    )
  )
    return "typescript";
  if (/\b(def\s+\w+|print\(|elif\s|self\.)/.test(text)) return "python";
  if (/\b(import|export|const|let|function|console\.log)\b/.test(text))
    return "javascript";
  if (
    /\b(select|insert|update|delete)\b[\s\S]*\b(from|into|set|where)\b/i.test(
      text,
    )
  )
    return "sql";
  if (/^#!.*\b(ba)?sh\b|\b(sudo|curl|grep)\b/.test(text)) return "bash";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return "html";
  if (/[.#][\w-]+\s*\{/.test(text)) return "css";
  if (/\b(fn main|let mut|impl|println!)\b/.test(text)) return "rust";
  if (/\b(package main|func main|fmt\.)/.test(text)) return "go";
  if (/\b(public class|System\.out\.println)/.test(text)) return "java";
  if (/#include|std::|printf\(/.test(text)) return "cpp";
  if (/^[\w.-]+:\s+/m.test(text)) return "yaml";
  return "";
}

export function PasteForm({
  initialTool,
  mode,
  slug,
  token,
  draftId,
  initial,
}: PasteFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    title: initial?.title ?? "",
    content: initial?.content ?? "",
    contentType: normalizeType(initial?.contentType),
    language: initial?.language ?? "",
    visibility: initial?.visibility === "public" ? "public" : "unlisted",
    password: initial?.password ?? "",
    burnAfterRead: Boolean(initial?.burnAfterRead),
  }));
  const [expiresIn, setExpiresIn] = useState(
    mode === "edit" ? "keep" : "never",
  );
  const [viewPreference, setViewMode] = useState<ViewMode | null>(null);
  const smallScreen = useSyncExternalStore(
    subscribeScreen,
    smallScreenSnapshot,
    () => false,
  );
  const viewMode: ViewMode = viewPreference ?? (smallScreen ? "edit" : "split");
  const [wrapLines, setWrapLines] = useState(true);
  const [focused, setFocused] = useState(false);
  const [autoSave, setAutoSave] = useState(mode === "create");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [created, setCreated] = useState<CreatedPaste | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [history, setHistory] = useState(() =>
    createHistory(initial?.content ?? ""),
  );
  const [selection, setSelection] = useState<TextRange>({ start: 0, end: 0 });
  const [textViewport, setTextViewport] = useState({ top: 0, height: 370 });
  const [settingsOpen, setSettingsOpen] = useState<boolean | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"share" | "document">("share");
  const [splitRatio, setSplitRatio] = useState(50);
  const [scrollSync, setScrollSync] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const syncTarget = useRef<{ element: HTMLElement; top: number } | null>(null);
  const { preferences, updatePreferences } = useEditorPreferences();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const importingRef = useRef(false);
  const finishedRef = useRef(false);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const sensitive =
    mode === "edit" ||
    Boolean(initial?.hasPassword) ||
    form.password.length > 0 ||
    form.burnAfterRead;
  const storageReady = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const onMessage = useCallback((message: string, failure = false) => {
    if (failure) setError(message);
    else {
      setNotice(message);
      setError("");
    }
  }, []);
  const restoreDraft = useCallback((draft: DraftDocument) => {
    dirtyRef.current = true;
    setForm({
      title: draft.title,
      content: draft.content,
      contentType: normalizeType(draft.contentType),
      language: draft.language,
      visibility: draft.visibility === "public" ? "public" : "unlisted",
      password: "",
      burnAfterRead: false,
    });
    setExpiresIn(draft.expiresIn);
    setHistory(createHistory(draft.content));
    setSelection({ start: 0, end: 0 });
  }, []);
  const draftFields = useMemo<DraftFields>(
    () => ({
      title: form.title,
      content: form.content,
      contentType: form.contentType,
      language: form.language,
      visibility: form.visibility,
      expiresIn: expiresIn === "keep" ? "never" : expiresIn,
    }),
    [
      expiresIn,
      form.content,
      form.contentType,
      form.language,
      form.title,
      form.visibility,
    ],
  );
  const drafts = useEditorDrafts({
    mode,
    draftId,
    fields: draftFields,
    sensitive,
    autoSave,
    busy: saving || importing,
    completed: submitted || Boolean(created) || editSaved,
    onRestore: restoreDraft,
    onMessage,
  });
  const {
    save: saveLocalDraft,
    currentVersion,
    removeSubmitted,
    markSensitive,
    startNew: startNewDraft,
  } = drafts;
  const draftBlocked = !drafts.ready;
  const locked =
    saving || submitted || importing || draftBlocked || !storageReady;
  const bytes = useMemo(() => byteLength(form.content), [form.content]);
  const deferredContent = useDeferredValue(form.content);
  const previewContent = deferredContent.slice(0, PREVIEW_LIMIT);
  const previewTruncated = deferredContent.length > PREVIEW_LIMIT;
  const lines = useMemo(
    () => (form.content ? form.content.split("\n").length : 0),
    [form.content],
  );
  const cursor = useMemo(
    () => cursorStatistics(form.content, selection),
    [form.content, selection],
  );
  const editorFontSize = Math.max(smallScreen ? 16 : 14, preferences.fontSize);
  const lineHeight = editorFontSize * 1.8;
  const firstVisibleLine = Math.max(
    0,
    Math.floor(textViewport.top / lineHeight) - 1,
  );
  const visibleLineCount = Math.min(
    200,
    Math.ceil(textViewport.height / lineHeight) + 4,
  );
  const gutterLines = Array.from(
    {
      length: Math.max(
        0,
        Math.min(visibleLineCount, Math.max(1, lines) - firstVisibleLine),
      ),
    },
    (_, index) => firstVisibleLine + index + 1,
  ).join("\n");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!focused) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previous = document.body.style.overflow;
    const inertStates = new Map<HTMLElement, boolean>();
    const ancestors: HTMLElement[] = [];
    let branch: HTMLElement = workspace;
    while (branch.parentElement && branch !== document.body) {
      const parent = branch.parentElement;
      ancestors.push(parent);
      for (const sibling of parent.children) {
        // A native modal escapes inherited inertness; do not explicitly inert the dialog itself.
        if (
          sibling === branch ||
          !(sibling instanceof HTMLElement) ||
          sibling instanceof HTMLDialogElement
        )
          continue;
        inertStates.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      branch = parent;
    }
    document.body.style.overflow = "hidden";
    if (!workspace.contains(document.activeElement))
      (textareaRef.current ?? workspace).focus({ preventScroll: true });
    function containTab(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key !== "Tab" ||
        document.querySelector("dialog[open]")
      )
        return;
      const controls = Array.from(
        workspace!.querySelectorAll<HTMLElement>(
          "a[href], button, input, textarea, select, summary, [tabindex]",
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          !element.closest("[inert]") &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        workspace!.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === workspace ||
          !workspace!.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !workspace!.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    // Cover siblings mounted while focus mode is active without hiding native command dialogs.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations)
        for (const added of mutation.addedNodes) {
          if (
            !(added instanceof HTMLElement) ||
            added.contains(workspace) ||
            added === workspace ||
            added instanceof HTMLDialogElement ||
            inertStates.has(added)
          )
            continue;
          inertStates.set(added, added.inert);
          added.inert = true;
        }
    });
    ancestors.forEach((ancestor) =>
      observer.observe(ancestor, { childList: true }),
    );
    document.addEventListener("keydown", containTab);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", containTab);
      inertStates.forEach((value, element) => {
        element.inert = value;
      });
      document.body.style.overflow = previous;
      if (
        trigger?.isConnected &&
        !trigger.closest("[inert]") &&
        !document.querySelector("dialog[open]")
      )
        trigger.focus({ preventScroll: true });
    };
  }, [focused]);

  function updateForm(
    patch: Partial<FormState>,
    group?: string,
    range?: TextRange,
  ) {
    if (
      pendingRef.current ||
      importingRef.current ||
      finishedRef.current ||
      draftBlocked
    )
      return;
    if (
      patch.content !== undefined &&
      byteLength(patch.content) > MAX_CONTENT_LENGTH
    ) {
      setError("正文最多 512 KiB，本次输入未插入；现有正文仍保留。");
      return;
    }
    const next = { ...form, ...patch };
    dirtyRef.current = true;
    markSensitive(
      mode === "edit" ||
        Boolean(initial?.hasPassword) ||
        next.password.length > 0 ||
        next.burnAfterRead,
    );
    if (patch.content !== undefined) {
      const nextSelection = range ?? {
        start: textareaRef.current?.selectionStart ?? patch.content.length,
        end: textareaRef.current?.selectionEnd ?? patch.content.length,
      };
      setHistory((current) =>
        recordHistory(current, patch.content!, nextSelection, { group }),
      );
      setSelection(nextSelection);
    }
    setForm(next);
    setError("");
  }

  const selectRange = useCallback(
    (range: TextRange, sourceContent = form.content) => {
      setSelection(range);
      setHistory((current) => ({
        ...current,
        present: { ...current.present, selection: range },
      }));
      if (viewMode === "preview") setViewMode("edit");
      window.requestAnimationFrame(() => {
        const area = textareaRef.current;
        if (!area) return;
        area.focus({ preventScroll: true });
        const normalizedRange = textareaRange(sourceContent, range);
        area.setSelectionRange(normalizedRange.start, normalizedRange.end);
        if (area.wrap === "off") {
          const line = cursorStatistics(area.value, normalizedRange).line;
          const top = (line - 1) * lineHeight;
          if (
            top < area.scrollTop ||
            top > area.scrollTop + area.clientHeight - lineHeight
          )
            area.scrollTop = Math.max(0, top - area.clientHeight / 2);
        }
      });
    },
    [form.content, lineHeight, viewMode],
  );

  function applyEdit(edit: TextEdit) {
    if (locked) return;
    updateForm({ content: edit.content }, undefined, edit.selection);
    selectRange(edit.selection, edit.content);
  }

  const navigateHistory = useCallback(
    (direction: "undo" | "redo") => {
      if (
        locked ||
        pendingRef.current ||
        importingRef.current ||
        finishedRef.current
      )
        return;
      const next = moveHistory(history, direction);
      if (next === history) return;
      dirtyRef.current = true;
      setHistory(next);
      setForm((current) => ({ ...current, content: next.present.content }));
      setError("");
      selectRange(next.present.selection, next.present.content);
    },
    [history, locked, selectRange],
  );

  function insertStructure(kind: MarkdownStructure) {
    const result = insertMarkdownStructure(form.content, selection, kind);
    if (result.ok) applyEdit(result.value);
    else onMessage(result.message, true);
  }

  function jsonTool(action: "format" | "minify" | "validate") {
    const result = transformJson(form.content, action);
    if (!result.ok) {
      onMessage(result.message, true);
      return;
    }
    if (action !== "validate")
      applyEdit({
        content: result.value.content,
        selection: { start: 0, end: 0 },
      });
    onMessage(result.value.message);
  }

  const downloadContent = useCallback(() => {
    if (locked || !form.content) return;
    const url = URL.createObjectURL(
      new Blob([form.content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = editorFilename(
      form.title,
      form.contentType,
      form.language,
    );
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("完整正文已下载到本机，未发布到服务器。");
  }, [form.content, form.contentType, form.language, form.title, locked]);

  function navigateDocument(range: TextRange) {
    if (locked) return;
    selectRange(range);
    window.requestAnimationFrame(() => {
      const area = textareaRef.current;
      if (!area) return;
      if (smallScreen) area.scrollIntoView({ block: "center", behavior: "auto" });
      if (area.wrap === "off") return;
      const style = window.getComputedStyle(area);
      const mirror = document.createElement("div");
      for (const property of ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "tab-size", "padding", "word-break", "overflow-wrap"]) mirror.style.setProperty(property, style.getPropertyValue(property));
      Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", left: "0", top: "0", width: `${area.clientWidth}px`, boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
      mirror.textContent = area.value.slice(0, textareaRange(form.content, range).start);
      const marker = document.createElement("span"); marker.textContent = "\u200b"; mirror.append(marker);
      document.body.append(mirror);
      const top = marker.offsetTop;
      mirror.remove();
      area.scrollTop = Math.max(0, top - area.clientHeight / 3);
      setTextViewport({ top: area.scrollTop, height: area.clientHeight });
    });
  }

  function synchronizeScroll(source: HTMLElement, target: HTMLElement | null) {
    if (!scrollSync || viewMode !== "split" || !target) return;
    const expected = syncTarget.current;
    if (expected?.element === source && Math.abs(source.scrollTop - expected.top) < 2) { syncTarget.current = null; return; }
    const available = source.scrollHeight - source.clientHeight;
    const top = available > 0 ? source.scrollTop / available * (target.scrollHeight - target.clientHeight) : 0;
    target.scrollTop = top;
    syncTarget.current = { element: target, top: target.scrollTop };
  }

  async function copyContent() {
    if (locked || !form.content) return;
    try { await navigator.clipboard.writeText(form.content); onMessage("完整正文已复制。"); }
    catch { onMessage("浏览器未允许复制，请在正文中选择后复制。", true); }
  }

  function exportHtml() {
    if (locked || !form.content) return;
    if (form.content.length > PREVIEW_LIMIT) { onMessage("HTML 导出最多支持 100,000 字符，请下载源文以保留完整内容。", true); return; }
    let body = "";
    if (form.contentType === "markdown") {
      const rendered = previewRef.current?.querySelector<HTMLElement>(".prose-paste");
      if (viewMode === "edit" || deferredContent !== form.content || !rendered) { setViewMode("preview"); onMessage("已打开预览，请待预览完成后再次点击「导出 HTML」。"); return; }
      body = htmlExportBody(rendered);
    } else body = `<pre>${escapeHtml(form.content)}</pre>`;
    const url = URL.createObjectURL(new Blob([htmlDocument(form.title, body)], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = editorFilename(form.title, "plain", "").replace(/\.[^.]+$/, "") + ".html"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onMessage("HTML 已导出到本机；图片保留说明，公式保留 LaTeX 源文。");
  }

  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    const update = () =>
      setTextViewport({ top: area.scrollTop, height: area.clientHeight });
    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(area);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewMode, focused, editorFontSize, preferences.lineNumbers]);

  const submit = useCallback(async () => {
    if (
      pendingRef.current ||
      importingRef.current ||
      finishedRef.current ||
      draftBlocked ||
      !storageReady
    )
      return;
    const nulField = ([["标题", form.title], ["正文", form.content], ["代码语言", form.language]] as const)
      .find(([, value]) => value.includes("\u0000"));
    if (nulField) {
      setError(`${nulField[0]}含有 NUL（U+0000）空字符，服务器无法保存。请手动移除后再分享；当前内容保持原样。`);
      return;
    }
    if (!form.content.length) {
      setError("先写一点内容，再把它分享出去。");
      textareaRef.current?.focus();
      return;
    }
    if (byteLength(form.content) > MAX_CONTENT_LENGTH) {
      setError("正文超过 512 KiB，请精简后再提交。");
      return;
    }
    if (mode === "edit" && (!slug || !token)) {
      setError("缺少有效管理密钥，请使用完整的编辑链接。");
      return;
    }

    pendingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    // Capture this draft's exact revision; never remove a sibling or newer version.
    let submittedDraft: DraftVersion | null = null;
    if (!sensitive && autoSave) {
      const saved = await saveLocalDraft(false, false, true);
      if (saved) submittedDraft = { id: saved.id, revision: saved.revision };
    }
    if (!sensitive) submittedDraft ??= currentVersion(draftFields);
    if (!mountedRef.current) {
      pendingRef.current = false;
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        mode === "create" ? "/api/pastes" : `/api/pastes/${slug}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "x-edit-token": token } : {}),
          },
          body: JSON.stringify({
            ...form,
            ...(expiresIn !== "keep" ? { expiresIn } : {}),
          }),
          signal: controller.signal,
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as ApiResult | null;
      if (!mountedRef.current) return;
      if (!response.ok) {
        const message =
          response.status === 429
            ? "创建过于频繁，请稍后再试。"
            : response.status === 403
              ? "管理密钥无效，请检查编辑链接。"
              : response.status === 404
                ? "这份片段已不可用，可能已过期或被销毁。"
                : response.status === 400
                  ? "内容或分享设置不符合要求，请检查后重试。"
                  : "暂时无法保存，请稍后重试。正文仍保留在编辑器中。";
        throw new Error(message);
      }
      if (
        !payload?.paste ||
        (mode === "create" &&
          (!payload.url ||
            !payload.rawUrl ||
            !payload.editUrl ||
            !payload.deleteUrl))
      ) {
        throw new Error(
          "服务器未返回完整结果。请先确认是否创建成功，再决定是否重试。",
        );
      }
      finishedRef.current = true;
      setSubmitted(true);
      void removeSubmitted(submittedDraft);
      rememberPaste({
        slug: payload.paste.slug,
        title: payload.paste.title,
        contentType: payload.paste.contentType,
        createdAt: payload.paste.createdAt,
        expireAt: payload.paste.expireAt,
        burnAfterRead: payload.paste.burnAfterRead,
      });
      setFocused(false);
      if (mode === "create") {
        setCreated({
          slug: payload.paste.slug,
          title: payload.paste.title,
          url: payload.url!,
          rawUrl: payload.rawUrl!,
          rawMarkdownUrl: payload.rawMarkdownUrl ?? `${payload.rawUrl}.md`,
          editUrl: payload.editUrl!,
          deleteUrl: payload.deleteUrl!,
          createdAt: payload.paste.createdAt,
          expireAt: payload.paste.expireAt,
          burnAfterRead: payload.paste.burnAfterRead,
        });
      } else if (payload.paste.burnAfterRead) {
        setEditSaved(true);
      } else {
        router.push(`/p/${slug}`);
      }
    } catch (caught) {
      if (mountedRef.current)
        setError(
          controller.signal.aborted
            ? "请求超时或已中止。服务端可能已经保存，请先确认结果；正文仍保留在编辑器中。"
            : caught instanceof TypeError
              ? "网络暂时不可用，正文仍保留在编辑器中。请检查连接后重试。"
              : caught instanceof Error
                ? caught.message
                : "暂时无法保存，正文仍保留在编辑器中。",
        );
    } finally {
      window.clearTimeout(timeout);
      controllerRef.current = null;
      pendingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [
    autoSave,
    currentVersion,
    draftFields,
    draftBlocked,
    expiresIn,
    form,
    mode,
    router,
    removeSubmitted,
    saveLocalDraft,
    sensitive,
    slug,
    storageReady,
    token,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector("dialog[open]") ||
        created ||
        editSaved
      )
        return;
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-paste-editor]")
      )
        return;
      if (event.key === "Escape") {
        setFocused(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveLocalDraft(true);
      }
      if (
        event.target === textareaRef.current &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        navigateHistory(event.shiftKey ? "redo" : "undo");
      }
      if (
        event.target === textareaRef.current &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        navigateHistory("redo");
      }
    }
    function command(event: Event) {
      if (created || editSaved || submitted) return;
      const action = (event as CustomEvent<{ action?: EditorCommand }>).detail
        ?.action;
      if (action === "focus") setFocused((value) => !value);
      if (action === "download") downloadContent();
      if (action === "save") void saveLocalDraft(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("march7th-editor-command", command);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("march7th-editor-command", command);
    };
  }, [
    created,
    downloadContent,
    editSaved,
    navigateHistory,
    saveLocalDraft,
    submit,
    submitted,
  ]);

  function loadTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template || locked) return;
    if (
      dirtyRef.current &&
      (form.title || form.content) &&
      !window.confirm("载入模板会替换当前标题和正文。确定继续吗？")
    )
      return;
    updateForm({
      title: template.title,
      content: template.content,
      contentType: template.type,
      language: template.language,
    });
    setNotice(`已载入「${template.name}」，分享设置保持不变。`);
  }

  function insertText(
    text: string,
    start?: number,
    end?: number,
    selectionOffset = 0,
    selectionLength?: number,
  ) {
    const area = textareaRef.current;
    const selected = area ? sourceRange(form.content, { start: area.selectionStart, end: area.selectionEnd }) : { start: form.content.length, end: form.content.length };
    const from = start ?? selected.start;
    const to = end ?? selected.end;
    const content = form.content.slice(0, from) + text + form.content.slice(to);
    if (byteLength(content) > MAX_CONTENT_LENGTH) {
      setError("插入后将超过 512 KiB，请精简内容后重试。");
      return;
    }
    applyEdit({
      content,
      selection: {
        start: from + selectionOffset,
        end:
          from +
          selectionOffset +
          (selectionLength ?? text.length - selectionOffset),
      },
    });
  }

  function format(kind: "bold" | "italic" | "link" | "list" | "code") {
    const area = textareaRef.current;
    if (!area || locked) return;
    const { start, end } = sourceRange(form.content, { start: area.selectionStart, end: area.selectionEnd });
    const selection = form.content.slice(start, end);
    if (kind === "list") {
      const from = form.content.lastIndexOf("\n", start - 1) + 1;
      const nextLine = form.content.indexOf("\n", end);
      const to = nextLine < 0 ? form.content.length : nextLine;
      const text = form.content
        .slice(from, to)
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
      insertText(text, from, to);
    } else if (kind === "link") {
      const label = selection || "链接文字";
      insertText(
        `[${label}](https://example.com)`,
        start,
        end,
        1,
        label.length,
      );
    } else if (kind === "code" && selection.includes("\n")) {
      insertText(
        `\n\`\`\`\n${selection}\n\`\`\`\n`,
        start,
        end,
        5,
        selection.length,
      );
    } else {
      const marker = kind === "bold" ? "**" : kind === "italic" ? "*" : "`";
      const text = selection || (kind === "code" ? "代码" : "文字");
      insertText(
        marker + text + marker,
        start,
        end,
        marker.length,
        text.length,
      );
    }
  }

  async function importFile(file: File) {
    if (
      pendingRef.current ||
      importingRef.current ||
      finishedRef.current ||
      draftBlocked
    )
      return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const markdown = extension === "md" || extension === "markdown";
    const plain = extension === "txt" || extension === "log";
    const language = codeExtensions[extension];
    if (!markdown && !plain && !language) {
      setError("请选择 .md、.txt 或常见代码文件；图片请先上传图床再粘贴链接。");
      return;
    }
    if (file.size > MAX_CONTENT_LENGTH) {
      setError("文件超过 512 KiB，请选择较小的 UTF-8 文本文件。");
      return;
    }
    if (form.content && !window.confirm("导入文件将替换当前正文，确定继续吗？"))
      return;
    importingRef.current = true;
    setImporting(true);
    setError("");
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (!mountedRef.current || pendingRef.current || finishedRef.current)
        return;
      if (byteLength(content) > MAX_CONTENT_LENGTH)
        throw new Error("文件正文超过 512 KiB，请精简后再导入。");
      dirtyRef.current = true;
      setHistory((current) =>
        recordHistory(current, content, { start: 0, end: 0 }),
      );
      setSelection({ start: 0, end: 0 });
      setForm((current) => ({
        ...current,
        content,
        title: current.title || file.name.replace(/\.[^.]+$/, "").slice(0, 200),
        contentType: markdown ? "markdown" : plain ? "plain" : "code",
        language: language ?? "",
      }));
      setNotice(`已导入 ${file.name}，正文不会上传到预览服务。`);
    } catch (caught) {
      if (mountedRef.current)
        setError(
          caught instanceof TypeError
            ? "无法按 UTF-8 读取文件，请转换编码后重试。"
            : caught instanceof Error
              ? caught.message
              : "文件读取失败，请重新选择。",
        );
    } finally {
      importingRef.current = false;
      if (mountedRef.current) setImporting(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = event.clipboardData.files[0];
    if (file) {
      event.preventDefault();
      void importFile(file);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (text) {
      event.preventDefault();
      insertText(text.replace(/\r\n?/g, "\n"));
    }
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      void importFile(file);
      return;
    }
    const text = event.dataTransfer.getData("text/plain");
    if (text) insertText(text.replace(/\r\n?/g, "\n"));
  }

  function startNew() {
    finishedRef.current = false;
    dirtyRef.current = false;
    markSensitive(false);
    startNewDraft();
    setCreated(null);
    setSubmitted(false);
    setForm({ ...emptyPaste });
    setExpiresIn("never");
    setHistory(createHistory(""));
    setSelection({ start: 0, end: 0 });
    setError("");
    setNotice("");
  }

  if (created) return <PasteSuccess paste={created} onNew={startNew} />;
  if (editSaved)
    return (
      <section className="panel success-panel">
        <header className="success-header">
          <span className="success-icon">
            <Icon name="check" size={24} />
          </span>
          <div>
            <h2>修改已保存</h2>
            <p>阅后即焚已开启，保存后不会自动打开正文。</p>
          </div>
        </header>
        <div className="success-actions">
          <a className="btn btn-primary" href="/recent">
            查看最近片段
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              finishedRef.current = false;
              setSubmitted(false);
              setEditSaved(false);
            }}
          >
            继续编辑
          </button>
        </div>
      </section>
    );

  return (
    <form
      data-paste-editor
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div
        ref={workspaceRef}
        className={`paste-workspace${focused ? " is-focused" : ""}`}
        role={focused ? "dialog" : undefined}
        aria-modal={focused ? true : undefined}
        aria-label={focused ? "片段编辑器专注模式" : undefined}
        tabIndex={focused ? -1 : undefined}
      >
        <div className="editor-main">
          {draftBlocked && (
            <p className="notice notice-info" role="status">
              正在打开本机草稿库…
            </p>
          )}
          {drafts.conflict && (
            <div
              className="notice notice-warning editor-draft-conflict"
              role="alert"
            >
              <div>
                这份草稿已被其它页面修改或删除。当前正文仍在编辑器中，自动保存已暂停。
              </div>
              <div className="editor-tool-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={locked || drafts.writing || sensitive}
                  onClick={() => {
                    void saveLocalDraft(true, true);
                  }}
                >
                  另存为新草稿
                </button>
                <a
                  className="btn btn-ghost btn-small"
                  href="/recent?tab=drafts"
                >
                  去草稿库
                </a>
              </div>
            </div>
          )}
          {error && (
            <div className="notice notice-error" role="alert">
              <Icon name="shield" />
              <div>{error}</div>
            </div>
          )}
          {notice && (
            <div className="notice notice-info" role="status">
              <div>{notice}</div>
              <button
                className="toolbar-button"
                type="button"
                aria-label="关闭提示"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <fieldset
            className="panel editor-panel"
            disabled={locked}
            style={{ padding: 0, margin: 0, minWidth: 0 }}
          >
            <legend className="sr-only">片段编辑器</legend>
            <label className="editor-title">
              <Icon name="file" size={20} />
              <span className="sr-only">标题</span>
              <input
                aria-label="标题"
                maxLength={200}
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                placeholder="为这段灵感起个名字…"
                autoComplete="off"
              />
            </label>
            <div className="editor-topbar">
              <div className="type-tabs" role="group" aria-label="内容类型">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      form.contentType === option.value ? "active" : ""
                    }
                    aria-pressed={form.contentType === option.value}
                    onClick={() => updateForm({ contentType: option.value })}
                  >
                    <Icon name={option.icon} size={15} />
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="editor-tools">
                {form.contentType === "code" && (
                  <select
                    className="toolbar-select"
                    aria-label="代码语言"
                    value={form.language}
                    onChange={(event) =>
                      updateForm({ language: event.target.value })
                    }
                  >
                    {!languages.some(([value]) => value === form.language) && (
                      <option value={form.language}>{form.language}</option>
                    )}
                    {languages.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className="toolbar-select"
                  aria-label="载入模板"
                  value=""
                  onChange={(event) => loadTemplate(event.target.value)}
                >
                  <option value="">从模板开始</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  className="toolbar-button"
                  type="button"
                  title="导入 UTF-8 文本或代码文件"
                  aria-label="导入文件"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="upload" size={15} />
                  <span>导入</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept={fileAccept}
                  aria-label="选择导入文件"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void importFile(file);
                  }}
                />
                <button
                  className="toolbar-button"
                  type="button"
                  aria-label={focused ? "退出专注模式" : "进入专注模式"}
                  title={focused ? "退出专注（Esc）" : "专注模式"}
                  aria-pressed={focused}
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setFocused(!focused);
                  }}
                >
                  <Icon name={focused ? "close" : "expand"} size={15} />
                </button>
              </div>
            </div>
            <div className="format-toolbar">
              {form.contentType === "markdown" ? (
                <>
                  <button
                    className="format-button"
                    type="button"
                    title="加粗"
                    aria-label="加粗"
                    disabled={viewMode === "preview"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format("bold")}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    className="format-button"
                    type="button"
                    title="斜体"
                    aria-label="斜体"
                    disabled={viewMode === "preview"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format("italic")}
                  >
                    <em>I</em>
                  </button>
                  <button
                    className="format-button"
                    type="button"
                    title="插入链接"
                    aria-label="插入链接"
                    disabled={viewMode === "preview"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format("link")}
                  >
                    <Icon name="link" size={14} />
                  </button>
                  <button
                    className="format-button"
                    type="button"
                    title="无序列表"
                    aria-label="无序列表"
                    disabled={viewMode === "preview"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format("list")}
                  >
                    <Icon name="text" size={14} />
                  </button>
                  <button
                    className="format-button"
                    type="button"
                    title="代码"
                    aria-label="插入代码"
                    disabled={viewMode === "preview"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format("code")}
                  >
                    <Icon name="code" size={15} />
                  </button>
                  <span className="toolbar-divider" />
                  {([ ["heading2", "二级标题", "H₂"], ["task", "任务列表", "☑"], ["quote", "引用段落", "❞"], ["formula", "数学公式", "∑"] ] as const).map(([kind, label, symbol]) => <button key={kind} type="button" className="format-button" title={label} aria-label={label} disabled={viewMode === "preview"} onMouseDown={(event) => event.preventDefault()} onClick={() => insertStructure(kind)}>{symbol}</button>)}
                </>
              ) : form.contentType === "code" ? (
                <button
                  className="toolbar-button"
                  type="button"
                  onClick={() => {
                    const language = guessLanguage(form.content);
                    updateForm({ language });
                    setNotice(
                      language
                        ? `已识别为 ${language}。`
                        : "未识别语言，将按纯文本预览。",
                    );
                  }}
                >
                  识别语言
                </button>
              ) : (
                <span className="muted">纯文本</span>
              )}
              <button
                className="toolbar-button"
                type="button"
                disabled={preferences.lineNumbers}
                title={
                  preferences.lineNumbers
                    ? "逻辑行号开启时按源文行显示；关闭行号后可自动换行"
                    : wrapLines
                      ? "关闭自动换行"
                      : "开启自动换行"
                }
                aria-label="自动换行"
                aria-pressed={wrapLines && !preferences.lineNumbers}
                onClick={() => setWrapLines(!wrapLines)}
              >
                <Icon name="text" size={14} />
              </button>
              <div className="view-tabs" role="group" aria-label="编辑视图">
                {(
                  [
                    { value: "edit", label: "编辑", icon: "file" },
                    { value: "preview", label: "预览", icon: "eye" },
                    { value: "split", label: "分屏", icon: "split" },
                  ] as const
                ).map((view) => (
                  <button
                    key={view.value}
                    type="button"
                    className={viewMode === view.value ? "active" : ""}
                    aria-pressed={viewMode === view.value}
                    onClick={() => setViewMode(view.value)}
                  >
                    <Icon name={view.icon} size={13} />
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
            <EditorTools
              onDocument={() => { setSidebarTab("document"); if (smallScreen) window.requestAnimationFrame(() => sidebarRef.current?.scrollIntoView({ block: "start", behavior: "auto" })); }}
              layoutOptions={viewMode === "split" && <div className="editor-layout-options"><span><Icon name="split" size={14} />并排写作</span><label className="split-ratio-control">源文占比 <input type="range" min="35" max="65" step="5" value={splitRatio} aria-label="源文占比" onChange={(event) => setSplitRatio(Number(event.target.value))} /><output>{splitRatio}%</output></label><label className="sync-scroll-control"><input type="checkbox" checked={scrollSync} onChange={(event) => { setScrollSync(event.target.checked); syncTarget.current = null; }} />同步滚动 <span>按进度</span></label></div>}
              initialTool={initialTool}
              compact={false}
              content={form.content}
              contentType={form.contentType}
              selection={selection}
              disabled={locked}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              preferences={{
                ...preferences,
                fontSize: editorFontSize as typeof preferences.fontSize,
              }}
              onPreferences={updatePreferences}
              onUndo={() => navigateHistory("undo")}
              onRedo={() => navigateHistory("redo")}
              onEdit={applyEdit}
              onSelect={selectRange}
              onStructure={insertStructure}
              onJson={jsonTool}
              onDownload={downloadContent}
              onMessage={onMessage}
            />
            <div className={`editor-panes mode-${viewMode}`} style={viewMode === "split" && !smallScreen ? { gridTemplateColumns: `minmax(0, ${splitRatio}fr) minmax(0, ${100 - splitRatio}fr)` } : undefined}>
              {viewMode !== "preview" && (
                <div className="editor-input-pane">
                  <label className="pane-label" htmlFor="paste-content">
                    <span>
                      {form.contentType === "markdown"
                        ? "Markdown 源文"
                        : form.contentType === "code"
                          ? "代码源文"
                          : "文本内容"}
                    </span>
                    <span>UTF-8</span>
                  </label>
                  <div className="editor-textarea-row">
                    {preferences.lineNumbers && (
                      <div className="editor-line-gutter" aria-hidden="true">
                        <pre
                          style={{
                            fontSize: editorFontSize,
                            lineHeight: 1.8,
                            transform: `translateY(${firstVisibleLine * lineHeight - textViewport.top}px)`,
                          }}
                        >
                          {gutterLines}
                        </pre>
                      </div>
                    )}
                    <textarea
                      ref={textareaRef}
                      id="paste-content"
                      className={`content-textarea${wrapLines && !preferences.lineNumbers ? "" : " nowrap"}`}
                      wrap={
                        wrapLines && !preferences.lineNumbers ? "soft" : "off"
                      }
                      style={{
                        fontSize: editorFontSize,
                        lineHeight: 1.8,
                      }}
                      value={form.content}
                      spellCheck={false}
                      onKeyDown={(event) => {
                        if (locked || event.defaultPrevented || event.nativeEvent.isComposing || document.querySelector("dialog[open]")) return;
                        const modifier = event.ctrlKey || event.metaKey;
                        const key = event.key.toLowerCase();
                        let operation: EditorOperation | undefined;
                        if (modifier && !event.altKey && !event.shiftKey) {
                          if (key === "]") operation = "indent";
                          if (key === "[") operation = "outdent";
                          if (key === "d") operation = "duplicate-lines";
                          if (form.contentType === "markdown" && (key === "b" || key === "i")) {
                            event.preventDefault();
                            format(key === "b" ? "bold" : "italic");
                            return;
                          }
                        }
                        if (event.altKey && !modifier && !event.shiftKey) {
                          if (key === "arrowup") operation = "move-up";
                          if (key === "arrowdown") operation = "move-down";
                        }
                        if (!operation) return;
                        event.preventDefault();
                        const result = runEditorOperation(form.content, sourceRange(form.content, {
                          start: event.currentTarget.selectionStart,
                          end: event.currentTarget.selectionEnd,
                        }), operation);
                        if (!result.ok) onMessage(result.message, true);
                        else if (result.value.content !== form.content) applyEdit(result.value);
                      }}
                      onChange={(event) =>
                        updateForm({ content: event.target.value }, "typing", {
                          start: event.target.selectionStart,
                          end: event.target.selectionEnd,
                        })
                      }
                      onSelect={(event) => {
                        const range = sourceRange(form.content, {
                          start: event.currentTarget.selectionStart,
                          end: event.currentTarget.selectionEnd,
                        });
                        setSelection(range);
                        setHistory((current) => ({
                          ...current,
                          present: { ...current.present, selection: range },
                        }));
                      }}
                      onScroll={(event) => {
                        setTextViewport({
                          top: event.currentTarget.scrollTop,
                          height: event.currentTarget.clientHeight,
                        });
                        synchronizeScroll(event.currentTarget, previewRef.current);
                      }}
                      onPaste={handlePaste}
                      onDrop={handleDrop}
                      onDragOver={(event) => event.preventDefault()}
                      placeholder={
                        form.contentType === "markdown"
                          ? "# 从一个想法开始\n\n在这里写 Markdown、公式，或拖入一个文本文件…"
                          : form.contentType === "code"
                            ? "粘贴代码，或者拖入代码文件…"
                            : "在这里写下你想分享的内容…"
                      }
                    />
                  </div>
                </div>
              )}
              {viewMode !== "edit" && (
                <div className="editor-preview-pane" ref={previewRef} onScroll={(event) => synchronizeScroll(event.currentTarget, textareaRef.current)}>
                  <div className="pane-label">
                    <span>实时预览</span>
                    <span>
                      {deferredContent !== form.content
                        ? "更新中…"
                        : "仅本机渲染"}
                    </span>
                  </div>
                  {previewTruncated && (
                    <p className="preview-truncated">
                      为保持流畅，预览仅显示前 100,000
                      个字符；提交和草稿仍保留完整正文。
                    </p>
                  )}
                  {deferredContent.trim() ? (
                    form.contentType === "markdown" ? (
                      <MarkdownPreview
                        content={previewContent}
                        disableRemoteImages
                      />
                    ) : form.contentType === "code" ? (
                      <CodePreview
                        content={previewContent}
                        language={form.language}
                      />
                    ) : (
                      <pre className="document-plain">{previewContent}</pre>
                    )
                  ) : (
                    <div className="editor-preview-empty">
                      <Icon name="eye" size={34} />
                      <strong>灵感会在这里呈现</strong>
                      <p>
                        一边书写，一边看见。支持 Markdown、代码高亮与数学公式。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="editor-statusbar">
              <div>
                <span className="status-dot" />
                <span>
                  {importing
                    ? "正在导入…"
                    : saving
                      ? "正在保存…"
                      : sensitive
                        ? "敏感片段 · 不存草稿"
                        : autoSave
                          ? drafts.status || "本机草稿已开启"
                          : "本机自动保存已关闭"}
                </span>
              </div>
              <div>
                <span className="editor-cursor-status">
                  行 {cursor.line}，列 {cursor.column}
                  {cursor.selected > 0
                    ? ` · 已选 ${cursor.selected.toLocaleString()} 字符`
                    : ""}
                </span>
                <span>{form.content.length.toLocaleString()} 字符</span>
                <span
                  className={bytes > MAX_CONTENT_LENGTH ? "danger-text" : ""}
                >
                  {(bytes / 1024).toFixed(1)} / 512 KiB
                </span>
              </div>
            </div>
          </fieldset>
          <div className="editor-help">
            <span>
              <label>
                <input
                  type="checkbox"
                  checked={!sensitive && autoSave}
                  disabled={sensitive || locked}
                  onChange={(event) => setAutoSave(event.target.checked)}
                />
                在本机自动保存草稿 · 仅此浏览器
              </label>
            </span>
            <a href="/recent?tab=drafts">
              草稿库{drafts.active ? ` · r${drafts.active.revision}` : ""}
            </a>
            <span>⌘ / Ctrl + S 保存草稿 · Esc 退出专注</span>
          </div>
        </div>
        <aside className="editor-side-column" ref={sidebarRef} aria-label="片段辅助面板">
          <div className="editor-sidebar-tabs" role="group" aria-label="辅助面板"><button type="button" aria-pressed={sidebarTab === "share"} onClick={() => setSidebarTab("share")}><Icon name="share" size={15} />分享设置</button><button type="button" aria-pressed={sidebarTab === "document"} onClick={() => setSidebarTab("document")}><Icon name="list" size={15} />文档导航</button></div>
          <div hidden={sidebarTab !== "share"}>
          <details
            className="editor-settings-details"
            open={settingsOpen ?? !smallScreen}
          >
            <summary
              className="editor-settings-summary"
              onClick={(event) => {
                event.preventDefault();
                setSettingsOpen(!(settingsOpen ?? !smallScreen));
              }}
            >
              分享设置{" "}
              <span className="badge">
                {form.visibility === "public" ? "公开" : "仅链接"}
                {form.burnAfterRead ? " · 阅后即焚" : ""}
              </span>
            </summary>
            <fieldset
              className="panel editor-sidebar"
              disabled={locked}
              style={{ margin: 0, minWidth: 0 }}
            >
              <legend className="sr-only">分享设置</legend>
              <h2 className="sidebar-title">
                <Icon name="globe" size={16} />
                分享设置
              </h2>
              <label className="field">
                <span>
                  <Icon name="eye" size={14} />
                  谁可以看到
                </span>
                <select
                  value={form.visibility}
                  onChange={(event) =>
                    updateForm({
                      visibility:
                        event.target.value === "public" ? "public" : "unlisted",
                    })
                  }
                >
                  <option value="unlisted">仅持有链接的人</option>
                  <option value="public">公开 · 出现在公开片段</option>
                </select>
                <small>
                  {form.visibility === "public"
                    ? "密码保护或阅后即焚的片段不会进入公开列表。"
                    : "默认不出现在公开列表，获得链接的人仍可访问。"}
                </small>
              </label>
              <label className="field">
                <span>
                  <Icon name="clock" size={14} />
                  有效期
                </span>
                <select
                  value={expiresIn}
                  onChange={(event) => {
                    dirtyRef.current = true;
                    setExpiresIn(event.target.value);
                  }}
                >
                  {mode === "edit" && (
                    <option value="keep">保留现有有效期</option>
                  )}
                  <option value="never">永久有效</option>
                  <option value="1d">1 天</option>
                  <option value="7d">7 天</option>
                  <option value="30d">30 天</option>
                </select>
                <small>
                  {mode === "edit" && expiresIn === "keep"
                    ? initial?.expireAt
                      ? `当前：${new Date(initial.expireAt).toLocaleString("zh-CN")}`
                      : "当前：永久有效"
                    : "到期后，分享页、Raw 与 API 都将停止提供正文。"}
                </small>
              </label>
              <label className="field">
                <span>
                  <Icon name="lock" size={14} />
                  访问密码 <span className="muted">选填</span>
                </span>
                <input
                  type="password"
                  value={form.password}
                  maxLength={200}
                  autoComplete="new-password"
                  placeholder={
                    initial?.hasPassword ? "留空保留原密码" : "为分享加一道门"
                  }
                  onChange={(event) =>
                    updateForm({ password: event.target.value })
                  }
                />
                <small>
                  {mode === "edit"
                    ? "留空保留原密码；填写新密码会使旧解锁凭证失效。"
                    : "分享时请通过其他方式告知接收者，密码不会保存到本机草稿。"}
                </small>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={form.burnAfterRead}
                  onChange={(event) =>
                    updateForm({ burnAfterRead: event.target.checked })
                  }
                />
                <span>
                  <strong>
                    <Icon name="flame" size={13} /> 阅后即焚
                  </strong>
                  <small>
                    首次成功读取分享页、Raw 或 API
                    后链接失效，不保证擦除已保存的副本。
                  </small>
                </span>
              </label>
            </fieldset>
          </details>
          </div>
          {sidebarTab === "document" && <EditorDocumentPanel content={form.content} contentType={form.contentType} selection={selection} disabled={locked} onSelect={navigateDocument} onDownload={downloadContent} onHtml={exportHtml} onCopy={() => void copyContent()} />}
          <div className="submit-area editor-submit-area">
            <button
              className="btn btn-primary editor-submit"
              type="submit"
              disabled={
                locked || bytes > MAX_CONTENT_LENGTH || !form.content.length
              }
            >
              <Icon name={saving ? "clock" : "link"} size={16} />
              {saving
                ? "正在保存…"
                : submitted
                  ? "已保存，正在打开…"
                  : mode === "create"
                    ? "创建分享链接"
                    : "保存修改"}
            </button>
            <p className="sidebar-shortcut">
              ⌘ / Ctrl + Enter {mode === "create" ? "创建分享" : "保存修改"}
            </p>
          </div>
          {mode === "edit" && slug && token && (
            <a
              className="btn btn-ghost btn-small danger-text"
              href={`/delete/${slug}?key=${encodeURIComponent(token)}`}
            >
              管理删除
            </a>
          )}
          <p className="editor-sidebar-note">
            <Icon name="shield" size={15} />
            <span>
              请勿公开口令、访问令牌或个人隐私。
              {sensitive
                ? "当前片段的正文不会持久化到本机草稿。"
                : "本机草稿不跨设备，也不会保存访问密码或管理链接。"}
            </span>
          </p>
        </aside>
      </div>
    </form>
  );
}
