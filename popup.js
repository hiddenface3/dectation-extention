document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const autoPasteBrowser = document.getElementById('autoPasteBrowser');
    const autoPasteGlobal = document.getElementById('autoPasteGlobal');
    const statusText = document.getElementById('statusText');

    // 1. Load saved state
    chrome.storage.local.get(['extensionEnabled', 'autoPasteBrowser', 'autoPasteGlobal'], (result) => {
        // Default to true if not set
        const isEnabled = result.extensionEnabled !== false;
        
        toggleSwitch.checked = isEnabled;
        autoPasteBrowser.checked = result.autoPasteBrowser === true;
        autoPasteGlobal.checked = result.autoPasteGlobal === true;
        
        updateStatusUI(isEnabled);
    });

    // 2. Handle toggle change
    toggleSwitch.addEventListener('change', () => {
        const isEnabled = toggleSwitch.checked;
        chrome.storage.local.set({ extensionEnabled: isEnabled });
        updateStatusUI(isEnabled);
    });

    autoPasteBrowser.addEventListener('change', () => {
        chrome.storage.local.set({ autoPasteBrowser: autoPasteBrowser.checked });
        // Give preference to Global if both are enabled logically in background, but no strict UI preventions yet
    });

    autoPasteGlobal.addEventListener('change', () => {
        chrome.storage.local.set({ autoPasteGlobal: autoPasteGlobal.checked });
    });

    function updateStatusUI(isEnabled) {
        if (isEnabled) {
            statusText.textContent = 'Active';
            statusText.className = 'status active';
        } else {
            statusText.textContent = 'Inactive';
            statusText.className = 'status inactive';
        }
    }
});
