import { describe, expect, it } from "vitest";
import { documentOutline, documentStatistics, escapeHtml, htmlDocument, lineSelection, sourceRange, textareaRange } from "../src/lib/editor-document";
import { remarkPlainBreaks } from "../src/lib/markdown-headings";
describe("editor document navigation", () => {
  it("indexes ATX and Setext source offsets while excluding fenced and indented code", () => {
    const text = "# One\r\n\r\n```md\r\n# hidden\r\n```\r\nTwo\r\n---\r\n    # code\r\n## Three ##";
    const items = documentOutline(text);
    expect(items.map(item => [item.text, item.level, item.line])).toEqual([["One", 1, 1], ["Two", 2, 6], ["Three", 2, 9]]);
    for (const item of items) expect(text.slice(item.start, item.end)).toContain(item.text);
  });
  it("does not mistake thematic breaks or list items for headings and bounds the outline", () => {
    expect(documentOutline("---\n- list\n---\n\n## valid\n~~~\n# hidden\n~~~").map(x => x.text)).toEqual(["valid"]);
    expect(documentOutline(Array.from({ length: 100 }, (_, i) => `# ${i}`).join("\n"))).toHaveLength(64);
  });
  it("locates final empty and mixed newline lines without accepting invalid positions", () => {
    expect(lineSelection("a\r\nb\rc\n", 2)).toEqual({ start: 3, end: 4 });
    expect(lineSelection("a\r\nb\rc\n", 4)).toEqual({ start: 7, end: 7 });
    for (const value of [0, -1, 5, 1.5, NaN, Infinity]) expect(lineSelection("a\nb", value)).toBeNull();
  });
  it("counts Unicode code points and UTF8 bytes accurately", () => {
    expect(documentStatistics("中😀 hi\r\n")).toEqual({ characters: 7, nonWhitespace: 4, words: 1, lines: 2, bytes: 12 });
  });
  it("maps CRLF file offsets to the normalized textarea and back without changing source", () => {
    const content = "中😀\r\nb\rc\n";
    const source = lineSelection(content, 2)!;
    expect(source).toEqual({ start: 5, end: 6 });
    const normalized = textareaRange(content, source);
    expect(normalized).toEqual({ start: 4, end: 5 });
    expect(sourceRange(content, normalized)).toEqual(source);
    expect(content.replace(/\r\n?/g, "\n").slice(normalized.start, normalized.end)).toBe("b");
  });
  it("allows bare Markdown line breaks while preserving unsafe HTML as escaped nodes", () => {
    const tree = { type: "root", children: [{ type: "html", value: "<br>" }, { type: "html", value: '<br onclick="alert(1)">' }, { type: "html", value: "<script>x</script>" }] };
    remarkPlainBreaks()(tree);
    expect(tree.children[0].type).toBe("break");
    expect(tree.children[1].type).toBe("html");
    expect(tree.children[2].type).toBe("html");
  });
  it("exports escaped titles with a restrictive standalone CSP", () => {
    expect(escapeHtml('<img src="x">&')).toBe("&lt;img src=&quot;x&quot;&gt;&amp;");
    const html = htmlDocument("</title><script>alert(1)</script>", "<p>safe</p>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("<main><p>safe</p></main>");
  });
});
