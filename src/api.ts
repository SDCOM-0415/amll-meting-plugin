declare const extensionContext: any;

export const PLUGIN_VERSION = "1.0.2";
export const UPDATE_PROXY_API = "https://你的代理域名/api/latest";

export interface PluginUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  downloadUrl: string;
}

let latestUpdateInfo: PluginUpdateInfo | null = null;
const updateListeners = new Set<(info: PluginUpdateInfo) => void>();

function versionParts(version: string): number[] {
  return version.replace(/^v/i, "").split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function getPluginUpdateInfo(): PluginUpdateInfo | null {
  return latestUpdateInfo;
}

export function subscribePluginUpdate(listener: (info: PluginUpdateInfo) => void): () => void {
  updateListeners.add(listener);
  if (latestUpdateInfo) listener(latestUpdateInfo);
  return () => updateListeners.delete(listener);
}

export async function checkPluginUpdate(): Promise<PluginUpdateInfo | null> {
  try {
    const response = await extensionContext.http.fetch(UPDATE_PROXY_API);
    if (!response.ok) throw new Error(`更新代理请求失败: ${response.status}`);
    const release = await response.json();
    const latestVersion = String(release.tagName || release.name || "").trim();
    if (!latestVersion) throw new Error("GitHub Release 未返回版本号");
    const asset = Array.isArray(release.assets)
      ? release.assets.find((item: any) => String(item.name || "") === "amll-meting-plugin.js")
      : null;
    latestUpdateInfo = {
      currentVersion: PLUGIN_VERSION,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, PLUGIN_VERSION) > 0,
      releaseUrl: String(release.releaseUrl || "https://github.com/SDCOM-0415/amll-meting-plugin/releases"),
      downloadUrl: String(asset?.downloadUrl || release.releaseUrl || "https://github.com/SDCOM-0415/amll-meting-plugin/releases"),
    };
    updateListeners.forEach((listener) => listener(latestUpdateInfo as PluginUpdateInfo));
    console.log("[meting] GitHub release check:", latestUpdateInfo);
    return latestUpdateInfo;
  } catch (error) {
    console.warn("[meting] GitHub release check failed:", error);
    return null;
  }
}
export const METING_API_PRESETS = [
  {
    value: "meting",
    label: "meting.sdcom.top",
    url: "https://meting.sdcom.top/api",
  },
  {
    value: "meting-backup",
    label: "meting-backup.sdcom.top",
    url: "https://meting-backup.sdcom.top/api",
  },
  {
    value: "api-meting",
    label: "api.meting.icu",
    url: "https://api.meting.icu/api",
  },
] as const;

export type MetingServer =
  | "netease"
  | "tencent"
  | "kugou"
  | "kuwo"
  | "baidu"
  | "bilibili";

export interface MetingSongData {
  title: string;
  author: string;
  url: string;
  pic: string;
  lrc: string;
  tlyric?: string;
}

export function splitMetingLyric(lrcStr?: string): { main: string; trans: string | null } {
  if (!lrcStr) return { main: "", trans: null };
  const idx = lrcStr.indexOf("[translation]");
  if (idx !== -1) {
    const main = lrcStr.substring(0, idx).trim();
    const trans = lrcStr.substring(idx + 13).trim();
    return { main, trans: trans || null };
  }
  return { main: lrcStr.trim(), trans: null };
}

export function detectLyricFormat(lrc: string | undefined | null): string {
  if (!lrc) return "";
  const processLyricStr = lrc.trim();
  const yrcPattern = /^\[\d+,\d+\]\(\d+,\d+,\d+\)/m;
  const qrcPattern = /^\[\d+,\d+\]/m;

  if (yrcPattern.test(processLyricStr)) {
    return "yrc";
  }
  if (qrcPattern.test(processLyricStr) && /\(\d+,\d+\)/.test(processLyricStr)) {
    return "qrc";
  }
  return "lrc";
}

export function normalizeApiUrl(input: string): string {
  let url = input.trim();
  if (!url) return METING_API_PRESETS[0].url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      parsed.pathname = "/api";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export async function fetchMetingSong(
  apiUrl: string,
  server: MetingServer,
  id: string
): Promise<MetingSongData> {
  const base = normalizeApiUrl(apiUrl);
  const sep = base.includes("?") ? "&" : "?";
  const url = `${base}${sep}server=${server}&type=song&id=${id.trim()}&r=${Math.random()}`;
  const res = await extensionContext.http.fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0)
    throw new Error("歌曲数据为空");
  const song: MetingSongData = data[0];
  if (!song.url) throw new Error("无法获取歌曲音频地址");
  if (song.url.startsWith("//")) song.url = `https:${song.url}`;
  
  if (song.lrc && (song.lrc.startsWith("http://") || song.lrc.startsWith("https://"))) {
    try {
      const lrcSep = song.lrc.includes("?") ? "&" : "?";
      const lrcUrl = `${song.lrc}${lrcSep}r=${Math.random()}`;
      console.log("[meting-api] fetching lyric url:", lrcUrl);
      const lrcRes = await extensionContext.http.fetch(lrcUrl);
      if (lrcRes.ok) {
        const text = await lrcRes.text();
        console.log("[meting-api] fetched lyric text length:", text.length);
        if (text && !text.trim().startsWith("<")) {
          song.lrc = text;
        } else {
          console.warn("[meting-api] lyric response is HTML, clearing");
          song.lrc = "";
        }
      } else {
        console.warn("[meting-api] lyric fetch not ok:", lrcRes.status);
        song.lrc = "";
      }
    } catch (e) {
      console.warn("[meting-api] failed to fetch lyric:", e);
      song.lrc = "";
    }
  }

  const splitted = splitMetingLyric(song.lrc);
  song.lrc = splitted.main;
  song.tlyric = splitted.trans || undefined;
  
  return song;
}

export async function fetchMetingPlaylist(
  apiUrl: string,
  server: MetingServer,
  playlistId: string
): Promise<MetingSongData[]> {
  const base = normalizeApiUrl(apiUrl);
  const sep = base.includes("?") ? "&" : "?";
  const url = `${base}${sep}server=${server}&type=playlist&id=${playlistId.trim()}&r=${Math.random()}`;
  const res = await extensionContext.http.fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0)
    throw new Error("歌单数据为空");
  const songs = data as MetingSongData[];

  for (const s of songs) {
    if (s.url?.startsWith("//")) s.url = `https:${s.url}`;
  }

  const CONCURRENCY = 4;
  for (let i = 0; i < songs.length; i += CONCURRENCY) {
    const batch = songs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        if (s.lrc && (s.lrc.startsWith("http://") || s.lrc.startsWith("https://"))) {
          const rawUrl = s.lrc;
          let ok = false;
          for (let attempt = 0; attempt < 3 && !ok; attempt++) {
            try {
              const lrcSep = rawUrl.includes("?") ? "&" : "?";
              const lrcUrl = `${rawUrl}${lrcSep}r=${Math.random()}`;
              const lrcRes = await extensionContext.http.fetch(lrcUrl);
              if (lrcRes.ok) {
                const text = await lrcRes.text();
                if (text && !text.trim().startsWith("<")) {
                  s.lrc = text;
                } else {
                  s.lrc = "";
                }
                ok = true;
              }
            } catch (e) {
              if (attempt === 2) {
                console.warn("[meting-api] playlist item failed to fetch lyric after retries:", rawUrl, e);
                s.lrc = "";
              } else {
                await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
              }
            }
          }
          if (!ok && s.lrc === rawUrl) s.lrc = "";
        }

        const splitted = splitMetingLyric(s.lrc);
        s.lrc = splitted.main;
        s.tlyric = splitted.trans || undefined;
      })
    );
  }
  return songs;
}

export async function makeSongId(url: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url)
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `meting-${hex.substring(0, 16)}`;
}
