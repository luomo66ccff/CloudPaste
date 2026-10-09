"use client";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { ShareTools } from "@/components/ShareTools";
type PasteActionsProps = {
  title: string;
  content: string;
  contentType: string;
  url: string;
  rawUrl: string;
};
export function PasteActions({
  title,
  content,
  contentType,
  url,
  rawUrl,
}: PasteActionsProps) {
  const extension = contentType === "markdown" ? "md" : "txt";
  function download() {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${
      title
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .slice(0, 70) || "paste"
    }.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return (
    <div className="reader-toolbar">
      <CopyButton label="复制链接" value={url} />
      <ShareTools url={url} />
      <CopyButton label="复制正文" value={content} />
      <CopyButton label="复制 Raw 链接" value={rawUrl} />
      <CopyButton
        label="Markdown 引用"
        value={`[${title.replace(/[\\[\]]/g, "\\$&")}](${url})`}
      />
      <button
        className="btn btn-ghost btn-small"
        type="button"
        onClick={download}
      >
        <Icon name="download" size={14} />
        下载 .{extension}
      </button>
      <button
        className="btn btn-ghost btn-small"
        type="button"
        onClick={() => window.print()}
      >
        <Icon name="file" size={14} />
        打印 / PDF
      </button>
    </div>
  );
}
