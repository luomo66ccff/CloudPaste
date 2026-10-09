import type { Metadata } from "next";
import { templates } from "@/lib/templates";
import { TemplateGallery } from "@/components/TemplateGallery";
export const metadata: Metadata = { title: "灵感模板库" };
export default function TemplatesPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">A GOOD PLACE TO BEGIN</p>
          <h1>
            灵感模板库<span className="heading-dot">.</span>
          </h1>
          <p className="muted">从一份恰好的结构开始，把时间留给内容。</p>
        </div>
        <span className="editor-intro-badge">{templates.length} 个起点 · 无限种可能</span>
      </div>
      <TemplateGallery />
    </main>
  );
}
