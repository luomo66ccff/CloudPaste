import { NextResponse } from "next/server";

import { cleanupExpiredPastes } from "@/lib/pastes";
import { apiError } from "@/lib/responses";

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!configuredSecret) {
    return NextResponse.json({ error: "Cleanup is not configured." }, { status: 503 });
  }

  if (authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const deleted = await cleanupExpiredPastes();
    return NextResponse.json({ status: "ok", deleted });
  } catch (error) {
    return apiError(error);
  }
}
