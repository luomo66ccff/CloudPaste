import { NextResponse } from "next/server";

import { createPaste } from "@/lib/pastes";
import { checkCreateRateLimit, getClientIp } from "@/lib/rate-limit";
import { apiError, readJson } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const rateLimit = await checkCreateRateLimit(getClientIp(request));
    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          error: `Too many pastes. Try again after ${rateLimit.resetAt.toISOString()}.`,
        },
        { status: 429 },
      );
    }

    const paste = await createPaste(await readJson(request));
    const origin =
      process.env.VERCEL_ENV === "preview"
        ? new URL(request.url).origin
        : (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin);

    return NextResponse.json(
      {
        ...paste,
        url: `${origin}/p/${paste.paste.slug}`,
        rawUrl: `${origin}/raw/${paste.paste.slug}`,
        rawMarkdownUrl: `${origin}/raw/${paste.paste.slug}.md`,
        editUrl: `${origin}/edit/${paste.paste.slug}?key=${paste.editToken}`,
        deleteUrl: `${origin}/delete/${paste.paste.slug}?key=${paste.deleteToken}`,
        raw: `${origin}/raw/${paste.paste.slug}`,
        raw_txt: `${origin}/raw/${paste.paste.slug}.txt`,
        raw_md: `${origin}/raw/${paste.paste.slug}.md`,
        edit_url: `${origin}/edit/${paste.paste.slug}?key=${paste.editToken}`,
        delete_url: `${origin}/delete/${paste.paste.slug}?key=${paste.deleteToken}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
