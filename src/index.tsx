import { SettingsCard } from "./SettingsCard";

declare const extensionContext: any;
declare const React: typeof import("react");

const PLUGIN_SOURCE_PREFIX = "meting-";

let audioEl: HTMLAudioElement | null = null;
let rafId: number | null = null;
let unsubQueue: (() => void) | null = null;
let unsubPlayOrResume: (() => void) | null = null;
let unsubSeek: (() => void) | null = null;
let currentMetingId: string | null = null;

function getAudio(): HTMLAudioElement {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.crossOrigin = "anonymous";
    }
    return audioEl;
}

function stopPositionSync() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

function startPositionSync() {
    stopPositionSync();
    const { jotaiStore, amllStates } = extensionContext;
    const audio = getAudio();

    const loop = () => {
        if (audio.duration && !audio.paused) {
            jotaiStore.set(amllStates.musicPlayingPositionAtom, (audio.currentTime * 1000) | 0);
            jotaiStore.set(amllStates.musicDurationAtom, (audio.duration * 1000) | 0);
        }
        rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
}

function parseLrc(lyricStr: string): any[] {
    try {
        return extensionContext.lyric.parseLrc(lyricStr);
    } catch {
        return [];
    }
}

async function loadAndPlayMetingSong(songId: string) {
    const { jotaiStore, amllStates, playerDB } = extensionContext;

    const song = await playerDB.songs.get(songId);
    if (!song?.filePath) return;

    currentMetingId = songId;

    const audio = getAudio();

    jotaiStore.set(amllStates.musicIdAtom, songId);
    jotaiStore.set(amllStates.musicNameAtom, song.songName || "");
    jotaiStore.set(amllStates.musicAlbumNameAtom, song.songAlbum || "");
    jotaiStore.set(
        amllStates.musicArtistsAtom,
        (song.songArtists || "")
            .split("/")
            .map((a: string) => ({ id: a.trim(), name: a.trim() }))
    );
    jotaiStore.set(amllStates.musicCoverAtom, "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    jotaiStore.set(amllStates.musicPlayingPositionAtom, 0);
    jotaiStore.set(amllStates.musicDurationAtom, (song.duration * 1000) | 0);

    if (song.lyric && song.lyricFormat === "lrc") {
        const lines = parseLrc(song.lyric);
        jotaiStore.set(amllStates.musicLyricLinesAtom, lines);
        jotaiStore.set(amllStates.hideLyricViewAtom, lines.length === 0);
    } else {
        jotaiStore.set(amllStates.musicLyricLinesAtom, []);
        jotaiStore.set(amllStates.hideLyricViewAtom, true);
    }

    audio.src = song.filePath;
    audio.currentTime = 0;

    audio.onloadedmetadata = () => {
        jotaiStore.set(amllStates.musicDurationAtom, (audio.duration * 1000) | 0);
    };

    audio.onended = () => {
        jotaiStore.set(amllStates.musicPlayingAtom, false);
        stopPositionSync();
        const queueManager = jotaiStore.get(extensionContext.playerStates.queueManagerAtom);
        queueManager?.advanceForAutoEnd?.();
    };

    audio.onerror = () => {
        jotaiStore.set(amllStates.musicPlayingAtom, false);
        stopPositionSync();
        console.error("[amll-meting-plugin] 音频加载失败", audio.src);
    };

    startPositionSync();
    audio.play().then(() => {
        jotaiStore.set(amllStates.musicPlayingAtom, true);
    }).catch((e) => {
        console.error("[amll-meting-plugin] 播放失败", e);
        jotaiStore.set(amllStates.musicPlayingAtom, false);
    });
}

function teardown() {
    stopPositionSync();
    if (audioEl) {
        audioEl.pause();
        audioEl.src = "";
        audioEl = null;
    }
    unsubQueue?.();
    unsubPlayOrResume?.();
    unsubSeek?.();
    unsubQueue = null;
    unsubPlayOrResume = null;
    unsubSeek = null;
    currentMetingId = null;
}

function setup() {
    extensionContext.registerComponent("settings", SettingsCard);

    extensionContext.addEventListener("extension-load", () => {
        const { jotaiStore, amllStates, playerStates } = extensionContext;

        unsubQueue = jotaiStore.sub(
            playerStates.queueCurrentSongAtom,
            async () => {
                const song = jotaiStore.get(playerStates.queueCurrentSongAtom);
                if (!song?.id?.startsWith(PLUGIN_SOURCE_PREFIX)) {
                    if (currentMetingId !== null) {
                        currentMetingId = null;
                        stopPositionSync();
                        if (audioEl) {
                            audioEl.pause();
                            audioEl.src = "";
                        }
                    }
                    return;
                }
                await loadAndPlayMetingSong(song.id);
            }
        );

        unsubPlayOrResume = jotaiStore.sub(
            amllStates.onPlayOrResumeAtom,
            () => {
                if (currentMetingId === null) return;
                const audio = getAudio();
                if (audio.paused) {
                    audio.play().then(() => {
                        jotaiStore.set(amllStates.musicPlayingAtom, true);
                        startPositionSync();
                    }).catch(console.error);
                } else {
                    audio.pause();
                    jotaiStore.set(amllStates.musicPlayingAtom, false);
                    stopPositionSync();
                }
            }
        );

        unsubSeek = jotaiStore.sub(
            amllStates.onSeekPositionAtom,
            () => {
                if (currentMetingId === null) return;
                const seekMs = jotaiStore.get(amllStates.onSeekPositionAtom);
                if (typeof seekMs === "number") {
                    const audio = getAudio();
                    audio.currentTime = seekMs / 1000;
                    jotaiStore.set(amllStates.musicPlayingPositionAtom, seekMs);
                }
            }
        );

        extensionContext.addEventListener("extension-unload", () => {
            teardown();
        }, { once: true });
    });
}

setup();
