"use client";

import { Component, type ReactNode } from "react";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import ReactMarkdown from "react-markdown";
import { CopyButton } from "@/components/CopyButton";
import { rehypeHeadingAnchors, renderedText, remarkPlainBreaks } from "@/lib/markdown-headings";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, /^hljs/],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", /^hljs-/, /^katex/],
      ["style"],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", /^math/, /^katex/],
    ],
  },
};

type MarkdownErrorBoundaryProps = {
  children: ReactNode;
  content: string;
};

type MarkdownErrorBoundaryState = {
  hasError: boolean;
};

class MarkdownErrorBoundary extends Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  state: MarkdownErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: MarkdownErrorBoundaryProps) {
    if (previousProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-semibold">
            这段 Markdown 暂时无法完整预览，下面保留了原始文字。
          </p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6">
            {this.props.content}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export function MarkdownView({
  content,
  disableRemoteImages = false,
  codeCopy = false,
}: {
  content: string;
  disableRemoteImages?: boolean;
  codeCopy?: boolean;
}) {
  if (!content.trim()) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
        写点什么，预览就会出现在这里。
      </p>
    );
  }

  return (
    <MarkdownErrorBoundary content={content}>
      <div className="prose-paste">
        <ReactMarkdown
          components={{
            ...(disableRemoteImages
              ? {
                  img: ({ alt }) => (
                    <span className="preview-truncated">
                      [图片：{alt || "未命名"} · 预览不加载远程资源]
                    </span>
                  ),
                }
              : {}),
            ...(codeCopy
              ? {
                  pre: ({ node, children, ...props }) => (
                    <div className="markdown-code-block">
                      <div className="code-block-tools">
                        <CopyButton
                          value={node ? renderedText(node) : ""}
                          label="复制代码块"
                        />
                      </div>
                      <pre {...props}>{children}</pre>
                    </div>
                  ),
                }
              : {}),
          }}
          remarkPlugins={[remarkGfm, remarkMath, remarkPlainBreaks]}
          rehypePlugins={[
            [rehypeSanitize, schema],
            rehypeHeadingAnchors,
            [rehypeKatex, { throwOnError: false, strict: false }],
            rehypeHighlight,
          ]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}
