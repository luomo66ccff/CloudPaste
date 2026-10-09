import type { Metadata } from "next";
import { PasteForm } from "@/components/PasteForm";
import { templates } from "@/lib/templates";
export const metadata: Metadata = { title: "新建片段" };
export default async function NewPastePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; template?: string; draft?: string; tool?: string }>;
}) {
  const query = await searchParams;
  const draftId =
    typeof query.draft === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(query.draft)
      ? query.draft
      : undefined;
  const template = draftId
    ? undefined
    : templates.find((t) => t.id === query.template);
  const contentType = ["markdown", "code", "plain"].includes(query.type ?? "")
    ? query.type!
    : "markdown";
  const initialTool = typeof query.tool === "string" ? ({ table: "生成表格", csv: "CSV / TSV 转表格", json: "格式化 JSON", cleanup: "清理", unicode: "Unicode", links: "提取网页链接" } as Record<string, string>)[query.tool] : undefined;
  return (
    <main className="page-shell editor-page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">A SPACE FOR YOUR IDEAS</p>
          <h1>
            新建片段<span className="heading-dot">.</span>
          </h1>
          <p className="muted">把此刻的想法，变成下一次连接。</p>
        </div>
        <span className="editor-intro-badge">
          <span className="status-dot" />
          无需登录 · 即写即分享
        </span>
      </div>
      <PasteForm
        initialTool={initialTool}
        key={draftId ?? template?.id ?? contentType}
        draftId={draftId}
        mode="create"
        initial={{
          title: template?.title ?? "",
          content: template?.content ?? "",
          contentType: template?.type ?? contentType,
          language: template?.language ?? "",
          visibility: "unlisted",
        }}
      />
    </main>
  );
}
