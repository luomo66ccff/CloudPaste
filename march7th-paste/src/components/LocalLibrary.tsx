"use client";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Icon } from "@/components/Icon";
import { typeLabels } from "@/lib/templates";
import {
  BOOKMARKS_KEY,
  DRAFTS_KEY,
  DRAFT_KEY,
  RECENTS_KEY,
  RECORD_FLAGS_KEY,
  MAX_DRAFTS,
  clearDraft,
  exportDraftBackup,
  forgetPaste,
  importDraftBackup,
  parseDraft,
  parseDraftLibrary,
  parseRecents,
  parseRecordFlags,
  prepareDraftLibrary,
  readManagementLinks,
  removeDraft,
  saveDraft,
  saveManagementLinks,
  setRecordFlag,
  storageSnapshot,
  subscribeStorage,
  toggleBookmark,
  type DraftDocument,
  type RecentPaste,
} from "@/lib/client-storage";

function useStored(key: string) {
  return useSyncExternalStore(
    subscribeStorage,
    () => storageSnapshot(key),
    () => "",
  );
}
const failures: Record<string, string> = {
  conflict: "草稿已在另一个标签页修改，请刷新列表后重试。",
  quota: "浏览器存储空间不足，请先下载备份。",
  unavailable: "浏览器存储不可用，现有输入仍然保留。",
  invalid: "草稿数据格式异常，已保留原始数据，未覆盖。",
  limit: "草稿库最多 12 份、正文合计 2 MiB，单份 512 KiB。请先整理草稿。",
};
export function LocalLibrary({
  initialTab = "drafts",
}: {
  initialTab?: string;
}) {
  const [tab, setTab] = useState(
    ["drafts", "history", "bookmarks"].includes(initialTab)
      ? initialTab
      : "drafts",
  );
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [scope, setScope] = useState("active");
  const [expiry, setExpiry] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoredSlug, setRestoredSlug] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const draftRaw = useStored(DRAFTS_KEY),
    legacyRaw = useStored(DRAFT_KEY);
  const historyRaw = useStored(RECENTS_KEY),
    bookmarkRaw = useStored(BOOKMARKS_KEY),
    flagsRaw = useStored(RECORD_FLAGS_KEY);
  const library = useMemo(() => parseDraftLibrary(draftRaw), [draftRaw]);
  const drafts = useMemo(
    () =>
      [...(library?.drafts ?? [])].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    [library],
  );
  const history = useMemo(() => parseRecents(historyRaw), [historyRaw]);
  const bookmarks = useMemo(() => parseRecents(bookmarkRaw), [bookmarkRaw]);
  const flags = useMemo(() => parseRecordFlags(flagsRaw), [flagsRaw]);
  const importRef = useRef<HTMLInputElement>(null),
    credentialRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void prepareDraftLibrary();
    queueMicrotask(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const visibleDrafts = drafts.filter(
    (d) =>
      (type === "all" || d.contentType === type) &&
      `${d.title} ${d.content}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const records = (tab === "bookmarks" ? bookmarks : history)
    .filter(
      (p) =>
        (scope === "all" ||
          (scope === "archived"
            ? flags[p.slug]?.archived
            : !flags[p.slug]?.archived)) &&
        (type === "all" || p.contentType === type) &&
        `${p.title} ${p.slug}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()) &&
        (expiry === "all" ||
          (expiry === "expired"
            ? p.expireAt && Date.parse(p.expireAt) < now
            : !p.expireAt || Date.parse(p.expireAt) >= now)),
    )
    .sort(
      (a, b) =>
        Number(flags[b.slug]?.pinned ?? false) -
        Number(flags[a.slug]?.pinned ?? false),
    );
  async function draftAction(
    draft: DraftDocument,
    action: "rename" | "duplicate" | "delete",
  ) {
    setBusy(true);
    setMessage("");
    try {
      if (action === "delete") {
        if (
          !window.confirm(
            `删除本机草稿「${draft.title || "未命名"}」？此操作不影响线上片段。`,
          )
        )
          return;
        const result = await removeDraft(draft.id, draft.revision);
        setMessage(
          result.ok
            ? "本机草稿已删除。"
            : failures[result.reason ?? "unavailable"],
        );
      } else {
        const title =
          action === "rename"
            ? window.prompt("草稿名称（最多 200 字）", draft.title)
            : `${draft.title || "未命名草稿"} · 副本`.slice(0, 200);
        if (title === null) return;
        const result = await saveDraft(
          { ...draft, title: title.slice(0, 200) },
          action === "rename"
            ? { id: draft.id, expectedRevision: draft.revision }
            : {},
        );
        setMessage(
          result.ok
            ? action === "rename"
              ? "草稿已重命名。"
              : "已创建独立副本。"
            : failures[result.reason],
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function exportBackup() {
    const raw = exportDraftBackup();
    if (!raw) {
      setMessage(failures.invalid);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `march7th-drafts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("草稿备份已下载，文件包含本机草稿正文，请妥善保存。");
  }
  async function importFile(file: File | undefined, credentials = false) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > (credentials ? 32768 : 16 * 1024 * 1024)) {
        setMessage("文件过大，未读取。");
        return;
      }
      const raw = await file.text();
      if (credentials) {
        const data = JSON.parse(raw);
        if (
          data.version !== 1 ||
          typeof data.slug !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(data.slug) ||
          typeof data.editUrl !== "string" ||
          typeof data.deleteUrl !== "string" ||
          !saveManagementLinks(data.slug, data)
        ) {
          setMessage("凭证格式或站点不匹配，未导入。");
          return;
        }
        setMessage("管理链接已导入当前会话。服务器会在实际管理时验证权限。");
        setRestoredSlug(data.slug);
      } else {
        const result = await importDraftBackup(raw);
        setMessage(
          result.ok
            ? `已导入 ${result.count} 份独立草稿，原草稿保留。`
            : failures[result.reason ?? "invalid"],
        );
      }
    } catch {
      setMessage("无法读取此文件，请选择本站导出的 JSON 文件。");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
      if (credentialRef.current) credentialRef.current.value = "";
    }
  }
  async function recoverLegacy() {
    const old = parseDraft(legacyRaw);
    if (!old) {
      setMessage(failures.invalid);
      return;
    }
    const result = await saveDraft(old);
    if (result.ok) {
      if (storageSnapshot(DRAFT_KEY) === legacyRaw) clearDraft();
      setMessage("旧版草稿已恢复为独立草稿。");
    } else setMessage(failures[result.reason]);
  }
  function recordAction(p: RecentPaste, flag: "pinned" | "archived") {
    if (!setRecordFlag(p.slug, flag, !flags[p.slug]?.[flag]))
      setMessage(failures.unavailable);
  }
  return (
    <section className="local-library">
      <div className="library-overview">
        <div className="panel library-stat">
          <Icon name="file" />
          <strong>
            {drafts.length}
            <small> / {MAX_DRAFTS}</small>
          </strong>
          <span>本机草稿</span>
        </div>
        <div className="panel library-stat">
          <Icon name="clock" />
          <strong>{history.length}</strong>
          <span>创建记录</span>
        </div>
        <div className="panel library-stat">
          <Icon name="bookmark" />
          <strong>{bookmarks.length}</strong>
          <span>本机收藏</span>
        </div>
      </div>
      <div className="library-tabs filter-tabs" aria-label="资料库类别">
        {[
          ["drafts", "草稿工作区"],
          ["history", "分享记录"],
          ["bookmarks", "收藏夹"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setQuery("");
              setScope("active");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel library-panel">
        <div className="library-toolbar">
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="搜索资料库"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "drafts" ? "搜索草稿标题或正文…" : "搜索标题或片段 ID…"
              }
            />
          </label>
          <select
            className="sort-select"
            aria-label="资料类型"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">全部类型</option>
            {Object.entries(typeLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {tab !== "drafts" && (
            <>
              <select
                className="sort-select"
                aria-label="归档状态"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="active">未归档</option>
                <option value="archived">已归档</option>
                <option value="all">全部记录</option>
              </select>
              <select
                className="sort-select"
                aria-label="到期状态"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              >
                <option value="all">全部有效期</option>
                <option value="active">未到期</option>
                <option value="expired">已到期</option>
              </select>
            </>
          )}
        </div>
        {message && (
          <p className="library-message" role="status">
            {message}
          </p>
        )}
        {!library && (
          <p className="library-message" role="alert">
            {failures.invalid}
          </p>
        )}
        {legacyRaw && (
          <div className="legacy-notice">
            <span>发现一份尚未迁移的旧版草稿。</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={recoverLegacy}
            >
              恢复旧草稿
            </button>
          </div>
        )}
        {tab === "drafts" ? (
          <>
            <div className="section-title">
              <div>
                <h2>给每个想法留一个位置</h2>
                <p className="muted">
                  独立自动保存 · 总正文上限 2 MiB · 此设备专属
                </p>
              </div>
              <Link href="/new" className="btn btn-primary">
                <Icon name="plus" size={16} />
                新草稿
              </Link>
            </div>
            {visibleDrafts.length ? (
              <div className="draft-grid">
                {visibleDrafts.map((d) => (
                  <article className="draft-tile" key={d.id}>
                    <div className="draft-tile-heading">
                      <span className="badge">{typeLabels[d.contentType]}</span>
                      <span className="muted">v{d.revision}</span>
                    </div>
                    <Link
                      className="draft-title"
                      href={`/new?draft=${d.id}`}
                      prefetch={false}
                    >
                      {d.title || "未命名草稿"}
                    </Link>
                    <p className="draft-excerpt">
                      {d.content.slice(0, 130) || "还没有写入正文"}
                    </p>
                    <span className="muted">
                      {new Date(d.savedAt).toLocaleString("zh-CN")} ·{" "}
                      {new TextEncoder()
                        .encode(d.content)
                        .length.toLocaleString()}{" "}
                      字节
                    </span>
                    <div className="draft-tile-actions">
                      <Link
                        href={`/new?draft=${d.id}`}
                        prefetch={false}
                        className="btn btn-ghost btn-small"
                      >
                        继续编辑
                        <Icon name="arrow" size={14} />
                      </Link>
                      <button
                        disabled={busy}
                        className="icon-button"
                        aria-label={`重命名草稿：${d.title}`}
                        title="重命名"
                        onClick={() => void draftAction(d, "rename")}
                      >
                        <Icon name="text" size={16} />
                      </button>
                      <button
                        disabled={busy}
                        className="icon-button"
                        aria-label={`复制草稿：${d.title}`}
                        title="复制为独立草稿"
                        onClick={() => void draftAction(d, "duplicate")}
                      >
                        <Icon name="copy" size={16} />
                      </button>
                      <button
                        disabled={busy}
                        className="icon-button"
                        aria-label={`删除草稿：${d.title}`}
                        title="删除本机草稿"
                        onClick={() => void draftAction(d, "delete")}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Icon name="file" size={32} />
                <h3>{query ? "没有匹配的草稿" : "灵感可以同时进行"}</h3>
                <p>在编辑器中写下内容，就会自动保存为一份独立草稿。</p>
                <Link href="/new" className="btn btn-ghost">
                  开始创作
                </Link>
              </div>
            )}
            <details className="library-backup">
              <summary>草稿备份与恢复</summary>
              <p className="muted">
                备份包含草稿正文，不含密码或管理凭证。导入只添加独立副本，整批验证通过后保存。
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={!drafts.length || busy}
                  onClick={exportBackup}
                >
                  <Icon name="download" size={15} />
                  下载全部草稿
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => importRef.current?.click()}
                >
                  <Icon name="upload" size={15} />
                  导入草稿备份
                </button>
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="section-title">
              <h2>
                {tab === "bookmarks"
                  ? "留住值得再看的分享"
                  : "在这台设备上创建"}
              </h2>
              {tab === "history" && history.length > 0 && (
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    if (
                      window.confirm(
                        "清空此浏览器的创建记录和会话管理链接？线上片段保留。",
                      )
                    )
                      forgetPaste();
                  }}
                >
                  清空创建记录
                </button>
              )}
            </div>
            {records.length ? (
              <div className="recent-list">
                {records.map((p) => {
                  const links = readManagementLinks(p.slug);
                  return (
                    <div className="recent-row library-record" key={p.slug}>
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
                        <Link prefetch={false} href={`/p/${p.slug}`}>
                          {flags[p.slug]?.pinned && (
                            <Icon name="pin" size={13} />
                          )}{" "}
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
                        {links && (
                          <div className="row-management">
                            <a href={links.editUrl}>编辑线上片段</a>
                            <a href={links.deleteUrl}>删除线上片段</a>
                          </div>
                        )}
                      </div>
                      <div className="record-actions">
                        <button
                          className="icon-button"
                          aria-label={`${flags[p.slug]?.pinned ? "取消置顶" : "置顶"}：${p.title}`}
                          aria-pressed={flags[p.slug]?.pinned ?? false}
                          onClick={() => recordAction(p, "pinned")}
                        >
                          <Icon name="pin" size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${flags[p.slug]?.archived ? "取消归档" : "归档"}：${p.title}`}
                          onClick={() => recordAction(p, "archived")}
                        >
                          <Icon name="archive" size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`移除${tab === "bookmarks" ? "收藏" : "本机记录"}：${p.title}`}
                          onClick={() =>
                            tab === "bookmarks"
                              ? toggleBookmark(p)
                              : forgetPaste(p.slug)
                          }
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <Icon
                  name={tab === "bookmarks" ? "bookmark" : "clock"}
                  size={30}
                />
                <h3>这里还没有匹配的片段</h3>
                <p>
                  {tab === "bookmarks"
                    ? "在广场或阅读页点击收藏，稍后在这里找回。"
                    : "创建的片段会自动留下分享记录。"}
                </p>
              </div>
            )}
            {tab === "history" && (
              <details className="library-backup">
                <summary>恢复管理凭证</summary>
                <p className="muted">
                  选择创建成功时下载的本站凭证，仅保存到当前标签页会话。访问密码不在凭证中。
                </p>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => credentialRef.current?.click()}
                >
                  <Icon name="upload" size={15} />
                  导入管理凭证
                </button>
                {restoredSlug && readManagementLinks(restoredSlug) && (
                  <div className="restored-management">
                    <p>已恢复 /{restoredSlug} 的管理入口</p>
                    <div className="button-row">
                      <a
                        className="btn btn-ghost btn-small"
                        href={readManagementLinks(restoredSlug)!.editUrl}
                      >
                        编辑线上片段
                      </a>
                      <a
                        className="btn btn-ghost btn-small danger-text"
                        href={readManagementLinks(restoredSlug)!.deleteUrl}
                      >
                        管理删除
                      </a>
                    </div>
                  </div>
                )}
              </details>
            )}
          </>
        )}
      </div>
      <input
        hidden
        ref={importRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      <input
        hidden
        ref={credentialRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void importFile(e.target.files?.[0], true)}
      />
    </section>
  );
}
