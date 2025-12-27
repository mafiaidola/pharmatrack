import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language');
    return saved || 'ar'; // Arabic as default
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

    // Update body class for font switching
    document.body.className = language === 'ar' ? 'font-arabic' : 'font-english';
  }, [language]);

  const t = (key) => {
    return translations[language][key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ar' ? 'en' : 'ar');
  };

  const value = {
    language,
    setLanguage,
    toggleLanguage,
    t,
    isRTL: language === 'ar',
    formatCurrency: (amount) => {
      if (amount === null || amount === undefined) return '';
      const num = parseFloat(amount);
      if (isNaN(num)) return amount;

      const formatter = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', {
        style: 'currency',
        currency: 'EGP',
        minimumFractionDigits: 2
      });
      return formatter.format(num);
    }
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};