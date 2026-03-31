// Background Script — Dictation Automator
// Handles routing shortcut to ChatGPT or Grok, and OS-level paste via native host.

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
// Tracking recording state here (not in content.js) ensures the shortcut always
// knows whether to START or STOP, regardless of which tab is currently focused.

let isRecording = false;
let activeServiceTab = null; // tabId of the tab currently doing dictation

// ─── SHORTCUT HANDLER ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-dictation') return;

    const { grokDictation, extensionEnabled } = await chrome.storage.local.get(['grokDictation', 'extensionEnabled']);
    if (extensionEnabled === false) return;

    const service = grokDictation ? 'grok' : 'chatgpt';

    if (isRecording && activeServiceTab !== null) {
        // ── STOP dictation ──────────────────────────────────────────────────
        // Send stop to the tab that started recording, regardless of what's active now
        const stopAction = service === 'grok' ? 'STOP_GROK_DICTATION' : 'STOP_DICTATION';
        chrome.tabs.sendMessage(activeServiceTab, { action: stopAction }, () => {
            if (chrome.runtime.lastError) {
                console.warn('[Dictation] Stop message failed:', chrome.runtime.lastError.message);
            }
        });
        isRecording = false;
        activeServiceTab = null;
    } else {
        // ── START dictation ─────────────────────────────────────────────────
        isRecording = true;
        await handleSwitchAndStart(service);
    }
});

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TEXT_COPIED') {
        // Unified OS-level paste: minimize source window by title, then Ctrl+V
        isRecording = false;
        activeServiceTab = null;
        nativeMessage({ action: 'paste', text: message.text, windowTitle: message.windowTitle || '' });
    }
    if (message.action === 'DICTATION_FAILED') {
        // Content script signals that something went wrong — reset state
        isRecording = false;
        activeServiceTab = null;
    }
});

// ─── NATIVE HOST ─────────────────────────────────────────────────────────────

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
    const urlPattern  = isGrok ? '*://grok.com/*'       : '*://chatgpt.com/*';
    const openUrl     = isGrok ? 'https://grok.com'     : 'https://chatgpt.com';
    const startAction = isGrok ? 'START_GROK_DICTATION' : 'START_DICTATION';
    const windowTitle = isGrok ? 'Grok'                 : 'ChatGPT';

    // Save the tab the user was on before switching
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (currentTab) {
        await chrome.storage.local.set({ originalTabId: currentTab.id });
    }

    const tabs = await chrome.tabs.query({ url: urlPattern });

    if (tabs.length === 0) {
        // Tab not open → create it and wait for page to load
        const newTab = await chrome.tabs.create({ url: openUrl, active: true });
        activeServiceTab = newTab.id;
        setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id, { action: startAction });
        }, 2500);
        return;
    }

    const targetTab = tabs[0];
    activeServiceTab = targetTab.id;

    // ── Step 1: OS-level focus (Win32 SetForegroundWindow + AttachThreadInput) ──
    await nativeMessage({ action: 'focus', windowTitle });

    // ── Step 2: Browser API backup ───────────────────────────────────────────
    await chrome.windows.update(targetTab.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(targetTab.id, { active: true });

    // ── Step 3: Start dictation after window has settled ─────────────────────
    setTimeout(() => {
        chrome.tabs.sendMessage(targetTab.id, { action: startAction }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Dictation] Start message failed:', chrome.runtime.lastError.message);
                isRecording = false;
                activeServiceTab = null;
            }
        });
    }, 700);
}
