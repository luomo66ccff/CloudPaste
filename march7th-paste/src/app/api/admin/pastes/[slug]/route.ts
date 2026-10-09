import { NextResponse } from "next/server";

import { setPasteHidden } from "@/lib/pastes";
import { apiError, readJson } from "@/lib/responses";
import { moderationInputSchema } from "@/lib/validation";

function isAdmin(request: Request) {
  const token =
    request.headers.get("x-admin-token") ??
    new URL(request.url).searchParams.get("token");
  return Boolean(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const { hidden } = moderationInputSchema.parse(await readJson(request));
    const paste = await setPasteHidden(slug, hidden);

    if (!paste) {
      return NextResponse.json({ error: "Paste not found." }, { status: 404 });
    }

    return NextResponse.json({ paste });
  } catch (error) {
    return apiError(error);
  }
}
