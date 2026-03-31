(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.hasRunDictationAutomator) return;
    window.hasRunDictationAutomator = true;

    // --- CHATGPT SELECTORS ---
    const CHATGPT_SELECTORS = {
        DICTATE_BUTTON_CANDIDATES: [
            'button[aria-label="Dictate button"]',
            'button[aria-label="Dictate"]',
            'button[aria-label="Voice input"]',
            'button[aria-label="Start dictation"]',
            'button[aria-label="dictate"]',
            '#thread-bottom > div > div > div > div.pointer-events-auto.relative.z-1.flex.h-\\(--composer-container-height\\,100\\%\\).max-w-full.flex-\\(--composer-container-flex\\,1\\).flex-col > form > div:nth-child(2) > div > div.flex.items-center.gap-2.\\[grid-area\\:trailing\\] > div > span > button',
        ],
        SUBMIT_DICTATION_BUTTON: 'button[aria-label="Submit dictation"]',
        INPUT_FIELD: '#prompt-textarea'
    };

    // --- GROK SELECTORS ---
    const GROK_SELECTORS = {
        DICTATE_BUTTON: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.flex.absolute.inset-x-0.bottom-0.border-2.border-transparent.max-w-full.p-2.\\@\\[480px\\]\\/input\\:p-2 > div > div.ms-auto.flex.flex-row.items-end.gap-0\\.5 > div.h-10.rounded-full.shrink-0.me-1.relative.flex.items-center.transition-\\[background-color\\,box-shadow\\].duration-150.ease-out.ring-0.ring-transparent > div > button',
        CONFIRM_BUTTON: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.flex.absolute.inset-x-0.bottom-0.border-2.border-transparent.max-w-full.p-2.\\@\\[480px\\]\\/input\\:p-2 > div > div.ms-auto.flex.flex-row.items-end.gap-0\\.5 > div.h-10.rounded-full.shrink-0.me-1.relative.flex.items-center.transition-\\[background-color\\,box-shadow\\].duration-150.ease-out.bg-surface-l2.ring-1.ring-inset.ring-border-l2.overflow-hidden > div > button.h-8.w-8.shrink-0.flex.items-center.justify-center.rounded-full.bg-button-filled.text-fg-invert',
        TEXT_FIELD: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.relative.z-10 > div > div > div > p'
    };

    // State
    let isExtensionEnabled = true;
    let isRecording = false;
    let isGrokRecording = false;

    function isChatGPT() {
        return window.location.hostname.includes('chatgpt.com');
    }

    function isGrok() {
        return window.location.hostname.includes('grok.com');
    }

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

        if (isChatGPT()) {
            chrome.runtime.onMessage.addListener(handleChatGPTMessage);
        }

        if (isGrok()) {
            chrome.runtime.onMessage.addListener(handleGrokMessage);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =============================================================
    //  CHATGPT LOGIC
    // =============================================================

    function findDictateButton() {
        for (const sel of CHATGPT_SELECTORS.DICTATE_BUTTON_CANDIDATES) {
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
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('mic') || label.includes('dictate') || label.includes('voice')) return btn;
        }
        return null;
    }

    function handleChatGPTMessage(message, sender, sendResponse) {
        if (!isExtensionEnabled) return;

        if (message.action === 'START_DICTATION') {
            performStart().then(sendResponse);
            return true;
        } else if (message.action === 'STOP_AND_COPY') {
            performStopAndCopy().then(sendResponse);
            return true;
        } else if (message.action === 'TOGGLE_LOCAL') {
            if (isRecording) {
                performStopAndCopy().then(sendResponse);
            } else {
                performStart().then(sendResponse);
            }
            return true;
        }
    }

    async function performStart() {
        const el = document.querySelector(CHATGPT_SELECTORS.INPUT_FIELD);
        if (el) {
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
            else el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const dictateBtn = await waitForDictateButton(3000);
        if (dictateBtn) {
            dictateBtn.click();
            isRecording = true;
            showToast('Listening...');
            return { success: true };
        } else {
            showToast('Dictate button not found. (Try reloading ChatGPT)');
            return { success: false, error: 'Dictate button not found' };
        }
    }

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
                resolve(findDictateButton());
            }, timeout);
        });
    }

    async function performStopAndCopy() {
        isRecording = false;
        const submitBtn = document.querySelector(CHATGPT_SELECTORS.SUBMIT_DICTATION_BUTTON);
        if (submitBtn) submitBtn.click();

        const text = await waitForText(CHATGPT_SELECTORS.INPUT_FIELD);
        if (text) {
            await copyToClipboard(text);
            return { success: true, text };
        } else {
            return { success: false, error: 'No text generated' };
        }
    }

    // =============================================================
    //  GROK LOGIC
    // =============================================================

    function handleGrokMessage(message, sender, sendResponse) {
        if (!isExtensionEnabled) return;

        if (message.action === 'START_GROK_DICTATION') {
            performGrokStart().then(sendResponse);
            return true;
        } else if (message.action === 'TOGGLE_GROK_LOCAL') {
            if (isGrokRecording) {
                performGrokStopAndCopy().then(sendResponse);
            } else {
                performGrokStart().then(sendResponse);
            }
            return true;
        }
    }

    async function performGrokStart() {
        // Clear the text field first if it has content
        const textEl = document.querySelector(GROK_SELECTORS.TEXT_FIELD);
        if (textEl) {
            textEl.textContent = '';
            textEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Wait for the dictation button to appear (Grok page might still be loading)
        const dictateBtn = await waitForElement(GROK_SELECTORS.DICTATE_BUTTON, 5000);
        if (dictateBtn) {
            dictateBtn.click();
            isGrokRecording = true;
            showToast('Grok Listening...');
            return { success: true };
        } else {
            showToast('Grok dictation button not found. (Try reloading Grok)');
            return { success: false, error: 'Grok dictation button not found' };
        }
    }

    async function performGrokStopAndCopy() {
        isGrokRecording = false;

        // Click the confirm/OK button
        const confirmBtn = document.querySelector(GROK_SELECTORS.CONFIRM_BUTTON);
        if (confirmBtn) {
            confirmBtn.click();
        } else {
            showToast('Grok confirm button not found, trying to read text anyway...');
        }

        // Wait a moment for the text to settle after clicking confirm
        await new Promise(r => setTimeout(r, 700));

        const text = await waitForGrokText();
        if (text) {
            await copyToClipboardGrok(text);
            return { success: true, text };
        } else {
            return { success: false, error: 'No text captured from Grok' };
        }
    }

    async function waitForGrokText() {
        let attempts = 0;
        return new Promise((resolve) => {
            const intv = setInterval(() => {
                attempts++;
                const el = document.querySelector(GROK_SELECTORS.TEXT_FIELD);
                const text = el ? (el.innerText || el.textContent) : null;
                if (text && text.trim().length > 0) {
                    clearInterval(intv);
                    resolve(text.trim());
                } else if (attempts > 20) {
                    clearInterval(intv);
                    resolve(null);
                }
            }, 500);
        });
    }

    // =============================================================
    //  SHARED HELPERS
    // =============================================================

    function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve) => {
            try {
                if (document.querySelector(selector)) {
                    return resolve(document.querySelector(selector));
                }
            } catch(e) {}

            const observer = new MutationObserver(() => {
                try {
                    const el = document.querySelector(selector);
                    if (el) {
                        resolve(el);
                        observer.disconnect();
                    }
                } catch(e) {}
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                try { resolve(document.querySelector(selector)); } catch(e) { resolve(null); }
            }, timeout);
        });
    }

    async function waitForText(inputSelector) {
        let attempts = 0;
        return new Promise((resolve) => {
            const intv = setInterval(() => {
                attempts++;
                const el = document.querySelector(inputSelector);
                const text = el ? (el.innerText || el.value || el.textContent) : null;
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
            chrome.runtime.sendMessage({ action: 'TEXT_COPIED', text: text });
        } catch (err) {
            showToast('Copy Failed.');
        }
    }

    // Grok-specific copy: triggers the minimize-PWA + OS Ctrl+V flow in background.js
    async function copyToClipboardGrok(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied! Pasting...');
            chrome.runtime.sendMessage({ action: 'TEXT_COPIED_GROK', text: text });
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
