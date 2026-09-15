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
           PLAY / PAUSE WITH USER GESTURE UNLOCK
           ================================================= */

        if (playBtn) {

            playBtn.addEventListener(
                "click",
                async () => {

                    try {

                        await Q.Audio.resume();

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
           ================================================= */

        document.addEventListener(
            "keydown",
            event => {

                const tag =
                    document.activeElement?.tagName;

                if (
                    tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    tag === "SELECT"
                ) {

                    return;
                }

                if (
                    event.code === "Space"
                ) {

                    event.preventDefault();

                    Q.Audio.resume();

                    Q.Audio.toggle();
                }
            }
        );


        /* =================================================
           INITIAL AUDIO PRELOAD
           ================================================= */

        Q.Audio.preload(
            `${Q.AUDIO_CDN}/` +
            `${Q.RECITER.folder}/` +
            `001001.mp3`
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