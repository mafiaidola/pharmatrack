import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ArrowLeft, Building2, MapPin, Phone, Mail, User, Calendar, ShoppingCart, Receipt, Users as UsersIcon, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const ClinicDetails = ({ user, onLogout }) => {
  const { formatCurrency } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clinicData, setClinicData] = useState(null);

  useEffect(() => {
    fetchClinicDetails();
  }, [id]);

  const fetchClinicDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/clinics/${id}/details`);
      setClinicData(response.data);
    } catch (error) {
      toast.error('Failed to load clinic details');
      navigate('/clinics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading clinic details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!clinicData) return null;

  const { clinic, stats, recent_visits, recent_orders, top_products, authorized_reps } = clinicData;

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/clinics')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{clinic.name}</h1>
            <p className="text-slate-600 mt-1">{clinic.address}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Visits</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total_visits}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Orders</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total_orders}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Invoices</p>
                <p className="text-3xl font-bold text-slate-400 mt-1">{stats.total_invoices}</p>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full mt-2 inline-block">Coming Soon</span>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Receipt className="h-6 w-6 text-slate-400" />
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-lg">
            <TabsTrigger value="overview" className="rounded-md">Overview</TabsTrigger>
            <TabsTrigger value="visits" className="rounded-md">Visits ({stats.total_visits})</TabsTrigger>
            <TabsTrigger value="orders" className="rounded-md">Orders ({stats.total_orders})</TabsTrigger>
            <TabsTrigger value="team" className="rounded-md">Team ({authorized_reps.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Clinic Info */}
              <Card className="p-6 border border-slate-200 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Clinic Information</h3>
                <div className="space-y-3">
                  {clinic.doctor_name && (
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-600">Doctor</p>
                        <p className="font-medium text-slate-900">{clinic.doctor_name}</p>
                        {clinic.specialty && <p className="text-xs text-slate-500">{clinic.specialty}</p>}
                      </div>
                    </div>
                  )}
                  {clinic.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-600">Phone</p>
                        <p className="font-medium text-slate-900">{clinic.phone}</p>
                      </div>
                    </div>
                  )}
                  {clinic.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-600">Email</p>
                        <p className="font-medium text-slate-900">{clinic.email}</p>
                      </div>
                    </div>
                  )}
                  {clinic.classification && (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-600">Classification</p>
                        <p className="font-medium text-slate-900">Class {clinic.classification}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Top Products */}
              <Card className="p-6 border border-slate-200 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Top Ordered Products
                </h3>
                {top_products.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">No orders yet</p>
                ) : (
                  <div className="space-y-3">
                    {top_products.map((product, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{product.product_name}</p>
                          <p className="text-xs text-slate-500">{product.order_count} orders</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{product.total_quantity}</p>
                          <p className="text-xs text-slate-500">units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* Visits Tab */}
          <TabsContent value="visits" className="space-y-4">
            {recent_visits.length === 0 ? (
              <Card className="p-12 text-center border border-slate-200 rounded-xl">
                <MapPin className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No visits recorded yet</p>
              </Card>
            ) : (
              recent_visits.map((visit) => (
                <Card key={visit.id} className="p-6 border border-slate-200 rounded-xl hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                          <MapPin className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{visit.medical_rep_name}</p>
                          <p className="text-sm text-slate-600">{format(new Date(visit.visit_date), 'PPp')}</p>
                        </div>
                      </div>

                      <div className="ml-13 space-y-2">
                        {visit.visit_reason && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Reason:</span> {visit.visit_reason.replace('_', ' ')}
                          </p>
                        )}
                        {visit.visit_result && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Result:</span> {visit.visit_result.replace('_', ' ')}
                          </p>
                        )}
                        {visit.attendees && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Attendees:</span> {visit.attendees}
                          </p>
                        )}
                        {visit.notes && (
                          <p className="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg">{visit.notes}</p>
                        )}
                        {visit.visit_rating && (
                          <div className="flex items-center gap-1 mt-2">
                            {[...Array(5)].map((_, i) => (
                              <span key={i} className={i < visit.visit_rating ? 'text-yellow-400' : 'text-slate-300'}>★</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${visit.status === 'verified' ? 'bg-green-100 text-green-700' :
                      visit.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                      {visit.status}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {recent_orders.length === 0 ? (
              <Card className="p-12 text-center border border-slate-200 rounded-xl">
                <ShoppingCart className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No orders placed yet</p>
              </Card>
            ) : (
              recent_orders.map((order) => (
                <Card key={order.id} className="p-6 border border-slate-200 rounded-xl">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm text-slate-600">{format(new Date(order.order_date), 'PPp')}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {order.order_type === 'demo' ? '🎁 Demo Order' : '📦 Regular Order'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-900">{formatCurrency(order.total_amount)}</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${order.status === 'approved' ? 'bg-green-100 text-green-700' :
                        order.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                        }`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {order.products?.map((product, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-sm">
                        <span className="text-slate-700">{product.name}</span>
                        <span className="text-slate-600">{product.quantity} x {formatCurrency(product.price)}</span>
                      </div>
                    ))}
                  </div>

                  {order.discount_value && (
                    <div className="mt-3 p-2 bg-orange-50 rounded-lg text-sm">
                      <span className="text-orange-700">
                        💰 Discount: {order.discount_type === 'percentage' ? `${order.discount_value}%` : formatCurrency(order.discount_value)}
                      </span>
                    </div>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-4">
            <Card className="p-6 border border-slate-200 rounded-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-primary" />
                Authorized Medical Reps
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Medical representatives assigned to the same line can visit this clinic
              </p>
              {authorized_reps.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No authorized reps found</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {authorized_reps.map((rep) => (
                    <div key={rep.id} className="p-4 border border-slate-200 rounded-lg hover:border-primary transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{rep.full_name}</p>
                          {rep.phone && <p className="text-sm text-slate-600">{rep.phone}</p>}
                          {rep.email && <p className="text-xs text-slate-500">{rep.email}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ClinicDetails;
