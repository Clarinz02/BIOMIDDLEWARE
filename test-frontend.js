#!/usr/bin/env node
/**
 * Frontend API Test Script
 * Tests the REST API endpoints used by the frontend
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = BASE_URL + path;
        const opts = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const req = http.request(url, opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

async function testAPI() {
    console.log('🧪 Testing Biometric Device Frontend API...\n');

    const tests = [
        {
            name: 'Device Config',
            path: '/api/device/config',
            expected: 'Should return connection status'
        },
        {
            name: 'Device Connection (without device)',
            path: '/api/device/version',
            expected: 'Should return device not initialized error'
        },
        {
            name: 'Users List (without device)',
            path: '/api/users',
            expected: 'Should return device not initialized error'
        },
        {
            name: 'Attendance (without device)',
            path: '/api/attendance/all',
            expected: 'Should return device not initialized error'
        }
    ];

    for (const test of tests) {
        try {
            console.log(`🔍 Testing: ${test.name}`);
            const result = await makeRequest(test.path);
            
            if (result.status === 200) {
                console.log(`   ✅ Status: ${result.status}`);
                console.log(`   📋 Response: ${JSON.stringify(result.data, null, 2)}`);
            } else {
                console.log(`   ⚠️  Status: ${result.status}`);
                console.log(`   📋 Response: ${JSON.stringify(result.data, null, 2)}`);
            }
            
            console.log(`   💡 Expected: ${test.expected}\n`);
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    // Test device connection
    console.log('🔗 Testing device connection...');
    try {
        const connectResult = await makeRequest('/api/device/connect', {
            method: 'POST',
            body: {
                ip: '192.168.1.100',
                apiKey: null,
                useHttps: false
            }
        });
        
        console.log(`   Status: ${connectResult.status}`);
        console.log(`   Response: ${JSON.stringify(connectResult.data, null, 2)}\n`);
    } catch (error) {
        console.log(`   ❌ Connection test failed: ${error.message}\n`);
    }

    console.log('✅ API tests completed!');
    console.log('\n💡 Note: Some tests may fail if no physical device is connected.');
    console.log('💡 This is expected behavior - the frontend should handle these gracefully.');
}

// Run tests if this script is executed directly
if (require.main === module) {
    testAPI().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { testAPI };
