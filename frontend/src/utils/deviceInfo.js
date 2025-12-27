/**
 * Device Information Utility
 * Captures browser, device type, OS, and external IP silently
 */

// Parse user agent to get browser info
export const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let version = '';

    if (ua.includes('Firefox/')) {
        browser = 'Firefox';
        version = ua.match(/Firefox\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Edg/')) {
        browser = 'Edge';
        version = ua.match(/Edg\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Chrome/')) {
        browser = 'Chrome';
        version = ua.match(/Chrome\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
        browser = 'Safari';
        version = ua.match(/Version\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Opera') || ua.includes('OPR/')) {
        browser = 'Opera';
        version = ua.match(/(?:Opera|OPR)\/([0-9.]+)/)?.[1] || '';
    }

    return { browser, version };
};

// Get device type
export const getDeviceType = () => {
    const ua = navigator.userAgent.toLowerCase();

    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        return 'tablet';
    }
    if (/mobile|iphone|ipod|android.*mobile|webos|blackberry|opera mini|opera mobi/i.test(ua)) {
        return 'mobile';
    }
    return 'desktop';
};

// Get operating system
export const getOS = () => {
    const ua = navigator.userAgent;

    if (ua.includes('Windows NT 10')) return 'Windows 10';
    if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
    if (ua.includes('Windows NT 6.2')) return 'Windows 8';
    if (ua.includes('Windows NT 6.1')) return 'Windows 7';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS X')) {
        const version = ua.match(/Mac OS X ([0-9_]+)/)?.[1]?.replace(/_/g, '.');
        return `macOS ${version || ''}`.trim();
    }
    if (ua.includes('Android')) {
        const version = ua.match(/Android ([0-9.]+)/)?.[1];
        return `Android ${version || ''}`.trim();
    }
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
        const version = ua.match(/OS ([0-9_]+)/)?.[1]?.replace(/_/g, '.');
        return `iOS ${version || ''}`.trim();
    }
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown';
};

// Get screen info
export const getScreenInfo = () => {
    return {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: window.screen.orientation?.type || 'unknown'
    };
};

// Get connection info
export const getConnectionInfo = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
        return {
            type: connection.effectiveType || connection.type || 'unknown',
            downlink: connection.downlink,
            rtt: connection.rtt,
            saveData: connection.saveData
        };
    }
    return { type: 'unknown' };
};

// Get external IP address (uses free API)
let cachedIP = null;
export const getExternalIP = async () => {
    if (cachedIP) return cachedIP;

    try {
        // Try multiple free IP APIs
        const apis = [
            'https://api.ipify.org?format=json',
            'https://api.ip.sb/jsonip',
            'https://ipinfo.io/json'
        ];

        for (const api of apis) {
            try {
                const response = await fetch(api, { timeout: 3000 });
                if (response.ok) {
                    const data = await response.json();
                    cachedIP = data.ip || data.origin;
                    return cachedIP;
                }
            } catch {
                continue;
            }
        }
    } catch {
        // Could not get external IP - silent fail
    }
    return null;
};

// Get comprehensive device info
export const getDeviceInfo = async () => {
    const browserInfo = getBrowserInfo();
    const screen = getScreenInfo();
    const connection = getConnectionInfo();

    return {
        browser: browserInfo.browser,
        browserVersion: browserInfo.version,
        deviceType: getDeviceType(),
        os: getOS(),
        screen: `${screen.width}x${screen.height}`,
        pixelRatio: screen.pixelRatio,
        connection: connection.type,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent
    };
};

// Format device info as a readable string
export const getDeviceInfoString = async () => {
    const info = await getDeviceInfo();
    return `${info.browser} ${info.browserVersion} | ${info.os} | ${info.deviceType} | ${info.screen}`;
};

// Store device info in localStorage
export const cacheDeviceInfo = async () => {
    try {
        const info = await getDeviceInfo();
        const ip = await getExternalIP();
        const fullInfo = { ...info, externalIP: ip, timestamp: new Date().toISOString() };
        localStorage.setItem('deviceInfo', JSON.stringify(fullInfo));
        return fullInfo;
    } catch (error) {
        console.error('Failed to cache device info:', error);
        return null;
    }
};

// Get cached device info
export const getCachedDeviceInfo = () => {
    try {
        const cached = localStorage.getItem('deviceInfo');
        return cached ? JSON.parse(cached) : null;
    } catch {
        return null;
    }
};
