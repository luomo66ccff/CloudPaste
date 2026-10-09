"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { forgetPaste } from "@/lib/client-storage";
export function DeletePastePanel({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(false);
  async function remove() {
    if (
      pending.current ||
      !window.confirm("确定永久删除这个线上片段？此操作无法撤销。")
    )
      return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/pastes/${slug}`, {
        method: "DELETE",
        headers: { "x-delete-token": token },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setError(
          response.status === 403
            ? "管理凭证无效，无法删除这个片段。"
            : "删除未成功，请稍后重试。",
        );
        return;
      }
      forgetPaste(slug);
      router.push("/recent");
    } catch {
      setError("网络连接失败，请重试。");
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }
  return (
    <div className="panel gate-panel">
      <span className="gate-logo danger-text">
        <Icon name="trash" size={23} />
      </span>
      <h2>和这段记录道个别</h2>
      <p>
        删除会永久移除线上片段，已有的分享链接也将失效。删除凭证只允许删除，不能编辑内容。
      </p>
      <button
        className="btn btn-danger"
        type="button"
        disabled={deleting}
        onClick={remove}
      >
        {deleting ? "正在删除…" : "永久删除线上片段"}
      </button>
      {error && (
        <p
          role="alert"
          className="notice notice-error"
          style={{ marginTop: 16 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
