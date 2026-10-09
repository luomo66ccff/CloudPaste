import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { accessCookieValue } from "@/lib/crypto";
import { getPasteForAccess, verifyPastePassword } from "@/lib/pastes";
import { checkUnlockRateLimit, getClientIp } from "@/lib/rate-limit";
import { apiError } from "@/lib/responses";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const result = await getPasteForAccess(slug);

    if (result.status !== "ok") {
      return NextResponse.json(
        { error: "Paste is not available." },
        { status: 404 },
      );
    }

    if (!result.paste.passwordHash) {
      return NextResponse.json({ ok: true });
    }

    const body = await request.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 200) {
      return NextResponse.json(
        { error: "Password must be between 1 and 200 characters." },
        { status: 400 },
      );
    }
    const rateLimit = await checkUnlockRateLimit(getClientIp(request));
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many password attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(
                1,
                Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
              ),
            ),
          },
        },
      );
    }

    if (!verifyPastePassword(result.paste, password)) {
      return NextResponse.json({ error: "Invalid password." }, { status: 403 });
    }

    const cookieStore = await cookies();
    cookieStore.set(
      `mp_${slug}`,
      accessCookieValue(slug, result.paste.passwordHash),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 4,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
