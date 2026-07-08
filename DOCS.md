# AMLL 扩展包 / 插件实现方法分析与参考指南

本指南基于 AMLL API 参考文档、AMLL Player 插件受控扩展窗口系统 (PR #42) 以及源码分析编写，提供了编写和实现 AMLL Player (Apple Music Like Lyrics) 插件/扩展包的核心方法与约束。

## 1. 扩展元数据 (Meta Comments) 规范
扩展脚本必须在文件开头以双斜杠注释的形式定义自身元数据。主要读取自 `extension-loader.ts` 中的 `META_REGEX = /^\/\/\s*@(\S+)\s*(.+)$/`：

```javascript
// @id my-extension-id
// @version 1.0.0
// @icon icon-url
// @name:zh-CN 我的插件名称
// @description:zh-CN 插件功能描述
// @dependency other-extension-id
```

- **必须包含**：`id`, `version`, `icon`。
- **本地化**：通过 `@name:语言` 和 `@description:语言` (如 `zh-CN`, `en-US`) 实现元数据的多语言。
- **依赖**：通过 `@dependency` 指定加载依赖顺序。

## 2. 插件上下文 (`extensionContext`)
每个插件执行时，上下文中存在全局变量 `extensionContext`（亦可通过 `this` 获取）。核心类型定义为 `ExtensionContext`（参考 `ext-ctx.ts`）：

### 2.1 运行时信息
- **`extensionContext.runtime`**：
  - `kind`: 指示当前运行环境，值为 `"main"` (主窗口) 或 `"extension-window"` (扩展窗口)。
- **`extensionContext.window`**：
  - 仅当 `runtime.kind === "extension-window"` 时存在，包含扩展窗口信息 (`id` 和 `label`)。

### 2.2 核心方法
- **组件注入 (主界面)**：
  - `registerComponent(injectPointName: string, injectComponent: React.ComponentType): void`
  - 常用的注入点：`settings` (设置区), `context` (上下文区域), `head` (添加 style)。
- **自定义扩展窗口组件**：
  - `registerWindowComponent(windowId: string, component: React.ComponentType): void`
- **生命周期**：
  - `extension-load`: 首个被触发的事件，初始化组件和功能应在此监听中进行。
  - `extension-unload`: 插件被卸载时触发，用于资源销毁和清理。
  ```javascript
  extensionContext.addEventListener("extension-load", () => { /* 初始化 */ });
  extensionContext.addEventListener("extension-unload", () => { /* 销毁 */ });
  ```
- **音频源注册** (暂未完全实现，需警惕使用)：
  - `registerPlayerSource(idPrefix: string)`

### 2.3 全局与依赖对象
- 提供 `React`, `ReactDOM`, `Jotai`, `RadixTheme`, `JSXRuntime` 全局对象，支持开发。
- **状态访问**：
  - `extensionContext.playerStates`: AMLL 播放器内部状态 (如播放列表)。
  - `extensionContext.amllStates`: 歌词解析状态。
- **内置库引用**：
  - `extensionContext.lyric`: `@applemusic-like-lyrics/lyric` 模块。
  - `extensionContext.playerDB`: 播放器内置 IndexedDB 对象。
  - `extensionContext.i18n`: 国际化 API (`i18next` 实例)。

## 3. 插件受控扩展窗口系统 (自 PR #42 起支持)
扩展窗口允许插件脱离主界面，生成属于自己的独立 Tauri 窗体。

### 3.1 窗口 API (`extensionContext.windows`)
在扩展上下文中，提供了 `windows` 接口用于控制插件窗口：
- **创建或获取受控扩展窗口**：
  ```javascript
  const winHandle = await extensionContext.windows.create("my-unique-window-id", {
      title: "我的独立窗口",
      width: 800,
      height: 600,
      center: true,
      resizable: true
  });
  ```
- **管理现有窗口**：
  - `extensionContext.windows.get(id)`
  - `extensionContext.windows.close(id)`
  - `extensionContext.windows.closeAll()`

### 3.2 独立窗口组件渲染工作流
1. 调用 `windows.create("win-1")` 创建窗体。
2. 宿主底层创建 Tauri 窗体，装载 `extension-window.html`。
3. 新窗体内部重载该插件的 JS 代码，此时 `extensionContext.runtime.kind` 为 `"extension-window"`。
4. 插件脚本内检查该环境，向该特定的窗体 ID 提供渲染组件：
   ```javascript
   if (extensionContext.runtime.kind === "extension-window") {
       extensionContext.registerWindowComponent(
           "my-unique-window-id",
           () => React.createElement("div", null, "Hello Extension Window!")
       );
   }
   ```
5. 宿主将挂载该 React 组件至窗体主视图。

*注意：扩展窗口独立存在，不默认提供主进程与窗口间通信方法。推荐使用标准的 `BroadcastChannel` 或 `localStorage` 跨标签页 API 进行数据通讯。*

## 4. 歌词与播放核心 API 参考 (Core API)
通过查阅 `amll.dev/reference/core` 文档，播放和渲染相关的扩展也可直接使用内置类。
- **Lyric 解析与渲染类**：`DomLyricPlayer`, `PixiRenderer`, `MeshGradientRenderer`, `AbstractBaseRenderer`, `BackgroundRender`。
- **接口模型**：如 `LyricLine`, `LyricWord`, `PlayerLayoutState`, `PlayerTimelineState`。

通常你可以通过监听或操作 `extensionContext.amllStates` 并结合 `extensionContext.lyric` 库来自定义修改和挂载上述类的实现。

## 5. 项目搭建提示 (针对 amll-meting-plugin)
要在当前插件目录下实现具体逻辑：
1. 请确保使用 `.js` 后缀作为构建输出，因为宿主期望通过 `// @meta` 标签直接读取。
2. 搭建基于 TypeScript / React (通过 esbuild / vite 等工具打包为独立的 iife / UMD 单文件) 的构建环境。
3. 不将 `react`, `react-dom` 打包进去，而作为 `external` 依赖外部全局变量。
