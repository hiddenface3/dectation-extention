document.addEventListener('DOMContentLoaded', () => {
    // ── Settings button ──────────────────────────────────────────────────────
    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });

    const toggleSwitch = document.getElementById('toggleSwitch');
    const autoRepairToggle = document.getElementById('autoRepairToggle');
    const autoPasteBrowser = document.getElementById('autoPasteBrowser');
    const autoPasteGlobal = document.getElementById('autoPasteGlobal');
    const targetServiceSelect = document.getElementById('targetServiceSelect');
    const btnAutoFixPage = document.getElementById('btnAutoFixPage');
    const btnPickVisual = document.getElementById('btnPickVisual');
    const statusText = document.getElementById('statusText');

    // 1. Load saved state
    chrome.storage.local.get(['extensionEnabled', 'autoRepairEnabled', 'autoPasteBrowser', 'autoPasteGlobal', 'targetService', 'grokDictation'], (result) => {
        const isEnabled = result.extensionEnabled !== false;

        toggleSwitch.checked = isEnabled;
        autoRepairToggle.checked = result.autoRepairEnabled === true;
        autoPasteBrowser.checked = result.autoPasteBrowser === true;
        autoPasteGlobal.checked = result.autoPasteGlobal === true;

        if (result.targetService) {
            targetServiceSelect.value = result.targetService;
        } else if (result.grokDictation) {
            targetServiceSelect.value = 'grok';
        } else {
            targetServiceSelect.value = 'chatgpt';
        }

        updateStatusUI(isEnabled);
    });

    // Helper: Ensure content script is active in tab
    async function ensureContentScriptInjected(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'PING' }, (res) => {
                if (chrome.runtime.lastError) {
                    // Script missing -> inject programmatically
                    chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] }, () => {
                        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
                            setTimeout(resolve, 150);
                        });
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    // 2. One-Click Auto-Repair Page Action
    btnAutoFixPage.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;

        await ensureContentScriptInjected(tab.id);

        chrome.tabs.sendMessage(tab.id, { action: 'AUTO_REPAIR_PAGE' }, (res) => {
            window.close();
        });
    });

    // 3. Visual Picker Action
    btnPickVisual.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;

        await ensureContentScriptInjected(tab.id);

        chrome.tabs.sendMessage(tab.id, { action: 'START_VISUAL_PICKER' }, (res) => {
            window.close();
        });
    });

    // 4. Handle state changes
    toggleSwitch.addEventListener('change', () => {
        const isEnabled = toggleSwitch.checked;
        chrome.storage.local.set({ extensionEnabled: isEnabled });
        updateStatusUI(isEnabled);
    });

    autoRepairToggle.addEventListener('change', () => {
        chrome.storage.local.set({ autoRepairEnabled: autoRepairToggle.checked });
    });

    autoPasteBrowser.addEventListener('change', () => {
        chrome.storage.local.set({ autoPasteBrowser: autoPasteBrowser.checked });
    });

    autoPasteGlobal.addEventListener('change', () => {
        chrome.storage.local.set({ autoPasteGlobal: autoPasteGlobal.checked });
    });

    targetServiceSelect.addEventListener('change', () => {
        const selected = targetServiceSelect.value;
        chrome.storage.local.set({
            targetService: selected,
            grokDictation: selected === 'grok'
        });
    });

    function updateStatusUI(isEnabled) {
        if (isEnabled) {
            statusText.textContent = 'Active';
            statusText.className = 'status-badge active';
        } else {
            statusText.textContent = 'Inactive';
            statusText.className = 'status-badge inactive';
        }
    }
});
