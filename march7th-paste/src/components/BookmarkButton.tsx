"use client";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import {
  BOOKMARKS_KEY,
  parseRecents,
  storageSnapshot,
  subscribeStorage,
  toggleBookmark,
  type RecentPaste,
} from "@/lib/client-storage";
export function BookmarkButton({
  paste,
  compact = false,
}: {
  paste: RecentPaste;
  compact?: boolean;
}) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => storageSnapshot(BOOKMARKS_KEY),
    () => "",
  );
  const saved = parseRecents(raw).some((p) => p.slug === paste.slug);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      className={
        compact ? "icon-button bookmark-button" : "btn btn-ghost btn-small"
      }
      aria-label={`${saved ? "取消收藏" : "收藏"}：${paste.title}`}
      aria-pressed={saved}
      title={
        error ? "浏览器无法保存收藏" : saved ? "取消收藏" : "保存到本机收藏夹"
      }
      onClick={() => setError(!toggleBookmark(paste))}
    >
      <Icon name={saved ? "check" : "bookmark"} size={15} />
      {!compact && (
        <span>{error ? "收藏失败" : saved ? "已收藏" : "收藏"}</span>
      )}
    </button>
  );
}
