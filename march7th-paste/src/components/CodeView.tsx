"use client";
import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
for (const [name, language] of Object.entries({
  javascript,
  typescript,
  python,
  json,
  bash,
  css,
  xml,
  sql,
  yaml,
  rust,
  go,
  java,
  cpp,
}))
  hljs.registerLanguage(name, language);
export function CodeView({
  content,
  language,
  wrap = false,
  lineNumbers = false,
}: {
  content: string;
  language?: string | null;
  wrap?: boolean;
  lineNumbers?: boolean;
}) {
  const highlighted = useMemo(() => {
    try {
      return content.length <= 100000 && language && hljs.getLanguage(language)
        ? hljs.highlight(content, { language, ignoreIllegals: true }).value
        : null;
    } catch {
      return null;
    }
  }, [content, language]);
  const lineCount = content.split("\n").length;
  return (
    <div className={`code-layout ${wrap ? "code-wrap" : ""}`}>
      {lineNumbers && !wrap && lineCount <= 5000 && (
        <pre aria-hidden="true" className="reader-line-gutter">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
        </pre>
      )}
      <pre className="code-view" tabIndex={0} aria-label="代码内容">
        {highlighted === null ? (
          <code>{content}</code>
        ) : (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        )}
      </pre>
    </div>
  );
}
