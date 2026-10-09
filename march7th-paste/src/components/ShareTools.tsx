"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { CopyButton } from "@/components/CopyButton";
import { safeShareUrl } from "@/lib/share-url";
export function ShareTools({
  url,
  title = "来自 March7th Paste 的分享",
}: {
  url: string;
  title?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState(""),
    [ready, setReady] = useState(false);
  async function nativeShare() {
    const safe = safeShareUrl(url, window.location.origin);
    if (!safe) {
      setMessage("分享链接与当前站点不匹配。");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, url: safe });
        setMessage("分享面板已完成。");
      } else {
        setMessage("此浏览器没有系统分享面板，可使用复制链接或二维码。");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setMessage("分享未完成，可改用复制链接。");
    }
  }
  async function openQr(trigger: HTMLButtonElement) {
    const safe = safeShareUrl(url, window.location.origin);
    if (!safe) {
      setMessage("无法为此地址生成二维码。");
      return;
    }
    setReady(false);
    opener.current = trigger;
    setShareUrl(safe);
    setMessage("");
    dialog.current?.showModal();
    try {
      const QRCode = (await import("qrcode")).default;
      if (canvas.current) {
        await QRCode.toCanvas(canvas.current, safe, {
          width: 256,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#202033", light: "#ffffff" },
        });
        setReady(true);
      }
    } catch {
      setMessage("二维码生成失败，仍可复制分享链接。");
    }
  }
  function downloadQr() {
    if (!canvas.current || !ready) return;
    const a = document.createElement("a");
    a.href = canvas.current.toDataURL("image/png");
    a.download = "march7th-share-qr.png";
    a.click();
  }
  return (
    <span className="share-tools">
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => void nativeShare()}
      >
        <Icon name="share" size={15} />
        系统分享
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={(event) => void openQr(event.currentTarget)}
      >
        <Icon name="qr" size={15} />
        二维码
      </button>
      {message && (
        <span className="share-status" role="status">
          {message}
        </span>
      )}
      <dialog
        ref={dialog}
        className="app-dialog qr-dialog"
        aria-labelledby="qr-dialog-title"
        onClose={() => opener.current?.focus({ preventScroll: true })}
      >
        <div className="dialog-heading">
          <h2 id="qr-dialog-title">换个屏幕，继续分享</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭二维码"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="muted">二维码在此设备生成，内容为分享链接。</p>
        <canvas ref={canvas} aria-label="分享链接二维码" />
        <p className="qr-url">{shareUrl}</p>
        {message && <p role="status">{message}</p>}
        <div className="button-row">
          <CopyButton value={shareUrl} label="复制分享链接" />
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={!ready}
            onClick={downloadQr}
          >
            <Icon name="download" size={15} />
            下载二维码
          </button>
        </div>
      </dialog>
    </span>
  );
}
