/**
 * WhatsApp Gateway Service using WhiskeySockets/Baileys
 * Free WhatsApp messaging for internal notifications
 */

const express = require('express');
const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// CORS for frontend access
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// State
let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let lastError = null;

// Auth folder
const AUTH_FOLDER = path.join(__dirname, 'auth_info');

// Initialize WhatsApp connection
async function initializeWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }),
            browser: ['EP-EG System', 'Chrome', '120.0.0'],
        });

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Generate QR code as data URL
                qrCode = await QRCode.toDataURL(qr);
                connectionStatus = 'waiting_for_scan';
                console.log('📱 QR Code generated - scan to connect');
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Connection closed, reconnecting:', shouldReconnect);
                connectionStatus = 'disconnected';
                lastError = lastDisconnect?.error?.message;

                if (shouldReconnect) {
                    setTimeout(initializeWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp connected successfully!');
                connectionStatus = 'connected';
                qrCode = null;
                lastError = null;
            }
        });

        // Save credentials on update
        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error('❌ Failed to initialize WhatsApp:', error);
        connectionStatus = 'error';
        lastError = error.message;
    }
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'whatsapp-gateway' });
});

// Get connection status
app.get('/status', (req, res) => {
    res.json({
        status: connectionStatus,
        connected: connectionStatus === 'connected',
        error: lastError,
        hasQR: !!qrCode
    });
});

// Get QR code for scanning
app.get('/qr', (req, res) => {
    if (connectionStatus === 'connected') {
        return res.json({ status: 'already_connected', message: 'Already connected to WhatsApp' });
    }

    if (!qrCode) {
        return res.json({ status: 'no_qr', message: 'No QR code available. Initializing...' });
    }

    res.json({ status: 'qr_ready', qr: qrCode });
});

// Send message
app.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'Phone and message required' });
        }

        if (connectionStatus !== 'connected' || !sock) {
            return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
        }

        // Format phone number (Egypt: 20xxxxxxxxxx)
        let formattedPhone = phone.replace(/[\s\-\+\(\)]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '20' + formattedPhone.substring(1);
        }
        if (!formattedPhone.startsWith('20')) {
            formattedPhone = '20' + formattedPhone;
        }

        const jid = formattedPhone + '@s.whatsapp.net';

        // Send message
        await sock.sendMessage(jid, { text: message });

        console.log(`✅ Message sent to ${formattedPhone}`);
        res.json({ success: true, message: 'Message sent successfully' });

    } catch (error) {
        console.error('❌ Failed to send message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect
app.post('/disconnect', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
            sock = null;
        }

        // Clear auth folder
        if (fs.existsSync(AUTH_FOLDER)) {
            fs.rmSync(AUTH_FOLDER, { recursive: true });
        }

        connectionStatus = 'disconnected';
        qrCode = null;

        res.json({ success: true, message: 'Disconnected successfully' });

        // Reinitialize for new QR
        setTimeout(initializeWhatsApp, 2000);

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reconnect
app.post('/reconnect', async (req, res) => {
    try {
        if (sock) {
            sock.end();
            sock = null;
        }

        connectionStatus = 'reconnecting';
        await initializeWhatsApp();

        res.json({ success: true, message: 'Reconnecting...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Gateway running on port ${PORT}`);
    initializeWhatsApp();
});
