export function safeShareUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      !/^\/p\/[a-zA-Z0-9_-]{1,64}$/.test(url.pathname) ||
      !["http:", "https:"].includes(url.protocol)
    )
      return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
