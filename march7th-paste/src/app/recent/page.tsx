import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { LocalLibrary } from "@/components/LocalLibrary";
export const metadata: Metadata = {
  title: "本机资料库",
  robots: { index: false, follow: false },
};
export default async function RecentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <main className="page-shell library-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">PICK UP WHERE YOU LEFT OFF</p>
          <h1>
            本机资料库<span className="heading-dot">.</span>
          </h1>
          <p className="muted">草稿、分享、收藏，让灵感有序发生。</p>
        </div>
        <span className="badge">
          <Icon name="clock" size={14} />
          仅保存在此设备
        </span>
      </div>
      <LocalLibrary key={tab ?? "drafts"} initialTab={tab} />
      <div className="privacy-footnote">
        <Icon name="shield" />
        <p>
          本机草稿保存未发布正文；分享记录与收藏各保留最近 40
          个链接及元数据。这里不会跨设备同步。管理链接仅由你主动导入或保存到当前会话，移除记录不会删除线上片段。
        </p>
      </div>
    </main>
  );
}
