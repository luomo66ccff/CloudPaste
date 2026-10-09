import { describe, expect, it } from "vitest";
import {
  createHistory,
  cursorStatistics,
  editorFilename,
  findText,
  historyBytes,
  insertMarkdownStructure,
  MAX_HISTORY_BYTES,
  MAX_HISTORY_ENTRIES,
  MAX_TOOL_BYTES,
  moveHistory,
  nextTextMatch,
  parseEditorPreferences,
  recordHistory,
  replaceText,
  transformJson,
} from "@/lib/editor-tools";

describe("literal find and replace", () => {
  it("treats regex punctuation literally and supports case and Unicode offsets", () => {
    expect(
      findText("a.* A.* İx", { query: ".*", caseSensitive: true }),
    ).toMatchObject({ ok: true, value: { total: 2 } });
    expect(findText("a A", { query: "a", caseSensitive: true })).toMatchObject({
      ok: true,
      value: { total: 1 },
    });
    expect(
      findText("İx X", { query: "x", caseSensitive: false }),
    ).toMatchObject({
      ok: true,
      value: {
        ranges: [
          { start: 1, end: 2 },
          { start: 3, end: 4 },
        ],
      },
    });
  });
  it("wraps in both directions and does not select the current match again", () => {
    const options = { query: "one", caseSensitive: false };
    expect(
      nextTextMatch("one two one", options, { start: 0, end: 3 }, "next"),
    ).toMatchObject({ value: { start: 8, end: 11 } });
    expect(
      nextTextMatch("one two one", options, { start: 0, end: 3 }, "previous"),
    ).toMatchObject({ value: { start: 8, end: 11 } });
    expect(
      nextTextMatch(
        "one",
        { query: "missing", caseSensitive: true },
        { start: 0, end: 0 },
        "next",
      ),
    ).toEqual({ ok: true, value: null });
  });
  it("guards empty and overlong queries and stores bounded ranges", () => {
    expect(findText("text", { query: "", caseSensitive: false }).ok).toBe(
      false,
    );
    expect(
      findText("text", { query: "x".repeat(257), caseSensitive: false }).ok,
    ).toBe(false);
    expect(
      findText("a".repeat(5000), { query: "a", caseSensitive: false }, 10),
    ).toMatchObject({
      ok: true,
      value: { total: 5000, truncated: true, ranges: expect.any(Array) },
    });
    const found = findText(
      "a".repeat(5000),
      { query: "a", caseSensitive: false },
      10,
    );
    if (found.ok) expect(found.value.ranges).toHaveLength(10);
    expect(
      findText("中".repeat(180000), { query: "中", caseSensitive: false }).ok,
    ).toBe(false);
  });
  it("replaces only a selected exact match and handles replacement dollar signs literally", () => {
    expect(
      replaceText("One one", { query: "one", caseSensitive: false }, "$&", {
        start: 0,
        end: 3,
      }),
    ).toMatchObject({ ok: true, value: { content: "$& one", count: 1 } });
    expect(
      replaceText("one", { query: "one", caseSensitive: true }, "new", {
        start: 0,
        end: 2,
      }).ok,
    ).toBe(false);
    expect(
      replaceText(
        "one one",
        { query: "one", caseSensitive: false },
        "$1",
        { start: 0, end: 0 },
        true,
      ),
    ).toMatchObject({ ok: true, value: { content: "$1 $1", count: 2 } });
  });
  it("rejects byte overflow before allocating an expanded result", () => {
    expect(
      replaceText(
        "a".repeat(MAX_TOOL_BYTES),
        { query: "a", caseSensitive: true },
        "中文",
        { start: 0, end: 0 },
        true,
      ).ok,
    ).toBe(false);
    expect(
      replaceText("a", { query: "a", caseSensitive: true }, "b".repeat(4097), {
        start: 0,
        end: 1,
      }).ok,
    ).toBe(false);
  });
});

describe("bounded undo and redo", () => {
  it("groups typing, restores selections, and discards redo after a new edit", () => {
    let history = createHistory("");
    history = recordHistory(
      history,
      "a",
      { start: 1, end: 1 },
      { group: "typing", timestamp: 1000 },
    );
    history = recordHistory(
      history,
      "ab",
      { start: 2, end: 2 },
      { group: "typing", timestamp: 1200 },
    );
    expect(history.past).toHaveLength(1);
    history = moveHistory(history, "undo");
    expect(history.present.content).toBe("");
    history = moveHistory(history, "redo");
    expect(history.present.selection).toEqual({ start: 2, end: 2 });
    history = moveHistory(history, "undo");
    history = recordHistory(history, "different", { start: 0, end: 0 });
    expect(history.future).toHaveLength(0);
  });
  it("retains the current version while enforcing both entry and memory budgets", () => {
    let history = createHistory("");
    for (let i = 0; i < 120; i++)
      history = recordHistory(history, `${i}${"中".repeat(200000)}`, {
        start: 0,
        end: 0,
      });
    expect(historyBytes(history)).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
    expect(history.past.length + history.future.length).toBeLessThanOrEqual(
      MAX_HISTORY_ENTRIES,
    );
    expect(history.present.content.startsWith("119")).toBe(true);
  });
});

describe("document transformations", () => {
  it("inserts Markdown line structures and block templates at the requested selection", () => {
    expect(
      insertMarkdownStructure(
        "first\nsecond",
        { start: 7, end: 8 },
        "heading2",
      ),
    ).toMatchObject({ ok: true, value: { content: "first\n## second" } });
    expect(
      insertMarkdownStructure("one\ntwo", { start: 0, end: 7 }, "task"),
    ).toMatchObject({ ok: true, value: { content: "- [ ] one\n- [ ] two" } });
    expect(
      insertMarkdownStructure("one\ntwo", { start: 0, end: 4 }, "quote"),
    ).toMatchObject({ ok: true, value: { content: "> one\ntwo" } });
    expect(
      insertMarkdownStructure("x+y", { start: 0, end: 3 }, "formula"),
    ).toMatchObject({ ok: true, value: { content: "\n\n$$\nx+y\n$$\n\n" } });
    expect(
      insertMarkdownStructure("", { start: 0, end: 0 }, "table"),
    ).toMatchObject({
      ok: true,
      value: { content: expect.stringContaining("| --- | --- |") },
    });
  });
  it("formats and minifies JSON without changing big integers or string escapes", () => {
    const raw =
      '{ "n":900719925474099312345, "e":1e999,"s":"\\u4e2d", "a": [true,{}] }';
    const formatted = transformJson(raw, "format");
    expect(formatted.ok).toBe(true);
    if (formatted.ok) {
      expect(formatted.value.content).toContain("900719925474099312345");
      expect(formatted.value.content).toContain("1e999");
      expect(formatted.value.content).toContain('"\\u4e2d"');
      expect(transformJson(formatted.value.content, "minify")).toMatchObject({
        ok: true,
        value: {
          content:
            '{"n":900719925474099312345,"e":1e999,"s":"\\u4e2d","a":[true,{}]}',
        },
      });
    }
  });
  it("validates without changing text and fails safely on invalid, deeply nested or oversized JSON", () => {
    expect(transformJson(' {"a": 1} ', "validate")).toMatchObject({
      ok: true,
      value: { content: ' {"a": 1} ' },
    });
    expect(transformJson('{"a":}', "format").ok).toBe(false);
    expect(
      transformJson("[".repeat(101) + "0" + "]".repeat(101), "format").ok,
    ).toBe(false);
    expect(
      transformJson(
        '"' + "中".repeat(Math.floor(MAX_TOOL_BYTES / 3) + 1) + '"',
        "format",
      ).ok,
    ).toBe(false);
  });
  it("counts Unicode cursor positions and whitelists only non-content preferences", () => {
    expect(cursorStatistics("a\n😀中x", { start: 4, end: 6 })).toEqual({
      line: 2,
      column: 2,
      selected: 2,
    });
    expect(
      parseEditorPreferences(
        '{"fontSize":18,"lineNumbers":true,"password":"secret","content":"private"}',
      ),
    ).toEqual({ fontSize: 18, lineNumbers: true });
    expect(parseEditorPreferences("invalid")).toEqual({
      fontSize: 14,
      lineNumbers: false,
    });
    expect(editorFilename('note/:"name', "markdown", "")).toBe(
      "note---name.md",
    );
  });
});
