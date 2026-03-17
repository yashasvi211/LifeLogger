/**
 * LifeLogger — YouTube content script.
 *
 * Injected only on youtube.com pages.
 * Reads video progress and sends it to the background service worker.
 */

// ── Read video progress ──────────────────────────────────────────────────

function getYTProgress() {
    const video = document.querySelector("video");
    if (!video || !video.duration) return null;
    return Math.round((video.currentTime / video.duration) * 1000) / 1000;
}

// ── Respond to requests from background.js ───────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_YT_PROGRESS") {
        sendResponse({
            progress: getYTProgress(),
            title: document.title,
        });
    }
    return false; // synchronous response
});

// ── Periodically push progress to background.js ─────────────────────────

setInterval(() => {
    const progress = getYTProgress();
    if (progress !== null) {
        chrome.runtime.sendMessage({
            type: "YT_PROGRESS",
            progress: progress,
            title: document.title,
        });
    }
}, 5000); // every 5 seconds while on YouTube
