import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/ReportForm";
import { getPasteForAccess } from "@/lib/pastes";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "举报片段",
  robots: { index: false, follow: false },
};
export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPasteForAccess(slug);
  if (result.status === "not-found") notFound();
  return (
    <main className="page-shell compact-form-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">KEEP THIS SPACE KIND</p>
          <h1>
            举报片段<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            告诉我们哪里出了问题，帮助我们保持这个空间友善、有用。
          </p>
        </div>
        <Link href={`/p/${slug}`} prefetch={false} className="text-link">
          返回片段
        </Link>
      </div>
      <ReportForm slug={slug} />
    </main>
  );
}
