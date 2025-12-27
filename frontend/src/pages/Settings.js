import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Edit2, Trash2, MapPin, Layers, Navigation, Settings as SettingsIcon, Upload, Globe, Palette, Image as ImageIcon, Type, FileText, Printer, Receipt, Eye, RefreshCw, Download, Archive, AlertCircle, CheckCircle, Activity, User, Monitor, Clock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { generatePreviewPDF } from '../utils/pdfExport';

const Settings = ({ user, onLogout }) => {
  const { t } = useLanguage();
  const { theme, toggleTheme, isDark } = useTheme();
  const [lines, setLines] = useState([]);
  const [areas, setAreas] = useState([]);
  const [gpsSettings, setGpsSettings] = useState(null);
  const [showLineDialog, setShowLineDialog] = useState(false);
  const [showAreaDialog, setShowAreaDialog] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [editingArea, setEditingArea] = useState(null);
  const [newLine, setNewLine] = useState({ name: '', description: '' });
  const [newArea, setNewArea] = useState({ line_id: '', name: '', description: '' });
  const [savingGPS, setSavingGPS] = useState(false);

  // Site Settings State
  const [siteSettings, setSiteSettings] = useState(null);
  const [savingSite, setSavingSite] = useState(false);
  const [uploading, setUploading] = useState({});

  // PDF Preview State
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfPreviewType, setPdfPreviewType] = useState('invoice');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Settings Export/Import State
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // GPS Test State
  const [gpsTestLoading, setGpsTestLoading] = useState(false);
  const [gpsTestResult, setGpsTestResult] = useState(null);

  // System Health State
  const [systemHealth, setSystemHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Session Management State
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    fetchLines();
    fetchAreas();
    if (user?.role === 'super_admin') {
      fetchGPSSettings();
    }
    fetchSiteSettings();
  }, [user]);

  const fetchLines = async () => {
    try {
      const response = await api.get('/lines');
      setLines(response.data);
    } catch (error) {
      toast.error('Failed to load lines');
    }
  };

  const fetchAreas = async () => {
    try {
      const response = await api.get('/areas');
      setAreas(response.data);
    } catch (error) {
      toast.error('Failed to load areas');
    }
  };

  const fetchGPSSettings = async () => {
    try {
      const response = await api.get('/gps-settings');
      setGpsSettings(response.data);
    } catch (error) {
      console.error('Failed to load GPS settings');
      setGpsSettings({
        gps_enabled: true,
        gps_api_key: '',
        gps_api_provider: 'browser',
        tracking_interval: 300,
        auto_track_during_work_hours: true,
        work_hours_start: '08:00',
        work_hours_end: '18:00',
        require_location_for_visits: true,
        location_verification_radius: 1.0
      });
    }
  };

  const handleGPSSettingsUpdate = async () => {
    setSavingGPS(true);
    try {
      await api.put('/gps-settings', gpsSettings);
      toast.success('GPS settings updated successfully');
    } catch (error) {
      toast.error('Failed to update GPS settings');
    } finally {
      setSavingGPS(false);
    }
  };

  const fetchSiteSettings = async () => {
    try {
      const response = await api.get('/site-settings');
      setSiteSettings(response.data);
    } catch (error) {
      console.error('Failed to load site settings');
    }
  };

  const fetchSystemHealth = async () => {
    setHealthLoading(true);
    try {
      const response = await api.get('/system-health', { timeout: 10000 });
      setSystemHealth(response.data);
    } catch (error) {
      console.error('Failed to load system health:', error?.response?.data || error?.message);
      const errorMessage = error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.message ||
        'فشل الاتصال بالخادم';
      setSystemHealth({
        status: 'error',
        health_score: 0,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    } finally {
      setHealthLoading(false);
    }
  };

  // Session Management Functions
  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      // Super admin sees all sessions with user info, others see only their own
      const endpoint = user?.role === 'super_admin' ? '/admin/sessions' : '/sessions';
      const response = await api.get(endpoint);
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions');
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const revokeSession = async (sessionId) => {
    if (!window.confirm('هل تريد إنهاء هذه الجلسة؟')) return;
    try {
      await api.delete(`/sessions/${sessionId}`);
      toast.success('تم إنهاء الجلسة');
      fetchSessions();
    } catch (error) {
      toast.error('فشل في إنهاء الجلسة');
    }
  };

  const logoutAllSessions = async () => {
    if (!window.confirm('هل تريد تسجيل الخروج من جميع الأجهزة؟')) return;
    try {
      await api.post('/sessions/logout-all');
      toast.success('تم تسجيل الخروج من جميع الأجهزة');
      fetchSessions();
    } catch (error) {
      toast.error('فشل في تسجيل الخروج');
    }
  };


  const handleSiteSettingsUpdate = async () => {
    setSavingSite(true);
    try {
      await api.put('/site-settings', siteSettings);
      toast.success('Site settings updated successfully');
      // Force reload to apply changes globally if needed, or update context
      window.location.reload();
    } catch (error) {
      toast.error('Failed to update site settings');
    } finally {
      setSavingSite(false);
    }
  };

  // PDF Preview Generation (async to support logo loading)
  const updatePdfPreview = async (type = pdfPreviewType) => {
    if (!siteSettings) return;
    setPreviewLoading(true);
    try {
      // Generate PDF with current settings (async to load logo)
      const blobUrl = await generatePreviewPDF(type, siteSettings);
      // Revoke previous URL to prevent memory leak
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewType(type);
    } catch (error) {
      console.error('PDF Preview Error:', error);
      toast.error('Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImageUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading({ ...uploading, [field]: true });
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Assuming generic upload endpoint returns { url: ... }
      const response = await api.post('/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSiteSettings({ ...siteSettings, [field]: response.data.url });
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploading({ ...uploading, [field]: false });
    }
  };

  // Settings Export - Download all settings as JSON
  const handleExportSettings = async () => {
    setExporting(true);
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        appName: "EP Group Settings Backup",
        data: {
          siteSettings: siteSettings || {},
          gpsSettings: gpsSettings || {},
          lines: lines || [],
          areas: areas || []
        }
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `EP_Group_Settings_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Settings exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export settings');
    } finally {
      setExporting(false);
    }
  };

  // Settings Import - Read and validate JSON file
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Validate structure
        if (!data.data || !data.version) {
          throw new Error('Invalid backup file format');
        }

        // Create preview
        const preview = {
          exportedAt: data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'Unknown',
          version: data.version,
          appName: data.appName || 'Unknown',
          counts: {
            siteSettings: data.data.siteSettings ? Object.keys(data.data.siteSettings).length : 0,
            gpsSettings: data.data.gpsSettings ? Object.keys(data.data.gpsSettings).length : 0,
            lines: data.data.lines?.length || 0,
            areas: data.data.areas?.length || 0
          },
          rawData: data.data
        };

        setImportPreview(preview);
        toast.success('File loaded successfully. Review and confirm import.');
      } catch (error) {
        console.error('Import parse error:', error);
        toast.error('Invalid backup file: ' + error.message);
        setImportPreview(null);
        setImportFile(null);
      }
    };
    reader.readAsText(file);
  };

  // Confirm and apply imported settings
  const confirmImport = async () => {
    if (!importPreview?.rawData) return;

    setImporting(true);
    try {
      const { siteSettings: importedSite, gpsSettings: importedGps, lines: importedLines, areas: importedAreas } = importPreview.rawData;

      // Update Site Settings
      if (importedSite && Object.keys(importedSite).length > 0) {
        await api.put('/site-settings', importedSite);
      }

      // Update GPS Settings
      if (importedGps && Object.keys(importedGps).length > 0) {
        await api.put('/gps-settings', importedGps);
      }

      // Note: Lines and Areas would need individual create/update calls
      // For now, we just update the settings that have single-document APIs

      toast.success('Settings imported successfully!');

      // Refresh data
      fetchSiteSettings();
      fetchGPSSettings();
      fetchLines();
      fetchAreas();

      // Clear import state
      setImportPreview(null);
      setImportFile(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import some settings: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setImportPreview(null);
    setImportFile(null);
  };

  // GPS Test Function
  const handleGpsTest = () => {
    if (!navigator.geolocation) {
      toast.error('GPS غير مدعوم في هذا المتصفح');
      setGpsTestResult({ error: 'GPS not supported in this browser' });
      return;
    }

    setGpsTestLoading(true);
    setGpsTestResult(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const result = {
          success: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: new Date(position.timestamp).toLocaleString(),
          mapsUrl: `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`
        };
        setGpsTestResult(result);
        setGpsTestLoading(false);
        toast.success('تم الحصول على الموقع بنجاح!');
      },
      (error) => {
        let errorMessage = 'خطأ غير معروف';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'تم رفض إذن الموقع';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'الموقع غير متاح';
            break;
          case error.TIMEOUT:
            errorMessage = 'انتهت مهلة طلب الموقع';
            break;
        }
        setGpsTestResult({ error: errorMessage });
        setGpsTestLoading(false);
        toast.error(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const handleLineSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLine) {
        await api.patch(`/lines/${editingLine.id}`, newLine);
        toast.success('Line updated successfully');
      } else {
        await api.post('/lines', newLine);
        toast.success('Line created successfully');
      }
      setShowLineDialog(false);
      setNewLine({ name: '', description: '' });
      setEditingLine(null);
      fetchLines();
    } catch (error) {
      toast.error('Failed to save line');
    }
  };

  const handleAreaSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingArea) {
        await api.patch(`/areas/${editingArea.id}`, newArea);
        toast.success('Area updated successfully');
      } else {
        await api.post('/areas', newArea);
        toast.success('Area created successfully');
      }
      setShowAreaDialog(false);
      setNewArea({ line_id: '', name: '', description: '' });
      setEditingArea(null);
      fetchAreas();
    } catch (error) {
      toast.error('Failed to save area');
    }
  };

  const handleDeleteLine = async (lineId) => {
    if (window.confirm('Are you sure you want to delete this line?')) {
      try {
        await api.delete(`/lines/${lineId}`);
        toast.success('Line deleted successfully');
        fetchLines();
        fetchAreas();
      } catch (error) {
        toast.error('Failed to delete line');
      }
    }
  };

  const handleDeleteArea = async (areaId) => {
    if (window.confirm('Are you sure you want to delete this area?')) {
      try {
        await api.delete(`/areas/${areaId}`);
        toast.success('Area deleted successfully');
        fetchAreas();
      } catch (error) {
        toast.error('Failed to delete area');
      }
    }
  };

  const handleEditLine = (line) => {
    setEditingLine(line);
    setNewLine({ name: line.name, description: line.description || '' });
    setShowLineDialog(true);
  };

  const handleEditArea = (area) => {
    setEditingArea(area);
    setNewArea({ line_id: area.line_id, name: area.name, description: area.description || '' });
    setShowAreaDialog(true);
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-8">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('settings')}</h1>
          <p className="text-slate-600 mt-1">{t('siteConfiguration')}</p>
        </div>

        {/* Site Settings Section - Super Admin Only */}
        {user?.role === 'super_admin' && siteSettings && (
          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                <Globe className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Site Configuration</h2>
                <p className="text-sm text-slate-600">Manage global site settings and branding</p>
              </div>
            </div>

            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-6">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="login">Login Page</TabsTrigger>
                <TabsTrigger value="print">Print Templates</TabsTrigger>
                <TabsTrigger value="footer">Footer</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Site Title</Label>
                    <Input
                      value={siteSettings.site_title || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, site_title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Company Name</Label>
                    <Input
                      value={siteSettings.company_name || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, company_name: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Tagline</Label>
                  <Input
                    value={siteSettings.tagline || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, tagline: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={siteSettings.contact_email || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input
                      value={siteSettings.contact_phone || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, contact_phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    {isDark ? <Moon className="h-5 w-5 text-indigo-600" /> : <Sun className="h-5 w-5 text-yellow-500" />}
                    <div>
                      <Label className="text-base font-medium">Dark Mode</Label>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Toggle dark/light theme</p>
                    </div>
                  </div>
                  <Switch checked={isDark} onCheckedChange={toggleTheme} />
                </div>
              </TabsContent>

              <TabsContent value="branding" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50">
                      {siteSettings.logo_url ? (
                        <div className="bg-white p-2 rounded border">
                          <img src={api.defaults.baseURL.replace('/api', '') + siteSettings.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
                        </div>
                      ) : (
                        <div className="h-16 w-16 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'logo_url')}
                          disabled={uploading.logo_url}
                          className="max-w-[250px]"
                        />
                        <p className="text-xs text-slate-500 mt-1">Recommended: PNG with transparent background</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Favicon</Label>
                    <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50">
                      {siteSettings.favicon_url ? (
                        <div className="bg-white p-2 rounded border">
                          <img src={api.defaults.baseURL.replace('/api', '') + siteSettings.favicon_url} alt="Favicon" className="h-8 w-8 object-contain" />
                        </div>
                      ) : (
                        <div className="h-12 w-12 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                          <Globe className="h-6 w-6" />
                        </div>
                      )}
                      <div>
                        <Input
                          type="file"
                          accept="image/*" // ICO or PNG
                          onChange={(e) => handleImageUpload(e, 'favicon_url')}
                          disabled={uploading.favicon_url}
                          className="max-w-[250px]"
                        />
                        <p className="text-xs text-slate-500 mt-1">Recommended: 32x32px PNG or ICO</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      type="color"
                      value={siteSettings.primary_color || '#14b8a6'}
                      onChange={(e) => setSiteSettings({ ...siteSettings, primary_color: e.target.value })}
                      className="w-20 h-10 p-1"
                    />
                    <Input
                      value={siteSettings.primary_color || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, primary_color: e.target.value })}
                      className="max-w-[150px]"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="login" className="space-y-6">
                {/* Particles Animation Section */}
                <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">Particle Animation</h3>
                      <p className="text-xs text-slate-500">Dynamic animated background</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Animation Style</Label>
                      <Select
                        value={siteSettings.login_particle_type || 'none'}
                        onValueChange={(value) => setSiteSettings({ ...siteSettings, login_particle_type: value })}
                      >
                        <SelectTrigger className="bg-white mt-1">
                          <SelectValue placeholder="Select style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">🚫 No Animation</SelectItem>
                          <SelectItem value="color">🎨 Color</SelectItem>
                          <SelectItem value="ball">🔵 Ball</SelectItem>
                          <SelectItem value="lines">📐 Lines</SelectItem>
                          <SelectItem value="thick">🔗 Thick</SelectItem>
                          <SelectItem value="circle">⭕ Circle</SelectItem>
                          <SelectItem value="cobweb">🕸️ Cobweb</SelectItem>
                          <SelectItem value="polygon">🔷 Polygon</SelectItem>
                          <SelectItem value="square">🟦 Square</SelectItem>
                          <SelectItem value="tadpole">🐛 Tadpole</SelectItem>
                          <SelectItem value="fountain">⛲ Fountain</SelectItem>
                          <SelectItem value="random">🎲 Random</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {siteSettings.login_particle_type && siteSettings.login_particle_type !== 'none' && (
                      <div>
                        <Label className="text-sm font-medium">Particle Color</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="color"
                            value={siteSettings.login_particle_color || '#6366f1'}
                            onChange={(e) => setSiteSettings({ ...siteSettings, login_particle_color: e.target.value })}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={siteSettings.login_particle_color || '#6366f1'}
                            onChange={(e) => setSiteSettings({ ...siteSettings, login_particle_color: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Colors & Styling Section */}
                <div className="p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
                      <Palette className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">Colors & Styling</h3>
                      <p className="text-xs text-slate-500">Customize login page appearance</p>
                    </div>
                  </div>

                  {/* Section Backgrounds */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div>
                      <Label className="text-xs">Left Section (from)</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_left_gradient_from || '#f0fdfa'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_left_gradient_from: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_left_gradient_from || '#f0fdfa'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_left_gradient_from: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Left Section (to)</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_left_gradient_to || '#ccfbf1'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_left_gradient_to: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_left_gradient_to || '#ccfbf1'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_left_gradient_to: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Right Section</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_right_bg_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_right_bg_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_right_bg_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_right_bg_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Form Background</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_form_bg_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_form_bg_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_form_bg_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_form_bg_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Text & Button Colors */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Title Color</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_text_color || '#0f172a'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_text_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_text_color || '#0f172a'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_text_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Subtitle Color</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_subtitle_color || '#64748b'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_subtitle_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_subtitle_color || '#64748b'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_subtitle_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Button Color</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_button_color || '#14b8a6'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_button_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_button_color || '#14b8a6'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_button_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Button Text</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="color"
                          value={siteSettings.login_button_text_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_button_text_color: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={siteSettings.login_button_text_color || '#ffffff'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, login_button_text_color: e.target.value })}
                          className="flex-1 text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Display Options */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-slate-500 to-gray-600 rounded-lg flex items-center justify-center">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">Display Options</h3>
                      <p className="text-xs text-slate-500">Toggle visual elements</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">Decorative Blurs</p>
                        <p className="text-xs text-slate-500">Colorful blur circles</p>
                      </div>
                      <Switch
                        checked={siteSettings.login_show_decorations !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, login_show_decorations: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">Image Ring</p>
                        <p className="text-xs text-slate-500">White ring around image</p>
                      </div>
                      <Switch
                        checked={siteSettings.login_show_image_ring !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, login_show_image_ring: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">Glassmorphism</p>
                        <p className="text-xs text-slate-500">Semi-transparent form</p>
                      </div>
                      <Switch
                        checked={siteSettings.login_glassmorphism !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, login_glassmorphism: checked })}
                      />
                    </div>
                  </div>
                </div>

                {/* Background Image & Text */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Background Image */}
                  <div className="p-4 border rounded-xl bg-white">
                    <Label className="font-semibold mb-3 block">Background Image</Label>
                    {siteSettings.login_background_url && (
                      <div className="relative w-full h-32 rounded-lg overflow-hidden border mb-3">
                        <img
                          src={api.defaults.baseURL.replace('/api', '') + siteSettings.login_background_url}
                          alt="Login Background"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'login_background_url')}
                      disabled={uploading.login_background_url}
                    />
                    <p className="text-xs text-slate-500 mt-2">📐 Recommended: 800×1200px</p>
                  </div>

                  {/* Text Content */}
                  <div className="p-4 border rounded-xl bg-white space-y-3">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={siteSettings.login_title || ''}
                        onChange={(e) => setSiteSettings({ ...siteSettings, login_title: e.target.value })}
                        placeholder="Welcome Back"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Subtitle</Label>
                      <Input
                        value={siteSettings.login_subtitle || ''}
                        onChange={(e) => setSiteSettings({ ...siteSettings, login_subtitle: e.target.value })}
                        placeholder="Sign in to your account"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="footer" className="space-y-4">
                <div>
                  <Label>Footer Text</Label>
                  <Input
                    value={siteSettings.footer_text || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, footer_text: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="print" className="space-y-6">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Printer className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">Print & Invoice Templates</span>
                  </div>
                  <p className="text-sm text-blue-700">Configure how your invoices and reports will look when exported as PDF</p>
                </div>

                {/* Template Style Selector */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Template Style</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Classic Template */}
                    <div
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${(siteSettings.invoice_template || 'classic') === 'classic'
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}
                      onClick={() => setSiteSettings({ ...siteSettings, invoice_template: 'classic' })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${(siteSettings.invoice_template || 'classic') === 'classic' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                          {(siteSettings.invoice_template || 'classic') === 'classic' && <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>}
                        </div>
                        <span className="font-semibold text-slate-800">Classic</span>
                      </div>
                      <div className="h-20 bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg mb-2 flex items-end p-2">
                        <div className="bg-white w-full h-12 rounded opacity-80"></div>
                      </div>
                      <p className="text-xs text-slate-600">Traditional layout with bold header and clean design</p>
                    </div>

                    {/* Modern Template */}
                    <div
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${siteSettings.invoice_template === 'modern'
                        ? 'border-purple-500 bg-purple-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-purple-300'
                        }`}
                      onClick={() => setSiteSettings({ ...siteSettings, invoice_template: 'modern' })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${siteSettings.invoice_template === 'modern' ? 'border-purple-500 bg-purple-500' : 'border-slate-300'}`}>
                          {siteSettings.invoice_template === 'modern' && <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>}
                        </div>
                        <span className="font-semibold text-slate-800">Modern</span>
                      </div>
                      <div className="h-20 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-lg mb-2 flex flex-col p-2">
                        <div className="bg-white/90 w-1/2 h-4 rounded mb-1"></div>
                        <div className="bg-white/70 flex-1 rounded"></div>
                      </div>
                      <p className="text-xs text-slate-600">Contemporary style with gradient accents</p>
                    </div>

                    {/* Minimal Template */}
                    <div
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${siteSettings.invoice_template === 'minimal'
                        ? 'border-teal-500 bg-teal-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-teal-300'
                        }`}
                      onClick={() => setSiteSettings({ ...siteSettings, invoice_template: 'minimal' })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${siteSettings.invoice_template === 'minimal' ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}>
                          {siteSettings.invoice_template === 'minimal' && <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>}
                        </div>
                        <span className="font-semibold text-slate-800">Minimal</span>
                      </div>
                      <div className="h-20 bg-slate-100 rounded-lg mb-2 flex flex-col p-2 border border-slate-200">
                        <div className="border-b border-slate-300 pb-1 mb-1">
                          <div className="bg-slate-300 w-1/3 h-2 rounded"></div>
                        </div>
                        <div className="bg-slate-200/50 flex-1 rounded"></div>
                      </div>
                      <p className="text-xs text-slate-600">Clean and simple with subtle borders</p>
                    </div>
                  </div>
                </div>

                {/* Invoice Logo */}
                <div className="space-y-2">
                  <Label>Invoice Logo</Label>
                  <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50">
                    {siteSettings.invoice_logo_url ? (
                      <div className="bg-white p-3 rounded-lg border shadow-sm">
                        <img src={api.defaults.baseURL.replace('/api', '') + siteSettings.invoice_logo_url} alt="Invoice Logo" className="h-16 w-auto object-contain" />
                      </div>
                    ) : (
                      <div className="h-20 w-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                        <FileText className="h-10 w-10" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, 'invoice_logo_url')}
                        disabled={uploading.invoice_logo_url}
                      />
                      <p className="text-xs text-slate-500 mt-1">This logo will appear on all invoices and PDF exports. Recommended: PNG with transparent background, 200x60px</p>
                    </div>
                  </div>
                </div>

                {/* Invoice Company Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Invoice Company Name</Label>
                    <Input
                      value={siteSettings.invoice_company_name || siteSettings.company_name || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, invoice_company_name: e.target.value })}
                      placeholder="Company name on invoices"
                    />
                  </div>
                  <div>
                    <Label>Invoice Tagline</Label>
                    <Input
                      value={siteSettings.invoice_tagline || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, invoice_tagline: e.target.value })}
                      placeholder="e.g., Quality Healthcare Solutions"
                    />
                  </div>
                </div>

                {/* Invoice Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Invoice Phone</Label>
                    <Input
                      value={siteSettings.invoice_phone || siteSettings.contact_phone || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, invoice_phone: e.target.value })}
                      placeholder="+20 XXX XXX XXXX"
                    />
                  </div>
                  <div>
                    <Label>Invoice Email</Label>
                    <Input
                      type="email"
                      value={siteSettings.invoice_email || siteSettings.contact_email || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, invoice_email: e.target.value })}
                      placeholder="invoices@company.com"
                    />
                  </div>
                  <div>
                    <Label>Invoice Website</Label>
                    <Input
                      value={siteSettings.invoice_website || ''}
                      onChange={(e) => setSiteSettings({ ...siteSettings, invoice_website: e.target.value })}
                      placeholder="www.company.com"
                    />
                  </div>
                </div>

                {/* Invoice Address */}
                <div>
                  <Label>Invoice Address</Label>
                  <Textarea
                    value={siteSettings.invoice_address || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, invoice_address: e.target.value })}
                    placeholder="Full company address for invoices"
                    rows={2}
                  />
                </div>

                {/* Invoice Footer */}
                <div>
                  <Label>Invoice Footer Text</Label>
                  <Input
                    value={siteSettings.invoice_footer || 'Thank you for your business!'}
                    onChange={(e) => setSiteSettings({ ...siteSettings, invoice_footer: e.target.value })}
                    placeholder="Thank you message on invoices"
                  />
                </div>

                {/* Document Prefix for Filenames */}
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-orange-600" />
                    <span className="font-medium text-orange-800">PDF Document Settings</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Document Prefix (Filename)</Label>
                      <Input
                        value={siteSettings.document_prefix || 'EP Group'}
                        onChange={(e) => setSiteSettings({ ...siteSettings, document_prefix: e.target.value })}
                        placeholder="EP Group"
                      />
                      <p className="text-xs text-slate-500 mt-1">Used in PDF filenames: e.g., "EP Group_invoice_001.pdf"</p>
                    </div>
                    <div>
                      <Label>Invoice Header Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={siteSettings.invoice_primary_color || '#ea580c'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, invoice_primary_color: e.target.value })}
                          className="w-14 h-10 p-1"
                        />
                        <Input
                          value={siteSettings.invoice_primary_color || '#ea580c'}
                          onChange={(e) => setSiteSettings({ ...siteSettings, invoice_primary_color: e.target.value })}
                          className="flex-1"
                          placeholder="#ea580c"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live PDF Preview Section */}
                <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-purple-600" />
                      <span className="font-semibold text-purple-800">Live Preview</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={pdfPreviewType} onValueChange={(val) => updatePdfPreview(val)}>
                        <SelectTrigger className="w-36 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="invoice">📄 Invoice</SelectItem>
                          <SelectItem value="expense">💰 Expense</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updatePdfPreview()}
                        disabled={previewLoading}
                        className="bg-white hover:bg-purple-100"
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${previewLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {pdfPreviewUrl ? (
                    <div className="w-full h-[450px] rounded-lg overflow-hidden border border-purple-300 shadow-inner bg-white">
                      <iframe
                        src={pdfPreviewUrl}
                        className="w-full h-full"
                        title="PDF Preview"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-full h-[450px] rounded-lg border-2 border-dashed border-purple-300 flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-purple-50 transition-colors"
                      onClick={() => updatePdfPreview()}
                    >
                      <Eye className="h-16 w-16 text-purple-300 mb-4" />
                      <p className="text-purple-600 font-medium">Click to Generate Preview</p>
                      <p className="text-sm text-purple-400 mt-1">See how your PDF will look with current settings</p>
                    </div>
                  )}

                  <p className="text-xs text-purple-500 mt-2 text-center">
                    💡 Preview updates when you change settings and click refresh. Save settings to apply permanently.
                  </p>
                </div>
              </TabsContent>

              {/* System Settings Tab */}
              <TabsContent value="system" className="space-y-6">
                {/* Dark Mode Toggle */}
                <div className="p-4 bg-gradient-to-r from-slate-100 to-slate-200 rounded-xl border border-slate-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isDark ? (
                        <Moon className="h-6 w-6 text-indigo-600" />
                      ) : (
                        <Sun className="h-6 w-6 text-amber-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-slate-800">Dark Mode</h3>
                        <p className="text-sm text-slate-600">Switch between light and dark theme</p>
                      </div>
                    </div>
                    <Button
                      onClick={toggleTheme}
                      variant="outline"
                      className={`relative px-6 py-2 rounded-full transition-all ${isDark
                        ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                        : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                        }`}
                    >
                      {isDark ? (
                        <>
                          <Moon className="h-4 w-4 mr-2" />
                          Dark Mode
                        </>
                      ) : (
                        <>
                          <Sun className="h-4 w-4 mr-2" />
                          Light Mode
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Timezone Settings */}
                <div className="p-4 bg-gradient-to-r from-sky-50 to-cyan-50 rounded-xl border border-sky-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe className="h-5 w-5 text-sky-600" />
                    <h3 className="font-semibold text-slate-700">Timezone Settings</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>System Timezone</Label>
                      <Select
                        value={siteSettings.timezone || 'Africa/Cairo'}
                        onValueChange={(value) => setSiteSettings({ ...siteSettings, timezone: value })}
                      >
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Africa/Cairo">Africa/Cairo (Egypt)</SelectItem>
                          <SelectItem value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</SelectItem>
                          <SelectItem value="Asia/Dubai">Asia/Dubai (UAE)</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (UK)</SelectItem>
                          <SelectItem value="America/New_York">America/New_York (US East)</SelectItem>
                          <SelectItem value="UTC">UTC (Universal Time)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">This timezone will be used for all date/time displays</p>
                    </div>
                  </div>
                </div>

                {/* Session Timeout */}
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2 mb-4">
                    <SettingsIcon className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-slate-700">Session Timeout</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Session Duration (minutes)</Label>
                      <Input
                        type="number"
                        min="15"
                        max="1440"
                        value={siteSettings.session_timeout_minutes || 480}
                        onChange={(e) => setSiteSettings({ ...siteSettings, session_timeout_minutes: parseInt(e.target.value) || 480 })}
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Users will be logged out after this duration of inactivity (15-1440 minutes)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notification Preferences */}
                <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="h-5 w-5 text-violet-600" />
                    <h3 className="font-semibold text-slate-700">Notification Preferences</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-slate-700">Email Notifications</p>
                        <p className="text-xs text-slate-500">Send notifications via email</p>
                      </div>
                      <Switch
                        checked={siteSettings.notification_email_enabled || false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, notification_email_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-slate-700">Push Notifications</p>
                        <p className="text-xs text-slate-500">Show in-app notification alerts</p>
                      </div>
                      <Switch
                        checked={siteSettings.notification_push_enabled !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, notification_push_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-slate-700">Order Alerts</p>
                        <p className="text-xs text-slate-500">Notify on order status changes</p>
                      </div>
                      <Switch
                        checked={siteSettings.notification_order_alerts !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, notification_order_alerts: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-slate-700">Expense Alerts</p>
                        <p className="text-xs text-slate-500">Notify on expense status changes</p>
                      </div>
                      <Switch
                        checked={siteSettings.notification_expense_alerts !== false}
                        onCheckedChange={(checked) => setSiteSettings({ ...siteSettings, notification_expense_alerts: checked })}
                      />
                    </div>
                  </div>
                </div>

                {/* Localization Settings */}
                <div className="p-4 bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl border border-rose-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Type className="h-5 w-5 text-rose-600" />
                    <h3 className="font-semibold text-slate-700">Localization Settings</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Language */}
                    <div>
                      <Label>Language / اللغة</Label>
                      <Select
                        value={siteSettings.language || 'ar'}
                        onValueChange={(value) => setSiteSettings({ ...siteSettings, language: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">العربية (Arabic)</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date Format */}
                    <div>
                      <Label>Date Format</Label>
                      <Select
                        value={siteSettings.date_format || 'DD/MM/YYYY'}
                        onValueChange={(value) => setSiteSettings({ ...siteSettings, date_format: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (23/12/2024)</SelectItem>
                          <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/23/2024)</SelectItem>
                          <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-12-23)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Currency */}
                    <div>
                      <Label>Currency</Label>
                      <Select
                        value={siteSettings.currency || 'EGP'}
                        onValueChange={(value) => {
                          const symbols = { EGP: 'ج.م', USD: '$', SAR: '﷼', AED: 'د.إ' };
                          setSiteSettings({
                            ...siteSettings,
                            currency: value,
                            currency_symbol: symbols[value] || 'ج.م'
                          });
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EGP">🇪🇬 EGP - Egyptian Pound (ج.م)</SelectItem>
                          <SelectItem value="USD">🇺🇸 USD - US Dollar ($)</SelectItem>
                          <SelectItem value="SAR">🇸🇦 SAR - Saudi Riyal (﷼)</SelectItem>
                          <SelectItem value="AED">🇦🇪 AED - UAE Dirham (د.إ)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Currency Symbol Display */}
                    <div className="flex items-center p-3 bg-white rounded-lg border">
                      <div>
                        <p className="text-sm text-slate-500">Current Symbol</p>
                        <p className="text-2xl font-bold text-rose-600">{siteSettings.currency_symbol || 'ج.م'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-6 mt-4 border-t border-slate-200">
              <Button
                onClick={handleSiteSettingsUpdate}
                disabled={savingSite}
                className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-full"
              >
                {savingSite ? 'Saving...' : 'Save Site Configuration'}
              </Button>
            </div>
          </Card>
        )}

        {/* GPS Settings Section - Super Admin Only */}
        {user?.role === 'super_admin' && gpsSettings && (
          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <Navigation className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">إعدادات GPS المتقدمة</h2>
                <p className="text-sm text-slate-600">تكوين التتبع الصامت ومعلومات الجهاز والخريطة</p>
              </div>
            </div>

            <Tabs defaultValue="tracking" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="tracking">التتبع</TabsTrigger>
                <TabsTrigger value="device">الجهاز</TabsTrigger>
                <TabsTrigger value="map">الخريطة</TabsTrigger>
                <TabsTrigger value="verification">التحقق</TabsTrigger>
              </TabsList>

              {/* Tracking Tab */}
              <TabsContent value="tracking" className="space-y-4">
                {/* GPS Enable/Disable */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">تفعيل تتبع GPS</Label>
                    <p className="text-sm text-slate-600">تشغيل/إيقاف تتبع GPS لجميع المستخدمين</p>
                  </div>
                  <Switch
                    checked={gpsSettings.gps_enabled}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, gps_enabled: checked })}
                  />
                </div>

                {/* Silent Tracking */}
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
                  <div>
                    <Label className="text-base font-medium text-green-800">التتبع الصامت</Label>
                    <p className="text-sm text-green-700">طلب إذن الموقع مرة واحدة عند الدخول ثم التتبع بصمت</p>
                  </div>
                  <Switch
                    checked={gpsSettings.silent_tracking_enabled ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, silent_tracking_enabled: checked })}
                  />
                </div>

                {/* Location Cache Duration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>مدة صلاحية الموقع المخزن (دقائق)</Label>
                    <Input
                      type="number"
                      value={gpsSettings.location_cache_minutes ?? 5}
                      onChange={(e) => setGpsSettings({ ...gpsSettings, location_cache_minutes: parseInt(e.target.value) })}
                      min="1"
                      max="60"
                    />
                    <p className="text-xs text-slate-500 mt-1">مدة استخدام الموقع المخزن قبل طلب موقع جديد</p>
                  </div>

                  <div>
                    <Label>فترة التتبع التلقائي (ثانية)</Label>
                    <Input
                      type="number"
                      value={gpsSettings.tracking_interval}
                      onChange={(e) => setGpsSettings({ ...gpsSettings, tracking_interval: parseInt(e.target.value) })}
                      min="60"
                      max="3600"
                    />
                    <p className="text-xs text-slate-500 mt-1">كم مرة يتم تحديث الموقع (60-3600 ثانية)</p>
                  </div>
                </div>

                {/* Work Hours */}
                <div className="p-4 bg-slate-50 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">التتبع التلقائي أثناء ساعات العمل</Label>
                      <p className="text-sm text-slate-600">تتبع المستخدمين خلال ساعات العمل فقط</p>
                    </div>
                    <Switch
                      checked={gpsSettings.auto_track_during_work_hours}
                      onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, auto_track_during_work_hours: checked })}
                    />
                  </div>

                  {gpsSettings.auto_track_during_work_hours && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>بداية ساعات العمل</Label>
                        <Input
                          type="time"
                          value={gpsSettings.work_hours_start}
                          onChange={(e) => setGpsSettings({ ...gpsSettings, work_hours_start: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>نهاية ساعات العمل</Label>
                        <Input
                          type="time"
                          value={gpsSettings.work_hours_end}
                          onChange={(e) => setGpsSettings({ ...gpsSettings, work_hours_end: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Device Info Tab */}
              <TabsContent value="device" className="space-y-4">
                {/* Capture Device Info */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">التقاط معلومات الجهاز</Label>
                    <p className="text-sm text-slate-600">تسجيل نوع المتصفح ونظام التشغيل ونوع الجهاز</p>
                  </div>
                  <Switch
                    checked={gpsSettings.capture_device_info ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, capture_device_info: checked })}
                  />
                </div>

                {/* Capture External IP */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">التقاط IP الخارجي</Label>
                    <p className="text-sm text-slate-600">تسجيل عنوان IP الحقيقي للمستخدم (ليس المحلي)</p>
                  </div>
                  <Switch
                    checked={gpsSettings.capture_external_ip ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, capture_external_ip: checked })}
                  />
                </div>

                {/* IP Fallback */}
                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-100">
                  <div>
                    <Label className="text-base font-medium text-orange-800">استخدام IP كـ Fallback للموقع</Label>
                    <p className="text-sm text-orange-700">إذا فشل GPS، استخدم الموقع المبني على IP</p>
                  </div>
                  <Switch
                    checked={gpsSettings.ip_location_fallback ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, ip_location_fallback: checked })}
                  />
                </div>

                {/* Device Info Preview */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <Label className="text-base font-medium text-blue-800 mb-2">المعلومات التي يتم تسجيلها:</Label>
                  <ul className="text-sm text-blue-700 list-disc list-inside space-y-1 mt-2">
                    <li>اسم المتصفح والإصدار (Chrome, Firefox, Safari...)</li>
                    <li>نوع الجهاز (موبايل، ديسكتوب، تابلت)</li>
                    <li>نظام التشغيل (Windows, iOS, Android...)</li>
                    <li>دقة الشاشة ونوع الاتصال</li>
                    <li>عنوان IP الخارجي</li>
                  </ul>
                </div>
              </TabsContent>

              {/* Map Tab */}
              <TabsContent value="map" className="space-y-4">
                {/* Map Provider */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>مزود الخرائط</Label>
                    <Select
                      value={gpsSettings.map_provider ?? 'openlayers'}
                      onValueChange={(value) => setGpsSettings({ ...gpsSettings, map_provider: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openlayers">OpenLayers (افتراضي)</SelectItem>
                        <SelectItem value="leaflet">Leaflet</SelectItem>
                        <SelectItem value="google">Google Maps</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>عرض الخريطة الافتراضي</Label>
                    <Select
                      value={gpsSettings.default_map_view ?? 'markers'}
                      onValueChange={(value) => setGpsSettings({ ...gpsSettings, default_map_view: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markers">📍 العلامات</SelectItem>
                        <SelectItem value="route">🛤️ المسار</SelectItem>
                        <SelectItem value="heatmap">🔥 الكثافة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Show Map in Dialog */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">عرض الخريطة في تفاصيل الحدث</Label>
                    <p className="text-sm text-slate-600">عرض خريطة صغيرة عند النقر على حدث في التايم لاين</p>
                  </div>
                  <Switch
                    checked={gpsSettings.show_map_in_dialog ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, show_map_in_dialog: checked })}
                  />
                </div>

                {/* Show Legend */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">عرض دليل الألوان</Label>
                    <p className="text-sm text-slate-600">عرض legend توضيحي للألوان على الخريطة</p>
                  </div>
                  <Switch
                    checked={gpsSettings.show_map_legend ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, show_map_legend: checked })}
                  />
                </div>

                {/* Heatmap Grid Size */}
                <div>
                  <Label>حجم شبكة الخريطة الحرارية (كم)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={gpsSettings.heatmap_grid_size ?? 0.5}
                    onChange={(e) => setGpsSettings({ ...gpsSettings, heatmap_grid_size: parseFloat(e.target.value) })}
                    min="0.1"
                    max="5"
                  />
                  <p className="text-xs text-slate-500 mt-1">حجم الخلية لتجميع نقاط الكثافة</p>
                </div>
              </TabsContent>

              {/* Verification Tab */}
              <TabsContent value="verification" className="space-y-4">
                {/* Require Location for Visits */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">طلب الموقع للزيارات</Label>
                    <p className="text-sm text-slate-600">إجبار المستخدمين على مشاركة الموقع عند تسجيل الزيارات</p>
                  </div>
                  <Switch
                    checked={gpsSettings.require_location_for_visits}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, require_location_for_visits: checked })}
                  />
                </div>

                {/* Require Location for Orders */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">طلب الموقع للطلبات</Label>
                    <p className="text-sm text-slate-600">تسجيل موقع العيادة تلقائياً عند إنشاء طلب</p>
                  </div>
                  <Switch
                    checked={gpsSettings.require_location_for_orders ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, require_location_for_orders: checked })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>نطاق التحقق من الموقع (كم)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={gpsSettings.location_verification_radius}
                      onChange={(e) => setGpsSettings({ ...gpsSettings, location_verification_radius: parseFloat(e.target.value) })}
                      min="0.1"
                      max="10"
                    />
                    <p className="text-xs text-slate-500 mt-1">أقصى مسافة للتحقق من الزيارة</p>
                  </div>

                  <div>
                    <Label>دقة GPS المطلوبة (متر)</Label>
                    <Input
                      type="number"
                      value={gpsSettings.required_accuracy ?? 100}
                      onChange={(e) => setGpsSettings({ ...gpsSettings, required_accuracy: parseInt(e.target.value) })}
                      min="10"
                      max="1000"
                    />
                    <p className="text-xs text-slate-500 mt-1">أقصى دقة مقبولة للموقع</p>
                  </div>
                </div>

                {/* Log All Activities */}
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-100">
                  <div>
                    <Label className="text-base font-medium text-purple-800">تسجيل جميع الأنشطة</Label>
                    <p className="text-sm text-purple-700">تسجيل: دخول، خروج، زيارات، طلبات، مصروفات، عيادات</p>
                  </div>
                  <Switch
                    checked={gpsSettings.log_all_activities ?? true}
                    onCheckedChange={(checked) => setGpsSettings({ ...gpsSettings, log_all_activities: checked })}
                  />
                </div>

                {/* GPS Test Button */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Navigation className="h-5 w-5 text-emerald-600" />
                    <Label className="text-base font-medium text-emerald-800">اختبار GPS</Label>
                  </div>
                  <p className="text-sm text-emerald-700 mb-4">اختبر وظيفة GPS للتحقق من أنها تعمل بشكل صحيح</p>

                  <Button
                    onClick={handleGpsTest}
                    disabled={gpsTestLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg mb-4"
                  >
                    {gpsTestLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        جاري الحصول على الموقع...
                      </>
                    ) : (
                      <>
                        <MapPin className="h-4 w-4 mr-2" />
                        اختبار GPS الآن
                      </>
                    )}
                  </Button>

                  {gpsTestResult && (
                    <div className={`p-3 rounded-lg ${gpsTestResult.success ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
                      {gpsTestResult.success ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-green-800 font-medium">
                            <MapPin className="h-4 w-4" />
                            تم الحصول على الموقع بنجاح!
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-green-700">
                            <span>خط العرض: {gpsTestResult.latitude?.toFixed(6)}</span>
                            <span>خط الطول: {gpsTestResult.longitude?.toFixed(6)}</span>
                            <span>الدقة: {gpsTestResult.accuracy?.toFixed(0)} متر</span>
                            <span>الوقت: {gpsTestResult.timestamp}</span>
                          </div>
                          <a
                            href={gpsTestResult.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 underline"
                          >
                            <Globe className="h-3 w-3" />
                            عرض على الخريطة
                          </a>
                        </div>
                      ) : (
                        <div className="text-red-700 font-medium">
                          ❌ {gpsTestResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Save Button */}
            <div className="pt-6 mt-4 border-t border-slate-200">
              <Button
                onClick={handleGPSSettingsUpdate}
                disabled={savingGPS}
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-full"
              >
                {savingGPS ? 'جاري الحفظ...' : 'حفظ إعدادات GPS'}
              </Button>
            </div>
          </Card>
        )}

        {/* System Health Dashboard - Super Admin Only */}
        {user?.role === 'super_admin' && (
          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
                  <Activity className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">System Health</h2>
                  <p className="text-sm text-slate-600">Monitor database and system status</p>
                </div>
              </div>
              <Button
                onClick={fetchSystemHealth}
                disabled={healthLoading}
                variant="outline"
                className="rounded-full"
              >
                {healthLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </>
                )}
              </Button>
            </div>

            {!systemHealth ? (
              <div className="text-center py-8 text-slate-500">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Click Refresh to load system health data</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Status Banner */}
                <div className={`p-4 rounded-xl flex items-center gap-3 ${systemHealth.status === 'healthy' ? 'bg-green-50 border border-green-200' :
                  systemHealth.status === 'degraded' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-red-50 border border-red-200'
                  }`}>
                  <div className={`w-4 h-4 rounded-full ${systemHealth.status === 'healthy' ? 'bg-green-500' :
                    systemHealth.status === 'degraded' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                  <div>
                    <p className={`font-semibold ${systemHealth.status === 'healthy' ? 'text-green-800' :
                      systemHealth.status === 'degraded' ? 'text-yellow-800' :
                        'text-red-800'
                      }`}>
                      System {systemHealth.status === 'healthy' ? 'Healthy' : systemHealth.status === 'degraded' ? 'Degraded' : 'Error'}
                    </p>
                    <p className="text-xs text-slate-600">Last checked: {systemHealth.timestamp ? new Date(systemHealth.timestamp).toLocaleString() : 'Unknown'}</p>
                  </div>
                </div>

                {/* Database Info */}
                {systemHealth.database && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <h3 className="font-semibold text-blue-800 mb-2">Database</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-blue-600">Status:</span>
                      <span className="font-medium text-blue-800">{systemHealth.database.status}</span>
                      <span className="text-blue-600">Name:</span>
                      <span className="font-medium text-blue-800">{systemHealth.database.name}</span>
                    </div>
                  </div>
                )}

                {/* Collection Counts */}
                {systemHealth.collections && (
                  <div>
                    <h3 className="font-semibold text-slate-700 mb-3">Collections</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(systemHealth.collections).map(([name, count]) => (
                        <div key={name} className="p-3 bg-slate-50 rounded-lg border text-center">
                          <p className="text-2xl font-bold text-slate-800">{count}</p>
                          <p className="text-xs text-slate-600 capitalize">{name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* System Info */}
                {systemHealth.system && (
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <h3 className="font-semibold text-purple-800 mb-2">System</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-purple-600">Platform:</span>
                      <span className="font-medium text-purple-800">{systemHealth.system.platform}</span>
                      <span className="text-purple-600">Python:</span>
                      <span className="font-medium text-purple-800">{systemHealth.system.python_version}</span>
                      <span className="text-purple-600">Memory Used:</span>
                      <span className="font-medium text-purple-800">{systemHealth.system.memory_used_percent}%</span>
                      <span className="text-purple-600">Memory Free:</span>
                      <span className="font-medium text-purple-800">{systemHealth.system.memory_available_gb} GB</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Lines Section */}
        <Card className="p-6 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Lines</h2>
                <p className="text-sm text-slate-600">Manage company lines</p>
              </div>
            </div>
            <Dialog open={showLineDialog} onOpenChange={setShowLineDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 rounded-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLine ? 'Edit Line' : 'Add Line'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleLineSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="line-name">Line Name *</Label>
                    <Input
                      id="line-name"
                      value={newLine.name}
                      onChange={(e) => setNewLine({ ...newLine, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="line-description">Description</Label>
                    <Textarea
                      id="line-description"
                      value={newLine.description}
                      onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90 rounded-full">
                    {editingLine ? 'Update Line' : 'Create Line'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {lines.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No lines created yet</p>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-slate-900">{line.name}</h3>
                    {line.description && (
                      <p className="text-sm text-slate-600 mt-1">{line.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditLine(line)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteLine(line.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Areas Section */}
        <Card className="p-6 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center">
                <MapPin className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Areas</h2>
                <p className="text-sm text-slate-600">Manage geographical areas</p>
              </div>
            </div>
            <Dialog open={showAreaDialog} onOpenChange={setShowAreaDialog}>
              <DialogTrigger asChild>
                <Button className="bg-orange-600 hover:bg-orange-700 rounded-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Area
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingArea ? 'Edit Area' : 'Add Area'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAreaSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="area-line">Line *</Label>
                    <Select
                      value={newArea.line_id}
                      onValueChange={(value) => setNewArea({ ...newArea, line_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select line" />
                      </SelectTrigger>
                      <SelectContent>
                        {lines.map((line) => (
                          <SelectItem key={line.id} value={line.id}>
                            {line.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="area-name">Area Name *</Label>
                    <Input
                      id="area-name"
                      value={newArea.name}
                      onChange={(e) => setNewArea({ ...newArea, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="area-description">Description</Label>
                    <Textarea
                      id="area-description"
                      value={newArea.description}
                      onChange={(e) => setNewArea({ ...newArea, description: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 rounded-full">
                    {editingArea ? 'Update Area' : 'Create Area'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {areas.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No areas created yet</p>
            ) : (
              areas.map((area) => {
                const line = lines.find((l) => l.id === area.line_id);
                return (
                  <div
                    key={area.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-900">{area.name}</h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Line: {line?.name || 'Unknown'}
                      </p>
                      {area.description && (
                        <p className="text-sm text-slate-500 mt-1">{area.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditArea(area)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteArea(area.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Session Management - Professional Table Design */}
        <Card className="p-6 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">إدارة الجلسات | Sessions Manager</h2>
                <p className="text-sm text-slate-600">عرض وإدارة جلسات تسجيل الدخول</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchSessions}
                disabled={sessionsLoading}
                className="rounded-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${sessionsLoading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
              <Button
                variant="destructive"
                onClick={logoutAllSessions}
                className="rounded-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                خروج من الكل
              </Button>
            </div>
          </div>

          {sessions.length === 0 && !sessionsLoading ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <Activity className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 font-medium">اضغط على "تحديث" لعرض الجلسات النشطة</p>
              <p className="text-sm text-slate-400 mt-1">Click "Refresh" to load active sessions</p>
            </div>
          ) : sessionsLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-12 w-12 mx-auto animate-spin text-purple-600" />
              <p className="text-slate-600 mt-4">جاري تحميل الجلسات...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Sessions Table */}
              {(() => {
                const now = new Date();
                const activeSessions = sessions.filter(s => {
                  if (!s.last_activity) return true;
                  const lastActivity = new Date(s.last_activity);
                  const diffMinutes = (now - lastActivity) / (1000 * 60);
                  return diffMinutes < 30; // Active if activity within 30 min
                });
                const offlineSessions = sessions.filter(s => {
                  if (!s.last_activity) return false;
                  const lastActivity = new Date(s.last_activity);
                  const diffMinutes = (now - lastActivity) / (1000 * 60);
                  return diffMinutes >= 30;
                });

                return (
                  <>
                    {/* Active Sessions */}
                    <div className="bg-green-50 rounded-xl border border-green-200 overflow-hidden">
                      <div className="px-4 py-3 bg-green-100 border-b border-green-200">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                          </span>
                          <h3 className="font-bold text-green-800">الجلسات النشطة | Active Sessions ({activeSessions.length})</h3>
                        </div>
                      </div>

                      {activeSessions.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-green-50/50">
                              <tr className="border-b border-green-200">
                                <th className="px-4 py-3 text-right font-semibold text-green-800">المستخدم</th>
                                <th className="px-4 py-3 text-right font-semibold text-green-800">الجهاز / المتصفح</th>
                                <th className="px-4 py-3 text-right font-semibold text-green-800">IP</th>
                                <th className="px-4 py-3 text-right font-semibold text-green-800">وقت الدخول</th>
                                <th className="px-4 py-3 text-right font-semibold text-green-800">آخر نشاط</th>
                                <th className="px-4 py-3 text-center font-semibold text-green-800">إجراء</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeSessions.map((session) => (
                                <tr key={session.id} className="border-b border-green-100 hover:bg-green-100/50 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center">
                                        <User className="h-4 w-4 text-white" />
                                      </div>
                                      <div>
                                        <p className="font-bold text-slate-900">{session.user_name || 'أنت'}</p>
                                        {session.username && (
                                          <p className="text-xs text-slate-500">@{session.username}</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <Monitor className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                      <span className="truncate max-w-[200px] text-slate-700" title={session.device_info || 'غير معروف'}>
                                        {session.device_info || 'جهاز غير معروف'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="flex items-center gap-1 text-slate-600">
                                      <Globe className="h-3 w-3" />
                                      {session.ip_address || '—'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {session.created_at
                                      ? new Date(session.created_at).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                      {session.last_activity
                                        ? new Date(session.last_activity).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                                        : 'نشط'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => revokeSession(session.id)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-100 rounded-full h-8"
                                    >
                                      <LogOut className="h-3 w-3 mr-1" />
                                      إنهاء
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-center py-6 text-green-600">لا توجد جلسات نشطة حالياً</p>
                      )}
                    </div>

                    {/* Offline/Inactive Sessions */}
                    {offlineSessions.length > 0 && (
                      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                            <h3 className="font-bold text-slate-700">جلسات غير نشطة | Inactive Sessions ({offlineSessions.length})</h3>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50/50">
                              <tr className="border-b border-slate-200">
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">المستخدم</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">الجهاز / المتصفح</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">IP</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">آخر نشاط</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراء</th>
                              </tr>
                            </thead>
                            <tbody>
                              {offlineSessions.map((session) => (
                                <tr key={session.id} className="border-b border-slate-100 hover:bg-slate-100/50 transition-colors opacity-70">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                                        <User className="h-4 w-4 text-white" />
                                      </div>
                                      <div>
                                        <p className="font-medium text-slate-700">{session.user_name || 'أنت'}</p>
                                        {session.username && (
                                          <p className="text-xs text-slate-400">@{session.username}</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="truncate max-w-[200px] text-slate-500" title={session.device_info || 'غير معروف'}>
                                      {session.device_info || 'جهاز غير معروف'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    {session.ip_address || '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-200 text-slate-600 rounded-full text-xs">
                                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                                      {session.last_activity
                                        ? new Date(session.last_activity).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                        : 'غير معروف'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => revokeSession(session.id)}
                                      className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full h-8"
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      حذف
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </Card>

        {/* Backup & Restore Section - Super Admin Only */}
        {user?.role === 'super_admin' && (
          <Card className="p-6 border border-slate-200 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Archive className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Backup & Restore</h2>
                <p className="text-sm text-slate-500">Export or import all system settings</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Export Section */}
              <div className="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-semibold text-slate-700">Export Settings</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Download a complete backup of all your settings including site configuration, GPS settings, lines, and areas.
                </p>
                <Button
                  onClick={handleExportSettings}
                  disabled={exporting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  {exporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export All Settings
                    </>
                  )}
                </Button>
              </div>

              {/* Import Section */}
              <div className="p-4 bg-white rounded-xl border border-teal-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Upload className="h-5 w-5 text-teal-600" />
                  <h3 className="font-semibold text-slate-700">Import Settings</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Restore settings from a previously exported backup file.
                </p>

                {!importPreview ? (
                  <div className="relative">
                    <Input
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-slate-400 mt-2">Accepts .json files only</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                      <p className="text-xs text-teal-600 font-medium mb-2">📦 {importPreview.appName}</p>
                      <p className="text-xs text-slate-500">Exported: {importPreview.exportedAt}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Site: {importPreview.counts.siteSettings} fields</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>GPS: {importPreview.counts.gpsSettings} fields</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Lines: {importPreview.counts.lines} items</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Areas: {importPreview.counts.areas} items</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={confirmImport}
                        disabled={importing}
                        className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
                      >
                        {importing ? 'Importing...' : 'Confirm Import'}
                      </Button>
                      <Button
                        onClick={cancelImport}
                        variant="outline"
                        className="rounded-lg"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <strong>Warning:</strong> Importing settings will overwrite your current configuration. Make sure to export your current settings as a backup before importing.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Settings;