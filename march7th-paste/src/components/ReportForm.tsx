"use client";
import { useRef, useState } from "react";
export function ReportForm({ slug }: { slug: string }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reports/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setMessage("举报未提交成功，请稍后重试。");
        return;
      }
      setReason("");
      setMessage("已收到举报，谢谢你一起维护这个小小的空间。");
    } catch {
      setMessage("网络连接失败，请检查网络后重试。");
    } finally {
      pending.current = false;
      setSending(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel form-panel">
      <label className="field">
        <span>举报原因</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="请说明涉及的垃圾信息、钓鱼链接或其他不当内容…"
          required
          minLength={3}
        />
        <small>请填写 3–2000 个字符。</small>
      </label>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={sending || reason.trim().length < 3}
      >
        {sending ? "正在提交…" : "提交举报"}
      </button>
      {message && (
        <p
          role="status"
          className="notice"
          style={{ marginTop: 18, marginBottom: 0 }}
        >
          {message}
        </p>
      )}
    </form>
  );
}
