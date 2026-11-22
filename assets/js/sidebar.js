(function () {
    'use strict';

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const sections = [
        {
            title: 'Field Operations',
            links: [
                ['index.html', 'Dashboard', 'bi-grid-fill', 'menu-overview'],
                ['simulation.html', 'Robot Simulation', 'bi-robot', 'menu-simulation'],
                ['weed-detection.html', 'Weed Detection', 'bi-camera-video', 'menu-detection'],
                ['pest-detection.html', 'Pest Video Diagnostics', 'bi-bug', 'menu-pestdetection'],
                ['plant-health.html', 'Plant Health', 'bi-flower1', 'menu-planthealth'],
                ['field-data.html', 'Field Data', 'bi-table', 'menu-fielddata'],
                ['field-assistant.html', 'Agriculture Assistant', 'bi-chat-dots', 'menu-fieldassistant'],
                ['ui-forms.html', 'Survey Filters', 'bi-input-cursor-text', 'menu-uiforms'],
                ['ui-buttons.html#dataset-alerts', 'Field Alerts', 'bi-exclamation-triangle', 'menu-uibuttons'],
                ['tables-basic.html', 'Basic Tables', 'bi-grid-3x3', 'menu-basictables']
            ]
        },
        {
            title: 'Pages',
            links: [
                ['page-blank.html', 'Blank Page', 'bi-file-earmark', 'menu-blankpage'],
                ['page-login.html', 'Login', 'bi-box-arrow-in-right', 'menu-loginpage'],
                ['page-404.html', 'Error 404', 'bi-exclamation-octagon', 'menu-404']
            ]
        }
    ];

    sidebar.innerHTML = `
        <a href="index.html" class="sidebar-brand" aria-label="Nabta dashboard">
            <img src="assets/images/nabta-logo.png" alt="Nabta">
        </a>
        <nav class="flex-grow-1 overflow-y-auto w-100" aria-label="Main navigation">
            ${sections.map(section => `
                <div class="sidebar-menu-section">
                    <div class="sidebar-menu-title">${section.title}</div>
                    <ul class="sidebar-menu-list">
                        ${section.links.map(([href, label, icon, id]) => {
                            const active = href.split('#')[0] === currentPage;
                            return `<li class="sidebar-menu-item">
                                <a href="${href}" id="${id}" title="${label}"
                                    class="sidebar-menu-link${active ? ' active' : ''}"
                                    ${active ? 'aria-current="page"' : ''}>
                                    <i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span>
                                </a>
                            </li>`;
                        }).join('')}
                    </ul>
                </div>`).join('')}
        </nav>
        <div class="sidebar-profile">
            <img src="assets/images/avatar.png" alt="Administrator" class="sidebar-profile-img">
            <div class="sidebar-profile-info">
                <div class="sidebar-profile-name">Administrator</div>
                <div class="sidebar-profile-email">admin@email.com</div>
            </div>
        </div>`;

    const desktop = matchMedia('(min-width: 1201px)');
    function restoreSidebar() {
        let minimized = false;
        try {
            minimized = localStorage.getItem('nabta.sidebarMinimized') === 'true';
        } catch (error) {
            // Navigation also works when browser storage is unavailable.
        }
        document.body.classList.toggle('sidebar-minimized', desktop.matches && minimized);
        const button = document.getElementById('desktop-sidebar-toggle');
        if (button) {
            const collapsed = desktop.matches && minimized;
            button.setAttribute('aria-controls', 'sidebar');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', collapsed ? 'Expand Sidebar' : 'Minimize Sidebar');
            const icon = button.querySelector('i');
            if (icon) icon.className = collapsed ? 'bi bi-chevron-bar-right' : 'bi bi-chevron-bar-left';
        }
    }

    restoreSidebar();
    document.addEventListener('DOMContentLoaded', function () {
        restoreSidebar();
        const mobileButton = document.getElementById('sidebar-toggle');
        if (mobileButton) {
            mobileButton.setAttribute('aria-controls', 'sidebar');
            mobileButton.setAttribute('aria-expanded', 'false');
        }
    });
    desktop.addEventListener('change', function () {
        sidebar.classList.remove('show');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('show');
        const mobileButton = document.getElementById('sidebar-toggle');
        if (mobileButton) mobileButton.setAttribute('aria-expanded', 'false');
        restoreSidebar();
    });
}());
