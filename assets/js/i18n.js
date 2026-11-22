(function () {
    'use strict';
    const supported = ['en', 'ar', 'ja'];
    let language = 'en';
    try { language = localStorage.getItem('nabta.language') || 'en'; } catch (_) { /* Storage is optional. */ }
    if (!supported.includes(language)) language = 'en';
    const messages = window.NabtaMessages;
    const originals = new WeakMap();
    const attributes = new WeakMap();
    const ignored = 'script,style,code,pre,[data-no-i18n],.assistant-message-content:not(.assistant-greeting),#pest-ai-diagnostic[data-generated],input,textarea';
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = Object.keys(messages).filter(key => /\{\d+\}/.test(key)).map(key => ({
        key, expression: new RegExp('^' + key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '(.+?)' : escape(part)).join('') + '$'),
        slots: [...key.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]))
    })).sort((a, b) => b.key.length - a.key.length);
    function translate(source, depth = 0) {
        if (language === 'en' || !source || depth > 3) return source;
        const value = normalize(source);
        let result = messages[value]?.[language];
        if (!result) {
            for (const pattern of patterns) {
                const match = value.match(pattern.expression);
                if (!match) continue;
                result = messages[pattern.key][language];
                pattern.slots.forEach((slot, index) => {
                    result = result.replaceAll('{' + slot + '}', translate(match[index + 1], depth + 1));
                });
                break;
            }
        }
        return result ? (source.match(/^\s*/)[0] + result + source.match(/\s*$/)[0]) : source;
    }
    function textNode(node) {
        if (!node.parentElement || node.parentElement.closest(ignored)) return;
        const previous = originals.get(node);
        const source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
        const rendered = translate(source);
        originals.set(node, {source, rendered});
        if (node.nodeValue !== rendered) node.nodeValue = rendered;
    }
    function elementAttributes(element) {
        if (element.closest('[data-no-i18n],script,style')) return;
        let saved = attributes.get(element);
        if (!saved) { saved = {}; attributes.set(element, saved); }
        for (const name of ['placeholder', 'aria-label', 'title', 'alt']) {
            const current = element.getAttribute(name);
            if (!current) continue;
            const previous = saved[name];
            const source = previous && current === previous.rendered ? previous.source : current;
            const rendered = translate(source);
            saved[name] = {source, rendered};
            if (current !== rendered) element.setAttribute(name, rendered);
        }
    }
    function apply(root) {
        if (root.nodeType === Node.TEXT_NODE) { textNode(root); return; }
        if (root.nodeType !== Node.ELEMENT_NODE || root.closest(ignored)) return;
        elementAttributes(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) textNode(node);
            else elementAttributes(node);
        }
    }
    const options = {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title', 'alt']};
    const observer = new MutationObserver(records => {
        observer.disconnect();
        const roots = new Set();
        for (const record of records) {
            if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node));
            else roots.add(record.target);
        }
        roots.forEach(apply);
        observer.observe(document.body, options);
    });
    function setLanguage(next) {
        if (!supported.includes(next)) return;
        language = next;
        try { localStorage.setItem('nabta.language', next); } catch (_) { /* Keep this tab usable. */ }
        document.documentElement.lang = language;
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        observer.disconnect();
        apply(document.body);
        document.querySelectorAll('[data-language-select]').forEach(select => { select.value = language; select.setAttribute('aria-label', translate('Language')); });
        // Keep the original page title available when returning to English.
        if (!document.documentElement.dataset.englishTitle) document.documentElement.dataset.englishTitle = document.title;
        const englishTitle = document.documentElement.dataset.englishTitle;
        const section = englishTitle.split(/ - | \| /)[0];
        document.title = language === 'en' ? englishTitle : translate(section) + ' · Nabta';
        observer.observe(document.body, options);
        window.dispatchEvent(new CustomEvent('nabta:languagechange', {detail: {language}}));
    }
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    window.NabtaI18n = {
        get language() { return language; },
        get locale() { return {en: 'en-GB', ar: 'ar-TN', ja: 'ja-JP'}[language]; },
        t: translate, setLanguage,
        number(value, options) { return new Intl.NumberFormat(this.locale, options).format(value); },
        date(value, options) { return new Intl.DateTimeFormat(this.locale, options).format(value); }
    };
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.querySelector('.navbar-custom') || document.body;
        const control = document.createElement('label');
        control.className = 'language-control'; control.setAttribute('data-no-i18n', '');
        control.innerHTML = '<i class="bi bi-translate" aria-hidden="true"></i><select data-language-select aria-label="Language"><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option><option value="ja" lang="ja">日本語</option></select>';
        host.appendChild(control);
        control.querySelector('select').addEventListener('change', event => setLanguage(event.target.value));
        setLanguage(language);
    });
    window.addEventListener('storage', event => { if (event.key === 'nabta.language') setLanguage(supported.includes(event.newValue) ? event.newValue : 'en'); });
}());
