import { NextResponse } from "next/server";
import { ZodError } from "zod";

class InvalidJsonError extends Error {}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidJsonError("Request body must contain valid JSON.");
  }
}

export function apiError(error: unknown) {
  if (error instanceof InvalidJsonError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid input.",
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  if (error instanceof Error && error.message.includes("configured")) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json(
    { error: "Unexpected server error." },
    { status: 500 },
  );
}
