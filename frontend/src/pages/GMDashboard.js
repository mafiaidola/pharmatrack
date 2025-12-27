import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Building2, MapPin, ShoppingCart, Receipt } from 'lucide-react';
import api from '../utils/api';

const GMDashboard = ({ user, onLogout }) => {
  const [stats, setStats] = useState({ clinics: 0, visits: 0, orders: 0, expenses: 0, users: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">General Manager Dashboard</h1>
          <p className="text-slate-600 mt-1">Overview of company activities and performance</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">Clinics</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.clinics}</p>
              </div>
              <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">Visits</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.visits}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">Orders</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.orders}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200 rounded-xl shadow-sm card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wider">Expenses</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.expenses}</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center">
                <Receipt className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="p-6 border border-slate-200 rounded-xl shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/clinics"
              data-testid="quick-action-clinics"
              className="p-4 border border-slate-200 rounded-lg hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <Building2 className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium text-slate-900">Manage Clinics</p>
            </a>
            <a
              href="/visits"
              data-testid="quick-action-visits"
              className="p-4 border border-slate-200 rounded-lg hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <MapPin className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium text-slate-900">View Visits</p>
            </a>
            <a
              href="/users"
              data-testid="quick-action-users"
              className="p-4 border border-slate-200 rounded-lg hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <Receipt className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium text-slate-900">Manage Users</p>
            </a>
            <a
              href="/gps-tracking"
              data-testid="quick-action-gps"
              className="p-4 border border-slate-200 rounded-lg hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <MapPin className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium text-slate-900">GPS Tracking</p>
            </a>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default GMDashboard;