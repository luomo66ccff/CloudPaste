import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
export const metadata: Metadata = { title: "开发者 API" };
const example = {
  title: "Hello, March7th",
  type: "markdown",
  visibility: "unlisted",
  content: "# Hello\n\n把灵感分享出去。",
  expiresIn: "7d",
  burnAfterRead: false,
};
const body = JSON.stringify(example, null, 2);
const powershell =
  "$body = @{ title = 'Hello, March7th'; type = 'markdown'; content = '# Hello'; expiresIn = '7d' } | ConvertTo-Json\nInvoke-RestMethod -Method Post -Uri 'https://paste.march7th.cn/api/paste' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))";
const curl = `curl -X POST https://paste.march7th.cn/api/paste \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`;
const response = JSON.stringify(
  {
    url: "https://paste.march7th.cn/p/example",
    raw: "https://paste.march7th.cn/raw/example",
    raw_txt: "https://paste.march7th.cn/raw/example.txt",
    raw_md: "https://paste.march7th.cn/raw/example.md",
    edit_url: "https://paste.march7th.cn/edit/example?key=YOUR_EDIT_TOKEN",
    delete_url:
      "https://paste.march7th.cn/delete/example?key=YOUR_DELETE_TOKEN",
  },
  null,
  2,
);
function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="docs-code">
      <div className="docs-code-header">
        <span>{label}</span>
        <CopyButton label="复制" value={value} />
      </div>
      <pre>{value}</pre>
    </div>
  );
}
export default function ApiDocsPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">BUILT FOR YOUR WORKFLOW</p>
          <h1>
            从终端，到分享<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            用一个简单的 HTTP 请求，把日志、代码和笔记接入你的工作流。
          </p>
        </div>
        <span className="badge">
          <Icon name="terminal" size={14} />
          REST API
        </span>
      </div>
      <div className="docs-layout">
        <nav className="docs-sidebar" aria-label="文档目录">
          <a href="#quickstart">快速开始</a>
          <a href="#fields">请求字段</a>
          <a href="#response">响应与管理</a>
          <a href="#read">读取与更新</a>
          <a href="#errors">错误与限制</a>
        </nav>
        <div className="docs-content">
          <section className="docs-section" id="quickstart">
            <h2>快速开始</h2>
            <p>
              无需账号即可创建片段。接口返回分享、Raw、编辑和删除链接，默认仅凭链接访问。
            </p>
            <div className="endpoint-line">
              <span className="method">POST</span>
              <code>https://paste.march7th.cn/api/paste</code>
            </div>
            <p>
              也支持 <code>/api/pastes</code>；<code>type</code> 与{" "}
              <code>contentType</code> 字段兼容。
            </p>
            <CodeBlock label="cURL · macOS / Linux" value={curl} />
            <CodeBlock label="PowerShell 7" value={powershell} />
            <CodeBlock label="请求 JSON" value={body} />
          </section>
          <section className="docs-section" id="fields">
            <h2>请求字段</h2>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>字段</th>
                    <th>类型 / 默认值</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "content",
                      "string · 必填",
                      "UTF-8 编码最多 512 KiB（524,288 字节）",
                    ],
                    ["title", "string · Untitled", "标题最多 200 个字符"],
                    [
                      "type / contentType",
                      "markdown",
                      "markdown / code / plain",
                    ],
                    [
                      "language",
                      "string · 可选",
                      "代码语言，例如 typescript、python、json",
                    ],
                    [
                      "visibility",
                      "unlisted",
                      "unlisted 仅凭链接访问；public 进入公开广场",
                    ],
                    ["expiresIn", "never", "never / 1d / 7d / 30d"],
                    [
                      "password",
                      "string · 可选",
                      "访问密码，最多 200 字符，不会放入分享 URL",
                    ],
                    [
                      "burnAfterRead",
                      "boolean · false",
                      "首次成功读取正文后链接失效，包含页面、JSON 和 Raw",
                    ],
                  ].map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (
                        <td key={i}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="docs-section" id="response">
            <h2>响应与管理</h2>
            <p>
              成功创建返回 HTTP
              201。编辑和删除凭证仅在创建时返回，请单独保存；与别人分享时只发送{" "}
              <code>url</code>。
            </p>
            <CodeBlock label="响应示意 · 凭证使用占位符" value={response} />
            <div className="notice notice-info">
              <Icon name="lock" size={17} />
              <div>
                <strong>分享内容与管理凭证，分开保存。</strong>
                <p>
                  编辑凭证可编辑或删除；删除凭证只能删除。服务端仅保存凭证哈希，遗失后无法找回。
                </p>
              </div>
            </div>
          </section>
          <section className="docs-section" id="read">
            <h2>读取与更新</h2>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>方法与路径</th>
                    <th>行为</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>GET /api/pastes/:slug</td>
                    <td>
                      读取 JSON；密码文档需要解锁
                      Cookie；成功读取会消费阅后即焚。
                    </td>
                  </tr>
                  <tr>
                    <td>GET /raw/:slug[.txt|.md]</td>
                    <td>UTF-8 纯文本，同样执行密码校验与阅后即焚。</td>
                  </tr>
                  <tr>
                    <td>
                      HEAD /raw/:slug
                      <br />
                      HEAD /api/pastes/:slug
                    </td>
                    <td>
                      只检查状态和访问权限，不读取正文，也不消耗阅读次数。
                    </td>
                  </tr>
                  <tr>
                    <td>POST /api/pastes/:slug/unlock</td>
                    <td>
                      JSON 传入 password；成功后设置访问 Cookie，可配合 curl -c
                      / -b 使用。
                    </td>
                  </tr>
                  <tr>
                    <td>PUT /api/pastes/:slug</td>
                    <td>
                      携带 x-edit-token 和完整的标题/正文等字段；省略 expiresIn
                      保留原有效期，空密码保留现有密码。
                    </td>
                  </tr>
                  <tr>
                    <td>DELETE /api/pastes/:slug</td>
                    <td>携带 x-delete-token 或 x-edit-token。</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              为兼容旧链接，编辑/删除请求也接受 <code>?key=...</code>
              。脚本推荐使用请求头传递管理凭证。
            </p>
          </section>
          <section className="docs-section" id="errors">
            <h2>错误与限制</h2>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>HTTP 状态</th>
                    <th>含义</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["400", "请求不合法，检查 JSON、类型和字节数"],
                    ["401 / 403", "需要访问密码，或管理凭证不正确"],
                    ["404", "片段不存在、已过期或不可访问"],
                    ["410", "阅后即焚片段已被读取"],
                    ["429", "请求过于频繁，请稍后重试"],
                    ["503", "服务配置暂不可用"],
                  ].map((row) => (
                    <tr key={row[0]}>
                      <td>{row[0]}</td>
                      <td>{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              创建限制：每个客户端 IP 每分钟 5 次、每小时 50 次、每天 200
              次。密码解锁每分钟 10 次、每小时 60 次，按客户端 IP
              跨文档合计。受密码保护或阅后即焚的内容不会出现在公开广场。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
