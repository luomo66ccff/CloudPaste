import { NextResponse } from "next/server";

import { createReport } from "@/lib/pastes";
import { apiError, readJson } from "@/lib/responses";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await createReport(slug, await readJson(request), request);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
