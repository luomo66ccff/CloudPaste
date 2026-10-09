import { describe, expect, it } from "vitest";
import {
  insertMarkdownTool,
  runEditorOperation,
  type EditorOperation,
} from "@/lib/editor-operations";
import {
  createHistory,
  MAX_TOOL_BYTES,
  moveHistory,
  recordHistory,
  type TextEdit,
  type ToolResult,
} from "@/lib/editor-tools";

const caret = { start: 0, end: 0 };
function edited(result: ToolResult<TextEdit>): TextEdit {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
const whole = (text: string, operation: EditorOperation) =>
  edited(runEditorOperation(text, caret, operation)).content;

describe("complete-line editing", () => {
  it("expands a partial selection and excludes a following line at the exact end", () => {
    const input = "aa\r\nbb\r\ncc\r\n";
    expect(edited(runEditorOperation(input, { start: 1, end: 4 }, "indent"))).toEqual({
      content: "  aa\r\nbb\r\ncc\r\n",
      selection: { start: 0, end: 4 },
    });
    expect(edited(runEditorOperation(input, { start: 5, end: 10 }, "indent")).content)
      .toBe("aa\r\n  bb\r\n  cc\r\n");
  });

  it("indents only the caret line and removes one indentation level", () => {
    expect(edited(runEditorOperation("a\nb", { start: 2, end: 2 }, "indent")).content)
      .toBe("a\n  b");
    expect(whole("\tx\r\n  y\r\n z", "outdent")).toBe("x\r\n  y\r\n z");
    expect(edited(runEditorOperation("\tx\r\n  y\r\n z", { start: 0, end: 11 }, "outdent")).content)
      .toBe("x\r\ny\r\nz");
  });

  it("duplicates a final unterminated line without adding a trailing newline", () => {
    expect(edited(runEditorOperation("a\r\nb", { start: 4, end: 4 }, "duplicate-lines"))).toEqual({
      content: "a\r\nb\r\nb",
      selection: { start: 6, end: 7 },
    });
    expect(edited(runEditorOperation("a\r\nb\r\n", { start: 0, end: 3 }, "duplicate-lines")).content)
      .toBe("a\r\na\r\nb\r\n");
    expect(edited(runEditorOperation("a\nb", { start: 0, end: 3 }, "duplicate-lines")).content)
      .toBe("a\nb\na\nb");
  });

  it("deletes complete lines and avoids leaving a spurious final newline", () => {
    expect(edited(runEditorOperation("a\r\nb", { start: 3, end: 4 }, "delete-lines")))
      .toEqual({ content: "a", selection: { start: 1, end: 1 } });
    expect(edited(runEditorOperation("a\r\nb\r\nc", { start: 3, end: 6 }, "delete-lines")).content)
      .toBe("a\r\nc");
    expect(edited(runEditorOperation("a\r\nb\r\n", { start: 3, end: 4 }, "delete-lines")).content)
      .toBe("a\r\n");
    expect(edited(runEditorOperation("a", caret, "delete-lines")).content).toBe("");
  });

  it("moves selected lines with CRLF and preserves an unterminated document", () => {
    const input = "a\r\nb\r\nc";
    const up = edited(runEditorOperation(input, { start: 3, end: 7 }, "move-up"));
    expect(up).toEqual({ content: "b\r\nc\r\na", selection: { start: 0, end: 4 } });
    expect(edited(runEditorOperation("a\r\nb\r\nc\r\n", { start: 0, end: 4 }, "move-down")))
      .toEqual({ content: "c\r\na\r\nb\r\n", selection: { start: 3, end: 7 } });
  });

  it("does nothing at movement boundaries, including the trailing empty caret line", () => {
    for (const [input, selection, operation] of [
      ["a\nb\n", caret, "move-up"],
      ["a\nb\n", { start: 2, end: 3 }, "move-down"],
      ["a\nb\n", { start: 4, end: 4 }, "move-up"],
      ["", caret, "move-down"],
    ] as const) {
      expect(edited(runEditorOperation(input, selection, operation))).toEqual({ content: input, selection });
    }
  });

  it("sorts whole lines in a partial selection while retaining untouched prefixes and EOL slots", () => {
    expect(edited(runEditorOperation("before\r\nz\r\na\nafter", { start: 9, end: 13 }, "sort-asc")).content)
      .toBe("before\r\na\r\nz\nafter");
    expect(whole("b\r\na\r\nc\r\n", "sort-desc")).toBe("c\r\nb\r\na\r\n");
    expect(whole("b\na", "sort-asc")).toBe("a\nb");
  });

  it("deduplicates stably and removes whitespace-only lines without normalizing CRLF", () => {
    expect(whole("b\r\na\r\nb\r\na\r\n", "unique-lines")).toBe("b\r\na\r\n");
    expect(whole("a\r\n \t\r\nb\r\n\r\n", "remove-empty-lines")).toBe("a\r\nb\r\n");
    expect(edited(runEditorOperation("before\n\n \nafter", { start: 7, end: 10 }, "remove-empty-lines")).content)
      .toBe("before\nafter");
    expect(edited(runEditorOperation("a\n ", { start: 2, end: 3 }, "remove-empty-lines")).content)
      .toBe("a");
  });

  it("trims trailing spaces and tabs on selected full lines or the entire document", () => {
    const input = " a  \r\nb\t\r\nc  ";
    expect(whole(input, "trim-trailing")).toBe(" a\r\nb\r\nc");
    expect(edited(runEditorOperation(input, { start: 7, end: 8 }, "trim-trailing")).content)
      .toBe(" a  \r\nb\r\nc  ");
  });
});

describe("strict text transformations", () => {
  it("uses the precise selected UTF-16 range, including expanding Unicode case mappings", () => {
    expect(edited(runEditorOperation("前ß😀后", { start: 1, end: 4 }, "uppercase")))
      .toEqual({ content: "前SS😀后", selection: { start: 1, end: 5 } });
    expect(whole("ABC Ä", "lowercase")).toBe("abc ä");
    expect(whole("A z!中文😀\t", "fullwidth")).toBe("Ａ　ｚ！中文😀\t");
    expect(whole("Ａ　ｚ！中文😀カ￥", "halfwidth")).toBe("A z!中文😀カ￥");
  });

  it("round trips Unicode URL text and rejects malformed or non-UTF-8 escapes", () => {
    const text = "中文 😀 + /?";
    expect(whole(whole(text, "url-encode"), "url-decode")).toBe(text);
    for (const input of ["%", "%GG", "%FF", "%C0%AF", "%ED%A0%80", "%F0%9F%98"])
      expect(runEditorOperation(input, caret, "url-decode").ok).toBe(false);
    expect(whole("a+b", "url-decode")).toBe("a+b");
  });

  it("encodes UTF-8 Base64 and retains an actual Unicode BOM on decode", () => {
    expect(whole("中文😀", "base64-encode")).toBe("5Lit5paH8J+YgA==");
    expect(whole("5Lit5paH8J+YgA==", "base64-decode")).toBe("中文😀");
    expect(whole("77u/YQ==", "base64-decode")).toBe("\ufeffa");
    expect(whole("", "base64-decode")).toBe("");
    const longText = "😀中文".repeat(8000);
    expect(whole(whole(longText, "base64-encode"), "base64-decode")).toBe(longText);
  });

  it("rejects invalid Base64 alphabet, padding bits and invalid UTF-8 instead of replacing bytes", () => {
    for (const input of ["YQ", "YQ=", "YR==", "YWJ=", "YQ==\n", "YQ===", "____", "/w==", "wK8=", "7aCA"])
      expect(runEditorOperation(input, caret, "base64-decode").ok, input).toBe(false);
  });

  it("quotes strings without parsing numbers and unquotes only JSON strings", () => {
    const digits = "900719925474099312345";
    expect(whole(digits, "json-quote")).toBe(`"${digits}"`);
    expect(whole(`"${digits}"`, "json-unquote")).toBe(digits);
    expect(whole(whole('中文\n"😀\\', "json-quote"), "json-unquote")).toBe('中文\n"😀\\');
    for (const input of [digits, "true", "null", "{}", '"bad', '"\\ud800"'])
      expect(runEditorOperation(input, caret, "json-unquote").ok).toBe(false);
  });

  it("decodes a bounded text-entity whitelist and Unicode scalar entities without a DOM", () => {
    const text = '<script>alert("😀")</script> &\'';
    expect(whole(whole(text, "html-encode"), "html-decode")).toBe(text);
    expect(whole("&lt;b&gt;&nbsp;&#20013;&#x1F600;&unknown;", "html-decode"))
      .toBe("<b>\u00a0中😀&unknown;");
    expect(whole("&amp;lt;", "html-decode")).toBe("&lt;");
    for (const input of ["&#0;", "&#xD800;", "&#1114112;", "&#xZZ;", "&#-1;"])
      expect(runEditorOperation(input, caret, "html-decode").ok).toBe(false);
  });

  it("rejects invalid Unicode and invalid or surrogate-splitting ranges", () => {
    for (const input of ["\ud800", "a\udc00"])
      expect(runEditorOperation(input, caret, "base64-encode").ok).toBe(false);
    for (const selection of [
      { start: 1, end: 2 }, { start: -1, end: 0 }, { start: 2, end: 1 },
      { start: 0, end: 5 }, { start: Number.NaN, end: 0 }, { start: 0.5, end: 2 },
    ]) expect(runEditorOperation("😀x", selection, "uppercase").ok).toBe(false);
  });

  it("checks both input and final UTF-8 bytes, including growth outside the selected region", () => {
    expect(runEditorOperation("中".repeat(Math.ceil(MAX_TOOL_BYTES / 3)), caret, "lowercase").ok).toBe(false);
    expect(runEditorOperation("a".repeat(MAX_TOOL_BYTES + 1), caret, "uppercase").ok).toBe(false);
    expect(whole("a".repeat(MAX_TOOL_BYTES), "uppercase")).toHaveLength(MAX_TOOL_BYTES);
    expect(runEditorOperation("a".repeat(MAX_TOOL_BYTES), caret, "base64-encode").ok).toBe(false);
    expect(runEditorOperation("a".repeat(MAX_TOOL_BYTES - 1), { start: 0, end: 1 }, "fullwidth").ok).toBe(false);
    expect(runEditorOperation("a".repeat(MAX_TOOL_BYTES), caret, "duplicate-lines").ok).toBe(false);
  });
});

describe("Markdown insertions", () => {
  it("escapes label punctuation, HTML and hostile newlines and escapes URL parentheses", () => {
    expect(edited(insertMarkdownTool("before chosen after", { start: 7, end: 13 }, {
      kind: "link", text: '[x](bad)\n<script>!', url: "https://example.com/a(b)?x=1&y=2",
    })).content).toBe("before [\\[x\\]\\(bad\\) &lt;script&gt;\\!](https://example.com/a%28b%29?x=1&y=2) after");
    expect(edited(insertMarkdownTool("标题", { start: 0, end: 2 }, { kind: "link", text: "", url: "#section" })).content)
      .toBe("[标题](#section)");
    expect(edited(insertMarkdownTool("", caret, { kind: "image", text: "", url: "https://example.com/a.png" })).content)
      .toBe("![图片说明](https://example.com/a.png)");
    expect(insertMarkdownTool("", caret, { kind: "link", text: "邮件", url: "mailto:a@example.com" }).ok).toBe(true);
  });

  it("rejects unsafe or ambiguous destinations, including encoded control characters", () => {
    for (const url of [
      "javascript:alert(1)", "data:image/png;base64,AA==", "file:///x", "//example.com", "/relative", "https:example.com",
      "https://user:secret@example.com", "https://example.com/\n[x](javascript:x)",
      "https://example.com/%0A", "https://example.com/%0d", "https://example.com/%00", "https://example.com/%5c",
      "https://example.com/%GG", "https://example.com/\\x", "https://example.com/a b", "https://",
    ]) expect(insertMarkdownTool("original", caret, { kind: "link", text: "x", url }).ok, url).toBe(false);
    for (const url of ["mailto:a@example.com", "#part"])
      expect(insertMarkdownTool("", caret, { kind: "image", text: "x", url }).ok).toBe(false);
  });

  it("uses a longer code fence than internal backtick runs and preserves selected CRLF", () => {
    expect(edited(insertMarkdownTool("```\r\nx\r\n````", { start: 0, end: 12 }, { kind: "code", language: "ts" })).content)
      .toBe("`````ts\r\n```\r\nx\r\n````\r\n`````");
    expect(edited(insertMarkdownTool("前后", { start: 1, end: 1 }, { kind: "code", language: "" })).content)
      .toBe("前\n\n```\n在此输入代码\n```\n\n后");
    for (const language of ["a".repeat(33), "js\n```", "x y", "`", "中文"])
      expect(insertMarkdownTool("", caret, { kind: "code", language }).ok).toBe(false);
    expect(insertMarkdownTool("", caret, { kind: "code", language: "c++" }).ok).toBe(true);
  });

  it("creates the requested table body size, alignment and document EOL style", () => {
    const table = edited(insertMarkdownTool("before\r\nafter", { start: 8, end: 8 }, {
      kind: "table", rows: 2, columns: 3, alignment: "center",
    })).content;
    expect(table).toBe("before\r\n\r\n| 列 1 | 列 2 | 列 3 |\r\n| :---: | :---: | :---: |\r\n| 内容 | 内容 | 内容 |\r\n| 内容 | 内容 | 内容 |\r\n\r\nafter");
    for (const dimensions of [
      { rows: 0, columns: 1 }, { rows: 21, columns: 1 }, { rows: 1, columns: 9 },
      { rows: 1.5, columns: 2 }, { rows: 1, columns: Number.NaN },
    ]) expect(insertMarkdownTool("", caret, { kind: "table", alignment: "left", ...dimensions }).ok).toBe(false);
    expect(insertMarkdownTool("", caret, { kind: "table", rows: 20, columns: 8, alignment: "right" }).ok).toBe(true);
  });

  it("inserts rules, numbers selected complete lines and escapes strikethrough text", () => {
    expect(edited(insertMarkdownTool("a\n\nb", { start: 3, end: 3 }, { kind: "rule" })).content)
      .toBe("a\n\n---\n\nb");
    expect(edited(insertMarkdownTool("one\r\ntwo\r\nthree", { start: 1, end: 10 }, { kind: "ordered-list" })).content)
      .toBe("1. one\r\n2. two\r\nthree");
    expect(edited(insertMarkdownTool("", caret, { kind: "ordered-list" })).content).toBe("1. 列表项");
    expect(edited(insertMarkdownTool("a~~b", { start: 0, end: 4 }, { kind: "strike" })).content)
      .toBe("~~a\\~\\~b~~");
  });

  it("rejects oversized and invalid-Unicode insertion results", () => {
    const input = "a".repeat(MAX_TOOL_BYTES);
    expect(insertMarkdownTool(input, caret, { kind: "rule" }).ok).toBe(false);
    expect(insertMarkdownTool("a".repeat(MAX_TOOL_BYTES + 1), caret, { kind: "strike" }).ok).toBe(false);
    expect(insertMarkdownTool("", caret, { kind: "link", text: "中".repeat(MAX_TOOL_BYTES / 2), url: "https://example.com" }).ok).toBe(false);
    expect(insertMarkdownTool("", caret, { kind: "link", text: "\ud800", url: "https://example.com" }).ok).toBe(false);
    expect(insertMarkdownTool("`".repeat(200000), { start: 0, end: 200000 }, { kind: "code", language: "" }).ok).toBe(false);
  });

  it("records each compound operation as a single reversible edit with its selection", () => {
    const input = "b\r\na\r\n";
    const selection = { start: 0, end: 4 };
    const result = edited(runEditorOperation(input, selection, "sort-asc"));
    let history = recordHistory(createHistory(input, selection), result.content, result.selection);
    expect(history.past).toHaveLength(1);
    history = moveHistory(history, "undo");
    expect(history.present).toEqual({ content: input, selection });
    expect(moveHistory(history, "redo").present).toEqual(result);
  });
});
