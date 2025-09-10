#!/usr/bin/env node

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { DeviceManager } = require('./device-manager.js');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5174;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create device manager instance
const deviceManager = new DeviceManager();

// Simple logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${message}`);
};

// Routes
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Multi-Device Biometric Server',
    status: 'running',
    timestamp: new Date().toISOString(),
    devices: Array.from(deviceManager.deviceConfigs.keys())
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    devices: {
      total: deviceManager.deviceConfigs.size,
      connected: deviceManager.devices.size
    }
  });
});

app.get('/api/devices', (req, res) => {
  const devices = Array.from(deviceManager.deviceConfigs.values()).map(config => ({
    deviceId: config.deviceId,
    name: config.name,
    ip: config.ip,
    port: config.port,
    status: config.status,
    branch: config.branch,
    location: config.location,
    lastConnected: config.lastConnected,
    isConnected: deviceManager.devices.has(config.deviceId)
  }));
  
  res.json({ devices });
});

app.get('/api/devices/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const config = deviceManager.deviceConfigs.get(deviceId);
    if (!config) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const device = deviceManager.devices.get(deviceId);
    let deviceInfo = null;
    
    if (device) {
      try {
        deviceInfo = await device.getVersionInfo();
      } catch (error) {
        log(`Error getting device info for ${deviceId}: ${error.message}`);
      }
    }
    
    res.json({
      ...config,
      isConnected: !!device,
      deviceInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:deviceId/connect', async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const device = await deviceManager.connectDevice(deviceId);
    const versionInfo = await device.getVersionInfo();
    
    res.json({
      message: `Connected to ${deviceId}`,
      deviceId,
      versionInfo
    });
  } catch (error) {
    res.status(500).json({ 
      error: `Failed to connect to ${deviceId}: ${error.message}` 
    });
  }
});

app.post('/api/devices/:deviceId/disconnect', async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const result = await deviceManager.disconnectDevice(deviceId);
    res.json({
      message: result ? `Disconnected from ${deviceId}` : `${deviceId} was not connected`,
      deviceId
    });
  } catch (error) {
    res.status(500).json({ 
      error: `Failed to disconnect from ${deviceId}: ${error.message}` 
    });
  }
});

// Initialize and start server
async function startServer() {
  try {
    log('🚀 Starting Multi-Device Biometric Server...');
    log('📱 Support for multiple devices across different networks');
    log('🌐 Branch-based device management enabled');
    
    // Initialize device manager
    await deviceManager.init();
    
    // Start HTTP server
    server.listen(PORT, () => {
      log(`🚀 Multi-Device Biometric Server running on http://localhost:${PORT}`);
      log('✅ Server initialization complete');
      
      // Show device status
      log('📊 Device Status:');
      for (const [deviceId, config] of deviceManager.deviceConfigs) {
        const isConnected = deviceManager.devices.has(deviceId);
        log(`  - ${deviceId}: ${isConnected ? '🟢 Connected' : '🔴 Disconnected'} (${config.ip}:${config.port || 80})`);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();
