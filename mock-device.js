#!/usr/bin/env node

const express = require('express');
const app = express();

// Parse JSON bodies
app.use(express.json());

// Configuration from command line arguments
const port = process.argv[2] || 4001;
const deviceId = process.argv[3] || 'mock-device';
const apiKey = process.argv[4] || 'default-key';

console.log(`🔧 Mock Biometric Device: ${deviceId}`);
console.log(`🔑 API Key: ${apiKey}`);
console.log(`🌐 Starting on port ${port}...`);

// Mock device status
let deviceStatus = {
  deviceId: deviceId,
  status: 'online',
  lastScan: null,
  temperature: Math.round(20 + Math.random() * 10), // Random temp 20-30°C
  batteryLevel: Math.round(80 + Math.random() * 20), // Random 80-100%
  version: '1.0.0',
  uptime: 0
};

// Middleware to check API key
const checkApiKey = (req, res, next) => {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Routes
app.get('/status', checkApiKey, (req, res) => {
  deviceStatus.uptime = Math.floor(process.uptime());
  res.json(deviceStatus);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Biometric Protocol Support - /control endpoint
app.post('/control', (req, res) => {
  // Check API key from query params or headers
  const providedKey = req.query.api_key || req.headers['x-api-key'];
  if (providedKey !== apiKey) {
    return res.status(401).json({
      mid: req.body.mid || 'unknown',
      result: 'Error',
      payload: { code: 'invalid_api_key', arguments: [] }
    });
  }

  const { mid, cmd, payload = {} } = req.body;
  console.log(`🔧 Biometric command: ${cmd} (${mid})`);

  // Handle different biometric commands
  let responsePayload = {};
  let result = 'Success';

  try {
    switch (cmd) {
      case 'GetVersionInfo':
        responsePayload = {
          firmware_version: '1.0.0',
          algorithm_version: '2.1.0',
          device_model: 'MockBiometric',
          manufacturer: 'MockCorp'
        };
        break;

      case 'GetDeviceUid':
        responsePayload = {
          device_uid: `mock_uid_${deviceId}_${Date.now().toString(36)}`
        };
        break;

      case 'GetCapacityLimit':
        responsePayload = {
          max_users: 1000,
          max_faces: 5000,
          max_fingerprints: 10000
        };
        break;

      case 'GetCurrentUsage':
        responsePayload = {
          current_users: Math.floor(Math.random() * 50),
          current_faces: Math.floor(Math.random() * 200),
          current_fingerprints: Math.floor(Math.random() * 500)
        };
        break;

      case 'GetDeviceTime':
        responsePayload = {
          time: new Date().toISOString()
        };
        break;

      case 'GetUserIdList':
        const startPos = payload.start_pos || 0;
        const mockUsers = [];
        for (let i = startPos; i < Math.min(startPos + 10, 50); i++) {
          mockUsers.push(`user_${i + 1}`);
        }
        responsePayload = {
          user_id: mockUsers,
          next_page_pos: startPos + 10 < 50 ? startPos + 10 : undefined
        };
        break;

      default:
        console.log(`⚠️ Unhandled biometric command: ${cmd}`);
        responsePayload = {
          message: `Mock response for ${cmd}`,
          supported: false
        };
        break;
    }
  } catch (error) {
    result = 'Error';
    responsePayload = {
      code: 'command_error',
      arguments: [error.message]
    };
  }

  res.json({
    mid: mid,
    result: result,
    payload: responsePayload
  });
});

app.post('/scan', checkApiKey, (req, res) => {
  console.log(`📱 Scan requested on ${deviceId}`);
  
  // Simulate scan result
  const scanResult = {
    deviceId: deviceId,
    timestamp: new Date().toISOString(),
    scanId: `scan_${Date.now()}`,
    success: Math.random() > 0.1, // 90% success rate
    fingerprint: {
      quality: Math.round(70 + Math.random() * 30), // 70-100%
      template: `template_${Math.random().toString(36).substring(7)}`
    },
    user: Math.random() > 0.3 ? {
      id: `user_${Math.floor(Math.random() * 100)}`,
      name: `Test User ${Math.floor(Math.random() * 100)}`,
      verified: true
    } : null
  };
  
  deviceStatus.lastScan = scanResult.timestamp;
  
  if (scanResult.success) {
    console.log(`✅ Scan successful: ${scanResult.scanId}`);
  } else {
    console.log(`❌ Scan failed: ${scanResult.scanId}`);
  }
  
  res.json(scanResult);
});

app.post('/enroll', checkApiKey, (req, res) => {
  const { userId, userName } = req.body;
  console.log(`👤 Enrollment requested for user: ${userName} (${userId})`);
  
  const enrollResult = {
    deviceId: deviceId,
    timestamp: new Date().toISOString(),
    enrollmentId: `enroll_${Date.now()}`,
    userId: userId,
    userName: userName,
    success: Math.random() > 0.05, // 95% success rate
    template: `template_${Math.random().toString(36).substring(7)}`
  };
  
  if (enrollResult.success) {
    console.log(`✅ Enrollment successful: ${enrollResult.enrollmentId}`);
  } else {
    console.log(`❌ Enrollment failed: ${enrollResult.enrollmentId}`);
  }
  
  res.json(enrollResult);
});

// Start server
app.listen(port, '127.0.0.1', () => {
  console.log(`🚀 Mock biometric device '${deviceId}' running on http://127.0.0.1:${port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /status - Device status (requires API key)`);
  console.log(`   POST /scan - Trigger fingerprint scan (requires API key)`);
  console.log(`   POST /enroll - Enroll new user (requires API key)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`\n🛑 Shutting down mock device '${deviceId}'...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`\n🛑 Shutting down mock device '${deviceId}'...`);
  process.exit(0);
});
