"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { ShareTools } from "@/components/ShareTools";
import { saveManagementLinks } from "@/lib/client-storage";

export type CreatedPaste = {
  slug: string;
  title: string;
  url: string;
  rawUrl: string;
  rawMarkdownUrl: string;
  editUrl: string;
  deleteUrl: string;
  createdAt: string;
  expireAt: string | null;
  burnAfterRead: boolean;
};

export function PasteSuccess({
  paste,
  onNew,
}: {
  paste: CreatedPaste;
  onNew: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const reference = `[${paste.title.replace(/[\\[\]]/g, "\\$&")}](${paste.url})`;

  function saveLinks() {
    setError("");
    if (
      saveManagementLinks(paste.slug, {
        editUrl: paste.editUrl,
        deleteUrl: paste.deleteUrl,
      })
    ) {
      setSaved(true);
      setMessage(
        "管理链接已保存在当前标签页会话，可在「最近片段」中找到。关闭会话后会清除。",
      );
    } else {
      setError("当前浏览器无法保存管理链接，请复制链接或下载凭证。");
    }
  }

  function downloadCredentials() {
    setError("");
    try {
      const credentials = {
        version: 1,
        slug: paste.slug,
        title: paste.title,
        url: paste.url,
        rawUrl: paste.rawUrl,
        rawMarkdownUrl: paste.rawMarkdownUrl,
        editUrl: paste.editUrl,
        deleteUrl: paste.deleteUrl,
        createdAt: paste.createdAt,
        expireAt: paste.expireAt,
        burnAfterRead: paste.burnAfterRead,
      };
      const objectUrl = URL.createObjectURL(
        new Blob([JSON.stringify(credentials, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `march7th-paste-${paste.slug}-management.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(
        "管理凭证已下载。文件不含访问密码或正文，请妥善保管其中的管理链接。",
      );
    } catch {
      setError("下载失败，请手动复制下方管理链接。");
    }
  }

  return (
    <section
      className="panel success-panel"
      aria-labelledby="paste-success-title"
    >
      <header className="success-header">
        <span className="success-icon">
          <Icon name="check" size={24} />
        </span>
        <div>
          <h2 id="paste-success-title">片段已创建，灵感准备启程。</h2>
          <p>把链接交给想分享的人，管理链接请留给自己。</p>
        </div>
      </header>
      <div className="success-share-tools">
        <ShareTools url={paste.url} />
      </div>
      {paste.burnAfterRead && (
        <div className="notice notice-warning" role="status">
          <Icon name="flame" />
          <div>
            <strong>阅后即焚已开启</strong>
            <p>
              首次成功读取分享页、Raw 或 API
              后，链接即失效。现在不会自动打开，分享前请勿试读。
            </p>
          </div>
        </div>
      )}
      <div className="share-url-row">
        <Icon name="link" size={18} />
        <code>{paste.url}</code>
        <CopyButton label="复制分享链接" value={paste.url} />
      </div>
      <div className="success-actions">
        <a href={paste.url} className="btn btn-primary">
          <Icon name="external" size={15} />
          {paste.burnAfterRead ? "首次阅读（读取后链接失效）" : "打开分享"}
        </a>
        <CopyButton label="复制 Raw 链接" value={paste.rawUrl} />
        <CopyButton label="复制 Markdown 引用" value={reference} />
        {!paste.burnAfterRead && (
          <a href={paste.rawUrl} className="btn btn-ghost">
            查看原文 <Icon name="external" size={14} />
          </a>
        )}
      </div>
      <details className="management-details">
        <summary>管理链接 · 请妥善保存</summary>
        <p>
          任何持有这些链接的人都能编辑或删除片段。管理链接不会默认写入本机记录；离开此页前，请自行复制、保存到当前会话或下载凭证。
        </p>
        <div className="management-link-row">
          <span>编辑</span>
          <code>{paste.editUrl}</code>
          <CopyButton label="复制编辑链接" value={paste.editUrl} />
        </div>
        <div className="management-link-row">
          <span>删除</span>
          <code>{paste.deleteUrl}</code>
          <CopyButton label="复制删除链接" value={paste.deleteUrl} />
        </div>
        <div className="management-buttons">
          <button
            className="btn btn-ghost btn-small"
            type="button"
            disabled={saved}
            onClick={saveLinks}
          >
            <Icon name={saved ? "check" : "shield"} size={14} />
            {saved ? "已保存到当前会话" : "在当前会话保存管理链接"}
          </button>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={downloadCredentials}
          >
            <Icon name="download" size={14} />
            下载管理凭证 JSON
          </button>
        </div>
      </details>
      {message && (
        <p className="notice notice-info" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="success-new">
        <p>
          本机「最近片段」只记录链接、标题与分享状态。
          <br />
          访问密码、正文和管理密钥都不会默认保存在最近记录中。
        </p>
        <button className="btn btn-ghost" type="button" onClick={onNew}>
          <Icon name="plus" size={15} />
          再写一份
        </button>
      </div>
    </section>
  );
}
