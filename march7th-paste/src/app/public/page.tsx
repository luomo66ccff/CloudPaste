import type { Metadata } from "next";
import Link from "next/link";
import { PublicPastes } from "@/components/PublicPastes";
import { Icon } from "@/components/Icon";
import { listPublicPastes } from "@/lib/pastes";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "公开广场" };
export default async function PublicPage() {
  const rows = await listPublicPastes()
    .then((pastes) =>
      pastes.map((p) => ({
        slug: p.slug,
        title: p.title,
        contentType: p.contentType,
        language: p.language,
        createdAt: p.createdAt.toISOString(),
        expireAt: p.expireAt?.toISOString() ?? null,
        viewCount: p.viewCount,
        excerpt: p.content.slice(0, 200).replace(/\s+/g, " "),
      })),
    )
    .catch(() => null);
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">SMALL IDEAS, SHARED OPENLY</p>
          <h1>
            公开广场<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            灵感可以很小，共鸣可以很远。发现那些愿意被分享的片段。
          </p>
        </div>
        <Link href="/new" className="btn btn-ghost">
          <Icon name="plus" size={16} />
          写点什么
        </Link>
      </div>
      {rows ? (
        <PublicPastes rows={rows} />
      ) : (
        <div className="panel empty-state">
          <span className="empty-icon">
            <Icon name="globe" size={26} />
          </span>
          <h3>暂时未能加载公开片段</h3>
          <p>请稍后重试，你仍然可以继续写作。</p>
          <Link href="/public" className="btn btn-ghost btn-small">
            重新加载
          </Link>
        </div>
      )}
      <p className="local-note">
        <Icon name="shield" size={15} />
        仅展示主动公开的片段；密码保护、阅后即焚及失效内容不会出现在这里。
      </p>
    </main>
  );
}
