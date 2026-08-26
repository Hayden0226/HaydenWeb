# Hayden Web

Hayden 的个人网站，基于 [Astro](https://astro.build/) + Tailwind CSS 构建，部署在 GitHub Pages。

- 线上地址：https://i.haydenweb.com
- GitHub：https://github.com/Hayden0226
- 摄影站：https://visuals.haydenweb.com

## 页面

- **Home** — 个人介绍与精选项目
- **Projects** — 我的 GitHub 项目（/work、/projects）
- **Media**
  - **Books** — Goodreads 书架：已读 / 在读 / 想读
  - **Music** — Last.fm 最近播放、Top 艺人 / 歌曲 / 专辑 / 流派
  - **Movies** — Letterboxd 观影记录（待配置）
  - **TV** — TMDB 追剧清单（待配置）
  - **Anime** — MyAnimeList 番剧记录（待配置）
- **Games** — Steam / PSN / Nintendo 游戏数据（待配置）
- **Photography** — 跳转到 [visuals.haydenweb.com](https://visuals.haydenweb.com/)
- **Toodles** — 实用小工具合集（占位页）

## 数据源集成

| 页面 | 数据源 | 状态 |
| --- | --- | --- |
| Books | Goodreads 公开 RSS | ✅ 已启用 |
| Music | Last.fm API + iTunes Search 封面 | ✅ 已启用 |
| Movies | Letterboxd（Puppeteer 爬取） | ⏳ 待配置 |
| TV | TMDB API | ⏳ 待配置 |
| Anime | MyAnimeList API | ⏳ 待配置 |
| Games | Steam / PSN / Nintendo / IGDB | ⏳ 待配置 |

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:4321

> 国内网络下构建时抓取境外数据源可能超时，可让 Node 走本地代理（设置 NODE_USE_ENV_PROXY=1 与 HTTPS_PROXY，Node 24+）。

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 用途 |
| --- | --- |
| `LASTFM_API_KEY` | Last.fm API Key（Music 页） |
| `LASTFM_USERNAME` | Last.fm 用户名（hayden_0325） |
| `GOODREADS_USER_ID` | Goodreads 用户 ID（Books 页） |
| `LETTERBOXD_USERNAME` | Letterboxd 用户名（Movies 页） |
| `TMDB_ACCESS_TOKEN` | TMDB API Token（TV 页） |
| `MAL_CLIENT_ID` / `MAL_ACCESS_TOKEN` | MyAnimeList API（Anime 页） |
| `STEAM_API_KEY` / `STEAM_ID` | Steam Web API（Games 页） |

## 部署（GitHub Pages）

仓库内置 `.github/workflows/deploy.yml`：

1. 仓库 `Settings → Pages → Source` 选择 **GitHub Actions**
2. 推送到 `main` 自动构建部署
3. 工作流每 6 小时重新构建一次，保持数据新鲜
4. 环境变量由工作流写入 `.env`：`LASTFM_*` 从 Actions Secrets 读取，`GOODREADS_USER_ID` 内置默认值

> 自定义域名：`public/CNAME` 指向 `i.haydenweb.com`，DNS 已配置 CNAME 记录 `i` → `Hayden0226.github.io`。

## 上游项目

本站在 [Atyansh/atyansh-website](https://github.com/Atyansh/atyansh-website) 基础上二次开发改造。
