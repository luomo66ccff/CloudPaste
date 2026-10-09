import Link from "next/link";
import { notFound } from "next/navigation";

import { listAdminPastes, listReports } from "@/lib/pastes";

export const dynamic = "force-dynamic";

export default async function AdminPastesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    notFound();
  }

  const [pastes, reports] = await Promise.all([
    listAdminPastes(),
    listReports(),
  ]);

  return (
    <main className="min-h-screen px-5 py-8">
      <section className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="text-sm font-semibold text-cyan-700 dark:text-cyan-300"
        >
          March7th Paste
        </Link>
        <h1 className="mt-6 text-4xl font-black">Admin</h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="text-xl font-bold">Recent pastes</h2>
            <div className="mt-4 grid gap-3">
              {pastes.map((paste) => (
                <div
                  key={paste.slug}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/8"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link className="font-bold" href={`/p/${paste.slug}`}>
                        {paste.title}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {paste.slug} · {paste.visibility} · {paste.status}
                      </p>
                    </div>
                    {paste.hiddenAt ? (
                      <span>hidden</span>
                    ) : (
                      <span>visible</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-bold">Reports</h2>
            <div className="mt-4 grid gap-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/8"
                >
                  <Link className="font-bold" href={`/p/${report.slug}`}>
                    {report.slug}
                  </Link>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                    {report.reason}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate-500">
                    {report.createdAt.toISOString()}
                  </p>
                </div>
              ))}
              {reports.length === 0 && (
                <p className="text-slate-500">No reports yet.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
