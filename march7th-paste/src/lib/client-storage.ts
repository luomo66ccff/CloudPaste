export const DRAFT_KEY = "march7th-paste-draft-v2";
export const RECENTS_KEY = "march7th-paste-recents-v2";
const MANAGEMENT_KEY = "march7th-paste-management-v2";
export const STORAGE_EVENT = "march7th-paste-storage";
export type Draft = {
  version: 2;
  title: string;
  content: string;
  contentType: string;
  language: string;
  visibility: string;
  expiresIn: string;
  savedAt: string;
};
export type RecentPaste = {
  slug: string;
  title: string;
  contentType: string;
  createdAt: string;
  expireAt: string | null;
  burnAfterRead: boolean;
};
export type ManagementLinks = { editUrl: string; deleteUrl: string };
export function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}
export function storageSnapshot(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function writeDraft(draft: Draft) {
  const safe = {
    version: 2,
    title: draft.title,
    content: draft.content,
    contentType: draft.contentType,
    language: draft.language,
    visibility: draft.visibility,
    expiresIn: draft.expiresIn,
    savedAt: draft.savedAt,
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    /* Optional storage. */
  }
}
export function parseDraft(raw: string): Draft | null {
  try {
    const d = JSON.parse(raw);
    if (
      d.version !== 2 ||
      typeof d.content !== "string" ||
      typeof d.title !== "string" ||
      d.content.length > 524288 ||
      d.title.length > 200 ||
      !["markdown", "code", "plain"].includes(d.contentType) ||
      !["unlisted", "public"].includes(d.visibility) ||
      !["never", "1d", "7d", "30d"].includes(d.expiresIn) ||
      typeof d.language !== "string" ||
      d.language.length > 40 ||
      !Number.isFinite(Date.parse(d.savedAt))
    )
      return null;
    return {
      version: 2,
      title: d.title,
      content: d.content,
      contentType: d.contentType,
      language: d.language,
      visibility: d.visibility,
      expiresIn: d.expiresIn,
      savedAt: d.savedAt,
    };
  } catch {
    return null;
  }
}
export function parseRecents(raw: string): RecentPaste[] {
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is RecentPaste =>
        Boolean(
          r &&
            typeof r === "object" &&
            typeof r.slug === "string" &&
            /^[a-zA-Z0-9_-]{1,64}$/.test(r.slug) &&
            typeof r.title === "string" &&
            ["markdown", "code", "plain"].includes(r.contentType) &&
            Number.isFinite(Date.parse(r.createdAt)) &&
            (r.expireAt === null ||
              (typeof r.expireAt === "string" &&
                Number.isFinite(Date.parse(r.expireAt)))),
        ),
      )
      .slice(0, 40)
      .map((r) => ({
        slug: r.slug,
        title: r.title.slice(0, 200),
        contentType: r.contentType,
        createdAt: r.createdAt,
        expireAt: r.expireAt,
        burnAfterRead: Boolean(r.burnAfterRead),
      }));
  } catch {
    return [];
  }
}
export function rememberPaste(paste: RecentPaste) {
  const safe = {
    slug: paste.slug,
    title: paste.title,
    contentType: paste.contentType,
    createdAt: paste.createdAt,
    expireAt: paste.expireAt,
    burnAfterRead: paste.burnAfterRead,
  };
  try {
    const rows = parseRecents(storageSnapshot(RECENTS_KEY)).filter(
      (r) => r.slug !== paste.slug,
    );
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([safe, ...rows].slice(0, 40)),
    );
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function forgetPaste(slug?: string) {
  try {
    if (slug)
      localStorage.setItem(
        RECENTS_KEY,
        JSON.stringify(
          parseRecents(storageSnapshot(RECENTS_KEY)).filter(
            (r) => r.slug !== slug,
          ),
        ),
      );
    else localStorage.removeItem(RECENTS_KEY);
    if (slug) {
      const links = JSON.parse(sessionStorage.getItem(MANAGEMENT_KEY) ?? "{}");
      delete links[slug];
      sessionStorage.setItem(MANAGEMENT_KEY, JSON.stringify(links));
    } else sessionStorage.removeItem(MANAGEMENT_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    /* Browser records are independent of remote pastes. */
  }
}
function safeManagementUrl(
  url: string,
  slug: string,
  route: "edit" | "delete",
) {
  try {
    const u = new URL(url, window.location.origin);
    return (
      u.origin === window.location.origin &&
      u.pathname === `/${route}/${slug}` &&
      Boolean(u.searchParams.get("key") ?? u.searchParams.get("token"))
    );
  } catch {
    return false;
  }
}
export function saveManagementLinks(slug: string, links: ManagementLinks) {
  if (
    !safeManagementUrl(links.editUrl, slug, "edit") ||
    !safeManagementUrl(links.deleteUrl, slug, "delete")
  )
    return false;
  try {
    const records = JSON.parse(sessionStorage.getItem(MANAGEMENT_KEY) ?? "{}");
    records[slug] = { editUrl: links.editUrl, deleteUrl: links.deleteUrl };
    sessionStorage.setItem(MANAGEMENT_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function readManagementLinks(slug: string): ManagementLinks | null {
  try {
    const links = JSON.parse(sessionStorage.getItem(MANAGEMENT_KEY) ?? "{}")[
      slug
    ];
    return links &&
      safeManagementUrl(links.editUrl, slug, "edit") &&
      safeManagementUrl(links.deleteUrl, slug, "delete")
      ? links
      : null;
  } catch {
    return null;
  }
}

export const DRAFTS_KEY = "march7th-paste-drafts-v3";
export const BOOKMARKS_KEY = "march7th-paste-bookmarks-v3";
export const RECORD_FLAGS_KEY = "march7th-paste-record-flags-v3";
export const MAX_DRAFTS = 12;
export const MAX_DRAFT_BYTES = 524288;
export const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;
export type DraftFields = Pick<
  Draft,
  "title" | "content" | "contentType" | "language" | "visibility" | "expiresIn"
>;
export type DraftDocument = DraftFields & {
  version: 3;
  id: string;
  revision: number;
  createdAt: string;
  savedAt: string;
};
type SaveFailure = "conflict" | "quota" | "unavailable" | "invalid" | "limit";
export type DraftSaveResult =
  | { ok: true; draft: DraftDocument }
  | { ok: false; reason: SaveFailure };
type Library = { version: 3; drafts: DraftDocument[] };
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
function safeFields(value: unknown): DraftFields | null {
  if (!value || typeof value !== "object") return null;
  const d = value as DraftFields;
  if (
    typeof d.content !== "string" ||
    bytes(d.content) > MAX_DRAFT_BYTES ||
    typeof d.title !== "string" ||
    d.title.length > 200 ||
    typeof d.language !== "string" ||
    d.language.length > 40 ||
    !["markdown", "code", "plain"].includes(d.contentType) ||
    !["public", "unlisted"].includes(d.visibility) ||
    !["never", "1d", "7d", "30d"].includes(d.expiresIn)
  )
    return null;
  return {
    title: d.title,
    content: d.content,
    contentType: d.contentType,
    language: d.language,
    visibility: d.visibility,
    expiresIn: d.expiresIn,
  };
}
export function parseDraftLibrary(raw: string): Library | null {
  if (!raw) return { version: 3, drafts: [] };
  try {
    const data = JSON.parse(raw);
    if (
      data.version !== 3 ||
      !Array.isArray(data.drafts) ||
      data.drafts.length > MAX_DRAFTS
    )
      return null;
    const drafts: DraftDocument[] = [];
    const ids = new Set<string>();
    for (const d of data.drafts) {
      const fields = safeFields(d);
      if (
        !fields ||
        d.version !== 3 ||
        !validId(d.id) ||
        ids.has(d.id) ||
        !Number.isSafeInteger(d.revision) ||
        d.revision < 1 ||
        typeof d.createdAt !== "string" ||
        !Number.isFinite(Date.parse(d.createdAt)) ||
        typeof d.savedAt !== "string" ||
        !Number.isFinite(Date.parse(d.savedAt))
      )
        return null;
      ids.add(d.id);
      drafts.push({
        ...fields,
        version: 3,
        id: d.id,
        revision: d.revision,
        createdAt: d.createdAt,
        savedAt: d.savedAt,
      });
    }
    if (
      drafts.reduce((total, d) => total + bytes(d.content), 0) >
      MAX_LIBRARY_BYTES
    )
      return null;
    return { version: 3, drafts };
  } catch {
    return null;
  }
}
function readLibrary(): Library {
  const library = parseDraftLibrary(localStorage.getItem(DRAFTS_KEY) ?? "");
  if (!library) throw new Error("invalid");
  return library;
}
export function listDrafts(): DraftDocument[] {
  try {
    return readLibrary().drafts.sort((a, b) =>
      b.savedAt.localeCompare(a.savedAt),
    );
  } catch {
    return [];
  }
}
export function getDraft(id: string): DraftDocument | null {
  return listDrafts().find((d) => d.id === id) ?? null;
}
function notifyStorage() {
  window.dispatchEvent(new Event(STORAGE_EVENT));
}
async function withLibraryLock<T>(operation: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(DRAFTS_KEY, operation);
  }
  // localStorage has no atomic compare-and-swap across tabs. Retain a read-only
  // library on browsers without Web Locks instead of risking a lost draft.
  throw new Error("unavailable");
}
function storageFailure(error: unknown): SaveFailure {
  if (error instanceof Error && error.message === "invalid") return "invalid";
  if (error instanceof Error && error.name === "QuotaExceededError")
    return "quota";
  return "unavailable";
}
function writeLibrary(library: Library): SaveFailure | null {
  if (
    library.drafts.length > MAX_DRAFTS ||
    library.drafts.reduce((n, d) => n + bytes(d.content), 0) > MAX_LIBRARY_BYTES
  )
    return "limit";
  const raw = JSON.stringify(library);
  localStorage.setItem(DRAFTS_KEY, raw);
  if (localStorage.getItem(DRAFTS_KEY) !== raw) return "conflict";
  notifyStorage();
  return null;
}
export async function prepareDraftLibrary(): Promise<{
  ok: boolean;
  reason?: SaveFailure;
}> {
  try {
    return await withLibraryLock(() => {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw !== null) {
        readLibrary();
        return { ok: true };
      }
      const oldRaw = localStorage.getItem(DRAFT_KEY);
      if (!oldRaw) return { ok: true };
      const old = parseDraft(oldRaw);
      const fields = safeFields(old);
      if (!old || !fields) return { ok: false, reason: "invalid" as const };
      const draft: DraftDocument = {
        ...fields,
        version: 3,
        id: "legacy-v2",
        revision: 1,
        createdAt: old.savedAt,
        savedAt: old.savedAt,
      };
      const reason = writeLibrary({ version: 3, drafts: [draft] });
      if (reason) return { ok: false, reason };
      if (localStorage.getItem(DRAFT_KEY) === oldRaw)
        localStorage.removeItem(DRAFT_KEY);
      notifyStorage();
      return { ok: true };
    });
  } catch (error) {
    return { ok: false, reason: storageFailure(error) };
  }
}
export async function saveDraft(
  fields: DraftFields,
  options: { id?: string; expectedRevision?: number } = {},
): Promise<DraftSaveResult> {
  const safe = safeFields(fields);
  if (!safe || (options.id && !validId(options.id)))
    return { ok: false, reason: "invalid" };
  try {
    return await withLibraryLock(() => {
      const library = readLibrary();
      const existing = options.id
        ? library.drafts.find((d) => d.id === options.id)
        : undefined;
      if (
        options.id &&
        (!existing || existing.revision !== options.expectedRevision)
      )
        return { ok: false as const, reason: "conflict" as const };
      if (
        existing &&
        (Object.keys(safe) as (keyof DraftFields)[]).every(
          (key) => safe[key] === existing[key],
        )
      ) {
        return { ok: true as const, draft: existing };
      }
      const now = new Date().toISOString();
      const draft: DraftDocument = {
        ...safe,
        version: 3,
        id: existing?.id ?? crypto.randomUUID(),
        revision: (existing?.revision ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        savedAt: now,
      };
      const next = {
        version: 3 as const,
        drafts: [draft, ...library.drafts.filter((d) => d.id !== draft.id)],
      };
      const reason = writeLibrary(next);
      return reason
        ? { ok: false as const, reason }
        : { ok: true as const, draft };
    });
  } catch (error) {
    return { ok: false, reason: storageFailure(error) };
  }
}
export async function removeDraft(
  id: string,
  expectedRevision?: number,
): Promise<{ ok: boolean; reason?: SaveFailure }> {
  try {
    return await withLibraryLock(() => {
      const library = readLibrary();
      const current = library.drafts.find((d) => d.id === id);
      if (!current) return { ok: true };
      if (
        expectedRevision === undefined ||
        current.revision !== expectedRevision
      )
        return { ok: false, reason: "conflict" as const };
      const reason = writeLibrary({
        version: 3,
        drafts: library.drafts.filter((d) => d.id !== id),
      });
      return reason ? { ok: false, reason } : { ok: true };
    });
  } catch (error) {
    return { ok: false, reason: storageFailure(error) };
  }
}
export function exportDraftBackup(): string | null {
  try {
    return JSON.stringify(
      {
        format: "march7th-drafts",
        version: 1,
        exportedAt: new Date().toISOString(),
        drafts: readLibrary().drafts,
      },
      null,
      2,
    );
  } catch {
    return null;
  }
}
export async function importDraftBackup(
  raw: string,
): Promise<{ ok: boolean; count?: number; reason?: SaveFailure }> {
  if (bytes(raw) > 16 * 1024 * 1024) return { ok: false, reason: "limit" };
  let incoming: Library | null;
  try {
    const file = JSON.parse(raw);
    if (file.format !== "march7th-drafts" || file.version !== 1)
      return { ok: false, reason: "invalid" };
    incoming = parseDraftLibrary(
      JSON.stringify({ version: 3, drafts: file.drafts }),
    );
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!incoming) return { ok: false, reason: "invalid" };
  try {
    return await withLibraryLock(() => {
      const library = readLibrary();
      const now = new Date().toISOString();
      const drafts = incoming!.drafts.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        revision: 1,
        createdAt: now,
        savedAt: now,
      }));
      const reason = writeLibrary({
        version: 3,
        drafts: [...drafts, ...library.drafts],
      });
      return reason
        ? { ok: false, reason }
        : { ok: true, count: drafts.length };
    });
  } catch (error) {
    return { ok: false, reason: storageFailure(error) };
  }
}
export type RecordFlags = Record<
  string,
  { pinned: boolean; archived: boolean }
>;
export function parseRecordFlags(raw: string): RecordFlags {
  try {
    const data = JSON.parse(raw);
    const result: RecordFlags = {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return result;
    for (const [slug, flags] of Object.entries(data).slice(0, 100)) {
      if (
        /^[a-zA-Z0-9_-]{1,64}$/.test(slug) &&
        flags &&
        typeof flags === "object"
      ) {
        const f = flags as { pinned?: unknown; archived?: unknown };
        result[slug] = {
          pinned: f.pinned === true,
          archived: f.archived === true,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}
export function setRecordFlag(
  slug: string,
  flag: "pinned" | "archived",
  enabled: boolean,
) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) return false;
  try {
    const flags = parseRecordFlags(storageSnapshot(RECORD_FLAGS_KEY));
    flags[slug] = {
      ...(flags[slug] ?? { pinned: false, archived: false }),
      [flag]: enabled,
    };
    localStorage.setItem(
      RECORD_FLAGS_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(flags).slice(-100))),
    );
    notifyStorage();
    return true;
  } catch {
    return false;
  }
}
export function toggleBookmark(paste: RecentPaste): boolean {
  try {
    const rows = parseRecents(storageSnapshot(BOOKMARKS_KEY));
    const exists = rows.some((r) => r.slug === paste.slug);
    const safe = parseRecents(JSON.stringify([paste]))[0];
    if (!safe) return false;
    localStorage.setItem(
      BOOKMARKS_KEY,
      JSON.stringify(
        exists
          ? rows.filter((r) => r.slug !== paste.slug)
          : [safe, ...rows].slice(0, 40),
      ),
    );
    notifyStorage();
    return true;
  } catch {
    return false;
  }
}
