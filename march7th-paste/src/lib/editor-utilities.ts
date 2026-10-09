import {
  MAX_TOOL_BYTES,
  utf8Bytes,
  type TextEdit,
  type TextRange,
  type ToolResult,
} from "./editor-tools";

export const EDITOR_UTILITY_IDS = [
  "reverse-lines",
  "number-lines",
  "remove-line-numbers",
  "trim-lines",
  "collapse-blank-lines",
  "normalize-newlines",
  "camel-case",
  "snake-case",
  "kebab-case",
  "unicode-escape",
  "unicode-unescape",
  "extract-urls",
  "delimited-to-markdown",
] as const;
export type EditorUtility = (typeof EDITOR_UTILITY_IDS)[number];

// The header counts toward the record limit; quoted newlines do not.
export const MAX_DELIMITED_ROWS = 200;
export const MAX_DELIMITED_COLUMNS = 20;

const failure = (message: string): ToolResult<never> => ({ ok: false, message });
const tooLarge = (text: string) =>
  text.length > MAX_TOOL_BYTES || utf8Bytes(text) > MAX_TOOL_BYTES;
const newlineFor = (text: string) => text.match(/\r\n|\r|\n/)?.[0] ?? "\n";
const finalNewline = (text: string) => text.match(/(?:\r\n|\r|\n)$/)?.[0] ?? "";

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
  ) return failure("选区无效或截断了 Unicode 字符，正文未改动。");
  return { ok: true, value: true };
}

function replaceRange(
  content: string,
  selection: TextRange,
  range: TextRange,
  replacement: string,
): ToolResult<TextEdit> {
  if (!validUnicode(replacement))
    return failure("转换结果含无效 Unicode 字符，正文未改动。");
  const next = content.slice(0, range.start) + replacement + content.slice(range.end);
  if (tooLarge(next)) return failure("操作结果将超过 512 KiB，正文未改动。");
  return {
    ok: true,
    value: {
      content: next,
      selection: next === content
        ? selection
        : { start: range.start, end: range.start + replacement.length },
    },
  };
}

type Line = { text: string; eol: string; start: number };
function readLines(content: string) {
  const lines: Line[] = [];
  let start = 0;
  for (const match of content.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: content.slice(start, match.index), eol: match[0], start });
    start = match.index + match[0].length;
  }
  // A terminating newline belongs to its preceding line, not a phantom record.
  if (start < content.length || !lines.length)
    lines.push({ text: content.slice(start), eol: "", start });
  return lines;
}

function lineIndex(lines: Line[], position: number) {
  let index = 0;
  while (index + 1 < lines.length && lines[index + 1].start <= position) index++;
  return index;
}

function runLineUtility(
  content: string,
  selection: TextRange,
  operation: EditorUtility,
): ToolResult<TextEdit> {
  const lines = readLines(content);
  const whole = selection.start === selection.end;
  const first = whole ? 0 : lineIndex(lines, selection.start);
  const last = whole ? lines.length - 1 : lineIndex(lines, selection.end - 1);
  const chosen = lines.slice(first, last + 1);
  const final = chosen.at(-1)!;
  const range = { start: chosen[0].start, end: final.start + final.text.length + final.eol.length };
  if (operation === "normalize-newlines")
    return replaceRange(content, selection, range,
      chosen.map((line) => line.text + (line.eol ? "\n" : "")).join(""));

  let texts = chosen.map((line) => line.text);
  switch (operation) {
    case "reverse-lines": texts.reverse(); break;
    case "number-lines": texts = texts.map((text, index) => `${index + 1}. ${text}`); break;
    case "remove-line-numbers":
      // Keep indentation and avoid mistaking decimals / years for line numbers.
      texts = texts.map((text) => text.replace(/^([\t ]*)\d+(?:[.)、:][\t ]+|[\t ]+)/, "$1"));
      break;
    case "trim-lines": texts = texts.map((text) => text.trim()); break;
    case "collapse-blank-lines":
      texts = texts.filter((text, index) =>
        text.trim() !== "" || index === 0 || chosen[index - 1].text.trim() !== "");
      break;
    default: return failure("不支持此文本工具，正文未改动。");
  }
  // Keep separator slots when reversing, and retain the original final EOL.
  const replacement = texts.map((text, index) => text +
    (index === texts.length - 1 ? final.eol : chosen[index].eol || newlineFor(content)),
  ).join("");
  return replaceRange(content, selection, range, replacement);
}

/**
 * ASCII punctuation/whitespace separate words; ASCII case boundaries split
 * camelCase and acronyms. Non-ASCII runs (including Chinese and emoji) remain
 * opaque words with their original spelling and order. Snake/kebab insert their
 * separator between all words, including those non-ASCII words.
 */
function convertName(text: string, operation: "camel-case" | "snake-case" | "kebab-case") {
  const words = text
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .match(/[A-Za-z0-9]+|[^\x00-\x7f]+/g) ?? [];
  const lowerAscii = (word: string) => word.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  if (operation !== "camel-case")
    return words.map(lowerAscii).join(operation === "snake-case" ? "_" : "-");
  return words.map((word, index) => {
    const lower = lowerAscii(word);
    return index === 0 ? lower : lower.replace(/^[a-z]/, (letter) => letter.toUpperCase());
  }).join("");
}

function escapeUnicode(text: string) {
  // Every UTF-16 code unit becomes six ASCII bytes, including surrogate pairs.
  if (text.length * 6 > MAX_TOOL_BYTES)
    throw new Error("Unicode 转义结果将超过 512 KiB。");
  const escaped: string[] = [];
  for (let index = 0; index < text.length; index++)
    escaped.push(`\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`);
  return escaped.join("");
}

function unescapeUnicode(text: string) {
  const output: string[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "\\") {
      output.push(text[index]);
      continue;
    }
    // Decode Unicode escapes only, without interpreting \n, \x or paired
    // backslashes. An escaped backslash must not introduce a second decode.
    if (text[index + 1] === "\\") {
      output.push("\\\\");
      index++;
      continue;
    }
    if (text[index + 1] !== "u") {
      output.push("\\");
      continue;
    }
    if (text[index + 2] === "{") {
      const end = text.indexOf("}", index + 3);
      const digits = end < 0 ? "" : text.slice(index + 3, end);
      if (!/^[\da-f]+$/i.test(digits)) throw new Error("Unicode 码点转义格式无效。");
      const point = Number.parseInt(digits, 16);
      if (!Number.isSafeInteger(point) || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff))
        throw new Error("Unicode 转义含无效码点。");
      output.push(String.fromCodePoint(point));
      index = end;
    } else {
      const digits = text.slice(index + 2, index + 6);
      if (!/^[\da-f]{4}$/i.test(digits)) throw new Error("Unicode 转义必须包含四位十六进制数字。");
      output.push(String.fromCharCode(Number.parseInt(digits, 16)));
      index += 5;
    }
  }
  const decoded = output.join("");
  if (!validUnicode(decoded)) throw new Error("Unicode 转义含孤立代理字符。");
  return decoded;
}

function extractUrls(text: string, newline: string) {
  const urls: string[] = [];
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f]+/giu)) {
    let candidate = match[0];
    // Strip prose punctuation and only unmatched closing brackets; URL paths
    // such as /a(b) keep their balanced brackets and their original spelling.
    const counts = new Map(["(", ")", "[", "]", "{", "}"].map((character) => [character, 0]));
    for (const character of candidate)
      if (counts.has(character)) counts.set(character, counts.get(character)! + 1);
    let end = candidate.length;
    while (end) {
      const tail = candidate[end - 1];
      if (/[.,;:!?，。；：！？、）》】」』]/u.test(tail)) end--;
      else if (tail === ")" || tail === "]" || tail === "}") {
        const opening = { ")": "(", "]": "[", "}": "{" }[tail];
        if (counts.get(tail)! <= counts.get(opening)!) break;
        counts.set(tail, counts.get(tail)! - 1);
        end--;
      } else break;
    }
    candidate = candidate.slice(0, end);
    try {
      const url = new URL(candidate);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname)
        urls.push(candidate);
    } catch { /* A malformed candidate is not a URL. No network is used. */ }
  }
  // No matches should not erase the selected text. Keep duplicates and order.
  return urls.length ? urls.join(newline) + finalNewline(text) : text;
}

function detectDelimiter(text: string) {
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      // Prefer TSV when the first record has an unquoted tab. Commas remain
      // ordinary cell text in TSV; tabs inside quoted CSV fields do not count.
      if (character === "\t") return "\t";
      if (character === "\r" || character === "\n") break;
    }
  }
  return ",";
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  const finishCell = () => {
    if (row.length >= MAX_DELIMITED_COLUMNS)
      throw new Error(`表格最多 ${MAX_DELIMITED_COLUMNS} 列。`);
    row.push(cell);
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (rows.length >= MAX_DELIMITED_ROWS)
      throw new Error(`表格最多 ${MAX_DELIMITED_ROWS} 行（含表头；引号内换行不计行数）。`);
    if (rows.length && row.length !== rows[0].length)
      throw new Error(`第 ${rows.length + 1} 行有 ${row.length} 列，表头为 ${rows[0].length} 列。`);
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === delimiter) finishCell();
    else if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index++;
    } else if (character === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || character === '"')
        throw new Error("分隔文本的双引号格式无效：引号需包裹整个单元格，内部双引号请写成两个双引号。");
      cell += character;
    }
  }
  if (quoted) throw new Error("分隔文本含未闭合的双引号。");
  if (row.length || cell || closed || !/[\r\n]$/.test(text)) finishRow();
  return rows;
}

function delimitedToMarkdown(text: string, newline: string) {
  const rows = parseDelimited(text, detectDelimiter(text));
  // Character references become literal text after Markdown parsing, so cell
  // data cannot create formatting, math, HTML or decoded entity text.
  const escapeCell = (cell: string) => cell
    .replace(/\\/g, "\\\\").replace(/\|/g, "\\|")
    .replace(/[&<>`*_[\]~$!:.@]/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/^[\t ]+|[\t ]+$/g, (space) => [...space].map((character) => `&#${character.charCodeAt(0)};`).join(""))
    .replace(/\r\n|\r|\n/g, "<br>");
  const renderRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;
  return [renderRow(rows[0]), `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map(renderRow),
  ].join(newline) + finalNewline(text);
}

/** All utilities are local, pure, atomic edits. An empty selection means the
 * whole document; the first six utilities expand nonempty selections to lines.
 */
export function runEditorUtility(
  content: string,
  selection: TextRange,
  operation: EditorUtility,
): ToolResult<TextEdit> {
  const checked = checkInput(content, selection);
  if (!checked.ok) return checked;
  if (!(EDITOR_UTILITY_IDS as readonly string[]).includes(operation))
    return failure("不支持此文本工具，正文未改动。");
  if (!content) return { ok: true, value: { content, selection } };
  if (["reverse-lines", "number-lines", "remove-line-numbers", "trim-lines", "collapse-blank-lines", "normalize-newlines"].includes(operation))
    return runLineUtility(content, selection, operation);
  const range = selection.start === selection.end ? { start: 0, end: content.length } : selection;
  const text = content.slice(range.start, range.end);
  const newline = newlineFor(text.match(/[\r\n]/) ? text : content);
  let transformed: string;
  try {
    switch (operation) {
      case "camel-case":
      case "snake-case":
      case "kebab-case": transformed = convertName(text, operation); break;
      case "unicode-escape": transformed = escapeUnicode(text); break;
      case "unicode-unescape": transformed = unescapeUnicode(text); break;
      case "extract-urls": transformed = extractUrls(text, newline); break;
      case "delimited-to-markdown": transformed = delimitedToMarkdown(text, newline); break;
      default: return failure("不支持此文本工具，正文未改动。");
    }
  } catch (error) {
    return failure(`${error instanceof Error ? error.message : "文本转换失败。"}正文未改动。`);
  }
  return replaceRange(content, selection, range, transformed);
}
