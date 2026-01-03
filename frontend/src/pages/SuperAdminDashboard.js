import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Users, MapPin, Package, Activity, TrendingUp, BarChart3, DollarSign, Clock, ShoppingCart, Trophy, Receipt, ExternalLink, Phone, MapPinned, FileText } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

const SuperAdminDashboard = ({ user, onLogout }) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    total_users: 0,
    active_reps: 0,
    total_clinics: 0,
    total_visits: 0,
    visits_today: 0,
    visits_week: 0,
    total_orders: 0,
    orders_today: 0,
    orders_week: 0,
    pending_orders: 0,
    pending_expenses: 0,
    total_revenue: 0
  });
  const [accountingStats, setAccountingStats] = useState({
    totalRevenue: 0,
    totalDebts: 0,
    totalCollections: 0
  });
  const [analytics, setAnalytics] = useState({ daily: [], totals: {} });
  const [topPerformers, setTopPerformers] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchAnalytics();
    fetchTopPerformers();
    fetchRecentActivities();
    fetchAccountingStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to fetch stats');
    }
  };

  const fetchAccountingStats = async () => {
    try {
      const response = await api.get('/accounting/dashboard');
      setAccountingStats({
        totalRevenue: response.data.total_revenue || 0,
        totalDebts: response.data.total_outstanding || 0,
        totalCollections: response.data.total_collected || 0
      });
    } catch (error) {
      console.error('Failed to fetch accounting stats:', error);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const response = await api.get('/dashboard/analytics?days=7');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchTopPerformers = async () => {
    try {
      const response = await api.get('/dashboard/top-performers');
      setTopPerformers(response.data.performers || []);
    } catch (error) {
      console.error('Failed to fetch top performers:', error);
    }
  };

  const fetchRecentActivities = async () => {
    try {
      const response = await api.get('/dashboard/recent-activities?limit=15');
      setRecentActivities(response.data.activities || []);
    } catch (error) {
      console.error('Failed to fetch recent activities:', error);
    }
  };

  const formatChartData = () => {
    return analytics.daily.map(item => ({
      ...item,
      date: item.date.slice(5)
    }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(value || 0);
  };

  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
    setShowActivityDialog(true);
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'pending': 'bg-yellow-100 text-yellow-700',
      'pending_approval': 'bg-yellow-100 text-yellow-700',
      'approved': 'bg-green-100 text-green-700',
      'rejected': 'bg-red-100 text-red-700',
      'completed': 'bg-blue-100 text-blue-700'
    };
    return statusColors[status] || 'bg-slate-100 text-slate-700';
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'visit': return <MapPin className="h-4 w-4 text-purple-600" />;
      case 'order': return <ShoppingCart className="h-4 w-4 text-teal-600" />;
      case 'expense': return <Receipt className="h-4 w-4 text-orange-600" />;
      default: return <Activity className="h-4 w-4 text-slate-600" />;
    }
  };

  const getActivityBgColor = (type) => {
    switch (type) {
      case 'visit': return 'bg-purple-100';
      case 'order': return 'bg-teal-100';
      case 'expense': return 'bg-orange-100';
      default: return 'bg-slate-100';
    }
  };

  const renderActivityDetails = () => {
    if (!selectedActivity?.details) return null;
    const { details, type } = selectedActivity;

    if (type === 'visit') {
      return (
        <div className="space-y-4">
          {/* User Info */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Medical Rep</h4>
            <p className="font-medium text-slate-900">{details.user_name}</p>
            {details.user_phone && (
              <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                <Phone className="h-3 w-3" /> {details.user_phone}
              </p>
            )}
          </div>

          {/* Clinic Info */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-700 mb-2">Clinic</h4>
            <p className="font-medium text-slate-900">{details.clinic_name}</p>
            {details.doctor_name && <p className="text-sm text-slate-600">Dr. {details.doctor_name}</p>}
            {details.clinic_address && <p className="text-sm text-slate-500 mt-1">{details.clinic_address}</p>}
          </div>

          {/* Visit Details */}
          <div className="grid grid-cols-2 gap-4">
            {details.visit_reason && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-600 font-medium">Visit Reason</p>
                <p className="text-sm text-slate-900 mt-1">{details.visit_reason}</p>
              </div>
            )}
            {details.visit_result && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600 font-medium">Result</p>
                <p className="text-sm text-slate-900 mt-1">{details.visit_result}</p>
              </div>
            )}
          </div>

          {details.notes && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600 font-medium">Notes</p>
              <p className="text-sm text-slate-900 mt-1">{details.notes}</p>
            </div>
          )}

          {/* Location */}
          {details.latitude && details.longitude && (
            <a
              href={`https://www.google.com/maps?q=${details.latitude},${details.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <MapPinned className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">View on Google Maps</span>
              <ExternalLink className="h-3 w-3 text-emerald-600 ml-auto" />
            </a>
          )}

          <p className="text-xs text-slate-400">Created: {new Date(details.created_at).toLocaleString()}</p>
        </div>
      );
    }

    if (type === 'order') {
      return (
        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(details.status)}`}>
              {details.status?.replace('_', ' ').toUpperCase()}
            </span>
            <span className="text-lg font-bold text-teal-600">{formatCurrency(details.total_amount)}</span>
          </div>

          {/* User & Clinic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600 font-medium">Medical Rep</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{details.user_name}</p>
              {details.user_phone && <p className="text-xs text-slate-500">{details.user_phone}</p>}
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 font-medium">Clinic</p>
              <p className="text-sm font-medium text-slate-900 mt-1">{details.clinic_name}</p>
              {details.clinic_address && <p className="text-xs text-slate-500">{details.clinic_address}</p>}
            </div>
          </div>

          {/* Products */}
          {details.products && details.products.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Products ({details.products.length})</h4>
              <div className="space-y-2">
                {details.products.map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0">
                    <span className="text-sm text-slate-900">{product.name}</span>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">{product.quantity} x {formatCurrency(product.price)}</span>
                      <p className="text-sm font-medium text-slate-900">{formatCurrency(product.quantity * product.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="p-4 bg-teal-50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="text-slate-900">{formatCurrency(details.subtotal)}</span>
            </div>
            {details.discount_value && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Discount ({details.discount_type})</span>
                <span className="text-red-600">-{details.discount_value}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-teal-200 pt-2">
              <span className="text-teal-700">Total</span>
              <span className="text-teal-700">{formatCurrency(details.total_amount)}</span>
            </div>
          </div>

          {details.notes && (
            <div className="p-3 bg-yellow-50 rounded-lg">
              <p className="text-xs text-yellow-700 font-medium">Notes</p>
              <p className="text-sm text-slate-900 mt-1">{details.notes}</p>
            </div>
          )}

          {details.rejection_reason && (
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-red-700 font-medium">Rejection Reason</p>
              <p className="text-sm text-slate-900 mt-1">{details.rejection_reason}</p>
            </div>
          )}

          <p className="text-xs text-slate-400">Created: {new Date(details.created_at).toLocaleString()}</p>
        </div>
      );
    }

    if (type === 'expense') {
      return (
        <div className="space-y-4">
          {/* Status & Amount */}
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(details.status)}`}>
              {details.status?.toUpperCase()}
            </span>
            <span className="text-lg font-bold text-orange-600">{formatCurrency(details.amount)}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600 font-medium">Submitted By</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{details.user_name}</p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <p className="text-xs text-orange-600 font-medium">Expense Type</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{details.expense_type}</p>
          </div>

          {details.description && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600 font-medium">Description</p>
              <p className="text-sm text-slate-900 mt-1">{details.description}</p>
            </div>
          )}

          {details.receipt_url && (
            <a
              href={details.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">View Receipt</span>
              <ExternalLink className="h-3 w-3 text-blue-600 ml-auto" />
            </a>
          )}

          <p className="text-xs text-slate-400">
            Expense Date: {details.expense_date ? new Date(details.expense_date).toLocaleDateString() : 'N/A'}
          </p>
          <p className="text-xs text-slate-400">Created: {new Date(details.created_at).toLocaleString()}</p>
        </div>
      );
    }

    return null;
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('adminDashboard')}</h1>
            <p className="text-slate-600 mt-1">{t('systemOverview')}</p>
          </div>
        </div>

        {/* Pending Approvals Alert */}
        {(stats.pending_orders > 0 || stats.pending_expenses > 0) && (
          <Card className="p-4 border border-yellow-200 bg-yellow-50 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div className="flex gap-6">
                {stats.pending_orders > 0 && (
                  <div>
                    <p className="font-medium text-yellow-900">{t('pendingOrders')}</p>
                    <p className="text-2xl font-bold text-yellow-700">{stats.pending_orders}</p>
                  </div>
                )}
                {stats.pending_expenses > 0 && (
                  <div>
                    <p className="font-medium text-yellow-900">{t('pendingExpenses')}</p>
                    <p className="text-2xl font-bold text-yellow-700">{stats.pending_expenses}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Main Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">{t('totalUsers')}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_users}</p>
                <p className="text-xs text-green-600 mt-1">{t('activeReps')}: {stats.active_reps}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">{t('totalClinics')}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_clinics}</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">{t('visits')}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_visits}</p>
                <p className="text-xs text-purple-600 mt-1">{t('today')}: {stats.visits_today} | {t('thisWeek')}: {stats.visits_week}</p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                <Activity className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">{t('orders')}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_orders}</p>
                <p className="text-xs text-teal-600 mt-1">{t('today')}: {stats.orders_today} | {t('thisWeek')}: {stats.orders_week}</p>
              </div>
              <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Financial Metrics Card */}
        <Card className="p-6 border border-slate-200 rounded-xl shadow-sm bg-gradient-to-r from-emerald-50 via-white to-blue-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Revenue */}
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">{t('totalRevenue')}</p>
                <p className="text-2xl lg:text-3xl font-bold text-emerald-700 mt-2">{formatCurrency(accountingStats.totalRevenue)}</p>
                <p className="text-xs text-emerald-600 mt-1">إجمالي الإيرادات</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
            </div>

            {/* Total Debts (Outstanding) */}
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">إجمالي الديون</p>
                <p className="text-2xl lg:text-3xl font-bold text-red-600 mt-2">{formatCurrency(accountingStats.totalDebts)}</p>
                <p className="text-xs text-red-500 mt-1">المبالغ المستحقة</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-red-500" />
              </div>
            </div>

            {/* Total Collections */}
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">إجمالي التحصيلات</p>
                <p className="text-2xl lg:text-3xl font-bold text-blue-600 mt-2">{formatCurrency(accountingStats.totalCollections)}</p>
                <p className="text-xs text-blue-500 mt-1">المدفوعات المستلمة</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Receipt className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </div>
        </Card>

        {/* Charts and Top Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly Trends Chart */}
          <Card className="lg:col-span-2 p-6 border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">{t('weeklyTrends')}</h3>
            </div>
            {loadingAnalytics ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={formatChartData()}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="visits" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorVisits)" strokeWidth={2} />
                  <Area type="monotone" dataKey="orders" stroke="#14b8a6" fillOpacity={1} fill="url(#colorOrders)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Top Performers */}
          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-slate-900">{t('topPerformers')}</h3>
            </div>
            <div className="space-y-3">
              {topPerformers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">{t('noDataAvailable')}</p>
              ) : (
                topPerformers.map((performer, index) => (
                  <div key={performer.user_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-slate-200 text-slate-600' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-500'
                        }`}>
                        {index + 1}
                      </span>
                      <span className="font-medium text-slate-900 text-sm">{performer.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{performer.visits} {t('visits')}</p>
                      <p className="text-xs text-slate-500">{performer.orders} {t('orders')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Bar Chart and Recent Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">{t('dailyActivity')}</h3>
            </div>
            {loadingAnalytics ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={formatChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Legend />
                  <Bar dataKey="visits" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Visits" />
                  <Bar dataKey="orders" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Recent Activities - CLICKABLE */}
          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">{t('recentActivities')}</h3>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">{t('noRecentActivities')}</p>
              ) : (
                recentActivities.slice(0, 10).map((activity, index) => (
                  <div
                    key={`${activity.type}-${activity.id || index}`}
                    onClick={() => handleActivityClick(activity)}
                    className="flex items-start gap-3 p-3 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${getActivityBgColor(activity.type)}`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{activity.title || activity.description}</p>
                      <p className="text-xs text-slate-500">{new Date(activity.timestamp).toLocaleString()}</p>
                    </div>
                    {activity.status && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${getStatusBadge(activity.status)}`}>
                        {activity.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Activity Detail Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedActivity && (
                <>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getActivityBgColor(selectedActivity.type)}`}>
                    {getActivityIcon(selectedActivity.type)}
                  </div>
                  <span>{selectedActivity.title || selectedActivity.description}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {renderActivityDetails()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default SuperAdminDashboard;