import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  MapPin,
  Users as UsersIcon,
  LogIn,
  LogOut,
  ShoppingCart,
  Stethoscope,
  Activity,
  Smartphone,
  Globe,
  Clock,
  Calendar,
  ExternalLink,
  Filter,
  Wallet,
  Download,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import OpenLayersMap from '../components/OpenLayersMap';
import LiveTracking from '../components/LiveTracking';


const ActivityTimeline = ({ user, onLogout }) => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'live'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [showInactivePanel, setShowInactivePanel] = useState(false);
  const [inactivityMinutes, setInactivityMinutes] = useState(60);

  useEffect(() => {
    fetchUsers();
    fetchInactiveUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchLogs();
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    if (user?.role !== 'super_admin') {
      toast.error('Access denied - Super Admin only');
      return;
    }
    try {
      const response = await api.get('/users');
      // Show all users so we can track everyone, not just medical reps if needed, 
      // but typical use case is tracking reps.
      const trackableUsers = response.data;
      setUsers(trackableUsers);
      if (trackableUsers.length > 0 && !selectedUser) {
        setSelectedUser(trackableUsers[0].id);
      }
    } catch (error) {
      toast.error('Failed to load users');
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.append('user_id', selectedUser);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await api.get(`/gps-logs?${params.toString()}`);
      setLogs(response.data);
    } catch (error) {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchLogs();
    setShowFilters(false);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    fetchLogs();
  };

  const fetchInactiveUsers = async () => {
    try {
      const response = await api.get(`/gps-logs/inactivity?minutes=${inactivityMinutes}`);
      setInactiveUsers(response.data.inactive_users || []);
    } catch (error) {
      console.error('Failed to fetch inactive users:', error);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.append('user_id', selectedUser);
      if (startDate) params.append('start_date', `${startDate}T00:00:00`);
      if (endDate) params.append('end_date', `${endDate}T23:59:59`);

      const response = await api.get(`/gps-logs/export-csv?${params.toString()}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gps-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('CSV exported successfully');
    } catch (error) {
      toast.error('Failed to export CSV');
      console.error('Export error:', error);
    }
  };

  const refreshInactivityAlerts = () => {
    fetchInactiveUsers();
    toast.success(`Refreshed - checking for ${inactivityMinutes} min inactivity`);
  };

  // Get logs with valid coordinates for the map
  const logsWithCoords = logs.filter(log => log.latitude && log.longitude);

  const getEventIcon = (type) => {
    switch (type?.toUpperCase()) {
      case 'LOGIN': return <LogIn className="h-5 w-5" />;
      case 'LOGOUT': return <LogOut className="h-5 w-5" />;
      case 'VISIT': return <Stethoscope className="h-5 w-5" />;
      case 'ORDER': return <ShoppingCart className="h-5 w-5" />;
      case 'CLINIC': return <MapPin className="h-5 w-5" />;
      case 'EXPENSE': return <Wallet className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const getEventColor = (type) => {
    switch (type?.toUpperCase()) {
      case 'LOGIN': return 'bg-green-100 text-green-600 border-green-200';
      case 'LOGOUT': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'VISIT': return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'ORDER': return 'bg-purple-100 text-purple-600 border-purple-200';
      case 'CLINIC': return 'bg-teal-100 text-teal-600 border-teal-200';
      case 'EXPENSE': return 'bg-orange-100 text-orange-600 border-orange-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const selectedUserData = users.find((u) => u.id === selectedUser);

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">GPS Tracking</h1>
            <p className="text-slate-600 mt-1">تتبع المواقع والأنشطة في الوقت الفعلي</p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <Button
              variant={viewMode === 'timeline' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('timeline')}
              className="rounded-md"
            >
              <Clock className="h-4 w-4 mr-2" />
              السجل
            </Button>
            <Button
              variant={viewMode === 'live' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('live')}
              className="rounded-md"
            >
              <MapPin className="h-4 w-4 mr-2" />
              مباشر
            </Button>
          </div>
        </div>

        {/* Conditional View */}
        {viewMode === 'live' ? (
          <LiveTracking user={user} />
        ) : (
          <>
            {/* Timeline View Controls */}
            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <div className="w-full md:w-72">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Select User" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name} (@{u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={showFilters ? "default" : "outline"}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                <span className="hidden md:inline">Export CSV</span>
              </Button>
              <Button
                variant={showInactivePanel ? "default" : "outline"}
                onClick={() => setShowInactivePanel(!showInactivePanel)}
                className="flex items-center gap-1"
              >
                <AlertTriangle className={`h-4 w-4 ${inactiveUsers.length > 0 ? 'text-orange-500' : ''}`} />
                <span className="hidden md:inline">Inactive</span>
                {inactiveUsers.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                    {inactiveUsers.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Date Filters */}
            {showFilters && (
              <Card className="p-4 bg-white shadow-sm">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="start-date" className="text-xs">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="end-date" className="text-xs">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <Button onClick={handleApplyFilters}>Apply</Button>
                  <Button variant="ghost" onClick={clearFilters}>Clear</Button>
                </div>
              </Card>
            )}

            {/* Inactivity Alerts Panel */}
            {showInactivePanel && (
              <Card className="p-4 bg-orange-50 border border-orange-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <h3 className="font-semibold text-orange-900">Inactive Users Alert</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-orange-700">Inactivity threshold:</Label>
                    <Input
                      type="number"
                      value={inactivityMinutes}
                      onChange={(e) => setInactivityMinutes(parseInt(e.target.value) || 60)}
                      className="w-20 h-8"
                      min="5"
                    />
                    <span className="text-sm text-orange-700">min</span>
                    <Button size="sm" onClick={refreshInactivityAlerts}>Refresh</Button>
                  </div>
                </div>

                {inactiveUsers.length === 0 ? (
                  <p className="text-sm text-green-700 text-center py-4">
                    ✓ All users are active within the last {inactivityMinutes} minutes
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {inactiveUsers.map((user) => (
                      <div key={user.user_id} className="p-3 bg-white rounded-lg border border-orange-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                            <UsersIcon className="h-4 w-4 text-orange-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 text-sm">{user.user_name}</p>
                            <p className="text-xs text-slate-500">
                              Last activity: {user.last_activity ? new Date(user.last_activity).toLocaleString() : 'Never'}
                            </p>
                            <p className="text-xs text-orange-600">
                              Inactive for {user.inactive_minutes} minutes
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {selectedUserData && (
              <Card className="p-6 border-l-4 border-l-primary shadow-sm bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center">
                    <UsersIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{selectedUserData.full_name}</h2>
                    <p className="text-sm text-slate-500">{selectedUserData.role} • {selectedUserData.email || 'No Email'}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Interactive Map - OpenLayers */}
            {logsWithCoords.length > 0 && (
              <Card className="p-4 bg-white shadow-sm overflow-hidden">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-slate-400" />
                  خريطة النشاطات
                </h3>
                <OpenLayersMap
                  logs={logsWithCoords}
                  height="320px"
                  showLegend={true}
                  onMarkerClick={(log) => setSelectedEvent(log)}
                />
              </Card>
            )}

            <Card className="p-6 bg-white shadow-sm min-h-[500px]">
              <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                Activity History
              </h3>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Activity className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No activity logs found for this user.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-100 ml-3 space-y-8 pl-8 py-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="relative group cursor-pointer"
                      onClick={() => setSelectedEvent(log)}
                    >
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[41px] top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white ${getEventColor(log.activity_type)}`}>
                        {getEventIcon(log.activity_type)}
                      </div>

                      {/* Content Card */}
                      <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider w-fit ${getEventColor(log.activity_type).split(' border')[0]}`}>
                            {log.activity_type || 'Unknown'}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {format(new Date(log.timestamp), 'PPpp')}
                          </span>
                        </div>

                        {/* Activity-specific metadata - Enhanced Display */}
                        {log.metadata && (
                          <div className="mb-2 text-sm">
                            {/* Action Description - Most Important */}
                            {log.metadata.action && (
                              <p className="text-slate-800 font-semibold mb-1">{log.metadata.action}</p>
                            )}
                            {/* Rep Name */}
                            {log.metadata.rep_name && (
                              <p className="text-slate-600 text-xs">By: {log.metadata.rep_name}</p>
                            )}
                            {/* Clinic/Visit Info */}
                            {log.metadata.clinic_name && (
                              <p className="text-slate-700 font-medium">{log.metadata.clinic_name}</p>
                            )}
                            {log.metadata.doctor_name && (
                              <p className="text-slate-500 text-xs">Dr. {log.metadata.doctor_name}</p>
                            )}
                            {log.metadata.visit_reason && (
                              <p className="text-slate-500 text-xs">Reason: {log.metadata.visit_reason}</p>
                            )}
                            {/* Order Info */}
                            {log.metadata.serial_number && (
                              <p className="text-slate-500 text-xs">Serial: #{log.metadata.serial_number}</p>
                            )}
                            {log.metadata.total_amount !== undefined && (
                              <p className="text-slate-700 font-semibold">Total: EGP {log.metadata.total_amount?.toFixed(2)}</p>
                            )}
                            {/* Expense Info */}
                            {log.metadata.amount !== undefined && !log.metadata.total_amount && (
                              <p className="text-slate-700 font-semibold">Amount: EGP {log.metadata.amount?.toFixed(2)}</p>
                            )}
                            {log.metadata.category && (
                              <p className="text-slate-500 text-xs">Category: {log.metadata.category}</p>
                            )}
                            {log.metadata.expense_type && (
                              <p className="text-slate-500 text-xs">Type: {log.metadata.expense_type}</p>
                            )}
                            {log.metadata.items_count !== undefined && (
                              <p className="text-slate-500 text-xs">{log.metadata.items_count} item(s)</p>
                            )}
                            {/* User Info for Login/Logout */}
                            {log.metadata.username && (
                              <p className="text-slate-500 text-xs">User: @{log.metadata.username}</p>
                            )}
                            {log.metadata.role && (
                              <p className="text-slate-500 text-xs">Role: {log.metadata.role}</p>
                            )}
                          </div>
                        )}

                        {/* Location Display with Visual Indicator */}
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                          <MapPin className={`w-3 h-3 ${log.latitude && log.longitude ? 'text-green-500' : 'text-slate-300'}`} />
                          {log.latitude && log.longitude ? (
                            <a
                              href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary hover:underline flex items-center gap-1"
                            >
                              <span className="text-green-600 text-xs">📍 GPS</span>
                              {log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}
                            </a>
                          ) : (
                            <span className="italic text-slate-400 flex items-center gap-1">
                              <span className="text-orange-400 text-xs">⚠</span>
                              No GPS data captured
                            </span>
                          )}
                        </div>

                        {/* Device Info - Better Display */}
                        {log.device_info && log.device_info !== "Unknown" && log.device_info !== "Unknown Device" && (
                          <p className="text-xs text-slate-400 truncate max-w-md flex items-center gap-1">
                            <Smartphone className="w-3 h-3" />
                            {log.device_info}
                          </p>
                        )}

                        {/* IP Address Display */}
                        {log.ip_address && log.ip_address !== "Unknown" && log.ip_address !== "Local Development" && (
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {log.ip_address}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* DETAILS DIALOG */}
            <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedEvent && (
                      <>
                        <span className={`p-1.5 rounded-full ${getEventColor(selectedEvent.activity_type).split(' border')[0]}`}>
                          {getEventIcon(selectedEvent.activity_type)}
                        </span>
                        <span>{selectedEvent.activity_type} Details</span>
                      </>
                    )}
                  </DialogTitle>
                </DialogHeader>

                {selectedEvent && (
                  <div className="space-y-4 py-2">
                    {/* Time & Date */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Timestamp</p>
                        <p className="font-medium text-slate-900">
                          {format(new Date(selectedEvent.timestamp), 'PPP')} at {format(new Date(selectedEvent.timestamp), 'pp')}
                        </p>
                      </div>
                    </div>

                    {/* Location Map - Real OpenLayers Map */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {selectedEvent.latitude && selectedEvent.longitude ? (
                        <OpenLayersMap
                          logs={[selectedEvent]}
                          height="150px"
                          showLegend={false}
                          showViewToggle={false}
                          zoom={14}
                        />
                      ) : (
                        <div className="bg-slate-100 h-32 flex flex-col items-center justify-center text-slate-400">
                          <MapPin className="w-8 h-8 mb-1" />
                          <span className="text-xs font-medium">لا توجد بيانات GPS</span>
                        </div>
                      )}
                      <div className="p-3 bg-white flex justify-between items-center">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Coordinates</p>
                          {selectedEvent.latitude ? (
                            <p className="font-mono text-sm text-slate-900">
                              {selectedEvent.latitude.toFixed(6)}, {selectedEvent.longitude.toFixed(6)}
                            </p>
                          ) : (
                            <p className="text-sm italic text-slate-400">No GPS Data</p>
                          )}
                        </div>
                        {selectedEvent.latitude && (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={`https://www.google.com/maps?q=${selectedEvent.latitude},${selectedEvent.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1"
                            >
                              Open Maps <ExternalLink className="w-3 h-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Order/Activity Details */}
                    {selectedEvent.metadata && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-600 uppercase mb-2 font-medium">تفاصيل النشاط</p>
                        {selectedEvent.metadata.order_id && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">رقم الطلب:</span> #{selectedEvent.metadata.serial_number || selectedEvent.metadata.order_id}
                          </p>
                        )}
                        {selectedEvent.metadata.clinic_name && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">العيادة:</span> {selectedEvent.metadata.clinic_name}
                          </p>
                        )}
                        {selectedEvent.metadata.total_amount !== undefined && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">المبلغ:</span> EGP {selectedEvent.metadata.total_amount?.toFixed(2)}
                          </p>
                        )}
                        {selectedEvent.metadata.items_count !== undefined && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">عدد المنتجات:</span> {selectedEvent.metadata.items_count}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Technical Details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 border border-slate-100 rounded-lg">
                        <div className="flex items-center gap-2 mb-1 text-slate-500">
                          <Globe className="w-4 h-4" />
                          <span className="text-xs uppercase">IP Address</span>
                        </div>
                        <p className="font-mono text-sm text-slate-900 truncate">
                          {selectedEvent.ip_address || 'Unknown'}
                        </p>
                      </div>
                      <div className="p-3 border border-slate-100 rounded-lg">
                        <div className="flex items-center gap-2 mb-1 text-slate-500">
                          <Smartphone className="w-4 h-4" />
                          <span className="text-xs uppercase">Device</span>
                        </div>
                        <p className="text-xs text-slate-900 line-clamp-2" title={selectedEvent.device_info}>
                          {selectedEvent.device_info || 'Unknown Device'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button onClick={() => setSelectedEvent(null)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </Layout >
  );
};

export default ActivityTimeline;
