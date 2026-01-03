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
  Plus, ShoppingCart, Trash2, Edit, Gift, Package, FileDown,
  Copy, RefreshCw, MessageSquare, Clock, History, Search, Filter,
  TrendingUp, DollarSign, BarChart3, ChevronDown, ChevronUp, Send,
  CheckCircle, XCircle, Truck, PackageCheck, LayoutGrid, List
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { getHighAccuracyLocation } from '../utils/gps';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { exportOrdersToPDF, exportInvoicePDF } from '../utils/pdfExport';

const Orders = ({ user, onLogout }) => {
  const { t, formatCurrency } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClinic, setFilterClinic] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Timeline/History Dialog
  const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState(null);
  const [showTimelineDialog, setShowTimelineDialog] = useState(false);

  // Comments Dialog
  const [selectedOrderForComments, setSelectedOrderForComments] = useState(null);
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Order Detail Dialog
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [showOrderDetailDialog, setShowOrderDetailDialog] = useState(false);
  const [areas, setAreas] = useState([]);
  const [lines, setLines] = useState([]);
  const [siteSettings, setSiteSettings] = useState({});

  const [formData, setFormData] = useState({
    clinic_id: '',
    order_type: 'regular',
    products: [{ product_id: '', quantity: 1, price: 0 }],
    discount_type: '',
    discount_value: '',
    discount_reason: '',
    notes: '',
    // Payment fields - only for regular orders
    payment_status: 'unpaid',  // 'full', 'partial', 'unpaid'
    payment_method: '',        // 'bank_transfer', 'e_wallet', 'instapay', 'cash'
    amount_paid: '',
    // Installment scheduling fields - for partial/unpaid
    schedule_type: 'monthly',  // 'monthly', 'weekly', 'regular', 'custom'
    installments_count: 3,
    interval_days: 30,         // for 'regular' type
    first_due_date: '',
    grace_period_days: 3,
    custom_installments: [],   // for 'custom' type: [{amount, due_date}]
    receipt_url: '',            // Payment receipt image URL
  });
  const [loading, setLoading] = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchClinics();
    fetchProducts();
    fetchAnalytics();
    fetchAreas();
    fetchLines();
    fetchSiteSettings();
    if (user?.role !== 'medical_rep') {
      fetchUsers();
    }
  }, []);

  // Refetch orders when filters change
  useEffect(() => {
    fetchOrders();
  }, [filterStatus, filterClinic, filterStartDate, filterEndDate]);

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);
      if (filterClinic && filterClinic !== 'all') params.append('clinic_id', filterClinic);
      if (filterStartDate) params.append('start_date', `${filterStartDate}T00:00:00`);
      if (filterEndDate) params.append('end_date', `${filterEndDate}T23:59:59`);
      if (searchQuery) params.append('search', searchQuery);

      const response = await api.get(`/orders?${params.toString()}`);
      setOrders(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load orders');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/orders/analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics');
    }
  };

  const fetchClinics = async () => {
    try {
      const response = await api.get('/clinics');
      setClinics(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load clinics');
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load products');
    }
  };

  const fetchAreas = async () => {
    try {
      const response = await api.get('/areas');
      setAreas(response.data);
    } catch (error) {
      console.error('Failed to load areas');
    }
  };

  const fetchLines = async () => {
    try {
      const response = await api.get('/lines');
      setLines(response.data);
    } catch (error) {
      console.error('Failed to load lines');
    }
  };

  const fetchSiteSettings = async () => {
    try {
      const response = await api.get('/site-settings');
      setSiteSettings(response.data || {});
    } catch (error) {
      console.error('Failed to load site settings');
    }
  };

  // Get helper functions
  const getAreaName = (areaId) => {
    const area = areas.find(a => a.id === areaId);
    return area?.name || 'N/A';
  };

  const getLineName = (lineId) => {
    const line = lines.find(l => l.id === lineId);
    return line?.name || 'N/A';
  };

  // Open order detail dialog
  const openOrderDetails = (order) => {
    setSelectedOrderDetails(order);
    setShowOrderDetailDialog(true);
  };

  // View mode for orders (list or card)
  const [viewMode, setViewMode] = useState('card');

  // Status styling helper
  const getStatusStyle = (status) => {
    const styles = {
      'draft': 'bg-slate-100 text-slate-700',
      'pending_approval': 'bg-yellow-100 text-yellow-700',
      'approved': 'bg-green-100 text-green-700',
      'rejected': 'bg-red-100 text-red-700',
      'processing': 'bg-blue-100 text-blue-700',
      'shipped': 'bg-indigo-100 text-indigo-700',
      'delivered': 'bg-teal-100 text-teal-700',
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
  };

  // Format status for display
  const formatStatus = (status) => {
    const labels = {
      'draft': t('draft'),
      'pending_approval': t('pendingApproval'),
      'approved': t('approved'),
      'rejected': t('rejected'),
      'processing': t('processing'),
      'shipped': t('shipped'),
      'delivered': t('delivered'),
    };
    return labels[status] || status;
  };

  const resetForm = () => {
    setFormData({
      clinic_id: '',
      order_type: 'regular',
      products: [{ product_id: '', quantity: 1, price: 0 }],
      discount_type: '',
      discount_value: '',
      discount_reason: '',
      notes: '',
      payment_status: 'unpaid',
      payment_method: '',
      amount_paid: '',
      schedule_type: 'monthly',
      installments_count: 3,
      interval_days: 30,
      first_due_date: '',
      grace_period_days: 3,
      custom_installments: [],
      receipt_url: '',
    });
    setEditingOrder(null);
  };

  // Handle receipt upload
  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('نوع الملف غير مسموح. يُسمح بالصور و PDF فقط.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى 10MB.');
      return;
    }

    setReceiptUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const response = await api.post('/upload-receipt', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setFormData(prev => ({ ...prev, receipt_url: response.data.url }));
      toast.success('تم رفع إيصال الدفع بنجاح');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في رفع الإيصال');
    } finally {
      setReceiptUploading(false);
    }
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    setFormData({
      clinic_id: order.clinic_id,
      order_type: order.order_type || 'regular',
      products: order.products?.map(p => ({
        product_id: p.product_id || p.id,
        quantity: p.quantity,
        price: p.price
      })) || [{ product_id: '', quantity: 1, price: 0 }],
      discount_type: order.discount_type || '',
      discount_value: order.discount_value?.toString() || '',
      discount_reason: order.discount_reason || '',
      notes: order.notes || '',
    });
    setShowDialog(true);
  };

  const handleDeleteClick = (order) => {
    setOrderToDelete(order);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!orderToDelete) return;

    try {
      await api.delete(`/orders/${orderToDelete.id}`);
      toast.success('Order deleted successfully');
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
      fetchOrders();
    } catch (error) {
      toast.error('Failed to delete order');
    }
  };

  // Handle Duplicate Order
  const handleDuplicate = async (order) => {
    try {
      const response = await api.post(`/orders/${order.id}/duplicate`);
      toast.success('تم نسخ الطلب بنجاح');
      fetchOrders();
      fetchAnalytics();
    } catch (error) {
      toast.error('Failed to duplicate order');
    }
  };

  // Handle Reorder
  const handleReorder = async (order) => {
    try {
      const response = await api.post(`/orders/${order.id}/reorder`);
      toast.success('تم إنشاء طلب جديد');
      fetchOrders();
      fetchAnalytics();
    } catch (error) {
      toast.error('Failed to reorder');
    }
  };

  // Handle Add Comment
  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedOrderForComments) return;

    setCommentLoading(true);
    try {
      await api.post(`/orders/${selectedOrderForComments.id}/comments`, {
        content: newComment
      });
      toast.success('تم إضافة التعليق');
      setNewComment('');
      // Refresh order data
      const response = await api.get(`/orders/${selectedOrderForComments.id}`);
      setSelectedOrderForComments(response.data);
      fetchOrders();
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setCommentLoading(false);
    }
  };

  // Clear Filters
  const handleClearFilters = () => {
    setFilterStatus('');
    setFilterClinic('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearchQuery('');
  };

  // Search handler
  const handleSearch = () => {
    fetchOrders();
  };

  // Get user name helper
  const getUserName = (userId) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.full_name || 'Unknown';
  };

  // Get clinic name helper
  const getClinicName = (clinicId) => {
    const clinic = clinics.find(c => c.id === clinicId);
    return clinic?.name || 'Unknown';
  };

  const addProduct = () => {
    if (formData.order_type === 'demo' && formData.products.length >= 6) {
      toast.error('Demo orders can have maximum 6 products');
      return;
    }
    setFormData({
      ...formData,
      products: [...formData.products, { product_id: '', quantity: 1, price: 0 }],
    });
  };

  const removeProduct = (index) => {
    setFormData({
      ...formData,
      products: formData.products.filter((_, i) => i !== index),
    });
  };

  const updateProduct = (index, field, value) => {
    const updatedProducts = formData.products.map((product, i) => {
      if (i === index) {
        if (field === 'product_id') {
          const selectedProduct = products.find(p => p.id === value);
          return {
            ...product,
            product_id: value,
            price: selectedProduct?.price || 0,
            name: selectedProduct?.name || ''
          };
        }
        return { ...product, [field]: value };
      }
      return product;
    });
    setFormData({ ...formData, products: updatedProducts });
  };

  const calculateSubtotal = () => {
    return formData.products.reduce(
      (sum, product) => sum + (product.quantity || 0) * (product.price || 0),
      0
    );
  };

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (!formData.discount_type || !formData.discount_value) return 0;

    if (formData.discount_type === 'percentage') {
      return subtotal * (parseFloat(formData.discount_value) / 100);
    }
    return parseFloat(formData.discount_value);
  };

  const calculateTotal = () => {
    if (formData.order_type === 'demo') return 0;
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    return Math.max(0, subtotal - discount);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation for demo orders
    if (formData.order_type === 'demo') {
      if (formData.products.length > 6) {
        toast.error('Demo orders cannot have more than 6 products');
        setLoading(false);
        return;
      }
      const invalidQuantity = formData.products.some(p => p.quantity > 1);
      if (invalidQuantity) {
        toast.error('Demo orders can only have 1 quantity per product');
        setLoading(false);
        return;
      }
    }

    // Validation for regular order payment
    if (formData.order_type === 'regular') {
      if ((formData.payment_status === 'full' || formData.payment_status === 'partial') && !formData.payment_method) {
        toast.error('يجب اختيار طريقة الدفع');
        setLoading(false);
        return;
      }
      if (formData.payment_status === 'partial') {
        const amountPaid = parseFloat(formData.amount_paid || 0);
        const total = calculateTotal();
        if (amountPaid <= 0) {
          toast.error('يجب إدخال المبلغ المدفوع للدفع الجزئي');
          setLoading(false);
          return;
        }
        if (amountPaid >= total) {
          toast.error('المبلغ المدفوع يجب أن يكون أقل من إجمالي الطلب');
          setLoading(false);
          return;
        }
      }
    }

    // Silent high-accuracy GPS capture in background
    let latitude = null;
    let longitude = null;
    try {
      const location = await getHighAccuracyLocation({
        targetAccuracy: 10,
        maxAttempts: 3
      });
      latitude = location.latitude;
      longitude = location.longitude;
    } catch {
      // Silent fail - continue without location
    }

    const orderData = {
      clinic_id: formData.clinic_id,
      order_type: formData.order_type,
      products: formData.products.map(p => ({
        product_id: p.product_id,
        name: products.find(prod => prod.id === p.product_id)?.name || '',
        quantity: parseInt(p.quantity),
        price: parseFloat(p.price)
      })),
      discount_type: formData.discount_type || null,
      discount_value: formData.discount_value ? parseFloat(formData.discount_value) : null,
      discount_reason: formData.discount_reason || null,
      notes: formData.notes,
      latitude,
      longitude,
      // Payment fields - only meaningful for regular orders
      payment_status: formData.order_type === 'regular' ? formData.payment_status : 'unpaid',
      payment_method: (formData.order_type === 'regular' && formData.payment_status !== 'unpaid') ? formData.payment_method : null,
      amount_paid: formData.order_type === 'regular' && formData.payment_status === 'partial' ? parseFloat(formData.amount_paid || 0) : null,
      // Installment scheduling fields - for partial/unpaid
      schedule_type: (formData.payment_status === 'partial' || formData.payment_status === 'unpaid') ? formData.schedule_type : null,
      installments_count: (formData.payment_status === 'partial' || formData.payment_status === 'unpaid') ? formData.installments_count : null,
      interval_days: formData.schedule_type === 'regular' ? formData.interval_days : null,
      first_due_date: (formData.payment_status === 'partial' || formData.payment_status === 'unpaid') ? formData.first_due_date : null,
      grace_period_days: (formData.payment_status === 'partial' || formData.payment_status === 'unpaid') ? formData.grace_period_days : null,
      // Receipt URL - for payment proof
      receipt_url: (formData.order_type === 'regular' && formData.payment_status !== 'unpaid') ? formData.receipt_url : null,
    };

    try {
      if (editingOrder) {
        await api.put(`/orders/${editingOrder.id}`, orderData);
        toast.success('Order updated successfully');
      } else {
        await api.post('/orders', orderData);
        toast.success('Order created successfully - Pending approval');
      }
      setShowDialog(false);
      resetForm();
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || (editingOrder ? 'Failed to update order' : 'Failed to create order'));
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClose = (open) => {
    setShowDialog(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('orders')}</h1>
            <p className="text-slate-600 mt-1">{t('manageOrders')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={showAnalytics ? 'bg-primary/10' : ''}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              {t('analytics')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-primary/10' : ''}
            >
              <Filter className="h-4 w-4 mr-1" />
              {t('filters')}
            </Button>
            {/* View Toggle */}
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="rounded-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const enrichedOrders = orders.map(o => ({
                  ...o,
                  clinic_name: clinics.find(c => c.id === o.clinic_id)?.name
                }));
                exportOrdersToPDF(enrichedOrders);
                toast.success('تم تصدير التقرير بنجاح');
              }}
              className="border-primary text-primary hover:bg-primary/10"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            {user?.role !== 'manager' && (
              <Dialog open={showDialog} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Order
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingOrder ? 'Edit Order' : 'Create Order'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="clinic">Clinic *</Label>
                        <Select
                          value={formData.clinic_id}
                          onValueChange={(value) => setFormData({ ...formData, clinic_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select clinic" />
                          </SelectTrigger>
                          <SelectContent>
                            {clinics.map((clinic) => (
                              <SelectItem key={clinic.id} value={clinic.id}>
                                {clinic.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="order_type">Order Type *</Label>
                        <Select
                          value={formData.order_type}
                          onValueChange={(value) => {
                            setFormData({ ...formData, order_type: value });
                            if (value === 'demo') {
                              setFormData(prev => ({
                                ...prev,
                                order_type: value,
                                products: prev.products.map(p => ({ ...p, quantity: 1 })).slice(0, 6),
                                discount_type: '',
                                discount_value: '',
                              }));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">📦 Regular Order</SelectItem>
                            <SelectItem value="demo">🎁 Demo (Free Samples)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formData.order_type === 'demo' && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                        ℹ️ Demo orders: Maximum 6 products, 1 quantity each, Free of charge
                      </div>
                    )}

                    {/* Payment Section - Only for Regular Orders */}
                    {formData.order_type === 'regular' && (
                      <div className="space-y-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>💳</span> حالة الدفع
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Payment Status */}
                          <div>
                            <Label>حالة الدفع *</Label>
                            <Select
                              value={formData.payment_status}
                              onValueChange={(value) => {
                                setFormData({
                                  ...formData,
                                  payment_status: value,
                                  payment_method: value === 'unpaid' ? '' : formData.payment_method,
                                  amount_paid: value === 'full' ? '' : (value === 'unpaid' ? '' : formData.amount_paid)
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="اختر حالة الدفع" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">💰 دفع كلي (مدفوعة بالكامل)</SelectItem>
                                <SelectItem value="partial">📊 دفع جزئي</SelectItem>
                                <SelectItem value="unpaid">⏳ غير مدفوعة (آجل)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Payment Method - Shows for full or partial */}
                          {(formData.payment_status === 'full' || formData.payment_status === 'partial') && (
                            <div>
                              <Label>طريقة الدفع *</Label>
                              <Select
                                value={formData.payment_method}
                                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="اختر طريقة الدفع" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bank_transfer">🏦 تحويل بنكي</SelectItem>
                                  <SelectItem value="e_wallet">📱 محفظة الكترونية</SelectItem>
                                  <SelectItem value="instapay">⚡ انستاباي</SelectItem>
                                  <SelectItem value="cash">💵 تحصيل كاش</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Receipt Upload - Show for full or partial payment */}
                        {(formData.payment_status === 'full' || formData.payment_status === 'partial') && (
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              📷 إرفاق إيصال الدفع (اختياري)
                            </Label>

                            {!formData.receipt_url ? (
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={handleReceiptUpload}
                                  disabled={receiptUploading}
                                  className="hidden"
                                  id="receipt-upload"
                                />
                                <label
                                  htmlFor="receipt-upload"
                                  className={`flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all ${receiptUploading
                                    ? 'border-gray-300 bg-gray-50'
                                    : 'border-primary/40 hover:border-primary hover:bg-primary/5'
                                    }`}
                                >
                                  {receiptUploading ? (
                                    <>
                                      <RefreshCw className="h-5 w-5 animate-spin text-gray-500" />
                                      <span className="text-gray-500">جاري الرفع...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Package className="h-6 w-6 text-primary" />
                                      <div className="text-center">
                                        <p className="font-medium text-slate-700">اضغط لرفع صورة الإيصال</p>
                                        <p className="text-xs text-slate-500">إيداع / تحويل / شيك (صور أو PDF - حد أقصى 10MB)</p>
                                      </div>
                                    </>
                                  )}
                                </label>
                              </div>
                            ) : (
                              <div className="relative p-3 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-green-300 bg-white flex-shrink-0">
                                    {formData.receipt_url.includes('.pdf') ? (
                                      <div className="w-full h-full flex items-center justify-center bg-red-50">
                                        <span className="text-2xl">📄</span>
                                      </div>
                                    ) : (
                                      <img
                                        src={formData.receipt_url}
                                        alt="Receipt"
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium text-green-800 flex items-center gap-2">
                                      <CheckCircle className="h-4 w-4" />
                                      تم رفع الإيصال
                                    </p>
                                    <a
                                      href={formData.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline"
                                    >
                                      عرض الإيصال
                                    </a>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, receipt_url: '' })}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Amount Paid - Only for partial payment */}
                        {formData.payment_status === 'partial' && (
                          <div>
                            <Label>المبلغ المدفوع *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={calculateTotal()}
                              value={formData.amount_paid}
                              onChange={(e) => setFormData({ ...formData, amount_paid: e.target.value })}
                              placeholder="أدخل المبلغ المدفوع"
                              className="text-right"
                            />
                            {formData.amount_paid && parseFloat(formData.amount_paid) > 0 && (
                              <p className="text-sm text-orange-600 mt-1">
                                💡 الباقي كدين: {formatCurrency(calculateTotal() - parseFloat(formData.amount_paid || 0))}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Payment Info Summary */}
                        {formData.payment_status === 'full' && (
                          <div className="p-2 bg-green-100 rounded-lg text-sm text-green-700">
                            ✅ سيتم تسجيل الفاتورة كـ "مدفوعة بالكامل" في قسم الحسابات
                          </div>
                        )}
                        {formData.payment_status === 'partial' && formData.amount_paid && (
                          <div className="p-2 bg-yellow-100 rounded-lg text-sm text-yellow-700">
                            ⚠️ سيتم تسجيل {formatCurrency(parseFloat(formData.amount_paid || 0))} كمدفوع والباقي كدين
                          </div>
                        )}
                        {formData.payment_status === 'unpaid' && (
                          <div className="p-2 bg-orange-100 rounded-lg text-sm text-orange-700">
                            📋 سيتم تسجيل الفاتورة كـ "غير مدفوعة" في قسم الديون
                          </div>
                        )}

                        {/* Installment Scheduling Section - for partial/unpaid */}
                        {(formData.payment_status === 'partial' || formData.payment_status === 'unpaid') && (
                          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
                            <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                              <span>📅</span> جدولة الأقساط
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Schedule Type */}
                              <div>
                                <Label>نوع الجدولة *</Label>
                                <Select
                                  value={formData.schedule_type}
                                  onValueChange={(value) => setFormData({ ...formData, schedule_type: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="اختر نوع الجدولة" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="monthly">📆 دفعات شهرية</SelectItem>
                                    <SelectItem value="weekly">📅 دفعات أسبوعية</SelectItem>
                                    <SelectItem value="regular">⏱️ دفعات منتظمة (كل X يوم)</SelectItem>
                                    <SelectItem value="custom">✏️ دفعات غير منتظمة (يدوي)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Installments Count */}
                              <div>
                                <Label>عدد الأقساط *</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="24"
                                  value={formData.installments_count}
                                  onChange={(e) => setFormData({ ...formData, installments_count: parseInt(e.target.value) || 1 })}
                                />
                              </div>

                              {/* Interval Days - for regular type */}
                              {formData.schedule_type === 'regular' && (
                                <div>
                                  <Label>كل كم يوم</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={formData.interval_days}
                                    onChange={(e) => setFormData({ ...formData, interval_days: parseInt(e.target.value) || 30 })}
                                  />
                                </div>
                              )}

                              {/* First Due Date */}
                              <div>
                                <Label>تاريخ أول قسط *</Label>
                                <Input
                                  type="date"
                                  value={formData.first_due_date}
                                  onChange={(e) => setFormData({ ...formData, first_due_date: e.target.value })}
                                  min={new Date().toISOString().split('T')[0]}
                                />
                              </div>

                              {/* Grace Period */}
                              <div>
                                <Label>فترة السماح (أيام)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="30"
                                  value={formData.grace_period_days}
                                  onChange={(e) => setFormData({ ...formData, grace_period_days: parseInt(e.target.value) || 0 })}
                                />
                                <p className="text-xs text-slate-500 mt-1">أيام إضافية قبل اعتبار القسط متأخر</p>
                              </div>
                            </div>

                            {/* Calculated Installments Preview */}
                            {formData.first_due_date && formData.installments_count > 0 && (
                              <div className="mt-3">
                                <Label className="mb-2 block">جدول الأقساط المحسوب:</Label>
                                <div className="bg-white rounded-lg border overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="px-3 py-2 text-right">القسط</th>
                                        <th className="px-3 py-2 text-right">المبلغ</th>
                                        <th className="px-3 py-2 text-right">تاريخ الاستحقاق</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const total = formData.payment_status === 'partial'
                                          ? calculateTotal() - parseFloat(formData.amount_paid || 0)
                                          : calculateTotal();
                                        const count = formData.installments_count || 1;
                                        const amountPerInstallment = total / count;
                                        const firstDate = new Date(formData.first_due_date);

                                        return Array.from({ length: count }, (_, i) => {
                                          let dueDate = new Date(firstDate);
                                          if (formData.schedule_type === 'monthly') {
                                            dueDate.setMonth(dueDate.getMonth() + i);
                                          } else if (formData.schedule_type === 'weekly') {
                                            dueDate.setDate(dueDate.getDate() + (i * 7));
                                          } else {
                                            dueDate.setDate(dueDate.getDate() + (i * (formData.interval_days || 30)));
                                          }

                                          return (
                                            <tr key={i} className="border-t">
                                              <td className="px-3 py-2">{i + 1}</td>
                                              <td className="px-3 py-2">{formatCurrency(amountPerInstallment)}</td>
                                              <td className="px-3 py-2">{dueDate.toLocaleDateString('ar-EG')}</td>
                                            </tr>
                                          );
                                        });
                                      })()}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-semibold">
                                      <tr>
                                        <td className="px-3 py-2">الإجمالي</td>
                                        <td className="px-3 py-2" colSpan="2">
                                          {formatCurrency(formData.payment_status === 'partial'
                                            ? calculateTotal() - parseFloat(formData.amount_paid || 0)
                                            : calculateTotal()
                                          )}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Products *</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addProduct}
                          className="rounded-full"
                          disabled={formData.order_type === 'demo' && formData.products.length >= 6}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Product
                        </Button>
                      </div>
                      {formData.products.map((product, index) => (
                        <div key={index} className="flex gap-2 items-start p-3 border border-slate-200 rounded-lg bg-slate-50">
                          <div className="flex-1 space-y-2">
                            <Select
                              value={product.product_id}
                              onValueChange={(value) => updateProduct(index, 'product_id', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} - {formatCurrency(p.price)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max={formData.order_type === 'demo' ? 1 : undefined}
                                  value={product.quantity}
                                  onChange={(e) =>
                                    updateProduct(index, 'quantity', parseInt(e.target.value) || 1)
                                  }
                                  required
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Price</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={product.price}
                                  readOnly
                                  className="bg-slate-100"
                                />
                              </div>
                            </div>
                            <div className="text-sm font-medium text-slate-700">
                              Subtotal: {formatCurrency((product.quantity || 0) * (product.price || 0))}
                            </div>
                          </div>
                          {formData.products.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeProduct(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {formData.order_type !== 'demo' && (
                      <div className="space-y-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>💰</span> Discount (Optional)
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Discount Type</Label>
                            <Select
                              value={formData.discount_type}
                              onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                <SelectItem value="fixed">Fixed Amount ({formatCurrency(0).replace(/[0-9.,]/g, '').trim()})</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Discount Value</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.discount_value}
                              onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        {formData.discount_type && formData.discount_value && (
                          <div>
                            <Label>Discount Reason</Label>
                            <Input
                              value={formData.discount_reason}
                              onChange={(e) => setFormData({ ...formData, discount_reason: e.target.value })}
                              placeholder="Why is this discount being applied?"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4 bg-slate-100 rounded-lg space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Subtotal:</span>
                        <span className="font-medium text-slate-900">{formatCurrency(calculateSubtotal())}</span>
                      </div>
                      {formData.discount_type && formData.discount_value && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-600">Discount:</span>
                          <span className="font-medium text-orange-600">-{formatCurrency(calculateDiscount())}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-300">
                        <span className="font-semibold text-slate-900">Total Amount:</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatCurrency(calculateTotal())}
                          {formData.order_type === 'demo' && <span className="text-sm text-green-600 ml-2">(FREE)</span>}
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Add any notes..."
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 rounded-full"
                      disabled={loading || !formData.clinic_id || formData.products.some(p => !p.product_id)}
                    >
                      {loading ? (editingOrder ? 'Updating...' : 'Creating...') : (editingOrder ? 'Update Order' : 'Create Order')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Analytics Dashboard */}
        {showAnalytics && analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Total Orders</p>
                  <p className="text-xl font-bold text-blue-900">{analytics.total_orders}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Total Revenue</p>
                  <p className="text-xl font-bold text-green-900">{formatCurrency(analytics.total_revenue)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-purple-600 font-medium">Today</p>
                  <p className="text-xl font-bold text-purple-900">{analytics.today?.count || 0}</p>
                  <p className="text-xs text-purple-500">{formatCurrency(analytics.today?.revenue || 0)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-orange-600 font-medium">This Week</p>
                  <p className="text-xl font-bold text-orange-900">{analytics.this_week?.count || 0}</p>
                  <p className="text-xs text-orange-500">{formatCurrency(analytics.this_week?.revenue || 0)}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Status Summary */}
        {showAnalytics && analytics?.by_status && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.by_status).map(([status, count]) => (
              <Button
                key={status}
                variant="outline"
                size="sm"
                className={`${filterStatus === status ? 'bg-primary text-white' : ''}`}
                onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
              >
                {status === 'pending_approval' && <Clock className="h-3 w-3 mr-1 text-yellow-500" />}
                {status === 'approved' && <CheckCircle className="h-3 w-3 mr-1 text-green-500" />}
                {status === 'rejected' && <XCircle className="h-3 w-3 mr-1 text-red-500" />}
                {status === 'processing' && <RefreshCw className="h-3 w-3 mr-1 text-blue-500" />}
                {status === 'shipped' && <Truck className="h-3 w-3 mr-1 text-indigo-500" />}
                {status === 'delivered' && <PackageCheck className="h-3 w-3 mr-1 text-teal-500" />}
                {status.replace(/_/g, ' ')} ({count})
              </Button>
            ))}
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && (
          <Card className="p-4 bg-slate-50 border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              {/* Search */}
              <div className="md:col-span-2">
                <Label className="text-xs">Search</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by product name or order ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button size="icon" onClick={handleSearch}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clinic Filter */}
              <div>
                <Label className="text-xs">Clinic</Label>
                <Select value={filterClinic} onValueChange={setFilterClinic}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Clinics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics</SelectItem>
                    {clinics.map(clinic => (
                      <SelectItem key={clinic.id} value={clinic.id}>{clinic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters */}
              <div>
                <Button variant="ghost" onClick={handleClearFilters} className="w-full">
                  Clear Filters
                </Button>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div>
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Orders Display */}
        <div className="space-y-4">
          {orders.length === 0 ? (
            <Card className="p-12 text-center border border-slate-200 rounded-xl">
              <ShoppingCart className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No orders yet</p>
              <p className="text-slate-400 text-sm mt-2">Create your first order</p>
            </Card>
          ) : viewMode === 'list' ? (
            /* List/Table View */
            <Card className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Clinic</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {orders.map((order) => {
                      const clinic = clinics.find((c) => c.id === order.clinic_id);
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => openOrderDetails(order)}
                        >
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-slate-800 text-white text-xs font-bold rounded">
                              #{order.serial_number || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">{clinic?.name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {order.order_date && format(new Date(order.order_date), 'PP')}
                          </td>
                          <td className="px-4 py-3">
                            {order.order_type === 'demo' ? (
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">Demo</span>
                            ) : (
                              <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">Regular</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusStyle(order.status)}`}>
                              {formatStatus(order.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(order.total_amount)}
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openOrderDetails(order)}>
                                <Package className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const c = clinics.find(cl => cl.id === order.clinic_id);
                                  await exportInvoicePDF(order, c, siteSettings);
                                  toast.success('تم تحميل الفاتورة');
                                }}
                                title="Download Invoice"
                              >
                                <FileDown className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDuplicate(order)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* Card View */
            orders.map((order) => {
              const clinic = clinics.find((c) => c.id === order.clinic_id);
              const canEdit = (user?.role === 'medical_rep' || user?.role === 'gm' || user?.role === 'super_admin') &&
                (order.status === 'draft' || order.status === 'rejected');

              return (
                <Card
                  key={order.id}
                  className={`p-6 border rounded-xl shadow-sm hover:shadow-md transition-shadow ${order.is_deleted ? 'border-red-200 bg-red-50' : 'border-slate-200'
                    }`}
                >
                  {/* Header Row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {order.order_type === 'demo' ? (
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <Gift className="h-5 w-5 text-purple-600" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                            <Package className="h-5 w-5 text-teal-600" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            {/* Serial Number Badge */}
                            <span className="inline-flex items-center px-2 py-0.5 bg-slate-800 text-white text-xs font-bold rounded">
                              #{order.serial_number || 'N/A'}
                            </span>
                            <h3
                              className="text-lg font-semibold text-slate-900 hover:text-primary cursor-pointer"
                              onClick={() => openOrderDetails(order)}
                            >
                              {clinic?.name || 'Unknown Clinic'}
                            </h3>
                          </div>
                          <p className="text-sm text-slate-500">
                            {order.order_date && format(new Date(order.order_date), 'PPp')}
                          </p>
                        </div>
                      </div>
                      {order.order_type === 'demo' && (
                        <span className="inline-block mt-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                          🎁 Demo Order (Free)
                        </span>
                      )}
                    </div>

                    {/* Amount & Status */}
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-900">
                        {formatCurrency(order.total_amount)}
                      </p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${getStatusStyle(order.status)}`}>
                        {formatStatus(order.status)}
                      </span>
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="bg-slate-50 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Products</p>
                    <div className="space-y-2">
                      {order.products?.map((product, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center py-2 px-3 bg-white rounded-lg border border-slate-100"
                        >
                          <span className="font-medium text-slate-800">{product.name || `Product ${index + 1}`}</span>
                          <div className="text-right">
                            <span className="text-slate-600">
                              {product.quantity} × {formatCurrency(product.price)}
                            </span>
                            <span className="ml-3 font-semibold text-slate-900">
                              {formatCurrency(product.quantity * product.price)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Discount */}
                  {order.discount_value && order.discount_value > 0 && (
                    <div className="mb-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-orange-700 font-medium">
                          Discount Applied
                        </span>
                        <span className="text-orange-700 font-semibold">
                          {order.discount_type === 'percentage' ? `${order.discount_value}%` : formatCurrency(order.discount_value)}
                        </span>
                      </div>
                      {order.discount_reason && (
                        <p className="text-sm text-orange-600 mt-1">{order.discount_reason}</p>
                      )}
                    </div>
                  )}

                  {/* Rejection Reason */}
                  {order.rejection_reason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
                      <span className="font-medium">Rejection Reason:</span> {order.rejection_reason}
                    </div>
                  )}

                  {/* Notes */}
                  {order.notes && (
                    <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Notes:</span> {order.notes}
                    </div>
                  )}

                  {/* Action Buttons - Always visible */}
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
                    {/* Timeline Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedOrderForTimeline(order);
                        setShowTimelineDialog(true);
                      }}
                      className="flex items-center gap-1"
                    >
                      <History className="h-4 w-4" />
                      Timeline
                    </Button>

                    {/* Comments Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedOrderForComments(order);
                        setShowCommentsDialog(true);
                      }}
                      className="flex items-center gap-1"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Comments {order.comments?.length > 0 && `(${order.comments.length})`}
                    </Button>

                    {/* Download Invoice PDF Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await exportInvoicePDF(order, clinic, siteSettings);
                        toast.success('تم تحميل الفاتورة');
                      }}
                      className="flex items-center gap-1 text-primary hover:text-primary/80"
                    >
                      <FileDown className="h-4 w-4" />
                      Download Invoice
                    </Button>

                    {/* Duplicate Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(order)}
                      className="flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>

                    {/* Reorder Button - for delivered orders */}
                    {order.status === 'delivered' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReorder(order)}
                        className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Order Again
                      </Button>
                    )}

                    {/* Edit Button - only for draft/rejected */}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(order)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    )}

                    {/* Delete Button - only for draft/rejected */}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(order)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Timeline Dialog */}
      <Dialog open={showTimelineDialog} onOpenChange={setShowTimelineDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Order Timeline
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {selectedOrderForTimeline?.history?.length > 0 ? (
              selectedOrderForTimeline.history.map((event, index) => (
                <div key={index} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm">
                      {event.action === 'created' && 'Order Created'}
                      {event.action === 'submitted' && 'Submitted for Approval'}
                      {event.action === 'approved' && 'Order Approved'}
                      {event.action === 'rejected' && 'Order Rejected'}
                      {event.action === 'status_changed' && `Status: ${event.old_status} → ${event.new_status}`}
                      {event.action === 'duplicated' && 'Order Duplicated'}
                      {event.action === 'reordered' && 'Order Reordered'}
                      {event.action === 'updated' && 'Order Updated'}
                    </p>
                    <p className="text-xs text-slate-500">
                      By {event.user_name} • {event.timestamp && format(new Date(event.timestamp), 'PPp')}
                    </p>
                    {event.details && (
                      <p className="text-xs text-slate-600 mt-1">{event.details}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                <History className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No timeline history yet</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Order Comments
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Comments List */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {selectedOrderForComments?.comments?.length > 0 ? (
                selectedOrderForComments.comments.map((comment, index) => (
                  <div key={index} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-slate-900">{comment.user_name}</span>
                      <span className="text-xs text-slate-500">
                        {comment.created_at && format(new Date(comment.created_at), 'PPp')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{comment.content}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-slate-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No comments yet</p>
                </div>
              )}
            </div>

            {/* Add Comment Input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="resize-none"
                rows={2}
              />
            </div>
            <Button
              onClick={handleAddComment}
              disabled={commentLoading || !newComment.trim()}
              className="w-full"
            >
              {commentLoading ? 'Adding...' : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Add Comment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={showOrderDetailDialog} onOpenChange={setShowOrderDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Package className="h-6 w-6" />
              Order Details
              {selectedOrderDetails?.serial_number && (
                <span className="px-2 py-1 bg-slate-800 text-white text-sm font-bold rounded">
                  #{selectedOrderDetails.serial_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedOrderDetails && (
            <div className="space-y-6">
              {/* Order Info Grid */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Order ID</p>
                  <p className="font-medium text-slate-900">#{selectedOrderDetails.serial_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusStyle(selectedOrderDetails.status)}`}>
                    {formatStatus(selectedOrderDetails.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Order Date</p>
                  <p className="font-medium text-slate-900">
                    {selectedOrderDetails.order_date && format(new Date(selectedOrderDetails.order_date), 'PPPp')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Order Type</p>
                  <p className="font-medium text-slate-900 capitalize">{selectedOrderDetails.order_type}</p>
                </div>
              </div>

              {/* Creator & Location Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase">Created By</p>
                  <p className="font-medium text-slate-900">{getUserName(selectedOrderDetails.medical_rep_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase">Clinic</p>
                  <p className="font-medium text-slate-900">{getClinicName(selectedOrderDetails.clinic_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase">Area</p>
                  <p className="font-medium text-slate-900">
                    {(() => {
                      const clinic = clinics.find(c => c.id === selectedOrderDetails.clinic_id);
                      return clinic ? getAreaName(clinic.area_id) : 'N/A';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase">Line</p>
                  <p className="font-medium text-slate-900">
                    {(() => {
                      const clinic = clinics.find(c => c.id === selectedOrderDetails.clinic_id);
                      return clinic ? getLineName(clinic.line_id) : 'N/A';
                    })()}
                  </p>
                </div>
              </div>

              {/* Products */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Products</h4>
                <div className="space-y-2">
                  {selectedOrderDetails.products?.map((product, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="font-medium">{product.name || `Product ${index + 1}`}</span>
                      <div className="text-right">
                        <span className="text-slate-600">{product.quantity} × {formatCurrency(product.price)}</span>
                        <span className="ml-3 font-bold">{formatCurrency(product.quantity * product.price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(selectedOrderDetails.subtotal)}</span>
                </div>
                {selectedOrderDetails.discount_value && (
                  <div className="flex justify-between mb-2 text-orange-600">
                    <span>Discount ({selectedOrderDetails.discount_type})</span>
                    <span>-{selectedOrderDetails.discount_type === 'percentage'
                      ? `${selectedOrderDetails.discount_value}%`
                      : formatCurrency(selectedOrderDetails.discount_value)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-green-200">
                  <span>Total</span>
                  <span className="text-green-700">{formatCurrency(selectedOrderDetails.total_amount)}</span>
                </div>
              </div>

              {/* Notes */}
              {selectedOrderDetails.notes && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 font-medium uppercase mb-1">Notes</p>
                  <p className="text-slate-700">{selectedOrderDetails.notes}</p>
                </div>
              )}

              {/* Approval Info */}
              {selectedOrderDetails.approved_by && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600 font-medium uppercase mb-1">Approved By</p>
                  <p className="text-slate-700">
                    {getUserName(selectedOrderDetails.approved_by)}
                    {selectedOrderDetails.approved_at && ` • ${format(new Date(selectedOrderDetails.approved_at), 'PPp')}`}
                  </p>
                </div>
              )}

              {/* Rejection Reason */}
              {selectedOrderDetails.rejection_reason && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs text-red-600 font-medium uppercase mb-1">Rejection Reason</p>
                  <p className="text-red-700">{selectedOrderDetails.rejection_reason}</p>
                </div>
              )}

              {/* Download Invoice Button */}
              <div className="pt-4 border-t border-slate-200">
                <Button
                  onClick={async () => {
                    const clinic = clinics.find(c => c.id === selectedOrderDetails.clinic_id);
                    await exportInvoicePDF(selectedOrderDetails, clinic, siteSettings);
                    toast.success('تم تحميل الفاتورة');
                  }}
                  className="w-full bg-primary hover:bg-primary/90 rounded-full flex items-center justify-center gap-2"
                >
                  <FileDown className="h-5 w-5" />
                  تحميل الفاتورة PDF / Download Invoice
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Orders;