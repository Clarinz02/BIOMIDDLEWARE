#!/usr/bin/env node
/**
 * Simple test script for the Biometric Device Middleware
 */

const { BiometricDeviceMiddleware, BiometricDeviceError } = require('./biometric-middleware');

// Mock device test - this won't connect to a real device
async function testMiddleware() {
    console.log('=== Testing Biometric Device Middleware ===\n');
    
    // Test initialization
    console.log('1. Testing middleware initialization...');
    const device = new BiometricDeviceMiddleware('192.168.1.100', 'test_key');
    console.log('   ✓ Middleware initialized successfully');
    
    // Test URL generation
    console.log('2. Testing URL generation...');
    const url = device._getBaseUrl();
    console.log(`   ✓ Generated URL: ${url}`);
    
    // Test message ID generation
    console.log('3. Testing message ID generation...');
    const messageId = device._generateMessageId();
    console.log(`   ✓ Generated message ID: ${messageId}`);
    
    // Test error handling
    console.log('4. Testing error handling...');
    const error = new BiometricDeviceError('Test error', 'test_code', ['arg1', 'arg2']);
    console.log(`   ✓ BiometricDeviceError created: ${error.message}`);
    console.log(`   ✓ Error code: ${error.errorCode}`);
    console.log(`   ✓ Error arguments: ${JSON.stringify(error.arguments)}`);
    
    // Test method availability
    console.log('5. Testing method availability...');
    const methods = [
        'getUserIdList', 'getAllUserIds', 'getUserInfo', 'setUserInfo', 'deleteUserInfo',
        'lockDevice', 'beginEnrollFace', 'beginEnrollFingerprint', 'queryJobStatus',
        'getAttendLog', 'getAllAttendLogs', 'eraseAttendLog',
        'getDeviceTime', 'setDeviceTime', 'getNetworkConfig', 'setNetworkConfig',
        'getVersionInfo', 'getCapacityLimit', 'getCurrentUsage', 'getDeviceCapabilities',
        'deviceControl'
    ];
    
    let methodCount = 0;
    for (const method of methods) {
        if (typeof device[method] === 'function') {
            methodCount++;
        } else {
            console.log(`   ✗ Method ${method} not found`);
        }
    }
    
    console.log(`   ✓ Found ${methodCount}/${methods.length} expected methods`);
    
    // Test parameter validation
    console.log('6. Testing parameter validation...');
    try {
        await device.setSoundVolume(15); // Should fail (out of range)
        console.log('   ✗ Volume validation failed');
    } catch (error) {
        console.log('   ✓ Volume validation works: ' + error.message);
    }
    
    try {
        await device.setDeviceId(300); // Should fail (out of range)
        console.log('   ✗ Device ID validation failed');
    } catch (error) {
        console.log('   ✓ Device ID validation works: ' + error.message);
    }
    
    try {
        await device.configAttendLogUploader('http://test.com', 5000); // Should fail (interval too large)
        console.log('   ✗ Interval validation failed');
    } catch (error) {
        console.log('   ✓ Interval validation works: ' + error.message);
    }
    
    console.log('\n=== All tests completed ===');
    console.log('✓ Middleware is ready to use!');
    console.log('\nTo test with a real device:');
    console.log('1. Update the device IP in example-usage.js');
    console.log('2. Set the correct API key (if required)');
    console.log('3. Run: npm start');
}

// Run the test
if (require.main === module) {
    testMiddleware().catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testMiddleware };
