declare const extensionContext: any;

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
    let originalUrl = song.lrc;
    try {
      const sep = originalUrl.includes("?") ? "&" : "?";
      const lrcUrl = `${originalUrl}${sep}r=${Math.random()}`;
      const lrcRes = await extensionContext.http.fetch(lrcUrl, { cache: "no-store" });
      if (lrcRes.ok) {
        song.lrc = await lrcRes.text();
      } else {
        song.lrc = "";
      }
    } catch (e) {
      console.warn("Meting fetched lyric url but failed to download:", e);
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
  await Promise.all(
    songs.map(async (s) => {
      if (s.url?.startsWith("//")) s.url = `https:${s.url}`;
      if (s.lrc && (s.lrc.startsWith("http://") || s.lrc.startsWith("https://"))) {
        let originalUrl = s.lrc;
        try {
          const sep = originalUrl.includes("?") ? "&" : "?";
          const lrcUrl = `${originalUrl}${sep}r=${Math.random()}`;
          const lrcRes = await extensionContext.http.fetch(lrcUrl, { cache: "no-store" });
          if (lrcRes.ok) {
            s.lrc = await lrcRes.text();
          } else {
            s.lrc = "";
          }
        } catch (e) {
          console.warn("Meting playlist item fetched lyric url but failed to download:", e);
          s.lrc = "";
        }
      }
      const splitted = splitMetingLyric(s.lrc);
      s.lrc = splitted.main;
      s.tlyric = splitted.trans || undefined;
    })
  );
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
