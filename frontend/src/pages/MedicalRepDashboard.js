import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Building2, MapPin, ShoppingCart, Receipt, Clock } from 'lucide-react';
import api from '../utils/api';
import { getLocationSilently } from '../utils/gps';

const MedicalRepDashboard = ({ user, onLogout }) => {
  const [stats, setStats] = useState({
    clinics_available: 0,
    total_visits: 0,
    visits_today: 0,
    orders_completed: 0,
    orders_pending: 0,
    expenses_submitted: 0
  });

  useEffect(() => {
    fetchStats();

    // Silent GPS tracking - store interval for cleanup
    let gpsInterval = null;

    const startGPSTracking = async () => {
      if (!user?.gps_enabled) return;

      try {
        const location = await getLocationSilently();
        if (location) {
          await api.post('/gps-logs', {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            activity: 'dashboard_view',
          }).catch(() => { });
        }

        // Silent periodic updates every 5 minutes
        gpsInterval = setInterval(async () => {
          try {
            const newLocation = await getLocationSilently();
            if (newLocation) {
              await api.post('/gps-logs', {
                latitude: newLocation.latitude,
                longitude: newLocation.longitude,
                accuracy: newLocation.accuracy,
                activity: 'periodic_update',
              }).catch(() => { });
            }
          } catch {
            // Silent fail
          }
        }, 5 * 60 * 1000);
      } catch {
        // Silent fail
      }
    };

    startGPSTracking();

    // Cleanup on unmount
    return () => {
      if (gpsInterval) {
        clearInterval(gpsInterval);
      }
    };
  }, [user?.gps_enabled]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch {
      // Silent fail
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6 pb-24">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Field Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back, {user?.full_name}!</p>
        </div>

        {/* Pending Orders Alert - Only show if there are pending orders */}
        {stats.orders_pending > 0 && (
          <Card className="p-4 border border-yellow-200 bg-yellow-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-yellow-900">Pending Orders</p>
                <p className="text-sm text-yellow-700">
                  You have <span className="font-bold">{stats.orders_pending}</span> orders waiting for approval
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center mb-3">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Available Clinics</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.clinics_available}</p>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mb-3">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Total Visits</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_visits}</p>
            <p className="text-xs text-blue-600 mt-1">Today: {stats.visits_today}</p>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mb-3">
              <ShoppingCart className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Orders Completed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.orders_completed}</p>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center mb-3">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Pending Approval</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.orders_pending}</p>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center mb-3">
              <Receipt className="h-5 w-5 text-orange-600" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Expenses</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.expenses_submitted}</p>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <a
            href="/clinics"
            data-testid="quick-action-add-clinic"
            className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
          >
            <Building2 className="h-8 w-8 text-primary mb-3" />
            <p className="font-semibold text-slate-900">Add Clinic</p>
            <p className="text-sm text-slate-500 mt-1">Register new clinic</p>
          </a>

          <a
            href="/visits"
            data-testid="quick-action-log-visit"
            className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
          >
            <MapPin className="h-8 w-8 text-primary mb-3" />
            <p className="font-semibold text-slate-900">Log Visit</p>
            <p className="text-sm text-slate-500 mt-1">Record clinic visit</p>
          </a>

          <a
            href="/orders"
            data-testid="quick-action-create-order"
            className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
          >
            <ShoppingCart className="h-8 w-8 text-primary mb-3" />
            <p className="font-semibold text-slate-900">Create Order</p>
            <p className="text-sm text-slate-500 mt-1">Place new order</p>
          </a>

          <a
            href="/expenses"
            data-testid="quick-action-add-expense"
            className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
          >
            <Receipt className="h-8 w-8 text-primary mb-3" />
            <p className="font-semibold text-slate-900">Add Expense</p>
            <p className="text-sm text-slate-500 mt-1">Submit expense claim</p>
          </a>
        </div>
      </div>
    </Layout>
  );
};

export default MedicalRepDashboard;