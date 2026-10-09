import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canAccessPaste, getPasteForAccess, markPasteRead } from "@/lib/pastes";

export const dynamic = "force-dynamic";

async function readRaw(rawSlug: string, headOnly = false) {
  const slug = rawSlug.replace(/\.(txt|md|markdown)$/i, "");
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Cookie",
  };
  const result = await getPasteForAccess(slug);

  if (result.status !== "ok") {
    return new NextResponse(
      result.status === "burned"
        ? "This paste has been burned after first read."
        : "Not found",
      { status: result.status === "burned" ? 410 : 404, headers },
    );
  }

  const cookieValue = result.paste.passwordHash
    ? (await cookies()).get(`mp_${slug}`)?.value
    : undefined;
  if (!canAccessPaste(result.paste, cookieValue)) {
    return new NextResponse("Password required", { status: 401, headers });
  }

  if (headOnly) {
    return new NextResponse(null, { headers });
  }

  const paste = await markPasteRead(result.paste);
  if (!paste) {
    return new NextResponse("This paste is no longer available.", {
      status: result.paste.burnAfterRead ? 410 : 404,
      headers,
    });
  }

  return new NextResponse(paste.content, { headers });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return readRaw((await params).slug);
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const response = await readRaw((await params).slug, true);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
