import { SettingsCard } from "./SettingsCard";
import { fetchMetingSong, makeSongId, METING_API_PRESETS, normalizeApiUrl } from "./api";

declare const extensionContext: any;
declare const React: typeof import("react");

const PLUGIN_SOURCE_PREFIX = "meting-";

function setup() {
    extensionContext.registerComponent("settings", SettingsCard);

    extensionContext.registerPlayerSource(PLUGIN_SOURCE_PREFIX);

    extensionContext.addEventListener("extension-load", async () => {
        const { jotaiStore, playerStates } = extensionContext;

        const unsubscribe = jotaiStore.sub(
            playerStates.currentPlayingMusicAtom,
            async () => {
                const current = jotaiStore.get(playerStates.currentPlayingMusicAtom);
                if (!current?.id?.startsWith(PLUGIN_SOURCE_PREFIX)) return;

                try {
                    const song = await extensionContext.playerDB.songs.get(current.id);
                    if (!song?.filePath) return;

                    jotaiStore.set(playerStates.musicOverrideDataAtom, {
                        songName: song.songName,
                        songArtists: song.songArtists?.split(",").map((a: string) => a.trim()) ?? [],
                        albumName: song.songAlbum || "",
                        coverUrl: song.coverUrl || "",
                        musicUrl: song.filePath,
                        lyric: song.lyric || "",
                        lyricFormat: (song.lyricFormat || "lrc") as any,
                    });
                } catch (e) {
                    console.error("[amll-meting-plugin] 获取歌曲数据失败", e);
                }
            }
        );

        extensionContext.addEventListener("extension-unload", () => {
            unsubscribe?.();
        }, { once: true });
    });
}

setup();
