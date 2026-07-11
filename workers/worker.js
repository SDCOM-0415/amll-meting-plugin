const REPOSITORY = "SDCOM-0415/amll-meting-plugin";
const GITHUB_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const GITHUB_RELEASES = `https://github.com/${REPOSITORY}/releases`;
const PROXY_ORIGIN = "https://amll-meting-update.furryx.top";

function corsHeaders(contentType) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "cache-control": "public, max-age=300",
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders("application/json; charset=utf-8"),
  });
}

function githubHeaders(env) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "amll-meting-plugin-update-proxy",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

async function getRelease(env, tagName) {
  const endpoint = tagName
    ? `https://api.github.com/repos/${REPOSITORY}/releases/tags/${encodeURIComponent(tagName)}`
    : GITHUB_API;
  const response = await fetch(endpoint, {
    headers: githubHeaders(env),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  return response.json();
}

async function getLatestRelease(env) {
  return getRelease(env);
}

function publicRelease(release, requestUrl) {
  const base = PROXY_ORIGIN;
  const releaseKey = encodeURIComponent(release.tag_name || release.name || "latest");
  const assets = Array.isArray(release.assets)
    ? release.assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
        contentType: asset.content_type,
        downloadUrl: `${base}/download/${releaseKey}/${encodeURIComponent(asset.name)}`,
      }))
    : [];

  return {
    tagName: release.tag_name || release.name || "",
    name: release.name || release.tag_name || "",
    body: release.body || "",
    publishedAt: release.published_at || null,
    releaseUrl: release.html_url || GITHUB_RELEASES,
    assets,
  };
}

async function proxyDownload(request, env, tagName, assetName) {
  if (!tagName || !assetName || tagName.includes("/") || tagName.includes("\\") || assetName.includes("/") || assetName.includes("\\")) {
    return json({ error: "Invalid release tag or asset name" }, 400);
  }

  const release = await getRelease(env, tagName);
  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item.name === assetName)
    : null;
  if (!asset?.browser_download_url) return json({ error: "Asset not found" }, 404);

  const upstream = await fetch(asset.browser_download_url, {
    headers: {
      "user-agent": "amll-meting-plugin-update-proxy",
      "accept-encoding": "identity",
    },
    redirect: "follow",
  });
  if (!upstream.ok) return json({ error: `Download failed: ${upstream.status}` }, 502);

  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "public, max-age=300");
  headers.set("content-type", asset.content_type || "application/octet-stream");
  headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);

  if (url.pathname === "/") {
    return Response.redirect(GITHUB_RELEASES, 302);
  }

  if (url.pathname === "/api/latest") {
    try {
      const release = await getLatestRelease(env);
      return json(publicRelease(release, request.url));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Proxy request failed" }, 502);
    }
  }

  if (url.pathname.startsWith("/download/")) {
    try {
      const parts = url.pathname.slice("/download/".length).split("/");
      if (parts.length !== 2) return json({ error: "Expected /download/{tagName}/{assetName}" }, 400);
      return await proxyDownload(
        request,
        env,
        decodeURIComponent(parts[0]),
        decodeURIComponent(parts[1])
      );
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Proxy request failed" }, 502);
    }
  }

  return new Response(PROXY_PAGE, {
    headers: corsHeaders("text/html; charset=utf-8"),
  });
}

export default { fetch: handle };

const PROXY_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMLL Meting · Release Proxy</title>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#e8eef7;background:#10151d}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 10%,#284a68 0,#10151d 42%)}main{width:min(920px,calc(100% - 36px));margin:0 auto;padding:72px 0}.eyebrow{color:#7cd4ff;letter-spacing:.16em;text-transform:uppercase;font-size:12px}.hero{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:36px}.hero h1{font-size:clamp(34px,7vw,72px);line-height:.95;margin:12px 0 0;max-width:700px}.hero p{color:#9daaba;max-width:560px;line-height:1.7}.badge{border:1px solid #37617e;color:#8cdcff;border-radius:999px;padding:8px 12px;white-space:nowrap}.panel{border:1px solid #2a3b4b;background:#151e28d9;box-shadow:0 24px 80px #0005;border-radius:18px;padding:26px}.status{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid #2b3a49;padding-bottom:20px;margin-bottom:18px}.version{font-size:28px;font-weight:700}.muted{color:#8f9dad}.asset{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid #263541}.asset:last-child{border-bottom:0}.asset a{color:#10151d;background:#8cdcff;padding:9px 13px;border-radius:8px;text-decoration:none;font-weight:700}.asset small{color:#8f9dad}.error{color:#ff9d9d}.foot{margin-top:22px;color:#697786;font-size:13px}@media(max-width:600px){.hero{display:block}.badge{display:inline-block;margin-top:20px}.status{display:block}.status .muted{margin-top:8px}}
</style>
</head>
<body><main><div class="eyebrow">SDCOM-0415 / AMLL METING</div><section class="hero"><div><h1>Release relay.<br>Without the rate-limit drama.</h1><p>为 AMLL Meting 插件提供 GitHub Release 查询与下载代理。版本接口会自动重写下载地址，插件无需直接访问 GitHub。</p></div><span class="badge">latest release</span></section><section class="panel" id="app"><div class="muted">正在读取最新 Release…</div></section><div class="foot">API endpoint: <code>/api/latest</code> · Download endpoint: <code>/download/:asset</code></div></main><script>
(async()=>{const app=document.querySelector('#app');try{const r=await fetch('/api/latest');const d=await r.json();if(!r.ok)throw new Error(d.error||'请求失败');app.innerHTML='<div class="status"><div><div class="muted">最新版本</div><div class="version">'+esc(d.tagName)+'</div></div><a class="muted" href="'+esc(d.releaseUrl)+'" target="_blank" rel="noreferrer">查看 Release ↗</a></div>'+(d.assets.length?d.assets.map(a=>'<div class="asset"><div><strong>'+esc(a.name)+'</strong><br><small>'+Math.round(a.size/1024)+' KB</small></div><a href="'+esc(a.downloadUrl)+'">下载</a></div>').join(''):'<div class="muted">此 Release 没有可下载附件。</div>')}catch(e){app.innerHTML='<div class="error">加载失败：'+esc(e.message)+'</div>'}})();function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
</script></body></html>`;
