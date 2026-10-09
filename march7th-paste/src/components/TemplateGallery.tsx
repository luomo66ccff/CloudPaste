"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { templates, typeLabels } from "@/lib/templates";
export function TemplateGallery() {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部");
  const filtered = templates.filter(
    (t) =>
      (category === "全部" || t.category === category) &&
      `${t.name} ${t.description} ${t.language}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="template-gallery-toolbar">
        <label className="search-field">
          <Icon name="search" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索模板"
            placeholder="找一个适合此刻的起点…"
          />
        </label>
        <div className="filter-tabs" aria-label="模板类别">
          {["全部", "写作", "开发", "学习", "协作"].map((c) => (
            <button
              type="button"
              key={c}
              aria-pressed={category === c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="template-gallery">
        {filtered.map((t) => (
          <article className="panel template-tile" key={t.id}>
            <div className="template-tile-top">
              <span className="quick-icon">
                <Icon name={t.icon} size={24} />
              </span>
              <span className="badge">
                {t.category} · {typeLabels[t.type]}
              </span>
            </div>
            <h2>{t.name}</h2>
            <p className="muted">{t.description}</p>
            <details>
              <summary>看看模板内容</summary>
              <pre>{t.content}</pre>
            </details>
            <Link
              href={`/new?template=${t.id}`}
              prefetch={false}
              className="btn btn-ghost"
            >
              使用这个模板
              <Icon name="arrow" size={16} />
            </Link>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <h3>暂时没有匹配的模板</h3>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setCategory("全部");
            }}
          >
            重置筛选
          </button>
        </div>
      )}
      <p className="list-count" aria-live="polite">
        {filtered.length} / {templates.length} 个模板 ·
        选择后进入编辑器，自由修改再分享
      </p>
    </>
  );
}
