package service

const RecorderInjectionJS = `
(() => {
    if (window.__gc_recorder_initialized) return;
    window.__gc_recorder_initialized = true;
    window.__gc_step_count = 0;

    const isEditableElement = (el) => {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute ? el.getAttribute('role') : '';
        const ce = el.getAttribute ? el.getAttribute('contenteditable') : '';
        return tag === 'input' || tag === 'textarea' || role === 'textbox' || ce === 'true';
    };

    const getElementSelectors = (el) => {
        const selectors = [];
        if (!el || !el.getAttribute) return selectors;

        const addUnique = (sel) => {
            if (sel && !selectors.includes(sel)) selectors.push(sel);
        };

        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const role = el.getAttribute('role');
        const nameAttr = el.getAttribute('name');
        const placeholder = el.getAttribute('placeholder');
        const isEditable = isEditableElement(el);

        const innerAriaEl = el.querySelector ? el.querySelector('[aria-label]') : null;
        const rawAria = el.getAttribute('aria-label') || (innerAriaEl ? innerAriaEl.getAttribute('aria-label') : null);
        const ariaLabel = (rawAria && !/\b(ago|seconds|minutes|hours|days|weeks)\b/i.test(rawAria)) ? rawAria : null;

        const innerTestEl = el.querySelector ? el.querySelector('[data-testid]') : null;
        const testId = el.getAttribute('data-testid') || (innerTestEl ? innerTestEl.getAttribute('data-testid') : null);

        const rawText = (el.innerText || el.textContent || '').trim();
        const cleanText = rawText.length < 30 ? rawText.replace(/"/g, '\\"') : '';

        const inDialog = Boolean(el.closest('[role="dialog"]'));
        const prefix = inDialog ? '[role="dialog"] ' : '';

        if (ariaLabel) {
            if (prefix) addUnique(prefix + '[aria-label="' + ariaLabel + '"]');
            addUnique('[aria-label="' + ariaLabel + '"]');
        }
        if (testId) {
            if (prefix) addUnique(prefix + '[data-testid="' + testId + '"]');
            addUnique('[data-testid="' + testId + '"]');
        }
        if (nameAttr) {
            addUnique(tag + '[name="' + nameAttr + '"]');
        }
        if (placeholder && placeholder.length < 45) {
            const cleanPh = placeholder.replace(/"/g, '\\"');
            addUnique(tag + '[placeholder="' + cleanPh + '"]');
            addUnique('[placeholder="' + cleanPh + '"]');
        }

        if (isEditable) {
            if (role === 'textbox' || el.getAttribute('contenteditable') === 'true') {
                if (prefix) addUnique(prefix + 'div[role="textbox"][contenteditable="true"]');
                addUnique('div[role="textbox"][contenteditable="true"]');
                if (prefix) addUnique(prefix + '[role="textbox"]');
                addUnique('[role="textbox"]');
            }
            if (tag === 'textarea') {
                if (prefix) addUnique(prefix + 'textarea');
                addUnique('textarea');
            }
        } else {
            if (role && cleanText && role !== 'img' && role !== 'presentation') {
                if (prefix) addUnique(prefix + '[role="' + role + '"]:has-text("' + cleanText + '")');
                addUnique('[role="' + role + '"]:has-text("' + cleanText + '")');
            }
            if (cleanText && ['button', 'a', 'span', 'div'].includes(tag)) {
                if (prefix) addUnique(prefix + tag + ':has-text("' + cleanText + '")');
                if (tag === 'button' || tag === 'a') {
                    addUnique(tag + ':has-text("' + cleanText + '")');
                } else {
                    addUnique('button:has-text("' + cleanText + '")');
                    addUnique('div[role="button"]:has-text("' + cleanText + '")');
                }
            }
        }

        if (el.id && !/^[0-9]+$/.test(el.id)) {
            addUnique('#' + el.id);
        }
        return selectors;
    };

    const sendStep = (step) => {
        if (window.__gc_record_step) {
            window.__gc_record_step(JSON.stringify(step));
        }
    };

    document.addEventListener('click', (e) => {
        const buttonTarget = e.target.closest('button, a, div[role="button"], [role="menuitem"], [role="tab"], [role="textbox"], [contenteditable="true"], textarea, input');
        const ariaTarget = e.target.closest('svg[aria-label], [aria-label], [data-testid]');
        const target = buttonTarget || ariaTarget;
        if (!target) return;

        const isEditable = isEditableElement(target);
        const text = !isEditable ? (target.innerText || target.textContent || '').trim() : '';
        const innerAria = target.querySelector ? target.querySelector('[aria-label]') : null;
        const aria = target.getAttribute('aria-label') || (innerAria ? innerAria.getAttribute('aria-label') : '');
        const testId = target.getAttribute('data-testid') || '';
        const desc = aria || testId || (text ? text.slice(0, 28) : target.tagName.toLowerCase());

        sendStep({
            type: 'click',
            description: 'Click "' + desc + '"',
            is_editable_target: isEditable,
            selectors: getElementSelectors(target),
            timestamp: Date.now()
        });
    }, true);

    document.addEventListener('change', (e) => {
        if (e.target && e.target.type === 'file') {
            sendStep({
                type: 'upload',
                description: 'Upload media file',
                target: 'input[type="file"]',
                variable: 'media_path',
                selectors: ['button:has-text("Select from computer")', '[role="button"]:has-text("Select from computer")'],
                timestamp: Date.now()
            });
        }
    }, true);

    document.addEventListener('input', (e) => {
        const target = e.target.closest('textarea, div[role="textbox"], input[type="text"], [contenteditable="true"]') || e.target;
        if (!target) return;

        if (isEditableElement(target) && !target.dataset.__typingRecorded) {
            target.dataset.__typingRecorded = 'true';
            sendStep({
                type: 'type',
                description: 'Type dynamic content',
                variable: 'content',
                selectors: getElementSelectors(target),
                timestamp: Date.now()
            });
        }
    }, true);
})();
`