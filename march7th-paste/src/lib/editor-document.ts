import type { TextRange } from "./editor-tools";

export type OutlineItem = TextRange & { text: string; level: number; line: number };

/** Source navigation covers top-level ATX and Setext headings, excluding fences. */
export function documentOutline(content: string): OutlineItem[] {
  const result: OutlineItem[] = [];
  let offset = 0;
  let fence: { marker: string; length: number } | null = null;
  let previous: { text: string; start: number; end: number; line: number } | null = null;
  const lines = content.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length && result.length < 64; index++) {
    const text = lines[index];
    const start = offset;
    offset += text.length + (content.slice(offset + text.length, offset + text.length + 2) === "\r\n" ? 2 : 1);
    const boundary = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (boundary && boundary[1][0] === fence.marker && boundary[1].length >= fence.length && !boundary[2].trim()) fence = null;
      previous = null;
      continue;
    }
    if (boundary && !(boundary[1][0] === "`" && boundary[2].includes("`"))) {
      fence = { marker: boundary[1][0], length: boundary[1].length };
      previous = null;
      continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(text);
    if (heading) {
      result.push({ text: (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim() || "未命名标题", level: heading[1].length, start, end: start + text.length, line: index + 1 });
      previous = null;
    } else if (previous && /^ {0,3}(?:=+|-+)[ \t]*$/.test(text)) {
      result.push({ text: previous.text, level: text.trim()[0] === "=" ? 1 : 2, start: previous.start, end: previous.end, line: previous.line });
      previous = null;
    } else {
      previous = text.trim() && !/^(?: {4}|\t| {0,3}(?:>|[-+*][ \t]|\d+[.)][ \t]))/.test(text)
        ? { text: text.trim(), start, end: start + text.length, line: index + 1 } : null;
    }
  }
  return result;
}

export function documentStatistics(content: string) {
  let characters = 0, nonWhitespace = 0;
  for (const character of content) { characters++; if (/\S/u.test(character)) nonWhitespace++; }
  return { characters, nonWhitespace, words: (content.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length, lines: content.split(/\r\n|\r|\n/).length, bytes: new TextEncoder().encode(content).length };
}

export function lineSelection(content: string, line: number): TextRange | null {
  if (!Number.isSafeInteger(line) || line < 1) return null;
  const regex = /\r\n|\r|\n/g;
  let current = 1, start = 0;
  for (let match = regex.exec(content); match; match = regex.exec(content)) {
    if (current === line) return { start, end: match.index };
    start = match.index + match[0].length;
    current++;
  }
  return current === line ? { start, end: content.length } : null;
}

/** HTML textarea API normalizes CRLF and CR to LF; keep file/source offsets separate. */
export function textareaRange(content: string, range: TextRange): TextRange {
  if (!content.includes("\r")) return range;
  const offset = (index: number) => content.slice(0, index).replace(/\r\n?/g, "\n").length;
  return { start: offset(range.start), end: offset(range.end) };
}
export function sourceRange(content: string, range: TextRange): TextRange {
  if (!content.includes("\r")) return range;
  const offset = (index: number) => {
    let source = 0, normalized = 0;
    while (source < content.length && normalized < index) {
      if (content[source] === "\r" && content[source + 1] === "\n") source++;
      source++; normalized++;
    }
    return source;
  };
  return { start: offset(range.start), end: offset(range.end) };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Convert an already sanitized preview to static HTML without changing its DOM. */
export function htmlExportBody(rendered: HTMLElement) {
  const copy = rendered.cloneNode(true) as HTMLElement;
  const document = rendered.ownerDocument;
  copy.querySelectorAll<HTMLInputElement>('.task-list-item input[type="checkbox"][disabled]').forEach((input) => {
    input.replaceWith(document.createTextNode(input.checked ? "☑" : "☐"));
  });
  copy.querySelectorAll("script,iframe,object,embed,form,input,button,video,audio,img,link,meta").forEach((node) => node.remove());
  // Keep source formulas instead of depending on KaTeX's external fonts/styles.
  copy.querySelectorAll(".katex").forEach((node) => {
    const formula = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (formula) {
      const code = document.createElement("code");
      code.textContent = formula;
      node.replaceWith(code);
    }
  });
  return copy.innerHTML;
}

export function htmlDocument(title: string, safeBody: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title || "未命名片段")}</title><style>body{max-width:860px;margin:48px auto;padding:0 24px;color:#252839;background:#fff;font:16px/1.8 system-ui,sans-serif;overflow-wrap:anywhere}h1,h2,h3{line-height:1.4}a{color:#5446c9}pre{padding:20px;background:#f4f3f8;overflow:auto;white-space:pre-wrap}code{font-family:Consolas,monospace}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #ddd;padding:8px 12px}blockquote{border-left:3px solid #9287db;margin-left:0;padding-left:20px;color:#555}img{max-width:100%}@media print{body{margin:0;max-width:none}}</style></head><body><h1>${escapeHtml(title || "未命名片段")}</h1><main>${safeBody}</main></body></html>`;
}
