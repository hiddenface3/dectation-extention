// Background Script — Dictation Automator
// Handles routing shortcut to ChatGPT or Grok, and OS-level paste via native host.

// ─── SHORTCUT HANDLER ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-dictation') return;

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab) return;

    const { grokDictation } = await chrome.storage.local.get(['grokDictation']);

    if (grokDictation) {
        // ── GROK MODE ──
        if (currentTab.url && currentTab.url.includes('grok.com')) {
            chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_GROK_LOCAL' });
        } else {
            await chrome.storage.local.set({ originalTabId: currentTab.id });
            handleSwitchAndStart('grok');
        }
    } else {
        // ── CHATGPT MODE ──
        if (currentTab.url && currentTab.url.includes('chatgpt.com')) {
            chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_LOCAL' });
        } else {
            await chrome.storage.local.set({ originalTabId: currentTab.id });
            handleSwitchAndStart('chatgpt');
        }
    }
});

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TEXT_COPIED') {
        // Unified OS-level paste: minimize source window by title, then Ctrl+V
        nativeMessage({ action: 'paste', text: message.text, windowTitle: message.windowTitle || '' });
    }
});

// ─── NATIVE HOST HELPERS ─────────────────────────────────────────────────────

/** Send a message to the native host and return a Promise of the response. */
function nativeMessage(payload) {
    return new Promise((resolve) => {
        chrome.runtime.sendNativeMessage('com.dictation.automator', payload, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Dictation] Native host:', chrome.runtime.lastError.message);
            }
            resolve(response);
        });
    });
}

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────

async function handleSwitchAndStart(service) {
    const isGrok      = service === 'grok';
    const urlPattern  = isGrok ? '*://grok.com/*'        : '*://chatgpt.com/*';
    const openUrl     = isGrok ? 'https://grok.com'      : 'https://chatgpt.com';
    const startAction = isGrok ? 'START_GROK_DICTATION'  : 'START_DICTATION';
    const windowTitle = isGrok ? 'Grok'                  : 'ChatGPT';

    const tabs = await chrome.tabs.query({ url: urlPattern });

    if (tabs.length === 0) {
        // Tab not open → create it and wait for page load
        const newTab = await chrome.tabs.create({ url: openUrl, active: true });
        setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id, { action: startAction });
        }, 2500);
        return;
    }

    const targetTab = tabs[0];

    // ── Step 1: OS-level focus via native host (most reliable) ──────────────
    // win32 SetForegroundWindow works when called from a browser-launched process.
    // This handles cases where the PWA window is behind other apps.
    await nativeMessage({ action: 'focus', windowTitle });

    // ── Step 2: Browser API fallback (belt & suspenders) ────────────────────
    // Restore minimized state and activate the tab via the browser's own APIs.
    await chrome.windows.update(targetTab.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(targetTab.id, { active: true });

    // ── Step 3: Start dictation after window has settled ────────────────────
    // 600ms gives enough time for the window to come to the front and the
    // page to be in an interactive state before we click the dictation button.
    setTimeout(() => {
        chrome.tabs.sendMessage(targetTab.id, { action: startAction });
    }, 600);
}
