(function () {
    'use strict';

    function formatNumber(value, maximumFractionDigits) {
        return new Intl.NumberFormat(NabtaI18n.locale, {
            maximumFractionDigits: maximumFractionDigits === undefined ? 0 : maximumFractionDigits
        }).format(value);
    }

    function initializeForms(data) {
        const speciesSelect = document.querySelector('#filter-species');
        const weedForm = document.querySelector('#weed-filter-form');
        const routeForm = document.querySelector('#route-filter-form');
        const weedResult = document.querySelector('#weed-filter-result');
        const routeResult = document.querySelector('#route-filter-result');
        if (!speciesSelect || !weedForm || !routeForm || !weedResult || !routeResult) {
            return;
        }

        Object.keys(data.summary.species).sort().forEach(function (species) {
            const option = document.createElement('option');
            option.value = species;
            option.textContent = species.replace(/-/g, ' ');
            speciesSelect.appendChild(option);
        });

        function applyWeedFilters() {
            const species = speciesSelect.value;
            const outcome = document.querySelector('#filter-outcome').value;
            const startInput = document.querySelector('#filter-start-seconds').value;
            const endInput = document.querySelector('#filter-end-seconds').value;
            const startSeconds = startInput === '' ? 0 : Number(startInput);
            const endSeconds = endInput === '' ? Infinity : Number(endInput);

            if (startSeconds > endSeconds) {
                weedResult.textContent = 'The start time must be before the end time.';
                return;
            }

            const matches = data.weeds.filter(function (weed) {
                return (species === 'all' || weed.species === species) &&
                    (outcome === 'all' || weed.status === outcome) &&
                    weed.seconds >= startSeconds &&
                    weed.seconds <= endSeconds;
            });
            const sampleIds = matches.slice(0, 5).map(function (weed) {
                return '#' + weed.id;
            });
            weedResult.textContent = formatNumber(matches.length) + ' matching detections' +
                (sampleIds.length ? ' · Sample IDs: ' + sampleIds.join(', ') : '');
        }

        function applyRouteFilters() {
            const minimumSpeed = Number(document.querySelector('#route-min-speed').value);
            const includeStationary = document.querySelector('#route-include-stationary').checked;
            const matches = data.route.filter(function (point) {
                return point.speed >= minimumSpeed && (includeStationary || point.speed > 0);
            });
            const averageSpeed = matches.length ? matches.reduce(function (sum, point) {
                return sum + point.speed;
            }, 0) / matches.length : 0;
            routeResult.textContent = formatNumber(matches.length) + ' matching route samples · mean speed ' +
                averageSpeed.toFixed(2) + ' m/s';
        }

        weedForm.addEventListener('submit', function (event) {
            event.preventDefault();
            applyWeedFilters();
        });
        weedForm.addEventListener('reset', function () {
            window.setTimeout(applyWeedFilters, 0);
        });
        routeForm.addEventListener('submit', function (event) {
            event.preventDefault();
            applyRouteFilters();
        });
        routeForm.addEventListener('reset', function () {
            window.setTimeout(applyRouteFilters, 0);
        });

        applyWeedFilters();
        applyRouteFilters();
        window.NabtaFieldUI.renderNotifications(data);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('#weed-filter-form') || !window.NabtaFieldData) {
            return;
        }

        window.NabtaFieldData.load().then(initializeForms).catch(function (error) {
            window.NabtaFieldUI.showDataError(error);
        });
    });
}());
