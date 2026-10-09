type HtmlNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
};
export function renderedText(node: HtmlNode): string {
  return node.type === "text"
    ? (node.value ?? "")
    : (node.children ?? []).map(renderedText).join("");
}
export function rehypeHeadingAnchors() {
  return (tree: HtmlNode) => {
    let index = 0;
    function visit(node: HtmlNode) {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        node.properties = { ...node.properties, id: `m7-heading-${++index}` };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };
/** Allow only a bare line break; all other raw HTML stays escaped by ReactMarkdown. */
export function remarkPlainBreaks() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      node.children?.forEach((child, index) => {
        if (child.type === "html" && /^<br[ \t]*\/?>$/i.test(child.value ?? "")) node.children![index] = { type: "break" };
        else visit(child);
      });
    }
    visit(tree);
  };
}
