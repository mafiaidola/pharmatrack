import React, { useState } from 'react';
import { toast } from 'sonner';
import api from '../utils/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Stethoscope } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { initializeGPS } from '../utils/gps';
import { getDeviceInfoString, getExternalIP } from '../utils/deviceInfo';
import ParticlesBg from 'particles-bg';

const Login = ({ onLogin }) => {
  const { t } = useLanguage();
  const { siteSettings, getImageUrl } = useSiteSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    let latitude = null;
    let longitude = null;
    let deviceInfo = navigator.userAgent;
    let externalIP = null;

    // Get device info and location in background (non-blocking)
    try {
      deviceInfo = await getDeviceInfoString().catch(() => navigator.userAgent);
      externalIP = await getExternalIP().catch(() => null);
      const gpsResult = await initializeGPS().catch(() => null);
      if (gpsResult?.success && gpsResult?.location) {
        latitude = gpsResult.location.latitude;
        longitude = gpsResult.location.longitude;
      }
    } catch {
      // Silent fail
    }

    try {
      const response = await api.post('/auth/login', {
        username,
        password,
        latitude,
        longitude,
        device_info: deviceInfo,
        external_ip: externalIP
      });

      const { access_token, user } = response.data;
      onLogin(user, access_token);
      toast.success(t('loginSuccessful'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Get all customization settings with defaults
  const particleType = siteSettings?.login_particle_type || 'none';
  const particleColor = siteSettings?.login_particle_color || '#6366f1';
  const showParticles = particleType && particleType !== 'none';

  // Colors
  const leftGradientFrom = siteSettings?.login_left_gradient_from || '#f0fdfa';
  const leftGradientTo = siteSettings?.login_left_gradient_to || '#ccfbf1';
  const rightBgColor = siteSettings?.login_right_bg_color || '#ffffff';
  const formBgColor = siteSettings?.login_form_bg_color || '#ffffff';
  const textColor = siteSettings?.login_text_color || '#0f172a';
  const subtitleColor = siteSettings?.login_subtitle_color || '#64748b';
  const buttonColor = siteSettings?.login_button_color || '#14b8a6';
  const buttonTextColor = siteSettings?.login_button_text_color || '#ffffff';

  // Display options
  const showDecorations = siteSettings?.login_show_decorations !== false;
  const showImageRing = siteSettings?.login_show_image_ring !== false;
  const useGlassmorphism = siteSettings?.login_glassmorphism !== false;

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Particles Background */}
      {showParticles && (
        <div className="fixed inset-0 z-0">
          <ParticlesBg
            type={particleType === 'random' ? 'random' : particleType}
            bg={true}
            color={particleColor}
            num={particleType === 'cobweb' || particleType === 'lines' ? 80 : 150}
          />
        </div>
      )}

      {/* Left side - Image */}
      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative z-10"
        style={{
          background: `linear-gradient(to bottom right, ${leftGradientFrom}, ${leftGradientTo})`,
          backdropFilter: showParticles ? 'blur(4px)' : undefined
        }}
      >
        <div className="max-w-md relative">
          {/* Decorative elements */}
          {showDecorations && (
            <>
              <div
                className="absolute -top-6 -left-6 w-24 h-24 rounded-full blur-xl"
                style={{ background: `linear-gradient(to bottom right, ${buttonColor}33, transparent)` }}
              />
              <div
                className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full blur-xl"
                style={{ background: `linear-gradient(to bottom right, ${leftGradientTo}66, transparent)` }}
              />
            </>
          )}

          <img
            src={getImageUrl(siteSettings?.login_background_url) || "https://images.pexels.com/photos/5407206/pexels-photo-5407206.jpeg"}
            alt="Login Background"
            className={`rounded-2xl shadow-2xl object-cover w-full h-[600px] relative z-10 ${showImageRing ? 'ring-4 ring-white/50' : ''}`}
          />
        </div>
      </div>

      {/* Right side - Form */}
      <div
        className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10"
        style={{
          backgroundColor: showParticles ? `${rightBgColor}cc` : rightBgColor,
          backdropFilter: showParticles ? 'blur(12px)' : undefined
        }}
      >
        <div className="absolute top-4 right-4 z-20">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          {/* Logo & Title */}
          <div className="text-center">
            {siteSettings?.logo_url || siteSettings?.login_logo_url ? (
              <div className="flex justify-center mb-6">
                <img
                  src={getImageUrl(siteSettings.login_logo_url || siteSettings.logo_url)}
                  alt="Logo"
                  className="h-20 w-auto object-contain drop-shadow-lg hover:scale-105 transition-transform duration-300"
                />
              </div>
            ) : (
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg hover:scale-105 transition-transform duration-300"
                style={{ backgroundColor: buttonColor }}
              >
                <Stethoscope className="h-10 w-10 text-white" />
              </div>
            )}
            <h1
              className="text-4xl font-bold mb-2"
              style={{ color: textColor }}
            >
              {siteSettings?.login_title || t('medtrackShort')}
            </h1>
            <p style={{ color: subtitleColor }}>
              {siteSettings?.login_subtitle || t('medtrack')}
            </p>
          </div>

          {/* Login Form */}
          <form
            onSubmit={handleSubmit}
            className={`space-y-6 p-8 rounded-2xl shadow-xl border ${useGlassmorphism ? 'border-white/50' : 'border-slate-200'}`}
            style={{
              backgroundColor: useGlassmorphism ? `${formBgColor}b3` : formBgColor,
              backdropFilter: useGlassmorphism ? 'blur(8px)' : undefined
            }}
            data-testid="login-form"
          >
            <div className="space-y-2">
              <Label htmlFor="username" style={{ color: textColor }}>{t('username')}</Label>
              <Input
                id="username"
                data-testid="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('enterUsername')}
                required
                className="h-12 bg-white/80 border-slate-200 transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" style={{ color: textColor }}>{t('password')}</Label>
              <Input
                id="password"
                data-testid="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('enterPassword')}
                required
                className="h-12 bg-white/80 border-slate-200 transition-all"
              />
            </div>

            <Button
              data-testid="login-submit-button"
              type="submit"
              className="w-full h-12 rounded-full font-medium text-base shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5"
              style={{
                backgroundColor: buttonColor,
                color: buttonTextColor,
                boxShadow: `0 10px 25px -5px ${buttonColor}40`
              }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('signingIn')}
                </span>
              ) : t('signIn')}
            </Button>
          </form>

          <div className="text-center text-sm" style={{ color: subtitleColor }}>
            <p className="opacity-70">{t('demoCredentials')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;