import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { getBackendBaseUrl } from '../utils/api';

const SiteSettingsContext = createContext();

export const useSiteSettings = () => useContext(SiteSettingsContext);

export const SiteSettingsProvider = ({ children }) => {
    const [siteSettings, setSiteSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchSiteSettings = async () => {
        try {
            const response = await api.get('/site-settings');
            setSiteSettings(response.data);
            applySettings(response.data);
        } catch (error) {
            console.error('Failed to load site settings:', error);
        } finally {
            setLoading(false);
        }
    };

    // Helper to convert Hex to HSL channels (e.g., "172 66% 50%")
    const hexToHSL = (hex) => {
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;

        let r = parseInt(result[1], 16);
        let g = parseInt(result[2], 16);
        let b = parseInt(result[3], 16);

        r /= 255;
        g /= 255;
        b /= 255;

        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        h = Math.round(h * 360);
        s = Math.round(s * 100);
        l = Math.round(l * 100);

        return `${h} ${s}% ${l}%`;
    };

    const applySettings = (settings) => {
        if (!settings) return;

        // Update document title
        if (settings.site_title) {
            document.title = settings.site_title;
        }

        // Update favicon if provided
        if (settings.favicon_url) {
            const link = document.querySelector("link[rel~='icon']");
            if (link) {
                link.href = getImageUrl(settings.favicon_url);
            } else {
                const newLink = document.createElement('link');
                newLink.rel = 'icon';
                newLink.href = getImageUrl(settings.favicon_url);
                document.head.appendChild(newLink);
            }
        }

        // Apply primary color to CSS variables
        if (settings.primary_color) {
            const hslValue = hexToHSL(settings.primary_color);
            if (hslValue) {
                document.documentElement.style.setProperty('--primary', hslValue);
                document.documentElement.style.setProperty('--ring', hslValue); // Also update ring color
            }
        }
    };

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `${getBackendBaseUrl()}${path}`;
    };

    useEffect(() => {
        fetchSiteSettings();
    }, []);

    return (
        <SiteSettingsContext.Provider value={{ siteSettings, loading, getImageUrl, refreshSettings: fetchSiteSettings }}>
            {children}
        </SiteSettingsContext.Provider>
    );
};
