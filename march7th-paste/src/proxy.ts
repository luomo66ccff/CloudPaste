import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const speculative =
    request.headers.has("next-router-prefetch") ||
    /prefetch/i.test(request.headers.get("purpose") ?? "") ||
    /prefetch/i.test(request.headers.get("sec-purpose") ?? "");

  // HEAD and speculative navigation must never render a one-time document.
  if (request.method === "HEAD" || speculative) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Cookie, Next-Router-Prefetch, Purpose, Sec-Purpose",
      },
    });
  }

  return NextResponse.next();
}

export const config = { matcher: "/p/:slug" };
