import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  MapPin,
  ShoppingCart,
  Receipt,
  Users,
  Package,
  CheckSquare,
  Navigation,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  RotateCcw
} from 'lucide-react';
import { Button } from './ui/button';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import api from '../utils/api';
import NotificationBell from './NotificationBell';
import GlobalSearchBar from './GlobalSearchBar';

const Layout = ({ children, user, onLogout }) => {
  const { t } = useLanguage();
  const { siteSettings, getImageUrl } = useSiteSettings();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      // Try to get GPS location for logout logging
      let latitude = null;
      let longitude = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch (e) {
          console.warn('GPS not available for logout');
        }
      }

      await api.post('/auth/logout', { latitude, longitude });
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      onLogout(); // Always clear local session
    }
  };

  const navigation = [
    { nameKey: 'dashboard', href: '/', icon: LayoutDashboard, roles: ['super_admin', 'gm', 'manager', 'medical_rep'], color: 'text-sky-500' },
    { nameKey: 'clinics', href: '/clinics', icon: Building2, roles: ['super_admin', 'gm', 'manager', 'medical_rep'], color: 'text-violet-500' },
    { nameKey: 'visits', href: '/visits', icon: MapPin, roles: ['super_admin', 'gm', 'manager', 'medical_rep'], color: 'text-emerald-500' },
    { nameKey: 'orders', href: '/orders', icon: ShoppingCart, roles: ['super_admin', 'gm', 'manager', 'accountant', 'medical_rep'], color: 'text-orange-500' },
    { nameKey: 'expenses', href: '/expenses', icon: Receipt, roles: ['super_admin', 'gm', 'manager', 'medical_rep'], color: 'text-pink-500' },
    { nameKey: 'users', href: '/users', icon: Users, roles: ['super_admin', 'gm', 'manager'], color: 'text-cyan-500' },
    { nameKey: 'products', href: '/products', icon: Package, roles: ['super_admin'], color: 'text-indigo-500' },
    { nameKey: 'approvals', href: '/approvals', icon: CheckSquare, roles: ['manager', 'gm', 'super_admin'], color: 'text-amber-500' },
    { nameKey: 'returns', href: '/returns', icon: RotateCcw, roles: ['accountant', 'super_admin'], color: 'text-purple-500' },
    { nameKey: 'accounting', href: '/accounting', icon: Receipt, roles: ['accountant', 'gm', 'super_admin'], color: 'text-emerald-600' },
    { nameKey: 'gpsTracking', href: '/gps-tracking', icon: Navigation, roles: ['super_admin'], color: 'text-rose-500' },
    { nameKey: 'performance', href: '/performance', icon: LayoutDashboard, roles: ['super_admin', 'gm', 'manager'], color: 'text-teal-500' },
    { nameKey: 'settings', href: '/settings', icon: SettingsIcon, roles: ['super_admin', 'gm'], color: 'text-slate-600' },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));

  const getRoleLabel = (role) => {
    const roleMap = {
      'super_admin': t('superAdmin'),
      'gm': t('gm'),
      'manager': t('manager'),
      'medical_rep': t('medicalRep')
    };
    return roleMap[role] || role;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* FIXED HEADER - Always visible */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 lg:pl-[280px]">
          {/* Mobile: Logo and menu */}
          <div className="flex items-center gap-3 lg:hidden">
            <Button
              data-testid="mobile-menu-button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
            <div className="flex items-center gap-2">
              {siteSettings?.logo_url && (
                <img src={getImageUrl(siteSettings.logo_url)} className="h-6 w-6 object-contain" alt="Logo" />
              )}
              <h1 className="text-lg font-bold text-slate-900">{siteSettings?.site_title || t('medtrackShort')}</h1>
            </div>
          </div>

          {/* Desktop: Page indicator */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-sm text-slate-500">Welcome,</span>
            <span className="text-sm font-medium text-slate-900">{user?.full_name}</span>
          </div>

          {/* Search, Language, Notifications - Always visible */}
          <div className="flex items-center gap-3">
            {/* Search - wider on desktop */}
            <div className="hidden sm:block w-48 md:w-64 lg:w-80">
              <GlobalSearchBar />
            </div>

            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* Notifications */}
            <NotificationBell />
          </div>
        </div>

        {/* Mobile: Search bar below header */}
        <div className="sm:hidden px-4 pb-3 border-t border-slate-100">
          <GlobalSearchBar />
        </div>
      </header>

      {/* Sidebar */}
      <div
        className={`sidebar ${sidebarOpen ? 'open' : ''} lg:translate-x-0 flex flex-col bg-white border-r border-slate-200`}
        data-testid="sidebar"
      >
        <div className="p-6 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            {siteSettings?.logo_url && (
              <img src={getImageUrl(siteSettings.logo_url)} className="h-8 w-8 object-contain" alt="Logo" />
            )}
            <h1 className="text-2xl font-bold text-primary">{siteSettings?.site_title || t('medtrackShort')}</h1>
          </div>

          <p className="text-sm text-slate-500">{user?.full_name}</p>
          <span className="text-xs text-primary font-medium uppercase tracking-wider">
            {getRoleLabel(user?.role)}
          </span>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.nameKey}
                to={item.href}
                data-testid={`nav-${item.nameKey.toLowerCase()}`}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-white' : item.color}`} />
                <span className="font-medium">{t(item.nameKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 shrink-0 bg-white">
          <Button
            data-testid="logout-button"
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 mr-3" />
            {t('logout')}
          </Button>
        </div>
      </div>

      {/* Main content - with top padding for fixed header */}
      <div className="main-content pt-20 sm:pt-16 lg:pt-16">
        {children}
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;