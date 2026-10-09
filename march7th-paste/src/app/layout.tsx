import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/Icon";
import { SiteHeader } from "@/components/SiteHeader";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import "@/styles/foundation.css";
import "@/styles/landing.css";
import "@/styles/reader.css";
import "@/styles/workspace.css";
import "@/styles/adaptive.css";
export const metadata: Metadata = {
  title: {
    default: "March7th Paste · 让灵感轻松分享",
    template: "%s · March7th Paste",
  },
  description:
    "把代码、Markdown、公式和短笺，变成一个可以分享的链接。支持实时预览、本机草稿、访问密码与阅后即焚。",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090c1a" },
  ],
};
const themeScript = `try{var t=localStorage.getItem('march7th-theme-v1');document.documentElement.dataset.theme=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){}`;
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <svg className="svg-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient
              id="m7-brand-gradient"
              x1="0"
              y1="0"
              x2="40"
              y2="40"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#ff5fa2" />
              <stop offset="0.52" stopColor="#9566ff" />
              <stop offset="1" stopColor="#3aa8f5" />
            </linearGradient>
          </defs>
        </svg>
        <a href="#main-content" className="skip-link">
          跳到主要内容
        </a>
        <SiteHeader />
        <div id="main-content" className="site-content">
          {children}
        </div>
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-intro">
              <Link href="/" className="footer-brand">
                <BrandMark size={30} />
                <span>
                  March7th<span className="brand-product">Paste</span>
                </span>
              </Link>
              <p className="footer-tagline">把一段灵感，暂存于星穹之间。</p>
              <a className="footer-status" href="/health" target="_blank" rel="noreferrer">
                <span className="status-dot" />
                服务状态
              </a>
            </div>
            <nav className="footer-links" aria-label="页脚导航">
              <div>
                <p className="footer-heading">创作</p>
                <Link href="/new">新建片段</Link>
                <Link href="/templates">模板库</Link>
                <Link href="/recent">资料库</Link>
              </div>
              <div>
                <p className="footer-heading">探索</p>
                <Link href="/public">公开广场</Link>
                <Link href="/api-docs">API 文档</Link>
              </div>
            </nav>
          </div>
          <div className="footer-base">
            <span>March7th Paste · v4.0 星穹车票版</span>
            <span>Made for your next idea. ✦</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
