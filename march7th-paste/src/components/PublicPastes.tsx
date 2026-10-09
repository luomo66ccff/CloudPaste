"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { BookmarkButton } from "@/components/BookmarkButton";
import { typeLabels } from "@/lib/templates";
export type PublicPasteSummary = {
  slug: string;
  title: string;
  contentType: string;
  language: string | null;
  createdAt: string;
  expireAt: string | null;
  viewCount: number;
  excerpt: string;
};
export function PublicPastes({ rows }: { rows: PublicPasteSummary[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [language, setLanguage] = useState("all");
  const [period, setPeriod] = useState("all");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (p) =>
            (type === "all" || p.contentType === type) &&
            (language === "all" || p.language === language) &&
            (period === "all" ||
              Date.parse(p.createdAt) >= now - Number(period) * 86400000) &&
            `${p.title} ${p.excerpt} ${p.language ?? ""}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === "popular"
            ? b.viewCount - a.viewCount
            : sort === "oldest"
              ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
              : Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
    [rows, query, type, sort, language, period, now],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pages);
  return (
    <>
      <div className="public-toolbar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="搜索公开片段"
            placeholder="搜索标题、摘要或代码语言…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="filter-tabs" aria-label="按类型筛选">
          {["all", "markdown", "code", "plain"].map((t) => (
            <button
              key={t}
              className={type === t ? "active" : ""}
              type="button"
              aria-pressed={type === t}
              onClick={() => {
                setType(t);
                setPage(1);
              }}
            >
              {t === "all" ? "全部" : typeLabels[t]}
            </button>
          ))}
        </div>
        <select
          className="sort-select"
          aria-label="排列顺序"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="newest">最新发布</option>
          <option value="oldest">最早发布</option>
          <option value="popular">最多浏览</option>
        </select>
      </div>
      <div className="public-extra-filters">
        <label>
          语言
          <select
            className="sort-select"
            aria-label="筛选代码语言"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部语言</option>
            {[
              ...new Set(
                rows
                  .map((p) => p.language)
                  .filter((l): l is string => Boolean(l)),
              ),
            ]
              .sort()
              .map((l) => (
                <option value={l} key={l}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          发布时间
          <select
            className="sort-select"
            aria-label="筛选发布时间"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">不限时间</option>
            <option value="7">最近 7 天</option>
            <option value="30">最近 30 天</option>
          </select>
        </label>
        <div className="filter-tabs" aria-label="排列方式">
          <button
            type="button"
            className={view === "grid" ? "active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Icon name="grid" size={15} />
            卡片
          </button>
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <Icon name="list" size={15} />
            列表
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="panel empty-state">
          <span className="empty-icon">
            <Icon
              name={
                query ||
                type !== "all" ||
                language !== "all" ||
                period !== "all"
                  ? "search"
                  : "globe"
              }
              size={26}
            />
          </span>
          <h3>
            {query || type !== "all" || language !== "all" || period !== "all"
              ? "还没有找到匹配的片段"
              : "广场的第一个故事，等你来写"}
          </h3>
          <p>
            {query || type !== "all" || language !== "all" || period !== "all"
              ? "换个关键词，或试试其他类型。"
              : "选择公开发布，让你的灵感遇到更多同路人。"}
          </p>
          {query || type !== "all" || language !== "all" || period !== "all" ? (
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => {
                setQuery("");
                setType("all");
                setLanguage("all");
                setPeriod("all");
                setPage(1);
              }}
            >
              清除筛选
            </button>
          ) : (
            <Link href="/new" className="btn btn-primary">
              创作一段新片段 <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>
      ) : (
        <div
          className={`public-grid ${view === "list" ? "public-list-view" : ""}`}
        >
          {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((p) => (
            <article className="public-card-wrapper" key={p.slug}>
              <Link
                href={`/p/${p.slug}`}
                prefetch={false}
                className="panel public-card"
              >
                <div className="public-card-top">
                  <span className={`type-icon type-${p.contentType}`}>
                    <Icon
                      name={
                        p.contentType === "code"
                          ? "code"
                          : p.contentType === "markdown"
                            ? "markdown"
                            : "text"
                      }
                    />
                  </span>
                  <span className="badge">
                    {p.language || typeLabels[p.contentType]}
                  </span>
                </div>
                <h2>{p.title}</h2>
                <p className="public-excerpt">
                  {p.excerpt || "这个片段还没有文字摘要。"}
                </p>
                <div className="public-card-footer">
                  <span>
                    <Icon name="clock" size={12} />
                    {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                  <span>
                    <Icon name="eye" size={13} />
                    {p.viewCount}
                  </span>
                </div>
              </Link>
              <BookmarkButton
                compact
                paste={{
                  slug: p.slug,
                  title: p.title,
                  contentType: p.contentType,
                  createdAt: p.createdAt,
                  expireAt: p.expireAt,
                  burnAfterRead: false,
                }}
              />
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav className="pagination" aria-label="公开片段分页">
          <button
            className="btn btn-ghost btn-small"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ← 上一页
          </button>
          <span aria-live="polite">
            第 {currentPage} / {pages} 页
          </span>
          <button
            className="btn btn-ghost btn-small"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页 →
          </button>
        </nav>
      )}
      <p className="list-count" aria-live="polite">
        共匹配 {filtered.length} / {rows.length} 条 · 每页 12 条 ·
        搜索、筛选与排序范围为最近 50 条公开片段
      </p>
    </>
  );
}
