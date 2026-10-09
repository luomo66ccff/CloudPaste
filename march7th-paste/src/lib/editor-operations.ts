import {
  MAX_TOOL_BYTES,
  utf8Bytes,
  type TextEdit,
  type TextRange,
  type ToolResult,
} from "./editor-tools";

export type EditorOperation =
  | "indent"
  | "outdent"
  | "duplicate-lines"
  | "delete-lines"
  | "move-up"
  | "move-down"
  | "sort-asc"
  | "sort-desc"
  | "unique-lines"
  | "remove-empty-lines"
  | "trim-trailing"
  | "uppercase"
  | "lowercase"
  | "fullwidth"
  | "halfwidth"
  | "url-encode"
  | "url-decode"
  | "base64-encode"
  | "base64-decode"
  | "html-encode"
  | "html-decode"
  | "json-quote"
  | "json-unquote";

export type MarkdownInsertion =
  | { kind: "link" | "image"; text: string; url: string }
  | { kind: "code"; language: string }
  | {
      kind: "table";
      rows: number;
      columns: number;
      alignment: "left" | "center" | "right";
    }
  | { kind: "rule" | "ordered-list" | "strike" };

const failure = (message: string): ToolResult<never> => ({ ok: false, message });
const tooLarge = (text: string) =>
  text.length > MAX_TOOL_BYTES || utf8Bytes(text) > MAX_TOOL_BYTES;

// TextEncoder silently replaces lone surrogates; reject them before any encoding.
function validUnicode(text: string) {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function splitsSurrogate(content: string, position: number) {
  const before = content.charCodeAt(position - 1);
  const after = content.charCodeAt(position);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function checkInput(content: string, selection: TextRange): ToolResult<true> {
  if (tooLarge(content)) return failure("正文超过 512 KiB，正文未改动。");
  if (!validUnicode(content)) return failure("正文含无效 Unicode 字符，正文未改动。");
  if (
    !Number.isInteger(selection.start) ||
    !Number.isInteger(selection.end) ||
    selection.start < 0 ||
    selection.end < selection.start ||
    selection.end > content.length ||
    splitsSurrogate(content, selection.start) ||
    splitsSurrogate(content, selection.end)
  )
    return failure("选区无效或截断了 Unicode 字符，正文未改动。");
  return { ok: true, value: true };
}

function replaceRange(
  content: string,
  range: TextRange,
  replacement: string,
  selection: TextRange = { start: range.start, end: range.start + replacement.length },
): ToolResult<TextEdit> {
  if (!validUnicode(replacement))
    return failure("转换结果含无效 Unicode 字符，正文未改动。");
  const next = content.slice(0, range.start) + replacement + content.slice(range.end);
  if (tooLarge(next)) return failure("操作结果将超过 512 KiB，正文未改动。");
  return { ok: true, value: { content: next, selection } };
}

type Line = { text: string; eol: string; start: number };
function readLines(content: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of content.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: content.slice(start, match.index), eol: match[0], start });
    start = match.index + match[0].length;
  }
  // The final empty line is useful when the caret follows a trailing newline.
  lines.push({ text: content.slice(start), eol: "", start });
  return lines;
}

function lineIndex(lines: Line[], position: number) {
  let index = 0;
  while (index + 1 < lines.length && lines[index + 1].start <= position) index++;
  return index;
}

function lineSpan(lines: Line[], selection: TextRange, wholeWhenEmpty = false) {
  if (wholeWhenEmpty && selection.start === selection.end) {
    const last = lines.length > 1 && lines.at(-1)!.text === ""
      ? lines.length - 2
      : lines.length - 1;
    return { first: 0, last };
  }
  return {
    first: lineIndex(lines, selection.start),
    last: lineIndex(lines, selection.end > selection.start ? selection.end - 1 : selection.end),
  };
}

const newlineFor = (content: string) => content.match(/\r\n|\r|\n/)?.[0] ?? "\n";
const bodyEnd = (line: Line) => line.start + line.text.length;
function joinBodies(texts: string[], slots: Line[], newline: string) {
  return texts.map((text, index) =>
    text + (index < texts.length - 1 ? (slots[index]?.eol || newline) : ""),
  ).join("");
}

function runLineOperation(
  content: string,
  selection: TextRange,
  operation: EditorOperation,
): ToolResult<TextEdit> {
  const lines = readLines(content);
  const bulk = ["sort-asc", "sort-desc", "unique-lines", "remove-empty-lines", "trim-trailing"].includes(operation);
  const { first, last } = lineSpan(lines, selection, bulk);
  const chosen = lines.slice(first, last + 1);
  const range = { start: chosen[0].start, end: bodyEnd(chosen.at(-1)!) };
  const newline = newlineFor(content);
  const body = content.slice(range.start, range.end);

  switch (operation) {
    case "indent":
    case "outdent":
      return replaceRange(content, range, joinBodies(chosen.map((line) =>
        operation === "indent" ? `  ${line.text}` : line.text.replace(/^(?:\t| {1,2})/, ""),
      ), chosen, newline));
    case "duplicate-lines": {
      const separator = chosen.at(-1)!.eol || chosen.find((line) => line.eol)?.eol || newline;
      const start = range.start + body.length + separator.length;
      return replaceRange(content, range, body + separator + body, { start, end: start + body.length });
    }
    case "delete-lines": {
      let from = range.start;
      const to = range.end + chosen.at(-1)!.eol.length;
      if (!chosen.at(-1)!.eol && first > 0) from -= lines[first - 1].eol.length;
      const cursor = Math.min(from, content.length - (to - from));
      return replaceRange(content, { start: from, end: to }, "", { start: cursor, end: cursor });
    }
    case "move-up":
    case "move-down": {
      const count = lines.length > 1 && lines.at(-1)!.text === "" ? lines.length - 1 : lines.length;
      const up = operation === "move-up";
      if (first >= count || (up ? first === 0 : last >= count - 1))
        return { ok: true, value: { content, selection } };
      const from = up ? first - 1 : first;
      const to = up ? last : last + 1;
      const slots = lines.slice(from, to + 1);
      const texts = chosen.map((line) => line.text);
      const reordered = up ? [...texts, lines[from].text] : [lines[to].text, ...texts];
      const movedStart = up ? lines[from].start : range.start + lines[to].text.length + slots[0].eol.length;
      const movedSlots = up ? slots : slots.slice(1);
      return replaceRange(
        content,
        { start: lines[from].start, end: bodyEnd(lines[to]) },
        joinBodies(reordered, slots, newline),
        { start: movedStart, end: movedStart + joinBodies(texts, movedSlots, newline).length },
      );
    }
    default: {
      let texts = chosen.map((line) => line.text);
      if (operation === "sort-asc" || operation === "sort-desc") {
        texts = texts.sort();
        if (operation === "sort-desc") texts.reverse();
      } else if (operation === "unique-lines") texts = [...new Set(texts)];
      else if (operation === "remove-empty-lines") texts = texts.filter((text) => text.trim() !== "");
      else if (operation === "trim-trailing") texts = texts.map((text) => text.replace(/[\t ]+$/g, ""));
      else return failure("不支持此编辑操作，正文未改动。");
      const finalEol = chosen.at(-1)!.eol;
      const from = !texts.length && !finalEol && first > 0
        ? range.start - lines[first - 1].eol.length
        : range.start;
      return replaceRange(content, { start: from, end: range.end + finalEol.length },
        texts.length ? joinBodies(texts, chosen, newline) + finalEol : "");
    }
  }
}

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  return btoa(chunks.join(""));
}

function decodeBase64(text: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))
    throw new Error("Base64 格式无效，请使用标准字母表和完整填充。");
  const binary = atob(text);
  if (btoa(binary) !== text) throw new Error("Base64 填充位无效。");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
};
function decodeHtml(text: string) {
  return text.replace(/&(#[^;]*|[A-Za-z][A-Za-z0-9]*);/g, (entity: string, name: string) => {
    if (!name.startsWith("#")) return entities[name] ?? entity;
    const hexadecimal = /^#x/i.test(name);
    const digits = name.slice(hexadecimal ? 2 : 1);
    if (!(hexadecimal ? /^[\da-f]+$/i : /^\d+$/).test(digits))
      throw new Error("HTML 数字实体无效。");
    const point = Number.parseInt(digits, hexadecimal ? 16 : 10);
    if (!Number.isSafeInteger(point) || point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff))
      throw new Error("HTML 实体含无效 Unicode 码点。");
    return String.fromCodePoint(point);
  });
}

export function runEditorOperation(
  content: string,
  selection: TextRange,
  operation: EditorOperation,
): ToolResult<TextEdit> {
  const checked = checkInput(content, selection);
  if (!checked.ok) return checked;
  if (["indent", "outdent", "duplicate-lines", "delete-lines", "move-up", "move-down", "sort-asc", "sort-desc", "unique-lines", "remove-empty-lines", "trim-trailing"].includes(operation))
    return runLineOperation(content, selection, operation);
  const range = selection.start === selection.end ? { start: 0, end: content.length } : selection;
  const text = content.slice(range.start, range.end);
  let transformed: string;
  try {
    switch (operation) {
      case "uppercase": transformed = text.toUpperCase(); break;
      case "lowercase": transformed = text.toLowerCase(); break;
      case "fullwidth": transformed = text.replace(/[\x20-\x7e]/g, (character) =>
        character === " " ? "\u3000" : String.fromCharCode(character.charCodeAt(0) + 0xfee0)); break;
      case "halfwidth": transformed = text.replace(/[\uff01-\uff5e\u3000]/g, (character) =>
        character === "\u3000" ? " " : String.fromCharCode(character.charCodeAt(0) - 0xfee0)); break;
      case "url-encode": transformed = encodeURIComponent(text); break;
      case "url-decode": transformed = decodeURIComponent(text); break;
      case "base64-encode": transformed = encodeBase64(text); break;
      case "base64-decode": transformed = decodeBase64(text); break;
      case "html-encode": transformed = text.replace(/[&<>"']/g, (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); break;
      case "html-decode": transformed = decodeHtml(text); break;
      case "json-quote": transformed = JSON.stringify(text); break;
      case "json-unquote": {
        const decoded: unknown = JSON.parse(text);
        if (typeof decoded !== "string") return failure("JSON 去引号只接受 JSON 字符串，正文未改动。");
        transformed = decoded;
        break;
      }
      default: return failure("不支持此编辑操作，正文未改动。");
    }
  } catch {
    return failure("转换失败：请检查编码、UTF-8 或字符串格式；正文未改动。");
  }
  return replaceRange(content, range, transformed);
}

function markdownText(text: string) {
  return text.replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\`*{}\[\]()#+\-.!|~]/g, "\\$&");
}

function safeMarkdownUrl(raw: string, image: boolean): string | null {
  if (!raw || tooLarge(raw) || !validUnicode(raw) || /[\s\u0000-\u001f\u007f\\<>"`]/u.test(raw) || /%(?![\da-f]{2})/i.test(raw))
    return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
    if (raw.startsWith("#")) {
      if (image) return null;
    } else {
      const url = new URL(raw);
      if (url.protocol === "mailto:" && !image) {
        if (!/^[^@\s<>:]+@[^@\s<>:]+$/.test(url.pathname)) return null;
      } else if (!/^https?:\/\/[^/]/i.test(raw) || !["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password)
        return null;
    }
    // Parentheses can terminate Markdown destinations even in otherwise valid URLs.
    return raw.replace(/[()']/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return null;
  }
}

function blockInsertion(content: string, range: TextRange, body: string) {
  const newline = newlineFor(content);
  const before = content.slice(0, range.start);
  const after = content.slice(range.end);
  const endsTwice = /(?:\r\n\r\n|\n\n|\r\r)$/.test(before);
  const startsTwice = /^(?:\r\n\r\n|\n\n|\r\r)/.test(after);
  const leading = !before || endsTwice ? "" : /[\r\n]$/.test(before) ? newline : newline + newline;
  const trailing = !after || startsTwice ? "" : /^[\r\n]/.test(after) ? newline : newline + newline;
  return replaceRange(content, range, leading + body + trailing, {
    start: range.start + leading.length,
    end: range.start + leading.length + body.length,
  });
}

export function insertMarkdownTool(
  content: string,
  selection: TextRange,
  insertion: MarkdownInsertion,
): ToolResult<TextEdit> {
  const checked = checkInput(content, selection);
  if (!checked.ok) return checked;
  const chosen = content.slice(selection.start, selection.end);
  const newline = newlineFor(content);
  switch (insertion.kind) {
    case "link":
    case "image": {
      const url = safeMarkdownUrl(insertion.url, insertion.kind === "image");
      if (!url) return failure("请输入安全的 URL：链接支持 http、https、mailto 或 #，图片仅支持 http、https。");
      if (tooLarge(insertion.text) || !validUnicode(insertion.text))
        return failure("链接文字过大或含无效 Unicode 字符，正文未改动。");
      const text = markdownText(insertion.text || chosen || (insertion.kind === "image" ? "图片说明" : "链接文字"));
      return replaceRange(content, selection, `${insertion.kind === "image" ? "!" : ""}[${text}](${url})`);
    }
    case "code": {
      if (!/^[A-Za-z0-9_+.#-]{0,32}$/.test(insertion.language))
        return failure("代码语言仅支持最多 32 个安全字母、数字或 _+.#- 字符。");
      const text = chosen || "在此输入代码";
      let longest = 2;
      for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
      const fence = "`".repeat(longest + 1);
      return blockInsertion(content, selection,
        `${fence}${insertion.language}${newline}${text}${/[\r\n]$/.test(text) ? "" : newline}${fence}`);
    }
    case "table": {
      if (!Number.isInteger(insertion.rows) || insertion.rows < 1 || insertion.rows > 20 ||
        !Number.isInteger(insertion.columns) || insertion.columns < 1 || insertion.columns > 8 ||
        !["left", "center", "right"].includes(insertion.alignment))
        return failure("表格需为 1–20 行正文、1–8 列，并选择有效对齐方式。");
      const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
      const separator = { left: ":---", center: ":---:", right: "---:" }[insertion.alignment];
      const rows = [
        row(Array.from({ length: insertion.columns }, (_, index) => `列 ${index + 1}`)),
        row(Array.from({ length: insertion.columns }, () => separator)),
        ...Array.from({ length: insertion.rows }, () => row(Array.from({ length: insertion.columns }, () => "内容"))),
      ];
      return blockInsertion(content, selection, rows.join(newline));
    }
    case "rule": return blockInsertion(content, selection, "---");
    case "ordered-list": {
      const lines = readLines(content);
      const { first, last } = lineSpan(lines, selection);
      const selected = lines.slice(first, last + 1);
      return replaceRange(content, { start: selected[0].start, end: bodyEnd(selected.at(-1)!) },
        joinBodies(selected.map((line, index) => `${index + 1}. ${line.text || "列表项"}`), selected, newline));
    }
    case "strike": return replaceRange(content, selection, `~~${markdownText(chosen || "删除线文本")}~~`);
    default: return failure("不支持此 Markdown 插入操作，正文未改动。");
  }
}
