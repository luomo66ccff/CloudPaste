export const MAX_FIND_LENGTH = 256;
export const MAX_REPLACEMENT_LENGTH = 4096;
export const MAX_TOOL_BYTES = 512 * 1024;
export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
export const MAX_HISTORY_ENTRIES = 80;
export const EDITOR_PREFERENCES_KEY = "march7th-paste-editor-preferences-v3";

export type TextRange = { start: number; end: number };
export type TextEdit = { content: string; selection: TextRange };
export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };
export type SearchOptions = { query: string; caseSensitive: boolean };
export type EditorPreferences = {
  fontSize: 14 | 16 | 18;
  lineNumbers: boolean;
};
export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  fontSize: 14,
  lineNumbers: false,
};

export function utf8Bytes(content: string) {
  return new TextEncoder().encode(content).byteLength;
}
const oversized = (content: string) =>
  content.length > MAX_TOOL_BYTES || utf8Bytes(content) > MAX_TOOL_BYTES;

function searchExpression(options: SearchOptions): ToolResult<RegExp> {
  if (!options.query) return { ok: false, message: "请输入查找内容。" };
  if (options.query.length > MAX_FIND_LENGTH)
    return { ok: false, message: `查找内容最多 ${MAX_FIND_LENGTH} 个字符。` };
  return {
    ok: true,
    value: new RegExp(
      options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      options.caseSensitive ? "gu" : "giu",
    ),
  };
}

export function findText(
  content: string,
  options: SearchOptions,
  rangeLimit = 2000,
): ToolResult<{ ranges: TextRange[]; total: number; truncated: boolean }> {
  if (oversized(content))
    return {
      ok: false,
      message: "正文过大，请精简至 512 KiB 后使用查找工具。",
    };
  const parsed = searchExpression(options);
  if (!parsed.ok) return parsed;
  const ranges: TextRange[] = [];
  let total = 0;
  for (const match of content.matchAll(parsed.value)) {
    total++;
    if (ranges.length < Math.max(0, Math.min(rangeLimit, 10000)))
      ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return {
    ok: true,
    value: { ranges, total, truncated: total > ranges.length },
  };
}

export function nextTextMatch(
  content: string,
  options: SearchOptions,
  selection: TextRange,
  direction: "next" | "previous",
): ToolResult<TextRange | null> {
  if (oversized(content))
    return { ok: false, message: "正文过大，请精简后再查找。" };
  const parsed = searchExpression(options);
  if (!parsed.ok) return parsed;
  let first: TextRange | null = null;
  let last: TextRange | null = null;
  let previous: TextRange | null = null;
  for (const match of content.matchAll(parsed.value)) {
    const range = { start: match.index, end: match.index + match[0].length };
    first ??= range;
    if (direction === "next" && range.start >= selection.end)
      return { ok: true, value: range };
    if (range.start < selection.start) previous = range;
    last = range;
  }
  return { ok: true, value: direction === "next" ? first : (previous ?? last) };
}

export function replaceText(
  content: string,
  options: SearchOptions,
  replacement: string,
  selection: TextRange,
  all = false,
): ToolResult<TextEdit & { count: number }> {
  const parsed = searchExpression(options);
  if (!parsed.ok) return parsed;
  if (replacement.length > MAX_REPLACEMENT_LENGTH)
    return {
      ok: false,
      message: `替换内容最多 ${MAX_REPLACEMENT_LENGTH} 个字符。`,
    };
  if (oversized(content))
    return { ok: false, message: "正文过大，请精简后再替换。" };
  if (!all) {
    const text = content.slice(selection.start, selection.end);
    const exact = new RegExp(
      `^(?:${parsed.value.source})$`,
      options.caseSensitive ? "u" : "iu",
    );
    if (!text || !exact.test(text))
      return { ok: false, message: "先查找并选中一个匹配项，再替换当前项。" };
    const next =
      content.slice(0, selection.start) +
      replacement +
      content.slice(selection.end);
    if (utf8Bytes(next) > MAX_TOOL_BYTES)
      return { ok: false, message: "替换后将超过 512 KiB，正文未改动。" };
    return {
      ok: true,
      value: {
        content: next,
        selection: {
          start: selection.start,
          end: selection.start + replacement.length,
        },
        count: 1,
      },
    };
  }
  let count = 0;
  let size = utf8Bytes(content);
  const replacementSize = utf8Bytes(replacement);
  for (const match of content.matchAll(parsed.value)) {
    count++;
    size += replacementSize - utf8Bytes(match[0]);
    if (size > MAX_TOOL_BYTES)
      return { ok: false, message: "替换后将超过 512 KiB，正文未改动。" };
  }
  const next = content.replace(parsed.value, () => replacement);
  const cursor = Math.min(selection.start, next.length);
  return {
    ok: true,
    value: { content: next, selection: { start: cursor, end: cursor }, count },
  };
}

export type HistorySnapshot = TextEdit;
export type EditorHistory = {
  past: HistorySnapshot[];
  present: HistorySnapshot;
  future: HistorySnapshot[];
  group: string | null;
  timestamp: number;
};
const snapshotSize = (snapshot: HistorySnapshot) =>
  snapshot.content.length * 2 + 64;
export function historyBytes(history: EditorHistory) {
  return [...history.past, history.present, ...history.future].reduce(
    (sum, snapshot) => sum + snapshotSize(snapshot),
    0,
  );
}
function boundHistory(history: EditorHistory): EditorHistory {
  const past = [...history.past];
  const future = [...history.future];
  let size = [...past, history.present, ...future].reduce(
    (sum, snapshot) => sum + snapshotSize(snapshot),
    0,
  );
  while (
    (size > MAX_HISTORY_BYTES ||
      past.length + future.length > MAX_HISTORY_ENTRIES) &&
    (past.length || future.length)
  ) {
    const dropped = past.length ? past.shift()! : future.pop()!;
    size -= snapshotSize(dropped);
  }
  return { ...history, past, future };
}
export function createHistory(
  content: string,
  selection: TextRange = { start: 0, end: 0 },
): EditorHistory {
  return {
    past: [],
    present: { content, selection },
    future: [],
    group: null,
    timestamp: 0,
  };
}
export function recordHistory(
  history: EditorHistory,
  content: string,
  selection: TextRange,
  options: { group?: string; timestamp?: number } = {},
): EditorHistory {
  if (content === history.present.content)
    return { ...history, present: { content, selection } };
  const timestamp = options.timestamp ?? Date.now();
  const coalesce =
    options.group === "typing" &&
    history.group === "typing" &&
    timestamp >= history.timestamp &&
    timestamp - history.timestamp < 700 &&
    history.future.length === 0;
  return boundHistory({
    past: coalesce ? history.past : [...history.past, history.present],
    present: { content, selection },
    future: [],
    group: options.group ?? null,
    timestamp,
  });
}
export function moveHistory(
  history: EditorHistory,
  direction: "undo" | "redo",
): EditorHistory {
  if (direction === "undo") {
    if (!history.past.length) return history;
    return boundHistory({
      past: history.past.slice(0, -1),
      present: history.past.at(-1)!,
      future: [history.present, ...history.future],
      group: null,
      timestamp: 0,
    });
  }
  if (!history.future.length) return history;
  return boundHistory({
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    group: null,
    timestamp: 0,
  });
}

export type MarkdownStructure =
  | "heading1"
  | "heading2"
  | "heading3"
  | "task"
  | "quote"
  | "table"
  | "formula";
export function insertMarkdownStructure(
  content: string,
  selection: TextRange,
  kind: MarkdownStructure,
): ToolResult<TextEdit> {
  let from = selection.start;
  let to = selection.end;
  let replacement: string;
  if (kind === "table" || kind === "formula") {
    const chosen = content.slice(from, to);
    replacement =
      kind === "table"
        ? "\n\n| 项目 | 说明 |\n| --- | --- |\n| 内容 | 补充说明 |\n\n"
        : `\n\n$$\n${chosen || "E = mc^2"}\n$$\n\n`;
  } else {
    from = content.lastIndexOf("\n", Math.max(-1, selection.start - 1)) + 1;
    const lineEnd = content.indexOf(
      "\n",
      selection.end > selection.start && content[selection.end - 1] === "\n"
        ? selection.end - 1
        : selection.end,
    );
    to = lineEnd < 0 ? content.length : lineEnd;
    const prefix =
      kind === "task"
        ? "- [ ] "
        : kind === "quote"
          ? "> "
          : `${"#".repeat(Number(kind.slice(-1)))} `;
    replacement = content
      .slice(from, to)
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
  }
  const next = content.slice(0, from) + replacement + content.slice(to);
  if (utf8Bytes(next) > MAX_TOOL_BYTES)
    return { ok: false, message: "插入后将超过 512 KiB，正文未改动。" };
  return {
    ok: true,
    value: {
      content: next,
      selection: { start: from, end: from + replacement.length },
    },
  };
}

export function transformJson(
  content: string,
  action: "format" | "minify" | "validate",
): ToolResult<{ content: string; message: string }> {
  if (utf8Bytes(content) > MAX_TOOL_BYTES)
    return { ok: false, message: "JSON 超过 512 KiB，正文未改动。" };
  if (!content.trim()) return { ok: false, message: "请先输入 JSON 内容。" };
  try {
    JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      message: `JSON 语法有误：${error instanceof Error ? error.message : "请检查括号、逗号与引号。"}`,
    };
  }
  if (action === "validate")
    return {
      ok: true,
      value: { content, message: "JSON 语法有效，正文未改动。" },
    };
  // Preserve number and string lexemes: JSON.parse/stringify would round large numbers.
  const lexer =
    /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
  const output: string[] = [];
  let depth = 0;
  let previous = "";
  let size = 0;
  const append = (part: string) => {
    size += utf8Bytes(part);
    if (size > MAX_TOOL_BYTES) return false;
    output.push(part);
    return true;
  };
  const newline = () => append(`\n${"  ".repeat(depth)}`);
  let match: RegExpExecArray | null;
  while ((match = lexer.exec(content))) {
    const token = match[0];
    if (action === "minify") {
      if (!append(token))
        return { ok: false, message: "结果超过 512 KiB，正文未改动。" };
      continue;
    }
    if (token === "}" || token === "]") {
      depth--;
      if (previous !== "{" && previous !== "[" && !newline())
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
      if (!append(token))
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
    } else {
      if ((previous === "{" || previous === "[") && !newline())
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
      if (!append(token))
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
      if (token === "{" || token === "[") {
        depth++;
        if (depth > 100)
          return {
            ok: false,
            message: "JSON 嵌套超过 100 层，请缩减层级；正文未改动。",
          };
      } else if (token === "," && !newline())
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
      else if (token === ":" && !append(" "))
        return { ok: false, message: "格式化结果超过 512 KiB，正文未改动。" };
    }
    previous = token;
  }
  return {
    ok: true,
    value: {
      content: output.join(""),
      message:
        action === "format"
          ? "JSON 已格式化，数值原文保持不变。"
          : "JSON 已压缩，数值原文保持不变。",
    },
  };
}

export function cursorStatistics(content: string, selection: TextRange) {
  const start = Math.max(0, Math.min(content.length, selection.start));
  const end = Math.max(start, Math.min(content.length, selection.end));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < start; index++)
    if (content.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  const count = (from: number, to: number) => {
    let total = 0;
    for (let index = from; index < to; index++) {
      total++;
      if ((content.codePointAt(index) ?? 0) > 0xffff) index++;
    }
    return total;
  };
  return {
    line,
    column: count(lineStart, start) + 1,
    selected: count(start, end),
  };
}

export function parseEditorPreferences(raw: string): EditorPreferences {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_EDITOR_PREFERENCES;
    const prefs = value as Record<string, unknown>;
    return {
      fontSize:
        prefs.fontSize === 16 || prefs.fontSize === 18 ? prefs.fontSize : 14,
      lineNumbers: prefs.lineNumbers === true,
    };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function editorFilename(title: string, type: string, language: string) {
  const extensions: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    json: "json",
    html: "html",
    css: "css",
    yaml: "yml",
    sql: "sql",
    bash: "sh",
    rust: "rs",
    go: "go",
    java: "java",
    cpp: "cpp",
  };
  const extension =
    type === "markdown"
      ? "md"
      : type === "code"
        ? (extensions[language] ?? "txt")
        : "txt";
  const basename =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/, "")
      .slice(0, 80) || "未命名片段";
  return basename.toLowerCase().endsWith(`.${extension}`)
    ? basename
    : `${basename}.${extension}`;
}
