import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";

const fixture = vi.hoisted(() => ({
  db: null as unknown,
  cookies: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  headers: new Headers(),
}));

// The production DB module is never imported: all SQL executes in this process.
vi.mock("@/db", () => ({ getDb: () => fixture.db }));
vi.mock("next/headers", () => ({
  headers: async () => fixture.headers,
  cookies: async () => ({
    get: (name: string) =>
      fixture.cookies.has(name)
        ? { value: fixture.cookies.get(name) }
        : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      fixture.cookies.set(name, value);
      fixture.cookieOptions.set(name, options);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/PasteForm", () => ({
  PasteForm: ({
    initial,
  }: {
    initial: { content: string; expireAt?: string };
  }) =>
    createElement(
      "div",
      { "data-expire-at": initial.expireAt },
      initial.content,
    ),
}));
vi.mock("@/components/MarkdownView", () => ({
  MarkdownView: ({ content }: { content: string }) =>
    createElement("div", {}, content),
}));
vi.mock("@/components/CodeView", () => ({
  CodeView: ({ content }: { content: string }) =>
    createElement("pre", {}, content),
}));
vi.mock("@/components/PasteActions", () => ({ PasteActions: () => null }));
vi.mock("@/components/PasteReader", () => ({
  PasteReader: ({ content }: { content: string }) =>
    createElement("div", {}, content),
}));
vi.mock("@/components/BookmarkButton", () => ({ BookmarkButton: () => null }));
vi.mock("@/components/PasswordGate", () => ({
  PasswordGate: () => createElement("div", {}, "PASSWORD_GATE"),
}));
vi.mock("@/components/DeletePastePanel", () => ({
  DeletePastePanel: () => createElement("div", {}, "DELETE_PANEL"),
}));

import { POST as createApi } from "@/app/api/pastes/route";
import { POST as legacyCreateApi } from "@/app/api/paste/route";
import {
  DELETE as deleteApi,
  GET as getApi,
  HEAD as headApi,
  PUT as editApi,
} from "@/app/api/pastes/[slug]/route";
import { POST as unlockApi } from "@/app/api/pastes/[slug]/unlock/route";
import { PATCH as moderateApi } from "@/app/api/admin/pastes/[slug]/route";
import { GET as cleanupApi } from "@/app/api/cron/cleanup/route";
import { POST as reportApi } from "@/app/api/reports/[slug]/route";
import EditPastePage from "@/app/edit/[slug]/page";
import DeletePastePage from "@/app/delete/[slug]/page";
import PastePage, { generateMetadata } from "@/app/p/[slug]/page";
import { GET as rawApi, HEAD as rawHeadApi } from "@/app/raw/[slug]/route";
import { accessCookieValue } from "@/lib/crypto";
import {
  createPaste,
  deletePaste,
  getPaste,
  getPasteForAccess,
  listPublicPastes,
  markPasteRead,
  setPasteHidden,
  updatePaste,
} from "@/lib/pastes";
import { MAX_CONTENT_LENGTH, pasteInputSchema } from "@/lib/validation";
import { apiError } from "@/lib/responses";
import { config as proxyConfig, proxy } from "@/proxy";

let postgres: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = "POST",
) =>
  new Request(`http://localhost${path}`, {
    method: body === undefined && method === "POST" ? "GET" : method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const content = "PRIVATE_CONTENT_SENTINEL_秘密正文";
const input = {
  title: "Test document",
  content,
  contentType: "plain" as const,
};

beforeAll(async () => {
  vi.stubEnv(
    "EDIT_TOKEN_SECRET",
    "isolated-test-secret-not-a-production-secret",
  );
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
  postgres = new PGlite();
  database = drizzle(postgres, { schema });
  fixture.db = database;
  for (const name of [
    "0000_hesitant_deathbird.sql",
    "0001_dry_exodus.sql",
    "0002_groovy_riptide.sql",
  ]) {
    await postgres.exec(
      await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    );
  }
});

beforeEach(async () => {
  vi.stubEnv("ADMIN_TOKEN", "isolated-admin-test-token");
  vi.stubEnv("CRON_SECRET", "isolated-cron-test-token");
  fixture.cookies.clear();
  fixture.cookieOptions.clear();
  fixture.headers = new Headers();
  await postgres.exec("TRUNCATE pastes, rate_limits, reports");
});

afterAll(async () => {
  await postgres?.close();
  vi.unstubAllEnvs();
});

describe("invalid request safety", () => {
  const rawRequest = (body: string, method = "POST", headers: Record<string, string> = {}) =>
    new Request("http://localhost/test", { method, headers: { "content-type": "application/json", ...headers }, body });

  it.each(["", "{"])("returns 400 for malformed JSON %j without changing documents or inserting reports", async (body) => {
    const { paste, editToken } = await createPaste(input);
    expect((await createApi(rawRequest(body))).status).toBe(400);
    expect((await legacyCreateApi(rawRequest(body))).status).toBe(400);
    expect((await editApi(rawRequest(body, "PUT", { "x-edit-token": editToken }), params(paste.slug))).status).toBe(400);
    expect((await reportApi(rawRequest(body), params(paste.slug))).status).toBe(400);
    expect((await getPaste(paste.slug))?.content).toBe(content);
    expect((await postgres.query("SELECT count(*) FROM pastes")).rows[0]).toEqual({ count: 1 });
    expect((await postgres.query("SELECT count(*) FROM reports")).rows[0]).toEqual({ count: 0 });
  });

  it.each(["{", "{}", "null", "[]", '{"hidden":"false"}', '{"hidden":0}', '{"hidden":null}'])("rejects invalid moderation body %j without unhiding", async (body) => {
    const { paste } = await createPaste(input);
    await setPasteHidden(paste.slug, true);
    const response = await moderateApi(rawRequest(body, "PATCH", { "x-admin-token": "isolated-admin-test-token" }), params(paste.slug));
    expect(response.status).toBe(400);
    expect((await getPasteForAccess(paste.slug)).status).toBe("hidden");
  });

  it("requires admin authorization and accepts only explicit boolean visibility changes", async () => {
    const { paste } = await createPaste(input);
    expect((await moderateApi(rawRequest('{"hidden":true}', "PATCH"), params(paste.slug))).status).toBe(401);
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
    for (const hidden of [true, false]) {
      expect((await moderateApi(rawRequest(JSON.stringify({ hidden }), "PATCH", { "x-admin-token": "isolated-admin-test-token" }), params(paste.slug))).status).toBe(200);
      expect((await getPasteForAccess(paste.slug)).status).toBe(hidden ? "hidden" : "ok");
    }
  });

  it("does not run cleanup without configuration or matching authorization", async () => {
    const expired = await createPaste(input);
    const retained = await createPaste(input);
    await database.update(schema.pastes).set({ expireAt: new Date(Date.now() - 10000) }).where(eq(schema.pastes.slug, expired.paste.slug));
    vi.stubEnv("CRON_SECRET", "");
    expect((await cleanupApi(request("/api/cron/cleanup"))).status).toBe(503);
    expect((await postgres.query("SELECT count(*) FROM pastes")).rows[0]).toEqual({ count: 2 });
    vi.stubEnv("CRON_SECRET", "isolated-cron-test-token");
    const unauthorizedHeaders: Record<string, string>[] = [{}, { authorization: "Bearer wrong" }];
    for (const headers of unauthorizedHeaders) {
      expect((await cleanupApi(request("/api/cron/cleanup", undefined, headers))).status).toBe(401);
      expect((await postgres.query("SELECT count(*) FROM pastes")).rows[0]).toEqual({ count: 2 });
    }
    const response = await cleanupApi(request("/api/cron/cleanup", undefined, { authorization: "Bearer isolated-cron-test-token" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", deleted: 1 });
    expect(await getPaste(expired.paste.slug)).toBeNull();
    expect((await getPaste(retained.paste.slug))?.content).toBe(content);
  });

  it.each(["title", "content", "language"])("rejects NUL in %s before storing a new document", async (field) => {
    const response = await createApi(request("/api/pastes", { ...input, [field]: "before\u0000after" }));
    expect(response.status).toBe(400);
    expect((await response.json()).details.join(" ")).toContain("U+0000");
    expect((await postgres.query("SELECT count(*) FROM pastes")).rows[0]).toEqual({ count: 0 });
  });

  it.each(["title", "content", "language"])("rejects NUL in edited %s without changing the saved document", async (field) => {
    const { paste, editToken } = await createPaste(input);
    expect((await editApi(request("/api/edit", { ...input, [field]: "before\u0000after" }, { "x-edit-token": editToken }, "PUT"), params(paste.slug))).status).toBe(400);
    expect(await getPaste(paste.slug)).toMatchObject({ title: input.title, content, language: null });
  });

  it("rejects NUL in reports while accepting ordinary Unicode", async () => {
    const { paste } = await createPaste(input);
    expect((await reportApi(request("/report", { reason: "before\u0000after" }), params(paste.slug))).status).toBe(400);
    expect((await postgres.query("SELECT count(*) FROM reports")).rows[0]).toEqual({ count: 0 });
    expect((await reportApi(request("/report", { reason: "测试举报原因 😀" }), params(paste.slug))).status).toBe(201);
  });

  it("keeps internal SyntaxError classified as a server failure", async () => {
    expect(apiError(new SyntaxError("internal parser failure")).status).toBe(500);
  });
});

describe("private read authorization", () => {
  it("rejects invalid unlock input before password work or read consumption", async () => {
    const { paste } = await createPaste({
      ...input,
      password: "secret",
      burnAfterRead: true,
    });
    for (const password of ["", "x".repeat(201), null, 123]) {
      expect(
        (await unlockApi(request("/unlock", { password }), params(paste.slug)))
          .status,
      ).toBe(400);
    }
    expect(fixture.cookies.size).toBe(0);
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
    expect(
      (await postgres.query("SELECT count(*) FROM rate_limits")).rows[0],
    ).toEqual({ count: 0 });
  });

  it("limits unlock attempts across slugs and permits another client without burning", async () => {
    const first = await createPaste({
      ...input,
      password: "secret",
      burnAfterRead: true,
    });
    const second = await createPaste({ ...input, password: "secret" });
    for (let n = 0; n < 10; n++) {
      const slug = n % 2 ? first.paste.slug : second.paste.slug;
      expect(
        (
          await unlockApi(
            request(
              "/unlock",
              { password: "wrong" },
              { "x-forwarded-for": "192.0.2.1" },
            ),
            params(slug),
          )
        ).status,
      ).toBe(403);
    }
    const limited = await unlockApi(
      request(
        "/unlock",
        { password: "secret" },
        { "x-forwarded-for": "192.0.2.1" },
      ),
      params(first.paste.slug),
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fixture.cookies.size).toBe(0);
    expect(
      (
        await unlockApi(
          request(
            "/unlock",
            { password: "secret" },
            { "x-forwarded-for": "192.0.2.2" },
          ),
          params(first.paste.slug),
        )
      ).status,
    ).toBe(200);
    expect((await getPasteForAccess(first.paste.slug)).status).toBe("ok");
  });

  it("blocks JSON, raw aliases, and the page without the password cookie", async () => {
    const { paste } = await createPaste({
      ...input,
      password: "test-password",
      burnAfterRead: true,
    });
    const json = await getApi(
      request(`/api/pastes/${paste.slug}`),
      params(paste.slug),
    );
    expect(json.status).toBe(401);
    expect(await json.text()).not.toContain(content);
    for (const suffix of ["", ".txt", ".md", ".markdown"]) {
      const raw = await rawApi(
        request(`/raw/${paste.slug}${suffix}`),
        params(paste.slug + suffix),
      );
      expect(raw.status).toBe(401);
      expect(await raw.text()).not.toContain(content);
    }
    expect(renderToStaticMarkup(await PastePage(params(paste.slug)))).toContain(
      "PASSWORD_GATE",
    );
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
    expect((await getPaste(paste.slug))?.viewCount).toBe(0);
  });

  it("keeps unlock cookie compatibility and does not burn on unlock or a wrong password", async () => {
    const { paste } = await createPaste({
      ...input,
      password: "test-password",
      burnAfterRead: true,
    });
    const wrong = await unlockApi(
      request("/unlock", { password: "wrong" }),
      params(paste.slug),
    );
    expect(wrong.status).toBe(403);
    expect(fixture.cookies.size).toBe(0);
    const unlocked = await unlockApi(
      request("/unlock", { password: "test-password" }),
      params(paste.slug),
    );
    expect(unlocked.status).toBe(200);
    const stored = await getPaste(paste.slug);
    expect(fixture.cookies.get(`mp_${paste.slug}`)).toBe(
      accessCookieValue(paste.slug, stored!.passwordHash!),
    );
    expect(fixture.cookieOptions.get(`mp_${paste.slug}`)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 14400,
    });
    expect(stored?.burnedAt).toBeNull();
    const response = await getApi(request("/paste"), params(paste.slug));
    expect(response.status).toBe(200);
    expect((await response.json()).paste.content).toBe(content);
    expect((await getPasteForAccess(paste.slug)).status).toBe("burned");
  });

  it("rejects forged cookies and old cookies after a password change", async () => {
    const { paste, editToken } = await createPaste({
      ...input,
      password: "first",
    });
    fixture.cookies.set(`mp_${paste.slug}`, "forged");
    expect((await getApi(request("/paste"), params(paste.slug))).status).toBe(
      401,
    );
    const stored = await getPaste(paste.slug);
    fixture.cookies.set(
      `mp_${paste.slug}`,
      accessCookieValue(paste.slug, stored!.passwordHash!),
    );
    await updatePaste(paste.slug, editToken, { ...input, password: "second" });
    expect((await getApi(request("/paste"), params(paste.slug))).status).toBe(
      401,
    );
  });

  it("serves authorized raw aliases and the protected page while consuming a one-time read", async () => {
    for (const suffix of ["", ".txt", ".md", ".markdown"]) {
      const { paste } = await createPaste({
        ...input,
        password: "secret",
        burnAfterRead: true,
      });
      await unlockApi(
        request("/unlock", { password: "secret" }),
        params(paste.slug),
      );
      const response = await rawApi(
        request("/raw"),
        params(paste.slug + suffix),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(content);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await getPasteForAccess(paste.slug)).status).toBe("burned");
    }
    const { paste } = await createPaste({
      ...input,
      password: "secret",
      burnAfterRead: true,
    });
    await unlockApi(
      request("/unlock", { password: "secret" }),
      params(paste.slug),
    );
    expect(renderToStaticMarkup(await PastePage(params(paste.slug)))).toContain(
      content,
    );
    expect(
      renderToStaticMarkup(await PastePage(params(paste.slug))),
    ).not.toContain(content);
  });

  it("validates both edit token aliases before exposing content and does not burn a management preview", async () => {
    const { paste, editToken } = await createPaste({
      ...input,
      password: "test-password",
      burnAfterRead: true,
      expiresIn: "7d",
    });
    for (const query of [
      {},
      { key: "arbitrary-nonempty" },
      { token: "arbitrary-nonempty" },
    ]) {
      await expect(
        EditPastePage({
          ...params(paste.slug),
          searchParams: Promise.resolve(query),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    }
    for (const query of [{ key: editToken }, { token: editToken }]) {
      const markup = renderToStaticMarkup(
        await EditPastePage({
          ...params(paste.slug),
          searchParams: Promise.resolve(query),
        }),
      );
      expect(markup).toContain(content);
      expect(markup).toContain(paste.expireAt!.toISOString());
    }
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
  });

  it("excludes protected, one-time, unlisted, hidden, burned, and expired items from discovery", async () => {
    const publicPaste = await createPaste({ ...input, visibility: "public" });
    await createPaste({ ...input, visibility: "public", password: "secret" });
    await createPaste({ ...input, visibility: "public", burnAfterRead: true });
    await createPaste(input);
    const hidden = await createPaste({ ...input, visibility: "public" });
    await setPasteHidden(hidden.paste.slug, true);
    const burned = await createPaste({
      ...input,
      visibility: "public",
      burnAfterRead: true,
    });
    await markPasteRead((await getPaste(burned.paste.slug))!);
    const expired = await createPaste({ ...input, visibility: "public" });
    await database
      .update(schema.pastes)
      .set({ expireAt: new Date(0) })
      .where(eq(schema.pastes.slug, expired.paste.slug));
    expect((await listPublicPastes()).map((paste) => paste.slug)).toEqual([
      publicPaste.paste.slug,
    ]);
  });

  it("does not include protected content or titles in link metadata and does not consume it", async () => {
    const { paste } = await createPaste({
      ...input,
      title: "SECRET_TITLE",
      password: "secret",
      burnAfterRead: true,
    });
    const metadata = JSON.stringify(await generateMetadata(params(paste.slug)));
    expect(metadata).not.toContain(content);
    expect(metadata).not.toContain("SECRET_TITLE");
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
  });

  it("does not reveal the deletion title without a valid token and supports burned-document deletion", async () => {
    const { paste, deleteToken, editToken } = await createPaste({
      ...input,
      title: "SECRET_TITLE",
      password: "secret",
      burnAfterRead: true,
    });
    await expect(
      DeletePastePage({
        ...params(paste.slug),
        searchParams: Promise.resolve({ key: "wrong" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await markPasteRead((await getPaste(paste.slug))!);
    for (const query of [
      { key: deleteToken },
      { token: deleteToken },
      { key: editToken },
    ]) {
      const markup = renderToStaticMarkup(
        await DeletePastePage({
          ...params(paste.slug),
          searchParams: Promise.resolve(query),
        }),
      );
      expect(markup).toContain("SECRET_TITLE");
      expect(markup).toContain("DELETE_PANEL");
      expect(markup).not.toContain(content);
    }
  });
});

describe("atomic read lifecycle", () => {
  it("short-circuits page HEAD and speculative requests before rendering", async () => {
    expect(proxyConfig.matcher).toBe("/p/:slug");
    const requests: NonNullable<
      ConstructorParameters<typeof NextRequest>[1]
    >[] = [
      { method: "HEAD" },
      { headers: { "next-router-prefetch": "1" } },
      { headers: { purpose: "prefetch" } },
      { headers: { "sec-purpose": "prefetch;prerender" } },
    ];
    for (const init of requests) {
      const response = proxy(
        new NextRequest("http://localhost/p/example", init),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
    expect(
      proxy(new NextRequest("http://localhost/p/example")).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });

  it("does not expose or consume a document during any recognized page prefetch", async () => {
    const { paste } = await createPaste({ ...input, burnAfterRead: true });
    for (const header of ["next-router-prefetch", "purpose", "sec-purpose"]) {
      fixture.headers = new Headers({
        [header]: header === "next-router-prefetch" ? "1" : "prefetch",
      });
      expect(
        renderToStaticMarkup(await PastePage(params(paste.slug))),
      ).not.toContain(content);
      expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
    }
  });
  it("allows only one of twelve concurrent read claims", async () => {
    const created = await createPaste({ ...input, burnAfterRead: true });
    const snapshot = (await getPaste(created.paste.slug))!;
    const claims = await Promise.all(
      Array.from({ length: 12 }, () =>
        markPasteRead(snapshot, { countView: true }),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const result = await getPasteForAccess(created.paste.slug);
    expect(result.status).toBe("burned");
    if (result.status !== "not-found") expect(result.paste.viewCount).toBe(1);
  });

  it("exposes the content to only one winner across simultaneous page, raw and JSON reads", async () => {
    const { paste } = await createPaste({ ...input, burnAfterRead: true });
    const [page, raw, json] = await Promise.all([
      PastePage(params(paste.slug)).then(renderToStaticMarkup),
      rawApi(request("/raw"), params(paste.slug)),
      getApi(request("/api"), params(paste.slug)),
    ]);
    const bodies = [page, await raw.text(), await json.text()];
    expect(bodies.filter((body) => body.includes(content))).toHaveLength(1);
    expect((await rawApi(request("/raw"), params(paste.slug))).status).toBe(
      410,
    );
    expect((await getApi(request("/api"), params(paste.slug))).status).toBe(
      410,
    );
  });

  it("checks HEAD authorization and availability without consuming or counting a read", async () => {
    const { paste } = await createPaste({
      ...input,
      password: "test-password",
      burnAfterRead: true,
    });
    for (const handler of [headApi, rawHeadApi]) {
      const denied = await handler(
        request("/head", undefined, {}, "HEAD"),
        params(paste.slug),
      );
      expect(denied.status).toBe(401);
      expect(await denied.text()).toBe("");
    }
    await unlockApi(
      request("/unlock", { password: "test-password" }),
      params(paste.slug),
    );
    for (const handler of [headApi, rawHeadApi]) {
      const response = await handler(
        request("/head", undefined, {}, "HEAD"),
        params(paste.slug),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    }
    expect((await getPaste(paste.slug))?.viewCount).toBe(0);
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
  });

  it("rejects stale claims after expiry, hide, password, or burn settings change", async () => {
    for (const update of [
      { expireAt: new Date(0) },
      { hiddenAt: new Date(), status: "hidden" },
      { passwordHash: "new-password-hash" },
      { burnAfterRead: true },
    ]) {
      const { paste } = await createPaste(input);
      const snapshot = (await getPaste(paste.slug))!;
      await database
        .update(schema.pastes)
        .set(update)
        .where(eq(schema.pastes.slug, paste.slug));
      expect(await markPasteRead(snapshot)).toBeNull();
    }
  });

  it("never returns content for hidden or expired documents through JSON, raw, or page", async () => {
    for (const update of [
      { expireAt: new Date(0) },
      { hiddenAt: new Date(), status: "hidden" },
    ]) {
      const { paste } = await createPaste(input);
      await database
        .update(schema.pastes)
        .set(update)
        .where(eq(schema.pastes.slug, paste.slug));
      for (const handler of [getApi, rawApi]) {
        const response = await handler(request("/paste"), params(paste.slug));
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(content);
      }
      expect(
        renderToStaticMarkup(await PastePage(params(paste.slug))),
      ).not.toContain(content);
      expect(
        JSON.stringify(await generateMetadata(params(paste.slug))),
      ).not.toContain(content);
    }
  });

  it("keeps normal reads available and increments view counts atomically", async () => {
    const { paste } = await createPaste(input);
    const snapshot = (await getPaste(paste.slug))!;
    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        markPasteRead(snapshot, { countView: true }),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(8);
    expect((await getPaste(paste.slug))?.viewCount).toBe(8);
    expect((await getPasteForAccess(paste.slug)).status).toBe("ok");
  });
});

describe("validation and edit compatibility", () => {
  it("keeps preview share and management links on the preview origin", async () => {
    const original = process.env.VERCEL_ENV;
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      const result = await createApi(
        new Request("https://preview.vercel.app/api/pastes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      expect(result.status).toBe(201);
      const payload = await result.json();
      for (const field of [
        "url",
        "rawUrl",
        "rawMarkdownUrl",
        "editUrl",
        "deleteUrl",
        "edit_url",
        "delete_url",
      ])
        expect(new URL(payload[field]).origin).toBe(
          "https://preview.vercel.app",
        );
    } finally {
      if (original === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = original;
    }
  });

  it("measures the 512 KB limit in UTF-8 bytes for ASCII, Chinese, and emoji", () => {
    for (const unit of ["a", "中", "😀"]) {
      const count = Math.floor(
        MAX_CONTENT_LENGTH / new TextEncoder().encode(unit).length,
      );
      expect(
        pasteInputSchema.safeParse({ content: unit.repeat(count) }).success,
      ).toBe(true);
      expect(
        pasteInputSchema.safeParse({ content: unit.repeat(count + 1) }).success,
      ).toBe(false);
    }
    expect(pasteInputSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("preserves expiration and password when edit fields are omitted or password is empty", async () => {
    const { paste, editToken } = await createPaste({
      ...input,
      password: "secret",
      expiresIn: "7d",
    });
    const before = (await getPaste(paste.slug))!;
    const result = await updatePaste(paste.slug, editToken, {
      ...input,
      content: "Updated content",
      password: "",
    });
    expect(result.status).toBe("ok");
    const after = (await getPaste(paste.slug))!;
    expect(after.expireAt?.toISOString()).toBe(before.expireAt?.toISOString());
    expect(after.passwordHash).toBe(before.passwordHash);
    await updatePaste(paste.slug, editToken, { ...input, expiresIn: "never" });
    expect((await getPaste(paste.slug))?.expireAt).toBeNull();
    expect((await createPaste(input)).paste.expireAt).toBeNull();
  });

  it("preserves both POST paths, type alias, raw aliases, management tokens, PUT and DELETE", async () => {
    for (const create of [createApi, legacyCreateApi]) {
      const response = await create(
        request("/api/paste", {
          content,
          type: "code",
          language: "typescript",
        }),
      );
      expect(response.status).toBe(201);
      const result = await response.json();
      expect(result.paste.contentType).toBe("code");
      expect(result.editToken).toBeTruthy();
      expect(result.deleteToken).toBeTruthy();
      expect(result).toMatchObject({
        raw: result.rawUrl,
        raw_md: result.rawMarkdownUrl,
        edit_url: result.editUrl,
        delete_url: result.deleteUrl,
      });
      expect(result.raw_txt).toBe(
        `http://localhost/raw/${result.paste.slug}.txt`,
      );
      expect(result.paste).not.toHaveProperty("passwordHash");
      expect(result.paste).not.toHaveProperty("editTokenHash");
      expect(result.paste).not.toHaveProperty("deleteTokenHash");
      const edited = await editApi(
        request(
          "/api/pastes/" + result.paste.slug,
          { content: "Edited", type: "plain" },
          { "x-edit-token": result.editToken },
          "PUT",
        ),
        params(result.paste.slug),
      );
      expect(edited.status).toBe(200);
      expect((await edited.json()).paste.content).toBe("Edited");
      const raw = await rawApi(
        request("/raw"),
        params(result.paste.slug + ".txt"),
      );
      expect(await raw.text()).toBe("Edited");
      expect(raw.headers.get("Cache-Control")).toBe("no-store");
      const removed = await deleteApi(
        request(
          "/api/pastes/" + result.paste.slug,
          undefined,
          { "x-delete-token": result.deleteToken },
          "DELETE",
        ),
        params(result.paste.slug),
      );
      expect(removed.status).toBe(200);
      expect(await removed.json()).toEqual({ ok: true });
      expect(
        (await getApi(request("/api"), params(result.paste.slug))).status,
      ).toBe(404);
    }
  });

  it("accepts key query tokens and edit-token deletion while rejecting incorrect management tokens", async () => {
    const { paste, editToken } = await createPaste(input);
    expect(
      (
        await editApi(
          request(`/api/pastes/${paste.slug}?key=wrong`, input, {}, "PUT"),
          params(paste.slug),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await editApi(
          request(
            `/api/pastes/${paste.slug}?key=${editToken}`,
            input,
            {},
            "PUT",
          ),
          params(paste.slug),
        )
      ).status,
    ).toBe(200);
    expect((await deletePaste(paste.slug, "wrong")).status).toBe("forbidden");
    expect(
      (
        await deleteApi(
          request(
            `/api/pastes/${paste.slug}?key=${editToken}`,
            undefined,
            {},
            "DELETE",
          ),
          params(paste.slug),
        )
      ).status,
    ).toBe(200);
  });

  it("returns validation errors through POST and PUT without storing oversized content", async () => {
    const oversized = "中".repeat(Math.floor(MAX_CONTENT_LENGTH / 3) + 1);
    expect(
      (await createApi(request("/api/pastes", { content: oversized }))).status,
    ).toBe(400);
    const { paste, editToken } = await createPaste(input);
    expect(
      (
        await editApi(
          request(
            "/api/pastes/" + paste.slug,
            { content: oversized },
            { "x-edit-token": editToken },
            "PUT",
          ),
          params(paste.slug),
        )
      ).status,
    ).toBe(400);
    expect((await getPaste(paste.slug))?.content).toBe(content);
  });

  it("does not revive or edit a consumed document and allows its owner to delete it", async () => {
    const { paste, editToken, deleteToken } = await createPaste({
      ...input,
      burnAfterRead: true,
    });
    await rawApi(request("/raw"), params(paste.slug));
    expect((await updatePaste(paste.slug, editToken, input)).status).toBe(
      "not-found",
    );
    expect((await deletePaste(paste.slug, deleteToken)).status).toBe("ok");
    expect((await getPasteForAccess(paste.slug)).status).toBe("not-found");
  });
});
