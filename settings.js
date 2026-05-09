// Settings page logic — load and save custom CSS selectors

const KEYS = {
    cgMic:     'sel_cg_mic',
    cgSubmit:  'sel_cg_submit',
    cgText:    'sel_cg_text',
    gkMic:     'sel_gk_mic',
    gkConfirm: 'sel_gk_confirm',
    gkText:    'sel_gk_text',
};

const fields = {
    cgMic:     document.getElementById('cg-mic'),
    cgSubmit:  document.getElementById('cg-submit'),
    cgText:    document.getElementById('cg-text'),
    gkMic:     document.getElementById('gk-mic'),
    gkConfirm: document.getElementById('gk-confirm'),
    gkText:    document.getElementById('gk-text'),
};

const dots = {
    cgMic:     document.getElementById('dot-cg-mic'),
    cgSubmit:  document.getElementById('dot-cg-submit'),
    cgText:    document.getElementById('dot-cg-text'),
    gkMic:     document.getElementById('dot-gk-mic'),
    gkConfirm: document.getElementById('dot-gk-confirm'),
    gkText:    document.getElementById('dot-gk-text'),
};

// ── Load saved selectors ──────────────────────────────────────────────────────

chrome.storage.local.get(Object.values(KEYS), (result) => {
    fields.cgMic.value     = result[KEYS.cgMic]     || '';
    fields.cgSubmit.value  = result[KEYS.cgSubmit]  || '';
    fields.cgText.value    = result[KEYS.cgText]    || '';
    fields.gkMic.value     = result[KEYS.gkMic]     || '';
    fields.gkConfirm.value = result[KEYS.gkConfirm] || '';
    fields.gkText.value    = result[KEYS.gkText]    || '';
    updateDots();
});

// ── Live dot update ───────────────────────────────────────────────────────────

function updateDots() {
    Object.keys(fields).forEach(key => {
        const val = fields[key].value.trim();
        dots[key].className = 'dot ' + (val ? 'ok' : '');
    });
}
Object.values(fields).forEach(el => el.addEventListener('input', updateDots));

// ── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('btnSave').addEventListener('click', () => {
    const toSave = {
        [KEYS.cgMic]:     fields.cgMic.value.trim(),
        [KEYS.cgSubmit]:  fields.cgSubmit.value.trim(),
        [KEYS.cgText]:    fields.cgText.value.trim(),
        [KEYS.gkMic]:     fields.gkMic.value.trim(),
        [KEYS.gkConfirm]: fields.gkConfirm.value.trim(),
        [KEYS.gkText]:    fields.gkText.value.trim(),
    };
    chrome.storage.local.set(toSave, () => {
        updateDots();
        showToast('✅ Settings saved! Reload the extension tabs for changes to apply.', 'success');
    });
});

// ── Reset to defaults ─────────────────────────────────────────────────────────

document.getElementById('btnReset').addEventListener('click', () => {
    if (!confirm('Clear all custom selectors and go back to built-in defaults?')) return;
    const toRemove = Object.values(KEYS);
    chrome.storage.local.remove(toRemove, () => {
        Object.values(fields).forEach(el => el.value = '');
        updateDots();
        showToast('🔄 Reset to built-in defaults.', 'success');
    });
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => t.className = 'toast', 3000);
}
