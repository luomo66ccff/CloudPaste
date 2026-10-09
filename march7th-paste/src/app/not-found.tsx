import Link from "next/link";
import { Icon } from "@/components/Icon";
export default function NotFound() {
  return (
    <main className="page-shell narrow-page lost-page">
      <div className="lost-ticket" aria-hidden="true">
        <div className="lost-ticket-main">
          <span className="lost-ticket-label">
            <Icon name="ticket" size={13} />
            BOARDING PASS
          </span>
          <span className="lost-ticket-code">404</span>
          <span className="lost-ticket-route">
            <span>当前位置</span>
            <i />
            <span>未知星域</span>
          </span>
        </div>
        <div className="lost-ticket-stub">
          <span className="lost-ticket-stamp">VOID</span>
          <span className="barcode" />
        </div>
      </div>
      <div className="lost-copy">
        <p className="page-eyebrow">404 · LOST AMONG THE STARS</p>
        <h1>这班列车，暂时找不到了</h1>
        <p className="muted">链接可能有误，或片段已经过期、被移除。</p>
        <div className="status-card-actions">
          <Link href="/new" className="btn btn-primary">
            写下新的灵感 <Icon name="arrow" size={16} />
          </Link>
          <Link href="/public" className="btn btn-ghost">
            去公开广场看看
          </Link>
        </div>
      </div>
    </main>
  );
}
