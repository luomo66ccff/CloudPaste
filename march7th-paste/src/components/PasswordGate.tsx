"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
export function PasswordGate({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !password) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/pastes/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "尝试过于频繁，请稍后再试。"
            : response.status === 404 || response.status === 410
              ? "这个片段已经失效。"
              : "密码不正确，再检查一下吧。",
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("暂时无法连接，请检查网络后重试。");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return (
    <form onSubmit={unlock} className="panel gate-panel">
      <span className="gate-logo">
        <Icon name="lock" size={25} />
      </span>
      <h2>这份灵感，需要一把钥匙</h2>
      <p>创建者为片段设置了访问密码。输入密码后，即可查看正文与 Raw 内容。</p>
      <label className="field">
        <span>访问密码</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          maxLength={200}
          autoFocus
          placeholder="输入创建者提供的密码"
        />
      </label>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading || !password}
      >
        {loading ? "正在验证…" : "解锁片段"}
        <Icon name="arrow" size={16} />
      </button>
      {error && (
        <p
          className="notice notice-error"
          role="alert"
          style={{ marginTop: 16, marginBottom: 0 }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
