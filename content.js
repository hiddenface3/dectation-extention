(function () {
    'use strict';

    window.hasRunDictationAutomator = true;

    // ─── DEFAULT SELECTORS ────────────────────────────────────────────────────
    const CHATGPT_DEFAULTS = {
        WINDOW_TITLE: 'ChatGPT',
        DICTATE_BUTTON_CANDIDATES: [
            'button[aria-label="Dictate button"]',
            'button[aria-label="Dictate"]',
            'button[aria-label="Voice input"]',
            'button[aria-label="Start dictation"]',
            'button[aria-label="dictate"]',
        ],
        SUBMIT_BUTTON: 'button[aria-label="Submit dictation"]',
        TEXT_FIELD: '#prompt-textarea',
    };

    const GROK_DEFAULTS = {
        WINDOW_TITLE: 'Grok',
        DICTATE_BUTTON: 'button[aria-label*="Dictate" i], button[aria-label*="Voice" i], button[aria-label*="mic" i]',
        CONFIRM_BUTTON: 'button.bg-button-filled',
        TEXT_FIELD: 'form div p, textarea, #prompt-textarea',
    };

    const GEMINI_DEFAULTS = {
        WINDOW_TITLE: 'Gemini',
        DICTATE_BUTTON: 'button[aria-label*="mic" i], button[aria-label*="dictat" i], button[aria-label*="speech" i], button[aria-label*="voice" i], .mic-button',
        STOP_BUTTON: 'button[aria-label*="stop" i], button[aria-label*="pause" i], button[aria-label*="recording" i]',
        CONFIRM_BUTTON: 'button[aria-label*="send" i], button[aria-label*="submit" i]',
        TEXT_FIELD: 'rich-textarea p, div[contenteditable="true"], textarea',
    };

    // ─── ACTIVE SELECTORS ─────────────────────────────────────────────────────
    let CHATGPT = Object.assign({}, CHATGPT_DEFAULTS);
    let GROK    = Object.assign({}, GROK_DEFAULTS);
    let GEMINI  = Object.assign({}, GEMINI_DEFAULTS);

    // ─── STATE ────────────────────────────────────────────────────────────────
    let isExtensionEnabled = true;
    let autoRepairEnabled = false;

    // Visual Picker state
    let isPickerActive = false;
    let highlightBox = null;
    let topBanner = null;

    // ─── INIT ─────────────────────────────────────────────────────────────────
    function init() {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        injectToast();

        chrome.storage.local.get(['extensionEnabled', 'autoRepairEnabled'], (r) => {
            isExtensionEnabled = r.extensionEnabled !== false;
            autoRepairEnabled = r.autoRepairEnabled === true;
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.extensionEnabled) isExtensionEnabled = changes.extensionEnabled.newValue;
                if (changes.autoRepairEnabled) autoRepairEnabled = changes.autoRepairEnabled.newValue;
            }
        });

        // Load custom selectors from storage
        chrome.storage.local.get([
            'sel_cg_mic', 'sel_cg_submit', 'sel_cg_text',
            'sel_gk_mic', 'sel_gk_confirm', 'sel_gk_text',
            'sel_gm_mic', 'sel_gm_stop', 'sel_gm_confirm', 'sel_gm_text'
        ], (r) => {
            if (r.sel_cg_mic)     CHATGPT.DICTATE_BUTTON_CANDIDATES = [r.sel_cg_mic, ...CHATGPT_DEFAULTS.DICTATE_BUTTON_CANDIDATES];
            if (r.sel_cg_submit)  CHATGPT.SUBMIT_BUTTON = r.sel_cg_submit;
            if (r.sel_cg_text)    CHATGPT.TEXT_FIELD    = r.sel_cg_text;

            if (r.sel_gk_mic)     GROK.DICTATE_BUTTON   = r.sel_gk_mic;
            if (r.sel_gk_confirm) GROK.CONFIRM_BUTTON   = r.sel_gk_confirm;
            if (r.sel_gk_text)    GROK.TEXT_FIELD       = r.sel_gk_text;

            if (r.sel_gm_mic)     GEMINI.DICTATE_BUTTON = r.sel_gm_mic;
            if (r.sel_gm_stop)    GEMINI.STOP_BUTTON    = r.sel_gm_stop;
            if (r.sel_gm_confirm) GEMINI.CONFIRM_BUTTON = r.sel_gm_confirm;
            if (r.sel_gm_text)    GEMINI.TEXT_FIELD     = r.sel_gm_text;
        });

        try {
            chrome.runtime.onMessage.addListener(handleGlobalMessage);
        } catch(e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function isChatGPT() { return location.hostname.includes('chatgpt.com'); }
    function isGrok()    { return location.hostname.includes('grok.com'); }
    function isGemini()  { return location.hostname.includes('gemini.google.com'); }

    // ─── MESSAGE ROUTER ───────────────────────────────────────────────────────
    function handleGlobalMessage(message, sender, sendResponse) {
        if (message.action === 'PING') {
            sendResponse({ pong: true });
            return true;
        }

        if (message.action === 'START_VISUAL_PICKER') {
            startVisualPicker();
            sendResponse({ success: true });
            return true;
        }

        if (message.action === 'AUTO_REPAIR_PAGE') {
            runOneClickAutoRepair().then(sendResponse);
            return true;
        }

        if (!isExtensionEnabled) return;

        if (message.action === 'START_DICTATION' || (isChatGPT() && message.action === 'START_DICTATION')) {
            chatGptStart().then(sendResponse); return true;
        }
        if (message.action === 'STOP_DICTATION' || (isChatGPT() && message.action === 'STOP_DICTATION')) {
            chatGptStop().then(sendResponse); return true;
        }

        if (message.action === 'START_GROK_DICTATION' || isGrok()) {
            if (message.action === 'START_GROK_DICTATION') { grokStart().then(sendResponse); return true; }
            if (message.action === 'STOP_GROK_DICTATION')  { grokStop().then(sendResponse); return true; }
        }

        if (message.action === 'START_GEMINI_DICTATION' || isGemini()) {
            if (message.action === 'START_GEMINI_DICTATION') { geminiStart().then(sendResponse); return true; }
            if (message.action === 'STOP_GEMINI_DICTATION')  { geminiStop().then(sendResponse); return true; }
        }
    }

    // ─── SYNTHETIC CLICK HELPER ───────────────────────────────────────────────
    function triggerSyntheticClick(element) {
        if (!element) return;
        try { element.focus(); } catch(e) {}
        const opts = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new PointerEvent('pointerdown', opts));
        element.dispatchEvent(new MouseEvent('mousedown', opts));
        element.dispatchEvent(new MouseEvent('mouseup', opts));
        element.click();
    }

    // ─── CHATGPT ─────────────────────────────────────────────────────────────
    async function chatGptStart() {
        const el = document.querySelector(CHATGPT.TEXT_FIELD);
        if (el) {
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
            else el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        let btn = await waitForChatGPTDictateButton(2500);

        if (!btn) {
            btn = smartAutoDetectMicButton();
            if (btn && autoRepairEnabled) {
                const newSel = generateUniqueSelector(btn);
                CHATGPT.DICTATE_BUTTON_CANDIDATES = [newSel, ...CHATGPT_DEFAULTS.DICTATE_BUTTON_CANDIDATES];
                chrome.storage.local.set({ sel_cg_mic: newSel });
                showToast('🤖 Auto-repaired ChatGPT mic selector!');
            }
        }

        if (btn) {
            triggerSyntheticClick(btn);
            showToast('ChatGPT Listening...');
            return { success: true };
        }

        showToast('Dictate button not found. Click "🤖 Auto-Repair" in popup.');
        return { success: false };
    }

    async function chatGptStop() {
        let text = getTextFromField(CHATGPT.TEXT_FIELD);
        const submitBtn = document.querySelector(CHATGPT.SUBMIT_BUTTON);
        if (submitBtn) triggerSyntheticClick(submitBtn);

        if (!text) {
            await delay(300);
            text = await pollForText(CHATGPT.TEXT_FIELD);
        }

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
        return smartAutoDetectMicButton();
    }

    function waitForChatGPTDictateButton(timeout = 2500) {
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
    async function grokStart() {
        const el = document.querySelector(GROK.TEXT_FIELD);
        if (el) { el.textContent = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }

        let btn = await waitForElement(GROK.DICTATE_BUTTON, 2500);

        if (!btn) {
            btn = smartAutoDetectMicButton();
            if (btn && autoRepairEnabled) {
                const newSel = generateUniqueSelector(btn);
                GROK.DICTATE_BUTTON = newSel;
                chrome.storage.local.set({ sel_gk_mic: newSel });
                showToast('🤖 Auto-repaired Grok mic selector!');
            }
        }

        if (btn) {
            triggerSyntheticClick(btn);
            showToast('Grok Listening...');
            return { success: true };
        }

        showToast('Grok dictation button not found. Click "🤖 Auto-Repair" in popup.');
        return { success: false };
    }

    async function grokStop() {
        let text = getTextFromField(GROK.TEXT_FIELD);
        const confirmBtn = document.querySelector(GROK.CONFIRM_BUTTON) || document.querySelector('button[aria-label*="confirm" i]');
        if (confirmBtn) {
            triggerSyntheticClick(confirmBtn);
        } else {
            showToast('Confirm button not found — reading text anyway...');
        }

        if (!text) {
            await delay(400);
            text = await pollForGrokText();
        }

        if (text) {
            await copyAndPaste(text, GROK.WINDOW_TITLE);
            return { success: true, text };
        }
        return { success: false, error: 'No text captured from Grok' };
    }

    async function pollForGrokText() {
        for (let i = 0; i < 20; i++) {
            await delay(400);
            const text = getTextFromField(GROK.TEXT_FIELD);
            if (text.length > 0) return text;
        }
        return null;
    }

    // ─── GEMINI ──────────────────────────────────────────────────────────────
    async function geminiStart() {
        const el = document.querySelector(GEMINI.TEXT_FIELD);
        if (el) {
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
            else el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        let btn = await waitForElement(GEMINI.DICTATE_BUTTON, 2500);
        if (!btn) btn = smartAutoDetectMicButton();

        if (btn) {
            triggerSyntheticClick(btn);
            showToast('Gemini Listening...');
            return { success: true };
        }

        showToast('Gemini dictation button not found. Click "🤖 Auto-Repair" in popup.');
        return { success: false };
    }

    async function geminiStop() {
        let text = getTextFromField(GEMINI.TEXT_FIELD);
        let stopBtn = findGeminiStopButton();
        if (stopBtn) {
            triggerSyntheticClick(stopBtn);
            showToast('Stopping Gemini dictation...');
        } else {
            const confirmBtn = document.querySelector(GEMINI.CONFIRM_BUTTON);
            if (confirmBtn) triggerSyntheticClick(confirmBtn);
        }

        if (!text) {
            await delay(400);
            text = await pollForText(GEMINI.TEXT_FIELD);
        }

        if (text) {
            await copyAndPaste(text, GEMINI.WINDOW_TITLE);
            return { success: true, text };
        }
        return { success: false, error: 'No text captured from Gemini' };
    }

    function findGeminiStopButton() {
        // 1. Try saved/default selector
        if (GEMINI.STOP_BUTTON) {
            try {
                const btn = document.querySelector(GEMINI.STOP_BUTTON);
                if (btn && isElementVisible(btn)) return btn;
            } catch(e) {}
        }

        // 2. Scan input bar container
        const promptArea = smartAutoDetectTextField();
        const container = promptArea ? (promptArea.closest('form') || promptArea.closest('main') || promptArea.closest('.input-area-container') || document.body) : document.body;

        const buttons = Array.from(container.querySelectorAll('button, [role="button"]'));

        // Check aria-labels
        for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.innerText || '').toLowerCase();
            if (label.includes('stop') || label.includes('pause') || label.includes('done') || label.includes('finish') || label.includes('cancel recording')) {
                if (isElementVisible(btn)) return btn;
            }
        }

        // Check SVGs for square <rect> (stop icon shape)
        for (const btn of buttons) {
            const rects = btn.querySelectorAll('svg rect');
            if (rects.length > 0 && isElementVisible(btn)) return btn;

            const svgs = btn.querySelectorAll('svg');
            for (const svg of svgs) {
                const html = (svg.innerHTML || '').toLowerCase();
                if (html.includes('rect') || html.includes('stop') || html.includes('square')) {
                    if (isElementVisible(btn)) return btn;
                }
            }
        }

        // Fallback: Check button adjacent to send button (blue arrow in image 2)
        const sendBtn = container.querySelector('button[aria-label*="send" i], button[aria-label*="submit" i]');
        if (sendBtn && sendBtn.previousElementSibling && sendBtn.previousElementSibling.tagName === 'BUTTON') {
            if (isElementVisible(sendBtn.previousElementSibling)) return sendBtn.previousElementSibling;
        }

        return null;
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    // ─── ONE-CLICK AUTO-REPAIR ENGINE ─────────────────────────────────────────
    async function runOneClickAutoRepair() {
        showToast('🤖 Auto-Repairing site selectors...');

        const micBtn = smartAutoDetectMicButton();
        const textField = smartAutoDetectTextField();
        const submitBtn = smartAutoDetectSubmitButton();
        const stopBtn = isGemini() ? findGeminiStopButton() : null;

        const updates = {};
        const siteName = isChatGPT() ? 'ChatGPT' : isGrok() ? 'Grok' : isGemini() ? 'Gemini' : location.hostname;

        if (micBtn) {
            const micSel = generateUniqueSelector(micBtn);
            if (isChatGPT()) updates.sel_cg_mic = micSel;
            else if (isGrok()) updates.sel_gk_mic = micSel;
            else updates.sel_gm_mic = micSel;
        }

        if (stopBtn) {
            const stopSel = generateUniqueSelector(stopBtn);
            if (isGemini()) updates.sel_gm_stop = stopSel;
        }

        if (textField) {
            const textSel = generateUniqueSelector(textField);
            if (isChatGPT()) updates.sel_cg_text = textSel;
            else if (isGrok()) updates.sel_gk_text = textSel;
            else updates.sel_gm_text = textSel;
        }

        if (submitBtn) {
            const submitSel = generateUniqueSelector(submitBtn);
            if (isChatGPT()) updates.sel_cg_submit = submitSel;
            else if (isGrok()) updates.sel_gk_confirm = submitSel;
            else updates.sel_gm_confirm = submitSel;
        }

        if (Object.keys(updates).length > 0) {
            await new Promise(r => chrome.storage.local.set(updates, r));
            showToast(`✅ Auto-repaired ${siteName}! Selectors saved.`);
            return { success: true, updates };
        }

        showToast(`⚠️ Could not auto-detect buttons on ${siteName}. Use Visual Picker!`);
        return { success: false };
    }

    function smartAutoDetectMicButton() {
        const promptArea = smartAutoDetectTextField();
        const container = promptArea ? (promptArea.closest('form') || promptArea.closest('main') || document.body) : document.body;

        const buttons = Array.from(container.querySelectorAll('button, [role="button"]'));
        for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.innerText || '').toLowerCase();
            if (label.includes('dictat') || label.includes('voice') || label.includes('mic') || label.includes('speech') || label.includes('record')) {
                return btn;
            }

            const svgs = btn.querySelectorAll('svg');
            for (const svg of svgs) {
                const svgContent = (svg.innerHTML || '').toLowerCase();
                const href = (svg.querySelector('use')?.getAttribute('href') || '').toLowerCase();
                if (svgContent.includes('mic') || svgContent.includes('dictat') || href.includes('mic')) {
                    return btn;
                }
            }
        }
        return null;
    }

    function smartAutoDetectTextField() {
        return document.querySelector('#prompt-textarea')
            || document.querySelector('rich-textarea p')
            || document.querySelector('textarea')
            || document.querySelector('[contenteditable="true"]');
    }

    function smartAutoDetectSubmitButton() {
        const promptArea = smartAutoDetectTextField();
        const container = promptArea ? (promptArea.closest('form') || promptArea.closest('main') || document.body) : document.body;
        return container.querySelector('button[aria-label*="send" i], button[aria-label*="submit" i], button[aria-label*="confirm" i], button.bg-button-filled');
    }

    // ─── INTERACTIVE VISUAL ELEMENT PICKER ────────────────────────────────────
    function startVisualPicker() {
        if (isPickerActive) return;
        isPickerActive = true;

        highlightBox = document.createElement('div');
        highlightBox.id = 'dictation-picker-highlight';
        document.body.appendChild(highlightBox);

        topBanner = document.createElement('div');
        topBanner.id = 'dictation-picker-banner';
        topBanner.innerHTML = `
            <span>🎯 Hover & Click the Dictate/Mic Button</span>
            <button class="btn-cancel" id="btnCancelPicker">Cancel (ESC)</button>
        `;
        document.body.appendChild(topBanner);

        document.getElementById('btnCancelPicker').addEventListener('click', stopVisualPicker);
        window.addEventListener('mousemove', onPickerMouseMove, true);
        window.addEventListener('click', onPickerClick, true);
        window.addEventListener('keydown', onPickerKeyDown, true);

        showToast('🎯 Visual Picker Active: Click the mic or stop button on screen.');
    }

    function stopVisualPicker() {
        if (!isPickerActive) return;
        isPickerActive = false;

        if (highlightBox && highlightBox.parentNode) highlightBox.parentNode.removeChild(highlightBox);
        if (topBanner && topBanner.parentNode) topBanner.parentNode.removeChild(topBanner);

        window.removeEventListener('mousemove', onPickerMouseMove, true);
        window.removeEventListener('click', onPickerClick, true);
        window.removeEventListener('keydown', onPickerKeyDown, true);
    }

    function onPickerMouseMove(e) {
        if (!isPickerActive) return;
        const target = e.target;
        if (!target || target === highlightBox || topBanner.contains(target)) return;

        const rect = target.getBoundingClientRect();
        highlightBox.style.top = (rect.top + window.scrollY) + 'px';
        highlightBox.style.left = (rect.left + window.scrollX) + 'px';
        highlightBox.style.width = rect.width + 'px';
        highlightBox.style.height = rect.height + 'px';
    }

    function onPickerKeyDown(e) {
        if (e.key === 'Escape') {
            stopVisualPicker();
            showToast('Visual picker cancelled.');
        }
    }

    function onPickerClick(e) {
        if (!isPickerActive) return;
        if (topBanner.contains(e.target)) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const clickedEl = e.target.closest('button') || e.target.closest('a') || e.target;
        const selector = generateUniqueSelector(clickedEl);

        stopVisualPicker();

        if (isChatGPT()) {
            CHATGPT.DICTATE_BUTTON_CANDIDATES = [selector, ...CHATGPT_DEFAULTS.DICTATE_BUTTON_CANDIDATES];
            chrome.storage.local.set({ sel_cg_mic: selector }, () => {
                showToast('✅ ChatGPT Mic button saved!');
            });
        } else if (isGrok()) {
            GROK.DICTATE_BUTTON = selector;
            chrome.storage.local.set({ sel_gk_mic: selector }, () => {
                showToast('✅ Grok Mic button saved!');
            });
        } else if (isGemini()) {
            GEMINI.DICTATE_BUTTON = selector;
            GEMINI.STOP_BUTTON = selector;
            chrome.storage.local.set({ sel_gm_mic: selector, sel_gm_stop: selector }, () => {
                showToast('✅ Gemini button saved!');
            });
        } else {
            chrome.storage.local.set({ sel_custom_mic: selector }, () => {
                showToast('✅ Element selector saved!');
            });
        }
    }

    function generateUniqueSelector(el) {
        if (!el) return '';
        if (el.id) return `#${CSS.escape(el.id)}`;

        const aria = el.getAttribute('aria-label');
        if (aria) {
            const sel = `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
            if (document.querySelectorAll(sel).length === 1) return sel;
        }

        const testId = el.getAttribute('data-testid') || el.getAttribute('data-id');
        if (testId) {
            const sel = `${el.tagName.toLowerCase()}[data-testid="${testId}"]`;
            if (document.querySelectorAll(sel).length === 1) return sel;
        }

        const parent = el.parentElement;
        if (parent) {
            const children = Array.from(parent.children);
            const index = children.indexOf(el) + 1;
            return `${parent.tagName.toLowerCase()} > ${el.tagName.toLowerCase()}:nth-child(${index})`;
        }

        return el.tagName.toLowerCase();
    }

    // ─── SHARED HELPERS ──────────────────────────────────────────────────────
    function getTextFromField(selector) {
        let el = null;
        try { if (selector) el = document.querySelector(selector); } catch(e) {}
        if (!el) el = smartAutoDetectTextField();
        return el ? (el.innerText || el.value || el.textContent || '').trim() : '';
    }

    async function copyAndPaste(text, windowTitle) {
        let copied = false;
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch (err) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                copied = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch(e) {}
        }
        showToast(copied ? 'Copied! Pasting...' : 'Pasting text...');
        chrome.runtime.sendMessage({ action: 'TEXT_COPIED', text, windowTitle });
    }

    async function pollForText(selector) {
        let text = getTextFromField(selector);
        if (text.length > 0) return text;

        for (let i = 0; i < 15; i++) {
            await delay(300);
            text = getTextFromField(selector);
            if (text.length > 0) return text;
        }
        return null;
    }

    function waitForElement(selector, timeout = 2500) {
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
        if (t) { t.textContent = msg; t.className = 'show'; setTimeout(() => t.className = '', 3500); }
    }

})();
