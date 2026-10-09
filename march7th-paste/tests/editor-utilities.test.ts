import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "@/components/MarkdownView";
import {
  EDITOR_UTILITY_IDS,
  MAX_DELIMITED_COLUMNS,
  MAX_DELIMITED_ROWS,
  runEditorUtility,
  type EditorUtility,
} from "@/lib/editor-utilities";
import {
  createHistory,
  MAX_TOOL_BYTES,
  moveHistory,
  recordHistory,
  type TextEdit,
  type ToolResult,
} from "@/lib/editor-tools";

const caret = { start: 0, end: 0 };
function edited(result: ToolResult<TextEdit>) {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
const whole = (text: string, operation: EditorUtility) =>
  edited(runEditorUtility(text, caret, operation)).content;

describe("complete-line utilities", () => {
  it("reverses all lines at any caret, preserving CRLF and the final newline", () => {
    expect(whole("one\r\ntwo\r\nthree\r\n", "reverse-lines"))
      .toBe("three\r\ntwo\r\none\r\n");
    expect(edited(runEditorUtility("one\r\ntwo", { start: 5, end: 5 }, "reverse-lines")).content)
      .toBe("two\r\none");
    expect(whole("a\r\nb\nc\r", "reverse-lines")).toBe("c\r\nb\na\r");
  });

  it("expands partial selections and excludes a following line at its exact start", () => {
    const input = "before\r\none\r\ntwo\r\nafter";
    const result = edited(runEditorUtility(input, { start: 9, end: 18 }, "reverse-lines"));
    expect(result).toEqual({
      content: "before\r\ntwo\r\none\r\nafter",
      selection: { start: 8, end: 18 },
    });
    expect(edited(runEditorUtility(input, { start: 9, end: 13 }, "number-lines"))).toEqual({
      content: "before\r\n1. one\r\ntwo\r\nafter",
      selection: { start: 8, end: 16 },
    });
  });

  it("numbers real blank lines but never a phantom line after a terminal newline", () => {
    expect(whole("a\r\n\r\nb\r\n", "number-lines"))
      .toBe("1. a\r\n2. \r\n3. b\r\n");
    expect(whole("\n", "number-lines")).toBe("1. \n");
    expect(whole("a\nb", "number-lines")).toBe("1. a\n2. b");
  });

  it("removes decimal line-number prefixes while preserving indentation and data", () => {
    expect(whole("  1. one\r\n\t02) two\r\n3: three\r\n4、 four\r\n5\tfive\r\n6 six", "remove-line-numbers"))
      .toBe("  one\r\n\ttwo\r\nthree\r\nfour\r\nfive\r\nsix");
    const data = "3.14\n2026年\n123\n  value";
    expect(whole(data, "remove-line-numbers")).toBe(data);
    const text = "a\r\n\r\n中文😀";
    expect(whole(whole(text, "number-lines"), "remove-line-numbers")).toBe(text);
  });

  it("trims both ends of full selected lines without touching neighboring lines", () => {
    expect(edited(runEditorUtility(" keep \r\n \t中😀 \t\r\n last ", { start: 11, end: 14 }, "trim-lines")).content)
      .toBe(" keep \r\n中😀\r\n last ");
    expect(whole(" \ta \r\n\tb\t\r\n  ", "trim-lines")).toBe("a\r\nb\r\n");
  });

  it("collapses whitespace-only runs to one blank line and retains final termination", () => {
    expect(whole("\r\n \r\na\r\n \r\n\t\r\n\r\nb\r\n\r\n\r\n", "collapse-blank-lines"))
      .toBe("\r\na\r\n \r\nb\r\n\r\n");
    expect(whole("a\n\n\n", "collapse-blank-lines")).toBe("a\n\n");
    expect(whole("a\n\n ", "collapse-blank-lines")).toBe("a\n");
    expect(whole("\n\n\n", "collapse-blank-lines")).toBe("\n");
  });

  it("normalizes selected complete lines to LF, including their last newline", () => {
    expect(whole("a\r\nb\rc\n", "normalize-newlines")).toBe("a\nb\nc\n");
    expect(whole("a\rb", "normalize-newlines")).toBe("a\nb");
    expect(edited(runEditorUtility("a\r\nb\r\nc", { start: 0, end: 3 }, "normalize-newlines")))
      .toEqual({ content: "a\nb\r\nc", selection: { start: 0, end: 2 } });
  });
});

describe("ASCII naming utilities", () => {
  it("splits existing case boundaries and acronyms as well as ASCII separators", () => {
    const input = "HTTPServer2 helloWorld XML_parser--foo 42";
    expect(whole(input, "camel-case")).toBe("httpServer2HelloWorldXmlParserFoo42");
    expect(whole(input, "snake-case")).toBe("http_server2_hello_world_xml_parser_foo_42");
    expect(whole(input, "kebab-case")).toBe("http-server2-hello-world-xml-parser-foo-42");
  });

  it("preserves Chinese, emoji and accented runs in their original order and case", () => {
    const input = "Hello 中文😀 HTTPServer ÉTÉ";
    expect(whole(input, "camel-case")).toBe("hello中文😀HttpServerÉTÉ");
    expect(whole(input, "snake-case")).toBe("hello_中文😀_http_server_É_t_É");
    expect(whole("Hello中文😀World", "kebab-case")).toBe("hello-中文😀-world");
    expect(whole("中文😀", "camel-case")).toBe("中文😀");
  });

  it("changes only the precise selected range and returns its new UTF-16 selection", () => {
    expect(edited(runEditorUtility("前Hello WORLD后", { start: 1, end: 12 }, "camel-case")))
      .toEqual({ content: "前helloWorld后", selection: { start: 1, end: 11 } });
    expect(whole("--- ___", "snake-case")).toBe("");
  });
});

describe("strict Unicode escapes", () => {
  it("encodes every UTF-16 unit and round trips surrogate pairs and literal backslashes", () => {
    expect(whole("A中😀\\\n", "unicode-escape"))
      .toBe("\\u0041\\u4e2d\\ud83d\\ude00\\u005c\\u000a");
    const text = "中文😀\\u0041\r\n\u0000";
    expect(whole(whole(text, "unicode-escape"), "unicode-unescape")).toBe(text);
    expect(whole("\\ud83D\\uDE00", "unicode-unescape")).toBe("😀");
  });

  it("accepts scalar brace escapes, including the Unicode range boundaries", () => {
    expect(whole("x\\u{0}\\u{4E2D}\\u{1f600}\\u{10FFFF}\\u{0000041}", "unicode-unescape"))
      .toBe("x\u0000中😀\u{10ffff}A");
  });

  it("decodes Unicode once and preserves other escapes and paired backslashes", () => {
    const text = String.raw`\n \x41 \\u0041`;
    expect(whole(text, "unicode-unescape")).toBe(text);
    expect(whole(String.raw`\u005cu0041`, "unicode-unescape")).toBe(String.raw`\u0041`);
  });

  it("rejects malformed escapes, invalid scalar values and isolated surrogate units atomically", () => {
    for (const input of [
      "\\u", "\\u004", "\\u00GG", "\\u{}", "\\u{41", "\\u{+41}", "\\u{xyz}",
      "\\u{110000}", "\\u{d800}", "\\u{ffffffffffffffff}", "\\ud800", "\\udc00",
      "\\ud800x\\udc00", "\\udc00\\ud800", "\\ud83d\\u{de00}",
    ]) {
      const result = runEditorUtility(`before ${input} after`, { start: 7, end: 7 + input.length }, "unicode-unescape");
      expect(result.ok, input).toBe(false);
      if (!result.ok) expect(result.message).toContain("正文未改动");
    }
  });

  it("respects a precise selected escape without decoding neighboring text", () => {
    expect(edited(runEditorUtility("前\\u4e2d\\u6587后", { start: 1, end: 7 }, "unicode-unescape")))
      .toEqual({ content: "前中\\u6587后", selection: { start: 1, end: 2 } });
  });
});

describe("local HTTP URL extraction", () => {
  it("keeps HTTP(S) occurrences and spelling, strips prose punctuation and never fetches", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Unexpected network access"); });
    try {
      expect(whole('链接 https://example.com/a(b)).\r\nHTTP://EXAMPLE.ORG/?x=1&y=2， ftp://ftp.example/a mailto:a@b.com\r\nhttps://example.com/a(b)\r\n', "extract-urls"))
        .toBe("https://example.com/a(b)\r\nHTTP://EXAMPLE.ORG/?x=1&y=2\r\nhttps://example.com/a(b)\r\n");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("preserves no-match text, rejects malformed candidates and limits work to the selection", () => {
    const noUrls = "http:// https:// ftp://example.com example.com";
    expect(whole(noUrls, "extract-urls")).toBe(noUrls);
    const content = "https://outside.test 前 https://inside.test/x 后 https://outside2.test";
    const start = content.indexOf("前");
    const end = content.indexOf(" https://outside2");
    expect(edited(runEditorUtility(content, { start, end }, "extract-urls")))
      .toEqual({
        content: "https://outside.test https://inside.test/x https://outside2.test",
        selection: { start, end: start + "https://inside.test/x".length },
      });
    expect(whole("abchttps://example.com", "extract-urls")).toBe("abchttps://example.com");
  });

  it("handles large unmatched closing-bracket runs without repeated rescanning", () => {
    expect(whole(`https://example.com/${")".repeat(100000)}`, "extract-urls"))
      .toBe("https://example.com/");
  });
});

describe("bounded CSV and TSV to Markdown", () => {
  it.each([",", "\t"])("renders %j-delimited cells as their original literal text", (delimiter) => {
    const cells = [
      "**bold** _italic_ ~~strike~~ `code` $x+y$",
      "[label](https://example.com) ![image](https://example.com/image.png)",
      '<br> <img src="x"> &copy; &#124; &amp; <https://example.com>',
      "https://example.com www.example.com name@example.com",
      String.raw`a|b\c \*literal* \\ [x] # title`,
      'line 1\r\n"quoted"\nline 3\rline 4',
      "  leading and trailing  ",
    ];
    const quote = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const input = [cells.map(quote).join(delimiter), cells.map(quote).join(delimiter)].join("\r\n");
    const markdown = whole(input, "delimited-to-markdown");
    const rendered = renderToStaticMarkup(createElement(MarkdownView, { content: markdown }));
    const expected = cells.map((cell) => renderToStaticMarkup(createElement(Fragment, null,
      ...cell.split(/\r\n|\r|\n/).flatMap((line, index) => index ? [createElement("br", { key: index }), line] : [line]),
    )));
    for (const tag of ["th", "td"]) {
      const actual = [...rendered.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1]
        // GFM may autolink literal URLs without changing their displayed text.
        .replace(/<\/?a\b[^>]*>/g, "")
        // mdast's hard-break renderer adds a formatting newline after <br>.
        .replace(/<br\/>\n/g, "<br/>"));
      expect(actual).toEqual(expected);
    }
    expect(rendered).not.toMatch(/<(?:img|em|strong|del|code)\b/);
    expect(rendered).not.toContain('class="katex"');
  });

  it("parses quoted commas, quotes and multiline records, escaping table-sensitive text", () => {
    const input = '"Name, full",Note\r\n"张三","a|b\\c\r\n""quoted"""\r\n';
    expect(whole(input, "delimited-to-markdown"))
      .toBe('| Name, full | Note |\r\n| --- | --- |\r\n| 张三 | a\\|b\\\\c<br>"quoted" |\r\n');
  });

  it("detects unquoted header tabs as TSV and ignores tabs inside CSV quotes", () => {
    expect(whole('name, label\tvalue\nA,B\t"line1\nline2"\n', "delimited-to-markdown"))
      .toBe("| name, label | value |\n| --- | --- |\n| A,B | line1<br>line2 |\n");
    expect(whole('"a\tb",c\nx,y', "delimited-to-markdown"))
      .toBe("| a\tb | c |\n| --- | --- |\n| x | y |");
  });

  it("preserves empty cells, a single-column table and unterminated last records", () => {
    expect(whole('a,b,\n"","",\n', "delimited-to-markdown"))
      .toBe("| a | b |  |\n| --- | --- | --- |\n|  |  |  |\n");
    expect(whole("name\rvalue", "delimited-to-markdown"))
      .toBe("| name |\r| --- |\r| value |");
    expect(whole("a,b", "delimited-to-markdown")).toBe("| a | b |\n| --- | --- |");
  });

  it("converts only the selected table and selects the complete replacement", () => {
    const content = "before\r\na,b\r\n1,2\r\nafter";
    const start = content.indexOf("a,b");
    const end = content.indexOf("after");
    const replacement = "| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n";
    expect(edited(runEditorUtility(content, { start, end }, "delimited-to-markdown")))
      .toEqual({ content: `before\r\n${replacement}after`, selection: { start, end: start + replacement.length } });
  });

  it("rejects uneven records and malformed quoting with clear errors", () => {
    for (const input of ["a,b\n1", "a,b\n1,2,3", 'a,b\n"x,y', 'a,b\n"x"tail,y', 'a,b\nx"y,z', '"a" ,b', "a,b\n\n"])
      expect(runEditorUtility(input, caret, "delimited-to-markdown").ok, input).toBe(false);
    const result = runEditorUtility("a,b\n1", caret, "delimited-to-markdown");
    if (!result.ok) expect(result.message).toContain("第 2 行有 1 列，表头为 2 列");
  });

  it("accepts exactly 200 records including the header and rejects the 201st", () => {
    const input = ["a,b", ...Array.from({ length: MAX_DELIMITED_ROWS - 1 }, () => '"x\ny\nz",2')].join("\n");
    expect(whole(input, "delimited-to-markdown").split("\n")).toHaveLength(MAX_DELIMITED_ROWS + 1);
    const result = runEditorUtility(`${input}\n1,2`, caret, "delimited-to-markdown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("最多 200 行");
  });

  it("accepts exactly 20 columns and rejects the 21st", () => {
    const input = Array.from({ length: MAX_DELIMITED_COLUMNS }, (_, index) => `c${index}`).join(",");
    expect(runEditorUtility(input, caret, "delimited-to-markdown").ok).toBe(true);
    const result = runEditorUtility(`${input},extra`, caret, "delimited-to-markdown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("最多 20 列");
  });
});

describe("validation and atomic history", () => {
  it("allows empty content and preserves no-op selections for all 13 utilities", () => {
    expect(EDITOR_UTILITY_IDS).toHaveLength(13);
    for (const utility of EDITOR_UTILITY_IDS)
      expect(edited(runEditorUtility("", caret, utility))).toEqual({ content: "", selection: caret });
    expect(edited(runEditorUtility("plain", { start: 2, end: 2 }, "unicode-unescape")))
      .toEqual({ content: "plain", selection: { start: 2, end: 2 } });
    expect(runEditorUtility("", caret, "unknown" as EditorUtility).ok).toBe(false);
  });

  it("rejects invalid Unicode and non-integer, out-of-bounds or split-surrogate ranges", () => {
    for (const utility of EDITOR_UTILITY_IDS) {
      for (const content of ["\ud800", "a\udc00", "\ud800x\udc00"])
        expect(runEditorUtility(content, caret, utility).ok).toBe(false);
      for (const selection of [
        { start: 1, end: 2 }, { start: -1, end: 0 }, { start: 2, end: 1 },
        { start: 0, end: 4 }, { start: 0.5, end: 2 }, { start: 0, end: Number.NaN },
        { start: Infinity, end: Infinity },
      ]) expect(runEditorUtility("😀x", selection, utility).ok).toBe(false);
    }
  });

  it("enforces inclusive UTF-8 input/output limits and counts text outside the selection", () => {
    expect(runEditorUtility("a".repeat(MAX_TOOL_BYTES + 1), caret, "reverse-lines").ok).toBe(false);
    expect(runEditorUtility("中".repeat(Math.ceil(MAX_TOOL_BYTES / 3)), caret, "trim-lines").ok).toBe(false);
    expect(whole("a".repeat(MAX_TOOL_BYTES), "trim-lines")).toHaveLength(MAX_TOOL_BYTES);
    expect(runEditorUtility("a".repeat(MAX_TOOL_BYTES), caret, "number-lines").ok).toBe(false);
    expect(runEditorUtility("a".repeat(MAX_TOOL_BYTES), { start: 0, end: 1 }, "unicode-escape").ok).toBe(false);
    expect(runEditorUtility("a".repeat(Math.floor(MAX_TOOL_BYTES / 6) + 1), caret, "unicode-escape").ok).toBe(false);
    expect(whole("a".repeat(Math.floor(MAX_TOOL_BYTES / 6)), "unicode-escape"))
      .toHaveLength(Math.floor(MAX_TOOL_BYTES / 6) * 6);
    expect(runEditorUtility('"' + "|".repeat(300000) + '"', caret, "delimited-to-markdown").ok).toBe(false);
  });

  it("returns valid selections and records each transformation as one undoable edit", () => {
    const cases = [
      ["b\r\na\r\n", "reverse-lines"], ["中文😀", "unicode-escape"],
      ["Hello 中文", "snake-case"], ["a,b\n1,2", "delimited-to-markdown"],
    ] as const;
    for (const [content, utility] of cases) {
      const result = edited(runEditorUtility(content, caret, utility));
      expect(result.selection.start).toBeGreaterThanOrEqual(0);
      expect(result.selection.end).toBeLessThanOrEqual(result.content.length);
      expect(result.selection.end).toBeGreaterThanOrEqual(result.selection.start);
      const history = recordHistory(createHistory(content, caret), result.content, result.selection);
      expect(history.past).toHaveLength(1);
      const undone = moveHistory(history, "undo");
      expect(undone.present).toEqual({ content, selection: caret });
      expect(moveHistory(undone, "redo").present).toEqual(result);
    }
  });
});
