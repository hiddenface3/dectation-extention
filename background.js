// Background Script — Dictation Automator
// Handles routing shortcut to ChatGPT, Grok, Gemini, or Active Tab, and OS-level paste.

let isRecording = false;
let activeServiceTab = null;
let currentStopAction = 'STOP_DICTATION';

// ─── SHORTCUT HANDLER ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-dictation') return;

    const { targetService, grokDictation, extensionEnabled } = await chrome.storage.local.get(['targetService', 'grokDictation', 'extensionEnabled']);
    if (extensionEnabled === false) return;

    let service = targetService || (grokDictation ? 'grok' : 'chatgpt');

    if (isRecording && activeServiceTab !== null) {
        // ── STOP dictation ──────────────────────────────────────────────────
        chrome.tabs.sendMessage(activeServiceTab, { action: currentStopAction }, () => {
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
        isRecording = false;
        activeServiceTab = null;
        nativeMessage({ action: 'paste', text: message.text, windowTitle: message.windowTitle || '' });
    }
    if (message.action === 'DICTATION_FAILED') {
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

// ─── TAB SWITCHING & ROUTING ────────────────────────────────────────────────
async function handleSwitchAndStart(service) {
    let urlPattern = '*://chatgpt.com/*';
    let openUrl = 'https://chatgpt.com';
    let startAction = 'START_DICTATION';
    let stopAction = 'STOP_DICTATION';
    let windowTitle = 'ChatGPT';

    if (service === 'grok') {
        urlPattern = '*://grok.com/*';
        openUrl = 'https://grok.com';
        startAction = 'START_GROK_DICTATION';
        stopAction = 'STOP_GROK_DICTATION';
        windowTitle = 'Grok';
    } else if (service === 'gemini') {
        urlPattern = '*://gemini.google.com/*';
        openUrl = 'https://gemini.google.com';
        startAction = 'START_GEMINI_DICTATION';
        stopAction = 'STOP_GEMINI_DICTATION';
        windowTitle = 'Gemini';
    } else if (service === 'active_tab') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
            activeServiceTab = activeTab.id;
            const url = activeTab.url || '';
            if (url.includes('grok.com')) {
                startAction = 'START_GROK_DICTATION';
                stopAction = 'STOP_GROK_DICTATION';
            } else if (url.includes('gemini.google.com')) {
                startAction = 'START_GEMINI_DICTATION';
                stopAction = 'STOP_GEMINI_DICTATION';
            } else {
                startAction = 'START_DICTATION';
                stopAction = 'STOP_DICTATION';
            }
            currentStopAction = stopAction;

            chrome.tabs.sendMessage(activeTab.id, { action: startAction }, (res) => {
                if (chrome.runtime.lastError) {
                    // Try injecting script dynamically
                    chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['content.js'] }, () => {
                        chrome.tabs.sendMessage(activeTab.id, { action: startAction });
                    });
                }
            });
            return;
        }
    }

    currentStopAction = stopAction;

    // Save current active tab before switching
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (currentTab) {
        await chrome.storage.local.set({ originalTabId: currentTab.id });
    }

    const tabs = await chrome.tabs.query({ url: urlPattern });

    if (tabs.length === 0) {
        const newTab = await chrome.tabs.create({ url: openUrl, active: true });
        activeServiceTab = newTab.id;
        setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id, { action: startAction });
        }, 2500);
        return;
    }

    const targetTab = tabs[0];
    activeServiceTab = targetTab.id;

    await nativeMessage({ action: 'focus', windowTitle });
    await chrome.windows.update(targetTab.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(targetTab.id, { active: true });

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
