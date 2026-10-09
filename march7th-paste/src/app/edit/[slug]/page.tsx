import Link from "next/link";
import { notFound } from "next/navigation";

import { PasteForm } from "@/components/PasteForm";
import { verifyEditToken } from "@/lib/crypto";
import { getPaste } from "@/lib/pastes";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "编辑片段",
  robots: { index: false, follow: false },
};

export default async function EditPastePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string; token?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const token = query.token ?? query.key;
  const paste = await getPaste(slug);

  if (!paste || !token || !verifyEditToken(token, paste.editTokenHash)) {
    notFound();
  }

  return (
    <main className="page-shell editor-page">
      <div>
        <Link
          href={paste.burnAfterRead ? "/recent" : `/p/${slug}`}
          prefetch={false}
          className="text-link"
          style={{ marginBottom: 22 }}
        >
          ← {paste.burnAfterRead ? "返回本机记录" : "返回片段"}
        </Link>
        <header className="page-heading">
          <div>
            <p className="page-eyebrow">REFINE YOUR NEXT IDEA</p>
            <h1>
              编辑片段<span className="heading-dot">.</span>
            </h1>
            <p className="muted">
              保存会更新原链接；未选择新有效期时，保留现有设置。
            </p>
          </div>
        </header>
        <div>
          <PasteForm
            mode="edit"
            slug={slug}
            token={token}
            initial={{
              title: paste.title,
              content: paste.content,
              contentType: paste.contentType,
              language: paste.language,
              visibility: paste.visibility,
              password: "",
              burnAfterRead: paste.burnAfterRead,
              expireAt: paste.expireAt?.toISOString() ?? null,
              hasPassword: Boolean(paste.passwordHash),
            }}
          />
        </div>
      </div>
    </main>
  );
}
