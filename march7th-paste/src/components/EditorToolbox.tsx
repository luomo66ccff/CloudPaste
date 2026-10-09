"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import {
  insertMarkdownTool,
  runEditorOperation,
  type EditorOperation,
  type MarkdownInsertion,
} from "@/lib/editor-operations";
import type { TextEdit, TextRange, ToolResult } from "@/lib/editor-tools";
import { insertMarkdownStructure, type MarkdownStructure } from "@/lib/editor-tools";
import { runEditorUtility, type EditorUtility } from "@/lib/editor-utilities";
import { storageSnapshot, subscribeStorage, STORAGE_EVENT } from "@/lib/client-storage";

type Category = "common" | "favorites" | "markdown" | "lines" | "text" | "data" | "all";
type FormKind = "link" | "image" | "code" | "table";
type InsertionKind = FormKind | "rule" | "ordered-list" | "strike";
type ToolboxTool = {
  label: string;
  hint: string;
  category: Category;
  operation?: EditorOperation;
  insertion?: InsertionKind;
  utility?: EditorUtility;
  structure?: MarkdownStructure;
  json?: "format" | "minify" | "validate";
  markdownOnly?: boolean;
};

const tools: ToolboxTool[] = [
  { label: "一级标题", hint: "为当前行添加 # 标题", category: "markdown", structure: "heading1" },
  { label: "二级标题", hint: "为当前行添加 ## 标题", category: "markdown", structure: "heading2" },
  { label: "三级标题", hint: "为当前行添加 ### 标题", category: "markdown", structure: "heading3" },
  { label: "任务列表", hint: "给待办事项加上复选框", category: "markdown", structure: "task" },
  { label: "引用段落", hint: "将当前行或选区设为引用", category: "markdown", structure: "quote" },
  { label: "数学公式", hint: "插入 LaTeX 公式结构", category: "markdown", structure: "formula" },
  { label: "插入链接", hint: "设置文字与地址", category: "markdown", insertion: "link" },
  { label: "插入图片", hint: "设置图片地址与描述", category: "markdown", insertion: "image" },
  { label: "插入代码块", hint: "选择语言，包围选区", category: "markdown", insertion: "code" },
  { label: "生成表格", hint: "自选行列与对齐方式", category: "markdown", insertion: "table" },
  { label: "分隔线", hint: "插入独立的横线", category: "markdown", insertion: "rule" },
  { label: "有序列表", hint: "为当前行或选中行编号", category: "markdown", insertion: "ordered-list" },
  { label: "删除线", hint: "标记选中的文字", category: "markdown", insertion: "strike" },
  { label: "增加缩进", hint: "当前行或选中行 · Ctrl / ⌘ ]", category: "lines", operation: "indent" },
  { label: "减少缩进", hint: "移除一层空格或 Tab", category: "lines", operation: "outdent" },
  { label: "复制行", hint: "在下方复制当前行或选中行", category: "lines", operation: "duplicate-lines" },
  { label: "删除行", hint: "删除当前行或选中行", category: "lines", operation: "delete-lines" },
  { label: "上移行", hint: "当前行或选中行向上移动", category: "lines", operation: "move-up" },
  { label: "下移行", hint: "当前行或选中行向下移动", category: "lines", operation: "move-down" },
  { label: "行升序排序", hint: "选中行；无选区时处理全文", category: "lines", operation: "sort-asc" },
  { label: "行降序排序", hint: "选中行；无选区时处理全文", category: "lines", operation: "sort-desc" },
  { label: "去除重复行", hint: "保留第一次出现的原文", category: "lines", operation: "unique-lines" },
  { label: "移除空白行", hint: "移除空行及仅有空白的行", category: "lines", operation: "remove-empty-lines" },
  { label: "清理行尾空白", hint: "移除每行末尾的空格与 Tab", category: "lines", operation: "trim-trailing" },
  { label: "转大写", hint: "选区；无选区时处理全文", category: "text", operation: "uppercase" },
  { label: "转小写", hint: "选区；无选区时处理全文", category: "text", operation: "lowercase" },
  { label: "ASCII 转全角", hint: "转换英数、符号与空格", category: "text", operation: "fullwidth" },
  { label: "全角转 ASCII", hint: "其他文字保持原样", category: "text", operation: "halfwidth" },
  { label: "URL 编码", hint: "编码为 URL 参数组件", category: "text", operation: "url-encode" },
  { label: "URL 解码", hint: "还原百分号编码的文本", category: "text", operation: "url-decode" },
  { label: "Base64 编码", hint: "支持中文与 Emoji", category: "text", operation: "base64-encode" },
  { label: "Base64 解码", hint: "还原 UTF-8 文本", category: "text", operation: "base64-decode" },
  { label: "HTML 转义", hint: "将特殊字符转换成实体", category: "text", operation: "html-encode" },
  { label: "HTML 实体还原", hint: "只还原文本，不执行 HTML", category: "text", operation: "html-decode" },
  { label: "JSON 字符串转义", hint: "生成带引号的 JSON 字符串", category: "text", operation: "json-quote" },
  { label: "JSON 字符串还原", hint: "解码字符串，保留原有文字", category: "text", operation: "json-unquote" },
  { label: "反转行序", hint: "选中行或全文倒序排列", category: "lines", utility: "reverse-lines" },
  { label: "添加行号", hint: "为每行添加 1. 编号", category: "lines", utility: "number-lines" },
  { label: "移除行号", hint: "移除行首的数字编号", category: "lines", utility: "remove-line-numbers" },
  { label: "清理行首尾空白", hint: "去掉每行两端的空白", category: "lines", utility: "trim-lines" },
  { label: "合并连续空白行", hint: "连续空行最多保留一行", category: "lines", utility: "collapse-blank-lines" },
  { label: "统一换行 LF", hint: "把 CRLF / CR 换行转为 LF", category: "lines", utility: "normalize-newlines" },
  { label: "camelCase 命名", hint: "ASCII 英数分词；中文与 Emoji 保留", category: "text", utility: "camel-case" },
  { label: "snake_case 命名", hint: "用下划线连接英文单词", category: "text", utility: "snake-case" },
  { label: "kebab-case 命名", hint: "用短横线连接英文单词", category: "text", utility: "kebab-case" },
  { label: "Unicode 转义", hint: "将文字转为 \\uXXXX 形式", category: "data", utility: "unicode-escape" },
  { label: "Unicode 还原", hint: "安全还原 Unicode 转义文本", category: "data", utility: "unicode-unescape" },
  { label: "提取网页链接", hint: "提取 HTTP(S) 链接，不访问网页", category: "data", utility: "extract-urls" },
  { label: "CSV / TSV 转表格", hint: "粘贴表格文本；首行为表头，最多 200 行 / 20 列", category: "data", utility: "delimited-to-markdown", markdownOnly: true },
  { label: "格式化 JSON", hint: "整理全文 JSON 缩进", category: "data", json: "format" },
  { label: "压缩 JSON", hint: "去掉全文 JSON 多余空白", category: "data", json: "minify" },
  { label: "校验 JSON", hint: "检查全文 JSON，不修改正文", category: "data", json: "validate" },
];
const categories: { value: Category; label: string }[] = [
  { value: "common", label: "常用" },
  { value: "favorites", label: "收藏" },
  { value: "markdown", label: "排版插入" },
  { value: "lines", label: "行处理" },
  { value: "text", label: "文本转换" },
  { value: "data", label: "数据工具" },
  { value: "all", label: "全部" },
];
const favoritesKey = "march7th-tool-favorites-v32";
const favoritesSnapshot = () => storageSnapshot(favoritesKey);
const commonTools = new Set(["二级标题", "任务列表", "插入链接", "插入代码块", "生成表格", "去除重复行", "CSV / TSV 转表格", "格式化 JSON", "清理行尾空白", "URL 解码", "Base64 解码"]);

type Props = {
  initialQuery?: string;
  open: boolean;
  content: string;
  contentType: string;
  selection: TextRange;
  disabled: boolean;
  onEdit: (edit: TextEdit) => void;
  onMessage: (message: string, error?: boolean) => void;
  onClose: () => void;
  onJson: (action: "format" | "minify" | "validate") => void;
};

export function EditorToolbox(props: Props) {
  const [category, setCategory] = useState<Category>("common");
  const rawFavorites = useSyncExternalStore(subscribeStorage, favoritesSnapshot, () => "");
  const [favoriteFallback, setFavoriteFallback] = useState<string[] | null>(null);
  const favorites = useMemo<string[]>(() => {
    if (favoriteFallback) return favoriteFallback;
    try { const parsed: unknown = JSON.parse(rawFavorites || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && tools.some((tool) => tool.label === item)).slice(0, 64) : []; } catch { return []; }
  }, [rawFavorites, favoriteFallback]);
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [formKind, setFormKind] = useState<FormKind | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [alignment, setAlignment] = useState<"left" | "center" | "right">("left");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const parameterRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (props.open && !props.disabled) searchRef.current?.focus();
  }, [props.open, props.disabled]);
  useEffect(() => {
    if (formKind) parameterRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [formKind]);
  const selectedCharacters = useMemo(() => {
    if (!props.open) return 0;
    let count = 0;
    for (const character of props.content.slice(props.selection.start, props.selection.end)) if (character) count++;
    return count;
  }, [props.open, props.content, props.selection.start, props.selection.end]);
  if (!props.open) return null;

  const markdown = props.contentType === "markdown";
  const selectedCategory = !markdown && category === "markdown" ? "lines" : category;
  const available = tools.filter((tool) => markdown || (tool.category !== "markdown" && !tool.markdownOnly));
  const needle = query.trim().toLocaleLowerCase();
  const filtered = available.filter((tool) => needle
    ? `${tool.label} ${tool.hint}`.toLocaleLowerCase().includes(needle)
    : selectedCategory === "all" || (selectedCategory === "common" ? commonTools.has(tool.label) : selectedCategory === "favorites" ? favorites.includes(tool.label) : tool.category === selectedCategory));
  const hasSelection = props.selection.end > props.selection.start;

  function apply(result: ToolResult<TextEdit>, action: string) {
    if (props.disabled) return;
    if (!result.ok) {
      setMessage(result.message);
      setIsError(true);
      props.onMessage(result.message, true);
      return;
    }
    const changed = result.value.content !== props.content;
    if (changed) props.onEdit(result.value);
    setMessage(changed ? `已${action}，可撤销恢复。` : "内容没有变化。");
    setIsError(false);
  }
  function choose(tool: ToolboxTool) {
    if (props.disabled) return;
    setMessage("");
    setIsError(false);
    if (tool.utility) { setFormKind(null); apply(runEditorUtility(props.content, props.selection, tool.utility), tool.label); }
    if (tool.structure) { setFormKind(null); apply(insertMarkdownStructure(props.content, props.selection, tool.structure), tool.label); }
    if (tool.json) { setFormKind(null); props.onJson(tool.json); }
    if (tool.operation) {
      setFormKind(null);
      apply(runEditorOperation(props.content, props.selection, tool.operation), tool.label);
    } else if (tool.insertion) {
      const kind = tool.insertion;
      if (kind === "link" || kind === "image" || kind === "code" || kind === "table") {
        setFormKind(kind);
        if (kind === "link" || kind === "image") {
          setLabel(props.content.slice(props.selection.start, props.selection.end));
          setUrl("");
        }
      } else {
        setFormKind(null);
        apply(insertMarkdownTool(props.content, props.selection, { kind }), tool.label);
      }
    }
  }
  function toggleFavorite(tool: ToolboxTool) {
    const next = favorites.includes(tool.label) ? favorites.filter((item) => item !== tool.label) : [...favorites, tool.label];
    try { localStorage.setItem(favoritesKey, JSON.stringify(next)); setFavoriteFallback(null); window.dispatchEvent(new Event(STORAGE_EVENT)); }
    catch { setFavoriteFallback(next); }
  }
  function insertConfigured() {
    if (!formKind || props.disabled || !markdown) return;
    let insertion: MarkdownInsertion;
    if (formKind === "link" || formKind === "image") insertion = { kind: formKind, text: label, url };
    else if (formKind === "code") insertion = { kind: "code", language };
    else insertion = { kind: "table", rows, columns, alignment };
    const result = insertMarkdownTool(props.content, props.selection, insertion);
    apply(result, formKind === "table" ? "生成表格" : formKind === "code" ? "插入代码块" : formKind === "image" ? "插入图片" : "插入链接");
    if (result.ok) setFormKind(null);
  }

  return (
    <section className="editor-toolbox" id="editor-toolbox" aria-labelledby="editor-toolbox-heading" onKeyDown={(event) => {
      if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && event.target instanceof HTMLInputElement) event.preventDefault();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); props.onClose();
      }
    }}>
      <div className="editor-toolbox-heading">
        <div><h3 id="editor-toolbox-heading">编辑工具箱 <span>{available.length}</span></h3>
          <p>搜索即可直达工具，点星标收藏常用操作。正文只在本机处理。</p></div>
        <button type="button" className="icon-button" aria-label="关闭工具箱" onClick={props.onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="editor-toolbox-navigation">
        <label className="search-field"><Icon name="search" size={16} /><input ref={searchRef} aria-label="搜索编辑工具" placeholder="搜索全部工具，如去重、表格、Base64…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing && !(event.ctrlKey || event.metaKey)) event.preventDefault();
        }} maxLength={80} disabled={props.disabled} /></label>
        <div className="filter-tabs" role="group" aria-label="编辑工具分类">
          {categories.filter((item) => markdown || item.value !== "markdown").map((item) => <button key={item.value} type="button" aria-pressed={!needle && selectedCategory === item.value} onClick={() => { setCategory(item.value); setQuery(""); setFormKind(null); }} disabled={props.disabled}>{item.label}</button>)}
        </div>
      </div>
      <p className="editor-toolbox-scope" aria-live="polite">{hasSelection ? `当前选区：${selectedCharacters.toLocaleString()} 字符` : "当前没有选区：行编辑处理光标所在行；批量整理与文本转换处理全文。"}</p>
      <div className="editor-toolbox-grid">
        {filtered.map((tool) => <div className={`editor-tool-card category-${tool.category}`} key={tool.label}><button type="button" className="editor-toolbox-action" disabled={props.disabled || ((!!tool.operation || !!tool.utility || !!tool.json) && !props.content)} onClick={() => choose(tool)}><span>{tool.label}</span><small>{tool.hint}</small></button><button className="tool-favorite" type="button" aria-label={`${favorites.includes(tool.label) ? "取消收藏" : "收藏"}${tool.label}`} aria-pressed={favorites.includes(tool.label)} onClick={() => toggleFavorite(tool)}><Icon name="star" size={14} /></button></div>)}
      </div>
      {!filtered.length && <p className="toolbox-empty" role="status">{selectedCategory === "favorites" && !needle ? "点工具旁的星标，把常用操作留在这里。" : "没有匹配的工具，试试“缩进”“编码”或“链接”。"}</p>}
      {formKind && markdown && <fieldset className="editor-toolbox-parameters" ref={parameterRef} disabled={props.disabled} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.target instanceof HTMLInputElement) { event.preventDefault(); insertConfigured(); }
      }}>
        <legend>{formKind === "table" ? "表格设置" : formKind === "code" ? "代码块设置" : formKind === "image" ? "图片设置" : "链接设置"}</legend>
        {(formKind === "link" || formKind === "image") && <>
          <label>{formKind === "image" ? "图片描述" : "链接文字"}<input className="form-input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={4096} placeholder={formKind === "image" ? "简短描述图片内容" : "使用选中的文字，也可以重新填写"} /></label>
          <label>{formKind === "image" ? "图片地址" : "链接地址"}<input className="form-input" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={4096} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://example.com" /></label>
          {formKind === "image" && <p className="muted">编辑预览不会加载远程图片；这里只插入 Markdown 地址。</p>}
        </>}
        {formKind === "code" && <label>代码语言<input className="form-input" aria-label="代码语言" aria-describedby="toolbox-code-help" value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="例如 typescript、python；可留空" /><small className="muted" id="toolbox-code-help">包围当前选区，未选择时插入可替换的示例文字。</small></label>}
        {formKind === "table" && <div className="editor-toolbox-table-fields">
          <label>正文行数<input className="form-input" type="number" min={1} max={20} step={1} value={Number.isNaN(rows) ? "" : rows} onChange={(event) => setRows(event.target.valueAsNumber)} /></label>
          <label>列数<input className="form-input" type="number" min={1} max={8} step={1} value={Number.isNaN(columns) ? "" : columns} onChange={(event) => setColumns(event.target.valueAsNumber)} /></label>
          <label>对齐方式<select className="form-input" aria-label="对齐方式" value={alignment} onChange={(event) => setAlignment(event.target.value as typeof alignment)}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
          <p className="muted">额外包含一行表头。生成后可直接编辑每个单元格的内容。</p>
        </div>}
        <div className="editor-toolbox-form-actions"><button type="button" className="btn btn-primary btn-small" onClick={insertConfigured}>{formKind === "table" ? "插入表格" : formKind === "code" ? "确认插入代码块" : formKind === "image" ? "确认插入图片" : "确认插入链接"}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => { setFormKind(null); searchRef.current?.focus(); }}>取消设置</button></div>
      </fieldset>}
      <p className={`editor-toolbox-message${isError ? " error" : ""}`} role={isError ? "alert" : "status"}>{message}</p>
      <p className="editor-toolbox-shortcuts">正文快捷键：Ctrl / ⌘ [ 或 ] 调整缩进 · Ctrl / ⌘ D 复制行 · Alt ↑ / ↓ 移动行。Tab 仍用于切换焦点。</p>
    </section>
  );
}
