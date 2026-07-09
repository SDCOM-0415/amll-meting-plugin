# AMLL Meting 音乐插件 (amll-meting-plugin)

为 [AMLL Player](https://github.com/amll-dev/amll-player) 提供基于 Meting API 的多平台音乐接入与歌词解析支持。

## ✨ 核心特性

- **🎵 多平台音源支持**：无缝接入网易云音乐、QQ音乐、酷狗、酷我、Bilibili 及百度音乐。
- **📝 高级歌词解析**：
  - 支持标准 LRC 歌词解析。
  - 完美支持网易云 **YRC (逐字歌词)** 与 QQ音乐 QRC 格式。
  - 内置**智能降级机制**：当标为 YRC 的歌词缺失逐字时间轴时，自动平滑降级为普通行级歌词，保证渲染不崩溃。
- **🌐 原生双语歌词支持**：自动拆分并解析来自 Meting API 的 `[translation]` 标签，与主歌词通过时间轴智能匹配，提供完美的双语展示。
- **⚙️ 自定义 API 节点**：内置多个公共 Meting API 节点（如 `meting.sdcom.top` 等），并支持填入**自定义 API 地址**，满足自建后端的进阶需求。
- **🛡️ 缓存绕过与自愈机制**：
  - 采用动态时间戳/随机数机制（`r=...`）绕过 CDN 与浏览器缓存，保证拉取的歌单与歌词永远是最新的。
  - 针对早期遗留数据库的合并歌词，提供播放时无感知的 **Auto-healing（自动修正）** 能力，静默更新数据库，修复弹窗编辑器的显示错误。

## 🚀 安装与使用

1. 在[Release](https://github.com/SDCOM-0415/amll-meting-plugin/releases)页面获取插件构建产物 `amll-meting-plugin.js`。
2. 打开 AMLL Player，进入 **设置** -> **扩展程序管理**。
3. 加载该 `.js` 插件文件。
4. 在侧边栏出现的 **“Meting 音乐插件”** 面板中，即可进行操作：
   - **导入歌单**：输入源平台与歌单 ID 即可将整个歌单拉取至播放器。
   - **添加单曲**：向指定的已导入歌单中独立追加歌曲。
   - **刷新歌单**：点击刷新按钮即可与云端重新同步歌单内的曲目变动。

## 🛠️ 开发与构建

本项目使用 Vite 与 React (仅使用 React.createElement 规避宿主 JSX 运行时环境限制) 构建。

### 环境要求
- Node.js (建议 v18 或以上)
- npm / pnpm / yarn

### 开发指令

```bash
# 1. 安装依赖
npm install

# 2. 执行构建
npm run build
```

构建完成后，产物会输出至 `dist/amll-meting-plugin.js`，且已自动注入 AMLL 扩展包所需的 `// @meta` 元数据头。可以直接将其拖入播放器进行热重载测试。

## 📝 贡献与致谢

- 核心机制与歌词渲染强依赖于 [@applemusic-like-lyrics/lyric](https://github.com/amll-dev/applemusic-like-lyrics) 。
- 音源 API 支持来自 [Meting API](https://cnb.cool/SDCOM/Meting-Api)。

---
*Created by SDCOM-0415*
