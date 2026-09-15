/* =========================================================
   QURAN APP
   التحكم بالواجهة فقط
   ========================================================= */

(() => {
    "use strict";

    const Q = window.QuranApp;

    if (!Q) {
        throw new Error("QuranApp core is not loaded");
    }


    /* =====================================================
       INITIALIZE
       ===================================================== */

    function initialize() {

        const {
            surahSelect,
            playBtn,
            fullscreenBtn,
            ayahInput,
            goToAyahBtn
        } = Q.dom;


        /* =================================================
           AUDIO ELEMENT — iOS / Android background fix
           ================================================= */

        if (Q.dom.audio) {

            Q.dom.audio.setAttribute("playsinline", "");
            Q.dom.audio.setAttribute("webkit-playsinline", "");
            Q.dom.audio.setAttribute("preload", "auto");
            Q.dom.audio.setAttribute("crossorigin", "anonymous");
        }


        /* =================================================
           SURAH SELECT
           ================================================= */

        if (surahSelect) {

            surahSelect.addEventListener(
                "change",
                async () => {

                    const number =
                        Number(
                            surahSelect.value
                        );


                    if (!number) {
                        return;
                    }


                    await Q.loadSurah(
                        number,
                        false
                    );
                }
            );
        }


        /* =================================================
           GO TO AYAH
           ================================================= */

        async function handleGoToAyah() {

            if (!ayahInput) {
                return;
            }


            const value =
                Number(
                    ayahInput.value
                );


            if (!value) {

                ayahInput.focus();

                return;
            }


            const ok =
                await Q.goToAyah(
                    value
                );


            if (ok) {

                ayahInput.value =
                    "";

                ayahInput.blur();
            }
        }


        if (goToAyahBtn) {

            goToAyahBtn.addEventListener(
                "click",
                handleGoToAyah
            );
        }


        if (ayahInput) {

            ayahInput.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key ===
                        "Enter"
                    ) {

                        event.preventDefault();

                        handleGoToAyah();
                    }


                    if (
                        event.key ===
                        "Escape"
                    ) {

                        ayahInput.value =
                            "";

                        ayahInput.blur();
                    }
                }
            );
        }


        /* =================================================
           PLAY / PAUSE
           ================================================= */

        if (playBtn) {

            playBtn.addEventListener(
                "click",
                async () => {

                    try {

                        await Q.Audio.toggle();

                    } catch (error) {

                        console.error(
                            "Audio:",
                            error
                        );
                    }
                }
            );
        }


        /* =================================================
           FULLSCREEN
           ================================================= */

        if (fullscreenBtn) {

            fullscreenBtn.addEventListener(
                "click",
                async () => {

                    const container =
                        document.querySelector(
                            ".ayah-container"
                        ) ||
                        document.getElementById(
                            "ayahContainer"
                        ) ||
                        Q.dom.pageView;


                    if (!container) {
                        return;
                    }


                    try {

                        if (
                            !document.fullscreenElement
                        ) {

                            await container.requestFullscreen();

                        } else {

                            await document.exitFullscreen();
                        }

                    } catch (error) {

                        console.error(
                            "Fullscreen:",
                            error
                        );
                    }
                }
            );
        }


        /* =================================================
           KEYBOARD

           Space = تشغيل / إيقاف فقط

           تم إلغاء:
           ArrowLeft  = الآية السابقة
           ArrowRight = الآية التالية
        ================================================= */

        document.addEventListener(
            "keydown",
            event => {

                const tag =
                    document.activeElement?.tagName;


                /*
                 * لا نتدخل أثناء الكتابة أو
                 * اختيار السورة.
                 */
                if (
                    tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    tag === "SELECT"
                ) {

                    return;
                }


                /*
                 * Space
                 * تشغيل / إيقاف
                 */
                if (
                    event.code === "Space"
                ) {

                    event.preventDefault();

                    Q.Audio.toggle();
                }
            }
        );


        /* =================================================
           VISIBILITY CHANGE
           الحفاظ على تزامن MediaSession مع حالة التشغيل
           ================================================= */

        document.addEventListener(
            "visibilitychange",
            () => {

                if (
                    !("mediaSession" in navigator)
                ) {
                    return;
                }

                try {

                    navigator.mediaSession.playbackState =
                        Q.state.isPlaying
                            ? "playing"
                            : "paused";

                } catch (_) {}
            }
        );


        /* =================================================
           LOAD SURAHS
           ================================================= */

        Q.loadSurahs()
            .catch(
                error => {

                    console.error(
                        "Load Surahs:",
                        error
                    );
                }
            );
    }


    /* =====================================================
       START APPLICATION
       ===================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );

    } else {

        initialize();
    }

})();