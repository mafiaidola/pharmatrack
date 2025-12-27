import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
    RotateCcw, CheckCircle, XCircle, Package, Clock,
    AlertTriangle, Eye, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const Returns = ({ user, onLogout }) => {
    const { formatCurrency } = useLanguage();
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedReturn, setSelectedReturn] = useState(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        fetchReturns();
    }, [filterStatus]);

    const fetchReturns = async () => {
        setLoading(true);
        try {
            const params = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
            const response = await api.get(`/returns${params}`);
            setReturns(response.data);
        } catch (error) {
            toast.error('Failed to load returns');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (returnId) => {
        try {
            await api.put(`/returns/${returnId}/approve`);
            toast.success('Return approved successfully');
            fetchReturns();
            setShowDetailDialog(false);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to approve return');
        }
    };

    const handleReject = async () => {
        if (!selectedReturn) return;
        try {
            await api.put(`/returns/${selectedReturn.id}/reject?rejection_reason=${encodeURIComponent(rejectionReason)}`);
            toast.success('Return rejected');
            fetchReturns();
            setShowRejectDialog(false);
            setShowDetailDialog(false);
            setRejectionReason('');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to reject return');
        }
    };

    const handleProcess = async (returnId) => {
        try {
            await api.put(`/returns/${returnId}/process`);
            toast.success('Return processed successfully');
            fetchReturns();
            setShowDetailDialog(false);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to process return');
        }
    };

    const getStatusStyle = (status) => {
        const styles = {
            'pending': 'bg-yellow-100 text-yellow-700',
            'approved': 'bg-green-100 text-green-700',
            'rejected': 'bg-red-100 text-red-700',
            'processed': 'bg-blue-100 text-blue-700',
        };
        return styles[status] || 'bg-slate-100 text-slate-700';
    };

    const getStatusIcon = (status) => {
        const icons = {
            'pending': <Clock className="h-4 w-4" />,
            'approved': <CheckCircle className="h-4 w-4" />,
            'rejected': <XCircle className="h-4 w-4" />,
            'processed': <Package className="h-4 w-4" />,
        };
        return icons[status] || <AlertTriangle className="h-4 w-4" />;
    };

    return (
        <Layout user={user} onLogout={onLogout}>
            <div className="p-4 lg:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Returns Management</h1>
                        <p className="text-slate-600">Manage order returns and refunds</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-40">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Returns</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                                <SelectItem value="processed">Processed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4 border border-yellow-200 bg-yellow-50">
                        <div className="flex items-center gap-3">
                            <Clock className="h-8 w-8 text-yellow-600" />
                            <div>
                                <p className="text-2xl font-bold text-yellow-700">
                                    {returns.filter(r => r.status === 'pending').length}
                                </p>
                                <p className="text-sm text-yellow-600">Pending</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 border border-green-200 bg-green-50">
                        <div className="flex items-center gap-3">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                            <div>
                                <p className="text-2xl font-bold text-green-700">
                                    {returns.filter(r => r.status === 'approved').length}
                                </p>
                                <p className="text-sm text-green-600">Approved</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 border border-red-200 bg-red-50">
                        <div className="flex items-center gap-3">
                            <XCircle className="h-8 w-8 text-red-600" />
                            <div>
                                <p className="text-2xl font-bold text-red-700">
                                    {returns.filter(r => r.status === 'rejected').length}
                                </p>
                                <p className="text-sm text-red-600">Rejected</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 border border-blue-200 bg-blue-50">
                        <div className="flex items-center gap-3">
                            <Package className="h-8 w-8 text-blue-600" />
                            <div>
                                <p className="text-2xl font-bold text-blue-700">
                                    {returns.filter(r => r.status === 'processed').length}
                                </p>
                                <p className="text-sm text-blue-600">Processed</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Returns List */}
                <Card className="p-6">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : returns.length === 0 ? (
                        <div className="text-center py-12">
                            <RotateCcw className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500">No returns found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {returns.map((returnItem) => (
                                <div
                                    key={returnItem.id}
                                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-full ${getStatusStyle(returnItem.status)}`}>
                                            {getStatusIcon(returnItem.status)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900">
                                                Return #{returnItem.id?.slice(-6)?.toUpperCase()}
                                            </p>
                                            <p className="text-sm text-slate-600">
                                                Order: #{returnItem.order_id?.slice(-6)?.toUpperCase()}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {returnItem.created_at && format(new Date(returnItem.created_at), 'MMM dd, yyyy HH:mm')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="font-bold text-slate-900">
                                                {formatCurrency(returnItem.total_amount)}
                                            </p>
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(returnItem.status)}`}>
                                                {returnItem.status}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setSelectedReturn(returnItem);
                                                setShowDetailDialog(true);
                                            }}
                                        >
                                            <Eye className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Detail Dialog */}
                <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Return Details</DialogTitle>
                        </DialogHeader>
                        {selectedReturn && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-500">Return ID</p>
                                        <p className="font-medium">#{selectedReturn.id?.slice(-6)?.toUpperCase()}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Order ID</p>
                                        <p className="font-medium">#{selectedReturn.order_id?.slice(-6)?.toUpperCase()}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Status</p>
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(selectedReturn.status)}`}>
                                            {getStatusIcon(selectedReturn.status)}
                                            {selectedReturn.status}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Amount</p>
                                        <p className="font-bold text-lg">{formatCurrency(selectedReturn.total_amount)}</p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm text-slate-500">Reason</p>
                                    <p className="bg-slate-50 p-3 rounded-lg">{selectedReturn.reason}</p>
                                </div>

                                {selectedReturn.notes && (
                                    <div>
                                        <p className="text-sm text-slate-500">Notes</p>
                                        <p className="bg-slate-50 p-3 rounded-lg">{selectedReturn.notes}</p>
                                    </div>
                                )}

                                {selectedReturn.rejection_reason && (
                                    <div>
                                        <p className="text-sm text-slate-500">Rejection Reason</p>
                                        <p className="bg-red-50 text-red-700 p-3 rounded-lg">{selectedReturn.rejection_reason}</p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-sm text-slate-500 mb-2">Items</p>
                                    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                                        {selectedReturn.items?.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span>Product ID: {item.product_id?.slice(-6)}</span>
                                                <span className="font-medium">Qty: {item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedReturn.status === 'pending' && (
                                    <div className="flex gap-3 pt-4 border-t">
                                        <Button
                                            className="flex-1 bg-green-600 hover:bg-green-700"
                                            onClick={() => handleApprove(selectedReturn.id)}
                                        >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Approve
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            className="flex-1"
                                            onClick={() => setShowRejectDialog(true)}
                                        >
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Reject
                                        </Button>
                                    </div>
                                )}

                                {selectedReturn.status === 'approved' && (
                                    <div className="pt-4 border-t">
                                        <Button
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                            onClick={() => handleProcess(selectedReturn.id)}
                                        >
                                            <Package className="h-4 w-4 mr-2" />
                                            Mark as Processed
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Reject Dialog */}
                <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reject Return</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label>Rejection Reason</Label>
                                <Textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Enter reason for rejection..."
                                    rows={3}
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="flex-1" onClick={() => setShowRejectDialog(false)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" className="flex-1" onClick={handleReject}>
                                    Confirm Reject
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default Returns;
