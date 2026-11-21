(function (global) {
    'use strict';

    function showDataError(error) {
        console.error('Unable to load the simulated field datasets.', error);
        const message = 'Survey data could not be loaded. Serve this folder over HTTP (for example, with python -m http.server 8000) and reload. ' + error.message;
        const errorBox = document.querySelector('#field-data-error');
        if (errorBox) {
            errorBox.textContent = message;
            errorBox.hidden = false;
        }
    }

    function createNotification(alert) {
        const link = document.createElement('a');
        link.href = alert.href;
        link.className = 'notification-item';

        const icon = document.createElement('div');
        icon.className = 'notification-icon ' + alert.iconClass;
        const iconGlyph = document.createElement('i');
        iconGlyph.className = 'bi ' + alert.icon;
        icon.appendChild(iconGlyph);

        const content = document.createElement('div');
        content.className = 'notification-content';
        const text = document.createElement('p');
        text.className = 'notification-text';
        text.textContent = alert.text;
        const time = document.createElement('span');
        time.className = 'notification-time';
        time.textContent = 'Simulated survey';
        content.appendChild(text);
        content.appendChild(time);

        const unread = document.createElement('span');
        unread.className = 'notification-unread-dot';
        link.appendChild(icon);
        link.appendChild(content);
        link.appendChild(unread);
        return link;
    }

    function renderNotifications(data) {
        const list = document.querySelector('#field-notifications');
        if (!list) {
            return;
        }

        const summary = data.summary;
        const alerts = [
            {
                text: summary.missed + ' detections were missed. Review treatment coverage.',
                icon: 'bi-exclamation-triangle-fill',
                iconClass: 'bg-danger text-white',
                href: 'field-data.html?status=missed'
            },
            {
                text: summary.cropProtected + ' detections were marked crop-protected.',
                icon: 'bi-shield-exclamation',
                iconClass: 'bg-warning text-dark',
                href: 'field-data.html?status=crop-protected'
            },
            {
                text: summary.peakDensity + ' weeds/m² peak density in ' + summary.hotspotCount + ' grid cell.',
                icon: 'bi-geo-alt-fill',
                iconClass: 'bg-primary text-white',
                href: 'field-data.html#density-table'
            }
        ];

        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }
        alerts.forEach(function (alert) {
            list.appendChild(createNotification(alert));
        });

        const badge = document.querySelector('.navbar-action-badge');
        if (badge) {
            badge.style.display = alerts.length ? '' : 'none';
            badge.setAttribute('aria-label', alerts.length + ' unread field alerts');
        }

        const clearButton = document.querySelector('.btn-clear-all');
        if (clearButton) {
            clearButton.addEventListener('click', function () {
                list.querySelectorAll('.notification-unread-dot').forEach(function (dot) {
                    dot.remove();
                });
                if (badge) {
                    badge.style.display = 'none';
                }
            }, { once: true });
        }

        const footer = document.querySelector('.notification-footer');
        if (footer) {
            footer.href = 'ui-buttons.html#dataset-alerts';
            footer.textContent = 'View All Field Alerts';
        }
    }

    global.NabtaFieldUI = {
        showDataError: showDataError,
        renderNotifications: renderNotifications
    };
}(window));
