<div align="center">

# RoleRover

**面向 Windows 的本地优先 AI 简历工作台**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d4)](./desktop)

[English](./README.md)

</div>

RoleRover 是一款本地优先的 AI 简历桌面应用，帮助你在本机完成简历编写、优化、定制与导出。下载安装后即可开始使用，不需要先搭建服务端环境；你可以在桌面端直接整理内容、调用 AI 辅助生成，并导出更完整、更美观的简历版本。

## 功能亮点

- 拖拽式简历编辑器，支持行内编辑与自动保存
- 50 套简历模板，支持主题定制与导出
- 支持 AI 生成简历、简历解析、JD 匹配、求职信生成、翻译和写作优化
- 支持中英文双语界面
- 提供原生桌面体验，支持本地导入导出、窗口状态持久化和应用内更新
- AI provider 配置与密钥由用户在本地自行掌控

## 截图

| 模板画廊 | 简历编辑器 |
|:---:|:---:|
| ![模板画廊](images/template-list.png) | ![简历编辑器](images/resume-edit.png) |

| AI 填充简历 | 简历分享页 |
|:---:|:---:|
| ![AI 填充简历](images/AI%20填充简历.gif) | ![简历分享页](images/简历分享页.png) |

## 下载使用

1. 打开 [GitHub Releases](https://github.com/lingshichat/RoleRover/releases)。
2. 下载最新的 Windows 安装包，通常是 `.exe` 或 `.msi`。
3. 安装完成后像普通桌面应用一样启动即可。

当前平台支持：

- 当前正式支持 Windows
- 下一步计划支持 macOS

## 为什么选择桌面版

- 主流程不依赖额外服务端部署
- 简历编辑、导入导出和更新检查都可以直接在桌面应用里完成
- 本地配置方式更适合自行管理 AI provider 和密钥
- 更适合单人持续打磨简历的使用场景，减少浏览器环境切换的干扰

## 从源码运行

如果你想在本地从源码启动 RoleRover：

### 环境要求

- Node.js 20+
- pnpm 9+
- 如果要运行 `pnpm run dev:tauri` 或构建 Windows 安装包，还需要 Rust stable 和 Tauri 2 对应的 Windows 原生工具链

### 安装

```bash
git clone https://github.com/lingshichat/RoleRover.git
cd RoleRover
pnpm install
```

### 启动

```bash
pnpm run dev:tauri
```

这会同时启动桌面渲染层和原生 Tauri 壳层。

## 常见问题

<details>
<summary><b>AI provider 配置和密钥存在哪里？</b></summary>

在正式支持的桌面运行时里，provider 配置保存在本地客户端工作区，密钥优先使用操作系统密钥存储能力。

</details>

<details>
<summary><b>为什么有些文件或截图里还会出现 JadeAI？</b></summary>

RoleRover 是基于 [JadeAI](https://github.com/twwch/JadeAI) 持续维护的衍生项目。随着产品继续往桌面端收敛，一部分历史资源、共享代码或归属说明里仍会保留旧名称。

</details>

## 协议与归属

RoleRover 继续遵循 [Apache License 2.0](./LICENSE)。

本仓库基于 JadeAI 衍生而来。若你继续分发或修改本项目，请保留协议文本、上游归属说明以及 [NOTICE](./NOTICE) 中的衍生项目声明。
