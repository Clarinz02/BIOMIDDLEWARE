#!/usr/bin/env node
/**
 * Express Server for Biometric Device Middleware Frontend
 * 
 * This server provides a REST API for the frontend to interact with biometric devices.
 * It serves the web interface and handles all device communication.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { BiometricDeviceMiddleware, BiometricDeviceError } = require('./biometric-middleware');
const { apiKeyManager } = require('./api-key-manager');
const { DeviceManager } = require('./device-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global device manager instance
const deviceManager = new DeviceManager();

// API Key validation middleware
function validateAPIKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required. Provide via X-API-Key header or api_key query parameter.'
        });
    }
    
    const keyInfo = apiKeyManager.validateKey(apiKey);
    if (!keyInfo) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or inactive API key'
        });
    }
    
    // Add key info to request for logging/tracking
    req.apiKeyInfo = keyInfo;
    next();
}

// Optional API key validation (allows access without key but logs if present)
function optionalAPIKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (apiKey) {
        const keyInfo = apiKeyManager.validateKey(apiKey);
        if (keyInfo) {
            req.apiKeyInfo = keyInfo;
        }
    }
    
    next();
}

// Helper function to get device from request
function getDeviceFromRequest(req) {
    const deviceId = req.query.deviceId || req.body.deviceId || req.headers['x-device-id'] || 'default';
    return deviceManager.getDevice(deviceId);
}

// Error handler middleware
function handleError(res, error) {
    console.error('API Error:', error);
    
    if (error instanceof BiometricDeviceError) {
        res.status(400).json({
            success: false,
            error: error.message,
            errorCode: error.errorCode,
            arguments: error.arguments
        });
    } else {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Multi-Device Configuration Routes
app.get('/api/devices', async (req, res) => {
    try {
        const overview = deviceManager.getSystemOverview();
        res.json({ success: true, data: overview });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices', async (req, res) => {
    try {
        const { deviceId, name, ip, apiKey, useHttps, wifiNetwork, branch, location, autoReconnect } = req.body;
        
        if (!deviceId || !ip) {
            return res.status(400).json({
                success: false,
                error: 'deviceId and ip are required'
            });
        }
        
        const config = await deviceManager.addDevice(deviceId, {
            name,
            ip,
            apiKey,
            useHttps: useHttps || false,
            wifiNetwork,
            branch: branch || 'main',
            location,
            autoReconnect: autoReconnect !== false
        });
        
        res.json({
            success: true,
            message: 'Device added successfully',
            data: config
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/connect', async (req, res) => {
    try {
        const { deviceId } = req.params;
        await deviceManager.connectDevice(deviceId);
        
        res.json({
            success: true,
            message: `Connected to device: ${deviceId}`,
            data: deviceManager.getDeviceStatus(deviceId)
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/disconnect', async (req, res) => {
    try {
        const { deviceId } = req.params;
        await deviceManager.disconnectDevice(deviceId);
        
        res.json({
            success: true,
            message: `Disconnected from device: ${deviceId}`,
            data: deviceManager.getDeviceStatus(deviceId)
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const status = deviceManager.getDeviceStatus(deviceId);
        
        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }
        
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

app.put('/api/devices/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const updates = req.body;
        
        const updatedConfig = await deviceManager.updateDeviceConfig(deviceId, updates);
        
        res.json({
            success: true,
            message: 'Device configuration updated',
            data: updatedConfig
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.delete('/api/devices/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        await deviceManager.removeDevice(deviceId);
        
        res.json({
            success: true,
            message: `Device removed: ${deviceId}`
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/test', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const result = await deviceManager.testDevice(deviceId);
        
        res.json({ success: true, data: result });
    } catch (error) {
        handleError(res, error);
    }
});

// Legacy single-device routes for backward compatibility
app.post('/api/device/connect', async (req, res) => {
    try {
        const { ip, apiKey, useHttps, deviceId } = req.body;
        const finalDeviceId = deviceId || 'default';
        
        // Add or update device
        await deviceManager.addDevice(finalDeviceId, {
            name: 'Default Device',
            ip,
            apiKey,
            useHttps: useHttps || false
        });
        
        // Connect to device
        await deviceManager.connectDevice(finalDeviceId);
        
        res.json({
            success: true,
            message: 'Device connection configured',
            data: deviceManager.getDeviceStatus(finalDeviceId)
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/device/config', (req, res) => {
    try {
        const overview = deviceManager.getSystemOverview();
        const defaultDevice = overview.devices.find(d => d.deviceId === 'default') || overview.devices[0];
        
        if (defaultDevice) {
            res.json({
                success: true,
                config: {
                    ip: defaultDevice.ip,
                    apiKey: 'configured',
                    useHttps: false
                },
                connected: defaultDevice.connected
            });
        } else {
            res.json({
                success: true,
                config: {
                    ip: '192.168.1.100',
                    apiKey: null,
                    useHttps: false
                },
                connected: false
            });
        }
    } catch (error) {
        handleError(res, error);
    }
});

// Device Information Routes (supports device selection via deviceId parameter)
app.get('/api/devices/:deviceId/version', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const info = await device.getVersionInfo();
        res.json({ success: true, data: info });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/capabilities', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const capabilities = await device.getDeviceCapabilities();
        res.json({ success: true, data: capabilities });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/usage', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const usage = await device.getCurrentUsage();
        const limits = await device.getCapacityLimit();
        res.json({ success: true, data: { usage, limits } });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/uid', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const uid = await device.getDeviceUid();
        res.json({ success: true, data: { uid } });
    } catch (error) {
        handleError(res, error);
    }
});

// Legacy single-device routes (backward compatibility)
app.get('/api/device/version', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const info = await device.getVersionInfo();
        res.json({ success: true, data: info });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/device/capabilities', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const capabilities = await device.getDeviceCapabilities();
        res.json({ success: true, data: capabilities });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/device/usage', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const usage = await device.getCurrentUsage();
        const limits = await device.getCapacityLimit();
        res.json({ success: true, data: { usage, limits } });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/device/uid', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const uid = await device.getDeviceUid();
        res.json({ success: true, data: { uid } });
    } catch (error) {
        handleError(res, error);
    }
});

// Time Management Routes
app.get('/api/device/time', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const time = await device.getDeviceTime();
        res.json({ success: true, data: { time } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/time', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { time } = req.body;
        await device.setDeviceTime(time);
        res.json({ success: true, message: 'Device time updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// Device Settings Routes
app.get('/api/device/volume', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const volume = await device.getSoundVolume();
        res.json({ success: true, data: { volume } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/volume', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { volume } = req.body;
        await device.setSoundVolume(volume);
        res.json({ success: true, message: 'Volume updated' });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/device/verify-mode', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const mode = await device.getVerifyMode();
        res.json({ success: true, data: { mode } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/verify-mode', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { mode } = req.body;
        await device.setVerifyMode(mode);
        res.json({ success: true, message: 'Verify mode updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// Device Control Routes
app.post('/api/device/lock', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { locked } = req.body;
        await device.lockDevice(locked);
        res.json({ success: true, message: locked ? 'Device locked' : 'Device unlocked' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/control', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { action } = req.body;
        await device.deviceControl(action);
        res.json({ success: true, message: `Action ${action} completed` });
    } catch (error) {
        handleError(res, error);
    }
});

// Network Configuration Routes
app.get('/api/device/network', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const config = await device.getNetworkConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/network', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { config } = req.body;
        await device.setNetworkConfig(config);
        res.json({ success: true, message: 'Network configuration updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// User Management Routes
app.get('/api/users', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const userIds = await device.getAllUserIds();
        res.json({ success: true, data: userIds });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const userInfo = await device.getUserInfo(req.params.id);
        res.json({ success: true, data: userInfo });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/users', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        await device.setUserInfo(req.body);
        res.json({ success: true, message: 'User created/updated successfully' });
    } catch (error) {
        handleError(res, error);
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        await device.deleteUserInfo(req.params.id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        handleError(res, error);
    }
});

// Enrollment Routes
app.post('/api/enrollment/face', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const jobId = await device.beginEnrollFace();
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/fingerprint', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const jobId = await device.beginEnrollFingerprint();
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/card', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const jobId = await device.beginEnrollCard();
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/palm', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const jobId = await device.beginEnrollPalm();
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/enrollment/status/:jobId', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const status = await device.queryJobStatus(parseInt(req.params.jobId));
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/cancel/:jobId', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        await device.cancelJob(parseInt(req.params.jobId));
        res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/cancel-all', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        await device.cancelAllJobs();
        res.json({ success: true, message: 'All jobs cancelled' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/enrollment/photo-to-face', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { photoBase64 } = req.body;
        const result = await device.photoToFaceData(photoBase64);
        res.json({ success: true, data: result });
    } catch (error) {
        handleError(res, error);
    }
});

// Attendance Routes
app.get('/api/attendance', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { startPos } = req.query;
        const logs = await device.getAttendLog(startPos ? parseInt(startPos) : null);
        res.json({ success: true, data: logs });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/attendance/all', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const logs = await device.getAllAttendLogs();
        res.json({ success: true, data: logs });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/attendance/erase', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { endPos } = req.body;
        await device.eraseAttendLog(endPos);
        res.json({ success: true, message: 'Attendance logs erased' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/attendance/uploader', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const { targetUri, interval } = req.body;
        await device.configAttendLogUploader(targetUri, interval);
        res.json({ success: true, message: 'Attendance uploader configured' });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/attendance/uploader/status', async (req, res) => {
    try {
        if (!device) throw new Error('Device not initialized');
        const status = await device.getAttendLogUploaderStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

// API Key Management Routes
app.get('/api/keys', (req, res) => {
    try {
        const keys = apiKeyManager.getAllKeys();
        res.json({ success: true, data: keys });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/keys/generate', (req, res) => {
    try {
        const { name, deviceId } = req.body;
        const newKey = apiKeyManager.generateKey(name, deviceId);
        res.json({ 
            success: true, 
            data: {
                id: newKey.id,
                key: newKey.key, // Only show full key on generation
                name: newKey.name,
                deviceId: newKey.deviceId,
                createdAt: newKey.createdAt
            }
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/keys/:id/deactivate', (req, res) => {
    try {
        const success = apiKeyManager.deactivateKey(req.params.id);
        if (success) {
            res.json({ success: true, message: 'API key deactivated' });
        } else {
            res.status(404).json({ success: false, error: 'API key not found' });
        }
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/keys/:id/reactivate', (req, res) => {
    try {
        const success = apiKeyManager.reactivateKey(req.params.id);
        if (success) {
            res.json({ success: true, message: 'API key reactivated' });
        } else {
            res.status(404).json({ success: false, error: 'API key not found' });
        }
    } catch (error) {
        handleError(res, error);
    }
});

app.delete('/api/keys/:id', (req, res) => {
    try {
        const success = apiKeyManager.deleteKey(req.params.id);
        if (success) {
            res.json({ success: true, message: 'API key deleted' });
        } else {
            res.status(404).json({ success: false, error: 'API key not found' });
        }
    } catch (error) {
        handleError(res, error);
    }
});

app.put('/api/keys/:id', (req, res) => {
    try {
        const { name, permissions } = req.body;
        let updated = false;
        
        if (name !== undefined) {
            updated = apiKeyManager.updateName(req.params.id, name) || updated;
        }
        
        if (permissions !== undefined) {
            updated = apiKeyManager.updatePermissions(req.params.id, permissions) || updated;
        }
        
        if (updated) {
            res.json({ success: true, message: 'API key updated' });
        } else {
            res.status(404).json({ success: false, error: 'API key not found' });
        }
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/keys/:id/qr', (req, res) => {
    try {
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        const qrData = apiKeyManager.generateQRData(req.params.id, serverUrl);
        
        if (qrData) {
            res.json({ success: true, data: qrData });
        } else {
            res.status(404).json({ success: false, error: 'API key not found or inactive' });
        }
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/keys/stats', (req, res) => {
    try {
        const stats = apiKeyManager.getUsageStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/keys/create-defaults', async (req, res) => {
    try {
        const keys = await apiKeyManager.createDefaultKeys();
        res.json({ 
            success: true, 
            data: keys.map(k => ({
                id: k.id,
                name: k.name,
                deviceId: k.deviceId,
                key: k.key // Show full keys for initial setup
            }))
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/keys/cleanup', async (req, res) => {
    try {
        const { daysOld } = req.body;
        const deletedCount = await apiKeyManager.cleanupOldKeys(daysOld || 30);
        res.json({ 
            success: true, 
            message: `Cleaned up ${deletedCount} old unused API keys`
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Initialize device on startup if environment variables are set
if (process.env.DEVICE_IP) {
    initializeDevice();
}

// Initialize API key manager and create default key if none exist
apiKeyManager.init().then(() => {
    const stats = apiKeyManager.getUsageStats();
    if (stats.totalKeys === 0) {
        console.log('🔑 No API keys found, creating default key...');
        const defaultKey = apiKeyManager.generateKey('Default System Key', 'system');
        console.log(`🔑 Default API key created: ${defaultKey.key}`);
        console.log('💡 Use this key to connect devices or create additional keys via the web interface');
    } else {
        console.log(`🔑 Loaded ${stats.totalKeys} API keys (${stats.activeKeys} active)`);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Biometric Device Frontend Server running on http://localhost:${PORT}`);
    console.log(`📱 Device configured for: ${deviceConfig.ip}`);
    console.log(`🔑 API Key: ${deviceConfig.apiKey || 'Not set'}`);
    console.log('\nEnvironment variables:');
    console.log('  DEVICE_IP - Set the device IP address');
    console.log('  API_KEY - Set the device API key');
    console.log('  PORT - Set the server port (default: 3000)');
});

module.exports = app;
