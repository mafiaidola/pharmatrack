import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Plus, Building2, MapPin, Phone, Mail, User, FileText, Map as MapIcon, Search, Navigation, Edit2, Trash2, RefreshCw, Target, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { requestGPSPermission, getLocationSilently, watchGPSPosition, stopWatchingGPS, getHighAccuracyLocation, getAccuracySummary } from '../utils/gps';
import { useLanguage } from '../contexts/LanguageContext';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { fromLonLat, toLonLat, getPointResolution } from 'ol/proj';
import { Style, Icon, Circle, Fill, Stroke } from 'ol/style';
import { Translate } from 'ol/interaction';
import 'ol/ol.css';

const Clinics = ({ user, onLogout }) => {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [lines, setLines] = useState([]);
  const [areas, setAreas] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingClinic, setEditingClinic] = useState(null);
  const [newClinic, setNewClinic] = useState({
    line_id: '',
    area_id: '',
    name: '',
    address: '',
    doctor_name: '',
    doctor_phone: '',
    specialty: '',
    phone: '',
    email: '',
    latitude: null,
    longitude: null,
    classification: 'B',
    credit_classification: 'Yellow',
    classification_notes: '',
    registration_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [selectedLine, setSelectedLine] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Real-time GPS tracking state
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [accuracyInfo, setAccuracyInfo] = useState(null);
  const gpsWatchId = useRef(null);
  const accuracyLayer = useRef(null);

  // Map refs
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerLayer = useRef(null);
  const [mapContainerReady, setMapContainerReady] = useState(false);

  // Callback ref for map container - triggers when element is attached to DOM
  const mapContainerRef = (node) => {
    if (node && !mapRef.current) {
      mapRef.current = node;
      setMapContainerReady(true);
    }
  };

  useEffect(() => {
    fetchClinics();
    fetchLines();
    fetchAreas();
  }, []);

  useEffect(() => {
    if (selectedLine) {
      fetchAreas(selectedLine);
    }
  }, [selectedLine]);

  // Initialize map when container is ready and dialog is open
  useEffect(() => {
    if (showDialog && mapContainerReady && mapRef.current && !mapInstance.current) {
      // Small delay to ensure DOM is painted
      const timeoutId = setTimeout(() => {
        if (mapRef.current && !mapInstance.current) {
          initializeMap();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [showDialog, mapContainerReady]);

  // Cleanup map when dialog closes
  useEffect(() => {
    if (!showDialog && mapInstance.current) {
      mapInstance.current.setTarget(null);
      mapInstance.current = null;
      mapRef.current = null;
      setMapContainerReady(false);
    }
  }, [showDialog]);


  // Update marker when location changes
  useEffect(() => {
    if (mapInstance.current && newClinic.latitude && newClinic.longitude) {
      updateMarker(newClinic.latitude, newClinic.longitude);
    }
  }, [newClinic.latitude, newClinic.longitude]);

  const initializeMap = async () => {
    // PROGRESSIVE GPS APPROACH:
    // 1. Show map immediately with default/cached location
    // 2. Get fast initial GPS reading
    // 3. Auto-start tracking for progressive refinement

    let initialLat = 30.0444;  // Default to Cairo
    let initialLng = 31.2357;
    let hasLocation = false;

    // Step 1: Try to use cached location for instant display
    const cached = localStorage.getItem('gps_location_cache');
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        if (cachedData.latitude && cachedData.longitude) {
          initialLat = cachedData.latitude;
          initialLng = cachedData.longitude;
          hasLocation = true;
        }
      } catch { }
    }

    // Set initial location (will be refined later)
    setNewClinic(prev => ({
      ...prev,
      latitude: initialLat,
      longitude: initialLng
    }));

    // Create marker layer
    const markerSource = new VectorSource();
    markerLayer.current = new VectorLayer({
      source: markerSource,
      zIndex: 10
    });

    // Create map
    mapInstance.current = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        markerLayer.current
      ],
      view: new View({
        center: fromLonLat([initialLng, initialLat]),
        zoom: 16
      })
    });

    // Add initial marker
    updateMarker(initialLat, initialLng);

    // Click to place marker
    mapInstance.current.on('click', (event) => {
      const coords = toLonLat(event.coordinate);
      setNewClinic(prev => ({
        ...prev,
        latitude: coords[1],
        longitude: coords[0]
      }));
      reverseGeocode(coords[1], coords[0]);
    });

    // Add Translate interaction for draggable pin
    const translate = new Translate({
      layers: [markerLayer.current],
      filter: (feature) => {
        // Only allow dragging the main point marker, not the accuracy circle
        return feature.getGeometry().getType() === 'Point';
      }
    });

    translate.on('translateend', (event) => {
      const features = event.features.getArray();
      if (features.length > 0) {
        const mainMarker = features.find(f => f.getGeometry().getType() === 'Point');
        if (mainMarker) {
          const coords = toLonLat(mainMarker.getGeometry().getCoordinates());
          setNewClinic(prev => ({
            ...prev,
            latitude: coords[1],
            longitude: coords[0]
          }));
          reverseGeocode(coords[1], coords[0]);
        }
      }
    });

    mapInstance.current.addInteraction(translate);

    // Force map to update its size after rendering in dialog
    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.updateSize();
      }
    }, 100);

    // Step 2 & 3: Auto-start GPS tracking for progressive accuracy improvement
    // This runs in background and progressively improves the location
    setGettingLocation(true);

    // First, try a quick single GPS reading
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        setNewClinic(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng
        }));
        updateMarker(lat, lng, accuracy);
        reverseGeocode(lat, lng);
        setGettingLocation(false);

        // Cache this location for next time
        localStorage.setItem('gps_location_cache', JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          timestamp: new Date().toISOString()
        }));

        // If accuracy is not great, auto-start live tracking for refinement
        if (accuracy > 50) {
          toast.info('جاري تحسين دقة الموقع تلقائياً...');
          startLocationTracking();
        } else {
          toast.success(`تم تحديد موقعك بدقة ${Math.round(accuracy)} متر`);
        }
      },
      (error) => {
        setGettingLocation(false);
        // If GPS fails, the map will show cached/default location
        toast.warning('لم نتمكن من تحديد موقعك الحالي. يرجى تحريك الدبوس يدوياً.');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };

  const updateMarker = (lat, lng, accuracy = null) => {
    if (!markerLayer.current) return;

    const source = markerLayer.current.getSource();
    source.clear();

    const coords = fromLonLat([lng, lat]);

    // Determine accuracy color
    let fillColor = '#14b8a6';
    let strokeColor = '#0d9488';
    let accuracyFillColor = 'rgba(20, 184, 166, 0.15)';
    let accuracyStrokeColor = 'rgba(20, 184, 166, 0.5)';

    if (accuracy) {
      if (accuracy <= 10) {
        // Ultra accurate - green
        fillColor = '#22c55e';
        strokeColor = '#16a34a';
        accuracyFillColor = 'rgba(34, 197, 94, 0.2)';
        accuracyStrokeColor = 'rgba(34, 197, 94, 0.6)';
      } else if (accuracy <= 30) {
        // High accuracy - teal
        fillColor = '#14b8a6';
        strokeColor = '#0d9488';
        accuracyFillColor = 'rgba(20, 184, 166, 0.15)';
        accuracyStrokeColor = 'rgba(20, 184, 166, 0.5)';
      } else if (accuracy <= 100) {
        // Medium accuracy - yellow
        fillColor = '#eab308';
        strokeColor = '#ca8a04';
        accuracyFillColor = 'rgba(234, 179, 8, 0.15)';
        accuracyStrokeColor = 'rgba(234, 179, 8, 0.5)';
      } else {
        // Low accuracy - red/orange
        fillColor = '#f97316';
        strokeColor = '#ea580c';
        accuracyFillColor = 'rgba(249, 115, 22, 0.15)';
        accuracyStrokeColor = 'rgba(249, 115, 22, 0.5)';
      }
    }

    // Add accuracy circle if accuracy is available
    if (accuracy && mapInstance.current) {
      const view = mapInstance.current.getView();
      const projection = view.getProjection();
      const resolution = getPointResolution(projection, 1, coords);
      const radiusInProjectionUnits = accuracy / resolution;

      const accuracyCircle = new Feature({
        geometry: new CircleGeom(coords, radiusInProjectionUnits)
      });

      accuracyCircle.setStyle(new Style({
        fill: new Fill({ color: accuracyFillColor }),
        stroke: new Stroke({ color: accuracyStrokeColor, width: 2 })
      }));

      source.addFeature(accuracyCircle);
    }

    // Main marker (center point)
    const marker = new Feature({
      geometry: new Point(coords)
    });

    marker.setStyle(new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: strokeColor, width: 3 })
      })
    }));

    source.addFeature(marker);

    // Inner dot for precision indicator
    const innerDot = new Feature({
      geometry: new Point(coords)
    });

    innerDot.setStyle(new Style({
      image: new Circle({
        radius: 4,
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: strokeColor, width: 1 })
      })
    }));

    source.addFeature(innerDot);

    // Center map on marker
    if (mapInstance.current) {
      mapInstance.current.getView().animate({
        center: coords,
        duration: 500
      });
    }

    // Update accuracy info state
    if (accuracy) {
      setLocationAccuracy(accuracy);
      setAccuracyInfo(getAccuracySummary(accuracy));
    }
  };

  // Start real-time GPS tracking for maximum accuracy
  const startLocationTracking = useCallback(() => {
    if (gpsWatchId.current !== null) return;

    setIsTrackingLocation(true);
    setGettingLocation(true);
    toast.info('جاري تتبع الموقع للحصول على أعلى دقة...');

    gpsWatchId.current = watchGPSPosition(
      (location) => {
        // Update location with each GPS reading
        setNewClinic(prev => ({
          ...prev,
          latitude: location.latitude,
          longitude: location.longitude
        }));
        updateMarker(location.latitude, location.longitude, location.accuracy);
        reverseGeocode(location.latitude, location.longitude);
        setGettingLocation(false);

        // If accuracy is excellent, show success
        if (location.accuracy <= 10) {
          toast.success(`تم تحديد الموقع بدقة متناهية: ${Math.round(location.accuracy)} متر`);
        }
      },
      (error) => {
        console.error('GPS watch error:', error);
        setGettingLocation(false);
        toast.error('خطأ في تتبع الموقع');
      }
    );
  }, []);

  // Stop GPS tracking
  const stopLocationTracking = useCallback(() => {
    if (gpsWatchId.current !== null) {
      stopWatchingGPS(gpsWatchId.current);
      gpsWatchId.current = null;
      setIsTrackingLocation(false);
      toast.info('تم إيقاف تتبع الموقع');
    }
  }, []);

  // Cleanup GPS watch on unmount or dialog close
  useEffect(() => {
    return () => {
      if (gpsWatchId.current !== null) {
        stopWatchingGPS(gpsWatchId.current);
        gpsWatchId.current = null;
      }
    };
  }, []);

  // Stop tracking when dialog closes
  useEffect(() => {
    if (!showDialog) {
      stopLocationTracking();
    }
  }, [showDialog, stopLocationTracking]);


  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`
      );
      const data = await response.json();
      if (data.display_name) {
        setAddressSearch(data.display_name);
        setNewClinic(prev => ({
          ...prev,
          address: data.display_name
        }));
      }
    } catch (error) {
      // Reverse geocode failed silently
    }
  };

  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=ar`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      // Address search failed silently
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setNewClinic(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      address: result.display_name
    }));
    setAddressSearch(result.display_name);
    setSearchResults([]);
    updateMarker(lat, lng);
  };

  const fetchClinics = async () => {
    try {
      const response = await api.get('/clinics');
      setClinics(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load clinics');
    }
  };

  const fetchLines = async () => {
    try {
      const response = await api.get('/lines');
      setLines(response.data);
    } catch (error) {
      toast.error('Failed to load lines');
    }
  };

  const fetchAreas = async (lineId = null) => {
    try {
      const url = lineId ? `/areas?line_id=${lineId}` : '/areas';
      const response = await api.get(url);
      setAreas(response.data);
    } catch (error) {
      toast.error('Failed to load areas');
    }
  };

  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      // Use high accuracy mode for better precision
      const location = await getHighAccuracyLocation({
        targetAccuracy: 10, // Aim for 10 meter accuracy
        maxAttempts: 5
      });
      setNewClinic({
        ...newClinic,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      updateMarker(location.latitude, location.longitude, location.accuracy);
      reverseGeocode(location.latitude, location.longitude);

      const accuracyText = location.accuracy <= 10 ? 'بدقة متناهية' :
        location.accuracy <= 30 ? 'بدقة عالية' :
          location.accuracy <= 100 ? 'بدقة متوسطة' : 'بدقة منخفضة';
      toast.success(`تم التقاط الموقع ${accuracyText}: ${Math.round(location.accuracy)} متر`);
    } catch (error) {
      toast.error('فشل في الحصول على الموقع. يرجى تفعيل GPS.');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleLineChange = (lineId) => {
    setSelectedLine(lineId);
    setNewClinic({ ...newClinic, line_id: lineId, area_id: '' });
  };

  const handleEditClinic = (clinic) => {
    setEditingClinic(clinic);
    setNewClinic({
      line_id: clinic.line_id || '',
      area_id: clinic.area_id || '',
      name: clinic.name || '',
      address: clinic.address || '',
      doctor_name: clinic.doctor_name || '',
      doctor_phone: clinic.doctor_phone || '',
      specialty: clinic.specialty || '',
      phone: clinic.phone || '',
      email: clinic.email || '',
      latitude: clinic.latitude || null,
      longitude: clinic.longitude || null,
      classification: clinic.classification || 'B',
      credit_classification: clinic.credit_classification || 'Yellow',
      classification_notes: clinic.classification_notes || '',
      registration_notes: clinic.registration_notes || '',
    });
    setSelectedLine(clinic.line_id || '');
    setAddressSearch(clinic.address || '');
    setShowDialog(true);
  };

  const handleDeleteClinic = async (clinicId) => {
    if (window.confirm('هل أنت متأكد من حذف هذه العيادة؟')) {
      try {
        await api.delete(`/clinics/${clinicId}`);
        toast.success('تم حذف العيادة بنجاح');
        fetchClinics();
      } catch (error) {
        toast.error('فشل في حذف العيادة');
      }
    }
  };

  const resetForm = () => {
    setNewClinic({
      line_id: '',
      area_id: '',
      name: '',
      address: '',
      doctor_name: '',
      doctor_phone: '',
      specialty: '',
      phone: '',
      email: '',
      latitude: null,
      longitude: null,
      classification: 'B',
      credit_classification: 'Yellow',
      classification_notes: '',
      registration_notes: '',
    });
    setSelectedLine('');
    setAddressSearch('');
    setSearchResults([]);
    setEditingClinic(null);
    if (mapInstance.current) {
      mapInstance.current.setTarget(null);
      mapInstance.current = null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newClinic.line_id || !newClinic.area_id) {
      toast.error('يرجى اختيار الخط والمنطقة');
      return;
    }

    setLoading(true);

    try {
      if (editingClinic) {
        await api.put(`/clinics/${editingClinic.id}`, newClinic);
        toast.success('تم تحديث العيادة بنجاح');
      } else {
        await api.post('/clinics', newClinic);
        toast.success('تم تسجيل العيادة بنجاح');
      }
      setShowDialog(false);
      resetForm();
      fetchClinics();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ العيادة');
    } finally {
      setLoading(false);
    }
  };

  const getClassificationColor = (classification) => {
    const colors = {
      'A': 'bg-green-100 text-green-800 border-green-300',
      'B': 'bg-blue-100 text-blue-800 border-blue-300',
      'C': 'bg-orange-100 text-orange-800 border-orange-300'
    };
    return colors[classification] || colors['B'];
  };

  const getCreditColor = (credit) => {
    const colors = {
      'Green': 'bg-green-500',
      'Yellow': 'bg-yellow-500',
      'Red': 'bg-red-500'
    };
    return colors[credit] || colors['Yellow'];
  };

  const filteredAreas = selectedLine
    ? areas.filter(area => area.line_id === selectedLine)
    : areas;

  const canEdit = user?.role === 'super_admin';
  const canAdd = user?.role !== 'manager';

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('clinics')}</h1>
            <p className="text-slate-600 mt-1">{t('manageClinicInfo')}</p>
          </div>
          {canAdd && (
            <Dialog open={showDialog} onOpenChange={(open) => {
              setShowDialog(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 rounded-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('addClinic')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">
                    {editingClinic ? 'تعديل العيادة' : 'تسجيل عيادة جديدة'}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600">
                    {editingClinic ? 'تعديل بيانات العيادة' : 'أكمل جميع المعلومات المطلوبة'}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Section 1: Location & Map (FIRST) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-primary">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-slate-900">الموقع على الخريطة</h3>
                    </div>

                    {/* Map */}
                    <div className="relative">
                      <div
                        ref={mapContainerRef}
                        className="w-full h-80 rounded-xl border-2 border-primary/30 overflow-hidden shadow-lg cursor-grab active:cursor-grabbing"
                      />

                      {/* Floating Re-center Button */}
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        disabled={gettingLocation}
                        className="absolute bottom-3 right-3 bg-white p-3 rounded-full shadow-lg hover:bg-slate-100 transition-all z-10 border border-slate-200 hover:scale-110 disabled:opacity-50"
                        title="تحديد موقعي الحالي"
                      >
                        <Navigation className={`h-5 w-5 text-primary ${gettingLocation ? 'animate-pulse' : ''}`} />
                      </button>

                      {/* Map Instructions Badge */}
                      <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                        📍 اضغط أو اسحب الدبوس لتحديد الموقع
                      </div>

                      {gettingLocation && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-full shadow-lg">
                            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                            <span className="font-medium">جاري تحديد الموقع...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Location Info */}
                    {newClinic.latitude && newClinic.longitude && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 text-green-800">
                          <MapPin className="h-4 w-4" />
                          <span className="font-medium">تم تحديد الموقع:</span>
                          <span className="font-mono text-sm">
                            {newClinic.latitude.toFixed(6)}, {newClinic.longitude.toFixed(6)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Address Search */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-primary" />
                        البحث عن العنوان
                      </Label>
                      <div className="relative">
                        <Input
                          value={addressSearch}
                          onChange={(e) => {
                            setAddressSearch(e.target.value);
                            searchAddress(e.target.value);
                          }}
                          placeholder="اكتب اسم الشارع أو العنوان للبحث..."
                          className="pr-10"
                        />
                        {searching && (
                          <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                        )}
                      </div>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {searchResults.map((result, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => selectSearchResult(result)}
                              className="w-full px-4 py-2 text-right hover:bg-slate-50 border-b border-slate-100 last:border-0"
                            >
                              <p className="text-sm text-slate-700 line-clamp-2">{result.display_name}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Location Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* High Accuracy Location Button */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGetLocation}
                        disabled={gettingLocation || isTrackingLocation}
                        className="rounded-full"
                      >
                        <Target className="h-4 w-4 mr-2" />
                        {gettingLocation && !isTrackingLocation ? 'جاري التحديد...' : 'تحديد دقيق'}
                      </Button>

                      {/* Real-time Tracking Toggle */}
                      <Button
                        type="button"
                        variant={isTrackingLocation ? "destructive" : "default"}
                        onClick={isTrackingLocation ? stopLocationTracking : startLocationTracking}
                        disabled={gettingLocation && !isTrackingLocation}
                        className="rounded-full"
                      >
                        {isTrackingLocation ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            إيقاف التتبع
                          </>
                        ) : (
                          <>
                            <Crosshair className="h-4 w-4 mr-2" />
                            تتبع مباشر
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Accuracy Indicator */}
                    {accuracyInfo && locationAccuracy && (
                      <div className={`p-3 rounded-lg border ${accuracyInfo.level === 'ULTRA' || accuracyInfo.level === 'HIGH'
                        ? 'bg-green-50 border-green-200'
                        : accuracyInfo.level === 'MEDIUM'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-orange-50 border-orange-200'
                        }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{accuracyInfo.icon}</span>
                            <span className={`font-medium ${accuracyInfo.level === 'ULTRA' || accuracyInfo.level === 'HIGH'
                              ? 'text-green-800'
                              : accuracyInfo.level === 'MEDIUM'
                                ? 'text-yellow-800'
                                : 'text-orange-800'
                              }`}>
                              {accuracyInfo.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">
                              ± {Math.round(locationAccuracy)} متر
                            </span>
                            {isTrackingLocation && (
                              <span className="flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 text-center">
                      استخدم "تتبع مباشر" للحصول على أعلى دقة ممكنة • الدائرة تظهر نطاق الدقة
                    </p>
                  </div>

                  {/* Section 2: Basic Information */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-blue-600">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-slate-900">بيانات العيادة</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          اسم العيادة *
                        </Label>
                        <Input
                          value={newClinic.name}
                          onChange={(e) => setNewClinic({ ...newClinic, name: e.target.value })}
                          placeholder="أدخل اسم العيادة"
                          required
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label>الخط *</Label>
                        <select
                          value={newClinic.line_id}
                          onChange={(e) => handleLineChange(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white mt-1"
                        >
                          <option value="">اختر الخط</option>
                          {lines.map((line) => (
                            <option key={line.id} value={line.id}>{line.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <Label>المنطقة *</Label>
                        <select
                          value={newClinic.area_id}
                          onChange={(e) => setNewClinic({ ...newClinic, area_id: e.target.value })}
                          required
                          disabled={!selectedLine}
                          className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white mt-1 disabled:bg-slate-100"
                        >
                          <option value="">اختر المنطقة</option>
                          {filteredAreas.map((area) => (
                            <option key={area.id} value={area.id}>{area.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <Label>العنوان التفصيلي</Label>
                        <Textarea
                          value={newClinic.address}
                          onChange={(e) => setNewClinic({ ...newClinic, address: e.target.value })}
                          placeholder="العنوان الكامل مع المعالم"
                          rows={2}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          اسم الطبيب
                        </Label>
                        <Input
                          value={newClinic.doctor_name}
                          onChange={(e) => setNewClinic({ ...newClinic, doctor_name: e.target.value })}
                          placeholder="د. الاسم الكامل"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label>التخصص</Label>
                        <Input
                          value={newClinic.specialty}
                          onChange={(e) => setNewClinic({ ...newClinic, specialty: e.target.value })}
                          placeholder="مثل: قلب، أطفال"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-primary" />
                          هاتف الطبيب
                        </Label>
                        <Input
                          value={newClinic.doctor_phone}
                          onChange={(e) => setNewClinic({ ...newClinic, doctor_phone: e.target.value })}
                          placeholder="رقم الطبيب المباشر"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-primary" />
                          هاتف العيادة
                        </Label>
                        <Input
                          value={newClinic.phone}
                          onChange={(e) => setNewClinic({ ...newClinic, phone: e.target.value })}
                          placeholder="رقم العيادة الرئيسي"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-primary" />
                          البريد الإلكتروني
                        </Label>
                        <Input
                          type="email"
                          value={newClinic.email}
                          onChange={(e) => setNewClinic({ ...newClinic, email: e.target.value })}
                          placeholder="clinic@example.com"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Classification */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-orange-600">
                      <FileText className="h-5 w-5 text-orange-600" />
                      <h3 className="text-lg font-semibold text-slate-900">التصنيفات</h3>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <Label className="text-base font-semibold mb-3 block">تصنيف العيادة</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {['A', 'B', 'C'].map((cls) => (
                            <button
                              key={cls}
                              type="button"
                              onClick={() => setNewClinic({ ...newClinic, classification: cls })}
                              className={`p-4 rounded-xl border-2 transition-all ${newClinic.classification === cls
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                              <div className="text-3xl font-bold text-slate-900 mb-1">{cls}</div>
                              <div className="text-xs text-slate-600">
                                {cls === 'A' && 'ممتاز'}
                                {cls === 'B' && 'جيد'}
                                {cls === 'C' && 'عادي'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="text-base font-semibold mb-3 block">تصنيف الائتمان</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { color: 'Green', label: 'ممتاز', icon: '✓' },
                            { color: 'Yellow', label: 'جيد', icon: '⚠' },
                            { color: 'Red', label: 'خطر', icon: '✗' }
                          ].map((credit) => (
                            <button
                              key={credit.color}
                              type="button"
                              onClick={() => setNewClinic({ ...newClinic, credit_classification: credit.color })}
                              className={`p-4 rounded-xl border-2 transition-all ${newClinic.credit_classification === credit.color
                                ? 'border-slate-900 shadow-md scale-105'
                                : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                              <div className={`w-8 h-8 rounded-full ${getCreditColor(credit.color)} mx-auto mb-2 flex items-center justify-center text-white font-bold`}>
                                {credit.icon}
                              </div>
                              <div className="text-sm font-semibold text-slate-900">{credit.color}</div>
                              <div className="text-xs text-slate-600">{credit.label}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          ملاحظات التصنيف
                        </Label>
                        <Textarea
                          value={newClinic.classification_notes}
                          onChange={(e) => setNewClinic({ ...newClinic, classification_notes: e.target.value })}
                          placeholder="ملاحظات حول معايير التصنيف..."
                          rows={2}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          ملاحظات التسجيل
                        </Label>
                        <Textarea
                          value={newClinic.registration_notes}
                          onChange={(e) => setNewClinic({ ...newClinic, registration_notes: e.target.value })}
                          placeholder="معلومات إضافية للتسجيل..."
                          rows={2}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Buttons */}
                  <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-white">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowDialog(false);
                        resetForm();
                      }}
                      className="flex-1 rounded-full"
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-primary hover:bg-primary/90 rounded-full"
                      disabled={loading}
                    >
                      {loading ? 'جاري الحفظ...' : (editingClinic ? 'تحديث العيادة' : 'تسجيل العيادة')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clinics.length === 0 ? (
            <Card className="col-span-full p-12 text-center border border-slate-200 rounded-xl">
              <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">لا توجد عيادات مسجلة</p>
              <p className="text-slate-400 text-sm mt-2">ابدأ بتسجيل أول عيادة</p>
            </Card>
          ) : (
            clinics.map((clinic) => {
              const line = lines.find(l => l.id === clinic.line_id);
              const area = areas.find(a => a.id === clinic.area_id);
              return (
                <Card
                  key={clinic.id}
                  className="p-6 border border-slate-200 rounded-xl shadow-sm hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center cursor-pointer"
                      onClick={() => navigate(`/clinics/${clinic.id}`)}
                    >
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClinic(clinic)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClinic(clinic.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div onClick={() => navigate(`/clinics/${clinic.id}`)} className="cursor-pointer">
                    <div className="flex items-center gap-2 mb-2">
                      {clinic.classification && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getClassificationColor(clinic.classification)}`}>
                          {clinic.classification}
                        </span>
                      )}
                      {clinic.credit_classification && (
                        <div className={`w-5 h-5 rounded-full ${getCreditColor(clinic.credit_classification)}`}></div>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{clinic.name}</h3>

                    <div className="space-y-2 text-sm mb-4">
                      {line && (
                        <p className="text-primary font-medium">
                          {line.name} • {area?.name || 'N/A'}
                        </p>
                      )}
                      {clinic.doctor_name && (
                        <p className="text-slate-700 flex items-center gap-2">
                          <User className="h-3 w-3" />
                          {clinic.doctor_name}
                          {clinic.specialty && <span className="text-slate-500">({clinic.specialty})</span>}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-sm text-slate-600 border-t pt-4">
                      {clinic.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-slate-400 flex-shrink-0" />
                          <span className="line-clamp-2">{clinic.address}</span>
                        </div>
                      )}
                      {clinic.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span>{clinic.phone}</span>
                        </div>
                      )}
                      {clinic.latitude && clinic.longitude && (
                        <div className="flex items-center gap-2 text-green-600">
                          <MapPin className="h-4 w-4" />
                          <span className="text-xs">GPS Verified</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Clinics;
