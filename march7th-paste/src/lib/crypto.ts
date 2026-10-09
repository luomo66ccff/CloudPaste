import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function createEditToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, purpose = "edit") {
  const secret = process.env.EDIT_TOKEN_SECRET;
  if (!secret) {
    throw new Error("EDIT_TOKEN_SECRET is not configured.");
  }

  return createHash("sha256")
    .update(`${secret}:${purpose}:${token}`)
    .digest("hex");
}

export function hashEditToken(token: string) {
  return hashToken(token, "edit");
}

export function hashDeleteToken(token: string) {
  return hashToken(token, "delete");
}

export function verifyToken(
  token: string,
  expectedHash: string,
  purpose = "edit",
) {
  const actualHash = hashToken(token, purpose);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyEditToken(token: string, expectedHash: string) {
  return verifyToken(token, expectedHash, "edit");
}

export function verifyDeleteToken(token: string, expectedHash: string) {
  return verifyToken(token, expectedHash, "delete");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const actual = Buffer.from(
    scryptSync(password, salt, 64).toString("hex"),
    "hex",
  );
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashIp(ip: string) {
  const secret = process.env.EDIT_TOKEN_SECRET ?? "march7th-paste";
  return createHash("sha256").update(`${secret}:ip:${ip}`).digest("hex");
}

export function accessCookieValue(slug: string, passwordHash: string) {
  const secret = process.env.EDIT_TOKEN_SECRET ?? "march7th-paste";
  return createHash("sha256")
    .update(`${secret}:access:${slug}:${passwordHash}`)
    .digest("hex");
}
