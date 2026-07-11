# GitHub Release 代理

这是一个 Cloudflare Worker，用于代理 `SDCOM-0415/amll-meting-plugin` 的 GitHub latest Release：

- `GET /`：直接跳转到 GitHub Release 页面
- `GET /api/latest`：返回最新版本和经过代理重写的下载地址
- `GET /download/:asset`：由 Worker 代理下载 Release 附件
- `OPTIONS *`：支持跨域预检

## 部署

```bash
cd workers
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler deploy
```

`GITHUB_TOKEN` 是可选的。如果配置，应使用 GitHub Fine-grained Personal Access Token，并且只授予目标仓库的公开读取权限。不要将 Token 写进 `worker.js`、`wrangler.toml` 或前端代码。

部署后，将插件中的更新检查地址改为：

```text
https://你的-worker-域名/api/latest
```

## 本地开发

```bash
cd workers
wrangler dev
```

然后访问 `http://localhost:8787/`。
