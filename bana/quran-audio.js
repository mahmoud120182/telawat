/* =========================================================
   QURAN AUDIO ENGINE
   تشغيل عبر عنصر <audio> — يعمل في الخلفية بعد قفل الشاشة
   ========================================================= */

(() => {
    "use strict";

    const Q = window.QuranApp;

    if (!Q) {
        throw new Error("Quran core is not loaded");
    }

    const A = Q.Audio = {};

    const audio = Q.dom.audio;

    if (!audio) {
        throw new Error("<audio id='audio'> element not found");
    }


    /* =====================================================
       STATE
       ===================================================== */

    let activeToken = 0;
    let mode = "ayah";
    let pendingNext = null;


    /* =====================================================
       BASMALA URL
       نستخدم أول آية من الفاتحة (001001.mp3)
       لأنها البسملة وهي متوفرة دائمًا في everyayah.
       ===================================================== */

    function basmalaUrl() {
        return (
            `${Q.AUDIO_CDN}/` +
            `${Q.RECITER.folder}/` +
            `001001.mp3`
        );
    }


    /* =====================================================
       AUDIO ELEMENT — PROGRESS
       ===================================================== */

    audio.addEventListener("timeupdate", () => {

        if (!audio.duration) {
            return;
        }

        const percent =
            (audio.currentTime / audio.duration) * 100;

        if (Q.dom.progressBar) {
            Q.dom.progressBar.style.width = `${percent}%`;
        }

        if (Q.dom.currentTime) {
            Q.dom.currentTime.textContent =
                Q.formatTime(audio.currentTime);
        }
    });


    audio.addEventListener("loadedmetadata", () => {

        if (Q.dom.progressBar) {
            Q.dom.progressBar.style.width = "0%";
        }

        if (Q.dom.currentTime) {
            Q.dom.currentTime.textContent = "00:00";
        }
    });


    audio.addEventListener("error", () => {

        /*
         * تجاهل الأخطاء الناتجة عن إفراغ src
         * عند الإيقاف.
         */
        if (!audio.src || audio.src === window.location.href) {
            return;
        }

        console.error("Audio element error:", audio.error);
    });


    /* =====================================================
       MEDIA SESSION — شاشة القفل
       ===================================================== */

    function updateMediaSession(surah, ayah) {

        if (!("mediaSession" in navigator)) {
            return;
        }

        try {

            navigator.mediaSession.metadata =
                new MediaMetadata({
                    title: surah?.name || "القرآن الكريم",
                    artist: Q.RECITER.name,
                    album: ayah
                        ? `الآية ${ayah.numberInSurah}`
                        : ""
                });

        } catch (_) {}
    }


    function setupMediaSessionHandlers() {

        if (!("mediaSession" in navigator)) {
            return;
        }

        try {

            navigator.mediaSession.setActionHandler(
                "play",
                () => {
                    A.playCurrent(
                        Q.state.currentAyahIndex === 0
                    );
                }
            );

            navigator.mediaSession.setActionHandler(
                "pause",
                () => {
                    A.stop();
                }
            );

            navigator.mediaSession.setActionHandler(
                "previoustrack",
                () => {
                    A.previous();
                }
            );

            navigator.mediaSession.setActionHandler(
                "nexttrack",
                () => {
                    A.next();
                }
            );

            navigator.mediaSession.setActionHandler(
                "stop",
                () => {
                    A.stop();
                }
            );

        } catch (_) {}
    }


    /* =====================================================
       VISUAL AYAH
       ===================================================== */

    function setVisualAyah(index) {

        const surah = Q.state.currentSurah;

        if (!surah) {
            return;
        }

        Q.state.currentAyahIndex = index;

        const ayah = surah.ayahs[index];

        if (!ayah) {
            return;
        }

        if (Q.dom.ayahCounter) {
            Q.dom.ayahCounter.textContent =
                `الآية ${ayah.numberInSurah} • الصفحة ${ayah.page}`;
        }

        if (Q.state.currentPage === ayah.page) {
            Q.highlightAyah(ayah.number);
        } else {
            Q.renderPageForAyah(ayah)
                .catch(console.error);
        }

        updateMediaSession(surah, ayah);
    }


    /* =====================================================
       CORE PLAYBACK
       ===================================================== */

    function playUrl(url) {

        if (!url) {
            return;
        }

        audio.src = url;
        audio.load();

        const p = audio.play();

        if (p && typeof p.catch === "function") {
            p.catch((err) => {
                console.warn("Audio play failed:", err);
                Q.state.isPlaying = false;
                Q.setButton(false);
            });
        }
    }


    function onEnded() {

        const task = pendingNext;
        pendingNext = null;

        if (!task) {
            return;
        }

        if (task.token !== activeToken) {
            return;
        }

        if (task.kind === "basmala") {
            Q.state.isBasmala = false;
            mode = "ayah";
            playAyah(task.surah, 0, task.token);
            return;
        }

        if (task.kind === "ayah") {

            const nextIndex = task.index + 1;

            if (nextIndex < task.surah.ayahs.length) {
                playAyah(task.surah, nextIndex, task.token);
            } else {
                finishSurah(task.surah, task.token);
            }
        }
    }

    audio.addEventListener("ended", onEnded);


    /* =====================================================
       PLAY AYAH
       ===================================================== */

    function playAyah(surah, index, token) {

        if (token !== activeToken) {
            return false;
        }

        if (!surah || !surah.ayahs[index]) {
            return false;
        }

        const ayah = surah.ayahs[index];

        setVisualAyah(index);

        mode = "ayah";
        Q.state.isBasmala = false;
        Q.state.isPlaying = true;
        Q.setButton(true);

        playUrl(
            Q.getAyahAudioUrl(ayah, surah.number)
        );

        pendingNext = {
            kind: "ayah",
            surah,
            index,
            token
        };

        return true;
    }


    /* =====================================================
       BASMALA + FIRST AYAH
       ===================================================== */

    function playBasmalaThenFirst(surah, token) {

        if (!Q.shouldShowBasmala(surah.number)) {
            return playAyah(surah, 0, token);
        }

        setVisualAyah(0);

        mode = "basmala";
        Q.state.isBasmala = true;
        Q.state.isPlaying = true;
        Q.setButton(true);

        playUrl(basmalaUrl());

        pendingNext = {
            kind: "basmala",
            surah,
            token
        };

        return true;
    }


    /* =====================================================
       FINISH SURAH → NEXT SURAH
       ===================================================== */

    async function finishSurah(surah, token) {

        if (token !== activeToken) {
            return;
        }

        const nextNumber = surah.number + 1;

        if (nextNumber > 114) {
            Q.state.isPlaying = false;
            Q.setButton(false);
            return;
        }

        try {

            const nextSurah =
                await Q.prepareSurah(nextNumber);

            if (token !== activeToken) {
                return;
            }

            Q.state.currentSurah = nextSurah;
            Q.state.currentAyahIndex = 0;
            Q.state.currentPage = null;

            if (Q.dom.surahSelect) {
                Q.dom.surahSelect.value = nextNumber;
            }

            await Q.showAyah(0, false);

            if (token !== activeToken) {
                return;
            }

            playBasmalaThenFirst(nextSurah, token);

        } catch (error) {

            console.error("finishSurah:", error);

            try {
                await Q.loadSurah(nextNumber, true);
            } catch (_) {}
        }
    }


    /* =====================================================
       PUBLIC API — PLAY CURRENT
       ===================================================== */

    A.playCurrent = async function (includeBasmala = true) {

        if (!Q.state.currentSurah) {
            alert("اختر سورة أولًا.");
            return false;
        }

        const token = ++activeToken;

        const surah = Q.state.currentSurah;
        const index = Q.state.currentAyahIndex;

        /*
         * إيقاف أي تشغيل سابق.
         */
        pendingNext = null;

        try {
            audio.pause();
        } catch (_) {}

        Q.resetProgress();

        if (
            includeBasmala &&
            index === 0 &&
            Q.shouldShowBasmala(surah.number)
        ) {
            return playBasmalaThenFirst(surah, token);
        }

        return playAyah(surah, index, token);
    };


    /* =====================================================
       TOGGLE
       ===================================================== */

    A.toggle = async function () {

        if (!Q.state.currentSurah) {
            alert("اختر سورة أولًا.");
            return;
        }

        if (Q.state.isPlaying) {
            A.stop();
            return;
        }

        await A.playCurrent(
            Q.state.currentAyahIndex === 0
        );
    };


    /* =====================================================
       STOP
       ===================================================== */

    A.stop = function () {

        activeToken++;
        pendingNext = null;
        mode = "ayah";

        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (_) {}

        Q.state.isPlaying = false;
        Q.state.isBasmala = false;
        Q.setButton(false);
        Q.resetProgress();
    };


    /* =====================================================
       STOP + RESET
       ===================================================== */

    A.stopAndReset = function () {
        A.stop();
    };


    /* =====================================================
       NEXT
       ===================================================== */

    A.next = async function () {

        const surah = Q.state.currentSurah;

        if (!surah) {
            return;
        }

        const token = ++activeToken;

        pendingNext = null;

        try {
            audio.pause();
        } catch (_) {}

        const next = Q.state.currentAyahIndex + 1;

        if (next < surah.ayahs.length) {
            await Q.showAyah(next, false);
            playAyah(surah, next, token);
        } else {
            await finishSurah(surah, token);
        }
    };


    /* =====================================================
       PREVIOUS
       ===================================================== */

    A.previous = async function () {

        const surah = Q.state.currentSurah;

        if (!surah || Q.state.currentAyahIndex <= 0) {
            return;
        }

        activeToken++;
        pendingNext = null;

        try {
            audio.pause();
        } catch (_) {}

        Q.state.isPlaying = false;
        Q.setButton(false);
        Q.resetProgress();

        const prev = Q.state.currentAyahIndex - 1;

        await Q.showAyah(prev, false);
    };


    /* =====================================================
       COMPAT NO-OPS
       هذه الدوال كانت جزءًا من محرّك Web Audio.
       مع <audio> المتصفح يقوم بالتحميل تلقائيًا،
       لذا نبقيها فارغة حتى لا نعدّل quran-core.js
       ===================================================== */

    A.preload = function () {};
    A.prepareFirstForSurah = function () {};
    A.preloadForSurah = function () {};
    A.prepareNextSurah = function () {};
    A.resume = async function () {};


    /* =====================================================
       INIT
       ===================================================== */

    setupMediaSessionHandlers();

})();