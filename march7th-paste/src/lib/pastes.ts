import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { pastes, reports, type Paste } from "@/db/schema";
import {
  createEditToken,
  accessCookieValue,
  hashDeleteToken,
  hashEditToken,
  hashIp,
  hashPassword,
  verifyDeleteToken,
  verifyEditToken,
  verifyPassword,
} from "@/lib/crypto";
import {
  getExpireAt,
  isExpired,
  pasteInputSchema,
  reportInputSchema,
} from "@/lib/validation";

export type PublicPaste = Omit<
  Paste,
  "editTokenHash" | "deleteTokenHash" | "passwordHash"
>;

export function toPublicPaste(paste: Paste): PublicPaste {
  const publicPaste = { ...paste };
  delete (publicPaste as Partial<Paste>).editTokenHash;
  delete (publicPaste as Partial<Paste>).deleteTokenHash;
  delete (publicPaste as Partial<Paste>).passwordHash;
  return publicPaste;
}

function availablePaste(slug: string) {
  return and(
    eq(pastes.slug, slug),
    eq(pastes.status, "normal"),
    isNull(pastes.hiddenAt),
    isNull(pastes.burnedAt),
    or(
      isNull(pastes.expireAt),
      gt(pastes.expireAt, sql`statement_timestamp()`),
    ),
  );
}

export async function createPaste(input: unknown) {
  const parsed = pasteInputSchema.parse(input);
  const editToken = createEditToken();
  const deleteToken = createEditToken();
  const slug = nanoid(10);
  const [paste] = await getDb()
    .insert(pastes)
    .values({
      slug,
      title: parsed.title || "Untitled",
      content: parsed.content,
      contentType: parsed.contentType,
      language: parsed.language || null,
      visibility: parsed.visibility,
      status: "normal",
      editTokenHash: hashEditToken(editToken),
      deleteTokenHash: hashDeleteToken(deleteToken),
      passwordHash: parsed.password ? hashPassword(parsed.password) : null,
      burnAfterRead: parsed.burnAfterRead,
      expireAt: getExpireAt(parsed.expiresIn),
    })
    .returning();

  return { paste: toPublicPaste(paste), editToken, deleteToken };
}

export async function getPaste(
  slug: string,
  options?: { countView?: boolean },
) {
  const [paste] = await getDb()
    .select()
    .from(pastes)
    .where(availablePaste(slug))
    .limit(1);

  if (!paste || isExpired(paste.expireAt)) {
    return null;
  }

  if (options?.countView) {
    return markPasteRead(paste, options);
  }

  return paste;
}

export async function getPasteForAccess(slug: string) {
  const [paste] = await getDb()
    .select()
    .from(pastes)
    .where(eq(pastes.slug, slug))
    .limit(1);

  if (!paste) {
    return { status: "not-found" as const };
  }

  if (paste.status === "burned" || paste.burnedAt) {
    return { status: "burned" as const, paste };
  }

  if (paste.status === "hidden" || paste.hiddenAt) {
    return { status: "hidden" as const, paste };
  }

  if (isExpired(paste.expireAt)) {
    return { status: "expired" as const, paste };
  }

  return { status: "ok" as const, paste };
}

export function isPasswordProtected(paste: Paste) {
  return Boolean(paste.passwordHash);
}

export function canAccessPaste(paste: Paste, cookieValue?: string) {
  return (
    !paste.passwordHash ||
    cookieValue === accessCookieValue(paste.slug, paste.passwordHash)
  );
}

export function verifyPastePassword(paste: Paste, password: string) {
  if (!paste.passwordHash) {
    return true;
  }

  return verifyPassword(password, paste.passwordHash);
}

export async function markPasteRead(
  paste: Paste,
  options?: { countView?: boolean },
) {
  const now = new Date();
  // UPDATE ... RETURNING is the read claim. Only its winner may expose content.
  // Matching the access settings also rejects a password/burn change since authorization.
  const [claimed] = await getDb()
    .update(pastes)
    .set({
      viewCount: options?.countView
        ? sql`${pastes.viewCount} + 1`
        : sql`${pastes.viewCount}`,
      ...(paste.burnAfterRead
        ? { burnedAt: now, status: "burned", updatedAt: now }
        : {}),
    })
    .where(
      and(
        availablePaste(paste.slug),
        eq(pastes.burnAfterRead, paste.burnAfterRead),
        paste.passwordHash
          ? eq(pastes.passwordHash, paste.passwordHash)
          : isNull(pastes.passwordHash),
      ),
    )
    .returning();

  return claimed ?? null;
}

export async function updatePaste(slug: string, token: string, input: unknown) {
  const existing = await getPaste(slug);
  if (!existing) {
    return { status: "not-found" as const };
  }

  if (!verifyEditToken(token, existing.editTokenHash)) {
    return { status: "forbidden" as const };
  }

  const parsed = pasteInputSchema.parse(input);
  const [paste] = await getDb()
    .update(pastes)
    .set({
      title: parsed.title || "Untitled",
      content: parsed.content,
      contentType: parsed.contentType,
      language: parsed.language || null,
      visibility: parsed.visibility,
      ...(parsed.password
        ? { passwordHash: hashPassword(parsed.password) }
        : {}),
      burnAfterRead: parsed.burnAfterRead,
      ...(parsed.expiresIn !== undefined
        ? { expireAt: getExpireAt(parsed.expiresIn) }
        : {}),
      updatedAt: new Date(),
    })
    .where(availablePaste(slug))
    .returning();

  if (!paste) {
    return { status: "not-found" as const };
  }

  return { status: "ok" as const, paste: toPublicPaste(paste) };
}

export async function deletePaste(slug: string, token: string) {
  const result = await getPasteForAccess(slug);
  if (result.status === "not-found") {
    return { status: "not-found" as const };
  }

  const existing = result.paste;
  const canDeleteWithDeleteToken = existing.deleteTokenHash
    ? verifyDeleteToken(token, existing.deleteTokenHash)
    : false;
  const canDeleteWithEditToken = verifyEditToken(token, existing.editTokenHash);

  if (!canDeleteWithDeleteToken && !canDeleteWithEditToken) {
    return { status: "forbidden" as const };
  }

  await getDb().delete(pastes).where(eq(pastes.slug, slug));
  return { status: "ok" as const };
}

export async function listPublicPastes() {
  const rows = await getDb()
    .select()
    .from(pastes)
    .where(
      and(
        eq(pastes.visibility, "public"),
        eq(pastes.status, "normal"),
        isNull(pastes.hiddenAt),
        isNull(pastes.burnedAt),
        isNull(pastes.passwordHash),
        eq(pastes.burnAfterRead, false),
        or(
          isNull(pastes.expireAt),
          gt(pastes.expireAt, sql`statement_timestamp()`),
        ),
      ),
    )
    .orderBy(desc(pastes.createdAt))
    .limit(50);

  return rows.map(toPublicPaste);
}

export async function createReport(
  slug: string,
  input: unknown,
  request: Request,
) {
  const parsed = reportInputSchema.parse(input);
  const [report] = await getDb()
    .insert(reports)
    .values({
      slug,
      reason: parsed.reason,
      ipHash: hashIp(
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown",
      ),
      userAgent: request.headers.get("user-agent"),
    })
    .returning();

  return report;
}

export async function listReports() {
  return getDb()
    .select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(100);
}

export async function listAdminPastes() {
  return getDb()
    .select()
    .from(pastes)
    .orderBy(desc(pastes.createdAt))
    .limit(100);
}

export async function setPasteHidden(slug: string, hidden: boolean) {
  const [paste] = await getDb()
    .update(pastes)
    .set({
      hiddenAt: hidden ? new Date() : null,
      status: hidden ? "hidden" : "normal",
      updatedAt: new Date(),
    })
    .where(eq(pastes.slug, slug))
    .returning();

  return paste ? toPublicPaste(paste) : null;
}

export async function cleanupExpiredPastes() {
  const deleted = await getDb()
    .delete(pastes)
    .where(
      and(sql`${pastes.expireAt} is not null`, lt(pastes.expireAt, new Date())),
    )
    .returning({ slug: pastes.slug });

  return deleted.length;
}
