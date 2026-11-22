(function () {
    'use strict';

    function formatNumber(value, maximumFractionDigits) {
        return new Intl.NumberFormat(NabtaI18n.locale, {
            maximumFractionDigits: maximumFractionDigits === undefined ? 0 : maximumFractionDigits
        }).format(value);
    }

    function formatDuration(seconds) {
        const totalSeconds = Math.round(seconds);
        const minutes = Math.floor(totalSeconds / 60);
        return minutes + 'm ' + String(totalSeconds % 60).padStart(2, '0') + 's';
    }

    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    }

    function createSparkline(selector, name, values, color) {
        const element = document.querySelector(selector);
        if (!element || !window.ApexCharts) {
            return;
        }

        const chart = new ApexCharts(element, {
            series: [{ name: name, data: values }],
            chart: {
                type: 'area',
                height: 45,
                sparkline: { enabled: true },
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                animations: { enabled: false }
            },
            stroke: { curve: 'smooth', width: 2 },
            fill: { opacity: 0.12, type: 'solid' },
            colors: [color],
            tooltip: {
                fixed: { enabled: false },
                x: { show: false },
                y: {
                    title: {
                        formatter: function () { return ''; }
                    }
                },
                marker: { show: false }
            }
        });
        NabtaTheme.renderChart(chart);
    }

    function createTreatmentChart(data) {
        const element = document.querySelector('#treatment-chart');
        if (!element || !window.ApexCharts) {
            return;
        }

        const summary = data.summary;
        const categories = Object.keys(summary.species).sort();
        const statuses = [
            { name: 'Treated', key: 'treated' },
            { name: 'Crop protected', key: 'crop-protected' },
            { name: 'Missed', key: 'missed' }
        ];

        const chart = new ApexCharts(element, {
            series: statuses.map(function (status) {
                return {
                    name: status.name,
                    data: categories.map(function (species) {
                        return summary.speciesOutcomes[species][status.key] || 0;
                    })
                };
            }),
            chart: {
                type: 'bar',
                height: 260,
                toolbar: { show: false },
                fontFamily: 'Plus Jakarta Sans, sans-serif'
            },
            colors: ['#072F1F', '#E7832B', '#F97316'],
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '46%',
                    borderRadius: 4
                }
            },
            dataLabels: { enabled: false },
            stroke: { show: true, width: 2, colors: ['transparent'] },
            legend: { show: false },
            grid: { borderColor: '#E9EFEF', strokeDashArray: 4 },
            xaxis: {
                categories: categories.map(function (species) {
                    return species.replace(/-/g, ' ');
                }),
                labels: { style: { colors: '#6C7E75', fontSize: '11px' } },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                min: 0,
                labels: {
                    style: { colors: '#6C7E75', fontSize: '11px' },
                    formatter: function (value) { return formatNumber(value); }
                }
            },
            tooltip: {
                theme: 'dark',
                y: { formatter: function (value) { return formatNumber(value) + ' detections'; } }
            }
        });
        NabtaTheme.renderChart(chart, {
            light: ['#072F1F', '#E7832B', '#F97316'],
            dark: ['#8dd5a3', '#E7832B', '#F97316']
        });
    }

    function createOutcomesChart(summary) {
        const element = document.querySelector('#outcomes-chart');
        if (!element || !window.ApexCharts) {
            return;
        }

        const total = summary.totalDetections;
        const chart = new ApexCharts(element, {
            series: [summary.treated, summary.cropProtected, summary.missed],
            labels: ['Treated', 'Crop protected', 'Missed'],
            chart: {
                type: 'donut',
                height: 250,
                fontFamily: 'Plus Jakarta Sans, sans-serif'
            },
            colors: ['#E7832B', '#051C12', '#F97316'],
            states: { hover: { filter: { type: 'none' } } },
            legend: { show: false },
            dataLabels: { enabled: false },
            plotOptions: {
                pie: {
                    donut: {
                        size: '72%',
                        labels: {
                            show: true,
                            name: { show: true, fontSize: '12px', color: '#6C7E75', offsetY: -8 },
                            value: {
                                show: true,
                                fontSize: '22px',
                                fontWeight: 800,
                                color: '#0B130F',
                                offsetY: 8,
                                formatter: function (value) { return formatNumber(value); }
                            },
                            total: {
                                show: true,
                                label: 'Detections',
                                fontSize: '11px',
                                color: '#6C7E75',
                                formatter: function () { return formatNumber(total); }
                            }
                        }
                    }
                }
            },
            tooltip: {
                theme: 'dark',
                y: { formatter: function (value) { return formatNumber(value) + ' detections'; } }
            }
        });
        NabtaTheme.renderChart(chart, {
            light: ['#E7832B', '#051C12', '#F97316'],
            dark: ['#E7832B', '#8dd5a3', '#F97316']
        });
    }

    function createRecentDetection(weed) {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        const icon = document.createElement('div');
        icon.className = 'transaction-icon bg-forest-light text-lime';
        const glyph = document.createElement('i');
        glyph.className = 'bi bi-bug-fill';
        icon.appendChild(glyph);

        const info = document.createElement('div');
        info.className = 'transaction-info';
        const name = document.createElement('div');
        name.className = 'transaction-name';
        name.textContent = weed.species.replace(/-/g, ' ') + ' #' + weed.id;
        const detail = document.createElement('div');
        detail.className = 'transaction-date';
        detail.textContent = 'Elapsed ' + formatDuration(weed.seconds) + ' · ' +
            weed.latitude.toFixed(6) + ', ' + weed.longitude.toFixed(6);
        info.appendChild(name);
        info.appendChild(detail);

        const status = document.createElement('div');
        status.className = 'transaction-amount ' +
            (weed.status === 'treated' ? 'text-success' : weed.status === 'missed' ? 'text-danger' : 'text-warning');
        status.textContent = weed.status.replace(/-/g, ' ');

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(status);
        return item;
    }

    function renderDashboard(data) {
        const summary = data.summary;
        setText('#stat-detections-value', formatNumber(summary.totalDetections));
        setText('#stat-detections-detail',
            formatNumber(summary.treated) + ' treated · ' + summary.treatmentCoverage.toFixed(1) + '%');
        setText('#stat-distance-value', summary.routeDistanceMeters.toFixed(1) + ' m');
        setText('#stat-distance-detail',
            'Average ' + summary.averageSpeed.toFixed(2) + ' m/s · ' + formatDuration(summary.routeDurationSeconds));
        setText('#survey-route-summary',
            formatNumber(summary.routePoints) + ' GPS points · ' + formatDuration(summary.routeDurationSeconds));
        setText('#survey-detection-summary',
            formatNumber(summary.totalDetections) + ' detections across ' +
            formatNumber(summary.surveyedAreaM2) + ' m² surveyed');
        setText('#field-detection-total', formatNumber(summary.totalDetections));
        setText('#field-treated-count', formatNumber(summary.treated));
        setText('#field-protected-count', formatNumber(summary.cropProtected));
        setText('#field-missed-count', formatNumber(summary.missed));
        setText('#field-surveyed-area', formatNumber(summary.surveyedAreaM2));
        setText('#field-route-points', formatNumber(summary.routePoints));
        setText('#field-peak-density', formatNumber(summary.peakDensity));
        setText('#field-survey-summary',
            formatNumber(summary.densityCells) + ' density cells · ' +
            formatNumber(summary.routePoints) + ' GPS points · ' +
            formatNumber(summary.densityWeedCount) + ' mapped detections');

        const recentList = document.querySelector('#recent-detections');
        if (recentList) {
            while (recentList.firstChild) {
                recentList.removeChild(recentList.firstChild);
            }
            data.weeds.slice().sort(function (left, right) {
                return right.seconds - left.seconds;
            }).slice(0, 5).forEach(function (weed) {
                recentList.appendChild(createRecentDetection(weed));
            });
        }

        createSparkline('#detections-sparkline', 'Detections per interval', summary.detectionTimeline, '#22C55E');
        createSparkline('#speed-sparkline', 'Average route speed', summary.speedTimeline, '#F97316');
        createTreatmentChart(data);
        createOutcomesChart(summary);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('#field-dashboard') || !window.NabtaFieldData) {
            return;
        }

        window.NabtaFieldData.load().then(function (data) {
            renderDashboard(data);
            window.NabtaFieldUI.renderNotifications(data);
        }).catch(function (error) {
            window.NabtaFieldUI.showDataError(error);
        });
    });
}());
