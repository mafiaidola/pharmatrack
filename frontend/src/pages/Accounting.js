import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
    Calculator, FileText, CreditCard, AlertTriangle, TrendingUp, TrendingDown,
    DollarSign, Receipt, Clock, CheckCircle, XCircle, Download, Search,
    Filter, RefreshCw, FileDown, Printer, History, ArrowUpRight, ArrowDownRight,
    Calendar, BarChart3, PieChart, Users, Building2, Bell, Eye, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getBackendBaseUrl } from '../utils/api';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { exportAccountingInvoicePDF, exportPaymentReceiptPDF, exportAccountingReportPDF } from '../utils/pdfExport';

const Accounting = ({ user, onLogout }) => {
    const { t, formatCurrency } = useLanguage();
    const { siteSettings } = useSiteSettings();

    // Tab State
    const [activeTab, setActiveTab] = useState('dashboard');

    // Dashboard State
    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);

    // Invoices State
    const [invoices, setInvoices] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

    // Payments State
    const [payments, setPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        invoice_id: '',
        amount: '',
        payment_method: 'cash',
        receipt_number: '',
        receipt_url: '',
        notes: ''
    });
    const [paymentLoading, setPaymentLoading] = useState(false);

    // Debts State
    const [debts, setDebts] = useState([]);
    const [debtsLoading, setDebtsLoading] = useState(false);
    const [debtsByClinic, setDebtsByClinic] = useState([]);

    // Expenses State
    const [expenses, setExpenses] = useState([]);
    const [expensesLoading, setExpensesLoading] = useState(false);

    // Reports State
    const [dailyReport, setDailyReport] = useState(null);
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
    const [reportYear, setReportYear] = useState(new Date().getFullYear());

    // Audit Log State
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    // Alerts State
    const [alerts, setAlerts] = useState([]);
    const [alertsLoading, setAlertsLoading] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    useEffect(() => {
        fetchDashboard();
        fetchInvoices();
        fetchAlerts();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    // API CALLS
    // ═══════════════════════════════════════════════════════════════════════════

    const fetchDashboard = async () => {
        setDashboardLoading(true);
        try {
            const response = await api.get('/accounting/dashboard');
            setDashboard(response.data);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            toast.error('فشل في تحميل لوحة المعلومات');
        } finally {
            setDashboardLoading(false);
        }
    };

    const fetchInvoices = async () => {
        setInvoicesLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);
            if (filterStartDate) params.append('start_date', filterStartDate);
            if (filterEndDate) params.append('end_date', filterEndDate);
            if (searchQuery) params.append('search', searchQuery);

            const response = await api.get(`/accounting/invoices?${params.toString()}`);
            setInvoices(response.data.items || response.data);
        } catch (error) {
            console.error('Failed to load invoices:', error);
            toast.error('فشل في تحميل الفواتير');
        } finally {
            setInvoicesLoading(false);
        }
    };

    const fetchPayments = async () => {
        setPaymentsLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStartDate) params.append('start_date', filterStartDate);
            if (filterEndDate) params.append('end_date', filterEndDate);

            const response = await api.get(`/accounting/payments?${params.toString()}`);
            setPayments(response.data.items || response.data);
        } catch (error) {
            console.error('Failed to load payments:', error);
            toast.error('فشل في تحميل التحصيلات');
        } finally {
            setPaymentsLoading(false);
        }
    };

    const fetchDebts = async () => {
        setDebtsLoading(true);
        try {
            const [debtsRes, byClinicRes] = await Promise.all([
                api.get('/accounting/debts'),
                api.get('/accounting/debts/by-clinic')
            ]);
            setDebts(debtsRes.data);
            setDebtsByClinic(byClinicRes.data);
        } catch (error) {
            console.error('Failed to load debts:', error);
            toast.error('فشل في تحميل المديونيات');
        } finally {
            setDebtsLoading(false);
        }
    };

    const fetchExpenses = async () => {
        setExpensesLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStartDate) params.append('start_date', filterStartDate);
            if (filterEndDate) params.append('end_date', filterEndDate);

            const response = await api.get(`/accounting/approved-expenses?${params.toString()}`);
            setExpenses(response.data);
        } catch (error) {
            console.error('Failed to load expenses:', error);
            toast.error('فشل في تحميل النفقات');
        } finally {
            setExpensesLoading(false);
        }
    };

    const fetchDailyReport = async () => {
        try {
            const response = await api.get(`/accounting/reports/daily?date=${reportDate}`);
            setDailyReport(response.data);
        } catch (error) {
            console.error('Failed to load daily report:', error);
            toast.error('فشل في تحميل التقرير اليومي');
        }
    };

    const fetchMonthlyReport = async () => {
        try {
            const response = await api.get(`/accounting/reports/monthly?year=${reportYear}&month=${reportMonth}`);
            setMonthlyReport(response.data);
        } catch (error) {
            console.error('Failed to load monthly report:', error);
            toast.error('فشل في تحميل التقرير الشهري');
        }
    };

    const fetchAuditLog = async () => {
        setAuditLoading(true);
        try {
            const response = await api.get('/accounting/audit-log');
            setAuditLogs(response.data);
        } catch (error) {
            console.error('Failed to load audit log:', error);
            toast.error('فشل في تحميل سجل الحركات');
        } finally {
            setAuditLoading(false);
        }
    };

    const fetchAlerts = async () => {
        setAlertsLoading(true);
        try {
            const response = await api.get('/accounting/alerts');
            setAlerts(response.data);
        } catch (error) {
            console.error('Failed to load alerts:', error);
        } finally {
            setAlertsLoading(false);
        }
    };

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        if (!paymentForm.invoice_id || !paymentForm.amount) {
            toast.error('يرجى إدخال جميع البيانات المطلوبة');
            return;
        }

        setPaymentLoading(true);
        try {
            await api.post('/accounting/payments', {
                invoice_id: paymentForm.invoice_id,
                amount: parseFloat(paymentForm.amount),
                payment_method: paymentForm.payment_method,
                receipt_number: paymentForm.receipt_number || null,
                receipt_url: paymentForm.receipt_url || null,
                notes: paymentForm.notes || null
            });

            toast.success('تم تسجيل الدفعة بنجاح');
            setShowPaymentDialog(false);
            setPaymentForm({ invoice_id: '', amount: '', payment_method: 'cash', receipt_number: '', receipt_url: '', notes: '' });
            fetchInvoices();
            fetchPayments();
            fetchDashboard();
            fetchDebts();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'فشل في تسجيل الدفعة');
        } finally {
            setPaymentLoading(false);
        }
    };

    const handleExportExcel = async (type) => {
        try {
            const params = new URLSearchParams();
            params.append('export_type', type);
            if (filterStartDate) params.append('start_date', filterStartDate);
            if (filterEndDate) params.append('end_date', filterEndDate);

            const response = await api.get(`/accounting/export-excel?${params.toString()}`, {
                responseType: 'blob'
            });

            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `accounting_${type}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        }
    };

    const openPaymentDialog = (invoice) => {
        setPaymentForm({
            invoice_id: invoice.id,
            amount: invoice.remaining_amount?.toString() || '',
            payment_method: 'cash',
            receipt_number: '',
            receipt_url: '',
            notes: ''
        });
        setSelectedInvoice(invoice);
        setShowPaymentDialog(true);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    const getStatusBadge = (status) => {
        const styles = {
            'approved': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'في انتظار التحصيل' },
            'partially_paid': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'مدفوعة جزئياً' },
            'fully_paid': { bg: 'bg-green-100', text: 'text-green-700', label: 'مدفوعة بالكامل' },
            'cancelled': { bg: 'bg-red-100', text: 'text-red-700', label: 'ملغاة' }
        };
        const style = styles[status] || styles['approved'];
        return <Badge className={`${style.bg} ${style.text}`}>{style.label}</Badge>;
    };

    const getPaymentMethodLabel = (method) => {
        const methods = {
            'cash': 'نقدي',
            'bank': 'تحويل بنكي',
            'check': 'شيك',
            'credit': 'ائتمان',
            'e_wallet': 'محفظة إلكترونية',
            'instapay': 'إنستا باي',
            'electronic': 'تحويل إلكتروني'
        };
        return methods[method] || method;
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PDF EXPORT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    const handleExportInvoicePDF = async (invoice) => {
        try {
            toast.info('جاري إنشاء PDF...');
            await exportAccountingInvoicePDF(invoice, siteSettings);
            toast.success('تم تصدير الفاتورة بنجاح');
        } catch (error) {
            console.error('PDF export failed:', error);
            toast.error('فشل في تصدير PDF');
        }
    };

    const handleExportPaymentPDF = async (payment) => {
        try {
            toast.info('جاري إنشاء PDF...');
            // Find the related invoice
            const invoice = invoices.find(inv => inv.id === payment.invoice_id) || {};
            await exportPaymentReceiptPDF(payment, invoice, siteSettings);
            toast.success('تم تصدير إيصال الدفع بنجاح');
        } catch (error) {
            console.error('PDF export failed:', error);
            toast.error('فشل في تصدير PDF');
        }
    };

    const handleExportDailyReportPDF = () => {
        if (!dailyReport) {
            toast.error('لا يوجد تقرير محمل');
            return;
        }
        try {
            exportAccountingReportPDF(dailyReport, 'daily', siteSettings);
            toast.success('تم تصدير التقرير اليومي');
        } catch (error) {
            toast.error('فشل في تصدير التقرير');
        }
    };

    const handleExportMonthlyReportPDF = () => {
        if (!monthlyReport) {
            toast.error('لا يوجد تقرير محمل');
            return;
        }
        try {
            exportAccountingReportPDF(monthlyReport, 'monthly', siteSettings);
            toast.success('تم تصدير التقرير الشهري');
        } catch (error) {
            toast.error('فشل في تصدير التقرير');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <Layout user={user} onLogout={onLogout}>
            <div className="p-4 lg:p-8 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 flex items-center gap-3">
                            <Calculator className="h-8 w-8 text-emerald-600" />
                            الحسابات
                        </h1>
                        <p className="text-slate-600 mt-1">إدارة الفواتير والتحصيلات والمديونيات</p>
                    </div>

                    {/* Alerts Badge */}
                    {alerts.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <Bell className="h-5 w-5 text-red-600" />
                            <span className="text-red-700 font-medium">{alerts.length} تنبيه</span>
                        </div>
                    )}
                </div>

                {/* Main Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 mb-6 h-auto gap-1 bg-slate-100 p-1 rounded-xl">
                        <TabsTrigger value="dashboard" className="data-[state=active]:bg-white rounded-lg py-2">
                            <BarChart3 className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Dashboard</span>
                        </TabsTrigger>
                        <TabsTrigger value="invoices" onClick={fetchInvoices} className="data-[state=active]:bg-white rounded-lg py-2">
                            <FileText className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">الفواتير</span>
                        </TabsTrigger>
                        <TabsTrigger value="payments" onClick={fetchPayments} className="data-[state=active]:bg-white rounded-lg py-2">
                            <CreditCard className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">التحصيلات</span>
                        </TabsTrigger>
                        <TabsTrigger value="debts" onClick={fetchDebts} className="data-[state=active]:bg-white rounded-lg py-2">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">المديونيات</span>
                        </TabsTrigger>
                        <TabsTrigger value="expenses" onClick={fetchExpenses} className="data-[state=active]:bg-white rounded-lg py-2">
                            <Receipt className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">النفقات</span>
                        </TabsTrigger>
                        <TabsTrigger value="reports" onClick={() => { fetchDailyReport(); fetchMonthlyReport(); }} className="data-[state=active]:bg-white rounded-lg py-2">
                            <PieChart className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">التقارير</span>
                        </TabsTrigger>
                        <TabsTrigger value="audit" onClick={fetchAuditLog} className="data-[state=active]:bg-white rounded-lg py-2">
                            <History className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">السجل</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* DASHBOARD TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="dashboard" className="space-y-6">
                        {dashboardLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                                <p className="mt-2 text-slate-600">جاري التحميل...</p>
                            </div>
                        ) : dashboard && (
                            <>
                                {/* Stats Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                                                <DollarSign className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-emerald-600 font-medium">إجمالي الإيرادات</p>
                                                <p className="text-xl font-bold text-emerald-900">{formatCurrency(dashboard.total_revenue)}</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                                                <CheckCircle className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-600 font-medium">إجمالي التحصيلات</p>
                                                <p className="text-xl font-bold text-blue-900">{formatCurrency(dashboard.total_collected)}</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                                                <AlertTriangle className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-orange-600 font-medium">المديونيات</p>
                                                <p className="text-xl font-bold text-orange-900">{formatCurrency(dashboard.total_outstanding)}</p>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                                                <FileText className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-purple-600 font-medium">عدد الفواتير</p>
                                                <p className="text-xl font-bold text-purple-900">{dashboard.total_invoices}</p>
                                            </div>
                                        </div>
                                    </Card>
                                </div>

                                {/* Monthly Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-slate-900">هذا الشهر</h3>
                                            <Calendar className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">الفواتير</span>
                                                <span className="font-medium">{dashboard.month_invoice_count} فاتورة</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">الإيرادات</span>
                                                <span className="font-medium text-emerald-600">{formatCurrency(dashboard.month_revenue)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">النفقات</span>
                                                <span className="font-medium text-red-600">{formatCurrency(dashboard.month_expense_total)}</span>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-slate-900">تحصيلات اليوم</h3>
                                            <TrendingUp className="h-5 w-5 text-emerald-500" />
                                        </div>
                                        <p className="text-3xl font-bold text-emerald-600">{formatCurrency(dashboard.today_collected)}</p>
                                    </Card>

                                    <Card className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-slate-900">فواتير متأخرة</h3>
                                            <AlertTriangle className="h-5 w-5 text-red-500" />
                                        </div>
                                        <p className="text-3xl font-bold text-red-600">{dashboard.overdue_count}</p>
                                        <p className="text-sm text-slate-500 mt-1">أكثر من 30 يوم</p>
                                    </Card>
                                </div>

                                {/* Alerts Section */}
                                {alerts.length > 0 && (
                                    <Card className="p-6 border-red-200 bg-red-50">
                                        <h3 className="font-semibold text-red-800 mb-4 flex items-center gap-2">
                                            <Bell className="h-5 w-5" />
                                            تنبيهات الفواتير المتأخرة
                                        </h3>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {alerts.slice(0, 5).map((alert) => (
                                                <div key={alert.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-100">
                                                    <div>
                                                        <span className="font-medium">فاتورة #{alert.invoice_number}</span>
                                                        <span className="text-slate-600 mx-2">-</span>
                                                        <span className="text-slate-600">{alert.clinic_name}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-medium text-red-600">{formatCurrency(alert.amount_due)}</p>
                                                        <p className="text-xs text-slate-500">متأخرة {alert.days_overdue} يوم</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {/* Latest Activities Section */}
                                <div className="mt-6">
                                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-indigo-600" />
                                        آخر الأنشطة
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Latest Invoices */}
                                        <Card className="p-4">
                                            <h4 className="font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                                                <FileText className="h-4 w-4" />
                                                آخر الفواتير
                                            </h4>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {dashboard.latest_invoices?.length > 0 ? (
                                                    dashboard.latest_invoices.map((inv) => (
                                                        <div
                                                            key={inv.invoice_number}
                                                            className="p-2 bg-slate-50 rounded text-sm cursor-pointer hover:bg-emerald-50 transition-colors"
                                                            onClick={() => {
                                                                setActiveTab('invoices');
                                                                fetchInvoices();
                                                                setSearchQuery(inv.invoice_number?.toString() || '');
                                                            }}
                                                        >
                                                            <div className="flex justify-between">
                                                                <span className="font-medium">#{inv.invoice_number}</span>
                                                                <span className="text-emerald-600">{formatCurrency(inv.total_amount)}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 truncate">{inv.clinic_name}</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-slate-400 text-center">لا توجد فواتير</p>
                                                )}
                                            </div>
                                        </Card>

                                        {/* Latest Payments/Collections */}
                                        <Card className="p-4">
                                            <h4 className="font-semibold text-blue-700 mb-3 flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4" />
                                                آخر التحصيلات
                                            </h4>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {dashboard.latest_payments?.length > 0 ? (
                                                    dashboard.latest_payments.map((pay, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="p-2 bg-slate-50 rounded text-sm cursor-pointer hover:bg-blue-50 transition-colors"
                                                            onClick={() => {
                                                                setActiveTab('payments');
                                                                fetchPayments();
                                                            }}
                                                        >
                                                            <div className="flex justify-between">
                                                                <span className="font-medium">#{pay.invoice_number}</span>
                                                                <span className="text-blue-600">{formatCurrency(pay.amount)}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 truncate">{pay.clinic_name}</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-slate-400 text-center">لا توجد تحصيلات</p>
                                                )}
                                            </div>
                                        </Card>

                                        {/* Latest Expenses */}
                                        <Card className="p-4">
                                            <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                                                <Receipt className="h-4 w-4" />
                                                آخر المصروفات
                                            </h4>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {dashboard.latest_expenses?.length > 0 ? (
                                                    dashboard.latest_expenses.map((exp, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="p-2 bg-slate-50 rounded text-sm cursor-pointer hover:bg-red-50 transition-colors"
                                                            onClick={() => {
                                                                setActiveTab('expenses');
                                                                fetchExpenses();
                                                            }}
                                                        >
                                                            <div className="flex justify-between">
                                                                <span className="font-medium truncate max-w-[100px]">{exp.description}</span>
                                                                <span className="text-red-600">{formatCurrency(exp.amount)}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-500">{exp.category}</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-slate-400 text-center">لا توجد مصروفات</p>
                                                )}
                                            </div>
                                        </Card>

                                        {/* Latest Debts */}
                                        <Card className="p-4">
                                            <h4 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4" />
                                                أعلى المديونيات
                                            </h4>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {dashboard.latest_debts?.length > 0 ? (
                                                    dashboard.latest_debts.map((debt) => (
                                                        <div
                                                            key={debt.invoice_number}
                                                            className="p-2 bg-slate-50 rounded text-sm cursor-pointer hover:bg-orange-50 transition-colors"
                                                            onClick={() => {
                                                                setActiveTab('debts');
                                                                fetchDebts();
                                                            }}
                                                        >
                                                            <div className="flex justify-between">
                                                                <span className="font-medium">#{debt.invoice_number}</span>
                                                                <span className="text-orange-600">{formatCurrency(debt.remaining_amount)}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 truncate">{debt.clinic_name}</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-slate-400 text-center">لا توجد مديونيات</p>
                                                )}
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* INVOICES TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="invoices" className="space-y-4">
                        {/* Filters */}
                        <Card className="p-4">
                            <div className="flex flex-wrap gap-4 items-end">
                                <div className="flex-1 min-w-[200px]">
                                    <Label>بحث</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="بحث بالعيادة أو المندوب..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>الحالة</Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="w-40">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">الكل</SelectItem>
                                            <SelectItem value="approved">في انتظار التحصيل</SelectItem>
                                            <SelectItem value="partially_paid">مدفوعة جزئياً</SelectItem>
                                            <SelectItem value="fully_paid">مدفوعة بالكامل</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button onClick={fetchInvoices} variant="outline">
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    تحديث
                                </Button>
                                <Button onClick={() => handleExportExcel('invoices')} variant="outline" className="text-emerald-600">
                                    <Download className="h-4 w-4 mr-2" />
                                    تصدير Excel
                                </Button>
                            </div>
                        </Card>

                        {/* Invoices List */}
                        {invoicesLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {invoices.map((invoice) => (
                                    <Card key={invoice.id} className="p-4 hover:shadow-md transition-shadow">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-lg font-bold text-slate-900">
                                                        فاتورة #{invoice.invoice_number}
                                                    </span>
                                                    {getStatusBadge(invoice.status)}
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                                    <div>
                                                        <span className="text-slate-500">العيادة:</span>
                                                        <span className="font-medium mr-1">{invoice.clinic_name}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">المندوب:</span>
                                                        <span className="font-medium mr-1">{invoice.created_by_name}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">المنطقة:</span>
                                                        <span className="font-medium mr-1">{invoice.area_name || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">التاريخ:</span>
                                                        <span className="font-medium mr-1">
                                                            {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy') : '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(invoice.total_amount)}</p>
                                                    <div className="flex gap-4 text-sm">
                                                        <span className="text-emerald-600">مدفوع: {formatCurrency(invoice.paid_amount)}</span>
                                                        <span className="text-orange-600">متبقي: {formatCurrency(invoice.remaining_amount)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setSelectedInvoice(invoice);
                                                            setShowInvoiceDialog(true);
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        عرض
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-blue-600"
                                                        onClick={() => handleExportInvoicePDF(invoice)}
                                                    >
                                                        <Printer className="h-4 w-4 mr-1" />
                                                        PDF
                                                    </Button>
                                                    {invoice.remaining_amount > 0 && (
                                                        <Button
                                                            size="sm"
                                                            className="bg-emerald-600 hover:bg-emerald-700"
                                                            onClick={() => openPaymentDialog(invoice)}
                                                        >
                                                            <CreditCard className="h-4 w-4 mr-1" />
                                                            تحصيل
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                ))}

                                {invoices.length === 0 && (
                                    <Card className="p-12 text-center">
                                        <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                        <p className="text-slate-500">لا توجد فواتير</p>
                                    </Card>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* PAYMENTS TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="payments" className="space-y-4">
                        <Card className="p-4">
                            <div className="flex flex-wrap gap-4 items-end">
                                <div>
                                    <Label>من تاريخ</Label>
                                    <Input
                                        type="date"
                                        value={filterStartDate}
                                        onChange={(e) => setFilterStartDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>إلى تاريخ</Label>
                                    <Input
                                        type="date"
                                        value={filterEndDate}
                                        onChange={(e) => setFilterEndDate(e.target.value)}
                                    />
                                </div>
                                <Button onClick={fetchPayments} variant="outline">
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    تحديث
                                </Button>
                                <Button onClick={() => handleExportExcel('payments')} variant="outline" className="text-emerald-600">
                                    <Download className="h-4 w-4 mr-2" />
                                    تصدير Excel
                                </Button>
                            </div>
                        </Card>

                        {paymentsLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {payments.map((payment) => (
                                    <Card key={payment.id} className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="font-bold text-slate-900">دفعة #{payment.payment_number}</span>
                                                    <Badge className="bg-emerald-100 text-emerald-700">فاتورة #{payment.invoice_number}</Badge>
                                                </div>
                                                <div className="text-sm text-slate-600">
                                                    <span>{payment.clinic_name}</span>
                                                    <span className="mx-2">•</span>
                                                    <span>{getPaymentMethodLabel(payment.payment_method)}</span>
                                                    <span className="mx-2">•</span>
                                                    <span>{payment.payment_date ? format(new Date(payment.payment_date), 'dd/MM/yyyy HH:mm') : '-'}</span>
                                                </div>
                                                <p className="text-sm text-slate-500 mt-1">المحصل: {payment.collected_by_name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(payment.amount)}</p>
                                                {payment.receipt_number && (
                                                    <p className="text-sm text-slate-500">إيصال: {payment.receipt_number}</p>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}

                                {payments.length === 0 && (
                                    <Card className="p-12 text-center">
                                        <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                        <p className="text-slate-500">لا توجد تحصيلات</p>
                                    </Card>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* DEBTS TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="debts" className="space-y-4">
                        <div className="flex justify-end gap-2">
                            <Button onClick={fetchDebts} variant="outline">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                تحديث
                            </Button>
                            <Button onClick={() => handleExportExcel('debts')} variant="outline" className="text-emerald-600">
                                <Download className="h-4 w-4 mr-2" />
                                تصدير Excel
                            </Button>
                        </div>

                        {/* Summary by Clinic */}
                        <Card className="p-6">
                            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                المديونيات حسب العيادة
                            </h3>
                            <div className="space-y-3">
                                {debtsByClinic.map((clinic) => (
                                    <div key={clinic._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <div>
                                            <span className="font-medium">{clinic.clinic_name}</span>
                                            <span className="text-sm text-slate-500 mr-2">({clinic.invoice_count} فاتورة)</span>
                                        </div>
                                        <span className="font-bold text-orange-600">{formatCurrency(clinic.total_debt)}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* All Debts List */}
                        <Card className="p-6">
                            <h3 className="font-semibold text-slate-900 mb-4">كل المديونيات</h3>
                            <div className="space-y-3">
                                {debts.map((debt) => (
                                    <div key={debt.id} className={`flex items-center justify-between p-3 rounded-lg ${debt.is_overdue ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">فاتورة #{debt.invoice_number}</span>
                                                {debt.is_overdue && <Badge className="bg-red-100 text-red-700">متأخرة</Badge>}
                                            </div>
                                            <p className="text-sm text-slate-600">{debt.clinic_name}</p>
                                            <p className="text-xs text-slate-500">{debt.days_old} يوم</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-orange-600">{formatCurrency(debt.remaining_amount)}</p>
                                            <Button size="sm" variant="outline" className="mt-1" onClick={() => openPaymentDialog(debt)}>
                                                تحصيل
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* EXPENSES TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="expenses" className="space-y-4">
                        <div className="flex justify-end gap-2">
                            <Button onClick={fetchExpenses} variant="outline">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                تحديث
                            </Button>
                            <Button onClick={() => handleExportExcel('expenses')} variant="outline" className="text-emerald-600">
                                <Download className="h-4 w-4 mr-2" />
                                تصدير Excel
                            </Button>
                        </div>

                        {expensesLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {expenses.map((expense) => (
                                    <Card key={expense.id} className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-slate-900">{expense.expense_type}</span>
                                                    <Badge className="bg-slate-100 text-slate-700">{expense.category}</Badge>
                                                </div>
                                                <p className="text-sm text-slate-600">{expense.description}</p>
                                                <div className="text-sm text-slate-500 mt-1">
                                                    <span>بواسطة: {expense.submitter_name}</span>
                                                    <span className="mx-2">•</span>
                                                    <span>اعتمدها: {expense.reviewer_name}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-red-600">{formatCurrency(expense.amount)}</p>
                                                <p className="text-sm text-slate-500">
                                                    {expense.expense_date ? format(new Date(expense.expense_date), 'dd/MM/yyyy') : '-'}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}

                                {expenses.length === 0 && (
                                    <Card className="p-12 text-center">
                                        <Receipt className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                        <p className="text-slate-500">لا توجد نفقات معتمدة</p>
                                    </Card>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* REPORTS TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="reports" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Daily Report */}
                            <Card className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-slate-900">التقرير اليومي</h3>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="date"
                                            value={reportDate}
                                            onChange={(e) => setReportDate(e.target.value)}
                                            className="w-auto"
                                        />
                                        <Button size="sm" onClick={fetchDailyReport}>
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {dailyReport && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-emerald-50 rounded-lg">
                                                <p className="text-sm text-emerald-600">الفواتير</p>
                                                <p className="text-xl font-bold text-emerald-900">{dailyReport.invoices.count}</p>
                                                <p className="text-sm text-emerald-700">{formatCurrency(dailyReport.invoices.total)}</p>
                                            </div>
                                            <div className="p-4 bg-blue-50 rounded-lg">
                                                <p className="text-sm text-blue-600">التحصيلات</p>
                                                <p className="text-xl font-bold text-blue-900">{dailyReport.payments.count}</p>
                                                <p className="text-sm text-blue-700">{formatCurrency(dailyReport.payments.total)}</p>
                                            </div>
                                            <div className="p-4 bg-red-50 rounded-lg">
                                                <p className="text-sm text-red-600">النفقات</p>
                                                <p className="text-xl font-bold text-red-900">{dailyReport.expenses.count}</p>
                                                <p className="text-sm text-red-700">{formatCurrency(dailyReport.expenses.total)}</p>
                                            </div>
                                            <div className="p-4 bg-purple-50 rounded-lg">
                                                <p className="text-sm text-purple-600">صافي التدفق</p>
                                                <p className={`text-xl font-bold ${dailyReport.net_cash_flow >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                                                    {formatCurrency(dailyReport.net_cash_flow)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </Card>

                            {/* Monthly Report */}
                            <Card className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-slate-900">التقرير الشهري</h3>
                                    <div className="flex items-center gap-2">
                                        <Select value={reportMonth.toString()} onValueChange={(v) => setReportMonth(parseInt(v))}>
                                            <SelectTrigger className="w-24">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                                    <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={reportYear.toString()} onValueChange={(v) => setReportYear(parseInt(v))}>
                                            <SelectTrigger className="w-24">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[2023, 2024, 2025].map(y => (
                                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button size="sm" onClick={fetchMonthlyReport}>
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {monthlyReport && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-emerald-50 rounded-lg">
                                                <p className="text-sm text-emerald-600">الفواتير</p>
                                                <p className="text-xl font-bold text-emerald-900">{monthlyReport.invoices.count}</p>
                                                <p className="text-sm text-emerald-700">{formatCurrency(monthlyReport.invoices.total)}</p>
                                            </div>
                                            <div className="p-4 bg-blue-50 rounded-lg">
                                                <p className="text-sm text-blue-600">التحصيلات</p>
                                                <p className="text-xl font-bold text-blue-900">{monthlyReport.payments.count}</p>
                                                <p className="text-sm text-blue-700">{formatCurrency(monthlyReport.payments.total)}</p>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <p className="text-sm text-slate-600 mb-2">صافي الدخل</p>
                                            <p className={`text-2xl font-bold ${monthlyReport.net_income >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {formatCurrency(monthlyReport.net_income)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    {/* AUDIT LOG TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════════════ */}
                    <TabsContent value="audit" className="space-y-4">
                        <div className="flex justify-end">
                            <Button onClick={fetchAuditLog} variant="outline">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                تحديث
                            </Button>
                        </div>

                        {auditLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                            </div>
                        ) : (
                            <Card className="p-6">
                                <div className="space-y-4">
                                    {auditLogs.map((log) => (
                                        <div key={log.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                                            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                                                <History className="h-5 w-5 text-slate-600" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-slate-900">{log.action_details}</p>
                                                <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                                    <span>{log.user_name}</span>
                                                    <span>•</span>
                                                    <span>{log.created_at ? format(new Date(log.created_at), 'dd/MM/yyyy HH:mm') : '-'}</span>
                                                    {log.amount && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="text-emerald-600">{formatCurrency(log.amount)}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {auditLogs.length === 0 && (
                                        <div className="text-center py-8">
                                            <History className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                            <p className="text-slate-500">لا توجد سجلات</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>

                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {/* PAYMENT DIALOG */}
                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleRecordPayment} className="space-y-4">
                            {selectedInvoice && (
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <p className="font-medium">فاتورة #{selectedInvoice.invoice_number}</p>
                                    <p className="text-sm text-slate-600">{selectedInvoice.clinic_name}</p>
                                    <p className="text-sm text-orange-600">المتبقي: {formatCurrency(selectedInvoice.remaining_amount)}</p>
                                </div>
                            )}

                            <div>
                                <Label>المبلغ *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label>طريقة الدفع</Label>
                                <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">نقدي</SelectItem>
                                        <SelectItem value="bank">تحويل بنكي</SelectItem>
                                        <SelectItem value="check">شيك</SelectItem>
                                        <SelectItem value="credit">ائتمان</SelectItem>
                                        <SelectItem value="e_wallet">محفظة إلكترونية (فودافون كاش / اورانج كاش)</SelectItem>
                                        <SelectItem value="instapay">إنستا باي</SelectItem>
                                        <SelectItem value="electronic">تحويل إلكتروني آخر</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>رقم الإيصال (اختياري)</Label>
                                <Input
                                    value={paymentForm.receipt_number}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, receipt_number: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>صورة الإيصال / التحويل (اختياري)</Label>
                                <div className="mt-1 flex items-center gap-2">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                    const res = await api.post('/upload-image', formData, {
                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                    });
                                                    setPaymentForm({ ...paymentForm, receipt_url: res.data.url });
                                                    toast.success('تم رفع الصورة');
                                                } catch {
                                                    toast.error('فشل في رفع الصورة');
                                                }
                                            }
                                        }}
                                        className="text-sm"
                                    />
                                    {paymentForm.receipt_url && (
                                        <span className="text-xs text-emerald-600">✓ تم الرفع</span>
                                    )}
                                </div>
                                {paymentForm.receipt_url && (
                                    <img
                                        src={paymentForm.receipt_url.startsWith('http') ? paymentForm.receipt_url : `${getBackendBaseUrl()}${paymentForm.receipt_url}`}
                                        alt="Receipt"
                                        className="mt-2 h-24 w-auto object-cover rounded border"
                                    />
                                )}
                            </div>

                            <div>
                                <Label>ملاحظات</Label>
                                <Textarea
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    rows={2}
                                />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>
                                    إلغاء
                                </Button>
                                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={paymentLoading}>
                                    {paymentLoading ? 'جاري التسجيل...' : 'تسجيل الدفعة'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                {/* INVOICE DETAILS DIALOG */}
                {/* ═══════════════════════════════════════════════════════════════════════════ */}
                <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>تفاصيل الفاتورة #{selectedInvoice?.invoice_number}</DialogTitle>
                        </DialogHeader>

                        {selectedInvoice && (
                            <div className="space-y-6">
                                {/* Invoice Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-slate-500">العيادة</Label>
                                        <p className="font-medium">{selectedInvoice.clinic_name}</p>
                                    </div>
                                    <div>
                                        <Label className="text-slate-500">المندوب</Label>
                                        <p className="font-medium">{selectedInvoice.created_by_name}</p>
                                    </div>
                                    <div>
                                        <Label className="text-slate-500">المنطقة</Label>
                                        <p className="font-medium">{selectedInvoice.area_name || '-'}</p>
                                    </div>
                                    <div>
                                        <Label className="text-slate-500">الخط</Label>
                                        <p className="font-medium">{selectedInvoice.line_name || '-'}</p>
                                    </div>
                                    <div>
                                        <Label className="text-slate-500">المدير المباشر</Label>
                                        <p className="font-medium">{selectedInvoice.manager_name || '-'}</p>
                                    </div>
                                    <div>
                                        <Label className="text-slate-500">تاريخ الاعتماد</Label>
                                        <p className="font-medium">
                                            {selectedInvoice.invoice_date ? format(new Date(selectedInvoice.invoice_date), 'dd/MM/yyyy HH:mm') : '-'}
                                        </p>
                                    </div>
                                </div>

                                {/* Products */}
                                <div>
                                    <Label className="text-slate-500 mb-2 block">المنتجات</Label>
                                    <div className="border rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="p-2 text-right">المنتج</th>
                                                    <th className="p-2 text-center">الكمية</th>
                                                    <th className="p-2 text-center">السعر</th>
                                                    <th className="p-2 text-left">الإجمالي</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedInvoice.products?.map((product, idx) => (
                                                    <tr key={idx} className="border-t">
                                                        <td className="p-2">{product.name}</td>
                                                        <td className="p-2 text-center">{product.quantity}</td>
                                                        <td className="p-2 text-center">{formatCurrency(product.price)}</td>
                                                        <td className="p-2 text-left">{formatCurrency(product.quantity * product.price)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Totals */}
                                <div className="bg-slate-50 p-4 rounded-lg">
                                    <div className="flex justify-between mb-2">
                                        <span>المجموع الفرعي</span>
                                        <span className="font-medium">{formatCurrency(selectedInvoice.subtotal)}</span>
                                    </div>
                                    {selectedInvoice.discount_value && (
                                        <div className="flex justify-between mb-2 text-orange-600">
                                            <span>الخصم</span>
                                            <span>-{formatCurrency(selectedInvoice.discount_value)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                                        <span>الإجمالي</span>
                                        <span>{formatCurrency(selectedInvoice.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-600 mt-2">
                                        <span>المدفوع</span>
                                        <span>{formatCurrency(selectedInvoice.paid_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-orange-600">
                                        <span>المتبقي</span>
                                        <span className="font-bold">{formatCurrency(selectedInvoice.remaining_amount)}</span>
                                    </div>
                                </div>

                                {/* Payment History */}
                                {selectedInvoice.payments?.length > 0 && (
                                    <div>
                                        <Label className="text-slate-500 mb-2 block">سجل الدفعات</Label>
                                        <div className="space-y-3">
                                            {selectedInvoice.payments.map((pay, idx) => (
                                                <div key={idx} className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <span className="font-bold text-emerald-700">دفعة #{pay.payment_number}</span>
                                                            <Badge className="mr-2 bg-emerald-100 text-emerald-700">{getPaymentMethodLabel(pay.method)}</Badge>
                                                        </div>
                                                        <span className="text-xl font-bold text-emerald-600">{formatCurrency(pay.amount)}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-2">
                                                        <div>التاريخ: {pay.date ? format(new Date(pay.date), 'dd/MM/yyyy HH:mm') : '-'}</div>
                                                        <div>بواسطة: {pay.collected_by_name}</div>
                                                        {pay.receipt_number && <div>رقم الإيصال: {pay.receipt_number}</div>}
                                                    </div>
                                                    {pay.notes && <p className="text-sm text-slate-500 italic mb-2">{pay.notes}</p>}
                                                    {pay.receipt_url && (
                                                        <img
                                                            src={pay.receipt_url.startsWith('http') ? pay.receipt_url : `${getBackendBaseUrl()}${pay.receipt_url}`}
                                                            alt="Receipt"
                                                            className="h-32 w-auto object-cover rounded border cursor-pointer hover:opacity-80"
                                                            onClick={() => window.open(pay.receipt_url.startsWith('http') ? pay.receipt_url : `${getBackendBaseUrl()}${pay.receipt_url}`, '_blank')}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default Accounting;
