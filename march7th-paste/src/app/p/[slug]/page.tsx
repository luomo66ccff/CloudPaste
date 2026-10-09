import Link from "next/link";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { PasteReader } from "@/components/PasteReader";
import { BookmarkButton } from "@/components/BookmarkButton";
import { Icon } from "@/components/Icon";
import { PasteActions } from "@/components/PasteActions";
import { PasswordGate } from "@/components/PasswordGate";
import { canAccessPaste, getPasteForAccess, markPasteRead } from "@/lib/pastes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const result = await getPasteForAccess((await params).slug);
  if (result.status !== "ok") {
    return { title: "分享已不可用", robots: { index: false, follow: false } };
  }

  const paste = result.paste;
  const protectedPreview = Boolean(paste.passwordHash || paste.burnAfterRead);
  const title = protectedPreview ? "受保护的分享" : paste.title;
  const description = protectedPreview
    ? "在 March7th Paste 查看这份分享。受保护内容不会出现在链接预览中。"
    : paste.content.slice(0, 140).replace(/\s+/g, " ");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://paste.march7th.cn/p/${paste.slug}`,
    },
    twitter: { card: "summary", title, description },
    robots:
      paste.visibility === "public" && !protectedPreview
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

function Unavailable({ burned = false }: { burned?: boolean }) {
  return (
    <main className="page-shell narrow-page">
      <section className="panel page-heading status-card">
        <span className="status-card-icon">
          <Icon name={burned ? "flame" : "clock"} size={24} />
        </span>
        <p className="page-eyebrow">这段旅程暂时告一段落</p>
        <h1>{burned ? "这份分享已经阅后即焚" : "这份分享暂不可用"}</h1>
        <p className="muted">
          {burned
            ? "链接已在第一次成功读取后失效，无法再次打开。"
            : "分享可能已过期、被隐藏或已被删除。"}
        </p>
        <div className="status-card-actions">
          <Link href="/new" className="btn btn-primary">
            写一份新分享
          </Link>
          <Link href="/public" className="btn btn-ghost">
            去公开广场看看
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function PastePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();
  if (
    requestHeaders.has("next-router-prefetch") ||
    /prefetch/i.test(requestHeaders.get("purpose") ?? "") ||
    /prefetch/i.test(requestHeaders.get("sec-purpose") ?? "")
  ) {
    return (
      <main className="page-shell narrow-page">
        <section className="panel page-heading status-card">
          <span className="status-card-icon">
            <Icon name="ticket" size={24} />
          </span>
          <h1>打开这份分享</h1>
          <p className="muted">点击后读取内容，阅后即焚的分享只会展示一次。</p>
          <div className="status-card-actions">
            <a href={`/p/${slug}`} className="btn btn-primary">
              打开分享
            </a>
          </div>
        </section>
      </main>
    );
  }
  const result = await getPasteForAccess(slug);
  if (result.status === "not-found") {
    notFound();
  }
  if (result.status !== "ok") {
    return <Unavailable burned={result.status === "burned"} />;
  }

  const cookieValue = result.paste.passwordHash
    ? (await cookies()).get(`mp_${slug}`)?.value
    : undefined;
  if (!canAccessPaste(result.paste, cookieValue)) {
    return (
      <main className="page-shell">
        <PasswordGate slug={slug} />
      </main>
    );
  }

  const paste = await markPasteRead(result.paste, { countView: true });
  if (!paste) {
    return <Unavailable burned={result.paste.burnAfterRead} />;
  }

  const siteUrl =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://paste.march7th.cn");
  const pasteUrl = `${siteUrl}/p/${paste.slug}`;
  const rawUrl = `${siteUrl}/raw/${paste.slug}`;
  const typeLabel =
    paste.contentType === "markdown"
      ? "Markdown"
      : paste.contentType === "code"
        ? "代码"
        : "纯文本";
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai",
    }).format(date);

  return (
    <main className="page-shell">
      <article className="document-reader">
        <header className="reader-heading">
          <div className="reader-ticket">
            <div className="ticket-main">
              <p className="page-eyebrow">来自星穹的一段灵感</p>
              <h1>{paste.title}</h1>
              <div className="reader-meta ticket-badges">
                <span className={`badge badge-type badge-${paste.contentType}`}>
                  <Icon
                    name={
                      paste.contentType === "code"
                        ? "code"
                        : paste.contentType === "markdown"
                          ? "markdown"
                          : "text"
                    }
                    size={13}
                  />
                  {typeLabel}
                  {paste.language ? ` / ${paste.language}` : ""}
                </span>
                {paste.passwordHash && (
                  <span className="badge badge-guard">
                    <Icon name="lock" size={13} />
                    密码保护
                  </span>
                )}
                {paste.burnAfterRead && (
                  <span className="badge badge-burn">
                    <Icon name="flame" size={13} />
                    阅后即焚 · 链接已失效
                  </span>
                )}
              </div>
              <div className="reader-meta ticket-actions">
                <Link href="/new" className="btn btn-primary">
                  <Icon name="plus" size={15} />
                  写一份分享
                </Link>
                {!paste.burnAfterRead && (
                  <a href={rawUrl} className="btn btn-ghost">
                    查看原文 ↗
                  </a>
                )}
                <Link href={`/report/${paste.slug}`} className="btn btn-ghost">
                  举报内容
                </Link>
                {!paste.passwordHash && !paste.burnAfterRead && (
                  <BookmarkButton
                    paste={{
                      slug: paste.slug,
                      title: paste.title,
                      contentType: paste.contentType,
                      createdAt: paste.createdAt.toISOString(),
                      expireAt: paste.expireAt?.toISOString() ?? null,
                      burnAfterRead: false,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="ticket-stub">
              <p className="ticket-stub-label">
                <Icon name="ticket" size={13} />
                BOARDING PASS
              </p>
              <dl>
                <div>
                  <dt>编号</dt>
                  <dd className="ticket-slug">/{paste.slug}</dd>
                </div>
                <div>
                  <dt>舱位</dt>
                  <dd>{paste.visibility === "public" ? "公开分享" : "仅链接可见"}</dd>
                </div>
                <div>
                  <dt>创建于</dt>
                  <dd>{formatDate(paste.createdAt)}</dd>
                </div>
                <div>
                  <dt>有效期</dt>
                  <dd>
                    {paste.expireAt
                      ? `至 ${formatDate(paste.expireAt)}`
                      : "永久有效"}
                  </dd>
                </div>
              </dl>
              <span className="barcode" aria-hidden="true" />
            </div>
          </div>
          <PasteActions
            title={paste.title}
            content={paste.content}
            contentType={paste.contentType}
            url={pasteUrl}
            rawUrl={rawUrl}
          />
          {paste.burnAfterRead && (
            <p className="notice notice-burn">
              <Icon name="flame" size={16} />
              这是唯一一次展示。需要保留时，请现在复制或下载；重新打开链接将无法阅读。
            </p>
          )}
        </header>
        <PasteReader
          content={paste.content}
          contentType={paste.contentType}
          language={paste.language}
          title={paste.title}
          sensitive={Boolean(paste.passwordHash || paste.burnAfterRead)}
        />
      </article>
    </main>
  );
}
