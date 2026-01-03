import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, X, ShoppingCart, AlertCircle, CheckCircle, MapPin, Receipt, Users, Package, Clock, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import api from '../utils/api';
import { format } from 'date-fns';

const NotificationBell = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchUnreadCount = async () => {
        try {
            const response = await api.get('/notifications/unread-count');
            setUnreadCount(response.data.count);
        } catch (error) {
            console.error('Failed to fetch unread count');
        }
    };

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await api.get('/notifications?limit=10');
            setNotifications(response.data.items || response.data);
        } catch (error) {
            console.error('Failed to fetch notifications');
        } finally {
            setLoading(false);
        }
    };

    const handleBellClick = () => {
        if (!isOpen) {
            fetchNotifications();
        }
        setIsOpen(!isOpen);
    };

    const handleMarkRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n =>
                n.id === id ? { ...n, is_read: true } : n
            ));
            setUnreadCount(Math.max(0, unreadCount - 1));
        } catch (error) {
            console.error('Failed to mark as read');
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await api.put('/notifications/mark-all-read');
            setNotifications(notifications.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read');
        }
    };

    // Get navigation path based on notification type and data
    const getNavigationPath = (notif) => {
        const type = notif.type;
        const data = notif.data || {};

        // Order-related notifications
        if (type === 'order_pending' || type === 'order_approved' || type === 'order_rejected' || type?.includes('order')) {
            if (data.order_id) {
                return '/orders'; // Could be /orders?id=${data.order_id} if we had detail view
            }
            return '/approvals';
        }

        // Visit-related notifications
        if (type?.includes('visit')) {
            return '/visits';
        }

        // Expense-related notifications
        if (type === 'expense_pending' || type === 'expense_approved' || type === 'expense_rejected' || type?.includes('expense')) {
            return '/expenses';
        }

        // User-related notifications
        if (type?.includes('user')) {
            return '/users';
        }

        // Clinic-related notifications
        if (type?.includes('clinic')) {
            return '/clinics';
        }

        // Accounting/Invoice notifications
        if (type?.includes('invoice') || type?.includes('payment')) {
            return '/accounting';
        }

        // Default: go to approvals for pending items
        if (type?.includes('pending')) {
            return '/approvals';
        }

        return null; // No navigation
    };

    // Handle notification click - mark as read AND navigate
    const handleNotificationClick = async (notif) => {
        // First mark as read if unread
        if (!notif.is_read) {
            await handleMarkRead(notif.id);
        }

        // Get navigation path
        const path = getNavigationPath(notif);

        if (path) {
            setIsOpen(false); // Close dropdown
            navigate(path);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'order_pending':
            case 'order_pending_approval': return <ShoppingCart className="h-4 w-4 text-orange-500" />;
            case 'order_approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'order_rejected': return <X className="h-4 w-4 text-red-500" />;
            case 'order_created': return <ShoppingCart className="h-4 w-4 text-blue-500" />;
            case 'expense_pending': return <Receipt className="h-4 w-4 text-orange-500" />;
            case 'expense_approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'expense_rejected': return <X className="h-4 w-4 text-red-500" />;
            case 'visit': return <MapPin className="h-4 w-4 text-blue-500" />;
            case 'invoice_due_today': return <Clock className="h-4 w-4 text-orange-500" />;
            case 'invoice_due_tomorrow': return <Clock className="h-4 w-4 text-yellow-500" />;
            case 'invoice_overdue': return <AlertCircle className="h-4 w-4 text-red-500" />;
            case 'payment_received': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'installment_due': return <Receipt className="h-4 w-4 text-orange-500" />;
            case 'daily_report':
            case 'weekly_report': return <Package className="h-4 w-4 text-blue-500" />;
            default: return <AlertCircle className="h-4 w-4 text-blue-500" />;
        }
    };

    // Check if notification is actionable (has a destination)
    const isActionable = (notif) => {
        return getNavigationPath(notif) !== null;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                onClick={handleBellClick}
                className="relative"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </Button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <h3 className="font-semibold text-slate-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-xs">
                                <Check className="h-3 w-3 mr-1" /> Mark all read
                            </Button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <Bell className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                                <p className="text-sm">No notifications</p>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className={`p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group ${!notif.is_read ? 'bg-blue-50/50' : ''
                                        }`}
                                    onClick={() => handleNotificationClick(notif)}
                                >
                                    <div className="flex gap-3">
                                        <div className="flex-shrink-0 mt-0.5">
                                            {getIcon(notif.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${!notif.is_read ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                                                {notif.title}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                {notif.message}
                                            </p>
                                            <div className="flex items-center justify-between mt-1">
                                                <p className="text-xs text-slate-400">
                                                    {format(new Date(notif.created_at), 'PP p')}
                                                </p>
                                                {isActionable(notif) && (
                                                    <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ExternalLink className="h-3 w-3" />
                                                        View
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {!notif.is_read && (
                                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;

