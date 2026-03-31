// Background Script

// Listen for the NATIVE Chrome Command
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-dictation') {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab) return;

        // Check if we are ON the ChatGPT tab
        if (currentTab.url && currentTab.url.includes('chatgpt.com')) {
            // SCENARIO A: Already on ChatGPT -> Just Toggle Local State (Start/Stop)
            // We do NOT switch tabs here.
            chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_LOCAL' });
        } else {
            // SCENARIO B: On another tab -> Switch to ChatGPT & Start
            // Save current tab to switch back later if needed
            await chrome.storage.local.set({ originalTabId: currentTab.id });
            handleSwitchAndStart(currentTab);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TEXT_COPIED') {
        handlePasteLocallyOrGlobally(message.text);
    }
});

async function handlePasteLocallyOrGlobally(text) {
    const { autoPasteGlobal, autoPasteBrowser, originalTabId } = await chrome.storage.local.get(['autoPasteGlobal', 'autoPasteBrowser', 'originalTabId']);

    if (autoPasteGlobal) {
        // Send to native python script to simulate Ctrl+V
        chrome.runtime.sendNativeMessage('com.dictation.automator', { text: text }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Native Messaging Error: ", chrome.runtime.lastError.message);
            } else {
                console.log("Native host response:", response);
            }
        });
    } else if (autoPasteBrowser && originalTabId) {
        // Switch back to original tab and paste there via content injection
        try {
            // Get the original tab to find its window ID
            const originalTab = await chrome.tabs.get(originalTabId);
            
            // Focus the window first, then make the tab active
            await chrome.windows.update(originalTab.windowId, { focused: true });
            await chrome.tabs.update(originalTabId, { active: true });
            
            // Inject script to find active element and insert text
            await chrome.scripting.executeScript({
                target: { tabId: originalTabId },
                func: (copiedText) => {
                    // Try giving Chrome a slight delay to fully switch focus
                    setTimeout(() => {
                        const el = document.activeElement;
                        if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                             // Insert text at cursor position for input/textarea
                             const start = el.selectionStart;
                             const end = el.selectionEnd;
                             el.value = el.value.substring(0, start) + copiedText + el.value.substring(end);
                             el.selectionStart = el.selectionEnd = start + copiedText.length;
                             el.dispatchEvent(new Event('input', { bubbles: true }));
                        } else if (el && el.isContentEditable) {
                             // Insert text for contenteditable (like Google Docs sometimes, or rich text editors)
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
            
            // Clear the original tab ID so we don't accidentally switch back to it again on next manual copy
            await chrome.storage.local.remove('originalTabId');
            
        } catch (err) {
            console.error("Failed to switch/paste in browser:", err);
        }
    }
}

async function handleSwitchAndStart(currentTab) {
    // 1. Find ChatGPT
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    if (tabs.length === 0) {
        console.warn('ChatGPT not found');
        return;
    }

    const chatGptTab = tabs[0];

    // 2. Switch to ChatGPT
    // Ensure window is focused and not minimized
    if (chatGptTab.windowId !== currentTab.windowId) {
        await chrome.windows.update(chatGptTab.windowId, { focused: true, state: 'normal' });
    }
    await chrome.tabs.update(chatGptTab.id, { active: true });

    // 3. Send START command
    setTimeout(() => {
        chrome.tabs.sendMessage(chatGptTab.id, { action: 'START_DICTATION' });
    }, 200);
}
