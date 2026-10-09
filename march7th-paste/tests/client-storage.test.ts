import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOKMARKS_KEY,
  DRAFTS_KEY,
  DRAFT_KEY,
  exportDraftBackup,
  importDraftBackup,
  listDrafts,
  parseDraftLibrary,
  prepareDraftLibrary,
  removeDraft,
  saveDraft,
  toggleBookmark,
  type DraftFields,
} from "@/lib/client-storage";
import { safeShareUrl } from "@/lib/share-url";
import { rehypeHeadingAnchors } from "@/lib/markdown-headings";
let data: Map<string, string>;
let quota = false;
const fields: DraftFields = {
  title: "本机测试",
  content: "你好 🌌",
  contentType: "markdown",
  language: "",
  visibility: "unlisted",
  expiresIn: "never",
};
beforeEach(() => {
  data = new Map();
  quota = false;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (quota) throw new DOMException("full", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => data.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, callback: () => unknown) => {
        const result = queue.then(callback);
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
  });
});
describe("versioned local drafts", () => {
  it("keeps data read-only without cross-tab Web Locks", async () => {
    await saveDraft(fields);
    const before = data.get(DRAFTS_KEY);
    vi.stubGlobal("navigator", {});
    expect(await saveDraft({ ...fields, content: "other" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect((await prepareDraftLibrary()).ok).toBe(false);
    expect(data.get(DRAFTS_KEY)).toBe(before);
    expect(exportDraftBackup()).toContain(fields.content);
  });
  it("round-trips a full backup even when JSON escaping expands the file", async () => {
    for (let i = 0; i < 4; i++)
      await saveDraft({ ...fields, content: "\n".repeat(524288) });
    const backup = exportDraftBackup()!;
    expect(new TextEncoder().encode(backup).length).toBeGreaterThan(
      4 * 1024 * 1024,
    );
    data.clear();
    expect(await importDraftBackup(backup)).toEqual({ ok: true, count: 4 });
    expect(listDrafts()[0].content).toHaveLength(524288);
  });
  it("migrates v2 only after verified write and strips unknown credentials", async () => {
    data.set(
      DRAFT_KEY,
      JSON.stringify({
        ...fields,
        version: 2,
        savedAt: "2026-10-07T10:00:00Z",
        password: "secret",
        editUrl: "/edit/x?key=secret",
      }),
    );
    expect(await prepareDraftLibrary()).toEqual({ ok: true });
    expect(data.has(DRAFT_KEY)).toBe(false);
    expect(listDrafts()[0].id).toBe("legacy-v2");
    expect(data.get(DRAFTS_KEY)).not.toContain("secret");
  });
  it("preserves legacy data when writing is unavailable", async () => {
    const raw = JSON.stringify({
      ...fields,
      version: 2,
      savedAt: "2026-10-07T10:00:00Z",
    });
    data.set(DRAFT_KEY, raw);
    quota = true;
    expect(await prepareDraftLibrary()).toEqual({ ok: false, reason: "quota" });
    expect(data.get(DRAFT_KEY)).toBe(raw);
  });
  it("never overwrites malformed v3 data or discards a remaining legacy draft", async () => {
    data.set(DRAFTS_KEY, "broken-json");
    data.set(DRAFT_KEY, "old-data");
    expect(await saveDraft(fields)).toEqual({ ok: false, reason: "invalid" });
    expect((await prepareDraftLibrary()).ok).toBe(false);
    expect(data.get(DRAFTS_KEY)).toBe("broken-json");
    expect(data.get(DRAFT_KEY)).toBe("old-data");
  });
  it("creates independent drafts and sanitizes serialized/exported fields", async () => {
    await saveDraft({
      ...fields,
      password: "not-allowed",
      deleteUrl: "not-allowed",
    } as DraftFields);
    await saveDraft({ ...fields, title: "第二份" });
    expect(listDrafts()).toHaveLength(2);
    expect(exportDraftBackup()).not.toContain("not-allowed");
    expect(exportDraftBackup()).toContain("你好");
  });
  it("rejects stale cross-tab revisions and keeps the winning text", async () => {
    const first = await saveDraft(fields);
    if (!first.ok) throw new Error("fixture");
    const results = await Promise.all([
      saveDraft(
        { ...fields, content: "A" },
        { id: first.draft.id, expectedRevision: 1 },
      ),
      saveDraft(
        { ...fields, content: "B" },
        { id: first.draft.id, expectedRevision: 1 },
      ),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results[1]).toEqual({ ok: false, reason: "conflict" });
    expect(listDrafts()[0].content).toBe("A");
  });
  it("does not create a conflicting revision when restoring or saving unchanged text", async () => {
    const first = await saveDraft(fields);
    if (!first.ok) throw new Error("fixture");
    const before = data.get(DRAFTS_KEY);
    const restored = await saveDraft(fields, {
      id: first.draft.id,
      expectedRevision: first.draft.revision,
    });
    expect(restored).toEqual(first);
    expect(data.get(DRAFTS_KEY)).toBe(before);
    expect(
      (
        await saveDraft(
          { ...fields, content: "real edit" },
          { id: first.draft.id, expectedRevision: 1 },
        )
      ).ok,
    ).toBe(true);
  });
  it("cannot delete a changed revision after a publish or sensitive toggle", async () => {
    const first = await saveDraft(fields);
    if (!first.ok) throw new Error("fixture");
    await saveDraft(
      { ...fields, content: "newer" },
      { id: first.draft.id, expectedRevision: 1 },
    );
    expect(await removeDraft(first.draft.id, 1)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(listDrafts()[0].content).toBe("newer");
  });
  it("removes only the exact selected draft", async () => {
    const a = await saveDraft(fields);
    await saveDraft({ ...fields, title: "other" });
    if (!a.ok) throw new Error("fixture");
    expect((await removeDraft(a.draft.id, a.draft.revision)).ok).toBe(true);
    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0].title).toBe("other");
  });
  it("uses UTF-8 bytes for per-draft size", async () => {
    expect(
      await saveDraft({ ...fields, content: "中".repeat(180000) }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(listDrafts()).toHaveLength(0);
  });
  it("enforces 12 draft and 2 MiB aggregate caps without losing saved content", async () => {
    for (let i = 0; i < 12; i++)
      expect((await saveDraft({ ...fields, title: String(i) })).ok).toBe(true);
    const original = data.get(DRAFTS_KEY);
    expect(await saveDraft(fields)).toEqual({ ok: false, reason: "limit" });
    expect(data.get(DRAFTS_KEY)).toBe(original);
    data.clear();
    for (let i = 0; i < 4; i++)
      expect(
        (await saveDraft({ ...fields, content: "x".repeat(524288) })).ok,
      ).toBe(true);
    expect(await saveDraft(fields)).toEqual({ ok: false, reason: "limit" });
    expect(listDrafts()).toHaveLength(4);
  });
  it("retains previous data on quota errors", async () => {
    await saveDraft(fields);
    const before = data.get(DRAFTS_KEY);
    quota = true;
    expect(await saveDraft(fields)).toEqual({ ok: false, reason: "quota" });
    expect(data.get(DRAFTS_KEY)).toBe(before);
  });
  it("imports copies atomically and never replaces originals", async () => {
    await saveDraft(fields);
    const backup = exportDraftBackup()!;
    const id = listDrafts()[0].id;
    expect(await importDraftBackup(backup)).toEqual({ ok: true, count: 1 });
    expect(listDrafts()).toHaveLength(2);
    expect(new Set(listDrafts().map((d) => d.id)).size).toBe(2);
    expect(listDrafts().some((d) => d.id === id)).toBe(true);
    const original = data.get(DRAFTS_KEY);
    const file = JSON.parse(backup);
    file.drafts.push({ ...file.drafts[0], id: "invalid!" });
    expect(await importDraftBackup(JSON.stringify(file))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(data.get(DRAFTS_KEY)).toBe(original);
  });
  it("rejects imported duplicate ids, extra envelopes and arbitrary bodies", () => {
    expect(parseDraftLibrary('{"version":3,"drafts":[{}]}')).toBeNull();
    expect(parseDraftLibrary("[]")).toBeNull();
  });
  it("bookmarks whitelist metadata and toggle without storing body or credentials", () => {
    const paste = {
      slug: "abc",
      title: "title",
      contentType: "plain",
      createdAt: "2026-10-07T10:00:00Z",
      expireAt: null,
      burnAfterRead: false,
      content: "private body",
      editUrl: "private key",
    };
    expect(toggleBookmark(paste)).toBe(true);
    expect(data.get(BOOKMARKS_KEY)).not.toContain("private");
    expect(toggleBookmark(paste)).toBe(true);
    expect(data.get(BOOKMARKS_KEY)).toBe("[]");
  });
});
describe("safe sharing and headings", () => {
  it("shares only canonical same-site paste URLs and excludes management queries", () => {
    expect(
      safeShareUrl(
        "https://paste.march7th.cn/p/abc?key=secret#section",
        "https://paste.march7th.cn",
      ),
    ).toBe("https://paste.march7th.cn/p/abc");
    expect(
      safeShareUrl("/edit/abc?key=secret", "https://paste.march7th.cn"),
    ).toBeNull();
    expect(
      safeShareUrl("https://evil.example/p/abc", "https://paste.march7th.cn"),
    ).toBeNull();
    expect(
      safeShareUrl("javascript:alert(1)", "https://paste.march7th.cn"),
    ).toBeNull();
  });
  it("assigns stable unique anchors only to actual heading elements", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "h2",
          properties: {},
          children: [{ type: "text", value: "重复标题" }],
        },
        {
          type: "element",
          tagName: "pre",
          children: [{ type: "text", value: "# not a heading" }],
        },
        {
          type: "element",
          tagName: "h2",
          properties: {},
          children: [{ type: "text", value: "重复标题" }],
        },
      ],
    };
    rehypeHeadingAnchors()(tree);
    expect(tree.children[0].properties).toEqual({ id: "m7-heading-1" });
    expect(tree.children[2].properties).toEqual({ id: "m7-heading-2" });
    expect(tree.children[1].properties).toBeUndefined();
  });
});
