// Isolated local preview: never reads or connects to the production database.
// Runs the real Next production server and its Neon/Drizzle SQL through PGlite.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(projectRoot);
const port = Number(process.env.PASTE_PREVIEW_PORT || 3117);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid PASTE_PREVIEW_PORT");
const localConnection =
  "postgresql://preview:preview@db.local-only.invalid/paste";
process.env.DATABASE_URL = localConnection;
process.env.EDIT_TOKEN_SECRET = randomBytes(32).toString("hex");
process.env.CRON_SECRET = randomBytes(32).toString("hex");
process.env.ADMIN_TOKEN = randomBytes(32).toString("hex");
process.env.NEXT_PUBLIC_SITE_URL = `http://127.0.0.1:${port}`;
process.env.NODE_ENV = "production";

const postgres = new PGlite();
const ready = (async () => {
  for (const filename of fs
    .readdirSync(path.join(projectRoot, "drizzle"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    await postgres.exec(
      fs.readFileSync(path.join(projectRoot, "drizzle", filename), "utf8"),
    );
  const examples = [
    [
      "demo-note",
      "留给未来的一封短笺",
      "# 留给未来的一封短笺\n\n每个好想法，都值得被记下来。\n\n- [x] 写下一点灵感\n- [ ] 让它变成一个小小的开始\n\n> 不必等到完美，现在就开始。",
      "markdown",
      null,
    ],
    [
      "demo-code",
      "一个小小的开始.ts",
      'type Idea = { title: string; shared: boolean };\n\nconst idea: Idea = {\n  title: "Make something wonderful",\n  shared: true,\n};\n\nconsole.log(idea.title);',
      "code",
      "typescript",
    ],
    [
      "demo-math",
      "公式与一点点好奇心",
      "# 公式与一点点好奇心\n\n行内公式：$E=mc^2$。\n\n$$\ne^{i\\pi}+1=0\n$$\n\n把一个复杂问题，拆成可以慢慢想清楚的小问题。",
      "markdown",
      null,
    ],
  ];
  for (let index = 1; index <= 12; index++)
    examples.push([
      `demo-workspace-${index}`,
      `示例资料 ${String(index).padStart(2, "0")}`,
      `# 本地验收资料 ${index}\n\n用于检查分页与类型筛选，仅存在于临时本地数据库。`,
      index % 3 === 0 ? "plain" : "markdown",
      null,
    ]);
  for (const example of examples)
    await postgres.query(
      "INSERT INTO pastes (slug,title,content,content_type,language,visibility,edit_token_hash) VALUES ($1,$2,$3,$4,$5,'public',$6)",
      [...example, randomBytes(32).toString("hex")],
    );
  console.log(
    `Local preview database ready (ephemeral PostgreSQL, ${examples.length} examples). No production connection.`,
  );
})();

function rawText(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
async function query(payload) {
  const result = await postgres.query(payload.query, payload.params ?? [], {
    rowMode: "array",
  });
  return {
    fields: result.fields,
    rows: result.rows.map((row) => row.map(rawText)),
    rowCount: result.rowCount ?? result.affectedRows,
    command: result.command,
  };
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (resource, options) => {
  const url = new URL(
    typeof resource === "string" || resource instanceof URL
      ? resource
      : resource.url,
  );
  const headers = new Headers(
    options?.headers ??
      (resource instanceof Request ? resource.headers : undefined),
  );
  const connection = headers.get("Neon-Connection-String");
  if (
    connection &&
    (connection !== localConnection ||
      !url.hostname.endsWith("local-only.invalid"))
  )
    throw new Error("Local preview rejects external database requests");
  if (!url.hostname.endsWith("local-only.invalid"))
    return originalFetch(resource, options);
  try {
    if (connection !== localConnection)
      throw new Error(
        "Local preview rejects unexpected database configuration",
      );
    await ready;
    const payload = JSON.parse(options.body);
    // Production currently uses single queries. Do not simulate batch transactions.
    if (payload.queries)
      throw new Error(
        "Batch transactions are not supported by this preview adapter",
      );
    const data = await query(payload);
    return Response.json(data);
  } catch (error) {
    console.error("Local preview SQL adapter:", error.message);
    return Response.json(
      { message: error.message, code: error.code },
      { status: 400 },
    );
  }
};

if (!fs.existsSync(path.join(projectRoot, ".next", "BUILD_ID")))
  throw new Error("Run npm run build before npm run preview:local.");
ready
  .then(async () => {
    process.argv = [
      process.execPath,
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ];
    await import("next/dist/bin/next");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
