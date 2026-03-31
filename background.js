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
        // Works for both ChatGPT and Grok PWA windows, and pastes into any app
        nativePaste(message.text, message.windowTitle || '');
    }
});

// ─── NATIVE HOST PASTE ───────────────────────────────────────────────────────

function nativePaste(text, windowTitle) {
    chrome.runtime.sendNativeMessage(
        'com.dictation.automator',
        { text, windowTitle },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Dictation] Native host error:', chrome.runtime.lastError.message);
            } else {
                console.log('[Dictation] Pasted via native host:', response);
            }
        }
    );
}

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────

async function handleSwitchAndStart(service) {
    const isGrok = service === 'grok';
    const urlPattern = isGrok ? '*://grok.com/*' : '*://chatgpt.com/*';
    const openUrl = isGrok ? 'https://grok.com' : 'https://chatgpt.com';
    const action = isGrok ? 'START_GROK_DICTATION' : 'START_DICTATION';

    const tabs = await chrome.tabs.query({ url: urlPattern });

    if (tabs.length === 0) {
        // Open new tab — wait for page to load before sending message
        const newTab = await chrome.tabs.create({ url: openUrl, active: true });
        setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id, { action });
        }, 2500);
        return;
    }

    const targetTab = tabs[0];
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (currentTab && targetTab.windowId !== currentTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true, state: 'normal' });
    }
    await chrome.tabs.update(targetTab.id, { active: true });

    setTimeout(() => {
        chrome.tabs.sendMessage(targetTab.id, { action });
    }, 200);
}
