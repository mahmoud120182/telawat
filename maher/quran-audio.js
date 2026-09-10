/* =========================================================
   QURAN AUDIO ENGINE
   تشغيل متصل باستخدام Web Audio API
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
       WEB AUDIO
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
       BASMALA AUDIO
       ===================================================== */

    function basmalaUrl() {

        /*
         * تسجيل ماهر المعيقلي
         */
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


        /*
         * موجود بالفعل في الذاكرة
         */
        if (
            buffers.has(url)
        ) {

            return buffers.get(url);
        }


        /*
         * يتم تحميله حالياً
         */
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


            /*
             * البسملة
             */
            if (
                Q.shouldShowBasmala(n)
            ) {

                A.preload(
                    basmalaUrl()
                );
            }


            /*
             * أول 4 آيات
             */
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


            /*
             * تجهيز 4 آيات قادمة.
             *
             * هذا مهم جداً حتى لا ننتظر
             * الشبكة عند نهاية الآية.
             */
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


            /*
             * تحميل بيانات السورة
             * في الخلفية.
             */
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


                        /*
                         * تجهيز أول عدة آيات.
                         */
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


        /*
         * حذف المرجع من قائمة المصادر
         * بعد انتهاء تشغيله.
         */
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


        /*
         * إذا لم يكن الصوت جاهزاً
         * سيتم تحميله الآن.
         */
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


        Q.setButton(
            true
        );


        startProgressTimer();


        /*
         * تجهيز عدة آيات قادمة.
         */
        A.preloadForSurah(
            surah,
            index
        );


        /*
         * جدولة الآية التالية
         * عند نهاية الآية الحالية.
         */
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

        /*
         * الفاتحة والتوبة
         */
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


        /*
         * تحميل البسملة.
         */
        const basmalaBuffer =
            await loadBuffer(
                basmalaUrl()
            );


        if (
            token !== activeToken
        ) {

            return false;
        }


        /*
         * تحميل أول آية
         * قبل بدء البسملة.
         */
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


        /*
         * البسملة تبدأ فوراً.
         */
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


        Q.setButton(
            true
        );


        startProgressTimer();


        /*
         * أهم نقطة:
         *
         * أول آية يتم جدولتها مسبقاً
         * عند نهاية البسملة مباشرة.
         */
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


        /*
         * تغيير التظليل لحظة بدء الآية.
         */
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


        /*
         * تجهيز الآيات التالية.
         */
        A.preloadForSurah(
            surah,
            0
        );


        /*
         * جدولة الآية الثانية.
         */
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


        /*
         * ما زالت هناك آيات.
         */
        if (
            nextIndex <
            surah.ayahs.length
        ) {

            const nextAyah =
                surah.ayahs[
                    nextIndex
                ];


            /*
             * الصوت التالي يجب أن يكون
             * decoded قبل نهاية الحالي.
             */
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


                        /*
                         * جاهز قبل نهاية الآية.
                         */
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


                        /*
                         * Fallback في حالة الشبكة البطيئة.
                         */
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


        /*
         * آخر آية.
         *
         * نجهز السورة التالية.
         */
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

            return;
        }


        try {

            /*
             * السورة التالية تم تجهيز بياناتها
             * مسبقاً غالباً.
             */
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


            /*
             * الصفحة + الصوت معاً.
             */
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


            /*
             * البسملة + أول آية.
             */
            await playBasmalaThenFirst(
                nextSurah,
                token
            );


            /*
             * تجهيز السورة التي بعدها.
             */
            A.prepareNextSurah(
                nextNumber + 1
            );

        } catch (error) {

            console.error(
                "finishSurah:",
                error
            );


            /*
             * محاولة احتياطية.
             */
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


            /*
             * البسملة عند بداية السورة.
             */
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

                /*
                 * عند الإيقاف نوقف كل المصادر المجدولة.
                 */
                A.stop();

                Q.resetProgress();

                Q.setButton(
                    false
                );

                return;
            }


            /*
             * التشغيل يبدأ من الآية الحالية.
             */
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