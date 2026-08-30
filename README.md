# Hayden Web

Hayden 的个人网站，基于 [Astro](https://astro.build/) + React + Tailwind CSS 构建，由 GitHub Actions 定时构建并部署到 GitHub Pages。

- 线上地址：https://i.haydenweb.com
- 源码仓库：https://github.com/Hayden0226/HaydenWeb
- 摄影站：https://visuals.haydenweb.com

## 页面

| 页面 | 内容 |
| --- | --- |
| **Home** | 个人介绍与精选项目，Photography 置顶 |
| **Projects** | 个人项目展示（`/work`、`/projects`） |
| **Books** | Goodreads 书架：总览 / 收藏 / 待读 |
| **Music** | Last.fm 最近播放、Top 艺人 / 歌曲 / 专辑 / 流派 |
| **Movies** | Letterboxd 观影记录：总览 / 收藏 / 待看，含评分 |
| **TV** | TMDB 追剧：总览 / 收藏 / 待看 |
| **Anime** | AniList 番剧：总览 / 收藏 / 待看 |
| **Games** | Steam 游戏库：总览 / 收藏夹 / 最近，点击卡片查看成就 |
| **Photography** | 跳转 [visuals.haydenweb.com](https://visuals.haydenweb.com) |
| **Toodles** | 浏览器内媒体转换工具（音频 / 视频 / 图片） |

## 亮点

- **Games 三视图 + 成就系统**：Steam 库按「总览（全部）/ 收藏夹 / 最近」分页展示；点击任意卡片展开成就面板，支持「我的成就 / 全球成就」切换与隐藏成就点击揭晓。收藏夹数据从本机 Steam 云配置导出（`src/data/steam-favorites.ts`），个别缺封面的游戏通过 `src/data/steam-cover-overrides.ts` 兜底。
- **Toodles 纯前端转换**：音频 / 视频 / 图片共 23 种转换，由 FFmpeg.wasm 驱动，全程在浏览器本地完成、不上传文件，转换结果保留原文件名。
- **定时自动更新**：GitHub Actions 每 6 小时重建一次，音乐、书影音、游戏等数据自动保持新鲜。

## 最近更新

<details open>
<summary><strong>2026-08-30</strong> · 头像本地化与 README 重写</summary>

- **头像本地化**：Home 页头像、SEO 与 OG 分享图不再依赖 GitHub 头像外链，改用仓库内置的 `public/images/avatar.png`。
- **README 全面重写**：重新组织简介、页面、亮点、数据源、环境变量、部署与维护备忘等章节，补齐运行与部署说明。

</details>

<details>
<summary><strong>2026-08-30</strong> · Games 三视图与成就面板完善</summary>

- **Steam 库三视图**：Games 新增「总览 / 收藏夹 / 最近」三个 Tab，收藏夹从本机 Steam 云配置导出（`src/data/steam-favorites.ts`），默认按时长排序。
- **成就面板统一**：三个 Tab 共用同一个成就面板，点击任意卡片在页面下方展开，避免重复弹出。
- **隐藏成就与全球统计**：隐藏成就点击揭晓并显示全球完成百分比，描述缺失时给出提示。
- **封面兜底**：修复《Game of Thrones Kingsroad》与《Real Pool 3D - Poolians》封面缺失，新增 `src/data/steam-cover-overrides.ts` 映射。
- **数字对齐**：全站数字改用 lining numerals，修复数字末尾上下错位。

</details>

<details>
<summary><strong>2026-08-28</strong> · Steam 成就面板与游戏卡片视觉</summary>

- **成就面板上线**：点击游戏卡片展开成就面板，支持「我的成就 / 全球成就」切换；面板背景与成就卡片视觉逐步统一（半透明 → 实色、统一卡片高度、悬停光晕）。
- **游戏卡片视觉**：封面按 Steam 竖版比例完整展示，悬停放大并带封面主色光晕；轮播支持鼠标滚轮横向滚动。

</details>

<details>
<summary><strong>2026-08-27</strong> · Toodles 转换引擎本地化</summary>

- **FFmpeg 本地托管**：FFmpeg core 改用 ESM 构建并托管在仓库内（`public/ffmpeg/`），修复从 CDN 加载失败导致的转换报错。

</details>

## 数据源

| 页面 | 数据源 | 状态 |
| --- | --- | --- |
| Books | Goodreads 公开 RSS | ✅ 已启用 |
| Music | Last.fm API + iTunes Search 封面 | ✅ 已启用 |
| Movies | Letterboxd（Puppeteer 爬取） | ✅ 已启用 |
| TV | TMDB API | ✅ 已启用 |
| Anime | AniList 公开 API | ✅ 已启用 |
| Games | Steam Web API | ✅ 已启用 |
| Games 封面 | IGDB API（可选） | ⏳ 未配置（默认用 Steam 官方图） |

## 技术栈

- **框架**：Astro 5 + React 19 + TypeScript
- **样式**：Tailwind CSS 4 + Framer Motion
- **工具**：FFmpeg.wasm（Toodles）、Puppeteer（Letterboxd 爬取）、Sharp（封面取色）
- **部署**：GitHub Actions + GitHub Pages

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:4321

> 国内网络下构建时抓取境外数据源可能超时，可让 Node 走本地代理（设置 `NODE_USE_ENV_PROXY=1` 与 `HTTPS_PROXY`，Node 24+）。

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 用途 |
| --- | --- |
| `LASTFM_API_KEY` | Last.fm API Key（Music 页） |
| `LASTFM_USERNAME` | Last.fm 用户名（hayden_0325） |
| `GOODREADS_USER_ID` | Goodreads 用户 ID（Books 页） |
| `LETTERBOXD_USERNAME` | Letterboxd 用户名（Movies 页） |
| `TMDB_ACCESS_TOKEN` | TMDB v4 API Token（TV 页） |
| `TMDB_ACCOUNT_OBJECT_ID` | TMDB v4 账户 Object ID（可选，默认从 token 自动解码） |
| `TMDB_TV_LIST_ID` | TMDB 自定义列表 ID（可选，展示没打分的剧） |
| `ANILIST_USERNAME` | AniList 用户名（Anime 页） |
| `STEAM_API_KEY` / `STEAM_ID` | Steam Web API（Games 页） |
| `IGDB_CLIENT_ID` / `IGDB_ACCESS_TOKEN` | IGDB 封面（Games 页，可选） |

## 部署（GitHub Pages）

仓库内置 `.github/workflows/deploy.yml`：

1. 仓库 `Settings → Pages → Source` 选择 **GitHub Actions**
2. 推送到 `main` 自动构建部署
3. 工作流每 6 小时重新构建一次，保持数据新鲜
4. 环境变量由工作流写入 `.env`：`LASTFM_*` / `TMDB_*` / `STEAM_*` / `IGDB_*` 从 Actions Secrets 读取，`GOODREADS_USER_ID` / `LETTERBOXD_USERNAME` / `ANILIST_USERNAME` 内置默认值

> 自定义域名：`public/CNAME` 指向 `i.haydenweb.com`，DNS 已配置 CNAME 记录 `i` → `Hayden0226.github.io`。

## 维护备忘

- **Steam 收藏夹**：在 Steam 客户端里改了收藏后，从本机云配置（`userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json`）重新导出，更新 `src/data/steam-favorites.ts`。
- **Steam 封面兜底**：新游戏如果在 CDN 上没有竖版图，往 `src/data/steam-cover-overrides.ts` 加一行映射即可。

## 上游项目

本站在 [Atyansh/atyansh-website](https://github.com/Atyansh/atyansh-website) 基础上二次开发改造。
