import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
    MapPin, RefreshCw, Users, Signal, SignalZero,
    Clock, Navigation, Maximize2, Minimize2
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

const LiveTracking = ({ user }) => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedRep, setSelectedRep] = useState(null);
    const [mapExpanded, setMapExpanded] = useState(false);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const mapInstanceRef = useRef(null);
    const intervalRef = useRef(null);

    const fetchLocations = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/live-locations');
            setLocations(response.data.locations || []);
        } catch (error) {
            console.error('Failed to fetch live locations:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        // Check if Leaflet is available
        if (!window.L) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => initMap();
            document.body.appendChild(script);
        } else {
            initMap();
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstanceRef.current) return;

        // Default center: Egypt
        const map = window.L.map(mapRef.current).setView([26.8206, 30.8025], 6);

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        mapInstanceRef.current = map;
    };

    // Update markers when locations change
    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;

        const map = mapInstanceRef.current;

        // Clear old markers
        Object.values(markersRef.current).forEach(marker => {
            map.removeLayer(marker);
        });
        markersRef.current = {};

        // Add new markers
        locations.forEach(loc => {
            if (loc.latitude && loc.longitude) {
                const isOnline = loc.is_online;

                const icon = window.L.divIcon({
                    className: 'custom-marker',
                    html: `
            <div style="
              background: ${isOnline ? '#10b981' : '#6b7280'};
              color: white;
              padding: 8px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              white-space: nowrap;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span style="
                width: 8px;
                height: 8px;
                background: ${isOnline ? '#34d399' : '#9ca3af'};
                border-radius: 50%;
                display: inline-block;
                animation: ${isOnline ? 'pulse 2s infinite' : 'none'};
              "></span>
              ${loc.user_name?.split(' ')[0] || 'Rep'}
            </div>
          `,
                    iconSize: [100, 36],
                    iconAnchor: [50, 18]
                });

                const marker = window.L.marker([loc.latitude, loc.longitude], { icon })
                    .addTo(map)
                    .bindPopup(`
            <div style="min-width: 150px;">
              <strong>${loc.user_name || 'Unknown'}</strong><br/>
              <small>${isOnline ? '🟢 Online' : '🔴 Offline'}</small><br/>
              <small>Last: ${new Date(loc.timestamp).toLocaleTimeString('ar-EG')}</small><br/>
              <small>${loc.last_activity || ''}</small>
            </div>
          `);

                markersRef.current[loc.user_id] = marker;

                if (selectedRep === loc.user_id) {
                    marker.openPopup();
                    map.setView([loc.latitude, loc.longitude], 14);
                }
            }
        });

        // Fit bounds if we have locations
        if (locations.length > 0) {
            const validLocations = locations.filter(l => l.latitude && l.longitude);
            if (validLocations.length > 0) {
                const bounds = window.L.latLngBounds(
                    validLocations.map(l => [l.latitude, l.longitude])
                );
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [locations, selectedRep]);

    // Auto-refresh
    useEffect(() => {
        fetchLocations();

        if (autoRefresh) {
            intervalRef.current = setInterval(fetchLocations, 10000); // Every 10 seconds
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [autoRefresh, fetchLocations]);

    const onlineCount = locations.filter(l => l.is_online).length;
    const offlineCount = locations.filter(l => !l.is_online).length;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 rounded-lg">
                        <Navigation className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">التتبع المباشر</h2>
                        <p className="text-sm text-slate-500">تتبع موقع المناديب في الوقت الفعلي</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 px-4 py-2 bg-slate-100 rounded-lg">
                        <div className="flex items-center gap-2">
                            <Signal className="h-4 w-4 text-green-500" />
                            <span className="font-bold text-green-600">{onlineCount}</span>
                            <span className="text-sm text-slate-500">نشط</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <SignalZero className="h-4 w-4 text-gray-400" />
                            <span className="font-bold text-gray-500">{offlineCount}</span>
                            <span className="text-sm text-slate-500">غير متصل</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <Button
                        variant={autoRefresh ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'تحديث تلقائي' : 'تحديث يدوي'}
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchLocations}
                        disabled={loading}
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setMapExpanded(!mapExpanded)}
                    >
                        {mapExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <div className={`grid gap-4 ${mapExpanded ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-4'}`}>
                {/* Map */}
                <Card className={`${mapExpanded ? 'col-span-1' : 'lg:col-span-3'} overflow-hidden`}>
                    <div
                        ref={mapRef}
                        className={`w-full ${mapExpanded ? 'h-[70vh]' : 'h-[500px]'}`}
                        style={{ minHeight: '400px' }}
                    />
                    <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
                </Card>

                {/* Rep List */}
                {!mapExpanded && (
                    <Card className="p-4">
                        <h3 className="font-bold mb-3 flex items-center gap-2">
                            <Users className="h-5 w-5 text-slate-600" />
                            المناديب ({locations.length})
                        </h3>
                        <div className="space-y-2 max-h-[450px] overflow-y-auto">
                            {locations.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <MapPin className="h-12 w-12 mx-auto mb-2" />
                                    <p>لا توجد مواقع حالياً</p>
                                </div>
                            ) : (
                                locations.map(loc => (
                                    <div
                                        key={loc.user_id}
                                        className={`p-3 rounded-lg cursor-pointer transition-all ${selectedRep === loc.user_id
                                                ? 'bg-rose-50 border-2 border-rose-300'
                                                : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                                            }`}
                                        onClick={() => setSelectedRep(loc.user_id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${loc.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                <span className="font-medium text-sm">{loc.user_name}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                                            <Clock className="h-3 w-3" />
                                            {new Date(loc.timestamp).toLocaleTimeString('ar-EG')}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default LiveTracking;
