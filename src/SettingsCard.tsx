import { useState, useCallback } from "react";
import {
  METING_API_PRESETS,
  normalizeApiUrl,
  fetchMetingSong,
  fetchMetingPlaylist,
  makeSongId,
  type MetingServer,
} from "./api";

declare const extensionContext: any;
declare const React: typeof import("react");

const { createElement: h, Fragment } = React;

interface NewPlaylistForm {
  name: string;
  server: MetingServer;
  playlistId: string;
  apiSource: string;
  customApiUrl: string;
}

const SERVERS: { value: MetingServer; label: string }[] = [
  { value: "netease", label: "网易云" },
  { value: "tencent", label: "QQ音乐" },
  { value: "kugou", label: "酷狗" },
  { value: "kuwo", label: "酷我" },
  { value: "bilibili", label: "哔哩哔哩" },
  { value: "baidu", label: "百度" },
];

function useMetingPlaylists() {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const reload = useCallback(async () => {
    const db = extensionContext.playerDB;
    const all = await db.playlists.toArray();
    setPlaylists(all.filter((p: any) => p.metingServer && p.metingPlaylistId));
  }, []);
  return { playlists, reload };
}

async function importPlaylist(form: NewPlaylistForm): Promise<string> {
  const apiUrl =
    form.apiSource === "custom"
      ? normalizeApiUrl(form.customApiUrl)
      : (METING_API_PRESETS.find((p) => p.value === form.apiSource)?.url ??
        METING_API_PRESETS[0].url);

  const songs = await fetchMetingPlaylist(apiUrl, form.server, form.playlistId);
  const db = extensionContext.playerDB;

  const songsToPut: any[] = [];
  const songIds: string[] = [];
  const now = Date.now();
  const emptyBlob = new Blob([], { type: "audio/mpeg" });
  const coverBlob = new Blob([], { type: "image/png" });

  for (const s of songs) {
    if (!s.url) continue;
    const id = await makeSongId(s.url);
    const existing = await db.songs.get(id);
    songsToPut.push({
      id,
      filePath: s.url,
      songName: s.title || existing?.songName || "Unknown Title",
      songArtists: s.author || existing?.songArtists || "Unknown Artist",
      songAlbum: existing?.songAlbum || "Unknown Album",
      cover: existing?.cover ?? coverBlob,
      coverUrl: s.pic || existing?.coverUrl,
      file: existing?.file ?? emptyBlob,
      duration: existing?.duration || 0,
      lyricFormat: s.lrc ? "lrc" : existing?.lyricFormat || "",
      lyric: s.lrc || existing?.lyric || "",
      translatedLrc: existing?.translatedLrc,
      romanLrc: existing?.romanLrc,
      addTime: existing?.addTime ?? now,
      accessTime: now,
      lyricOffset: existing?.lyricOffset,
    });
    songIds.push(id);
  }

  if (songsToPut.length > 0) await db.songs.upsert(songsToPut);

  const playlistId = await db.playlists.add({
    name: form.name || `${form.server} 歌单 ${form.playlistId}`,
    createTime: now,
    updateTime: now,
    playTime: 0,
    songIds,
    metingServer: form.server,
    metingPlaylistId: form.playlistId,
    metingApiUrl: apiUrl,
  });

  return String(playlistId);
}

async function addSingleSong(
  server: MetingServer,
  songId: string,
  apiUrl: string,
  targetPlaylistId: number
): Promise<void> {
  const song = await fetchMetingSong(apiUrl, server, songId);
  const id = await makeSongId(song.url);
  const db = extensionContext.playerDB;
  const now = Date.now();
  const emptyBlob = new Blob([], { type: "audio/mpeg" });
  const coverBlob = new Blob([], { type: "image/png" });

  await db.songs.upsert([{
    id,
    filePath: song.url,
    songName: song.title || "Unknown Title",
    songArtists: song.author || "Unknown Artist",
    songAlbum: "Unknown Album",
    cover: coverBlob,
    coverUrl: song.pic,
    file: emptyBlob,
    duration: 0,
    lyricFormat: song.lrc ? "lrc" : "",
    lyric: song.lrc || "",
    addTime: now,
    accessTime: now,
  }]);

  const playlist = await db.playlists.get(targetPlaylistId);
  if (playlist && !playlist.songIds.includes(id)) {
    await db.playlists.update(targetPlaylistId, (obj: any) => {
      obj.songIds.unshift(id);
    });
  }
}

async function refreshMetingPlaylist(playlistId: number): Promise<void> {
  const db = extensionContext.playerDB;
  const playlist = await db.playlists.get(playlistId);
  if (!playlist?.metingServer || !playlist?.metingPlaylistId) return;

  const apiUrl = playlist.metingApiUrl || METING_API_PRESETS[0].url;
  const songs = await fetchMetingPlaylist(
    apiUrl,
    playlist.metingServer,
    playlist.metingPlaylistId
  );

  const songsToPut: any[] = [];
  const songIds: string[] = [];
  const now = Date.now();
  const emptyBlob = new Blob([], { type: "audio/mpeg" });
  const coverBlob = new Blob([], { type: "image/png" });

  for (const s of songs) {
    if (!s.url) continue;
    const id = await makeSongId(s.url);
    const existing = await db.songs.get(id);
    songsToPut.push({
      id,
      filePath: s.url,
      songName: s.title || existing?.songName || "Unknown Title",
      songArtists: s.author || existing?.songArtists || "Unknown Artist",
      songAlbum: existing?.songAlbum || "Unknown Album",
      cover: existing?.cover ?? coverBlob,
      coverUrl: s.pic || existing?.coverUrl,
      file: existing?.file ?? emptyBlob,
      duration: existing?.duration || 0,
      lyricFormat: s.lrc ? "lrc" : existing?.lyricFormat || "",
      lyric: s.lrc || existing?.lyric || "",
      translatedLrc: existing?.translatedLrc,
      romanLrc: existing?.romanLrc,
      addTime: existing?.addTime ?? now,
      accessTime: now,
      lyricOffset: existing?.lyricOffset,
    });
    songIds.push(id);
  }

  if (songsToPut.length > 0) await db.songs.upsert(songsToPut);
  await db.playlists.update(playlistId, { songIds, updateTime: now });
}

export function SettingsCard() {
  const [tab, setTab] = useState<"import" | "single">("import");
  const [form, setForm] = useState<NewPlaylistForm>({
    name: "",
    server: "netease",
    playlistId: "",
    apiSource: "meting",
    customApiUrl: "",
  });
  const [singleServer, setSingleServer] = useState<MetingServer>("netease");
  const [singleId, setSingleId] = useState("");
  const [singleApiSource, setSingleApiSource] = useState("meting");
  const [singleCustomUrl, setSingleCustomUrl] = useState("");
  const [singleTargetPlaylist, setSingleTargetPlaylist] = useState<
    number | null
  >(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [msg, setMsg] = useState("");
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [showPlaylists, setShowPlaylists] = useState(false);

  const loadPlaylists = useCallback(async () => {
    const db = extensionContext.playerDB;
    const all = await db.playlists.toArray();
    setPlaylists(all);
    setShowPlaylists(true);
  }, []);

  const resolveApiUrl = (source: string, custom: string) =>
    source === "custom"
      ? normalizeApiUrl(custom)
      : (METING_API_PRESETS.find((p) => p.value === source)?.url ??
        METING_API_PRESETS[0].url);

  const handleImport = useCallback(async () => {
    if (!form.playlistId.trim()) {
      setMsg("请填写歌单 ID");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMsg("正在导入歌单...");
    try {
      const id = await importPlaylist(form);
      setMsg(`歌单导入成功！(ID: ${id})`);
      setStatus("ok");
      setForm((f) => ({ ...f, playlistId: "", name: "" }));
    } catch (e: any) {
      setMsg(`导入失败: ${e?.message ?? e}`);
      setStatus("error");
    }
  }, [form]);

  const handleSingleAdd = useCallback(async () => {
    if (!singleId.trim()) {
      setMsg("请填写歌曲 ID");
      setStatus("error");
      return;
    }
    if (singleTargetPlaylist === null) {
      setMsg("请先选择目标歌单");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMsg("正在添加歌曲...");
    try {
      const apiUrl = resolveApiUrl(singleApiSource, singleCustomUrl);
      await addSingleSong(singleServer, singleId, apiUrl, singleTargetPlaylist);
      setMsg("歌曲添加成功！");
      setStatus("ok");
      setSingleId("");
    } catch (e: any) {
      setMsg(`添加失败: ${e?.message ?? e}`);
      setStatus("error");
    }
  }, [
    singleServer,
    singleId,
    singleApiSource,
    singleCustomUrl,
    singleTargetPlaylist,
  ]);

  const handleRefresh = useCallback(async (playlistId: number) => {
    setStatus("loading");
    setMsg("正在刷新歌单...");
    try {
      await refreshMetingPlaylist(playlistId);
      setMsg("歌单刷新成功！");
      setStatus("ok");
    } catch (e: any) {
      setMsg(`刷新失败: ${e?.message ?? e}`);
      setStatus("error");
    }
  }, []);

  const cardStyle: React.CSSProperties = {
    padding: "16px",
    borderRadius: "8px",
    border: "1px solid var(--gray-5, #ccc)",
    margin: "8px 0",
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    marginBottom: "4px",
    color: "var(--gray-11, #555)",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "4px",
    border: "1px solid var(--gray-6, #bbb)",
    fontSize: "13px",
    boxSizing: "border-box",
    background: "var(--color-background, #fff)",
    color: "inherit",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle };
  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    background: "var(--accent-9, #0070f3)",
    color: "#fff",
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    borderRadius: "4px",
    border: "1px solid var(--gray-6, #bbb)",
    cursor: "pointer",
    fontSize: "13px",
    background: active ? "var(--accent-9, #0070f3)" : "transparent",
    color: active ? "#fff" : "inherit",
    marginRight: "6px",
  });

  return h(
    "div",
    { style: cardStyle },
    h("h3", { style: { margin: "0 0 12px", fontSize: "15px" } }, "🎵 Meting 音乐插件"),
    h(
      "div",
      { style: { marginBottom: "12px" } },
      h(
        "button",
        { style: tabBtnStyle(tab === "import"), onClick: () => setTab("import") },
        "导入歌单"
      ),
      h(
        "button",
        { style: tabBtnStyle(tab === "single"), onClick: () => setTab("single") },
        "添加单曲"
      )
    ),
    tab === "import" &&
      h(
        Fragment,
        null,
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "歌单名称（可选）"),
          h("input", {
            style: inputStyle,
            value: form.name,
            placeholder: "不填则自动生成",
            onChange: (e: any) => setForm((f) => ({ ...f, name: e.target.value })),
          })
        ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "平台 (server)"),
          h(
            "select",
            {
              style: selectStyle,
              value: form.server,
              onChange: (e: any) =>
                setForm((f) => ({
                  ...f,
                  server: e.target.value as MetingServer,
                })),
            },
            ...SERVERS.map((s) => h("option", { key: s.value, value: s.value }, s.label))
          )
        ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "歌单 ID"),
          h("input", {
            style: inputStyle,
            value: form.playlistId,
            placeholder: "例如: 3349444601",
            onChange: (e: any) =>
              setForm((f) => ({ ...f, playlistId: e.target.value })),
          })
        ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "Meting API 地址"),
          h(
            "select",
            {
              style: selectStyle,
              value: form.apiSource,
              onChange: (e: any) =>
                setForm((f) => ({ ...f, apiSource: e.target.value })),
            },
            ...METING_API_PRESETS.map((p) =>
              h("option", { key: p.value, value: p.value }, p.label)
            ),
            h("option", { value: "custom" }, "自定义")
          )
        ),
        form.apiSource === "custom" &&
          h(
            "div",
            { style: { marginBottom: "8px" } },
            h("label", { style: labelStyle }, "自定义 API 地址"),
            h("input", {
              style: inputStyle,
              value: form.customApiUrl,
              placeholder: "https://your-meting-api.com/api",
              onChange: (e: any) =>
                setForm((f) => ({ ...f, customApiUrl: e.target.value })),
            })
          ),
        h(
          "button",
          {
            style: { ...btnStyle, opacity: status === "loading" ? 0.6 : 1 },
            disabled: status === "loading",
            onClick: handleImport,
          },
          status === "loading" ? "导入中..." : "导入歌单"
        )
      ),
    tab === "single" &&
      h(
        Fragment,
        null,
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "平台 (server)"),
          h(
            "select",
            {
              style: selectStyle,
              value: singleServer,
              onChange: (e: any) =>
                setSingleServer(e.target.value as MetingServer),
            },
            ...SERVERS.map((s) => h("option", { key: s.value, value: s.value }, s.label))
          )
        ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "歌曲 ID"),
          h("input", {
            style: inputStyle,
            value: singleId,
            placeholder: "例如: 417859294",
            onChange: (e: any) => setSingleId(e.target.value),
          })
        ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "Meting API 地址"),
          h(
            "select",
            {
              style: selectStyle,
              value: singleApiSource,
              onChange: (e: any) => setSingleApiSource(e.target.value),
            },
            ...METING_API_PRESETS.map((p) =>
              h("option", { key: p.value, value: p.value }, p.label)
            ),
            h("option", { value: "custom" }, "自定义")
          )
        ),
        singleApiSource === "custom" &&
          h(
            "div",
            { style: { marginBottom: "8px" } },
            h("label", { style: labelStyle }, "自定义 API 地址"),
            h("input", {
              style: inputStyle,
              value: singleCustomUrl,
              placeholder: "https://your-meting-api.com/api",
              onChange: (e: any) => setSingleCustomUrl(e.target.value),
            })
          ),
        h(
          "div",
          { style: { marginBottom: "8px" } },
          h("label", { style: labelStyle }, "目标歌单"),
          !showPlaylists &&
            h(
              "button",
              { style: { ...btnStyle, background: "var(--gray-9, #888)" }, onClick: loadPlaylists },
              "选择歌单"
            ),
          showPlaylists &&
            h(
              "select",
              {
                style: selectStyle,
                value: singleTargetPlaylist ?? "",
                onChange: (e: any) =>
                  setSingleTargetPlaylist(Number(e.target.value)),
              },
              h("option", { value: "" }, "-- 请选择 --"),
              ...playlists.map((p: any) =>
                h("option", { key: p.id, value: p.id }, p.name || `歌单 #${p.id}`)
              )
            )
        ),
        h(
          "button",
          {
            style: { ...btnStyle, opacity: status === "loading" ? 0.6 : 1 },
            disabled: status === "loading",
            onClick: handleSingleAdd,
          },
          status === "loading" ? "添加中..." : "添加歌曲"
        )
      ),
    msg &&
      h(
        "div",
        {
          style: {
            marginTop: "10px",
            padding: "6px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            background:
              status === "ok"
                ? "var(--green-3, #d4edda)"
                : status === "error"
                ? "var(--red-3, #f8d7da)"
                : "var(--gray-3, #e9ecef)",
            color:
              status === "ok"
                ? "var(--green-11, #155724)"
                : status === "error"
                ? "var(--red-11, #721c24)"
                : "inherit",
          },
        },
        msg
      ),
    h(
      "div",
      { style: { marginTop: "14px", borderTop: "1px solid var(--gray-5, #ccc)", paddingTop: "12px" } },
      h("h4", { style: { margin: "0 0 8px", fontSize: "13px" } }, "已导入的 Meting 歌单"),
      h(
        "button",
        {
          style: { ...btnStyle, background: "var(--gray-9, #888)", marginBottom: "8px", fontSize: "12px" },
          onClick: loadPlaylists,
        },
        "刷新列表"
      ),
      showPlaylists &&
        playlists.length === 0 &&
        h("div", { style: { fontSize: "12px", color: "var(--gray-9)" } }, "暂无 Meting 歌单"),
      showPlaylists &&
        playlists
          .filter((p: any) => p.metingServer && p.metingPlaylistId)
          .map((p: any) =>
            h(
              "div",
              {
                key: p.id,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "6px",
                  fontSize: "13px",
                },
              },
              h("span", { style: { flex: 1 } }, `${p.name || `歌单 #${p.id}`} (${p.metingServer})`),
              h(
                "button",
                {
                  style: {
                    padding: "2px 8px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "1px solid var(--gray-6)",
                    cursor: "pointer",
                    background: "transparent",
                    color: "inherit",
                  },
                  onClick: () => handleRefresh(p.id),
                },
                "刷新"
              )
            )
          )
    )
  );
}
