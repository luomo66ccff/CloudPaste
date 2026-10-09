"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownView } from "@/components/MarkdownView";
import { CodeView } from "@/components/CodeView";
import { Icon } from "@/components/Icon";
import { saveDraft } from "@/lib/client-storage";
type Heading = { id: string; text: string; level: number };
const ReaderMarkdown = memo(MarkdownView);
const ReaderCode = memo(CodeView);
export function PasteReader({
  content,
  contentType,
  language,
  title,
  sensitive = false,
}: {
  content: string;
  contentType: string;
  language?: string | null;
  title: string;
  sensitive?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null),
    router = useRouter();
  const progressBar = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(16),
    [wrap, setWrap] = useState(false),
    [lineNumbers, setLineNumbers] = useState(false);
  const [readingWidth, setReadingWidth] = useState<"comfort" | "wide">("comfort");
  const [source, setSource] = useState(false),
    [headings, setHeadings] = useState<Heading[]>([]),
    [message, setMessage] = useState("");
  const lineCount = useMemo(() => content.split("\n").length, [content]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const p = JSON.parse(
          localStorage.getItem("march7th-reader-prefs-v3") ?? "{}",
        );
        if ([14, 16, 18, 20].includes(p.font)) setFont(p.font);
        setWrap(p.wrap === true);
        setLineNumbers(p.lineNumbers === true);
        if (p.readingWidth === "wide") setReadingWidth("wide");
      } catch {}
    });
  }, []);
  function preference(next: {
    font?: number;
    wrap?: boolean;
    lineNumbers?: boolean;
    readingWidth?: "comfort" | "wide";
  }) {
    const value = { font, wrap, lineNumbers, readingWidth, ...next };
    setFont(value.font);
    setWrap(value.wrap);
    setLineNumbers(value.lineNumbers);
    setReadingWidth(value.readingWidth);
    try {
      localStorage.setItem("march7th-reader-prefs-v3", JSON.stringify(value));
    } catch {}
  }
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const updateHeadings = () => {
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          ".prose-paste h1,.prose-paste h2,.prose-paste h3,.prose-paste h4,.prose-paste h5,.prose-paste h6",
        ),
      )
        .slice(0, 64)
        .map((h) => ({
          id: h.id,
          text: h.textContent?.slice(0, 120) ?? "",
          level: Number(h.tagName[1]),
        }));
      setHeadings(items);
    };
    queueMicrotask(updateHeadings);
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = root.getBoundingClientRect();
        const total = Math.max(1, bounds.height - window.innerHeight);
        const progress = Math.min(
          100,
          Math.max(0, (-bounds.top / total) * 100),
        );
        const bar = progressBar.current;
        bar?.setAttribute("aria-valuenow", String(Math.round(progress)));
        const fill = bar?.firstElementChild;
        if (fill instanceof HTMLElement) fill.style.width = `${progress}%`;
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(frame);
    };
  }, [content, source]);
  async function duplicate() {
    if (sensitive) return;
    const result = await saveDraft({
      title,
      content,
      contentType,
      language: language ?? "",
      visibility: "unlisted",
      expiresIn: "never",
    });
    if (result.ok) router.push(`/new?draft=${result.draft.id}`);
    else
      setMessage(
        "无法创建草稿，可能已达到 12 份 / 2 MiB 上限，或浏览器存储不可用。现有内容仍在本页。",
      );
  }
  const codeDisplay = contentType === "code" || source;
  return (
    <div className="reader-workspace">
      <div
        ref={progressBar}
        className="reading-progress"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: "0%" }} />
      </div>
      <div className="reader-settings">
        <div className="reader-view-tabs filter-tabs">
          {contentType === "markdown" &&
            [
              [false, "阅读"],
              [true, "源文"],
            ].map(([v, label]) => (
              <button
                key={String(label)}
                type="button"
                aria-pressed={source === v}
                className={source === v ? "active" : ""}
                onClick={() => setSource(v as boolean)}
              >
                {label}
              </button>
            ))}
        </div>
        <label>
          字号
          <select
            aria-label="阅读字号"
            value={font}
            onChange={(e) => preference({ font: Number(e.target.value) })}
          >
            {[14, 16, 18, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>版面<select aria-label="阅读宽度" value={readingWidth} onChange={(event) => preference({ readingWidth: event.target.value === "wide" ? "wide" : "comfort" })}><option value="comfort">舒适阅读</option><option value="wide">宽屏阅读</option></select></label>
        {codeDisplay && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={wrap}
                onChange={(e) =>
                  preference({
                    wrap: e.target.checked,
                    lineNumbers: e.target.checked ? false : lineNumbers,
                  })
                }
              />
              自动换行
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={lineNumbers}
                onChange={(e) =>
                  preference({
                    lineNumbers: e.target.checked,
                    wrap: e.target.checked ? false : wrap,
                  })
                }
              />
              行号
            </label>
          </>
        )}
        {!sensitive && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => void duplicate()}
          >
            <Icon name="copy" size={14} />
            以此创建本机草稿
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="library-message">
          {message}
        </p>
      )}
      {codeDisplay && lineNumbers && lineCount > 5000 && (
        <p className="muted">
          正文超过 5000 行，已保留全文并关闭行号以保持流畅。
        </p>
      )}
      <div
        className={`reader-body-grid reader-width-${readingWidth} ${headings.length && !source ? "has-outline" : ""}`}
      >
        {!!headings.length && !source && (
          <aside className="reader-outline">
            <details open>
              <summary>
                <Icon name="list" size={16} />
                文档目录{" "}
                <small>
                  {headings.length === 64
                    ? "前 64 节"
                    : `${headings.length} 节`}
                </small>
              </summary>
              <nav aria-label="文档目录">
                {headings.map((h) => (
                  <a
                    key={h.id}
                    href={`#${h.id}`}
                    style={{
                      paddingInlineStart: `${Math.min(3, h.level - 1) * 12 + 10}px`,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      const target = document.getElementById(h.id);
                      if (target) {
                        target.scrollIntoView({
                          behavior: matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "auto"
                            : "smooth",
                          block: "start",
                        });
                        target.tabIndex = -1;
                        target.focus({ preventScroll: true });
                        history.replaceState(null, "", `#${h.id}`);
                      }
                    }}
                  >
                    {h.text || "未命名章节"}
                  </a>
                ))}
              </nav>
            </details>
          </aside>
        )}
        <section
          ref={body}
          className="panel reader-content reader-font"
          style={{ fontSize: `${font}px` }}
        >
          {contentType === "markdown" && !source ? (
            <ReaderMarkdown
              content={content}
              codeCopy
              disableRemoteImages={sensitive}
            />
          ) : codeDisplay ? (
            <ReaderCode
              content={content}
              language={source ? "markdown" : language}
              wrap={wrap}
              lineNumbers={lineNumbers}
            />
          ) : (
            <pre className="mono document-plain">{content}</pre>
          )}
        </section>
      </div>
      <div className="reader-end">
        <span className="muted">
          {content.length.toLocaleString()} 字符 · 约{" "}
          {Math.max(1, Math.ceil(content.length / 500))} 分钟阅读
        </span>
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            })
          }
        >
          回到顶部 ↑
        </button>
      </div>
    </div>
  );
}
