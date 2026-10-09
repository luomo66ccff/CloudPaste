"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { BrandMark, Icon } from "@/components/Icon";
function subscribe(callback: () => void) {
  window.addEventListener("march7th-theme", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("march7th-theme", callback);
    window.removeEventListener("storage", callback);
  };
}
function getTheme() {
  return document.documentElement.dataset.theme === "dark";
}
export function SiteHeader() {
  const path = usePathname();
  const dark = useSyncExternalStore(subscribe, getTheme, () => false);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      try {
        const choice = localStorage.getItem("march7th-theme-v1");
        document.documentElement.dataset.theme =
          choice === "dark" ||
          ((!choice || choice === "system") && media.matches)
            ? "dark"
            : "light";
        window.dispatchEvent(new Event("march7th-theme"));
      } catch {}
    };
    media.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
  function toggleTheme() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("march7th-theme-v1", next);
    } catch {
      /* Optional storage. */
    }
    window.dispatchEvent(new Event("march7th-theme"));
  }
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="March7th Paste 首页">
          <span className="brand-symbol">
            <BrandMark />
          </span>
          <span className="brand-name">
            March7th<span className="brand-product">Paste</span>
          </span>
          <span className="version-tag">4.0</span>
        </Link>
        <nav aria-label="主导航" className="main-nav">
          {[
            { href: "/", label: "工作台" },
            { href: "/public", label: "公开广场" },
            { href: "/recent", label: "资料库" },
            { href: "/templates", label: "模板库" },
            { href: "/api-docs", label: "开发者 API" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={path === item.href ? "nav-link active" : "nav-link"}
              aria-current={path === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <CommandPalette />
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "切换浅色模式" : "切换深色模式"}
          >
            <Icon name={dark ? "sun" : "moon"} />
          </button>
          <Link className="btn btn-primary header-create" href="/new">
            <Icon name="plus" size={16} />
            <span>新建片段</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
