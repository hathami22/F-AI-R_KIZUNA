(function () {
    'use strict';
    const media = matchMedia('(prefers-color-scheme: dark)');
    let preference = null;
    try { preference = localStorage.getItem('nabta.theme'); } catch (_) { /* Storage is optional. */ }
    if (!['light', 'dark'].includes(preference)) preference = null;
    let theme = preference || (media.matches ? 'dark' : 'light');
    const charts = new Set();
    const chartPalettes = new WeakMap();
    const palettes = {
        light: {text: '#142b20', muted: '#52665b', grid: '#e3eae5', surface: '#ffffff',
            density: ['#e0e5e1', '#e2efe3', '#83b28d', '#39804e', '#174d2c'],
            mapText: '#4b6055', mapGrid: '#a6b5ab', crop: '#2a6150', queued: '#182923', actual: '#39804e', target: '#a45010'},
        dark: {text: '#edf4ee', muted: '#b3c2b8', grid: '#38473d', surface: '#1b221e',
            density: ['#303b33', '#344a39', '#426f4d', '#519866', '#71c38a'],
            mapText: '#c7d9cc', mapGrid: '#647d6b', crop: '#d3e9c9', queued: '#ffffff', actual: '#8dd5a3', target: '#f3a56b'}
    };
    function applyRoot() {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.bsTheme = theme;
        document.documentElement.style.colorScheme = theme;
    }
    applyRoot(); // Runs in the head, before the page is painted.
    function chartOptions() {
        const p = palettes[theme];
        return {
            theme: {mode: theme}, chart: {background: 'transparent', foreColor: p.muted},
            grid: {borderColor: p.grid},
            xaxis: {labels: {style: {colors: p.muted}}},
            yaxis: {labels: {style: {colors: p.muted}}},
            tooltip: {theme},
            plotOptions: {pie: {donut: {labels: {name: {color: p.muted}, value: {color: p.text}, total: {color: p.muted}}}}}
        };
    }
    function updateChart(chart) {
        const options = chartOptions();
        const colors = chartPalettes.get(chart);
        if (colors) options.colors = colors[theme];
        return chart.updateOptions(options, false, false).catch(error => console.error('Could not update chart theme.', error));
    }
    function updateButton() {
        const button = document.getElementById('theme-toggle');
        if (!button) return;
        const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.setAttribute('aria-pressed', String(theme === 'dark'));
        button.innerHTML = '<i class="bi ' + (theme === 'dark' ? 'bi-sun' : 'bi-moon-stars') + '" aria-hidden="true"></i>';
    }
    function setTheme(next, persist = true) {
        if (!['light', 'dark'].includes(next)) return;
        theme = next;
        if (persist) {
            preference = next;
            try { localStorage.setItem('nabta.theme', next); } catch (_) { /* Keep this tab usable. */ }
        }
        applyRoot(); updateButton(); charts.forEach(updateChart);
        window.dispatchEvent(new CustomEvent('nabta:themechange', {detail: {theme}}));
    }
    window.NabtaTheme = {
        get current() { return theme; }, get palette() { return palettes[theme]; }, setTheme,
        renderChart(chart, colors) {
            if (colors) chartPalettes.set(chart, colors);
            return chart.render().then(() => { charts.add(chart); return updateChart(chart); });
        }
    };
    document.addEventListener('DOMContentLoaded', () => {
        const language = document.querySelector('.language-control');
        const host = document.querySelector('.navbar-custom') || document.body;
        const group = document.createElement('div'); group.className = 'appearance-controls';
        const button = document.createElement('button'); button.type = 'button';
        button.id = 'theme-toggle'; button.className = 'theme-toggle';
        button.onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
        group.appendChild(button);
        if (language) group.appendChild(language);
        host.appendChild(group); updateButton();
    });
    media.addEventListener('change', () => { if (!preference) setTheme(media.matches ? 'dark' : 'light', false); });
    window.addEventListener('storage', event => {
        if (event.key !== 'nabta.theme') return;
        preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
        setTheme(preference || (media.matches ? 'dark' : 'light'), false);
    });
}());
