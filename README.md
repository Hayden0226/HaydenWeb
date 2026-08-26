# Hayden Web

Hayden 的个人网站，基于 [Astro](https://astro.build/) + Tailwind CSS 构建，部署在 GitHub Pages。

- 线上地址：https://i.haydenweb.com
- GitHub：https://github.com/Hayden0226

## 页面

- **Home** — 个人介绍与精选项目
- **Projects** — 我的 GitHub 项目（/work、/projects）
- **Photography** — 跳转到 [visuals.haydenweb.com](https://visuals.haydenweb.com/)
- **Music** — 基于 Last.fm 的最近播放、Top 艺人/歌曲/专辑/流派
- **Games** — Steam 游戏数据
- **Toodles** — 妙妙工具占位页

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:4321

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 用途 |
| --- | --- |
| `LASTFM_API_KEY` | Last.fm API Key（Music 页） |
| `LASTFM_USERNAME` | Last.fm 用户名（hayden_0325） |
| `STEAM_API_KEY` | Steam Web API Key（Games 页） |
| `STEAM_ID` | Steam 用户 ID（Games 页） |

## 部署（GitHub Pages）

仓库内置 `.github/workflows/deploy.yml`：

1. 在仓库 `Settings → Secrets and variables → Actions` 添加 `LASTFM_API_KEY`、`LASTFM_USERNAME`
2. `Settings → Pages → Source` 选择 **GitHub Actions**
3. 推送到 `main` 自动构建部署；工作流每 6 小时重新构建一次，保持音乐数据新鲜

> 自定义域名：`public/CNAME` 已指向 `i.haydenweb.com`。需要在 DNS 服务商添加 CNAME 记录：`i` → `Hayden0226.github.io`，并在仓库 `Settings → Pages` 的 Custom domain 填 `i.haydenweb.com`。

## 音乐数据

Music 页使用免费的 [Last.fm API](https://www.last.fm/api/)，构建时抓取数据并缓存到 `.cache/`，封面通过 iTunes Search API 解析。无需 OAuth，Last.fm 绑定 Spotify 后即可自动同步收听记录。

## 上游项目

本站在 [Atyansh/atyansh-website](https://github.com/Atyansh/atyansh-website) 基础上二次开发改造。
