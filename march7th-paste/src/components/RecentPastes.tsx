"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import {
  DRAFTS_KEY,
  RECENTS_KEY,
  forgetPaste,
  parseDraftLibrary,
  parseRecents,
  readManagementLinks,
  storageSnapshot,
  subscribeStorage,
} from "@/lib/client-storage";
import { typeLabels } from "@/lib/templates";
export function RecentPastes({ compact = false }: { compact?: boolean }) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => storageSnapshot(RECENTS_KEY),
    () => "",
  );
  const draftRaw = useSyncExternalStore(
    subscribeStorage,
    () => storageSnapshot(DRAFTS_KEY),
    () => "",
  );
  const rows = useMemo(() => parseRecents(raw), [raw]);
  const draft = useMemo(
    () =>
      parseDraftLibrary(draftRaw)?.drafts.sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      )[0],
    [draftRaw],
  );
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) =>
    r.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className={compact ? "recent-section" : "panel recent-full"}>
      <div className="section-title">
        <div>
          <h2>{compact ? "最近的片段" : "在这台设备上创建"}</h2>
          <p className="muted">仅存于此浏览器，换个设备不会同步。</p>
        </div>
        {compact ? (
          <Link href="/recent" className="text-link">
            查看全部 <Icon name="arrow" size={15} />
          </Link>
        ) : rows.length > 0 ? (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "清空此浏览器的记录和会话管理链接？线上片段会保留。",
                )
              )
                forgetPaste();
            }}
          >
            <Icon name="trash" size={15} />
            清空本机记录
          </button>
        ) : null}
      </div>
      {draft && (
        <Link
          href={`/new?draft=${draft.id}`}
          prefetch={false}
          className="draft-card"
        >
          <span className="small-icon">
            <Icon name="file" />
          </span>
          <div>
            <strong>继续上次的草稿</strong>
            <span>{draft.title || "未命名草稿"}</span>
          </div>
          <Icon name="arrow" size={17} />
        </Link>
      )}
      {!compact && rows.length > 0 && (
        <label className="search-field">
          <Icon name="search" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索本机片段标题…"
            aria-label="搜索本机片段"
          />
        </label>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="clock" size={25} />
          </span>
          <h3>{query ? "没有找到匹配的片段" : "你的下一段灵感，从这里开始"}</h3>
          <p>
            {query
              ? "换个关键词再试试。"
              : "创建后，分享链接会出现在这里，方便你随时找回。"}
          </p>
          {!query && (
            <Link href="/new" className="btn btn-ghost btn-small">
              新建第一个片段 <Icon name="arrow" size={15} />
            </Link>
          )}
        </div>
      ) : (
        <div className="recent-list">
          {(compact ? filtered.slice(0, 4) : filtered).map((p) => {
            const management = readManagementLinks(p.slug);
            return (
              <div className="recent-row" key={p.slug}>
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
                <div className="recent-row-main">
                  <Link href={`/p/${p.slug}`} prefetch={false}>
                    {p.title || "未命名片段"}
                  </Link>
                  <span>
                    {typeLabels[p.contentType]} ·{" "}
                    {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                    {p.burnAfterRead ? " · 阅后即焚" : ""}
                    {p.expireAt
                      ? ` · 到期 ${new Date(p.expireAt).toLocaleDateString("zh-CN")}`
                      : ""}
                  </span>
                </div>
                {!compact && management && (
                  <div className="row-management">
                    <a href={management.editUrl}>编辑</a>
                    <a href={management.deleteUrl}>删除线上片段</a>
                  </div>
                )}
                {!compact ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`移除本机记录：${p.title}`}
                    title="仅移除本机记录"
                    onClick={() => forgetPaste(p.slug)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                ) : (
                  <Icon name="arrow" size={16} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
