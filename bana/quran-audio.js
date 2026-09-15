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
       ===================================================== */

    function basmalaUrl() {
        return (
            `${Q.AUDIO_CDN}/` +
            `${Q.RECITER.folder}/` +
            `1001.mp3`
        );
    }


    /* =====================================================
       HELPER — MediaSession playbackState
       ===================================================== */

    function setPlaybackState(state) {

        if (!("mediaSession" in navigator)) {
            return;
        }

        try {
            navigator.mediaSession.playbackState = state;
        } catch (_) {}
    }


    /* =====================================================
       MEDIA SESSION — POSITION
       ===================================================== */

    function setMediaSessionPosition() {

        if (!("mediaSession" in navigator)) {
            return;
        }

        if (
            typeof navigator.mediaSession.setPositionState !== "function" ||
            !Number.isFinite(audio.duration) ||
            audio.duration <= 0 ||
            !Number.isFinite(audio.currentTime)
        ) {
            return;
        }

        try {

            navigator.mediaSession.setPositionState({
                duration: Math.max(audio.duration, 0.001),

                playbackRate:
                    Number.isFinite(audio.playbackRate)
                        ? audio.playbackRate
                        : 1,

                position: Math.min(
                    Math.max(audio.currentTime, 0),
                    audio.duration
                )
            });

        } catch (_) {}
    }


    /* =====================================================
       AUDIO ELEMENT — BACKGROUND / MOBILE
       ===================================================== */

    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("preload", "auto");
    audio.setAttribute("x-webkit-airplay", "allow");


    let wasPlayingBeforeHidden = false;


    /* =====================================================
       SYNC PLAYING STATE
       ===================================================== */

    function syncPlayingState() {

        const playing =
            !audio.paused &&
            !audio.ended &&
            audio.readyState >= 2;

        if (playing) {

            Q.state.isPlaying = true;
            Q.setButton(true);

            setPlaybackState("playing");

        } else if (audio.paused || audio.ended) {

            Q.state.isPlaying = false;
            Q.setButton(false);

            setPlaybackState("paused");
        }
    }


    /* =====================================================
       AUDIO EVENTS
       ===================================================== */

    audio.addEventListener("play", () => {

        Q.state.isPlaying = true;
        Q.setButton(true);

        setPlaybackState("playing");
    });


    audio.addEventListener("playing", () => {

        Q.state.isPlaying = true;
        Q.setButton(true);

        setPlaybackState("playing");
    });


    audio.addEventListener("pause", () => {

        if (audio.ended) {
            return;
        }

        Q.state.isPlaying = false;
        Q.setButton(false);

        setPlaybackState("paused");
    });


    audio.addEventListener("waiting", () => {

        /*
         * waiting لا يعني أن المستخدم أوقف الصوت.
         * قد يكون مجرد تحميل من الإنترنت.
         */

        if (Q.state.isPlaying) {
            setPlaybackState("playing");
        }
    });


    audio.addEventListener("stalled", () => {

        /*
         * قد يحدث بسبب الشبكة أثناء السكون.
         * لا نعتبره Pause.
         */

        if (Q.state.isPlaying) {
            setPlaybackState("playing");
        }
    });


    audio.addEventListener("canplay", () => {

        if (
            Q.state.isPlaying &&
            !audio.paused
        ) {
            setPlaybackState("playing");
        }
    });


    /* =====================================================
       AUDIO — PROGRESS
       ===================================================== */

    audio.addEventListener("timeupdate", () => {

        if (!audio.duration) {
            return;
        }

        const percent =
            (audio.currentTime / audio.duration) * 100;


        if (Q.dom.progressBar) {

            Q.dom.progressBar.style.width =
                `${percent}%`;
        }


        if (Q.dom.currentTime) {

            Q.dom.currentTime.textContent =
                Q.formatTime(audio.currentTime);
        }


        setMediaSessionPosition();
    });


    audio.addEventListener("loadedmetadata", () => {

        if (Q.dom.progressBar) {

            Q.dom.progressBar.style.width =
                "0%";
        }


        if (Q.dom.currentTime) {

            Q.dom.currentTime.textContent =
                "00:00";
        }


        setMediaSessionPosition();
    });


    audio.addEventListener("durationchange", () => {

        setMediaSessionPosition();
    });


    /* =====================================================
       AUDIO ERROR
       ===================================================== */

    audio.addEventListener("error", () => {

        if (
            !audio.src ||
            audio.src === window.location.href
        ) {
            return;
        }

        console.error(
            "Audio element error:",
            audio.error
        );
    });


    /* =====================================================
       MEDIA SESSION — LOCK SCREEN
       ===================================================== */

    function updateMediaSession(surah, ayah) {

        if (!("mediaSession" in navigator)) {
            return;
        }

        try {

            navigator.mediaSession.metadata =
                new MediaMetadata({

                    title:
                        surah?.name ||
                        "القرآن الكريم",

                    artist:
                        Q.RECITER.name,

                    album:
                        ayah
                            ? `الآية ${ayah.numberInSurah}`
                            : ""
                });


            navigator.mediaSession.playbackState =
                Q.state.isPlaying
                    ? "playing"
                    : "paused";

        } catch (_) {}
    }


    /* =====================================================
       MEDIA SESSION HANDLERS
       ===================================================== */

    function setupMediaSessionHandlers() {

        if (!("mediaSession" in navigator)) {
            return;
        }

        try {

            /* -----------------------------------------
               PLAY
               ----------------------------------------- */

            navigator.mediaSession.setActionHandler(
                "play",
                () => {

                    if (audio.src) {

                        const p =
                            audio.play();


                        if (
                            p &&
                            typeof p.catch === "function"
                        ) {

                            p.catch(() => {

                                A.playCurrent(
                                    Q.state.currentAyahIndex === 0
                                );
                            });
                        }


                        setPlaybackState(
                            "playing"
                        );

                    } else {

                        A.playCurrent(
                            Q.state.currentAyahIndex === 0
                        );
                    }
                }
            );


            /* -----------------------------------------
               PAUSE
               ----------------------------------------- */

            navigator.mediaSession.setActionHandler(
                "pause",
                () => {

                    try {
                        audio.pause();
                    } catch (_) {}

                    setPlaybackState(
                        "paused"
                    );
                }
            );


            /* -----------------------------------------
               PREVIOUS
               ----------------------------------------- */

            navigator.mediaSession.setActionHandler(
                "previoustrack",
                () => {

                    A.previous();
                }
            );


            /* -----------------------------------------
               NEXT
               ----------------------------------------- */

            navigator.mediaSession.setActionHandler(
                "nexttrack",
                () => {

                    A.next();
                }
            );


            /* -----------------------------------------
               STOP
               ----------------------------------------- */

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

        const surah =
            Q.state.currentSurah;


        if (!surah) {
            return;
        }


        Q.state.currentAyahIndex =
            index;


        const ayah =
            surah.ayahs[index];


        if (!ayah) {
            return;
        }


        /*
         * تحديث MediaSession قبل تحديث الواجهة
         */

        updateMediaSession(
            surah,
            ayah
        );


        if (Q.dom.ayahCounter) {

            Q.dom.ayahCounter.textContent =
                `الآية ${ayah.numberInSurah} • الصفحة ${ayah.page}`;
        }


        if (
            Q.state.currentPage ===
            ayah.page
        ) {

            Q.highlightAyah(
                ayah.number
            );

        } else {

            Q.renderPageForAyah(ayah)
                .catch(console.error);
        }
    }


    /* =====================================================
       CORE PLAYBACK
       ===================================================== */

    function playUrl(url) {

        if (!url) {
            return;
        }


        if (audio.src !== url) {

            audio.src = url;

        } else {

            try {

                audio.currentTime = 0;

            } catch (_) {}
        }


        /*
         * مهم:
         *
         * لا نستدعي audio.play()
         * من visibilitychange.
         *
         * التشغيل يجب أن يبدأ من ضغط المستخدم
         * أو من MediaSession.
         */

        const p =
            audio.play();


        if (
            p &&
            typeof p.catch === "function"
        ) {

            p.catch((err) => {

                console.warn(
                    "Audio play failed:",
                    err
                );


                Q.state.isPlaying =
                    false;


                Q.setButton(false);


                setPlaybackState(
                    "paused"
                );
            });
        }
    }


    /* =====================================================
       PRELOAD NEXT AYAH
       ===================================================== */

    function preloadNextAyah(
        surah,
        nextIndex
    ) {

        if (
            !surah ||
            nextIndex >=
                surah.ayahs.length
        ) {
            return;
        }


        const next =
            surah.ayahs[nextIndex];


        if (!next) {
            return;
        }


        const url =
            Q.getAyahAudioUrl(
                next,
                surah.number
            );


        if (!url) {
            return;
        }


        try {

            fetch(
                url,
                {
                    cache: "force-cache",
                    mode: "no-cors"
                }
            ).catch(() => {});

        } catch (_) {}
    }


    /* =====================================================
       ENDED
       ===================================================== */

    function onEnded() {

        const task =
            pendingNext;


        pendingNext =
            null;


        if (!task) {
            return;
        }


        if (
            task.token !==
            activeToken
        ) {
            return;
        }


        if (
            task.kind ===
            "basmala"
        ) {

            Q.state.isBasmala =
                false;

            mode =
                "ayah";


            playAyah(
                task.surah,
                0,
                task.token
            );


            return;
        }


        if (
            task.kind ===
            "ayah"
        ) {

            const nextIndex =
                task.index + 1;


            if (
                nextIndex <
                task.surah.ayahs.length
            ) {

                playAyah(
                    task.surah,
                    nextIndex,
                    task.token
                );

            } else {

                finishSurah(
                    task.surah,
                    task.token
                );
            }
        }
    }


    audio.addEventListener(
        "ended",
        onEnded
    );


    /* =====================================================
       PLAY AYAH
       ===================================================== */

    function playAyah(
        surah,
        index,
        token
    ) {

        if (
            token !==
            activeToken
        ) {
            return false;
        }


        if (
            !surah ||
            !surah.ayahs[index]
        ) {
            return false;
        }


        const ayah =
            surah.ayahs[index];


        mode =
            "ayah";


        Q.state.isBasmala =
            false;


        Q.state.isPlaying =
            true;


        Q.setButton(true);


        setPlaybackState(
            "playing"
        );


        setVisualAyah(
            index
        );


        playUrl(
            Q.getAyahAudioUrl(
                ayah,
                surah.number
            )
        );


        pendingNext = {

            kind: "ayah",

            surah,

            index,

            token
        };


        /*
         * تحميل الآية التالية مسبقًا
         */

        preloadNextAyah(
            surah,
            index + 1
        );


        return true;
    }


    /* =====================================================
       BASMALA + FIRST AYAH
       ===================================================== */

    async function playBasmalaThenFirst(
        surah,
        token
    ) {

        /*
         * الفاتحة والتوبة:
         * لا توجد بسملة.
         */

        if (
            !Q.shouldShowBasmala(
                surah.number
            )
        ) {

            return playAyah(
                surah,
                0,
                token
            );
        }


        /* -----------------------------------------
           فحص ملف البسملة
           ----------------------------------------- */

        let hasBasmalaFile =
            true;


        try {

            const basmalaCheck =
                await fetch(
                    basmalaUrl(),
                    {
                        method: "HEAD"
                    }
                );


            if (
                !basmalaCheck.ok
            ) {

                hasBasmalaFile =
                    false;
            }

        } catch (_) {

            hasBasmalaFile =
                false;
        }


        if (
            token !==
            activeToken
        ) {
            return false;
        }


        if (
            !hasBasmalaFile
        ) {

            console.warn(
                "ملف البسملة غير موجود — يتم تخطّي البسملة والبدء بالآية الأولى."
            );


            Q.state.isBasmala =
                false;


            mode =
                "ayah";


            return playAyah(
                surah,
                0,
                token
            );
        }


        /* -----------------------------------------
           تشغيل البسملة
           ----------------------------------------- */

        mode =
            "basmala";


        Q.state.isBasmala =
            true;


        Q.state.isPlaying =
            true;


        Q.setButton(true);


        setPlaybackState(
            "playing"
        );


        setVisualAyah(
            0
        );


        playUrl(
            basmalaUrl()
        );


        pendingNext = {

            kind: "basmala",

            surah,

            token
        };


        /*
         * تحميل الآية الأولى مسبقًا
         */

        preloadNextAyah(
            surah,
            0
        );


        return true;
    }


    /* =====================================================
       FINISH SURAH → NEXT SURAH
       ===================================================== */

    async function finishSurah(
        surah,
        token
    ) {

        if (
            token !==
            activeToken
        ) {
            return;
        }


        const nextNumber =
            surah.number + 1;


        if (
            nextNumber > 114
        ) {

            Q.state.isPlaying =
                false;


            Q.setButton(false);


            setPlaybackState(
                "paused"
            );


            return;
        }


        try {

            const nextSurah =
                await Q.prepareSurah(
                    nextNumber
                );


            if (
                token !==
                activeToken
            ) {
                return;
            }


            Q.state.currentSurah =
                nextSurah;


            Q.state.currentAyahIndex =
                0;


            Q.state.currentPage =
                null;


            if (
                Q.dom.surahSelect
            ) {

                Q.dom.surahSelect.value =
                    nextNumber;
            }


            await Q.showAyah(
                0,
                false
            );


            if (
                token !==
                activeToken
            ) {
                return;
            }


            await playBasmalaThenFirst(
                nextSurah,
                token
            );

        } catch (error) {

            console.error(
                "finishSurah:",
                error
            );


            try {

                await Q.loadSurah(
                    nextNumber,
                    true
                );

            } catch (_) {}
        }
    }


    /* =====================================================
       PUBLIC API — PLAY CURRENT
       ===================================================== */

    A.playCurrent =
        async function (
            includeBasmala = true
        ) {

            if (
                !Q.state.currentSurah
            ) {

                alert(
                    "اختر سورة أولًا."
                );

                return false;
            }


            const token =
                ++activeToken;


            const surah =
                Q.state.currentSurah;


            const index =
                Q.state.currentAyahIndex;


            pendingNext =
                null;


            Q.resetProgress();


            if (
                includeBasmala &&
                index === 0 &&
                Q.shouldShowBasmala(
                    surah.number
                )
            ) {

                return await playBasmalaThenFirst(
                    surah,
                    token
                );
            }


            return playAyah(
                surah,
                index,
                token
            );
        };


    /* =====================================================
       TOGGLE
       ===================================================== */

    A.toggle =
        async function () {

            if (
                !Q.state.currentSurah
            ) {

                alert(
                    "اختر سورة أولًا."
                );

                return;
            }


            if (
                Q.state.isPlaying
            ) {

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

    A.stop =
        function () {

            activeToken++;


            pendingNext =
                null;


            mode =
                "ayah";


            try {

                audio.pause();

            } catch (_) {}


            Q.state.isPlaying =
                false;


            Q.state.isBasmala =
                false;


            Q.setButton(false);


            Q.resetProgress();


            setPlaybackState(
                "paused"
            );


            try {

                if (
                    "mediaSession" in navigator &&
                    typeof navigator.mediaSession
                        .setPositionState ===
                        "function"
                ) {

                    navigator.mediaSession
                        .setPositionState({

                            duration: 1,

                            playbackRate: 1,

                            position: 0
                        });
                }

            } catch (_) {}
        };


    /* =====================================================
       STOP + RESET
       ===================================================== */

    A.stopAndReset =
        function () {

            A.stop();
        };


    /* =====================================================
       NEXT
       ===================================================== */

    A.next =
        async function () {

            const surah =
                Q.state.currentSurah;


            if (!surah) {
                return;
            }


            const token =
                ++activeToken;


            pendingNext =
                null;


            const next =
                Q.state.currentAyahIndex + 1;


            if (
                next <
                surah.ayahs.length
            ) {

                await Q.showAyah(
                    next,
                    false
                );


                playAyah(
                    surah,
                    next,
                    token
                );

            } else {

                await finishSurah(
                    surah,
                    token
                );
            }
        };


    /* =====================================================
       PREVIOUS
       ===================================================== */

    A.previous =
        async function () {

            const surah =
                Q.state.currentSurah;


            if (
                !surah ||
                Q.state.currentAyahIndex <= 0
            ) {
                return;
            }


            activeToken++;


            pendingNext =
                null;


            try {

                audio.pause();

            } catch (_) {}


            Q.state.isPlaying =
                false;


            Q.setButton(false);


            Q.resetProgress();


            setPlaybackState(
                "paused"
            );


            const prev =
                Q.state.currentAyahIndex - 1;


            await Q.showAyah(
                prev,
                false
            );
        };


    /* =====================================================
       COMPATIBILITY
       ===================================================== */

    A.preload =
        function () {};


    A.prepareFirstForSurah =
        function () {};


    A.preloadForSurah =
        function () {};


    A.prepareNextSurah =
        function () {};


    A.resume =
        async function () {};


    /* =====================================================
       MOBILE BACKGROUND / SCREEN LOCK
       ===================================================== */

    document.addEventListener(
        "visibilitychange",
        () => {

            if (
                document.visibilityState ===
                "hidden"
            ) {

                /*
                 * نحفظ الحالة الحقيقية للصوت.
                 */

                wasPlayingBeforeHidden =
                    !audio.paused &&
                    !audio.ended &&
                    Q.state.isPlaying;


                if (
                    wasPlayingBeforeHidden
                ) {

                    /*
                     * نُبقي MediaSession
                     * في حالة Playing.
                     *
                     * لا نستدعي play() هنا.
                     */

                    setPlaybackState(
                        "playing"
                    );
                }


                return;
            }


            /*
             * عند الرجوع من السكون:
             *
             * لا نجبر المتصفح على autoplay.
             */

            if (
                wasPlayingBeforeHidden &&
                !audio.paused &&
                !audio.ended
            ) {

                Q.state.isPlaying =
                    true;


                Q.setButton(
                    true
                );


                setPlaybackState(
                    "playing"
                );

            } else {

                syncPlayingState();
            }
        }
    );


    /* =====================================================
       PAGE HIDE
       ===================================================== */

    window.addEventListener(
        "pagehide",
        () => {

            if (
                !audio.paused &&
                !audio.ended &&
                Q.state.isPlaying
            ) {

                setPlaybackState(
                    "playing"
                );
            }
        }
    );


    /* =====================================================
       PAGE SHOW
       ===================================================== */

    window.addEventListener(
        "pageshow",
        () => {

            if (
                !audio.paused &&
                !audio.ended
            ) {

                Q.state.isPlaying =
                    true;


                Q.setButton(
                    true
                );


                setPlaybackState(
                    "playing"
                );
            }
        }
    );


    /* =====================================================
       KEEP MEDIA SESSION UPDATED
       ===================================================== */

    document.addEventListener(
        "visibilitychange",
        () => {

            if (
                document.visibilityState ===
                "hidden" &&
                Q.state.isPlaying
            ) {

                setPlaybackState(
                    "playing"
                );
            }
        }
    );


    /* =====================================================
       INIT
       ===================================================== */

    setupMediaSessionHandlers();

})();