/* =========================================================
   QURAN AUDIO ENGINE
   تشغيل متصل باستخدام Web Audio API مع دعم Background Playback
   ========================================================= */

(() => {
    "use strict";

    const Q = window.QuranApp;

    if (!Q) {
        throw new Error(
            "Quran core is not loaded"
        );
    }

    const A = Q.Audio = {};


    /* =====================================================
       WEB AUDIO CONTEXT & RESUME ENGINE
       ===================================================== */

    let context = null;
    let gain = null;


    function getContext() {

        if (!context) {

            context =
                new (
                    window.AudioContext ||
                    window.webkitAudioContext
                )();


            gain =
                context.createGain();


            gain.connect(
                context.destination
            );

            // Resuming audio context whenever state changes to suspended by the system
            context.onstatechange = () => {
                if (context.state === "suspended" && Q.state.isPlaying) {
                    context.resume();
                }
            };
        }


        return context;
    }


    A.resume =
        async function () {

            const ctx =
                getContext();


            if (
                ctx.state ===
                "suspended"
            ) {

                await ctx.resume();
            }
        };

    // Keep context running when mobile screen state changes / unlocks
    document.addEventListener("visibilitychange", () => {
        if (
            document.visibilityState === "visible" &&
            context &&
            context.state === "suspended" &&
            Q.state.isPlaying
        ) {
            context.resume();
        }
    });


    /* =====================================================
       AUDIO CACHE
       ===================================================== */

    const buffers =
        new Map();

    const loading =
        new Map();


    /* =====================================================
       SOURCES
       ===================================================== */

    let activeSource = null;

    let activeStartedAt = 0;

    let activeOffset = 0;

    let activeDuration = 0;

    let mode = "ayah";

    let activeToken = 0;

    let timer = null;

    let transitionTimer = null;

    let scheduledNext = null;

    const scheduledSources =
        new Set();


    /* =====================================================
       MEDIA SESSION INTEGRATION (LOCK SCREEN CONTROLS)
       ===================================================== */

    function updateMediaSession(ayah) {
        if (!('mediaSession' in navigator)) return;

        const surah = Q.state.currentSurah;
        if (!surah) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: `${surah.name} - الآية ${ayah ? ayah.numberInSurah : 1}`,
            artist: Q.RECITER.name,
            album: "القرآن الكريم",
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/3004/3004416.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
            A.resume();
            if (!Q.state.isPlaying) A.toggle();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (Q.state.isPlaying) A.toggle();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            A.previous();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            A.next();
        });
    }


    /* =====================================================
       BASMALA AUDIO
       ===================================================== */

    function basmalaUrl() {

        return (
            `${Q.AUDIO_CDN}/` +
            `${Q.RECITER.folder}/` +
            `001001.mp3`
        );
    }


    /* =====================================================
       LOAD + DECODE AUDIO
       ===================================================== */

    async function loadBuffer(url) {

        if (!url) {
            return null;
        }


        if (
            buffers.has(url)
        ) {

            return buffers.get(url);
        }


        if (
            loading.has(url)
        ) {

            return loading.get(url);
        }


        const promise =
            (async () => {

                const response =
                    await fetch(
                        url,
                        {
                            cache:
                                "force-cache"
                        }
                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        `Audio HTTP ${response.status}`
                    );
                }


                const arrayBuffer =
                    await response.arrayBuffer();


                const ctx =
                    getContext();


                const decoded =
                    await ctx.decodeAudioData(
                        arrayBuffer
                    );


                buffers.set(
                    url,
                    decoded
                );


                loading.delete(
                    url
                );


                return decoded;

            })()
            .catch(
                error => {

                    loading.delete(
                        url
                    );

                    console.error(
                        "Audio preload:",
                        error
                    );

                    throw error;
                }
            );


        loading.set(
            url,
            promise
        );


        return promise;
    }


    /* =====================================================
       PRELOAD
       ===================================================== */

    A.preload =
        function (url) {

            if (!url) {
                return;
            }

            loadBuffer(url)
                .catch(
                    () => {}
                );
        };


    /* =====================================================
       PREPARE FIRST AUDIO
       ===================================================== */

    A.prepareFirstForSurah =
        function (surahNumber) {

            const n =
                Number(surahNumber);


            if (
                !n ||
                n > 114
            ) {
                return;
            }


            if (
                Q.shouldShowBasmala(n)
            ) {

                A.preload(
                    basmalaUrl()
                );
            }


            for (
                let i = 1;
                i <= 4;
                i++
            ) {

                A.preload(
                    Q.audioUrl(
                        n,
                        i
                    )
                );
            }
        };


    /* =====================================================
       PRELOAD CURRENT + NEXT
       ===================================================== */

    A.preloadForSurah =
        function (
            surah,
            index
        ) {

            if (!surah) {
                return;
            }


            for (
                let i = index;
                i <
                    Math.min(
                        index + 5,
                        surah.ayahs.length
                    );
                i++
            ) {

                const ayah =
                    surah.ayahs[i];


                A.preload(
                    Q.getAyahAudioUrl(
                        ayah,
                        surah.number
                    )
                );
            }
        };


    /* =====================================================
       PREPARE NEXT SURAH
       ===================================================== */

    A.prepareNextSurah =
        function (number) {

            const n =
                Number(number);


            if (
                !n ||
                n > 114
            ) {
                return;
            }


            Q.getSurahData(n)
                .then(
                    data => {

                        if (
                            Q.shouldShowBasmala(
                                n
                            )
                        ) {

                            A.preload(
                                basmalaUrl()
                            );
                        }


                        const ayahs =
                            data?.ayahs || [];


                        ayahs
                            .slice(0, 4)
                            .forEach(
                                ayah => {

                                    A.preload(
                                        Q.audioUrl(
                                            n,
                                            ayah.numberInSurah
                                        )
                                    );
                                }
                            );
                    }
                )
                .catch(
                    () => {}
                );
        };


    /* =====================================================
       STOP SOURCES
       ===================================================== */

    function stopSources() {

        scheduledSources
            .forEach(
                source => {

                    try {

                        source.onended =
                            null;

                        source.stop();

                    } catch (_) {}


                    try {

                        source.disconnect();

                    } catch (_) {}
                }
            );


        scheduledSources.clear();

        activeSource =
            null;


        if (
            transitionTimer
        ) {

            clearTimeout(
                transitionTimer
            );

            transitionTimer =
                null;
        }


        if (timer) {

            clearInterval(
                timer
            );

            timer =
                null;
        }


        scheduledNext =
            null;
    }


    /* =====================================================
       STOP
       ===================================================== */

    A.stop =
        function () {

            activeToken++;

            stopSources();

            activeOffset =
                0;

            activeStartedAt =
                0;

            activeDuration =
                0;

            mode =
                "ayah";

            Q.state.isPlaying =
                false;

            Q.state.isBasmala =
                false;

            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = "paused";
            }
        };


    /* =====================================================
       START BUFFER
       ===================================================== */

    function startBuffer(
        buffer,
        offset = 0,
        startAt = null
    ) {

        const ctx =
            getContext();


        const source =
            ctx.createBufferSource();


        source.buffer =
            buffer;


        source.connect(
            gain
        );


        source.onended =
            () => {

                scheduledSources.delete(
                    source
                );
            };


        const when =
            startAt ??
            ctx.currentTime;


        source.start(
            when,
            Math.max(
                0,
                offset
            )
        );


        scheduledSources.add(
            source
        );


        activeSource =
            source;


        activeStartedAt =
            when;


        activeOffset =
            offset;


        activeDuration =
            buffer.duration;


        return {

            source,

            endAt:
                when +
                Math.max(
                    0,
                    buffer.duration -
                        offset
                )
        };
    }


    /* =====================================================
       PROGRESS
       ===================================================== */

    function updateProgress() {

        if (
            !Q.state.isPlaying
        ) {
            return;
        }


        const ctx =
            getContext();


        let elapsed =
            ctx.currentTime -
            activeStartedAt +
            activeOffset;


        elapsed =
            Math.max(
                0,
                Math.min(
                    elapsed,
                    activeDuration ||
                        0
                )
            );


        const percent =
            activeDuration > 0

                ? (
                    elapsed /
                    activeDuration
                ) * 100

                : 0;


        if (
            Q.dom.progressBar
        ) {

            Q.dom.progressBar.style.width =
                `${percent}%`;
        }


        if (
            Q.dom.currentTime
        ) {

            Q.dom.currentTime.textContent =
                Q.formatTime(
                    elapsed
                );
        }
    }


    function startProgressTimer() {

        if (timer) {

            clearInterval(
                timer
            );
        }


        timer =
            setInterval(
                updateProgress,
                50
            );
    }


    /* =====================================================
       VISUAL AYAH
       ===================================================== */

    function setVisualAyah(
        index
    ) {

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


        if (
            Q.dom.ayahCounter
        ) {

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

            Q.renderPageForAyah(
                ayah
            ).catch(
                console.error
            );
        }

        updateMediaSession(ayah);
    }


    /* =====================================================
       PLAY AYAH
       ===================================================== */

    async function playAyahBuffer(
        surah,
        index,
        startAt = null,
        offset = 0,
        token = activeToken
    ) {

        if (
            !surah ||
            !surah.ayahs[index]
        ) {

            return false;
        }


        const ayah =
            surah.ayahs[index];


        const url =
            Q.getAyahAudioUrl(
                ayah,
                surah.number
            );


        const buffer =
            await loadBuffer(
                url
            );


        if (
            token !== activeToken
        ) {

            return false;
        }


        const result =
            startBuffer(
                buffer,
                offset,
                startAt
            );


        mode =
            "ayah";


        Q.state.isBasmala =
            false;


        Q.state.isPlaying =
            true;

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }


        Q.setButton(
            true
        );


        startProgressTimer();


        A.preloadForSurah(
            surah,
            index
        );


        scheduleAyahTransition(
            result.endAt,
            surah,
            index,
            token
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

        if (
            !Q.shouldShowBasmala(
                surah.number
            )
        ) {

            return playAyahBuffer(
                surah,
                0,
                null,
                0,
                token
            );
        }

        let hasBasmalaFile = true;
        try {
            const basmalaCheck = await fetch(basmalaUrl(), { method: "HEAD" });
            if (!basmalaCheck.ok) {
                hasBasmalaFile = false;
            }
        } catch (e) {
            hasBasmalaFile = false;
        }

        if (!hasBasmalaFile) {
            console.warn("الملف 001001.mp3 غير موجود، يتم تخطي البسملة.");
            Q.state.isBasmala = false;
            return playAyahBuffer(
                surah,
                0,
                null,
                0,
                token
            );
        }


        const basmalaBuffer =
            await loadBuffer(
                basmalaUrl()
            );


        if (
            token !== activeToken
        ) {

            return false;
        }


        const firstAyah =
            surah.ayahs[0];


        const firstUrl =
            Q.getAyahAudioUrl(
                firstAyah,
                surah.number
            );


        const firstBuffer =
            await loadBuffer(
                firstUrl
            );


        if (
            token !== activeToken
        ) {

            return false;
        }


        stopSources();


        const ctx =
            getContext();


        const basmalaResult =
            startBuffer(
                basmalaBuffer,
                0,
                ctx.currentTime
            );


        mode =
            "basmala";


        Q.state.isBasmala =
            true;


        Q.state.isPlaying =
            true;

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }


        Q.setButton(
            true
        );


        startProgressTimer();


        const ayahStart =
            basmalaResult.endAt;


        const ayahResult =
            startBuffer(
                firstBuffer,
                0,
                ayahStart
            );


        scheduledNext = {
            kind: "ayah",
            surah,
            index: 0,
            source:
                ayahResult.source,
            startAt:
                ayahStart,
            endAt:
                ayahResult.endAt
        };


        const visualDelay =
            Math.max(
                0,
                (
                    ayahStart -
                    ctx.currentTime
                ) * 1000
            );


        transitionTimer =
            setTimeout(
                () => {

                    if (
                        token !==
                        activeToken
                    ) {
                        return;
                    }


                    Q.state.isBasmala =
                        false;


                    setVisualAyah(
                        0
                    );


                    Q.resetProgress();


                    activeSource =
                        ayahResult.source;


                    activeStartedAt =
                        ayahStart;


                    activeOffset =
                        0;


                    activeDuration =
                        firstBuffer.duration;


                    mode =
                        "ayah";

                },
                visualDelay
            );


        A.preloadForSurah(
            surah,
            0
        );


        scheduleAyahTransition(
            ayahResult.endAt,
            surah,
            0,
            token
        );


        return true;
    }

    /* =====================================================
       SCHEDULE NEXT AYAH
       ===================================================== */

    function scheduleAyahTransition(
        endAt,
        surah,
        index,
        token
    ) {

        if (
            transitionTimer
        ) {

            clearTimeout(
                transitionTimer
            );
        }


        const ctx =
            getContext();


        const nextIndex =
            index + 1;


        if (
            nextIndex <
            surah.ayahs.length
        ) {

            const nextAyah =
                surah.ayahs[
                    nextIndex
                ];


            loadBuffer(
                Q.getAyahAudioUrl(
                    nextAyah,
                    surah.number
                )
            )
                .then(
                    nextBuffer => {

                        if (
                            token !==
                            activeToken
                        ) {
                            return;
                        }


                        const now =
                            ctx.currentTime;


                        if (
                            now <
                            endAt -
                                0.015
                        ) {

                            const nextResult =
                                startBuffer(
                                    nextBuffer,
                                    0,
                                    endAt
                                );


                            scheduledNext = {

                                kind:
                                    "ayah",

                                surah,

                                index:
                                    nextIndex,

                                source:
                                    nextResult.source,

                                startAt:
                                    endAt,

                                endAt:
                                    nextResult.endAt
                            };


                            const delay =
                                Math.max(
                                    0,
                                    (
                                        endAt -
                                        now
                                    ) * 1000
                                );


                            transitionTimer =
                                setTimeout(
                                    () => {

                                        if (
                                            token !==
                                            activeToken
                                        ) {
                                            return;
                                        }


                                        activeSource =
                                            nextResult.source;


                                        activeStartedAt =
                                            endAt;


                                        activeOffset =
                                            0;


                                        activeDuration =
                                            nextBuffer.duration;


                                        setVisualAyah(
                                            nextIndex
                                        );


                                        Q.resetProgress();


                                        scheduleAyahTransition(
                                            nextResult.endAt,
                                            surah,
                                            nextIndex,
                                            token
                                        );

                                    },
                                    delay
                                );


                            return;
                        }


                        transitionTimer =
                            setTimeout(
                                () => {

                                    fallbackNextAyah(
                                        surah,
                                        index,
                                        token
                                    );

                                },
                                Math.max(
                                    0,
                                    (
                                        endAt -
                                        ctx.currentTime
                                    ) * 1000
                                )
                            );
                    }
                )
                .catch(
                    () => {

                        transitionTimer =
                            setTimeout(
                                () => {

                                    fallbackNextAyah(
                                        surah,
                                        index,
                                        token
                                    );

                                },
                                Math.max(
                                    0,
                                    (
                                        endAt -
                                        ctx.currentTime
                                    ) * 1000
                                )
                            );
                    }
                );


            return;
        }


        A.prepareNextSurah(
            surah.number + 1
        );


        transitionTimer =
            setTimeout(
                () => {

                    finishSurah(
                        surah,
                        token
                    );

                },
                Math.max(
                    0,
                    (
                        endAt -
                        ctx.currentTime
                    ) * 1000
                )
            );
    }


    /* =====================================================
       FALLBACK
       ===================================================== */

    async function fallbackNextAyah(
        surah,
        index,
        token
    ) {

        if (
            token !== activeToken
        ) {
            return;
        }


        const nextIndex =
            index + 1;


        if (
            nextIndex >=
            surah.ayahs.length
        ) {

            await finishSurah(
                surah,
                token
            );

            return;
        }


        setVisualAyah(
            nextIndex
        );


        Q.resetProgress();


        await playAyahBuffer(
            surah,
            nextIndex,
            null,
            0,
            token
        );
    }


    /* =====================================================
       FINISH SURAH
       ===================================================== */

    async function finishSurah(
        surah,
        token
    ) {

        if (
            token !== activeToken
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

            Q.setButton(
                false
            );

            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = "paused";
            }

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


            const first =
                nextSurah.ayahs[0];


            const pagePromise =
                Q.getPageData(
                    first.page
                );


            A.preloadForSurah(
                nextSurah,
                0
            );


            await pagePromise;


            if (
                token !==
                activeToken
            ) {
                return;
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


            A.prepareNextSurah(
                nextNumber + 1
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
       PLAY CURRENT
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


            await A.resume();


            const token =
                ++activeToken;


            stopSources();


            const surah =
                Q.state.currentSurah;


            const index =
                Q.state.currentAyahIndex;


            Q.resetProgress();


            if (
                includeBasmala &&
                index === 0 &&
                Q.shouldShowBasmala(
                    surah.number
                )
            ) {

                return playBasmalaThenFirst(
                    surah,
                    token
                );
            }


            return playAyahBuffer(
                surah,
                index,
                null,
                0,
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

                Q.resetProgress();

                Q.setButton(
                    false
                );

                return;
            }


            await A.playCurrent(
                Q.state.currentAyahIndex === 0
            );
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


            const next =
                Q.state.currentAyahIndex +
                1;


            if (
                next <
                surah.ayahs.length
            ) {

                activeToken++;

                stopSources();


                Q.state.isBasmala =
                    false;


                Q.state.currentAyahIndex =
                    next;


                await Q.showAyah(
                    next,
                    false
                );


                await A.playCurrent(
                    false
                );


                return;
            }


            await finishSurah(
                surah,
                activeToken
            );
        };


    /* =====================================================
       PREVIOUS
       ===================================================== */

    A.previous =
        async function () {

            const surah =
                Q.state.currentSurah;


            if (!surah) {
                return;
            }


            if (
                Q.state.currentAyahIndex >
                0
            ) {

                activeToken++;

                stopSources();


                Q.state.isBasmala =
                    false;


                const previous =
                    Q.state.currentAyahIndex -
                    1;


                await Q.showAyah(
                    previous,
                    false
                );


                Q.resetProgress();

                Q.setButton(
                    false
                );
            }
        };


    /* =====================================================
       STOP + RESET
       ===================================================== */

    A.stopAndReset =
        function () {

            A.stop();

            Q.resetProgress();

            Q.setButton(
                false
            );
        };
})();