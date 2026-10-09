import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { RecentPastes } from "@/components/RecentPastes";
import { templates } from "@/lib/templates";

const quickTools: { tool: string; title: string; description: string; icon: IconName; type?: string }[] = [
  { tool: "csv", title: "表格转换", description: "CSV / TSV → Markdown", icon: "grid" },
  { tool: "json", title: "JSON 整理", description: "格式化、压缩与校验", icon: "code", type: "code" },
  { tool: "cleanup", title: "文本清理", description: "去空白、去重与排序", icon: "text", type: "plain" },
  { tool: "table", title: "快速制表", description: "自选行列与对齐方式", icon: "grid" },
  { tool: "unicode", title: "Unicode 工具", description: "转义与安全还原", icon: "terminal", type: "plain" },
  { tool: "links", title: "链接提取", description: "从文本整理网页地址", icon: "link", type: "plain" },
];

const starts: { type: string; icon: IconName; title: string; copy: string; label: string; cta: string }[] = [
  { type: "markdown", icon: "markdown", title: "写一份文档", copy: "笔记、待办、表格与数学公式", label: "MARKDOWN", cta: "开始写作" },
  { type: "code", icon: "code", title: "分享一段代码", copy: "语法高亮、JSON 工具与文件导入", label: "CODE SNIPPET", cta: "贴上代码" },
  { type: "plain", icon: "text", title: "整理一些文字", copy: "清理、编码、命名转换，轻松处理", label: "PLAIN TEXT", cta: "整理文字" },
];

const journey: { step: string; icon: IconName; title: string; copy: string }[] = [
  { step: "01", icon: "file", title: "写下", copy: "Markdown、代码与纯文本，边写边看；草稿自动留在这台设备上。" },
  { step: "02", icon: "shield", title: "设定保护", copy: "凭链接访问或公开到广场，可加访问密码、有效期与阅后即焚。" },
  { step: "03", icon: "share", title: "分享出发", copy: "一个链接、二维码或 Raw 地址；管理链接让你随时编辑或删除。" },
];

const apiSample = `curl -X POST https://paste.march7th.cn/api/paste \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Hello","type":"markdown",
       "content":"# Hello","expiresIn":"7d"}'`;

function StartArt({ type }: { type: string }) {
  if (type === "code") {
    return <span className="start-art start-art-code" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
  }
  if (type === "plain") {
    return <span className="start-art start-art-plain" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  return <span className="start-art start-art-markdown" aria-hidden="true"><b>#</b><i /><i /><span><em />先记下来</span><span><em />和伙伴分享</span></span>;
}

export default function HomePage() {
  return <main className="page-shell landing">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="landing-chip"><span className="landing-chip-mark"><Icon name="sparkle" size={12} /></span>v4.0 星穹车票版<span className="landing-chip-divider" aria-hidden="true" />无需注册，打开就写</p>
        <h1 id="landing-title">写下，整理，<br /><span className="aurora-text">分享好想法。</span></h1>
        <p className="landing-lede">代码、Markdown、公式与短笺，都能变成一张随身的<strong>星穹车票</strong>。实时预览、本机草稿、访问密码与阅后即焚，一步到位。</p>
        <div className="landing-actions">
          <Link href="/new" className="btn btn-aurora btn-large">新建片段 <Icon name="arrow" size={18} /></Link>
          <Link href="/recent?tab=drafts" className="btn btn-ghost btn-large"><Icon name="archive" size={17} />继续写草稿</Link>
        </div>
        <ul className="landing-facts">
          <li><Icon name="check" size={15} />无需注册</li>
          <li><Icon name="eye" size={15} />实时预览</li>
          <li><Icon name="shield" size={15} />保护方式由你选</li>
        </ul>
      </div>
      <div className="landing-stage" role="img" aria-label="编辑工作台示例：左侧书写 Markdown，右侧实时预览，并生成一张带有效期与阅后即焚设置的分享车票">
        <svg className="stage-orbit" viewBox="0 0 640 520" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="landing-orbit" x1="40" y1="60" x2="600" y2="460" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff7eb6" />
              <stop offset="0.5" stopColor="#c98bff" />
              <stop offset="1" stopColor="#6ac7ff" />
            </linearGradient>
          </defs>
          <ellipse className="stage-orbit-rail" cx="320" cy="260" rx="300" ry="150" transform="rotate(-14 320 260)" stroke="url(#landing-orbit)" strokeOpacity="0.6" strokeDasharray="2 9" strokeLinecap="round" strokeWidth="1.6" />
          <ellipse cx="320" cy="260" rx="236" ry="226" transform="rotate(24 320 260)" stroke="url(#landing-orbit)" strokeOpacity="0.26" strokeWidth="1.2" />
          <circle className="stage-orbit-comet" cx="566" cy="152" r="5" fill="#ff7eb6" />
        </svg>
        <span className="stage-star stage-star-a" aria-hidden="true" />
        <span className="stage-star stage-star-b" aria-hidden="true" />
        <span className="stage-star stage-star-c" aria-hidden="true" />
        <div className="stage-editor">
          <div className="stage-chrome">
            <span className="stage-dots"><i /><i /><i /></span>
            <span className="stage-file"><Icon name="file" size={14} />a-little-idea.md</span>
            <span className="stage-live"><span className="status-dot" />实时预览</span>
          </div>
          <div className="stage-toolbar"><span>H₂</span><strong>B</strong><em>I</em><Icon name="link" size={13} /><Icon name="grid" size={13} /><span className="stage-toolbar-pill"><Icon name="split" size={12} />分栏</span></div>
          <div className="stage-body">
            <div className="stage-source">
              <span>01</span><span className="tok-heading"># 一个小小的开始</span>
              <span>02</span><span />
              <span>03</span><span>灵感不必等到<b>**完美**</b>。</span>
              <span>04</span><span className="tok-task">- [x] 先记下来</span>
              <span>05</span><span className="tok-task">- [ ] 和伙伴分享</span>
              <span>06</span><span className="tok-math">$E = mc^2$</span>
            </div>
            <div className="stage-preview">
              <span className="stage-kicker">从想法到表达</span>
              <span className="stage-title">一个小小的开始 <span>✦</span></span>
              <span className="stage-text">灵感不必等到<strong>完美</strong>。</span>
              <span className="stage-task is-done"><i />先记下来</span>
              <span className="stage-task"><i />和伙伴分享</span>
              <span className="stage-math">E = mc²</span>
            </div>
          </div>
        </div>
        <div className="stage-ticket">
          <div className="stage-ticket-main">
            <span className="stage-ticket-label"><Icon name="ticket" size={13} />BOARDING PASS · 星穹车票</span>
            <span className="stage-ticket-title">一个小小的开始</span>
            <span className="stage-ticket-meta">
              <span><small>舱位</small>凭链接访问</span>
              <span><small>有效期</small>7 天</span>
              <span><small>保护</small><em><Icon name="flame" size={12} />阅后即焚</em></span>
            </span>
          </div>
          <div className="stage-ticket-stub">
            <small>No.</small>
            <strong>/p/k7Qe2</strong>
            <span className="barcode" />
          </div>
        </div>
      </div>
    </section>

    <section className="landing-section" aria-labelledby="start-title">
      <div className="landing-section-head">
        <p className="landing-index">01 · 起点</p>
        <h2 id="start-title">从这里开始</h2>
        <p>给不同的灵感，一个合适的空间。</p>
      </div>
      <div className="start-grid">
        {starts.map(item => <Link key={item.type} href={`/new?type=${item.type}`} className={`start-card start-${item.type}`}>
          <span className="start-card-top"><span className="start-icon"><Icon name={item.icon} size={22} /></span><span className="start-label">{item.label}</span></span>
          <StartArt type={item.type} />
          <div className="start-card-copy"><h3>{item.title}</h3><p>{item.copy}</p></div>
          <span className="start-cta">{item.cta}<Icon name="arrow" size={16} /></span>
        </Link>)}
      </div>
    </section>

    <section className="landing-section" aria-labelledby="utilities-title">
      <div className="landing-section-head">
        <p className="landing-index">02 · 工具</p>
        <h2 id="utilities-title">顺手处理一下</h2>
        <p>工具直达，文本只在本机处理。</p>
      </div>
      <div className="tool-grid">
        {quickTools.map(item => <Link key={item.tool} href={`/new?tool=${item.tool}${item.type ? `&type=${item.type}` : ""}`} className="tool-tile">
          <span className="tool-icon"><Icon name={item.icon} size={19} /></span>
          <div className="tool-copy"><h3>{item.title}</h3><p>{item.description}</p></div>
          <Icon name="arrow" size={15} className="tool-arrow" />
        </Link>)}
      </div>
    </section>

    <section className="landing-section journey" aria-labelledby="journey-title">
      <div className="landing-section-head">
        <p className="landing-index">03 · 旅程</p>
        <h2 id="journey-title">一张车票的旅程</h2>
        <p>从一段文字到一个链接，只需要三站。</p>
      </div>
      <ol className="journey-rail">
        {journey.map(item => <li key={item.step} className="journey-stop">
          <span className="journey-node"><Icon name={item.icon} size={18} /></span>
          <span className="journey-step">STATION {item.step}</span>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
        </li>)}
      </ol>
    </section>

    <div className="home-lower landing-lower">
      <RecentPastes compact />
      <aside className="template-section">
        <div className="section-title"><h2>不从零开始</h2><Link href="/templates" className="text-link">全部 {templates.length} 个模板 <Icon name="arrow" size={15} /></Link></div>
        <div className="template-list">{templates.filter(t => t.id !== "code").slice(0, 3).map(t => <Link key={t.id} href={`/new?template=${t.id}`} className="template-row"><span className="template-icon"><Icon name={t.icon} size={19} /></span><div><h3>{t.name}</h3><p>{t.description}</p></div><Icon name="plus" size={16} /></Link>)}</div>
        <p className="local-note"><Icon name="shield" size={15} />默认凭链接访问，公开由你决定。</p>
      </aside>
    </div>

    <section className="dev-banner" aria-labelledby="dev-title">
      <div className="dev-banner-copy">
        <p className="landing-index">04 · 开发者</p>
        <h2 id="dev-title">从终端，直接出发</h2>
        <p>无需账号，一个 HTTP 请求就能创建片段。成功返回 <code>201</code>，附带分享、Raw、编辑与删除链接。</p>
        <Link href="/api-docs" className="btn btn-ghost">查看 API 文档 <Icon name="arrow" size={16} /></Link>
      </div>
      <figure className="dev-terminal">
        <figcaption className="dev-terminal-bar"><span className="stage-dots" aria-hidden="true"><i /><i /><i /></span><span>cURL 示例 · POST /api/paste</span></figcaption>
        <pre><code>{apiSample}</code></pre>
        <p className="dev-terminal-result"><span>→ 201 Created</span> url · raw · edit_url · delete_url</p>
      </figure>
    </section>
  </main>;
}
