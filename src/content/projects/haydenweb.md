---
title: 'HaydenWeb'
description: '个人网站本体 — 基于 Astro + React + Tailwind CSS 构建，集成 Goodreads / Last.fm / Letterboxd / TMDB / AniList / Steam 等数据源，内置 Toodles 媒体转换工具，由 GitHub Actions 定时构建并部署到 i.haydenweb.com。'
technologies: ['Astro', 'React', 'TypeScript', 'Tailwind CSS']
featured: true
startDate: 2026-08-26
links:
  github: 'https://github.com/Hayden0226/HaydenWeb'
  website: 'https://i.haydenweb.com'
---

# HaydenWeb

Hayden 的个人网站，展示个人项目、书影音记录、游戏收藏与妙妙工具（Toodles）。

## Features

- **媒体记录**：Books（Goodreads）、Music（Last.fm）、Movies（Letterboxd）、TV（TMDB）、Anime（AniList），多为总览 / 收藏 / 待看三视图
- **Steam 游戏库**：总览 / 收藏夹 / 最近三视图，点击卡片查看成就（我的 / 全球），隐藏成就点击揭晓
- **Toodles**：浏览器内媒体转换工具，FFmpeg.wasm 驱动，音频 / 视频 / 图片共 23 种转换，文件不出本机
- **自动更新**：GitHub Actions 每 6 小时重建一次，数据自动保持新鲜

## Live Site

<https://i.haydenweb.com>