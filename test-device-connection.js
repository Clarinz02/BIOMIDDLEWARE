#!/usr/bin/env node

const { DeviceManager } = require('./device-manager.js');

async function testDeviceConnections() {
    console.log('🧪 Testing Device Connectivity...');
    console.log('=====================================');

    const deviceManager = new DeviceManager();
    
    try {
        // Initialize the device manager
        console.log('🔧 Initializing Device Manager...');
        await deviceManager.init();
        
        // Check device configurations
        console.log('\\n📋 Device Configurations:');
        for (const [deviceId, config] of deviceManager.deviceConfigs) {
            console.log(`  - ${deviceId}: ${config.ip}:${config.port || 80} (${config.status})`);
        }
        
        // Test individual device connections
        console.log('\\n🔌 Testing Device Connections:');
        
        const deviceIds = Array.from(deviceManager.deviceConfigs.keys());
        for (const deviceId of deviceIds) {
            try {
                console.log(`\\n  Testing ${deviceId}...`);
                const device = await deviceManager.connectDevice(deviceId);
                
                // Try to get version info
                const versionInfo = await device.getVersionInfo();
                console.log(`  ✅ ${deviceId} connected successfully!`);
                console.log(`     Firmware: ${versionInfo.firmware_version}`);
                console.log(`     Model: ${versionInfo.device_model}`);
                
            } catch (error) {
                console.log(`  ❌ ${deviceId} connection failed: ${error.message}`);
            }
        }
        
        // Show current device status
        console.log('\\n📊 Final Device Status:');
        for (const [deviceId, config] of deviceManager.deviceConfigs) {
            const isConnected = deviceManager.devices.has(deviceId);
            console.log(`  - ${deviceId}: ${isConnected ? '🟢 Connected' : '🔴 Disconnected'}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
    
    console.log('\\n🏁 Device connectivity test completed!');
}

// Run the test
if (require.main === module) {
    testDeviceConnections().catch(console.error);
}

module.exports = testDeviceConnections;
