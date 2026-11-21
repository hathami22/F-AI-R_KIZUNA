(function () {
    'use strict';

    const pageSize = 20;

    function formatNumber(value, maximumFractionDigits) {
        return new Intl.NumberFormat(undefined, {
            maximumFractionDigits: maximumFractionDigits === undefined ? 0 : maximumFractionDigits
        }).format(value);
    }

    function appendCell(row, value) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
    }

    function renderPage(rows, body, info, previous, next, page, label, createRow) {
        const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
        const currentPage = Math.min(page, pageCount - 1);
        const start = currentPage * pageSize;
        const visibleRows = rows.slice(start, start + pageSize);
        const fragment = document.createDocumentFragment();

        if (!visibleRows.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = body.parentElement.querySelectorAll('thead th').length;
            cell.textContent = 'No matching ' + label + '.';
            row.appendChild(cell);
            fragment.appendChild(row);
        } else {
            visibleRows.forEach(function (item, index) {
                fragment.appendChild(createRow(item, start + index));
            });
        }

        body.replaceChildren(fragment);
        info.textContent = rows.length ?
            'Showing ' + (start + 1) + '–' + (start + visibleRows.length) + ' of ' + formatNumber(rows.length) + ' ' + label :
            'No ' + label + ' found';
        previous.disabled = currentPage === 0;
        next.disabled = currentPage >= pageCount - 1;
        return currentPage;
    }

    function makeDetectionRow(weed) {
        const row = document.createElement('tr');
        appendCell(row, String(weed.id));
        appendCell(row, weed.species.replace(/-/g, ' '));
        appendCell(row, weed.seconds.toFixed(2));
        appendCell(row, weed.latitude.toFixed(6));
        appendCell(row, weed.longitude.toFixed(6));
        appendCell(row, weed.x.toFixed(2) + ', ' + weed.y.toFixed(2));

        const statusCell = document.createElement('td');
        const status = document.createElement('span');
        const statusClass = weed.status === 'treated' ? 'success' :
            weed.status === 'missed' ? 'failed' : 'pending';
        status.className = 'badge-table ' + statusClass;
        status.textContent = weed.status.replace(/-/g, ' ');
        statusCell.appendChild(status);
        row.appendChild(statusCell);
        appendCell(row, weed.treatedSeconds === null ? '—' : weed.treatedSeconds.toFixed(2));
        return row;
    }

    function makeRouteRow(point, index) {
        const row = document.createElement('tr');
        appendCell(row, formatNumber(index + 1));
        appendCell(row, point.seconds.toFixed(2));
        appendCell(row, point.speed.toFixed(2));
        appendCell(row, point.targetSpeed.toFixed(2));
        appendCell(row, point.latitude.toFixed(6));
        appendCell(row, point.longitude.toFixed(6));
        return row;
    }

    function makeDensityRow(cell) {
        const row = document.createElement('tr');
        appendCell(row, String(cell.id));
        appendCell(row, formatNumber(cell.weedsPerM2, 1));
        appendCell(row, formatNumber(cell.uniqueWeeds));
        appendCell(row, cell.latitude.toFixed(6));
        appendCell(row, cell.longitude.toFixed(6));
        return row;
    }

    function exportCsv(rows, columns, fileName) {
        const escapeCell = function (value) {
            return '"' + String(value).replace(/"/g, '""') + '"';
        };
        const contents = [columns.map(escapeCell).join(',')].concat(rows.map(function (row) {
            return row.map(escapeCell).join(',');
        })).join('\r\n');
        const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function initializeTables(data) {
        const weedBody = document.querySelector('#weed-table-body');
        const routeBody = document.querySelector('#route-table-body');
        const densityBody = document.querySelector('#density-table-body');
        if (!weedBody || !routeBody || !densityBody) {
            return;
        }

        const weedInfo = document.querySelector('#weed-page-info');
        const routeInfo = document.querySelector('#route-page-info');
        const weedPrevious = document.querySelector('#weed-page-previous');
        const weedNext = document.querySelector('#weed-page-next');
        const routePrevious = document.querySelector('#route-page-previous');
        const routeNext = document.querySelector('#route-page-next');
        const search = document.querySelector('#weed-search');
        const statusFilter = document.querySelector('#weed-status-filter');
        const searchParams = new URLSearchParams(window.location.search);
        const requestedStatus = searchParams.get('status');
        if (requestedStatus && Array.from(statusFilter.options).some(function (option) {
            return option.value === requestedStatus;
        })) {
            statusFilter.value = requestedStatus;
        }

        let weedPage = 0;
        let routePage = 0;
        let filteredWeeds = data.weeds;

        function applyWeedFilters() {
            const query = search.value.trim().toLocaleLowerCase();
            const status = statusFilter.value;
            filteredWeeds = data.weeds.filter(function (weed) {
                const searchable = [
                    weed.id, weed.species, weed.status, weed.seconds,
                    weed.latitude, weed.longitude, weed.x, weed.y
                ].join(' ').toLocaleLowerCase();
                return (status === 'all' || weed.status === status) &&
                    (!query || searchable.includes(query));
            });
            weedPage = renderPage(filteredWeeds, weedBody, weedInfo, weedPrevious, weedNext,
                weedPage, 'detections', makeDetectionRow);
        }

        function renderRoute() {
            routePage = renderPage(data.route, routeBody, routeInfo, routePrevious, routeNext,
                routePage, 'route samples', makeRouteRow);
        }

        search.addEventListener('input', function () {
            weedPage = 0;
            applyWeedFilters();
        });
        statusFilter.addEventListener('change', function () {
            weedPage = 0;
            applyWeedFilters();
        });
        weedPrevious.addEventListener('click', function () {
            weedPage = Math.max(0, weedPage - 1);
            applyWeedFilters();
        });
        weedNext.addEventListener('click', function () {
            weedPage += 1;
            applyWeedFilters();
        });
        routePrevious.addEventListener('click', function () {
            routePage = Math.max(0, routePage - 1);
            renderRoute();
        });
        routeNext.addEventListener('click', function () {
            routePage += 1;
            renderRoute();
        });

        document.querySelector('#export-weeds').addEventListener('click', function () {
            exportCsv(filteredWeeds.map(function (weed) {
                return [weed.id, weed.species, weed.seconds, weed.latitude, weed.longitude,
                    weed.x, weed.y, weed.status, weed.treatedSeconds === null ? '' : weed.treatedSeconds];
            }), ['id', 'species', 'seconds', 'latitude', 'longitude', 'x', 'y', 'status', 'treated_seconds'],
            'nabta-weed-detections.csv');
        });
        document.querySelector('#export-route').addEventListener('click', function () {
            exportCsv(data.route.map(function (point) {
                return [point.seconds, point.longitude, point.latitude, point.speed, point.targetSpeed, point.x, point.y];
            }), ['seconds', 'longitude', 'latitude', 'speed_m_s', 'target_m_s', 'x_m', 'y_m'],
            'nabta-gps-route.csv');
        });

        const summary = data.summary;
        document.querySelector('#field-total-detections').textContent = formatNumber(summary.totalDetections);
        document.querySelector('#field-treated-summary').textContent =
            formatNumber(summary.treated) + ' · ' + summary.treatmentCoverage.toFixed(1) + '%';
        document.querySelector('#field-route-summary').textContent = summary.routeDistanceMeters.toFixed(1) + ' m';
        document.querySelector('#field-density-summary').textContent = formatNumber(summary.surveyedAreaM2) + ' m²';
        document.querySelector('#route-table-summary').textContent =
            formatNumber(summary.routePoints) + ' samples · ' + summary.routeDistanceMeters.toFixed(1) +
            ' m traveled · ' + summary.routeDurationSeconds.toFixed(1) + ' s';

        const densityRows = data.densityCells.slice().sort(function (left, right) {
            return right.weedsPerM2 - left.weedsPerM2 || right.uniqueWeeds - left.uniqueWeeds;
        }).slice(0, 10);
        densityBody.replaceChildren.apply(densityBody, densityRows.map(makeDensityRow));
        applyWeedFilters();
        renderRoute();
        window.NabtaFieldUI.renderNotifications(data);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('#weed-table-body') || !window.NabtaFieldData) {
            return;
        }

        window.NabtaFieldData.load().then(initializeTables).catch(function (error) {
            window.NabtaFieldUI.showDataError(error);
        });
    });
}());
