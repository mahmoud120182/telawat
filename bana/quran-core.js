/* =========================================================
   QURAN CORE
   البيانات + عرض المصحف + إدارة السور
   ========================================================= */

(() => {
    "use strict";

    const Q = window.QuranApp = window.QuranApp || {};

    Q.API_BASE = "https://api.alquran.cloud/v1";
    Q.AUDIO_CDN = "https://everyayah.com/data";

    Q.RECITER = {
        name: "الشيخ محمود علي البنا",
        folder: "mahmoud_ali_al_banna_32kbps"
    };

    Q.BASMALA =
        "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

    Q.dom = {
        surahSelect:
            document.getElementById("surahSelect"),

        surahName:
            document.getElementById("surahName"),

        ayahText:
            document.getElementById("ayahText"),

        pageView:
            document.getElementById("pageView"),

        pageNumber:
            document.getElementById("pageNumber"),

        playBtn:
            document.getElementById("playBtn"),

        previousBtn:
            document.getElementById("previousBtn"),

        nextBtn:
            document.getElementById("nextBtn"),

        fullscreenBtn:
            document.getElementById("fullscreenBtn"),

        audio:
            document.getElementById("audio"),

        progressBar:
            document.getElementById("progressBar"),

        currentTime:
            document.getElementById("currentTime"),

        ayahCounter:
            document.getElementById("ayahCounter"),

        /* الذهاب إلى الآية */
        ayahInput:
            document.getElementById("ayahInput"),

        goToAyahBtn:
            document.getElementById("goToAyahBtn")
    };


    /* =====================================================
       STATE
       ===================================================== */

    Q.state = {
        currentSurah: null,
        currentAyahIndex: 0,
        currentPage: null,
        isPlaying: false,
        isBasmala: false,
        token: 0
    };


    /* =====================================================
       CACHE
       ===================================================== */

    Q.cache = {
        surahs: null,
        surah: new Map(),
        page: new Map()
    };


    /* =====================================================
       BASMALA PATTERNS
       ===================================================== */

    const BASMALA_PATTERNS = [

        "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",

        "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",

        "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",

        "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",

        "بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ",

        "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ"
    ];


    /* =====================================================
       FETCH
       ===================================================== */

    Q.fetchJSON = async function (url) {

        const response =
            await fetch(url, {
                cache: "force-cache"
            });

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const json =
            await response.json();

        if (
            json.code &&
            json.code !== 200
        ) {
            throw new Error(
                json.status || "API Error"
            );
        }

        return json;
    };


    /* =====================================================
       ARABIC NUMBERS
       ===================================================== */

    Q.toArabicNumber = function (number) {

        const digits =
            "٠١٢٣٤٥٦٧٨٩";

        return String(number)
            .split("")
            .map(
                d =>
                    digits[Number(d)] ?? d
            )
            .join("");
    };


    /* =====================================================
       NORMALIZE ARABIC
       ===================================================== */

    Q.normalizeArabicText = function (text) {

        return String(text || "")
            .replace(/\u0640/g, "")
            .replace(/\s+/g, " ")
            .trim();
    };


    /* =====================================================
       REMOVE BASMALA
       ===================================================== */

    Q.removeBasmala = function (text) {

        let value =
            Q.normalizeArabicText(text);

        for (
            const pattern
            of BASMALA_PATTERNS
        ) {

            if (
                value.startsWith(pattern)
            ) {

                value =
                    value
                        .slice(pattern.length)
                        .trim();

                break;
            }
        }

        return value;
    };


    /* =====================================================
       BASMALA RULE
       ===================================================== */

    Q.shouldShowBasmala =
        function (surahNumber) {

            const n =
                Number(surahNumber);

            /*
             * الفاتحة لا نضيف لها بسملة
             */
            if (n === 1) {
                return false;
            }

            /*
             * التوبة لا توجد قبلها بسملة
             */
            if (n === 9) {
                return false;
            }

            return true;
        };


    /* =====================================================
       AUDIO URL
       ===================================================== */

    Q.audioUrl =
        function (
            surahNumber,
            ayahNumber
        ) {

            const s =
                String(surahNumber)
                    .padStart(3, "0");

            const a =
                String(ayahNumber)
                    .padStart(3, "0");

            return (
                `${Q.AUDIO_CDN}/` +
                `${Q.RECITER.folder}/` +
                `${s}${a}.mp3`
            );
        };


    Q.getAyahAudioUrl =
        function (
            ayah,
            surahNumber =
                Q.state.currentSurah?.number
        ) {

            if (
                !ayah ||
                !surahNumber
            ) {
                return null;
            }

            return Q.audioUrl(
                surahNumber,
                ayah.numberInSurah
            );
        };


    /* =====================================================
       PROGRESS
       ===================================================== */

    Q.resetProgress =
        function () {

            if (Q.dom.progressBar) {

                Q.dom.progressBar.style.width =
                    "0%";
            }

            if (Q.dom.currentTime) {

                Q.dom.currentTime.textContent =
                    "00:00";
            }
        };


    /* =====================================================
       PLAY BUTTON
       ===================================================== */

    Q.setButton =
        function (playing) {

            Q.state.isPlaying =
                Boolean(playing);

            if (!Q.dom.playBtn) {
                return;
            }

            Q.dom.playBtn.innerHTML =
                playing

                    ? `
                        <span>❚❚</span>
                        <span>إيقاف</span>
                      `

                    : `
                        <span>▶</span>
                        <span>تشغيل</span>
                      `;
        };


    /* =====================================================
       FORMAT TIME
       ===================================================== */

    Q.formatTime =
        function (seconds) {

            if (
                !Number.isFinite(seconds) ||
                seconds < 0
            ) {
                return "00:00";
            }

            const minutes =
                Math.floor(
                    seconds / 60
                );

            const secs =
                Math.floor(
                    seconds % 60
                );

            return (
                String(minutes)
                    .padStart(2, "0")
                +
                ":"
                +
                String(secs)
                    .padStart(2, "0")
            );
        };


    /* =====================================================
       LOAD SURAHS
       ===================================================== */

    Q.loadSurahs =
        async function () {

            const select =
                Q.dom.surahSelect;

            if (!select) {
                return;
            }

            select.disabled = true;

            select.innerHTML =
                `
                <option value="">
                    جاري تحميل السور...
                </option>
                `;

            try {

                if (!Q.cache.surahs) {

                    const json =
                        await Q.fetchJSON(
                            `${Q.API_BASE}/surah`
                        );

                    Q.cache.surahs =
                        json.data || [];
                }


                select.innerHTML =
                    `
                    <option value="">
                        اختر السورة
                    </option>
                    `;


                Q.cache.surahs.forEach(
                    surah => {

                        const option =
                            document.createElement(
                                "option"
                            );

                        option.value =
                            surah.number;

                        option.textContent =
                            `${surah.number} - ${surah.name}`;

                        select.appendChild(
                            option
                        );
                    }
                );


                select.disabled =
                    false;

            } catch (error) {

                console.error(
                    "loadSurahs:",
                    error
                );

                select.innerHTML =
                    `
                    <option value="">
                        تعذر تحميل السور
                    </option>
                    `;
            }
        };


    /* =====================================================
       GET SURAH DATA
       ===================================================== */

    Q.getSurahData =
        async function (number) {

            const n =
                Number(number);

            if (
                Q.cache.surah.has(n)
            ) {

                return Q.cache.surah.get(n);
            }


            const json =
                await Q.fetchJSON(
                    `${Q.API_BASE}/surah/${n}/quran-uthmani`
                );


            Q.cache.surah.set(
                n,
                json.data
            );


            return json.data;
        };


    /* =====================================================
       PREPARE SURAH
       ===================================================== */

    Q.prepareSurah =
        async function (number) {

            const data =
                await Q.getSurahData(
                    number
                );


            return {

                number:
                    data.number,

                name:
                    data.name,

                englishName:
                    data.englishName,

                numberOfAyahs:
                    data.numberOfAyahs,

                ayahs:
                    data.ayahs.map(
                        ayah => ({

                            number:
                                ayah.number,

                            numberInSurah:
                                ayah.numberInSurah,

                            page:
                                ayah.page,

                            text:
                                ayah.text,

                            surah:
                                ayah.surah || {

                                    number:
                                        data.number,

                                    name:
                                        data.name
                                }
                        })
                    )
            };
        };


    /* =====================================================
       PAGE DATA
       ===================================================== */

    Q.getPageData =
        async function (page) {

            const p =
                Number(page);

            if (
                Q.cache.page.has(p)
            ) {

                return Q.cache.page.get(p);
            }


            const json =
                await Q.fetchJSON(
                    `${Q.API_BASE}/page/${p}/quran-uthmani`
                );


            Q.cache.page.set(
                p,
                json.data
            );


            return json.data;
        };


    /* =====================================================
       SURAH HEADER
       ===================================================== */

    Q.createSurahHeader =
        function (
            surahNumber,
            name
        ) {

            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "surah-header";


            const title =
                document.createElement(
                    "div"
                );

            title.className =
                "surah-title";

            title.textContent =
                name;

            header.appendChild(
                title
            );


            if (
                Q.shouldShowBasmala(
                    surahNumber
                )
            ) {

                const basmala =
                    document.createElement(
                        "div"
                    );

                basmala.className =
                    "basmala";

                basmala.textContent =
                    Q.BASMALA;

                header.appendChild(
                    basmala
                );
            }


            return header;
        };


    /* =====================================================
       SURAH SEPARATOR
       ===================================================== */

    Q.createSurahSeparator =
        function () {

            const separator =
                document.createElement(
                    "div"
                );

            separator.className =
                "surah-separator";


            separator.innerHTML = `
                <div class="surah-separator-line"></div>
                <div class="surah-separator-space"></div>
                <div class="surah-separator-line"></div>
            `;


            return separator;
        };


    /* =====================================================
       AYAH ELEMENT
       ===================================================== */

    Q.createAyahElement =
        function (ayah) {

            const element =
                document.createElement(
                    "span"
                );

            element.className =
                "mushaf-ayah";


            element.dataset.ayah =
                String(
                    ayah.number
                );


            element.dataset.ayahInSurah =
                String(
                    ayah.numberInSurah
                );


            if (
                ayah.surah?.number
            ) {

                element.dataset.surah =
                    String(
                        ayah.surah.number
                    );
            }


            let text =
                ayah.text || "";


            /*
             * إزالة البسملة من الآية الأولى
             * لأن البسملة تظهر منفصلة.
             */
            if (
                Number(
                    ayah.numberInSurah
                ) === 1
            ) {

                text =
                    Q.removeBasmala(
                        text
                    );
            }


            element.appendChild(
                document.createTextNode(
                    text
                )
            );


            element.appendChild(
                document.createTextNode(
                    " "
                )
            );


            const marker =
                document.createElement(
                    "span"
                );


            marker.className =
                "ayah-marker";


            marker.textContent =
                `﴿${Q.toArabicNumber(
                    ayah.numberInSurah
                )}﴾`;


            element.appendChild(
                marker
            );


            /*
             * الضغط على الآية
             */
            element.addEventListener(
                "click",
                async () => {

                    const index =
                        Q.state.currentSurah
                            ?.ayahs
                            .findIndex(
                                item =>
                                    item.number ===
                                    ayah.number
                            );


                    if (
                        index >= 0
                    ) {

                        await Q.showAyah(
                            index,
                            false
                        );

                        await Q.Audio.playCurrent(
                            false
                        );
                    }
                }
            );


            return element;
        };


    /* =====================================================
       RENDER PAGE
       ===================================================== */

    Q.renderPage =
        function (
            data,
            currentAyahNumber
        ) {

            if (
                !data?.ayahs ||
                !Array.isArray(
                    data.ayahs
                )
            ) {

                Q.dom.pageView.innerHTML =
                    `
                    <div class="page-loading">
                        لا توجد آيات لهذه الصفحة
                    </div>
                    `;

                return;
            }


            Q.dom.pageView.innerHTML =
                "";


            const page =
                document.createElement(
                    "div"
                );

            page.className =
                "mushaf-page";


            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "mushaf-page-header";


            header.textContent =
                `الصفحة ${
                    data.number ||
                    Q.state.currentPage
                }`;


            page.appendChild(
                header
            );


            const container =
                document.createElement(
                    "div"
                );

            container.className =
                "mushaf-ayahs";


            let lastSurah =
                null;


            data.ayahs.forEach(
                ayah => {

                    const surah =
                        ayah.surah || {};

                    const surahNumber =
                        Number(
                            surah.number
                        );


                    if (
                        surahNumber &&
                        surahNumber !==
                            lastSurah
                    ) {

                        if (
                            lastSurah !==
                            null
                        ) {

                            container.appendChild(
                                Q.createSurahSeparator()
                            );
                        }


                        container.appendChild(
                            Q.createSurahHeader(
                                surahNumber,
                                surah.name ||
                                    ""
                            )
                        );


                        lastSurah =
                            surahNumber;
                    }


                    container.appendChild(
                        Q.createAyahElement(
                            ayah
                        )
                    );


                    container.appendChild(
                        document.createTextNode(
                            " "
                        )
                    );
                }
            );


            page.appendChild(
                container
            );


            Q.dom.pageView.appendChild(
                page
            );


            Q.highlightAyah(
                currentAyahNumber
            );
        };


    /* =====================================================
       RENDER PAGE FOR AYAH
       ===================================================== */

    Q.renderPageForAyah =
        async function (ayah) {

            if (
                !ayah?.page
            ) {
                return;
            }


            const page =
                Number(
                    ayah.page
                );


            if (
                Q.state.currentPage !==
                page
            ) {

                Q.dom.pageView.innerHTML =
                    `
                    <div class="page-loading">
                        جاري تحميل الصفحة ${page}...
                    </div>
                    `;


                try {

                    const data =
                        await Q.getPageData(
                            page
                        );


                    Q.state.currentPage =
                        page;


                    Q.renderPage(
                        data,
                        ayah.number
                    );

                } catch (error) {

                    console.error(
                        "renderPageForAyah:",
                        error
                    );


                    Q.dom.pageView.innerHTML =
                        `
                        <div class="page-loading">
                            تعذر تحميل الصفحة
                        </div>
                        `;

                    return;
                }

            } else {

                Q.highlightAyah(
                    ayah.number
                );
            }


            if (
                Q.dom.pageNumber
            ) {

                Q.dom.pageNumber.textContent =
                    `صفحة ${page}`;
            }
        };


    /* =====================================================
       HIGHLIGHT
       ===================================================== */

    Q.highlightAyah =
        function (ayahNumber) {

            Q.dom.pageView
                .querySelectorAll(
                    ".mushaf-ayah"
                )
                .forEach(
                    element =>
                        element.classList.remove(
                            "current-reading"
                        )
                );


            const current =
                Q.dom.pageView.querySelector(
                    `.mushaf-ayah[data-ayah="${ayahNumber}"]`
                );


            if (!current) {
                return;
            }


            current.classList.add(
                "current-reading"
            );


            requestAnimationFrame(
                () => {

                    current.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                        inline: "nearest"
                    });
                }
            );
        };


    /* =====================================================
       SHOW AYAH
       ===================================================== */

    Q.showAyah =
        async function (
            index,
            resetAudio = true
        ) {

            const surah =
                Q.state.currentSurah;


            if (!surah) {
                return;
            }


            if (
                index < 0 ||
                index >=
                    surah.ayahs.length
            ) {
                return;
            }


            Q.state.currentAyahIndex =
                index;


            const ayah =
                surah.ayahs[index];


            Q.dom.surahName.textContent =
                surah.name;


            if (
                Q.dom.ayahCounter
            ) {

                Q.dom.ayahCounter.textContent =
                    `الآية ${ayah.numberInSurah} • الصفحة ${ayah.page}`;
            }


            await Q.renderPageForAyah(
                ayah
            );


            if (resetAudio) {

                Q.state.token++;

                Q.Audio.stop();

                Q.resetProgress();
            }
        };


    /* =====================================================
       GO TO AYAH
       الانتقال إلى رقم آية محدد داخل السورة الحالية
       ===================================================== */

    Q.goToAyah =
        async function (ayahNumber) {

            const surah =
                Q.state.currentSurah;


            if (!surah) {

                alert(
                    "اختر سورة أولًا."
                );

                return false;
            }


            const n =
                Number(ayahNumber);


            if (
                !Number.isFinite(n) ||
                n < 1
            ) {

                alert(
                    "أدخل رقم آية صحيح."
                );

                return false;
            }


            if (
                n >
                surah.ayahs.length
            ) {

                alert(
                    `رقم الآية يجب أن يكون بين 1 و ${surah.ayahs.length}.`
                );

                return false;
            }


            /*
             * البحث بمكان رقم الآية داخل السورة
             */
            const index =
                surah.ayahs.findIndex(
                    ayah =>
                        ayah.numberInSurah ===
                        n
                );


            if (index < 0) {

                alert(
                    "لم يتم العثور على الآية."
                );

                return false;
            }


            /*
             * إيقاف أي تشغيل جارٍ قبل الانتقال
             */
            Q.state.token++;

            Q.Audio.stop();

            Q.resetProgress();

            Q.setButton(false);


            /*
             * الانتقال إلى الآية
             * (سيقوم بتحميل الصفحة إن لزم)
             */
            await Q.showAyah(
                index,
                false
            );


            return true;
        };


    /* =====================================================
       LOAD SURAH
       ===================================================== */

    Q.loadSurah =
        async function (
            number,
            autoplay = false
        ) {

            const token =
                ++Q.state.token;

            const n =
                Number(number);


            Q.Audio.stop();

            Q.setButton(false);

            Q.resetProgress();


            Q.state.currentPage =
                null;

            Q.state.isBasmala =
                false;


            Q.dom.surahName.textContent =
                "جاري تحميل السورة...";


            Q.dom.pageView.innerHTML =
                `
                <div class="page-loading">
                    جاري تجهيز السورة...
                </div>
                `;


            try {

                /*
                 * تجهيز البيانات والصوت معاً.
                 */
                const preparedPromise =
                    Q.prepareSurah(n);


                Q.Audio.prepareFirstForSurah(
                    n
                );


                const prepared =
                    await preparedPromise;


                if (
                    token !==
                    Q.state.token
                ) {
                    return;
                }


                Q.state.currentSurah =
                    prepared;


                Q.state.currentAyahIndex =
                    0;


                /*
                 * تحديث نطاق حقل رقم الآية
                 * حسب عدد آيات السورة.
                 */
                if (Q.dom.ayahInput) {

                    Q.dom.ayahInput.max =
                        prepared.ayahs.length;

                    Q.dom.ayahInput.placeholder =
                        `1 - ${prepared.ayahs.length}`;

                    Q.dom.ayahInput.value =
                        "";
                }


                if (
                    Q.dom.surahSelect
                ) {

                    Q.dom.surahSelect.value =
                        n;
                }


                const first =
                    prepared.ayahs[0];


                if (first) {

                    /*
                     * تجهيز الصفحة والصوت معاً.
                     */
                    const pagePromise =
                        Q.getPageData(
                            first.page
                        );


                    Q.Audio.preloadForSurah(
                        prepared,
                        0
                    );


                    await pagePromise;


                    await Q.showAyah(
                        0,
                        false
                    );
                }


                /*
                 * تجهيز السورة التالية
                 * في الخلفية.
                 */
                Q.Audio.prepareNextSurah(
                    n + 1
                );


                if (autoplay) {

                    await Q.Audio.playCurrent(
                        true
                    );
                }

            } catch (error) {

                if (
                    token !==
                    Q.state.token
                ) {
                    return;
                }


                console.error(
                    "loadSurah:",
                    error
                );


                Q.state.currentSurah =
                    null;


                Q.dom.surahName.textContent =
                    "حدث خطأ";


                Q.dom.pageView.innerHTML =
                    `
                    <div class="page-loading">
                        تعذر تحميل السورة
                    </div>
                    `;
            }
        };
})();