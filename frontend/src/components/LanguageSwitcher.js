import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Languages } from 'lucide-react';

const LanguageSwitcher = () => {
  const { language, toggleLanguage } = useLanguage();

  return (
    <Button
      data-testid="language-switcher"
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="rounded-full font-medium"
    >
      <Languages className="h-4 w-4 mr-2" />
      {language === 'ar' ? 'English' : 'العربية'}
    </Button>
  );
};

export default LanguageSwitcher;