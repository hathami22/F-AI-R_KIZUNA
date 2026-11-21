(function (global) {
    'use strict';

    let dataPromise;

    function parseCsvRow(line) {
        const cells = [];
        let value = '';
        let quoted = false;

        for (let index = 0; index < line.length; index += 1) {
            const character = line[index];
            if (character === '"') {
                if (quoted && line[index + 1] === '"') {
                    value += '"';
                    index += 1;
                } else {
                    quoted = !quoted;
                }
            } else if (character === ',' && !quoted) {
                cells.push(value);
                value = '';
            } else {
                value += character;
            }
        }

        if (quoted) {
            throw new Error('A CSV row contains an unmatched quote.');
        }

        cells.push(value);
        return cells;
    }

    function parseCsv(text, name) {
        const lines = text.split(/\r?\n/).filter(function (line) {
            return line.trim() !== '';
        });
        if (lines.length < 2) {
            throw new Error(name + ' does not contain any data rows.');
        }

        const headers = parseCsvRow(lines[0]).map(function (header) {
            return header.trim();
        });

        return lines.slice(1).map(function (line, rowIndex) {
            const values = parseCsvRow(line);
            if (values.length !== headers.length) {
                throw new Error(name + ' row ' + (rowIndex + 2) + ' has an unexpected number of columns.');
            }

            return headers.reduce(function (row, header, index) {
                row[header] = values[index];
                return row;
            }, {});
        });
    }

    function numberFrom(row, key, optional) {
        if (optional && row[key] === '') {
            return null;
        }

        const value = Number(row[key]);
        if (!Number.isFinite(value)) {
            throw new Error('The dataset contains an invalid number in "' + key + '".');
        }
        return value;
    }

    function parseWeeds(text) {
        return parseCsv(text, 'simulated_weed_gps.csv').map(function (row) {
            return {
                id: numberFrom(row, 'id'),
                species: row.species,
                seconds: numberFrom(row, 'seconds'),
                longitude: numberFrom(row, 'longitude'),
                latitude: numberFrom(row, 'latitude'),
                x: numberFrom(row, 'x'),
                y: numberFrom(row, 'y'),
                status: row.status,
                treatedSeconds: numberFrom(row, 'treated_seconds', true)
            };
        });
    }

    function parseRoute(text) {
        return parseCsv(text, 'simulated_gps_route.csv').map(function (row) {
            return {
                seconds: numberFrom(row, 'seconds'),
                longitude: numberFrom(row, 'longitude'),
                latitude: numberFrom(row, 'latitude'),
                speed: numberFrom(row, 'speed_m_s'),
                targetSpeed: numberFrom(row, 'target_m_s'),
                x: numberFrom(row, 'x_m'),
                y: numberFrom(row, 'y_m')
            };
        });
    }

    function parseDensity(text) {
        let geoJson;
        try {
            geoJson = JSON.parse(text);
        } catch (error) {
            throw new Error('simulated_field_density.geojson is not valid JSON.');
        }

        if (!geoJson || geoJson.type !== 'FeatureCollection' || !Array.isArray(geoJson.features)) {
            throw new Error('simulated_field_density.geojson is not a GeoJSON FeatureCollection.');
        }

        return geoJson.features.filter(function (feature) {
            return feature.properties && feature.properties.kind === 'density';
        }).map(function (feature, index) {
            const coordinates = feature.geometry && feature.geometry.coordinates;
            const ring = Array.isArray(coordinates) && Array.isArray(coordinates[0]) ? coordinates[0] : [];
            const points = ring.length > 1 ? ring.slice(0, -1) : ring;
            const totals = points.reduce(function (sum, point) {
                return [sum[0] + point[0], sum[1] + point[1]];
            }, [0, 0]);

            return {
                id: feature.id || index + 1,
                surveyedM2: Number(feature.properties.surveyed_m2) || 0,
                uniqueWeeds: Number(feature.properties.unique_weeds) || 0,
                weedsPerM2: Number(feature.properties.weeds_per_m2) || 0,
                longitude: points.length ? totals[0] / points.length : 0,
                latitude: points.length ? totals[1] / points.length : 0
            };
        });
    }

    function summarize(data) {
        const outcomes = {};
        const species = {};
        const speciesOutcomes = {};
        const intervals = 12;
        const detectionTimeline = Array(intervals).fill(0);
        const speedTotals = Array(intervals).fill(0);
        const speedCounts = Array(intervals).fill(0);

        data.weeds.forEach(function (weed) {
            outcomes[weed.status] = (outcomes[weed.status] || 0) + 1;
            species[weed.species] = (species[weed.species] || 0) + 1;
            if (!speciesOutcomes[weed.species]) {
                speciesOutcomes[weed.species] = {};
            }
            speciesOutcomes[weed.species][weed.status] =
                (speciesOutcomes[weed.species][weed.status] || 0) + 1;
        });

        const startSeconds = data.route.length ? data.route[0].seconds : 0;
        const endSeconds = data.route.length ? data.route[data.route.length - 1].seconds : 0;
        const durationSeconds = Math.max(0, endSeconds - startSeconds);
        const intervalIndex = function (seconds) {
            if (durationSeconds === 0) {
                return 0;
            }
            return Math.min(intervals - 1, Math.floor(((seconds - startSeconds) / durationSeconds) * intervals));
        };

        data.weeds.forEach(function (weed) {
            detectionTimeline[intervalIndex(weed.seconds)] += 1;
        });

        let distanceMeters = 0;
        data.route.forEach(function (point, index) {
            const bucket = intervalIndex(point.seconds);
            speedTotals[bucket] += point.speed;
            speedCounts[bucket] += 1;
            if (index > 0) {
                const previous = data.route[index - 1];
                distanceMeters += Math.hypot(point.x - previous.x, point.y - previous.y);
            }
        });

        const densityAreaM2 = data.densityCells.reduce(function (sum, cell) {
            return sum + cell.surveyedM2;
        }, 0);
        const densityWeedCount = data.densityCells.reduce(function (sum, cell) {
            return sum + cell.uniqueWeeds;
        }, 0);
        const peakDensity = data.densityCells.reduce(function (peak, cell) {
            return Math.max(peak, cell.weedsPerM2);
        }, 0);
        const speedTimeline = speedTotals.map(function (total, index) {
            return speedCounts[index] ? total / speedCounts[index] : 0;
        });

        return {
            totalDetections: data.weeds.length,
            treated: outcomes.treated || 0,
            cropProtected: outcomes['crop-protected'] || 0,
            missed: outcomes.missed || 0,
            treatmentCoverage: data.weeds.length ? ((outcomes.treated || 0) / data.weeds.length) * 100 : 0,
            outcomes: outcomes,
            species: species,
            speciesOutcomes: speciesOutcomes,
            detectionTimeline: detectionTimeline,
            speedTimeline: speedTimeline,
            routePoints: data.route.length,
            routeDurationSeconds: durationSeconds,
            routeDistanceMeters: distanceMeters,
            averageSpeed: durationSeconds ? distanceMeters / durationSeconds : 0,
            densityCells: data.densityCells.length,
            surveyedAreaM2: densityAreaM2,
            densityWeedCount: densityWeedCount,
            peakDensity: peakDensity,
            hotspotCount: data.densityCells.filter(function (cell) {
                return cell.weedsPerM2 === peakDensity && peakDensity > 0;
            }).length
        };
    }

    async function readText(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error('Could not load ' + path + ' (HTTP ' + response.status + ').');
        }
        return response.text();
    }

    function load() {
        if (!dataPromise) {
            dataPromise = Promise.all([
                readText('assets/data/simulated_weed_gps.csv'),
                readText('assets/data/simulated_gps_route.csv'),
                readText('assets/data/simulated_field_density.geojson')
            ]).then(function (files) {
                const data = {
                    weeds: parseWeeds(files[0]),
                    route: parseRoute(files[1]),
                    densityCells: parseDensity(files[2])
                };
                data.summary = summarize(data);
                return data;
            });
        }
        return dataPromise;
    }

    global.NabtaFieldData = {
        load: load,
        summarize: summarize
    };
}(window));
