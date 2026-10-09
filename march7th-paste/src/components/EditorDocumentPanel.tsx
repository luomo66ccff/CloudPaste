"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { documentOutline, documentStatistics, lineSelection } from "@/lib/editor-document";
import type { TextRange } from "@/lib/editor-tools";

export function EditorDocumentPanel({ content, contentType, selection, disabled, onSelect, onDownload, onHtml, onCopy }: {
  content: string; contentType: string; selection: TextRange; disabled: boolean;
  onSelect: (range: TextRange) => void; onDownload: () => void; onHtml: () => void; onCopy: () => void;
}) {
  const [line, setLine] = useState("");
  const [error, setError] = useState("");
  const stats = useMemo(() => documentStatistics(content), [content]);
  const outline = useMemo(() => contentType === "markdown" ? documentOutline(content) : [], [content, contentType]);
  const selected = useMemo(() => documentStatistics(content.slice(selection.start, selection.end)), [content, selection]);
  function jump() {
    if (disabled) return;
    const range = lineSelection(content, /^\d+$/.test(line.trim()) ? Number(line) : NaN);
    if (!range) { setError(`请输入 1–${stats.lines} 之间的整数行号。`); return; }
    setError(""); onSelect(range);
  }
  return <section className="editor-document-panel" aria-label="文档导航与统计">
    <div className="document-panel-title"><Icon name="file" size={17} /><h2>这份文档</h2><span>仅本机处理</span></div>
    <dl className="document-stats">
      <div><dt>字符（含空白）</dt><dd>{stats.characters.toLocaleString()}</dd></div>
      <div><dt>非空白字符</dt><dd>{stats.nonWhitespace.toLocaleString()}</dd></div>
      <div><dt>英文单词</dt><dd>{stats.words.toLocaleString()}</dd></div>
      <div><dt>行数</dt><dd>{stats.lines.toLocaleString()}</dd></div>
    </dl>
    {selection.end > selection.start && <p className="document-selection" role="status">已选 {selected.characters.toLocaleString()} 字符 · {(selected.bytes / 1024).toFixed(2)} KiB</p>}
    <div className="document-jump"><label htmlFor="document-line">跳转到行</label><div><input id="document-line" type="text" inputMode="numeric" maxLength={7} value={line} onChange={(event) => setLine(event.target.value)} placeholder={`1–${stats.lines}`} disabled={disabled} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); jump(); } }} /><button type="button" className="btn btn-ghost btn-small" onClick={jump} disabled={disabled}>跳转</button></div>{error && <small role="alert">{error}</small>}</div>
    {contentType === "markdown" && <nav className="document-outline" aria-label="编辑文档目录"><h3>源文目录 <span>{outline.length}{outline.length === 64 ? "+" : ""}</span></h3>{outline.length ? outline.map((item) => <button type="button" key={item.start} disabled={disabled} onClick={() => onSelect(item)} style={{ paddingLeft: 12 + (item.level - 1) * 10 }}><span>{item.text}</span><small>{item.line}</small></button>) : <p>用 # 标题或下划线标题组织文档，点击目录即可定位源文。</p>}</nav>}
    <div className="document-export"><h3>带走你的内容</h3><button type="button" disabled={disabled || !content} onClick={onCopy}><Icon name="copy" size={15} />复制全文</button><button type="button" disabled={disabled || !content} onClick={onDownload}><Icon name="download" size={15} />下载源文</button><button type="button" disabled={disabled || !content} onClick={onHtml}><Icon name="code" size={15} />导出 HTML</button><small>HTML 使用当前预览；图片不会随文件下载。</small></div>
  </section>;
}
