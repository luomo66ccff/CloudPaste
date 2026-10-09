# CloudPaste - 在线剪贴板 📋

## March7th Paste 4.0

新版 March7th Paste 应用位于 [march7th-paste/](march7th-paste/README.md)，使用 Next.js、React 和 Neon-compatible PostgreSQL。正式站点：[paste.march7th.cn](https://paste.march7th.cn)。

进入 `march7th-paste/` 后，按该目录 README 安装依赖、运行测试及构建。通过 Vercel Git 集成部署时，将项目的 **Root Directory** 设为 `march7th-paste`；环境变量和数据库配置见新版 README。

下面是本仓库保留的 Cloudflare 版本 CloudPaste 文档。

---

<div align="center">
    <p>
    <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
    </p>
    <img width="100" height="100" src="https://img.icons8.com/dusk/100/paste.png" alt="paste"/>
    <h3>基于 Cloudflare 的在线剪贴板和文件分享服务，支持 Markdown 编辑和文件上传</h3>
</div>

<p align="center">
  <a href="#-展示">📸 展示</a> •
  <a href="#-特点">✨ 特点</a> •
  <a href="#-部署教程">🚀 部署教程</a> •
  <a href="#-技术栈">🔧 技术栈</a> •
  <a href="#-开发">💻 开发</a> •
  <a href="#-许可证">📄 许可证</a>
</p>

## 📸 展示

<table align="center">
  <tr>
    <td><img src="./images/image-1.png" width="400"/></td>
    <td><img src="./images/image-2.png" width="400"/></td>
  </tr>
  <tr>
    <td><img src="./images/image-3.png" width="400"/></td>
    <td><img src="./images/image-4.png" width="400"/></td>
  </tr>
  <tr>
    <td><img src="./images/image-5.png" width="400"/></td>
    <td><img src="./images/image-en1.png" width="400"/></td>
  </tr>
</table>

## ✨ 特点

### 📝 Markdown 编辑与分享

- **强大的编辑器**：集成 [Vditor](https://github.com/Vanessa219/vditor)，支持 GitHub 风格的 Markdown、数学公式、流程图、思维导图等
- **安全分享**：内容可设置访问密码保护
- **灵活时效**：支持设置内容过期时间
- **访问控制**：可限制最大查看次数
- **个性化**：自定义分享链接及备注
- **多格式导出**：支持 PDF、Markdown、HTML 导出
- **便捷分享**：一键复制分享链接和生成二维码
- **自动保存**：支持自动保存草稿功能

### 📤 文件上传与管理

- **多存储支持**：兼容多种 S3 存储服务 (Cloudflare R2、Backblaze B2、AWS S3 等)
- **存储配置**：可视化界面配置多个存储空间，灵活切换默认存储源
- **高效上传**：通过预签名 URL 直接上传至 S3 存储
- **实时反馈**：上传进度实时显示
- **自定义限制**：单次上传限制和最大容量限制
- **元数据管理**：文件备注、密码、过期时间、访问限制
- **数据分析**：文件访问统计与趋势分析

### 🛠 便捷的文件/文本操作

- **统一管理**：支持文件/文本创建、删除和属性修改
- **在线预览**：常见文档、图片和媒体文件的在线预览与直链生成
- **分享工具**：生成短链接和二维码，便于跨平台分享
- **批量管理**：文件/文本批量操作与显示

### 🔐 轻量权限管理

#### 管理员权限控制

- **系统管理**：全局系统设置配置
- **内容审核**：所有用户内容的管理
- **存储管理**：S3 存储服务的添加、编辑与删除
- **权限分配**：API 密钥的创建与权限管理
- **数据分析**：完整的统计数据访问

#### API 密钥权限控制

- **文本权限**：创建/编辑/删除文本内容
- **文件权限**：上传/管理/删除文件
- **存储权限**：可选择特定的存储配置
- **读写分离**：可设置只读或读写权限
- **时效控制**：自定义有效期（从小时到月）
- **安全机制**：自动失效与手动撤销功能

### 💫 系统功能

- **适配性强**：响应式设计，适配移动设备和桌面
- **多语言**：中/英文双语界面支持
- **视觉模式**：明亮/暗黑主题切换
- **安全认证**：基于 JWT 的管理员认证系统
- **离线体验**：PWA 支持，可离线使用和安装到桌面

## 🚀 部署教程

### 前期准备

在开始部署前，请确保您已准备以下内容：

- [ ] [Cloudflare](https://dash.cloudflare.com) 账号（必需）
- [ ] 如使用 R2：开通 **Cloudflare R2** 服务并创建存储桶（需绑定支付方式）
- [ ] 如使用 Vercel：注册 [Vercel](https://vercel.com) 账号
- [ ] 其他 S3 存储服务的配置信息：
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_BUCKET_NAME`
  - `S3_ENDPOINT`

<details>
<summary><b>👉 查看完整部署教程</b></summary>

### 📑 目录

- [Action 自动部署](#Action自动部署:)
  - [后端自动部署](#后端自动部署)
  - [前端自动部署](#前端自动部署)
- [手动部署](#手动部署:)
  - [后端手动部署](#后端手动部署)
  - [前端手动部署](#前端手动部署)

---

## Action 自动部署:

使用 GitHub Actions 可以实现代码推送后自动部署应用。

### 配置 GitHub 仓库

1. Fork 或克隆仓库 [https://github.com/ling-drag0n/CloudPaste](https://github.com/ling-drag0n/CloudPaste)
2. 进入您的 GitHub 仓库设置
3. 转到 Settings → Secrets and variables → Actions → New Repository secrets
4. 添加以下 Secrets：

| Secret 名称             | 必需 | 用途                                                  |
| ----------------------- | ---- | ----------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | ✅   | Cloudflare API 令牌（需要 Workers、D1 和 Pages 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | ✅   | Cloudflare 账户 ID                                    |
| `ENCRYPTION_SECRET`     | ❌   | 用于加密敏感数据的密钥（如不提供，将自动生成）        |

#### 获取 Cloudflare API 令牌

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 创建新的 API 令牌
3. 选择"编辑 Cloudflare Workers"模板，并添加 D1 数据库编辑权限

### 后端自动部署

Fork 仓库，填好密钥，然后运行工作流
每当 `backend` 目录中的文件有更改并推送到 `main` 或 `master` 分支时，会自动触发部署。工作流程如下：

1. 检出代码仓库
2. 设置 Node.js 环境
3. 安装依赖
4. 禁用 Wrangler 遥测数据收集
5. **自动创建 D1 数据库**（如果不存在）
6. **用 schema.sql 初始化数据库**（创建表和初始数据）
7. **设置 ENCRYPTION_SECRET 环境变量**（从 GitHub Secrets 获取或自动生成）
8. 自动部署 Worker 到 Cloudflare
9. 建议设置自定义域名代替Cloudflare原本提供的域名(否则国内无法访问)

**<span style="color:red">⚠️ 安全提示：请在系统初始化后立即修改默认管理员密码（用户名: admin, 密码: admin123）。</span>**

### 前端自动部署

#### Cloudflare Pages(推荐)

Fork 仓库，填好密钥，然后运行工作流
每当 `frontend` 目录中的文件有更改并推送到 `main` 或 `master` 分支时，会自动触发部署。部署后需在 Cloudflare Pages 控制面板设置环境变量：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 导航到 Pages → 您的项目（如 "cloudpaste-frontend"）
3. 点击 "Settings" → "Environment variables"
4. 添加环境变量：

   - 名称：`VITE_BACKEND_URL`
   - 值：您的后端 Worker URL（如 `https://cloudpaste-backend.your-username.workers.dev`）建议使用自定义的worker后端域名。

   - **<span style="color:red">一定要完整的填写后端域名,"https://xxxx.com" 格式</span>**

5. 随后再次运行一遍工作流，完成后端域名加载

   ![test-1](./images/test-1.png)

**<span style="color:red">务必严格按照步骤操作，否则会出现后端域名加载失败</span>**

#### Vercel

Vercel 建议使用以下方式部署：

1. Fork 后导入 GitHub 项目
2. 配置部署参数：

```
Framework Preset（框架预设）: Vite
Build Command（构建命令）: npm run build
Output Directory（输出目录）: dist
Install Command（安装命令）: npm install
```
3. 在下面配置环境变量：输入：VITE_BACKEND_URL 和你的后端域名
4. 点击 "Deploy" 按钮进行部署

☝️ **以上二选一即可**

---

## 手动部署:

### 后端手动部署

1. 克隆仓库

```bash
git clone https://github.com/ling-drag0n/CloudPaste.git
cd CloudPaste/backend
```

2. 安装依赖

   ```bash
   npm install
   ```

3. 登录 Cloudflare

   ```bash
   npx wrangler login
   ```

4. 创建 D1 数据库

   ```bash
   npx wrangler d1 create cloudpaste-db
   ```

   记下输出的数据库 ID。

5. 修改 wrangler.toml 配置

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "cloudpaste-db"
   database_id = "您的数据库ID"
   ```

6. 部署 Worker

   ```bash
   npx wrangler deploy
   ```

   记下输出的 URL，这是您的后端 API 地址。

7. 初始化数据库（自动）
   访问您的 Worker URL 触发初始化：

   ```
   https://cloudpaste-backend.your-username.workers.dev
   ```

**<span style="color:red">⚠️ 安全提示：请在系统初始化后立即修改默认管理员密码（用户名: admin, 密码: admin123）。</span>**

### 前端手动部署

#### Cloudflare Pages

1. 准备前端代码

   ```bash
   cd CloudPaste/frontend
   npm install
   ```

2. 配置环境变量
   创建或修改 `.env.production` 文件：

   ```
   VITE_BACKEND_URL=https://cloudpaste-backend.your-username.workers.dev
   VITE_APP_ENV=production
   VITE_ENABLE_DEVTOOLS=false
   ```

3. 构建前端项目

   ```bash
   npm run build
   ```

4. 部署到 Cloudflare Pages

   **方法一**：通过 Wrangler CLI

   ```bash
   npx wrangler pages deploy dist --project-name=cloudpaste-frontend
   ```

   **方法二**：通过 Cloudflare Dashboard

   1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   2. 选择 "Pages"
   3. 点击 "Create a project" → "Direct Upload"
   4. 上传 `dist` 目录内的文件
   5. 设置项目名称（如 "cloudpaste-frontend"）
   6. 点击 "Save and Deploy"

#### Vercel

1. 准备前端代码

   ```bash
   cd CloudPaste/frontend
   npm install
   ```

2. 安装并登录 Vercel CLI

   ```bash
   npm install -g vercel
   vercel login
   ```

3. 配置环境变量，与 Cloudflare Pages 相同
4. 构建并部署

   ```bash
   vercel --prod
   ```

   根据提示配置项目。

</details>

<details>
<summary><b>👉 S3相关跨域配置教程</b></summary>

## R2 API 相关获取及跨域配置

1. 登录 Cloudflare Dashboard
2. 点击 R2 存储，创建一个存储桶。
3. 创建 API 令牌
   ![R2api](./images/R2/R2-api.png)
   ![R2rw](./images/R2/R2-rw.png)

4. 创建后把全部数据都保存好，后续要用
5. 配置跨域规则，点击对应存储桶，点击设置，编辑 CORS 策略，如下所示：

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://根据自己的前端域名来替代"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## B2 API 相关获取及跨域配置

1. 若没有 B2 账号，可以先[注册](https://www.backblaze.com/sign-up/cloud-storage?referrer=getstarted)一个，然后创建一个存储桶。
   ![B2账号注册](./images/B2/B2-1.png)
2. 点击侧边栏的 Application Key，点击 Create Key，然后如图所示。
   ![B2key](./images/B2/B2-2.png)
3. 配置 B2 的跨域，B2 跨域配置比较麻烦，需注意
   ![B2cors](./images/B2/B2-3.png)
4. 可以先尝试一下 1 或 2，去到上传页面看看是否能上传，F12 打开控制台若显示跨域错误，则使用3。要一劳永逸就直接使用3。
   
   ![B21](./images/B2/B2-4.png) 

关于 3 的配置由于面板无法配置，只能手动配置，需[下载 B2 CLI](https://www.backblaze.com/docs/cloud-storage-command-line-tools)对应工具。
下载后，在对应下载目录 cmd，在命令行输入以下命令：

```txt
b2.exe account authorize   //进行账号登录，根据提示填入之前的 keyID 和 applicationKey
b2.exe bucket get <bucketName> //你可以执行获取bucket信息，<bucketName>换成桶名字
```

这里由于我是 windows 配置
所以在对应 cli 的 exe 文件夹中 cmd 输入，python 的 cli 也同理：

```cmd
b2.exe bucket update <bucketName> allPrivate --cors-rules "[{\"corsRuleName\":\"CloudPaste\",\"allowedOrigins\":[\"*\"],\"allowedHeaders\":[\"*\"],\"allowedOperations\":[\"b2_upload_file\",\"b2_download_file_by_name\",\"b2_download_file_by_id\",\"s3_head\",\"s3_get\",\"s3_put\",\"s3_post\",\"s3_delete\"],\"exposeHeaders\":[\"Etag\",\"content-length\",\"content-type\",\"x-bz-content-sha1\"],\"maxAgeSeconds\":3600}]"
```

其中<bucketName>换成你的存储桶名字，关于允许跨域的域名 allowedOrigins 可以根据个人配置，这里是允许所有。 

5. 已完成跨域配置

## 更多 S3 相关配置待续......

</details>

## 🔧 技术栈

### 前端

- **框架**: Vue.js 3 + Vite
- **样式**: TailwindCSS
- **编辑器**: Vditor
- **国际化**: Vue-i18n
- **图表**: Chart.js + Vue-chartjs

### 后端

- **运行时**: Cloudflare Workers
- **框架**: Hono
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: 多 S3 兼容服务 (支持 R2, B2, AWS S3)
- **认证**: JWT 令牌 + API 密钥

## 💻 开发

### API 文档

[API 文档](Api-doc.md)

### 本地开发设置

1. **克隆项目仓库**

   ```bash
   git clone https://github.com/ling-drag0n/cloudpaste.git
   cd cloudpaste
   ```

2. **后端设置**

   ```bash
   cd backend
   npm install
   # 初始化 D1 数据库
   wrangler d1 create cloudpaste-db
   wrangler d1 execute cloudpaste-db --file=./schema.sql
   ```

3. **前端设置**

   ```bash
   cd frontend
   npm install
   ```

4. **配置环境变量**

   - 在 `backend` 目录下，创建 `wrangler.toml` 文件设置开发环境变量
   - 在 `frontend` 目录下，配置 `.env.development` 文件设置前端环境变量

5. **启动开发服务器**

   ```bash
   # 后端
   cd backend
   npm run dev

   # 前端 (另一个终端)
   cd frontend
   npm run dev
   ```

### 项目结构

```
CloudPaste/
├── frontend/                # 前端 Vue.js 应用
│   ├── src/                 # 源代码
│   │   ├── components/      # Vue 组件
│   │   ├── api/             # API 客户端和服务
│   │   ├── i18n/            # 国际化资源文件
│   │   ├── utils/           # 工具函数
│   │   └── assets/          # 静态资源
│   └── ...
└── backend/                 # Cloudflare Workers 后端
    ├── worker.js            # 主要 Worker 文件
    ├── schema.sql           # D1 数据库模式
    └── ...
```

## 📄 许可证

Apache License 2.0

本项目使用 Apache License 2.0 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ling-drag0n/CloudPaste&type=Date)](https://star-history.com/#ling-drag0n/CloudPaste&Date)

**如果觉得项目不错希望您能给个免费的star✨✨，非常感谢！**
