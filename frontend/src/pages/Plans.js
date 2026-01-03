import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import {
    Plus, Calendar, ClipboardList, Send, CheckCircle, XCircle, Clock, Edit,
    ChevronLeft, ChevronRight, MapPin, Building2, RefreshCw, MessageSquare,
    Eye, Trash2, CalendarDays, BarChart3, Users, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';

const Plans = ({ user, onLogout }) => {
    const { t } = useLanguage();
    const [plans, setPlans] = useState([]);
    const [clinics, setClinics] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);

    // Current month for calendar
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // View mode: 'list' or 'calendar'
    const [viewMode, setViewMode] = useState('calendar');

    // Dialog states
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPlanDetailsDialog, setShowPlanDetailsDialog] = useState(false);
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    // Form data for new plan
    const [formData, setFormData] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        planned_visits: [],
        recurring_visits: [],
        new_clinics: [],
        notes: ''
    });

    // Approval form
    const [approvalAction, setApprovalAction] = useState('approve');
    const [managerNotes, setManagerNotes] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        fetchPlans();
        fetchClinics();
        fetchStats();
    }, [currentMonth]);

    const fetchPlans = async () => {
        try {
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const response = await api.get(`/plans?month=${month}&year=${year}`);
            setPlans(response.data);
        } catch (error) {
            console.error('Failed to load plans:', error);
        }
    };

    const fetchClinics = async () => {
        try {
            const response = await api.get('/clinics');
            setClinics(response.data.items || response.data);
        } catch (error) {
            console.error('Failed to load clinics');
        }
    };

    const fetchStats = async () => {
        try {
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const response = await api.get(`/plans/stats/summary?month=${month}&year=${year}`);
            setStats(response.data);
        } catch (error) {
            console.error('Failed to load stats');
        }
    };

    const handleCreatePlan = async () => {
        setLoading(true);
        try {
            await api.post('/plans', formData);
            toast.success('تم إنشاء الخطة بنجاح');
            setShowCreateDialog(false);
            resetForm();
            fetchPlans();
            fetchStats();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'فشل في إنشاء الخطة');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitPlan = async (planId) => {
        try {
            await api.post(`/plans/${planId}/submit`);
            toast.success('تم إرسال الخطة للموافقة');
            fetchPlans();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'فشل في إرسال الخطة');
        }
    };

    const handleApprovalAction = async () => {
        if (!selectedPlan) return;

        try {
            await api.post(`/plans/${selectedPlan.id}/approve`, {
                action: approvalAction,
                manager_notes: managerNotes,
                rejection_reason: rejectionReason
            });
            toast.success('تم تحديث حالة الخطة');
            setShowApprovalDialog(false);
            setSelectedPlan(null);
            fetchPlans();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'فشل في تحديث الخطة');
        }
    };

    const resetForm = () => {
        setFormData({
            month: currentMonth.getMonth() + 1,
            year: currentMonth.getFullYear(),
            planned_visits: [],
            recurring_visits: [],
            new_clinics: [],
            notes: ''
        });
    };

    const addPlannedVisit = () => {
        setFormData({
            ...formData,
            planned_visits: [
                ...formData.planned_visits,
                { clinic_id: '', scheduled_date: '', visit_reason: 'follow_up', visit_type: 'regular', notes: '' }
            ]
        });
    };

    const updatePlannedVisit = (index, field, value) => {
        const updated = formData.planned_visits.map((v, i) =>
            i === index ? { ...v, [field]: value } : v
        );
        setFormData({ ...formData, planned_visits: updated });
    };

    const removePlannedVisit = (index) => {
        setFormData({
            ...formData,
            planned_visits: formData.planned_visits.filter((_, i) => i !== index)
        });
    };

    const addRecurringVisit = () => {
        setFormData({
            ...formData,
            recurring_visits: [
                ...formData.recurring_visits,
                {
                    clinic_id: '',
                    recurrence_type: 'weekly',
                    days_of_week: [],
                    preferred_time: '09:00',
                    visit_reason: 'follow_up',
                    start_date: format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
                    end_date: format(endOfMonth(currentMonth), 'yyyy-MM-dd')
                }
            ]
        });
    };

    const updateRecurringVisit = (index, field, value) => {
        const updated = formData.recurring_visits.map((v, i) =>
            i === index ? { ...v, [field]: value } : v
        );
        setFormData({ ...formData, recurring_visits: updated });
    };

    const removeRecurringVisit = (index) => {
        setFormData({
            ...formData,
            recurring_visits: formData.recurring_visits.filter((_, i) => i !== index)
        });
    };

    const addNewClinic = () => {
        setFormData({
            ...formData,
            new_clinics: [
                ...formData.new_clinics,
                { name: '', address: '', doctor_name: '', specialty: '', planned_date: '', notes: '' }
            ]
        });
    };

    const updateNewClinic = (index, field, value) => {
        const updated = formData.new_clinics.map((c, i) =>
            i === index ? { ...c, [field]: value } : c
        );
        setFormData({ ...formData, new_clinics: updated });
    };

    const removeNewClinic = (index) => {
        setFormData({
            ...formData,
            new_clinics: formData.new_clinics.filter((_, i) => i !== index)
        });
    };

    const getStatusColor = (status) => {
        const colors = {
            'draft': 'bg-slate-100 text-slate-700 border-slate-200',
            'pending_approval': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'needs_revision': 'bg-orange-100 text-orange-700 border-orange-200',
            'approved': 'bg-green-100 text-green-700 border-green-200',
            'active': 'bg-blue-100 text-blue-700 border-blue-200',
            'completed': 'bg-purple-100 text-purple-700 border-purple-200'
        };
        return colors[status] || 'bg-slate-100 text-slate-700';
    };

    const getStatusLabel = (status) => {
        const labels = {
            'draft': 'مسودة',
            'pending_approval': 'بانتظار الموافقة',
            'needs_revision': 'يحتاج تعديل',
            'approved': 'معتمد',
            'active': 'نشط',
            'completed': 'مكتمل'
        };
        return labels[status] || status;
    };

    // Calendar rendering
    const renderCalendar = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

        // Get all planned visits for display
        const allPlannedVisits = plans.flatMap(p =>
            (p.planned_visits || []).map(v => ({
                ...v,
                planId: p.id,
                planStatus: p.status,
                userName: p.user_name
            }))
        );

        const weekDays = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

        return (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {/* Calendar Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                    <h2 className="text-xl font-bold text-slate-900">
                        {format(currentMonth, 'MMMM yyyy', { locale: ar })}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                </div>

                {/* Week Days Header */}
                <div className="grid grid-cols-7 border-b">
                    {weekDays.map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-slate-600 bg-slate-50">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7">
                    {/* Empty cells for days before month start */}
                    {Array(monthStart.getDay()).fill(null).map((_, i) => (
                        <div key={`empty-${i}`} className="p-2 min-h-[100px] bg-slate-50/50" />
                    ))}

                    {days.map(day => {
                        const dayVisits = allPlannedVisits.filter(v => {
                            const visitDate = new Date(v.scheduled_date);
                            return isSameDay(visitDate, day);
                        });

                        return (
                            <div
                                key={day.toISOString()}
                                className={`p-2 min-h-[100px] border-r border-b transition-colors ${isToday(day) ? 'bg-primary/5' : 'hover:bg-slate-50'
                                    }`}
                            >
                                <div className={`text-sm font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-slate-700'
                                    }`}>
                                    {format(day, 'd')}
                                </div>

                                {/* Visit indicators */}
                                <div className="space-y-1">
                                    {dayVisits.slice(0, 3).map((visit, idx) => (
                                        <div
                                            key={idx}
                                            className={`text-xs p-1 rounded truncate cursor-pointer ${visit.is_completed
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-blue-100 text-blue-700'
                                                }`}
                                            title={visit.clinic_name || 'عيادة'}
                                        >
                                            {visit.clinic_name || 'زيارة'}
                                        </div>
                                    ))}
                                    {dayVisits.length > 3 && (
                                        <div className="text-xs text-slate-500 text-center">
                                            +{dayVisits.length - 3} أخرى
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render plan card
    const renderPlanCard = (plan) => (
        <Card key={plan.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className={`p-1 ${getStatusColor(plan.status)}`} />
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg text-slate-900">
                            خطة {plan.month}/{plan.year}
                        </h3>
                        <p className="text-sm text-slate-500">{plan.user_name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                        {getStatusLabel(plan.status)}
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xl font-bold text-slate-900">{plan.planned_visits?.length || 0}</div>
                        <div className="text-xs text-slate-500">زيارات</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xl font-bold text-slate-900">{plan.recurring_visits?.length || 0}</div>
                        <div className="text-xs text-slate-500">متكررة</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xl font-bold text-slate-900">{plan.new_clinics?.length || 0}</div>
                        <div className="text-xs text-slate-500">جديدة</div>
                    </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                            setSelectedPlan(plan);
                            setShowPlanDetailsDialog(true);
                        }}
                    >
                        <Eye className="h-4 w-4 mr-1" />
                        عرض
                    </Button>

                    {plan.status === 'draft' && plan.user_id === user?.id && (
                        <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleSubmitPlan(plan.id)}
                        >
                            <Send className="h-4 w-4 mr-1" />
                            إرسال
                        </Button>
                    )}

                    {plan.status === 'pending_approval' && (user?.role === 'manager' || user?.role === 'gm' || user?.role === 'super_admin') && (
                        <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                                setSelectedPlan(plan);
                                setShowApprovalDialog(true);
                            }}
                        >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            مراجعة
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );

    return (
        <Layout user={user} onLogout={onLogout}>
            <div className="p-4 lg:p-8 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">📋 الخطط</h1>
                        <p className="text-slate-600 mt-1">إدارة خطط الزيارات الشهرية</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Toggle */}
                        <div className="flex border rounded-lg overflow-hidden">
                            <Button
                                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('calendar')}
                                className="rounded-none"
                            >
                                <Calendar className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className="rounded-none"
                            >
                                <ClipboardList className="h-4 w-4" />
                            </Button>
                        </div>

                        {user?.role !== 'manager' && (
                            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                                <DialogTrigger asChild>
                                    <Button className="bg-primary hover:bg-primary/90">
                                        <Plus className="h-4 w-4 mr-2" />
                                        خطة جديدة
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>إنشاء خطة جديدة</DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-6">
                                        {/* Month/Year */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>الشهر</Label>
                                                <Select
                                                    value={formData.month.toString()}
                                                    onValueChange={(v) => setFormData({ ...formData, month: parseInt(v) })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                                            <SelectItem key={m} value={m.toString()}>شهر {m}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label>السنة</Label>
                                                <Select
                                                    value={formData.year.toString()}
                                                    onValueChange={(v) => setFormData({ ...formData, year: parseInt(v) })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {[2025, 2026, 2027].map(y => (
                                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Planned Visits */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <Label className="text-base font-semibold">📍 الزيارات المخططة</Label>
                                                <Button type="button" variant="outline" size="sm" onClick={addPlannedVisit}>
                                                    <Plus className="h-4 w-4 mr-1" /> إضافة
                                                </Button>
                                            </div>

                                            {formData.planned_visits.length === 0 && (
                                                <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                                                    لم يتم إضافة زيارات بعد
                                                </p>
                                            )}

                                            {formData.planned_visits.map((visit, idx) => (
                                                <div key={idx} className="p-3 bg-slate-50 rounded-lg border space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-slate-500">زيارة #{idx + 1}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-red-500"
                                                            onClick={() => removePlannedVisit(idx)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Select
                                                            value={visit.clinic_id}
                                                            onValueChange={(v) => updatePlannedVisit(idx, 'clinic_id', v)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="اختر العيادة" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {clinics.map(c => (
                                                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Input
                                                            type="date"
                                                            value={visit.scheduled_date?.split('T')[0] || ''}
                                                            onChange={(e) => updatePlannedVisit(idx, 'scheduled_date', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Select
                                                            value={visit.visit_reason}
                                                            onValueChange={(v) => updatePlannedVisit(idx, 'visit_reason', v)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="سبب الزيارة" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="follow_up">متابعة</SelectItem>
                                                                <SelectItem value="product_demo">عرض منتج</SelectItem>
                                                                <SelectItem value="place_order">طلب</SelectItem>
                                                                <SelectItem value="issue">حل مشكلة</SelectItem>
                                                                <SelectItem value="opening_clinic">افتتاح</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Select
                                                            value={visit.visit_type}
                                                            onValueChange={(v) => updatePlannedVisit(idx, 'visit_type', v)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="نوع الزيارة" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="regular">عادية</SelectItem>
                                                                <SelectItem value="demo">عينات</SelectItem>
                                                                <SelectItem value="order">طلب</SelectItem>
                                                                <SelectItem value="new_clinic">عيادة جديدة</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Recurring Visits */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <Label className="text-base font-semibold">🔄 الزيارات المتكررة</Label>
                                                <Button type="button" variant="outline" size="sm" onClick={addRecurringVisit}>
                                                    <Plus className="h-4 w-4 mr-1" /> إضافة
                                                </Button>
                                            </div>

                                            {formData.recurring_visits.length === 0 && (
                                                <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                                                    لم يتم إضافة زيارات متكررة
                                                </p>
                                            )}

                                            {formData.recurring_visits.map((rv, idx) => (
                                                <div key={idx} className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-blue-600">متكررة #{idx + 1}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-red-500"
                                                            onClick={() => removeRecurringVisit(idx)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Select
                                                            value={rv.clinic_id}
                                                            onValueChange={(v) => updateRecurringVisit(idx, 'clinic_id', v)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="اختر العيادة" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {clinics.map(c => (
                                                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Select
                                                            value={rv.recurrence_type}
                                                            onValueChange={(v) => updateRecurringVisit(idx, 'recurrence_type', v)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="daily">يومي</SelectItem>
                                                                <SelectItem value="weekly">أسبوعي</SelectItem>
                                                                <SelectItem value="monthly">شهري</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {rv.recurrence_type === 'weekly' && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((day, dayIdx) => (
                                                                <button
                                                                    key={day}
                                                                    type="button"
                                                                    className={`px-2 py-1 text-xs rounded ${rv.days_of_week?.includes(dayIdx)
                                                                            ? 'bg-blue-500 text-white'
                                                                            : 'bg-white border'
                                                                        }`}
                                                                    onClick={() => {
                                                                        const days = rv.days_of_week || [];
                                                                        const newDays = days.includes(dayIdx)
                                                                            ? days.filter(d => d !== dayIdx)
                                                                            : [...days, dayIdx];
                                                                        updateRecurringVisit(idx, 'days_of_week', newDays);
                                                                    }}
                                                                >
                                                                    {day}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* New Clinics */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <Label className="text-base font-semibold">🏥 عيادات جديدة للافتتاح</Label>
                                                <Button type="button" variant="outline" size="sm" onClick={addNewClinic}>
                                                    <Plus className="h-4 w-4 mr-1" /> إضافة
                                                </Button>
                                            </div>

                                            {formData.new_clinics.length === 0 && (
                                                <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                                                    لم يتم إضافة عيادات جديدة
                                                </p>
                                            )}

                                            {formData.new_clinics.map((nc, idx) => (
                                                <div key={idx} className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-green-600">عيادة جديدة #{idx + 1}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-red-500"
                                                            onClick={() => removeNewClinic(idx)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Input
                                                            placeholder="اسم العيادة"
                                                            value={nc.name}
                                                            onChange={(e) => updateNewClinic(idx, 'name', e.target.value)}
                                                        />
                                                        <Input
                                                            type="date"
                                                            value={nc.planned_date}
                                                            onChange={(e) => updateNewClinic(idx, 'planned_date', e.target.value)}
                                                        />
                                                    </div>
                                                    <Input
                                                        placeholder="العنوان"
                                                        value={nc.address}
                                                        onChange={(e) => updateNewClinic(idx, 'address', e.target.value)}
                                                    />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Input
                                                            placeholder="اسم الطبيب"
                                                            value={nc.doctor_name}
                                                            onChange={(e) => updateNewClinic(idx, 'doctor_name', e.target.value)}
                                                        />
                                                        <Input
                                                            placeholder="التخصص"
                                                            value={nc.specialty}
                                                            onChange={(e) => updateNewClinic(idx, 'specialty', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Notes */}
                                        <div>
                                            <Label>ملاحظات</Label>
                                            <Textarea
                                                placeholder="أي ملاحظات إضافية للخطة..."
                                                value={formData.notes}
                                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                rows={3}
                                            />
                                        </div>
                                    </div>

                                    <DialogFooter className="mt-4">
                                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                                            إلغاء
                                        </Button>
                                        <Button onClick={handleCreatePlan} disabled={loading}>
                                            {loading ? 'جاري الحفظ...' : 'حفظ الخطة'}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div>

                {/* Stats Summary */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="p-4 text-center">
                            <div className="text-3xl font-bold text-primary">{stats.total_plans}</div>
                            <div className="text-sm text-slate-500">إجمالي الخطط</div>
                        </Card>
                        <Card className="p-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{stats.total_planned_visits}</div>
                            <div className="text-sm text-slate-500">زيارات مخططة</div>
                        </Card>
                        <Card className="p-4 text-center">
                            <div className="text-3xl font-bold text-green-600">{stats.completed_visits}</div>
                            <div className="text-sm text-slate-500">مكتملة</div>
                        </Card>
                        <Card className="p-4 text-center">
                            <div className="text-3xl font-bold text-yellow-600">{stats.pending_visits}</div>
                            <div className="text-sm text-slate-500">معلقة</div>
                        </Card>
                        <Card className="p-4 text-center">
                            <div className="text-3xl font-bold text-purple-600">{stats.completion_rate}%</div>
                            <div className="text-sm text-slate-500">نسبة الإنجاز</div>
                        </Card>
                    </div>
                )}

                {/* Main Content */}
                {viewMode === 'calendar' ? (
                    renderCalendar()
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {plans.length === 0 ? (
                            <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed">
                                <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-slate-900">لا توجد خطط</h3>
                                <p className="text-slate-500">قم بإنشاء خطة جديدة للبدء</p>
                            </div>
                        ) : (
                            plans.map(renderPlanCard)
                        )}
                    </div>
                )}

                {/* Plan Details Dialog */}
                <Dialog open={showPlanDetailsDialog} onOpenChange={setShowPlanDetailsDialog}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                تفاصيل الخطة - {selectedPlan?.month}/{selectedPlan?.year}
                            </DialogTitle>
                        </DialogHeader>

                        {selectedPlan && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">المندوب: {selectedPlan.user_name}</span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedPlan.status)}`}>
                                        {getStatusLabel(selectedPlan.status)}
                                    </span>
                                </div>

                                {/* Planned Visits */}
                                {selectedPlan.planned_visits?.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2">📍 الزيارات المخططة ({selectedPlan.planned_visits.length})</h4>
                                        <div className="space-y-2">
                                            {selectedPlan.planned_visits.map((v, idx) => (
                                                <div key={idx} className={`p-2 rounded-lg flex justify-between items-center ${v.is_completed ? 'bg-green-50' : 'bg-slate-50'
                                                    }`}>
                                                    <div>
                                                        <span className="font-medium">{v.clinic_name || 'عيادة'}</span>
                                                        <span className="text-sm text-slate-500 mr-2">
                                                            {v.scheduled_date ? format(new Date(v.scheduled_date), 'dd/MM') : ''}
                                                        </span>
                                                    </div>
                                                    {v.is_completed ? (
                                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                                    ) : (
                                                        <Clock className="h-5 w-5 text-slate-400" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                {selectedPlan.notes && (
                                    <div className="bg-yellow-50 p-3 rounded-lg">
                                        <h4 className="font-semibold mb-1">📝 الملاحظات</h4>
                                        <p className="text-sm text-slate-600">{selectedPlan.notes}</p>
                                    </div>
                                )}

                                {/* Manager Notes */}
                                {selectedPlan.manager_notes && (
                                    <div className="bg-blue-50 p-3 rounded-lg">
                                        <h4 className="font-semibold mb-1">💬 ملاحظات المدير</h4>
                                        <p className="text-sm text-slate-600">{selectedPlan.manager_notes}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Approval Dialog */}
                <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>مراجعة الخطة</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div>
                                <Label>الإجراء</Label>
                                <Select value={approvalAction} onValueChange={setApprovalAction}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="approve">✅ موافقة</SelectItem>
                                        <SelectItem value="request_revision">📝 طلب تعديل</SelectItem>
                                        <SelectItem value="reject">❌ رفض</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>ملاحظات المدير</Label>
                                <Textarea
                                    value={managerNotes}
                                    onChange={(e) => setManagerNotes(e.target.value)}
                                    placeholder="أي ملاحظات للمندوب..."
                                    rows={3}
                                />
                            </div>

                            {approvalAction === 'reject' && (
                                <div>
                                    <Label>سبب الرفض</Label>
                                    <Input
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        placeholder="اذكر سبب الرفض..."
                                    />
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
                                إلغاء
                            </Button>
                            <Button onClick={handleApprovalAction} className={
                                approvalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                                    approvalAction === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                                        'bg-yellow-600 hover:bg-yellow-700'
                            }>
                                تأكيد
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default Plans;
