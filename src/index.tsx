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

function parseLyricToCoreLine(lyricStr: string, format: string, extTransLyric?: string | null): any[] {
    try {
        let mainLyricStr = lyricStr;
        let transLyricStr = extTransLyric || "";
        
        // 切割翻译部分（如果尚未切割）
        const transIndex = lyricStr.indexOf("[translation]");
        if (transIndex !== -1) {
            mainLyricStr = lyricStr.substring(0, transIndex).trim();
            if (!transLyricStr) {
                transLyricStr = lyricStr.substring(transIndex + 13).trim();
            }
        }

        let lines: any[] = [];
        if (format === "yrc") {
            lines = extensionContext.lyric.parseYrc(mainLyricStr);
        } else if (format === "qrc") {
            lines = extensionContext.lyric.parseQrc(mainLyricStr);
        } else {
            lines = extensionContext.lyric.parseLrc(mainLyricStr);
        }

        let transLines: any[] = [];
        if (transLyricStr) {
            try {
                transLines = extensionContext.lyric.parseLrc(transLyricStr);
            } catch (e) {
                console.warn("[meting] failed to parse translation lyric", e);
            }
        }

        return lines.map((line: any) => {
            const coreLine = {
                ...line,
                words: line.words.map((word: any) => ({
                    ...word,
                    obscene: false,
                    romanWord: word.romanWord ?? ""
                })),
                startTime: line.words[0]?.startTime ?? 0,
                endTime: line.words[line.words.length - 1]?.endTime ?? Number.POSITIVE_INFINITY,
                translatedLyric: "",
                romanLyric: "",
                isBG: false,
                isDuet: false
            };

            // 如果有翻译歌词，根据开始时间匹配翻译（容差放宽至 1000ms 找出最邻近）
            if (transLines.length > 0) {
                let bestMatch: any = null;
                let minDiff = 1000;
                for (const t of transLines) {
                    const tStart = t.words[0]?.startTime ?? 0;
                    const diff = Math.abs(tStart - coreLine.startTime);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestMatch = t;
                    }
                }
                if (bestMatch && bestMatch.words) {
                    coreLine.translatedLyric = bestMatch.words.map((w: any) => w.word || "").join("");
                }
            }

            return coreLine;
        });
    } catch {
        return [];
    }
}

async function loadAndPlayMetingSong(songId: string) {
    const { jotaiStore, amllStates, playerDB } = extensionContext;

    console.log("[meting] loadAndPlayMetingSong:", songId);
    const song = await playerDB.songs.get(songId);
    console.log("[meting] song from db:", song);
    if (!song?.filePath) {
        console.error("[meting] no filePath for song:", songId);
        return;
    }

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
    const coverUrl = song.coverPath || "";
    if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
        extensionContext.http.fetch(coverUrl)
            .then((res: any) => res.blob())
            .then((blob: Blob) => {
                const objectUrl = URL.createObjectURL(blob);
                jotaiStore.set(amllStates.musicCoverAtom, objectUrl);
            })
            .catch(() => {
                jotaiStore.set(amllStates.musicCoverAtom, "");
            });
    } else {
        jotaiStore.set(amllStates.musicCoverAtom, coverUrl);
    }
    jotaiStore.set(amllStates.musicPlayingPositionAtom, 0);
    jotaiStore.set(amllStates.musicDurationAtom, (song.duration * 1000) | 0);

    let finalLyric = song.lyric;
    let finalTransLyric = song.translatedLrc;

    if (finalLyric && (finalLyric.startsWith("http://") || finalLyric.startsWith("https://"))) {
        try {
            const res = await extensionContext.http.fetch(finalLyric);
            if (res.ok) {
                finalLyric = await res.text();
            }
        } catch (e) {
            console.warn("[meting] loadAndPlayMetingSong failed to fetch lyric url:", e);
        }
    }

    if (finalTransLyric && (finalTransLyric.startsWith("http://") || finalTransLyric.startsWith("https://"))) {
        try {
            const res = await extensionContext.http.fetch(finalTransLyric);
            if (res.ok) {
                finalTransLyric = await res.text();
            }
        } catch (e) {
            console.warn("[meting] loadAndPlayMetingSong failed to fetch trans lyric url:", e);
        }
    }

    if (finalLyric) {
        // 如果数据存的是 lrc 但实际包含 yrc 的内容格式也可以进行一定兼容
        const parsedFormat = song.lyricFormat || "lrc";
        const lines = parseLyricToCoreLine(finalLyric, parsedFormat, finalTransLyric);
        console.log("[meting] lyric lines:", lines.length, "lyric preview:", finalLyric.substring(0, 100));
        jotaiStore.set(amllStates.musicLyricLinesAtom, lines);
        jotaiStore.set(amllStates.hideLyricViewAtom, lines.length === 0);
    } else {
        jotaiStore.set(amllStates.musicLyricLinesAtom, []);
        jotaiStore.set(amllStates.hideLyricViewAtom, true);
    }

    audio.src = song.filePath;
    audio.currentTime = 0;
    console.log("[meting] set audio.src:", song.filePath);

    audio.onloadedmetadata = () => {
        console.log("[meting] audio loadedmetadata, duration:", audio.duration);
        jotaiStore.set(amllStates.musicDurationAtom, (audio.duration * 1000) | 0);
    };

    audio.onended = () => {
        console.log("[meting] audio ended");
        jotaiStore.set(amllStates.musicPlayingAtom, false);
        stopPositionSync();
        const queueManager = jotaiStore.get(extensionContext.playerStates.queueManagerAtom);
        queueManager?.advanceForAutoEnd?.();
    };

    audio.onerror = () => {
        console.error("[meting] audio error, code:", audio.error?.code, "message:", audio.error?.message, "src:", audio.src);
        jotaiStore.set(amllStates.musicPlayingAtom, false);
        stopPositionSync();
    };

    startPositionSync();
    console.log("[meting] calling audio.play()");
    audio.play().then(() => {
        console.log("[meting] audio.play() resolved, setting musicPlayingAtom=true");
        jotaiStore.set(amllStates.musicPlayingAtom, true);
    }).catch((e) => {
        console.error("[meting] audio.play() rejected:", e);
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
    console.log("[meting] setup() called");
    extensionContext.registerComponent("settings", SettingsCard);

    extensionContext.addEventListener("extension-load", () => {
        console.log("[meting] extension-load fired");
        const { jotaiStore, amllStates, playerStates } = extensionContext;

        unsubQueue = jotaiStore.sub(
            playerStates.queueCurrentSongAtom,
            async () => {
                const song = jotaiStore.get(playerStates.queueCurrentSongAtom);
                console.log("[meting] queueCurrentSong changed:", song?.id);
                if (!song?.id?.startsWith(PLUGIN_SOURCE_PREFIX)) {
                    if (currentMetingId !== null) {
                        console.log("[meting] leaving meting song, stopping audio");
                        currentMetingId = null;
                        stopPositionSync();
                        if (audioEl) {
                            audioEl.pause();
                            audioEl.src = "";
                        }
                    }
                    return;
                }
                console.log("[meting] detected meting song, loading:", song.id);
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
