import Link from "next/link";
import { notFound } from "next/navigation";

import { DeletePastePanel } from "@/components/DeletePastePanel";
import { verifyDeleteToken, verifyEditToken } from "@/lib/crypto";
import { getPasteForAccess } from "@/lib/pastes";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "删除片段",
  robots: { index: false, follow: false },
};

export default async function DeletePastePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string; token?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const token = query.key ?? query.token;
  const result = await getPasteForAccess(slug);

  if (result.status === "not-found" || !token) {
    notFound();
  }
  const paste = result.paste;
  const authorized =
    Boolean(
      paste.deleteTokenHash && verifyDeleteToken(token, paste.deleteTokenHash),
    ) || verifyEditToken(token, paste.editTokenHash);
  if (!authorized) {
    notFound();
  }

  return (
    <main className="page-shell compact-form-page">
      <section>
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
            <p className="page-eyebrow">MANAGE YOUR SHARED IDEAS</p>
            <h1>
              删除片段<span className="heading-dot">.</span>
            </h1>
            <p className="muted">{paste.title} · 管理密钥已验证。</p>
          </div>
        </header>
        <div>
          <DeletePastePanel slug={slug} token={token} />
        </div>
      </section>
    </main>
  );
}
