import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Receipt, Calendar, Edit, Trash2, Upload, FileImage, Check, X, Clock, User, Hash, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import api, { getBackendBaseUrl } from '../utils/api';
import { getHighAccuracyLocation } from '../utils/gps';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { exportExpensePDF } from '../utils/pdfExport';

// Expense categories
const EXPENSE_CATEGORIES = [
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'communication', label: 'Communication' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'medical', label: 'Medical' },
  { value: 'other', label: 'Other' },
];

const getCategoryColor = (category) => {
  const colors = {
    travel: 'bg-blue-100 text-blue-800',
    meals: 'bg-orange-100 text-orange-800',
    accommodation: 'bg-purple-100 text-purple-800',
    transportation: 'bg-green-100 text-green-800',
    supplies: 'bg-gray-100 text-gray-800',
    communication: 'bg-cyan-100 text-cyan-800',
    entertainment: 'bg-pink-100 text-pink-800',
    medical: 'bg-red-100 text-red-800',
    other: 'bg-slate-100 text-slate-800',
  };
  return colors[category] || colors.other;
};

const Expenses = ({ user, onLogout }) => {
  const { formatCurrency, t } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const [expenses, setExpenses] = useState([]);
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [expenseToReject, setExpenseToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState(
    ['manager', 'gm', 'super_admin'].includes(user?.role) ? 'all-expenses' : 'active'
  );
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    expense_type: '',
    category: 'other',
    custom_category: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 16),
    description: '',
    receipt_url: '',
    receipt_files: [],
  });
  const [loading, setLoading] = useState(false);

  const isManager = ['manager', 'gm', 'super_admin'].includes(user?.role);

  useEffect(() => {
    fetchExpenses();
    if (isManager) {
      fetchPendingExpenses();
    }
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await api.get('/expenses');
      setExpenses(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    }
  };

  const fetchPendingExpenses = async () => {
    try {
      const response = await api.get('/expenses/pending-approval');
      setPendingExpenses(response.data);
    } catch (error) {
      console.error('Failed to load pending expenses:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      expense_type: '',
      category: 'other',
      custom_category: '',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 16),
      description: '',
      receipt_url: '',
      receipt_files: [],
    });
    setEditingExpense(null);
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setFormData({
      expense_type: expense.expense_type,
      category: expense.category || 'other',
      custom_category: expense.custom_category || '',
      amount: expense.amount.toString(),
      expense_date: new Date(expense.expense_date).toISOString().slice(0, 16),
      description: expense.description || '',
      receipt_url: expense.receipt_url || '',
      receipt_files: expense.receipt_files || [],
    });
    setShowDialog(true);
  };

  const handleDeleteClick = (expense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;

    try {
      await api.delete(`/expenses/${expenseToDelete.id}`);
      toast.success('Expense deleted successfully');
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to delete expense');
    }
  };

  const handleReceiptUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    const invalidFiles = files.filter(f => !allowedTypes.includes(f.type));
    if (invalidFiles.length > 0) {
      toast.error('Invalid file type. Only images and PDF are allowed.');
      return;
    }

    setUploadingReceipt(true);
    const uploadedUrls = [...formData.receipt_files];

    try {
      for (const file of files) {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        const response = await api.post('/expenses/upload-receipt', formDataUpload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedUrls.push(response.data.url);
      }
      setFormData({ ...formData, receipt_files: uploadedUrls });
      toast.success(`${files.length} receipt(s) uploaded successfully`);
    } catch (error) {
      toast.error('Failed to upload receipt');
    } finally {
      setUploadingReceipt(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

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

    const expenseData = {
      ...formData,
      amount: parseFloat(formData.amount),
      expense_date: new Date(formData.expense_date).toISOString(),
      latitude,
      longitude,
    };

    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, expenseData);
        toast.success('Expense updated successfully');
      } else {
        await api.post('/expenses', expenseData);
        toast.success('Expense submitted for approval');
      }
      setShowDialog(false);
      resetForm();
      fetchExpenses();
    } catch (error) {
      toast.error(editingExpense ? 'Failed to update expense' : 'Failed to submit expense');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (expenseId) => {
    try {
      await api.post(`/expenses/${expenseId}/approve`);
      toast.success('Expense approved');
      fetchPendingExpenses();
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to approve expense');
    }
  };

  const handleRejectClick = (expense) => {
    setExpenseToReject(expense);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!expenseToReject) return;

    try {
      await api.post(`/expenses/${expenseToReject.id}/reject`, {
        rejection_reason: rejectionReason,
      });
      toast.success('Expense rejected');
      setRejectDialogOpen(false);
      setExpenseToReject(null);
      setRejectionReason('');
      fetchPendingExpenses();
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to reject expense');
    }
  };

  const handleDialogClose = (open) => {
    setShowDialog(open);
    if (!open) {
      resetForm();
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
    };
    const icons = {
      pending: <Clock className="h-3 w-3" />,
      approved: <Check className="h-3 w-3" />,
      rejected: <X className="h-3 w-3" />,
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${styles[status] || styles.pending}`}>
        {icons[status]}
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  const renderExpenseCard = (expense, showActions = false, isApprovalView = false) => {
    const canEdit = user?.role === 'medical_rep' || user?.role === 'gm' || user?.role === 'super_admin';
    // Only allow edit/delete for pending expenses that the user submitted
    const canEditThis = canEdit && expense.status === 'pending' && expense.medical_rep_id === user?.id;

    return (
      <Card
        key={expense.id}
        data-testid={`expense-card-${expense.id}`}
        className="p-6 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => setViewingExpense(expense)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Header with serial number and category */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-sm">
                <Receipt className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {expense.serial_number && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      <Hash className="h-3 w-3" />
                      {expense.serial_number}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${getCategoryColor(expense.category)}`}>
                    {expense.custom_category || EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || 'Other'}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mt-1">{expense.expense_type}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  {expense.expense_date && format(new Date(expense.expense_date), 'PPp')}
                </p>
              </div>
            </div>

            {/* ALWAYS show submitter info */}
            {expense.submitter_name && (
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2 bg-blue-50 p-2 rounded-lg">
                <User className="h-4 w-4 text-blue-600" />
                <span>Submitted by: <strong className="text-blue-700">{expense.submitter_name}</strong></span>
              </div>
            )}

            {/* Description - truncated */}
            {expense.description && (
              <p className="text-sm text-slate-600 mt-3 p-3 bg-slate-50 rounded-lg line-clamp-2">
                {expense.description}
              </p>
            )}

            {/* Receipt links */}
            <div className="flex gap-3 mt-3">
              {expense.receipt_file && (
                <a
                  href={`${getBackendBaseUrl()}${expense.receipt_file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <FileImage className="h-4 w-4" />
                  View Receipt
                </a>
              )}
              {expense.receipt_url && !expense.receipt_file && (
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <FileImage className="h-4 w-4" />
                  View Receipt
                </a>
              )}
            </div>

            {/* Approval/Rejection info */}
            {expense.status === 'approved' && expense.reviewer_name && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-700">
                  <strong>✓ Approved by:</strong> {expense.reviewer_name}
                  {expense.reviewed_at && ` on ${format(new Date(expense.reviewed_at), 'PPp')}`}
                </p>
              </div>
            )}

            {/* Rejection reason */}
            {expense.status === 'rejected' && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  <strong>✕ Rejected{expense.reviewer_name ? ` by ${expense.reviewer_name}` : ''}:</strong> {expense.rejection_reason || 'No reason provided'}
                </p>
              </div>
            )}
          </div>

          <div className="ml-4 text-right flex flex-col items-end gap-2">
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(expense.amount)}
            </p>
            {getStatusBadge(expense.status)}

            {/* Approval actions */}
            {isApprovalView && expense.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(expense.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRejectClick(expense)}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}

            {/* Edit/Delete actions */}
            {!isApprovalView && canEditThis && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(expense)}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(expense)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('expenses')}</h1>
            <p className="text-slate-600 mt-1">{t('trackExpenses')}</p>
          </div>
          {user?.role !== 'manager' && (
            <Dialog open={showDialog} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button data-testid="add-expense-button" className="bg-primary hover:bg-primary/90 rounded-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('addExpense')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingExpense ? 'Edit Expense' : 'Submit Expense Claim'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="expense_type">Expense Type *</Label>
                      <Input
                        id="expense_type"
                        data-testid="expense-type-input"
                        value={formData.expense_type}
                        onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
                        placeholder="e.g., Gas, Lunch, Hotel"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value, custom_category: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.category === 'other' && (
                        <Input
                          className="mt-2"
                          placeholder="Specify category..."
                          value={formData.custom_category}
                          onChange={(e) => setFormData({ ...formData, custom_category: e.target.value })}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amount">Amount *</Label>
                      <Input
                        id="amount"
                        data-testid="expense-amount-input"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="expense_date">Date & Time *</Label>
                      <Input
                        id="expense_date"
                        data-testid="expense-date-input"
                        type="datetime-local"
                        value={formData.expense_date}
                        onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Reason / Description *</Label>
                    <Textarea
                      id="description"
                      data-testid="expense-description-input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Explain the purpose of this expense..."
                      required
                    />
                  </div>

                  {/* Multi-file Receipt Upload */}
                  <div>
                    <Label>Receipt Attachments</Label>
                    <div className="mt-2 space-y-3">
                      {/* Display uploaded receipts */}
                      {formData.receipt_files.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {formData.receipt_files.map((url, index) => (
                            <div key={index} className="relative group">
                              <div className="aspect-square bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
                                {url.endsWith('.pdf') ? (
                                  <FileImage className="h-8 w-8 text-slate-400" />
                                ) : (
                                  <img
                                    src={`${getBackendBaseUrl()}${url}`}
                                    alt={`Receipt ${index + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setFormData({
                                  ...formData,
                                  receipt_files: formData.receipt_files.filter((_, i) => i !== index)
                                })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upload button */}
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-slate-50 transition-colors"
                      >
                        <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">
                          {uploadingReceipt ? 'Uploading...' : 'Click to upload receipts'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">JPG, PNG, PDF (multiple files allowed)</p>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleReceiptUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <Button
                    data-testid="expense-submit-button"
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 rounded-full"
                    disabled={loading || uploadingReceipt}
                  >
                    {loading ? (editingExpense ? 'Updating...' : 'Submitting...') : (editingExpense ? 'Update Expense' : 'Submit for Approval')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Tabs for manager view */}
        {isManager ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="all-expenses">All Team Expenses</TabsTrigger>
              <TabsTrigger value="pending-approval" className="relative">
                Pending Approval
                {pendingExpenses.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {pendingExpenses.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all-expenses" className="space-y-4">
              {expenses.length === 0 ? (
                <Card className="p-12 text-center border border-slate-200 rounded-xl">
                  <Receipt className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">No expenses found</p>
                  <p className="text-slate-400 text-sm mt-2">Team expenses will appear here</p>
                </Card>
              ) : (
                expenses.map((expense) => renderExpenseCard(expense, true, false))
              )}
            </TabsContent>

            <TabsContent value="pending-approval" className="space-y-4">
              {pendingExpenses.length === 0 ? (
                <Card className="p-12 text-center border border-slate-200 rounded-xl">
                  <Check className="h-16 w-16 text-emerald-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">No pending approvals</p>
                  <p className="text-slate-400 text-sm mt-2">All expense claims have been reviewed</p>
                </Card>
              ) : (
                pendingExpenses.map((expense) => renderExpenseCard(expense, false, true))
              )}
            </TabsContent>
          </Tabs>
        ) : (
          /* Medical rep view with Active/History tabs */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="active" className="relative">
                Active
                {expenses.filter(e => e.status === 'pending' || e.status === 'rejected').length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {expenses.filter(e => e.status === 'pending' || e.status === 'rejected').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {expenses.filter(e => e.status === 'pending' || e.status === 'rejected').length === 0 ? (
                <Card className="p-12 text-center border border-slate-200 rounded-xl">
                  <Clock className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">No active expenses</p>
                  <p className="text-slate-400 text-sm mt-2">Your pending and rejected expenses will appear here</p>
                </Card>
              ) : (
                expenses
                  .filter(e => e.status === 'pending' || e.status === 'rejected')
                  .map((expense) => renderExpenseCard(expense, true, false))
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {expenses.filter(e => e.status === 'approved').length === 0 ? (
                <Card className="p-12 text-center border border-slate-200 rounded-xl">
                  <Check className="h-16 w-16 text-emerald-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">No approved expenses</p>
                  <p className="text-slate-400 text-sm mt-2">Your approved expenses will appear here</p>
                </Card>
              ) : (
                expenses
                  .filter(e => e.status === 'approved')
                  .map((expense) => renderExpenseCard(expense, false, false))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Expense Details Dialog */}
      <Dialog open={!!viewingExpense} onOpenChange={(open) => !open && setViewingExpense(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="block">{viewingExpense?.expense_type}</span>
                {viewingExpense?.serial_number && (
                  <span className="text-xs font-mono text-slate-500">#{viewingExpense.serial_number}</span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {viewingExpense && (
            <div className="space-y-4 mt-4">
              {/* Submitter Info */}
              <div className="flex items-center gap-2 text-sm bg-blue-50 p-3 rounded-lg">
                <User className="h-4 w-4 text-blue-600" />
                <span>Submitted by: <strong className="text-blue-700">{viewingExpense.submitter_name}</strong></span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Category</Label>
                  <p className="font-medium">{viewingExpense.custom_category || EXPENSE_CATEGORIES.find(c => c.value === viewingExpense.category)?.label || 'Other'}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Amount</Label>
                  <p className="font-medium text-lg">{formatCurrency(viewingExpense.amount)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Date</Label>
                  <p className="font-medium">{viewingExpense.expense_date && format(new Date(viewingExpense.expense_date), 'PPp')}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Status</Label>
                  <p>{getStatusBadge(viewingExpense.status)}</p>
                </div>
              </div>

              {/* Description */}
              {viewingExpense.description && (
                <div>
                  <Label className="text-slate-500">Description</Label>
                  <p className="mt-1 p-3 bg-slate-50 rounded-lg text-sm">{viewingExpense.description}</p>
                </div>
              )}

              {/* Receipts Gallery */}
              {(viewingExpense.receipt_files?.length > 0 || viewingExpense.receipt_file) && (
                <div>
                  <Label className="text-slate-500">Receipts</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {(viewingExpense.receipt_files || [viewingExpense.receipt_file].filter(Boolean)).map((url, index) => (
                      <a
                        key={index}
                        href={`${getBackendBaseUrl()}${url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square bg-slate-100 rounded-lg border border-slate-200 overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      >
                        {url.endsWith('.pdf') ? (
                          <div className="flex items-center justify-center h-full">
                            <FileImage className="h-8 w-8 text-slate-400" />
                          </div>
                        ) : (
                          <img
                            src={`${getBackendBaseUrl()}${url}`}
                            alt={`Receipt ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval/Rejection Info */}
              {viewingExpense.status === 'approved' && viewingExpense.reviewer_name && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-sm text-emerald-700">
                    <strong>✓ Approved by:</strong> {viewingExpense.reviewer_name}
                    {viewingExpense.reviewed_at && ` on ${format(new Date(viewingExpense.reviewed_at), 'PPp')}`}
                  </p>
                </div>
              )}

              {viewingExpense.status === 'rejected' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    <strong>✕ Rejected{viewingExpense.reviewer_name ? ` by ${viewingExpense.reviewer_name}` : ''}:</strong> {viewingExpense.rejection_reason || 'No reason provided'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewingExpense(null)} className="flex-1">
                  Close
                </Button>
                <Button
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                  onClick={() => {
                    exportExpensePDF(viewingExpense, siteSettings);
                    toast.success('PDF downloaded');
                  }}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
                {viewingExpense.status === 'pending' && viewingExpense.medical_rep_id === user?.id && (
                  <Button
                    variant="outline"
                    className="border-blue-300 text-blue-600"
                    onClick={() => {
                      setViewingExpense(null);
                      handleEdit(viewingExpense);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
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

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this expense claim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-red-600 hover:bg-red-700">
              Reject Expense
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Expenses;
