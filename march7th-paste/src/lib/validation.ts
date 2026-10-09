import { z } from "zod";

export const contentTypes = ["plain", "code", "markdown"] as const;
export const visibilities = ["unlisted", "public"] as const;
export const expirations = ["never", "1d", "7d", "30d"] as const;

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_LENGTH = 512 * 1024;

const databaseText = z.string().refine(
  (value) => !value.includes("\u0000"),
  "Null characters (U+0000) are not supported.",
);

export const pasteInputSchema = z
  .object({
    title: databaseText.trim().max(MAX_TITLE_LENGTH).default("Untitled"),
    content: databaseText
      .min(1, "Content is required.")
      .refine(
        (content) =>
          new TextEncoder().encode(content).byteLength <= MAX_CONTENT_LENGTH,
        "Content must be at most 512 KB in UTF-8.",
      ),
    contentType: z.enum(contentTypes).optional(),
    type: z.enum(contentTypes).optional(),
    language: databaseText.trim().max(40).optional().nullable(),
    visibility: z.enum(visibilities).default("unlisted"),
    expiresIn: z.enum(expirations).optional(),
    password: z.string().max(200).optional().nullable(),
    burnAfterRead: z.boolean().default(false),
  })
  .transform((value) => ({
    ...value,
    contentType: value.contentType ?? value.type ?? "markdown",
  }));

export function getExpireAt(
  expiresIn: z.infer<typeof pasteInputSchema>["expiresIn"],
) {
  if (!expiresIn || expiresIn === "never") {
    return null;
  }

  const days = expiresIn === "1d" ? 1 : expiresIn === "7d" ? 7 : 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(expireAt: Date | null) {
  return Boolean(expireAt && expireAt.getTime() <= Date.now());
}

export const reportInputSchema = z.object({
  reason: databaseText.trim().min(3).max(2000),
});

export const moderationInputSchema = z.object({
  hidden: z.boolean(),
});
