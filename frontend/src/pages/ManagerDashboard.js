import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Users, MapPin, ShoppingCart, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'sonner';

const ManagerDashboard = ({ user, onLogout }) => {
  const [stats, setStats] = useState({
    team_size: 0,
    team_visits: 0,
    team_visits_today: 0,
    team_orders: 0,
    pending_approvals: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to load dashboard stats');
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Manager Dashboard</h1>
          <p className="text-slate-600 mt-1">Overview of your team's performance</p>
        </div>

        {/* Pending Approvals Alert */}
        {stats.pending_approvals > 0 && (
          <Card className="p-4 border border-yellow-200 bg-yellow-50 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-yellow-900">Pending Approvals</p>
                <p className="text-sm text-yellow-700">
                  You have <span className="font-bold text-lg">{stats.pending_approvals}</span> orders waiting for your approval
                </p>
              </div>
              <a
                href="/approvals"
                className="ml-auto px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Review Now
              </a>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Team Size</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.team_size}</p>
                <p className="text-xs text-blue-600 mt-1">Medical Reps</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Team Visits</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.team_visits}</p>
                <p className="text-xs text-purple-600 mt-1">Today: {stats.team_visits_today}</p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Team Orders</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.team_orders}</p>
              </div>
              <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.pending_approvals}</p>
                <p className="text-xs text-yellow-600 mt-1">Needs approval</p>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stats.pending_approvals > 0 ? 'bg-yellow-50' : 'bg-green-50'
                }`}>
                {stats.pending_approvals > 0 ? (
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="p-6 border border-slate-200 rounded-xl shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/approvals"
              data-testid="quick-action-approvals"
              className="p-5 border border-slate-200 rounded-xl hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <Clock className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-slate-900">Approvals</p>
              <p className="text-xs text-slate-500 mt-1">Review pending orders</p>
            </a>
            <a
              href="/users"
              data-testid="quick-action-manage-users"
              className="p-5 border border-slate-200 rounded-xl hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <Users className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-slate-900">Team</p>
              <p className="text-xs text-slate-500 mt-1">Manage team members</p>
            </a>
            <a
              href="/visits"
              data-testid="quick-action-view-visits"
              className="p-5 border border-slate-200 rounded-xl hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <MapPin className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-slate-900">Visits</p>
              <p className="text-xs text-slate-500 mt-1">View team visits</p>
            </a>
            <a
              href="/orders"
              data-testid="quick-action-view-orders"
              className="p-5 border border-slate-200 rounded-xl hover:border-primary hover:bg-teal-50 transition-all text-center"
            >
              <ShoppingCart className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-slate-900">Orders</p>
              <p className="text-xs text-slate-500 mt-1">Track team orders</p>
            </a>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default ManagerDashboard;