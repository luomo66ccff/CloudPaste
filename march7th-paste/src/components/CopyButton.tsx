"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
export function CopyButton({
  label,
  value,
  className = "btn btn-ghost btn-small",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(area);
        area.select();
        try {
          if (!document.execCommand("copy"))
            throw new Error("Clipboard unavailable");
        } finally {
          area.remove();
        }
      }
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }
  return (
    <button
      className={className}
      type="button"
      onClick={copy}
      aria-label={
        status === "failed" ? `${label}：复制失败，请手动选择文字` : label
      }
      title={status === "failed" ? "复制失败，请手动选择文字" : label}
    >
      <Icon name={status === "copied" ? "check" : "copy"} size={14} />
      <span aria-live="polite">
        {status === "copied"
          ? "已复制"
          : status === "failed"
            ? "请手动复制"
            : label}
      </span>
    </button>
  );
}
