import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  canAccessPaste,
  deletePaste,
  getPasteForAccess,
  markPasteRead,
  toPublicPaste,
  updatePaste,
} from "@/lib/pastes";
import { apiError, readJson } from "@/lib/responses";

export const dynamic = "force-dynamic";

async function readPaste(slug: string, headOnly = false) {
  const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
  const result = await getPasteForAccess(slug);
  if (result.status !== "ok") {
    const status = result.status === "burned" ? 410 : 404;
    return NextResponse.json(
      { error: "Paste is not available." },
      { status, headers },
    );
  }

  const cookieValue = result.paste.passwordHash
    ? (await cookies()).get(`mp_${slug}`)?.value
    : undefined;
  if (!canAccessPaste(result.paste, cookieValue)) {
    return NextResponse.json(
      { error: "Password required." },
      { status: 401, headers },
    );
  }

  if (headOnly) {
    return new NextResponse(null, { headers });
  }

  const paste = await markPasteRead(result.paste, { countView: true });
  if (!paste) {
    return NextResponse.json(
      { error: "Paste is no longer available." },
      { status: result.paste.burnAfterRead ? 410 : 404, headers },
    );
  }

  return NextResponse.json({ paste: toPublicPaste(paste) }, { headers });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    return await readPaste(slug);
  } catch (error) {
    return apiError(error);
  }
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const response = await readPaste((await params).slug, true);
    return new NextResponse(null, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    const response = apiError(error);
    return new NextResponse(null, {
      status: response.status,
      headers: response.headers,
    });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const token =
      request.headers.get("x-edit-token") ?? url.searchParams.get("key") ?? "";
    const result = await updatePaste(slug, token, await readJson(request));

    if (result.status === "not-found") {
      return NextResponse.json({ error: "Paste not found." }, { status: 404 });
    }

    if (result.status === "forbidden") {
      return NextResponse.json(
        { error: "Invalid edit token." },
        { status: 403 },
      );
    }

    return NextResponse.json({ paste: result.paste });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const token =
      request.headers.get("x-delete-token") ??
      request.headers.get("x-edit-token") ??
      url.searchParams.get("key") ??
      "";
    const result = await deletePaste(slug, token);

    if (result.status === "not-found") {
      return NextResponse.json({ error: "Paste not found." }, { status: 404 });
    }

    if (result.status === "forbidden") {
      return NextResponse.json(
        { error: "Invalid edit token." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
