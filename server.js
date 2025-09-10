#!/usr/bin/env node
/**
 * Multi-Device Express Server for Biometric Device Middleware
 * 
 * This server provides a REST API for managing multiple biometric devices
 * across different network connections and branches.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { BiometricDeviceMiddleware, BiometricDeviceError } = require('./biometric-middleware');
const { apiKeyManager } = require('./api-key-manager');
const { DeviceManager } = require('./device-manager');
const DatabaseService = require('./services/DatabaseService');
const EmployeeService = require('./services/EmployeeService');
const DeviceSyncService = require('./services/DeviceSyncService');
const BranchService = require('./services/BranchService');

const app = express();
const PORT = process.env.PORT || 5173;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global service instances
const deviceManager = new DeviceManager();
const databaseService = new DatabaseService();
const employeeService = new EmployeeService(databaseService);
const deviceSyncService = new DeviceSyncService(databaseService, deviceManager);
const branchService = new BranchService(databaseService);

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

// ======================
// DEVICE MANAGEMENT ROUTES
// ======================

// Get all devices overview
app.get('/api/devices', async (req, res) => {
    try {
        const overview = deviceManager.getSystemOverview();
        res.json({ success: true, data: overview });
    } catch (error) {
        handleError(res, error);
    }
});

// Add new device
app.post('/api/devices', async (req, res) => {
    try {
        const { deviceId, name, ip, apiKey, useHttps, wifiNetwork, branch, branchName, location, autoReconnect } = req.body;
        
        if (!deviceId || !ip) {
            return res.status(400).json({
                success: false,
                error: 'deviceId and ip are required'
            });
        }
        
        let branchId = branch || 'main';
        let createdBranch = null;
        
        // If a new branch is specified, try to create it
        if (branch && branch !== 'main') {
            try {
                // Check if branch already exists
                const existingBranch = await branchService.getBranchByCode(branch.toUpperCase());
                if (existingBranch) {
                    branchId = existingBranch.id;
                } else {
                    // Create new branch
                    const newBranchData = {
                        name: branchName || branchService.formatBranchName(branch),
                        code: branch.toUpperCase(),
                        description: `Branch created for device: ${name || deviceId}`,
                        address: location || '',
                        status: 'active'
                    };
                    createdBranch = await branchService.createBranch(newBranchData);
                    branchId = createdBranch.id;
                }
            } catch (branchError) {
                console.warn(`⚠️ Could not create branch ${branch}:`, branchError.message);
                // Continue with default branch if branch creation fails
                branchId = 'main';
            }
        }
        
        const config = await deviceManager.addDevice(deviceId, {
            name,
            ip,
            apiKey,
            useHttps: useHttps || false,
            wifiNetwork,
            branch: branchId,
            location,
            autoReconnect: autoReconnect !== false
        });
        
        const response = {
            success: true,
            message: 'Device added successfully',
            data: config
        };
        
        if (createdBranch) {
            response.message += ` and branch '${createdBranch.name}' created`;
            response.branch = createdBranch;
        }
        
        res.json(response);
    } catch (error) {
        handleError(res, error);
    }
});

// Get specific device info
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

// Update device configuration
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

// Delete device
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

// Connect to device
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

// Disconnect from device
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

// Test device connectivity
app.get('/api/devices/:deviceId/test', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const result = await deviceManager.testDevice(deviceId);
        
        res.json({ success: true, data: result });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// DEVICE OPERATION ROUTES (Multi-Device)
// ======================

// Device Information Routes
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

// Time Management Routes
app.get('/api/devices/:deviceId/time', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const time = await device.getDeviceTime();
        res.json({ success: true, data: { time } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/time', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { time } = req.body;
        await device.setDeviceTime(time);
        res.json({ success: true, message: 'Device time updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// Device Settings Routes
app.get('/api/devices/:deviceId/volume', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const volume = await device.getSoundVolume();
        res.json({ success: true, data: { volume } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/volume', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { volume } = req.body;
        await device.setSoundVolume(volume);
        res.json({ success: true, message: 'Volume updated' });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/verify-mode', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const mode = await device.getVerifyMode();
        res.json({ success: true, data: { mode } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/verify-mode', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { mode } = req.body;
        await device.setVerifyMode(mode);
        res.json({ success: true, message: 'Verify mode updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// Device Control Routes
app.post('/api/devices/:deviceId/lock', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { locked } = req.body;
        await device.lockDevice(locked);
        res.json({ success: true, message: locked ? 'Device locked' : 'Device unlocked' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/control', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { action } = req.body;
        await device.deviceControl(action);
        res.json({ success: true, message: `Action ${action} completed` });
    } catch (error) {
        handleError(res, error);
    }
});

// Network Configuration Routes
app.get('/api/devices/:deviceId/network', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const config = await device.getNetworkConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/network/ethernet', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { ip, netmask, gateway, dns } = req.body;
        await device.configEthernet(ip, netmask, gateway, dns);
        res.json({ success: true, message: 'Ethernet configuration updated' });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/network/wifi', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { ssid, password, security, ip, netmask, gateway, dns } = req.body;
        await device.configWifi(ssid, password, security, ip, netmask, gateway, dns);
        res.json({ success: true, message: 'WiFi configuration updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// User Management Routes
app.get('/api/devices/:deviceId/users', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { position, count } = req.query;
        const users = await device.getUsers(
            position ? parseInt(position) : 0,
            count ? parseInt(count) : 100
        );
        res.json({ success: true, data: users });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/users', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const userData = req.body;
        await device.setUser(userData);
        res.json({ success: true, message: 'User created successfully' });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/users/:userId', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const userId = req.params.userId;
        const user = await device.getUser(userId);
        res.json({ success: true, data: user });
    } catch (error) {
        handleError(res, error);
    }
});

app.delete('/api/devices/:deviceId/users/:userId', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const userId = req.params.userId;
        await device.deleteUser(userId);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        handleError(res, error);
    }
});

// Biometric Enrollment Routes
app.post('/api/devices/:deviceId/enroll/fingerprint', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { userId, fingerIndex } = req.body;
        const jobId = await device.enrollFingerprint(userId, fingerIndex);
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/enroll/face', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { userId } = req.body;
        const jobId = await device.enrollFace(userId);
        res.json({ success: true, data: { jobId } });
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/api/devices/:deviceId/enroll/status/:jobId', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const jobId = req.params.jobId;
        const status = await device.getEnrollmentStatus(jobId);
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

// Attendance Log Routes
app.get('/api/devices/:deviceId/attendance', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { startDate, endDate, position, count } = req.query;
        const logs = await device.getAttendanceLogs(
            startDate,
            endDate,
            position ? parseInt(position) : 0,
            count ? parseInt(count) : 100
        );
        res.json({ success: true, data: logs });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/devices/:deviceId/attendance/erase', async (req, res) => {
    try {
        const device = deviceManager.getDevice(req.params.deviceId);
        const { endPos } = req.body;
        await device.eraseAttendLog(endPos);
        res.json({ success: true, message: 'Attendance logs erased' });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// ENHANCED DEVICE MANAGEMENT ROUTES
// ======================

// Quick add device by IP
app.post('/api/devices/quick-add', async (req, res) => {
  try {
    const { ip, port, apiKey, deviceName, branch, location, autoConnect } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    // Generate device ID based on IP
    const ipParts = ip.split('.');
    const ipSuffix = ipParts.slice(-2).join('-'); // Last two octets
    const deviceId = `device-${ipSuffix}-${port || 80}`;
    
    // Check if device already exists
    if (deviceManager.getDeviceStatus(deviceId)) {
      return res.status(400).json({
        success: false,
        error: `Device ${deviceId} already exists`
      });
    }
    
    const config = await deviceManager.addDevice(deviceId, {
      name: deviceName || `Scanner (${ip})`,
      ip,
      port: port || 80,
      apiKey: apiKey || 'default-key',
      useHttps: false,
      branch: branch || 'main',
      location: location || `Auto-discovered at ${ip}`,
      autoReconnect: autoConnect !== false
    });
    
    // Auto-connect if requested
    let connected = false;
    if (autoConnect !== false) {
      try {
        await deviceManager.connectDevice(deviceId);
        connected = true;
      } catch (connectError) {
        console.warn(`Device added but connection failed: ${connectError.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Device successfully added${connected ? ' and connected' : ''}`,
      data: { deviceId, config, connected }
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Quick remove device by IP
app.delete('/api/devices/quick-remove', async (req, res) => {
  try {
    const { ip, port } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    // Find device by IP
    const devices = deviceManager.getSystemOverview().devices;
    const targetDevice = devices.find(device => {
      return device.ip === ip && (port === undefined || device.port === port);
    });
    
    if (!targetDevice) {
      return res.status(404).json({
        success: false,
        error: `No device found with IP ${ip}${port ? `:${port}` : ''}`
      });
    }
    
    // Disconnect first if connected
    if (targetDevice.connected) {
      try {
        await deviceManager.disconnectDevice(targetDevice.deviceId);
      } catch (error) {
        console.warn(`Failed to disconnect device before removal: ${error.message}`);
      }
    }
    
    // Remove device
    await deviceManager.removeDevice(targetDevice.deviceId);
    
    res.json({
      success: true,
      message: `Device at ${ip} successfully removed`,
      data: { deviceId: targetDevice.deviceId, removed: true }
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Network scan for devices (basic version)
app.post('/api/devices/scan', async (req, res) => {
  try {
    const { networkRange, branch, autoConnect, apiKey } = req.body;
    
    if (!networkRange) {
      return res.status(400).json({
        success: false,
        error: 'Network range is required (e.g., "192.168.1.0/24" or "192.168.1.1-192.168.1.254")'
      });
    }
    
    // Basic network scan implementation
    const discoveredDevices = [];
    const commonPorts = [80, 8080, 4370, 5000, 8000];
    
    // Generate IP range
    let ipList = [];
    if (networkRange.includes('/')) {
      // CIDR notation (simplified)
      const [network, cidr] = networkRange.split('/');
      const [a, b, c, d] = network.split('.').map(Number);
      const hostCount = Math.pow(2, 32 - parseInt(cidr)) - 2;
      
      for (let i = 1; i <= Math.min(hostCount, 254); i++) {
        ipList.push(`${a}.${b}.${c}.${i}`);
      }
    } else if (networkRange.includes('-')) {
      // Range notation (simplified)
      const [startIP, endIP] = networkRange.split('-');
      const startParts = startIP.split('.').map(Number);
      const endParts = endIP.split('.').map(Number);
      
      for (let i = startParts[3]; i <= endParts[3]; i++) {
        ipList.push(`${startParts[0]}.${startParts[1]}.${startParts[2]}.${i}`);
      }
    }
    
    // Test each IP and port combination
    for (const ip of ipList.slice(0, 50)) { // Limit to 50 IPs for demo
      for (const port of commonPorts) {
        try {
          const axios = require('axios');
          const response = await axios.get(`http://${ip}:${port}/api/device/info`, {
            timeout: 2000
          });
          
          if (response.status === 200) {
            discoveredDevices.push({ ip, port, detected: true });
            
            // Auto-add if requested
            if (autoConnect) {
              try {
                const deviceId = `device-${ip.split('.').slice(-2).join('-')}-${port}`;
                if (!deviceManager.getDeviceStatus(deviceId)) {
                  await deviceManager.addDevice(deviceId, {
                    name: `Scanner (${ip}:${port})`,
                    ip,
                    port,
                    apiKey: apiKey || 'default-key',
                    useHttps: false,
                    branch: branch || 'main',
                    location: `Discovered at ${ip}:${port}`,
                    autoReconnect: true
                  });
                  
                  await deviceManager.connectDevice(deviceId);
                }
              } catch (addError) {
                console.warn(`Failed to auto-add device ${ip}:${port}:`, addError.message);
              }
            }
            break; // Found device on this IP, no need to try other ports
          }
        } catch (error) {
          // Device not responding on this port, try next
        }
      }
    }
    
    res.json({
      success: true,
      message: `Network scan complete. Found ${discoveredDevices.length} devices`,
      data: discoveredDevices
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ======================
// LEGACY SINGLE-DEVICE ROUTES (Backward Compatibility)
// ======================

// Legacy device connection
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

// Legacy device information routes
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

// Legacy time management
app.get('/api/device/time', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const time = await device.getDeviceTime();
        res.json({ success: true, data: { time } });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/device/time', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const { time } = req.body;
        await device.setDeviceTime(time);
        res.json({ success: true, message: 'Device time updated' });
    } catch (error) {
        handleError(res, error);
    }
});

// Legacy users routes
app.get('/api/users', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const { position, count } = req.query;
        const users = await device.getUsers(
            position ? parseInt(position) : 0,
            count ? parseInt(count) : 100
        );
        res.json({ success: true, data: users });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const userData = req.body;
        let biometricCreated = false;
        let biometricError = null;
        
        // Try to create user in biometric device
        try {
            const device = getDeviceFromRequest(req);
            await device.setUser(userData);
            biometricCreated = true;
            console.log(`🔬 Biometric user created: ${userData.name} (${userData.uid})`);
        } catch (deviceError) {
            biometricError = deviceError.message;
            console.log(`⚠️ Could not create biometric user: ${deviceError.message}`);
            // Continue with HR sync even if biometric creation fails
        }
        
        // Sync with HR Employee Directory
        const hrData = {
            position: req.body.position || 'Employee',
            department: req.body.department || 'General',
            branch: req.body.branch || 'main',
            hireDate: req.body.hireDate || new Date().toISOString().split('T')[0],
            email: req.body.email || '',
            phone: req.body.phone || '',
            address: req.body.address || '',
            salary: req.body.salary || 0
        };
        
        await employeeService.syncWithBiometricUser(userData, hrData);
        
        const message = biometricCreated 
            ? 'User created successfully in biometric device and synced to HR Directory'
            : `User created in HR Directory only (biometric device not available: ${biometricError})`;
        
        res.json({ 
            success: true, 
            message,
            biometricCreated,
            biometricError
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Legacy attendance routes
app.get('/api/attendance', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const { startDate, endDate, position, count } = req.query;
        const logs = await device.getAttendanceLogs(
            startDate,
            endDate,
            position ? parseInt(position) : 0,
            count ? parseInt(count) : 100
        );
        res.json({ success: true, data: logs });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// API KEY MANAGEMENT ROUTES
// ======================

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

// ======================
// HR MANAGEMENT ROUTES
// ======================

// Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const { search, branch, department, status } = req.query;
        let employees = await employeeService.getAllEmployees();
        
        if (search) {
            employees = await employeeService.searchEmployees(search);
        } else {
            if (branch) employees = employees.filter(emp => emp.branch === branch);
            if (department) employees = employees.filter(emp => emp.department === department);
            if (status) employees = employees.filter(emp => emp.status === status);
        }
        
        res.json({ success: true, data: employees });
    } catch (error) {
        handleError(res, error);
    }
});

// Get employee statistics
app.get('/api/employees/stats', async (req, res) => {
    try {
        const stats = await employeeService.getEmployeeStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        handleError(res, error);
    }
});

// Get specific employee
app.get('/api/employees/:id', async (req, res) => {
    try {
        const employee = await employeeService.getEmployee(req.params.id);
        if (!employee) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }
        res.json({ success: true, data: employee });
    } catch (error) {
        handleError(res, error);
    }
});

// Create employee (also creates biometric user)
app.post('/api/employees', async (req, res) => {
    try {
        const employeeData = req.body;
        
        // Create biometric user data
        const userData = {
            uid: employeeData.id || employeeData.userId,
            name: employeeData.name,
            privilege: employeeData.privilege || 'user',
            card: employeeData.card || '',
            password: employeeData.password || ''
        };
        
        // Create employee record
        const employee = await employeeService.createEmployee(userData, employeeData);
        
        // If connected to a device, also create biometric user
        try {
            const device = getDeviceFromRequest(req);
            if (device && device.connected) {
                await device.setUser(userData);
                console.log(`👤 Biometric user created for employee: ${employee.name}`);
            }
        } catch (deviceError) {
            console.log(`⚠️ Could not create biometric user: ${deviceError.message}`);
            // Continue anyway since HR record was created
        }
        
        res.json({
            success: true,
            message: 'Employee created successfully',
            data: employee
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Update employee
app.put('/api/employees/:id', async (req, res) => {
    try {
        const updates = req.body;
        const employee = await employeeService.updateEmployee(req.params.id, updates);
        
        res.json({
            success: true,
            message: 'Employee updated successfully',
            data: employee
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
    try {
        await employeeService.deleteEmployee(req.params.id);
        
        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Migrate existing biometric users to employees
app.post('/api/employees/migrate', async (req, res) => {
    try {
        const device = getDeviceFromRequest(req);
        const users = await device.getUsers(0, 1000); // Get all users
        const { defaultPosition, defaultDepartment, defaultBranch } = req.body;
        
        const results = await employeeService.migrateUsersToEmployees(users, {
            position: defaultPosition || 'Employee',
            department: defaultDepartment || 'General',
            branch: defaultBranch || 'main'
        });
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            success: true,
            message: `Migrated ${successCount}/${results.length} users to employee records`,
            data: results
        });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// DEVICE SYNC ROUTES
// ======================

// Force sync specific device
app.post('/api/devices/:deviceId/sync', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const result = await deviceSyncService.forceSyncDevice(deviceId);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Device sync completed for ${deviceId}`,
                data: result
            });
        } else {
            res.json({
                success: false,
                message: `Device sync failed for ${deviceId}`,
                error: result.error
            });
        }
    } catch (error) {
        handleError(res, error);
    }
});

// Sync all connected devices
app.post('/api/devices/sync-all', async (req, res) => {
    try {
        const results = await deviceSyncService.syncAllDevices();
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        res.json({
            success: true,
            message: `Bulk sync completed: ${successful} successful, ${failed} failed`,
            data: results
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Get sync status for all devices
app.get('/api/devices/sync-status', async (req, res) => {
    try {
        const status = await deviceSyncService.getSyncStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

// Get sync status for specific device
app.get('/api/devices/:deviceId/sync-status', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const status = await deviceSyncService.getSyncStatus(deviceId);
        res.json({ success: true, data: status });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// BRANCH MANAGEMENT ROUTES
// ======================

// Get all branches
app.get('/api/branches', async (req, res) => {
    try {
        const { status, includeStats } = req.query;
        
        let branches;
        if (includeStats === 'true') {
            branches = await branchService.getBranchSummary();
        } else if (status) {
            branches = status === 'active' ? await branchService.getActiveBranches() : await branchService.getAllBranches();
            branches = branches.filter(branch => branch.status === status);
        } else {
            branches = await branchService.getAllBranches();
        }
        
        res.json({ success: true, data: branches });
    } catch (error) {
        handleError(res, error);
    }
});

// Get branch by ID
app.get('/api/branches/:id', async (req, res) => {
    try {
        const branch = await branchService.getBranch(req.params.id);
        if (!branch) {
            return res.status(404).json({
                success: false,
                error: 'Branch not found'
            });
        }
        res.json({ success: true, data: branch });
    } catch (error) {
        handleError(res, error);
    }
});

// Create new branch
app.post('/api/branches', async (req, res) => {
    try {
        const branchData = req.body;
        
        // Validate branch data
        const validationErrors = branchService.validateBranchData(branchData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }
        
        const branch = await branchService.createBranch(branchData);
        
        res.json({
            success: true,
            message: 'Branch created successfully',
            data: branch
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Update branch
app.put('/api/branches/:id', async (req, res) => {
    try {
        const updates = req.body;
        
        // Validate updates (isUpdate = true)
        const validationErrors = branchService.validateBranchData(updates, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }
        
        const branch = await branchService.updateBranch(req.params.id, updates);
        
        res.json({
            success: true,
            message: 'Branch updated successfully',
            data: branch
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Delete branch
app.delete('/api/branches/:id', async (req, res) => {
    try {
        await branchService.deleteBranch(req.params.id);
        
        res.json({
            success: true,
            message: 'Branch deleted successfully'
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Get branch statistics
app.get('/api/branches/stats', async (req, res) => {
    try {
        const stats = await branchService.getBranchStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        handleError(res, error);
    }
});

// Get employees by branch
app.get('/api/branches/:id/employees', async (req, res) => {
    try {
        const employees = await branchService.getBranchEmployees(req.params.id);
        res.json({ success: true, data: employees });
    } catch (error) {
        handleError(res, error);
    }
});

// Get default business hours template
app.get('/api/branches/templates/business-hours', (req, res) => {
    try {
        const template = branchService.getDefaultBusinessHours();
        res.json({ success: true, data: template });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// ATTENDANCE TRACKING ROUTES
// ======================

// Get today's attendance data for dashboard
app.get('/api/attendance/today', async (req, res) => {
    try {
        const data = await employeeService.getTodaysAttendance();
        res.json({ success: true, data });
    } catch (error) {
        handleError(res, error);
    }
});

// Get attendance logs with filtering
app.get('/api/attendance/logs', async (req, res) => {
    try {
        const { startDate, endDate, employeeId, deviceId, limit } = req.query;
        const filters = {
            startDate,
            endDate,
            employeeId,
            deviceId,
            limit: limit ? parseInt(limit) : 100
        };
        
        const logs = await employeeService.getAttendanceLogs(filters);
        res.json({ success: true, data: logs });
    } catch (error) {
        handleError(res, error);
    }
});

// ======================
// INITIALIZATION & STARTUP
// ======================

// Initialize all services
async function initializeServer() {
    try {
        // Initialize database service first
        await databaseService.init();
        
        // Migrate existing JSON data if present
        await databaseService.migrateFromJSON();
        
        // Initialize employee service
        await employeeService.init();
        
        // Initialize branch service
        await branchService.init();
        
        // Initialize API key manager
        await apiKeyManager.init();
        const stats = apiKeyManager.getUsageStats();
        if (stats.totalKeys === 0) {
            console.log('🔑 No API keys found, creating default key...');
            const defaultKey = apiKeyManager.generateKey('Default System Key', 'system');
            console.log(`🔑 Default API key created: ${defaultKey.key}`);
            console.log('💡 Use this key to connect devices or create additional keys via the web interface');
        } else {
            console.log(`🔑 Loaded ${stats.totalKeys} API keys (${stats.activeKeys} active)`);
        }
        
        // Initialize device manager
        await deviceManager.init();
        
        // Initialize device sync service
        await deviceSyncService.init();
        
        console.log('✅ Server initialization complete with database persistence');
    } catch (error) {
        console.error('❌ Server initialization failed:', error.message);
        process.exit(1);
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Multi-Device Biometric Server running on http://localhost:${PORT}`);
    console.log(`📱 Support for multiple devices across different networks`);
    console.log(`🌐 Branch-based device management enabled`);
    
    await initializeServer();
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please free up the port or use a different one.`);
        process.exit(1); // Exit with a failure code
    } else {
        console.error('❌ Server error:', err.message);
        process.exit(1); // Exit with a failure code for other errors
    }
});

module.exports = app;
