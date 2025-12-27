import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
    BarChart3, TrendingUp, Users, MapPin, Clock,
    Target, DollarSign, CheckCircle, RefreshCw,
    Calendar, Activity, Navigation
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

const PerformanceDashboard = ({ user, onLogout }) => {
    const [period, setPeriod] = useState('week');
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [repPerformance, setRepPerformance] = useState([]);
    const [distanceReport, setDistanceReport] = useState(null);

    useEffect(() => {
        fetchDashboard();
    }, [period]);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            // Fetch summary
            const summaryRes = await api.get('/analytics/dashboard-summary');
            setSummary(summaryRes.data);

            // Fetch rep performance
            const perfRes = await api.get(`/analytics/rep-performance?period=${period}`);
            setRepPerformance(perfRes.data.reps || []);

            // Fetch distance report for today
            const today = new Date().toISOString().split('T')[0];
            const distRes = await api.get(`/analytics/distance-report?date=${today}`);
            setDistanceReport(distRes.data);

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            toast.error('فشل في تحميل البيانات');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP',
            maximumFractionDigits: 0
        }).format(value || 0);
    };

    return (
        <Layout user={user} onLogout={onLogout}>
            <div className="p-4 lg:p-8 space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">لوحة الأداء</h1>
                        <p className="text-slate-600 mt-1">تتبع أداء المناديب والإحصائيات</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day">اليوم</SelectItem>
                                <SelectItem value="week">هذا الأسبوع</SelectItem>
                                <SelectItem value="month">هذا الشهر</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={fetchDashboard} disabled={loading} variant="outline">
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            تحديث
                        </Button>
                    </div>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500 rounded-lg">
                                    <MapPin className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-700">{summary.today?.visits || 0}</p>
                                    <p className="text-xs text-blue-600">زيارات اليوم</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-500 rounded-lg">
                                    <DollarSign className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-green-700">{summary.today?.orders || 0}</p>
                                    <p className="text-xs text-green-600">طلبات اليوم</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500 rounded-lg">
                                    <Users className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-purple-700">{summary.today?.active_reps || 0}</p>
                                    <p className="text-xs text-purple-600">مناديب نشطين</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-amber-700">{formatCurrency(summary.month?.revenue)}</p>
                                    <p className="text-xs text-amber-600">إيرادات الشهر</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Pending Approvals */}
                {summary?.pending && (summary.pending.orders > 0 || summary.pending.expenses > 0) && (
                    <Card className="p-4 bg-red-50 border-red-200">
                        <div className="flex items-center gap-4">
                            <Clock className="h-6 w-6 text-red-500" />
                            <div className="flex gap-6">
                                {summary.pending.orders > 0 && (
                                    <span className="text-red-700">
                                        <strong>{summary.pending.orders}</strong> طلبات بانتظار الموافقة
                                    </span>
                                )}
                                {summary.pending.expenses > 0 && (
                                    <span className="text-red-700">
                                        <strong>{summary.pending.expenses}</strong> مصروفات بانتظار الموافقة
                                    </span>
                                )}
                            </div>
                        </div>
                    </Card>
                )}

                {/* Distance Report */}
                {distanceReport && distanceReport.reports?.length > 0 && (
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Navigation className="h-6 w-6 text-teal-600" />
                            <h2 className="text-xl font-bold">المسافات المقطوعة اليوم</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {distanceReport.reports.slice(0, 6).map((report) => (
                                <div key={report.user_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div>
                                        <p className="font-medium">{report.user_name}</p>
                                        <p className="text-sm text-slate-500">{report.visit_count} زيارة</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-teal-600">{report.total_distance_km} كم</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Rep Performance Table */}
                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <BarChart3 className="h-6 w-6 text-indigo-600" />
                        <h2 className="text-xl font-bold">أداء المناديب</h2>
                        <span className="text-sm text-slate-500">
                            ({period === 'day' ? 'اليوم' : period === 'week' ? 'هذا الأسبوع' : 'هذا الشهر'})
                        </span>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">
                            <RefreshCw className="h-8 w-8 mx-auto animate-spin text-indigo-600" />
                            <p className="text-slate-500 mt-2">جاري التحميل...</p>
                        </div>
                    ) : repPerformance.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            <Activity className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                            <p>لا توجد بيانات للفترة المحددة</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-right py-3 px-4 font-semibold text-slate-700">المندوب</th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <MapPin className="h-4 w-4" />
                                                <span>الزيارات</span>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <DollarSign className="h-4 w-4" />
                                                <span>الطلبات</span>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <TrendingUp className="h-4 w-4" />
                                                <span>القيمة</span>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <CheckCircle className="h-4 w-4" />
                                                <span>الموافقة</span>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <Target className="h-4 w-4" />
                                                <span>التغطية</span>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-2 font-semibold text-slate-700">
                                            <div className="flex items-center justify-center gap-1">
                                                <Clock className="h-4 w-4" />
                                                <span>الساعات</span>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repPerformance.map((rep, index) => (
                                        <tr key={rep.user_id} className={index % 2 === 0 ? 'bg-slate-50' : ''}>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                                        {rep.user_name?.charAt(0) || '?'}
                                                    </div>
                                                    <span className="font-medium">{rep.user_name}</span>
                                                </div>
                                            </td>
                                            <td className="text-center py-3 px-2">
                                                <span className="font-bold text-blue-600">{rep.kpis.visits_total}</span>
                                                <span className="text-xs text-slate-500 block">({rep.kpis.visits_per_day}/يوم)</span>
                                            </td>
                                            <td className="text-center py-3 px-2 font-bold text-green-600">
                                                {rep.kpis.orders_total}
                                            </td>
                                            <td className="text-center py-3 px-2 font-bold text-amber-600">
                                                {formatCurrency(rep.kpis.orders_value)}
                                            </td>
                                            <td className="text-center py-3 px-2">
                                                <span className={`font-bold ${rep.kpis.approval_rate >= 80 ? 'text-green-600' : rep.kpis.approval_rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {rep.kpis.approval_rate}%
                                                </span>
                                            </td>
                                            <td className="text-center py-3 px-2">
                                                <span className={`font-bold ${rep.kpis.coverage_rate >= 50 ? 'text-green-600' : rep.kpis.coverage_rate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {rep.kpis.coverage_rate}%
                                                </span>
                                                <span className="text-xs text-slate-500 block">({rep.kpis.clinics_visited} عيادة)</span>
                                            </td>
                                            <td className="text-center py-3 px-2 font-bold text-purple-600">
                                                {rep.kpis.active_hours}h
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </Layout>
    );
};

export default PerformanceDashboard;
