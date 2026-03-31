// Background Script

// Listen for the NATIVE Chrome Command
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-dictation') {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab) return;

        // Read settings
        const { grokDictation } = await chrome.storage.local.get(['grokDictation']);

        if (grokDictation) {
            // --- GROK MODE ---
            if (currentTab.url && currentTab.url.includes('grok.com')) {
                // Already on Grok → toggle local
                chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_GROK_LOCAL' });
            } else {
                // Switch to Grok tab and start
                await chrome.storage.local.set({ originalTabId: currentTab.id });
                handleSwitchAndStartGrok(currentTab);
            }
        } else {
            // --- CHATGPT MODE (original logic) ---
            if (currentTab.url && currentTab.url.includes('chatgpt.com')) {
                chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_LOCAL' });
            } else {
                await chrome.storage.local.set({ originalTabId: currentTab.id });
                handleSwitchAndStart(currentTab);
            }
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TEXT_COPIED') {
        handlePasteLocallyOrGlobally(message.text, { fromGrok: false });
    } else if (message.action === 'TEXT_COPIED_GROK') {
        handlePasteLocallyOrGlobally(message.text, { fromGrok: true });
    }
});

async function handlePasteLocallyOrGlobally(text, options = {}) {
    const { autoPasteGlobal, autoPasteBrowser, originalTabId, grokDictation } = await chrome.storage.local.get(['autoPasteGlobal', 'autoPasteBrowser', 'originalTabId', 'grokDictation']);

    // GROK MODE: Always use native host to minimize Grok PWA and Ctrl+V paste
    // This works for both desktop apps AND browser tabs since Grok is a separate PWA window
    if (grokDictation && options.fromGrok) {
        chrome.runtime.sendNativeMessage('com.dictation.automator', { text: text, minimizeGrok: true }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Native Messaging Error (Grok): ", chrome.runtime.lastError.message);
            } else {
                console.log("Grok native host response:", response);
            }
        });
        return;
    }

    if (autoPasteGlobal) {
        // ChatGPT mode: Send to native python script to simulate Ctrl+V
        chrome.runtime.sendNativeMessage('com.dictation.automator', { text: text, minimizeGrok: false }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Native Messaging Error: ", chrome.runtime.lastError.message);
            } else {
                console.log("Native host response:", response);
            }
        });
    } else if (autoPasteBrowser && originalTabId) {
        // Switch back to original tab and paste there via content injection
        try {
            const originalTab = await chrome.tabs.get(originalTabId);
            await chrome.windows.update(originalTab.windowId, { focused: true });
            await chrome.tabs.update(originalTabId, { active: true });

            await chrome.scripting.executeScript({
                target: { tabId: originalTabId },
                func: (copiedText) => {
                    setTimeout(() => {
                        const el = document.activeElement;
                        if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            el.value = el.value.substring(0, start) + copiedText + el.value.substring(end);
                            el.selectionStart = el.selectionEnd = start + copiedText.length;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                        } else if (el && el.isContentEditable) {
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                range.deleteContents();
                                range.insertNode(document.createTextNode(copiedText));
                                range.collapse(false);
                            }
                        } else {
                            console.log("No editable active element found to paste into.");
                        }
                    }, 100);
                },
                args: [text]
            });

            await chrome.storage.local.remove('originalTabId');
        } catch (err) {
            console.error("Failed to switch/paste in browser:", err);
        }
    }
}

// Switch to ChatGPT and start dictation
async function handleSwitchAndStart(currentTab) {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    if (tabs.length === 0) {
        console.warn('ChatGPT not found');
        return;
    }

    const chatGptTab = tabs[0];
    if (chatGptTab.windowId !== currentTab.windowId) {
        await chrome.windows.update(chatGptTab.windowId, { focused: true, state: 'normal' });
    }
    await chrome.tabs.update(chatGptTab.id, { active: true });

    setTimeout(() => {
        chrome.tabs.sendMessage(chatGptTab.id, { action: 'START_DICTATION' });
    }, 200);
}

// Switch to Grok and start dictation
async function handleSwitchAndStartGrok(currentTab) {
    const tabs = await chrome.tabs.query({ url: '*://grok.com/*' });

    let grokTab;
    if (tabs.length === 0) {
        // Open Grok in a new tab
        grokTab = await chrome.tabs.create({ url: 'https://grok.com', active: true });
        // Wait for page to load before sending message
        setTimeout(() => {
            chrome.tabs.sendMessage(grokTab.id, { action: 'START_GROK_DICTATION' });
        }, 2500);
        return;
    }

    grokTab = tabs[0];
    if (grokTab.windowId !== currentTab.windowId) {
        await chrome.windows.update(grokTab.windowId, { focused: true, state: 'normal' });
    }
    await chrome.tabs.update(grokTab.id, { active: true });

    setTimeout(() => {
        chrome.tabs.sendMessage(grokTab.id, { action: 'START_GROK_DICTATION' });
    }, 200);
}
