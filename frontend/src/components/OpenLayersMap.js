import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat } from 'ol/proj';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style';
import Overlay from 'ol/Overlay';
import 'ol/ol.css';

/**
 * OpenLayers Map Component for GPS Tracking
 * Features:
 * - Activity markers with color coding
 * - Route line showing movement path
 * - Heatmap for activity density
 * - Popup on click
 * - View mode toggle
 */

const ActivityColors = {
    LOGIN: { fill: '#10B981', stroke: '#059669' },
    LOGOUT: { fill: '#6B7280', stroke: '#4B5563' },
    VISIT: { fill: '#3B82F6', stroke: '#2563EB' },
    ORDER: { fill: '#8B5CF6', stroke: '#7C3AED' },
    CLINIC: { fill: '#14B8A6', stroke: '#0D9488' },
    EXPENSE: { fill: '#F97316', stroke: '#EA580C' },
    default: { fill: '#6B7280', stroke: '#4B5563' }
};

// Heatmap gradient colors (6-digit hex for proper color parsing)
const HeatmapGradient = ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'];

const OpenLayersMap = ({
    logs = [],
    center,
    zoom = 12,
    onMarkerClick,
    height = '400px',
    showLegend = true,
    showViewToggle = true,
    defaultView = 'markers' // 'markers', 'route', 'heatmap'
}) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const popupRef = useRef(null);
    const popupOverlay = useRef(null);
    const markersLayerRef = useRef(null);
    const routeLayerRef = useRef(null);
    const heatmapLayerRef = useRef(null);
    const [selectedLog, setSelectedLog] = useState(null);
    const [viewMode, setViewMode] = useState(defaultView);

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        // Create layers
        const markersSource = new VectorSource();
        const routeSource = new VectorSource();
        const heatmapSource = new VectorSource();

        markersLayerRef.current = new VectorLayer({
            source: markersSource,
            zIndex: 20,
            visible: viewMode === 'markers' || viewMode === 'route'
        });

        routeLayerRef.current = new VectorLayer({
            source: routeSource,
            zIndex: 15,
            visible: viewMode === 'route',
            style: new Style({
                stroke: new Stroke({
                    color: '#3B82F6',
                    width: 3,
                    lineDash: [10, 8]
                })
            })
        });

        // Simple heatmap using circles with opacity
        heatmapLayerRef.current = new VectorLayer({
            source: heatmapSource,
            zIndex: 10,
            visible: viewMode === 'heatmap'
        });

        // Create popup overlay
        popupOverlay.current = new Overlay({
            element: popupRef.current,
            positioning: 'bottom-center',
            offset: [0, -15],
            autoPan: true
        });

        // Determine initial center
        const logsWithCoords = logs.filter(l => l.latitude && l.longitude);
        const initialCenter = center
            ? fromLonLat([center[1], center[0]])
            : logsWithCoords.length > 0
                ? fromLonLat([logsWithCoords[0].longitude, logsWithCoords[0].latitude])
                : fromLonLat([31.2357, 30.0444]);

        // Create map
        mapInstance.current = new Map({
            target: mapRef.current,
            layers: [
                new TileLayer({ source: new OSM() }),
                heatmapLayerRef.current,
                routeLayerRef.current,
                markersLayerRef.current
            ],
            overlays: [popupOverlay.current],
            view: new View({
                center: initialCenter,
                zoom: zoom,
                minZoom: 3,
                maxZoom: 19
            })
        });

        // Click handler
        mapInstance.current.on('click', (event) => {
            const feature = mapInstance.current.forEachFeatureAtPixel(
                event.pixel,
                (feature) => feature,
                { layerFilter: (layer) => layer === markersLayerRef.current }
            );

            if (feature && feature.get('logData')) {
                const log = feature.get('logData');
                setSelectedLog(log);
                const coords = feature.getGeometry().getCoordinates();
                popupOverlay.current.setPosition(coords);
                if (onMarkerClick) onMarkerClick(log);
            } else {
                setSelectedLog(null);
                popupOverlay.current.setPosition(undefined);
            }
        });

        // Cursor change on hover
        mapInstance.current.on('pointermove', (event) => {
            const hit = mapInstance.current.hasFeatureAtPixel(event.pixel, {
                layerFilter: (layer) => layer === markersLayerRef.current
            });
            mapRef.current.style.cursor = hit ? 'pointer' : '';
        });

        return () => {
            if (mapInstance.current) {
                mapInstance.current.setTarget(null);
                mapInstance.current = null;
            }
        };
    }, []);

    // Update layers when logs or viewMode change
    useEffect(() => {
        if (!mapInstance.current) return;

        const logsWithCoords = logs
            .filter(l => l.latitude && l.longitude)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort by time

        // Update markers
        const markersSource = markersLayerRef.current?.getSource();
        if (markersSource) {
            markersSource.clear();
            logsWithCoords.forEach((log, index) => {
                const colors = ActivityColors[log.activity_type?.toUpperCase()] || ActivityColors.default;
                const feature = new Feature({
                    geometry: new Point(fromLonLat([log.longitude, log.latitude])),
                    logData: log
                });
                feature.setStyle(new Style({
                    image: new Circle({
                        radius: 12,
                        fill: new Fill({ color: colors.fill }),
                        stroke: new Stroke({ color: colors.stroke, width: 2 })
                    }),
                    text: new Text({
                        text: (index + 1).toString(),
                        fill: new Fill({ color: '#ffffff' }),
                        font: 'bold 10px sans-serif',
                        offsetY: 1
                    })
                }));
                markersSource.addFeature(feature);
            });
        }

        // Update route line
        const routeSource = routeLayerRef.current?.getSource();
        if (routeSource) {
            routeSource.clear();
            if (logsWithCoords.length > 1) {
                const coordinates = logsWithCoords.map(log =>
                    fromLonLat([log.longitude, log.latitude])
                );
                const routeFeature = new Feature({
                    geometry: new LineString(coordinates)
                });
                routeSource.addFeature(routeFeature);
            }
        }

        // Update heatmap (using weighted circles)
        const heatmapSource = heatmapLayerRef.current?.getSource();
        if (heatmapSource) {
            heatmapSource.clear();

            // Group points by proximity for density
            const gridSize = 0.005; // ~500m grid
            const densityMap = {};

            logsWithCoords.forEach(log => {
                const gridKey = `${Math.floor(log.latitude / gridSize)}_${Math.floor(log.longitude / gridSize)}`;
                if (!densityMap[gridKey]) {
                    densityMap[gridKey] = {
                        count: 0,
                        lat: log.latitude,
                        lon: log.longitude
                    };
                }
                densityMap[gridKey].count++;
                // Average position
                densityMap[gridKey].lat = (densityMap[gridKey].lat + log.latitude) / 2;
                densityMap[gridKey].lon = (densityMap[gridKey].lon + log.longitude) / 2;
            });

            const maxCount = Math.max(...Object.values(densityMap).map(d => d.count), 1);

            Object.values(densityMap).forEach(point => {
                const intensity = point.count / maxCount;
                const feature = new Feature({
                    geometry: new Point(fromLonLat([point.lon, point.lat]))
                });

                // Color based on intensity (blue -> cyan -> green -> yellow -> red)
                const colorIndex = Math.floor(intensity * (HeatmapGradient.length - 1));
                const color = HeatmapGradient[colorIndex];

                feature.setStyle(new Style({
                    image: new Circle({
                        radius: 20 + (intensity * 30),
                        fill: new Fill({ color: color + '80' }), // 50% opacity
                        stroke: new Stroke({ color: color, width: 2 })
                    })
                }));
                heatmapSource.addFeature(feature);
            });
        }

        // Update layer visibility
        markersLayerRef.current?.setVisible(viewMode === 'markers' || viewMode === 'route');
        routeLayerRef.current?.setVisible(viewMode === 'route');
        heatmapLayerRef.current?.setVisible(viewMode === 'heatmap');

        // Fit view
        if (logsWithCoords.length > 0 && !center) {
            const extent = markersSource?.getExtent();
            if (extent && extent[0] !== Infinity) {
                mapInstance.current.getView().fit(extent, {
                    padding: [50, 50, 50, 50],
                    maxZoom: 15,
                    duration: 500
                });
            }
        }
    }, [logs, viewMode, center]);

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleString('ar-EG');
    };

    return (
        <div className="relative">
            {/* View Toggle */}
            {showViewToggle && (
                <div className="absolute top-2 right-2 z-20 bg-white rounded-lg shadow-md border border-slate-200 p-1 flex gap-1">
                    <button
                        onClick={() => setViewMode('markers')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${viewMode === 'markers'
                            ? 'bg-primary text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        📍 العلامات
                    </button>
                    <button
                        onClick={() => setViewMode('route')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${viewMode === 'route'
                            ? 'bg-primary text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        🛤️ المسار
                    </button>
                    <button
                        onClick={() => setViewMode('heatmap')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${viewMode === 'heatmap'
                            ? 'bg-primary text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        🔥 الكثافة
                    </button>
                </div>
            )}

            {/* Map Container */}
            <div
                ref={mapRef}
                style={{ width: '100%', height }}
                className="rounded-lg overflow-hidden border border-slate-200"
            />

            {/* Popup */}
            <div ref={popupRef} className="absolute z-50">
                {selectedLog && (
                    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 min-w-[200px] max-w-[280px]">
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="w-3 h-3 rounded-full"
                                style={{
                                    backgroundColor: (ActivityColors[selectedLog.activity_type?.toUpperCase()] || ActivityColors.default).fill
                                }}
                            />
                            <span className="font-bold text-slate-900 text-sm">
                                {selectedLog.activity_type || 'Unknown'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-1">
                            {formatTime(selectedLog.timestamp)}
                        </p>
                        {selectedLog.metadata?.clinic_name && (
                            <p className="text-xs text-slate-700">
                                📍 {selectedLog.metadata.clinic_name}
                            </p>
                        )}
                        {selectedLog.metadata?.total_amount && (
                            <p className="text-xs text-slate-700">
                                💰 {selectedLog.metadata.total_amount.toFixed(2)}
                            </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1 font-mono">
                            {selectedLog.latitude?.toFixed(5)}, {selectedLog.longitude?.toFixed(5)}
                        </p>
                        <button
                            onClick={() => {
                                setSelectedLog(null);
                                popupOverlay.current?.setPosition(undefined);
                            }}
                            className="absolute top-1 right-1 text-slate-400 hover:text-slate-600"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Legend */}
            {showLegend && viewMode !== 'heatmap' && (
                <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-md border border-slate-100">
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                        {Object.entries(ActivityColors).filter(([key]) => key !== 'default').map(([type, colors]) => (
                            <div key={type} className="flex items-center gap-1">
                                <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: colors.fill }}
                                />
                                <span className="text-slate-600 capitalize">{type.toLowerCase()}</span>
                            </div>
                        ))}
                    </div>
                    {viewMode === 'route' && (
                        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-1">
                            <span className="w-6 h-0.5 bg-blue-500" style={{ borderBottom: '2px dashed #3B82F6' }} />
                            <span className="text-slate-600 text-xs">مسار الحركة</span>
                        </div>
                    )}
                </div>
            )}

            {/* Heatmap Legend */}
            {showLegend && viewMode === 'heatmap' && (
                <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md border border-slate-100">
                    <p className="text-xs font-medium text-slate-700 mb-2">كثافة النشاط</p>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">منخفض</span>
                        <div className="flex h-3">
                            {HeatmapGradient.map((color, i) => (
                                <div key={i} className="w-5 h-full" style={{ backgroundColor: color }} />
                            ))}
                        </div>
                        <span className="text-xs text-slate-500">مرتفع</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OpenLayersMap;
