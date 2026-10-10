# AGENTS.md

公众号文章导航站：首页从 D1 读取文章列表，卡片点击跳回微信原文。

## 技术栈

- Astro 5，SSR 模式（`@astrojs/cloudflare` 适配器），部署在 Cloudflare Workers
- 数据库 Cloudflare D1，binding 名 `DB`（见 wrangler.json）
- 无前端框架、无 UI 库，页面就是 .astro + 原生 `<dialog>`/`<script>`

## 关键约定

- 需要 env 的文件用 `import { env } from 'cloudflare:workers'`；`worker-configuration.d.ts` 里的 `Env` 缺 `DB` 属性，用整体 cast：`(env as unknown as XxxEnv).DB`（参考 src/pages/api/click.ts）
- 所有 SSR 页面和 API 路由必须 `export const prerender = false;`
- 代码风格：tab 缩进、**单引号**（正则/模板字符串内除外）、UI 文案中文
- secrets 走 `wrangler secret put`，不进代码（现有：`PUBLISH_TOKEN`，发布接口口令）

## 数据库

articles 表（D1 `article-hub-db`）：

```sql
id INTEGER PK AUTOINCREMENT, title TEXT NOT NULL, summary TEXT DEFAULT '',
source_url TEXT NOT NULL UNIQUE, cover_url TEXT DEFAULT '',
category TEXT DEFAULT '未分类', tags TEXT DEFAULT '', published_at TEXT,
click_count INTEGER DEFAULT 0, featured_score INTEGER DEFAULT 0,
status TEXT DEFAULT 'published', created_at TEXT DEFAULT CURRENT_TIMESTAMP
```

## 路由

- `/` — SSR 首页，查 articles 按 `featured_score DESC, click_count DESC, created_at DESC` 取 24 条
- `/api/publish` — POST `{ url }`，头 `x-publish-token`；抓微信页面解析 og:title/description/image + create_timestamp（+8h 转日期）后入库
- `/api/click?id=N` — `UPDATE ... SET click_count = click_count + 1 ... RETURNING source_url` 后 302 跳原文

`src/pages/blog/`、`src/content/blog/`、`about.astro`、`rss.xml.js` 是脚手架遗留，首页不使用。

## 命令

```bash
npm run dev       # 本地开发 localhost:4321
npm run build     # 构建到 dist/
npm run deploy    # wrangler deploy（先 build）
npx tsc --noEmit  # 类型检查（tsc 不检查 .astro 文件）
npx wrangler d1 execute article-hub-db --remote --command "..."  # 线上 D1 查询
```
