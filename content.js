(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.hasRunDictationAutomator) return;
    window.hasRunDictationAutomator = true;

    // ─── DEFAULT SELECTORS ────────────────────────────────────────────────────
    // These are the fallbacks used when no custom selector is saved in settings.

    const CHATGPT_DEFAULTS = {
        WINDOW_TITLE: 'ChatGPT',
        DICTATE_BUTTON_CANDIDATES: [
            'button[aria-label="Dictate button"]',
            'button[aria-label="Dictate"]',
            'button[aria-label="Voice input"]',
            'button[aria-label="Start dictation"]',
            'button[aria-label="dictate"]',
            '#thread-bottom > div > div > div > div.pointer-events-auto.relative.z-1.flex.h-\\(--composer-container-height\\,100\\%\\).max-w-full.flex-\\(--composer-container-flex\\,1\\).flex-col > form > div:nth-child(2) > div > div.flex.items-center.gap-2.\\[grid-area\\:trailing\\] > div > span > button',
        ],
        SUBMIT_BUTTON: 'button[aria-label="Submit dictation"]',
        TEXT_FIELD: '#prompt-textarea',
    };

    const GROK_DEFAULTS = {
        WINDOW_TITLE: 'Grok',
        DICTATE_BUTTON: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.flex.absolute.inset-x-0.bottom-0.border-2.border-transparent.max-w-full.p-2.\\@\\[480px\\]\\/input\\:p-2 > div > div.ms-auto.flex.flex-row.items-end.gap-0\\.5 > div.h-10.rounded-full.shrink-0.me-1.relative.flex.items-center.transition-\\[background-color\\,box-shadow\\].duration-150.ease-out.ring-0.ring-transparent > div > button',
        CONFIRM_BUTTON: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.flex.absolute.inset-x-0.bottom-0.border-2.border-transparent.max-w-full.p-2.\\@\\[480px\\]\\/input\\:p-2 > div > div.ms-auto.flex.flex-row.items-end.gap-0\\.5 > div.h-10.rounded-full.shrink-0.me-1.relative.flex.items-center.transition-\\[background-color\\,box-shadow\\].duration-150.ease-out.bg-surface-l2.ring-1.ring-inset.ring-border-l2.overflow-hidden > div > button.h-8.w-8.shrink-0.flex.items-center.justify-center.rounded-full.bg-button-filled.text-fg-invert',
        TEXT_FIELD: 'body > div.group\\/sidebar-wrapper.flex.flex-col.h-svh.w-full.has-\\[\\[data-variant\\=inset\\]\\]\\:bg-sidebar.isolate > div > div.flex.w-full.h-full.overflow-hidden.\\@container\\/mainview.relative > div > div > main > div.flex.flex-col.items-center.w-full.h-full.p-2.mx-auto.justify-center.\\@sm\\:p-4.\\@sm\\:gap-9.isolate.mt-16.\\@sm\\:mt-0.overflow-scroll > div > div.absolute.mx-auto.inset-x-0.bottom-0.max-w-breakout.\\@sm\\:relative.flex.flex-col.items-center.w-full.gap-1.\\@sm\\:gap-5.\\@sm\\:bottom-auto.\\@sm\\:inset-x-auto.\\@sm\\:max-w-full > div > div.w-full.mb-3 > form > div > div > div.ps-11.pe-\\[138px\\] > div.relative.z-10 > div > div > div > p',
    };

    // ─── ACTIVE SELECTORS (overridden by storage at init) ─────────────────────

    let CHATGPT = Object.assign({}, CHATGPT_DEFAULTS);
    let GROK    = Object.assign({}, GROK_DEFAULTS);

    // ─── STATE ────────────────────────────────────────────────────────────────

    let isExtensionEnabled = true;
    let chatGptRecording = false;
    let grokRecording = false;

    // ─── INIT ─────────────────────────────────────────────────────────────────

    function init() {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        injectToast();

        // Load extension enabled state
        chrome.storage.local.get(['extensionEnabled'], (r) => {
            isExtensionEnabled = r.extensionEnabled !== false;
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.extensionEnabled) {
                isExtensionEnabled = changes.extensionEnabled.newValue;
            }
        });

        // Load custom selectors from settings page (override defaults if set)
        chrome.storage.local.get([
            'sel_cg_mic', 'sel_cg_submit', 'sel_cg_text',
            'sel_gk_mic', 'sel_gk_confirm', 'sel_gk_text'
        ], (r) => {
            if (r.sel_cg_mic)     CHATGPT.DICTATE_BUTTON_CANDIDATES = [r.sel_cg_mic, ...CHATGPT_DEFAULTS.DICTATE_BUTTON_CANDIDATES];
            if (r.sel_cg_submit)  CHATGPT.SUBMIT_BUTTON = r.sel_cg_submit;
            if (r.sel_cg_text)    CHATGPT.TEXT_FIELD    = r.sel_cg_text;
            if (r.sel_gk_mic)     GROK.DICTATE_BUTTON   = r.sel_gk_mic;
            if (r.sel_gk_confirm) GROK.CONFIRM_BUTTON   = r.sel_gk_confirm;
            if (r.sel_gk_text)    GROK.TEXT_FIELD       = r.sel_gk_text;
        });

        if (isChatGPT()) chrome.runtime.onMessage.addListener(handleChatGPTMessage);
        if (isGrok())    chrome.runtime.onMessage.addListener(handleGrokMessage);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function isChatGPT() { return location.hostname.includes('chatgpt.com'); }
    function isGrok()    { return location.hostname.includes('grok.com'); }

    // ─── CHATGPT ─────────────────────────────────────────────────────────────

    function handleChatGPTMessage(message, sender, sendResponse) {
        if (!isExtensionEnabled) return;
        if (message.action === 'START_DICTATION') {
            chatGptStart().then(sendResponse); return true;
        }
        if (message.action === 'STOP_DICTATION') {
            chatGptStop().then(sendResponse); return true;
        }
    }

    async function chatGptStart() {
        // Clear field before starting
        const el = document.querySelector(CHATGPT.TEXT_FIELD);
        if (el) {
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
            else el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = await waitForChatGPTDictateButton(3000);
        if (btn) {
            btn.click();
            chatGptRecording = true;
            showToast('ChatGPT Listening...');
            return { success: true };
        }
        showToast('Dictate button not found. (Try reloading ChatGPT)');
        return { success: false };
    }

    async function chatGptStop() {
        chatGptRecording = false;
        // Click submit dictation button if it appeared
        const submitBtn = document.querySelector(CHATGPT.SUBMIT_BUTTON);
        if (submitBtn) submitBtn.click();

        await delay(500);
        const text = await pollForText(CHATGPT.TEXT_FIELD);
        if (text) {
            await copyAndPaste(text, CHATGPT.WINDOW_TITLE);
            return { success: true, text };
        }
        return { success: false, error: 'No text captured from ChatGPT' };
    }

    function findChatGPTDictateButton() {
        for (const sel of CHATGPT.DICTATE_BUTTON_CANDIDATES) {
            try { const el = document.querySelector(sel); if (el) return el; } catch(e) {}
        }
        // Fallback: mic icon scan
        for (const btn of document.querySelectorAll('button')) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('mic') || label.includes('dictate') || label.includes('voice')) return btn;
            const svg = btn.querySelector('svg use');
            if (svg) {
                const href = (svg.getAttribute('href') || svg.getAttribute('xlink:href') || '').toLowerCase();
                if (href.includes('mic') || href.includes('dictate')) return btn;
            }
        }
        return null;
    }

    function waitForChatGPTDictateButton(timeout = 3000) {
        return new Promise((resolve) => {
            const found = findChatGPTDictateButton();
            if (found) return resolve(found);
            const obs = new MutationObserver(() => {
                const btn = findChatGPTDictateButton();
                if (btn) { obs.disconnect(); resolve(btn); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); resolve(findChatGPTDictateButton()); }, timeout);
        });
    }

    // ─── GROK ────────────────────────────────────────────────────────────────

    function handleGrokMessage(message, sender, sendResponse) {
        if (!isExtensionEnabled) return;
        if (message.action === 'START_GROK_DICTATION') {
            grokStart().then(sendResponse); return true;
        }
        if (message.action === 'STOP_GROK_DICTATION') {
            grokStop().then(sendResponse); return true;
        }
    }

    async function grokStart() {
        const el = document.querySelector(GROK.TEXT_FIELD);
        if (el) { el.textContent = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }

        const btn = await waitForElement(GROK.DICTATE_BUTTON, 5000);
        if (btn) {
            btn.click();
            grokRecording = true;
            showToast('Grok Listening...');
            return { success: true };
        }
        showToast('Grok dictation button not found. (Try reloading Grok)');
        return { success: false };
    }

    async function grokStop() {
        grokRecording = false;
        const confirmBtn = document.querySelector(GROK.CONFIRM_BUTTON);
        if (confirmBtn) {
            confirmBtn.click();
        } else {
            showToast('Confirm button not found — reading text anyway...');
        }
        await delay(700);
        const text = await pollForGrokText();
        if (text) {
            await copyAndPaste(text, GROK.WINDOW_TITLE);
            return { success: true, text };
        }
        return { success: false, error: 'No text captured from Grok' };
    }

    async function pollForGrokText() {
        for (let i = 0; i < 20; i++) {
            await delay(500);
            const el = document.querySelector(GROK.TEXT_FIELD);
            const text = el ? (el.innerText || el.textContent || '').trim() : '';
            if (text.length > 0) return text;
        }
        return null;
    }

    // ─── SHARED HELPERS ──────────────────────────────────────────────────────

    /**
     * Copy text to clipboard and signal background to:
     * 1. Find the PWA window by windowTitle and minimize it
     * 2. Wait ~250ms for OS to restore focus to previous window
     * 3. Send Ctrl+V at OS level → pastes into any app or browser tab
     */
    async function copyAndPaste(text, windowTitle) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied! Pasting...');
            chrome.runtime.sendMessage({ action: 'TEXT_COPIED', text, windowTitle });
        } catch (err) {
            showToast('Copy failed.');
        }
    }

    async function pollForText(selector) {
        for (let i = 0; i < 20; i++) {
            await delay(500);
            const el = document.querySelector(selector);
            const text = el ? (el.innerText || el.value || el.textContent || '').trim() : '';
            if (text.length > 0) return text;
        }
        return null;
    }

    function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve) => {
            try { const el = document.querySelector(selector); if (el) return resolve(el); } catch(e) {}
            const obs = new MutationObserver(() => {
                try { const el = document.querySelector(selector); if (el) { obs.disconnect(); resolve(el); } } catch(e) {}
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                obs.disconnect();
                try { resolve(document.querySelector(selector)); } catch(e) { resolve(null); }
            }, timeout);
        });
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function injectToast() {
        if (document.getElementById('dictation-toast')) return;
        const div = document.createElement('div');
        div.id = 'dictation-toast';
        document.body.appendChild(div);
    }

    function showToast(msg) {
        const t = document.getElementById('dictation-toast');
        if (t) { t.textContent = msg; t.className = 'show'; setTimeout(() => t.className = '', 3000); }
    }

})();
