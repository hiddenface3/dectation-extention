(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.hasRunDictationAutomator) return;
    window.hasRunDictationAutomator = true;

    // Constants
    const SELECTORS = {
        DICTATE_BUTTON_CANDIDATES: [
            // Aria-label variants
            'button[aria-label="Dictate button"]',
            'button[aria-label="Dictate"]',
            'button[aria-label="Voice input"]',
            'button[aria-label="Start dictation"]',
            'button[aria-label="dictate"]',
            // Exact structural path from user (ChatGPT current DOM)
            '#thread-bottom > div > div > div > div.pointer-events-auto.relative.z-1.flex.h-\\(--composer-container-height\\,100\\%\\).max-w-full.flex-\\(--composer-container-flex\\,1\\).flex-col > form > div:nth-child(2) > div > div.flex.items-center.gap-2.\\[grid-area\\:trailing\\] > div > span > button',
        ],
        SUBMIT_DICTATION_BUTTON: 'button[aria-label="Submit dictation"]',
        INPUT_FIELD: '#prompt-textarea'
    };

    // Find dictation button using multiple selector strategies
    function findDictateButton() {
        // Try all candidate selectors first
        for (const sel of SELECTORS.DICTATE_BUTTON_CANDIDATES) {
            try {
                const el = document.querySelector(sel);
                if (el) return el;
            } catch(e) { /* invalid selector, skip */ }
        }
        // Fallback: find any button containing a mic SVG icon
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;
            const use = svg.querySelector('use');
            const href = use ? (use.getAttribute('href') || use.getAttribute('xlink:href') || '') : '';
            if (href.toLowerCase().includes('mic') || href.toLowerCase().includes('dictate')) return btn;
            // Check aria on the button itself
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('mic') || label.includes('dictate') || label.includes('voice')) return btn;
        }
        return null;
    }

    // State
    let isExtensionEnabled = true;
    let isRecording = false;

    function init() {
        if (typeof chrome === 'undefined' || !chrome.storage) return;

        injectToast();

        // Load state
        chrome.storage.local.get(['extensionEnabled'], (result) => {
            isExtensionEnabled = result.extensionEnabled !== false;
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.extensionEnabled) {
                isExtensionEnabled = changes.extensionEnabled.newValue;
            }
        });

        // NOTE: We REMOVED the global keydown listener. 
        // We now rely purely on background script messages triggered by chrome.commands.

        if (isChatGPT()) {
            chrome.runtime.onMessage.addListener(handleChatGPTMessage);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // --- LOGIC ---

    function isChatGPT() {
        return window.location.hostname.includes('chatgpt.com');
    }

    // Handle messages FROM Background
    function handleChatGPTMessage(message, sender, sendResponse) {
        if (!isExtensionEnabled) return;

        if (message.action === 'START_DICTATION') {
            performStart().then(sendResponse);
            return true;
        }
        else if (message.action === 'STOP_AND_COPY') {
            performStopAndCopy().then(sendResponse);
            return true;
        }
        else if (message.action === 'TOGGLE_LOCAL') {
            if (isRecording) {
                performStopAndCopy().then(sendResponse);
            } else {
                performStart().then(sendResponse);
            }
            return true;
        }
    }

    // ACTION: Start
    async function performStart() {
        // Clear logic
        const el = document.querySelector(SELECTORS.INPUT_FIELD);
        if (el) {
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
            else el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Wait for button using multi-selector strategy (retry for up to 3 seconds)
        const dictateBtn = await waitForDictateButton(3000);

        if (dictateBtn) {
            dictateBtn.click();
            isRecording = true; // Mark as recording
            showToast('Listening...');
            return { success: true };
        } else {
            showToast('Dictate button not found. (Try reloading ChatGPT)');
            return { success: false, error: 'Dictate button not found' };
        }
    }

    // Wait for dictate button using multi-selector strategy
    function waitForDictateButton(timeout = 3000) {
        return new Promise((resolve) => {
            const found = findDictateButton();
            if (found) return resolve(found);

            const observer = new MutationObserver(() => {
                const btn = findDictateButton();
                if (btn) {
                    observer.disconnect();
                    resolve(btn);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(findDictateButton()); // last chance attempt
            }, timeout);
        });
    }

    // Helper: Wait for element to appear
    function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver((mutations) => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // ACTION: Stop & Copy
    async function performStopAndCopy() {
        isRecording = false; // Mark as finished
        const submitBtn = document.querySelector(SELECTORS.SUBMIT_DICTATION_BUTTON);

        // If submitted, click it
        if (submitBtn) {
            submitBtn.click();
        }

        // Wait for text
        const text = await waitForText();
        if (text) {
            await copyToClipboard(text);
            return { success: true, text };
        } else {
            return { success: false, error: 'No text generated' };
        }
    }

    async function waitForText() {
        let attempts = 0;
        return new Promise((resolve) => {
            const intv = setInterval(() => {
                attempts++;
                const el = document.querySelector(SELECTORS.INPUT_FIELD);
                const text = el ? (el.innerText || el.value || el.textContent) : null;
                // We check if submit button is GONE, usually means generation started?
                // Or just check if text exists.
                if (text && text.trim().length > 0) {
                    clearInterval(intv);
                    resolve(text);
                } else if (attempts > 20) {
                    clearInterval(intv);
                    resolve(null);
                }
            }, 500);
        });
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to Clipboard!');
            
            // Notify background script that text has been copied successfully
            chrome.runtime.sendMessage({ action: 'TEXT_COPIED', text: text });
            
        } catch (err) {
            showToast('Copy Failed.');
        }
    }

    function injectToast() {
        if (document.getElementById('dictation-toast')) return;
        const div = document.createElement('div');
        div.id = 'dictation-toast';
        document.body.appendChild(div);
    }

    function showToast(msg) {
        const t = document.getElementById('dictation-toast');
        if (t) {
            t.textContent = msg;
            t.className = 'show';
            setTimeout(() => t.className = '', 3000);
        }
    }

})();
