(function () {
    'use strict';

    function appendAlert(container, type, iconName, title, message) {
        const alert = document.createElement('div');
        alert.className = 'alert-custom alert-custom-' + type;

        const icon = document.createElement('i');
        icon.className = 'bi ' + iconName + ' alert-custom-icon';

        const content = document.createElement('div');
        content.className = 'alert-custom-content';
        const heading = document.createElement('strong');
        heading.textContent = title + ' ';
        content.appendChild(heading);
        content.appendChild(document.createTextNode(message));

        const close = document.createElement('button');
        close.className = 'alert-custom-close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Dismiss alert');
        close.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        close.addEventListener('click', function () {
            alert.remove();
        });

        alert.appendChild(icon);
        alert.appendChild(content);
        alert.appendChild(close);
        container.appendChild(alert);
    }

    function renderAlerts(data) {
        const container = document.querySelector('#field-alert-list');
        if (!container) {
            return;
        }

        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const summary = data.summary;
        if (summary.missed > 0) {
            appendAlert(container, 'danger', 'bi-exclamation-triangle-fill', 'Missed detections:',
                summary.missed + ' weeds were not treated in this simulated run.');
        }
        if (summary.cropProtected > 0) {
            appendAlert(container, 'warning', 'bi-shield-exclamation', 'Crop-protected:',
                summary.cropProtected + ' detections were excluded from treatment.');
        }
        if (summary.hotspotCount > 0) {
            appendAlert(container, 'primary', 'bi-geo-alt-fill', 'Density hotspot:',
                summary.peakDensity + ' weeds/m² in ' + summary.hotspotCount + ' surveyed grid cell.');
        }
        appendAlert(container, 'success', 'bi-check-circle-fill', 'Treatment coverage:',
            summary.treatmentCoverage.toFixed(1) + '% (' + summary.treated + ' of ' +
            summary.totalDetections + ' detections treated).');
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('#field-alert-list') || !window.NabtaFieldData) {
            return;
        }

        window.NabtaFieldData.load().then(function (data) {
            renderAlerts(data);
            window.NabtaFieldUI.renderNotifications(data);
        }).catch(function (error) {
            window.NabtaFieldUI.showDataError(error);
        });
    });
}());
