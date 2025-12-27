import React, { useState, useEffect, useRef } from 'react';
import { Search, Building2, User, ShoppingCart, X } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

const GlobalSearchBar = () => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ clinics: [], users: [], orders: [] });
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const searchTimeout = setTimeout(() => {
            if (query.length >= 2) {
                performSearch();
            } else {
                setResults({ clinics: [], users: [], orders: [] });
            }
        }, 300); // Debounce 300ms

        return () => clearTimeout(searchTimeout);
    }, [query]);

    const performSearch = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/ search ? q = ${encodeURIComponent(query)}& limit=5`);
            setResults(response.data);
            setIsOpen(true);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleResultClick = (type, id) => {
        setIsOpen(false);
        setQuery('');
        switch (type) {
            case 'clinic':
                navigate(`/ clinics ? id = ${id} `);
                break;
            case 'user':
                navigate(`/ users ? id = ${id} `);
                break;
            case 'order':
                navigate(`/ orders ? id = ${id} `);
                break;
            default:
                break;
        }
    };

    const totalResults = results.clinics.length + results.users.length + results.orders.length;

    return (
        <div ref={searchRef} className="relative w-full max-w-md">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    className="pl-10 pr-10 bg-white border-slate-200 focus:border-primary"
                />
                {query && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => { setQuery(''); setResults({ clinics: [], users: [], orders: [] }); }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && query.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                        </div>
                    ) : totalResults === 0 ? (
                        <div className="p-4 text-center text-slate-500">
                            <Search className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">{t('noResultsFor')} "{query}"</p>
                        </div>
                    ) : (
                        <>
                            {/* Clinics */}
                            {results.clinics.length > 0 && (
                                <div className="p-2">
                                    <p className="text-xs font-semibold text-slate-400 px-2 mb-1">{t('clinics')}</p>
                                    {results.clinics.map((clinic) => (
                                        <div
                                            key={clinic.id}
                                            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer"
                                            onClick={() => handleResultClick('clinic', clinic.id)}
                                        >
                                            <Building2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">{clinic.name}</p>
                                                <p className="text-xs text-slate-500 truncate">{clinic.address || 'No address'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Users */}
                            {results.users.length > 0 && (
                                <div className="p-2 border-t border-slate-100">
                                    <p className="text-xs font-semibold text-slate-400 px-2 mb-1">{t('users')}</p>
                                    {results.users.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer"
                                            onClick={() => handleResultClick('user', user.id)}
                                        >
                                            <User className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">{user.full_name}</p>
                                                <p className="text-xs text-slate-500">@{user.username} • {user.role}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Orders */}
                            {results.orders.length > 0 && (
                                <div className="p-2 border-t border-slate-100">
                                    <p className="text-xs font-semibold text-slate-400 px-2 mb-1">{t('orders')}</p>
                                    {results.orders.map((order) => (
                                        <div
                                            key={order.id}
                                            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer"
                                            onClick={() => handleResultClick('order', order.id)}
                                        >
                                            <ShoppingCart className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">{order.clinic_name}</p>
                                                <p className="text-xs text-slate-500">{order.status} • {order.total_amount} EGP</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearchBar;
