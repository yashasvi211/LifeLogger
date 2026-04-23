/**
 * LifeLogger — Chrome Extension background service worker.
 *
 * Event-driven tab tracking. On each event (tab switch, update, focus change,
 * idle state change) it calculates how long the previous tab was active/idle,
 * then POSTs a log to the local daemon.
 */

const DAEMON_URL = "http://localhost:7777/log/tab";
const FLUSH_ALARM = "lifelogger-flush";
const FLUSH_INTERVAL_MIN = 0.5; // 30 seconds
const IDLE_DETECTION_SECONDS = 120;

// ── State ────────────────────────────────────────────────────────────────

let currentTab = {
    tabId: null,
    url: "",
    domain: "",
    title: "",
    startTime: Date.now(),
    isIdle: false,
    activeMs: 0,
    idleMs: 0,
    ytProgress: null,
};

let browserFocused = true;

// ── Helpers ──────────────────────────────────────────────────────────────

function extractDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname + (u.port ? ":" + u.port : "");
    } catch {
        return "";
    }
}

function categorize(domain) {
    if (!domain) return "other";
    if (domain.startsWith("localhost") || domain.startsWith("127.0.0.1"))
        return "development";
    if (domain.includes("youtube.com")) return "youtube";
    if (domain.includes("instagram.com") || domain.includes("reddit.com"))
        return "social";
    return "other";
}

function accumulateTime() {
    const now = Date.now();
    const elapsed = now - currentTab.startTime;
    if (currentTab.isIdle || !browserFocused) {
        currentTab.idleMs += elapsed;
    } else {
        currentTab.activeMs += elapsed;
    }
    currentTab.startTime = now;
}

// ── Flush to daemon ──────────────────────────────────────────────────────

async function flushCurrentTab() {
    accumulateTime();

    const activeSec = currentTab.activeMs / 1000;
    const idleSec = currentTab.idleMs / 1000;

    // Don't send empty records
    if (activeSec < 0.5 && idleSec < 0.5) return;
    if (!currentTab.url) return;

    const payload = {
        timestamp: new Date().toISOString(),
        url: currentTab.url,
        domain: currentTab.domain,
        title: currentTab.title,
        active_seconds: Math.round(activeSec * 100) / 100,
        idle_seconds: Math.round(idleSec * 100) / 100,
        yt_progress: currentTab.ytProgress,
        category: categorize(currentTab.domain),
    };

    // Reset counters (keep tracking same tab)
    currentTab.activeMs = 0;
    currentTab.idleMs = 0;

    try {
        await fetch(DAEMON_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    } catch {
        // Daemon down — silently drop
    }
}

// ── Switch to a new tab ──────────────────────────────────────────────────

async function switchTo(tabId) {
    // Flush whatever was being tracked
    await flushCurrentTab();

    // Query the new tab's info
    let tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch {
        return; // tab closed or invalid
    }

    const url = tab.url || tab.pendingUrl || "";
    const domain = extractDomain(url);

    currentTab = {
        tabId: tabId,
        url: url,
        domain: domain,
        title: tab.title || "",
        startTime: Date.now(),
        isIdle: false,
        activeMs: 0,
        idleMs: 0,
        ytProgress: null,
    };

    // If YouTube, request progress from content script
    if (domain.includes("youtube.com")) {
        requestYTProgress(tabId);
    }
}

// ── YouTube progress via content script ──────────────────────────────────

function requestYTProgress(tabId) {
    try {
        chrome.tabs.sendMessage(tabId, { type: "GET_YT_PROGRESS" }, (response) => {
            if (chrome.runtime.lastError) return; // content script not ready
            if (response && response.progress !== undefined) {
                currentTab.ytProgress = response.progress;
            }
        });
    } catch {
        // ignore
    }
}

// Listen for progress pushed from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "YT_PROGRESS" && sender.tab) {
        if (sender.tab.id === currentTab.tabId) {
            currentTab.ytProgress = message.progress;
            if (message.title) {
                currentTab.title = message.title;
            }
        }
    }
});

// ── Event listeners ──────────────────────────────────────────────────────

// Tab activated (user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
    switchTo(activeInfo.tabId);
});

// Tab updated (page navigation within same tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId !== currentTab.tabId) return;
    if (changeInfo.status === "complete" || changeInfo.url) {
        const newUrl = tab.url || tab.pendingUrl || "";
        const newDomain = extractDomain(newUrl);

        // If the domain/url actually changed, treat it as a switch
        if (newUrl !== currentTab.url) {
            switchTo(tabId);
        } else {
            // Just update the title
            currentTab.title = tab.title || currentTab.title;
        }
    }
});

// Window focus changed
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        accumulateTime();
        browserFocused = false;
        currentTab.startTime = Date.now();
    } else {
        // Browser regained focus
        accumulateTime();
        browserFocused = true;
        currentTab.startTime = Date.now();

        // Re-query the active tab in the focused window
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs && tabs.length > 0 && tabs[0].id !== currentTab.tabId) {
                switchTo(tabs[0].id);
            }
        });
    }
});

// Chrome idle state changed
chrome.idle.onStateChanged.addListener((state) => {
    accumulateTime();
    currentTab.isIdle = state !== "active";
    currentTab.startTime = Date.now();
});

// Keep browser idle detection aligned with the desktop watcher.
chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);

// ── Periodic flush (30 s alarm) ──────────────────────────────────────────

chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_INTERVAL_MIN });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) {
        flushCurrentTab();
    }
});

// ── Initialization ───────────────────────────────────────────────────────

// On service worker start, pick up the currently active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        const url = tab.url || tab.pendingUrl || "";
        const domain = extractDomain(url);
        currentTab = {
            tabId: tab.id,
            url: url,
            domain: domain,
            title: tab.title || "",
            startTime: Date.now(),
            isIdle: false,
            activeMs: 0,
            idleMs: 0,
            ytProgress: null,
        };
    }
});
