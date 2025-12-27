import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { CheckCircle, XCircle, Clock, ShoppingCart, User, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const Approvals = ({ user, onLogout }) => {
  const { formatCurrency } = useLanguage();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  useEffect(() => {
    fetchPendingOrders();
  }, []);

  const fetchPendingOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/orders/pending-approval');
      setPendingOrders(response.data);
    } catch (error) {
      toast.error('Failed to load pending orders');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (orderId) => {
    try {
      await api.post(`/orders/${orderId}/approve`);
      toast.success('Order approved successfully');
      fetchPendingOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve order');
    }
  };

  const handleRejectClick = (order) => {
    setSelectedOrder(order);
    setRejectionReason('');
    setShowRejectDialog(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await api.post(`/orders/${selectedOrder.id}/reject?rejection_reason=${encodeURIComponent(rejectionReason)}`);
      toast.success('Order rejected');
      setShowRejectDialog(false);
      setSelectedOrder(null);
      setRejectionReason('');
      fetchPendingOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject order');
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Order Approvals</h1>
          <p className="text-slate-600 mt-1">Review and approve pending orders</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Pending Orders</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{pendingOrders.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Value</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {formatCurrency(pendingOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0))}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Awaiting Action</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{pendingOrders.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {loading ? (
            <Card className="p-12 text-center border border-slate-200 rounded-xl">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading orders...</p>
            </Card>
          ) : pendingOrders.length === 0 ? (
            <Card className="p-12 text-center border border-slate-200 rounded-xl">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No pending orders</p>
              <p className="text-slate-400 text-sm mt-2">All orders have been processed</p>
            </Card>
          ) : (
            pendingOrders.map((order) => (
              <Card
                key={order.id}
                className="p-6 border border-orange-200 bg-orange-50/50 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-slate-900">
                        {order.clinic_name || 'Unknown Clinic'}
                      </h3>
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Pending Approval
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {order.medical_rep_name}
                      </span>
                      <span>{format(new Date(order.order_date), 'PPp')}</span>
                    </div>
                    {order.order_type === 'demo' && (
                      <span className="inline-block mt-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                        🎁 Demo Order
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-slate-900">
                      {formatCurrency(order.total_amount)}
                    </p>
                    {order.order_type === 'demo' && (
                      <p className="text-sm text-green-600 font-medium">(FREE)</p>
                    )}
                  </div>
                </div>

                {/* Products */}
                <div className="mb-4 space-y-2">
                  {order.products?.map((product, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-3 bg-white rounded-lg text-sm border border-slate-200"
                    >
                      <span className="font-medium text-slate-700">{product.name}</span>
                      <span className="text-slate-600">
                        {product.quantity} x {formatCurrency(product.price)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Discount Info */}
                {order.discount_value && (
                  <div className="mb-4 p-3 bg-orange-100 border border-orange-300 rounded-lg">
                    <p className="text-sm font-medium text-orange-800">
                      💰 Discount Applied: {order.discount_type === 'percentage' ? `${order.discount_value}%` : formatCurrency(order.discount_value)}
                    </p>
                    {order.discount_reason && (
                      <p className="text-sm text-orange-700 mt-1">
                        Reason: {order.discount_reason}
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                {order.notes && (
                  <div className="mb-4 p-3 bg-slate-100 rounded-lg">
                    <p className="text-sm text-slate-700">{order.notes}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <Button
                    onClick={() => handleApprove(order.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Order
                  </Button>
                  <Button
                    onClick={() => handleRejectClick(order)}
                    variant="outline"
                    className="flex-1 border-red-600 text-red-600 hover:bg-red-50 rounded-full"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Order
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Please provide a reason for rejecting this order. This will be sent to the medical rep.
            </p>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Discount too high, Product out of stock..."
              rows={4}
            />
            <div className="flex gap-3">
              <Button
                onClick={() => setShowRejectDialog(false)}
                variant="outline"
                className="flex-1 rounded-full"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectSubmit}
                className="flex-1 bg-red-600 hover:bg-red-700 rounded-full"
                disabled={!rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Approvals;
