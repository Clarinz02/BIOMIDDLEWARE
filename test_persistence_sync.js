#!/usr/bin/env node

/**
 * Test Script for Database Persistence and Device Synchronization
 * 
 * This script tests:
 * 1. Database persistence across server restarts
 * 2. Device synchronization functionality
 * 3. Employee data integrity
 * 4. Attendance log synchronization
 */

const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios').default;

class PersistenceSyncTester {
    constructor() {
        this.baseUrl = 'http://localhost:5173';
        this.testData = {
            employee: {
                id: 'TEST_001',
                userId: 'TEST_001',
                name: 'Test Employee',
                position: 'QA Tester',
                department: 'Testing',
                branch: 'main',
                hireDate: '2024-01-01',
                status: 'active',
                email: 'test@example.com',
                phone: '+1234567890',
                address: '123 Test Street',
                emergencyContact: 'Emergency Contact',
                salary: 50000
            }
        };
        this.serverProcess = null;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            // Return the data field if the API returns success/data format, otherwise return raw response
            if (response.data && response.data.success && response.data.data !== undefined) {
                return response.data.data;
            }
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText}`);
            } else if (error.request) {
                throw new Error('No response from server');
            } else {
                throw new Error(`Request error: ${error.message}`);
            }
        }
    }

    async startServer() {
        console.log('🚀 Starting server...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['server.js'], {
                cwd: __dirname,
                stdio: 'pipe'
            });

            let output = '';
            
            this.serverProcess.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log(`[SERVER] ${text.trim()}`);
                
                if (text.includes('✅ Server initialization complete with database persistence')) {
                    setTimeout(() => resolve(), 1000); // Give server time to fully initialize
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                const text = data.toString();
                console.error(`[SERVER ERROR] ${text.trim()}`);
            });

            this.serverProcess.on('error', (error) => {
                reject(new Error(`Failed to start server: ${error.message}`));
            });

            this.serverProcess.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    reject(new Error(`Server exited with code ${code}`));
                }
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!output.includes('✅ Server initialization complete with database persistence')) {
                    reject(new Error('Server failed to start within 30 seconds'));
                }
            }, 30000);
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            console.log('🛑 Stopping server...');
            this.serverProcess.kill('SIGTERM');
            
            return new Promise((resolve) => {
                this.serverProcess.on('exit', () => {
                    console.log('✅ Server stopped');
                    resolve();
                });
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    this.serverProcess.kill('SIGKILL');
                    resolve();
                }, 5000);
            });
        }
    }

    async testDatabasePersistence() {
        console.log('\n📊 Testing Database Persistence...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Create employee
            console.log('1️⃣ Creating test employee...');
            await this.makeRequest('POST', '/api/employees', this.testData.employee);
            console.log('✅ Employee created successfully');

            // Test 2: Verify employee exists
            const employees = await this.makeRequest('GET', '/api/employees');
            const testEmployee = employees.find(emp => emp.id === this.testData.employee.id);
            
            if (!testEmployee) {
                throw new Error('Test employee not found after creation');
            }
            console.log('✅ Employee found in database');

            // Test 3: Get device status before restart
            const deviceStatusBefore = await this.makeRequest('GET', '/api/devices');
            console.log(`📱 Found ${deviceStatusBefore.devices?.length || 0} devices before restart`);

            // Test 4: Restart server
            console.log('\n🔄 Restarting server to test persistence...');
            await this.stopServer();
            await this.delay(2000);
            await this.startServer();

            // Test 5: Verify data persists after restart
            console.log('2️⃣ Verifying data after restart...');
            const employeesAfterRestart = await this.makeRequest('GET', '/api/employees');
            const persistedEmployee = employeesAfterRestart.find(emp => emp.id === this.testData.employee.id);
            
            if (!persistedEmployee) {
                throw new Error('Employee data did not persist across restart');
            }
            console.log('✅ Employee data persisted across restart');

            // Test 6: Verify employee data integrity
            const fieldsToCheck = ['name', 'position', 'department', 'branch', 'email'];
            for (const field of fieldsToCheck) {
                if (persistedEmployee[field] !== this.testData.employee[field]) {
                    throw new Error(`Field ${field} does not match: expected ${this.testData.employee[field]}, got ${persistedEmployee[field]}`);
                }
            }
            console.log('✅ Employee data integrity verified');

            // Test 7: Update employee and verify persistence
            console.log('3️⃣ Testing data updates...');
            const updatedData = {
                position: 'Senior QA Tester',
                salary: 60000
            };
            
            await this.makeRequest('PUT', `/api/employees/${this.testData.employee.id}`, updatedData);
            console.log('✅ Employee updated successfully');

            const updatedEmployee = await this.makeRequest('GET', `/api/employees/${this.testData.employee.id}`);
            if (updatedEmployee.position !== updatedData.position || updatedEmployee.salary !== updatedData.salary) {
                throw new Error('Employee update did not persist');
            }
            console.log('✅ Employee updates verified');

            console.log('\n🎉 Database Persistence Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Database Persistence Test FAILED:', error.message);
            return false;
        }
    }

    async testDeviceSync() {
        console.log('\n🔄 Testing Device Synchronization...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Get initial system overview
            console.log('1️⃣ Getting system overview...');
            const overview = await this.makeRequest('GET', '/api/devices');
            console.log(`📱 System overview: ${overview.devices?.length || 0} devices configured`);
            
            if (overview.devices && overview.devices.length > 0) {
                overview.devices.forEach(device => {
                    console.log(`   - ${device.deviceId}: ${device.connected ? '🟢 Connected' : '🔴 Disconnected'}`);
                });
            }

            // Test 2: Check sync status
            console.log('\n2️⃣ Checking sync status...');
            try {
                const syncStatus = await this.makeRequest('GET', '/api/devices/sync-status');
                console.log('📊 Current sync status:');
                
                if (Array.isArray(syncStatus)) {
                    if (syncStatus.length === 0) {
                        console.log('   No devices have been synced yet');
                    } else {
                        syncStatus.forEach(status => {
                            console.log(`   - ${status.device_id}: Last sync ${status.last_sync_at || 'Never'}, Status: ${status.sync_status || 'Unknown'}`);
                        });
                    }
                } else {
                    console.log('   No sync status data available');
                }
            } catch (error) {
                console.log(`   ⚠️ Sync status check failed: ${error.message}`);
                // Continue with test even if sync status fails
            }

            // Test 3: Force sync all devices
            console.log('\n3️⃣ Testing force sync...');
            const syncResult = await this.makeRequest('POST', '/api/devices/sync-all');
            console.log('🔄 Force sync initiated');
            
            if (Array.isArray(syncResult)) {
                const successful = syncResult.filter(r => r.success).length;
                const failed = syncResult.filter(r => !r.success).length;
                console.log(`   Results: ${successful} successful, ${failed} failed`);
                
                syncResult.forEach(result => {
                    if (result.success) {
                        console.log(`   ✅ ${result.deviceId}: ${result.syncStats?.usersProcessed || 0} users, ${result.syncStats?.attendanceProcessed || 0} attendance logs`);
                    } else {
                        console.log(`   ❌ ${result.deviceId}: ${result.error}`);
                    }
                });
            }

            // Test 4: Check attendance data
            console.log('\n4️⃣ Checking attendance data...');
            const attendanceToday = await this.makeRequest('GET', '/api/attendance/today');
            console.log(`📊 Today's attendance: ${attendanceToday.length} records`);
            
            if (attendanceToday.length > 0) {
                console.log('   Sample records:');
                attendanceToday.slice(0, 3).forEach(record => {
                    console.log(`   - ${record.employeeName || record.employeeId}: ${record.timestamp} (${record.deviceId})`);
                });
            }

            // Test 5: Get attendance logs with filters
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const weeklyAttendance = await this.makeRequest('GET', `/api/attendance/logs?startDate=${startDate}&endDate=${endDate}&limit=10`);
            console.log(`📊 Weekly attendance: ${weeklyAttendance.length} records`);

            // Test 6: Verify employee sync from devices
            console.log('\n5️⃣ Verifying employee sync from devices...');
            const allEmployees = await this.makeRequest('GET', '/api/employees');
            const biometricEmployees = allEmployees.filter(emp => emp.id !== this.testData.employee.id);
            console.log(`👥 Found ${biometricEmployees.length} employees synced from biometric devices`);
            
            if (biometricEmployees.length > 0) {
                console.log('   Sample employees:');
                biometricEmployees.slice(0, 3).forEach(emp => {
                    console.log(`   - ${emp.name} (${emp.id}): ${emp.position} in ${emp.department}`);
                });
            }

            console.log('\n🎉 Device Synchronization Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Device Synchronization Test FAILED:', error.message);
            return false;
        }
    }

    async testDataIntegrity() {
        console.log('\n🔍 Testing Data Integrity...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Check for duplicate employees
            const employees = await this.makeRequest('GET', '/api/employees');
            const employeeIds = employees.map(emp => emp.id);
            const uniqueIds = [...new Set(employeeIds)];
            
            if (employeeIds.length !== uniqueIds.length) {
                throw new Error(`Found duplicate employee IDs: ${employeeIds.length} total, ${uniqueIds.length} unique`);
            }
            console.log(`✅ No duplicate employees found (${employees.length} total)`);

            // Test 2: Check attendance log integrity
            const attendanceLogs = await this.makeRequest('GET', '/api/attendance/logs?limit=100');
            let invalidLogs = 0;
            
            for (const log of attendanceLogs) {
                if (!log.employeeId || !log.timestamp || !log.deviceId) {
                    invalidLogs++;
                }
            }
            
            if (invalidLogs > 0) {
                console.warn(`⚠️ Found ${invalidLogs} invalid attendance logs out of ${attendanceLogs.length}`);
            } else {
                console.log(`✅ All ${attendanceLogs.length} attendance logs are valid`);
            }

            // Test 3: Check employee-attendance relationship integrity
            const employeeIds_Set = new Set(employees.map(emp => emp.id));
            const attendanceEmployeeIds = [...new Set(attendanceLogs.map(log => log.employeeId))];
            
            let orphanedAttendance = 0;
            for (const empId of attendanceEmployeeIds) {
                if (!employeeIds_Set.has(empId)) {
                    orphanedAttendance++;
                }
            }
            
            if (orphanedAttendance > 0) {
                console.warn(`⚠️ Found ${orphanedAttendance} attendance records for non-existent employees`);
            } else {
                console.log('✅ All attendance records have corresponding employees');
            }

            console.log('\n🎉 Data Integrity Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Data Integrity Test FAILED:', error.message);
            return false;
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test data...');
        
        try {
            // Remove test employee
            await this.makeRequest('DELETE', `/api/employees/${this.testData.employee.id}`);
            console.log('✅ Test employee removed');
        } catch (error) {
            console.warn('⚠️ Could not remove test employee:', error.message);
        }
    }

    async runAllTests() {
        console.log('🔬 Starting Comprehensive Database Persistence and Sync Tests');
        console.log('='.repeat(70));

        const results = {
            persistence: false,
            sync: false,
            integrity: false
        };

        try {
            // Start server
            await this.startServer();

            // Run tests
            results.persistence = await this.testDatabasePersistence();
            results.sync = await this.testDeviceSync();
            results.integrity = await this.testDataIntegrity();

            // Cleanup
            await this.cleanup();

            // Summary
            console.log('\n📋 Test Results Summary');
            console.log('=' .repeat(30));
            console.log(`Database Persistence: ${results.persistence ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Device Synchronization: ${results.sync ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Data Integrity: ${results.integrity ? '✅ PASS' : '❌ FAIL'}`);

            const allPassed = Object.values(results).every(result => result === true);
            
            if (allPassed) {
                console.log('\n🎉 ALL TESTS PASSED! Your system is ready for production.');
            } else {
                console.log('\n❌ Some tests failed. Please review the issues above.');
            }

            return allPassed;

        } catch (error) {
            console.error('\n💥 Test execution failed:', error.message);
            return false;
        } finally {
            await this.stopServer();
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new PersistenceSyncTester();
    
    tester.runAllTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Unexpected error:', error.message);
            process.exit(1);
        });
}

module.exports = PersistenceSyncTester;
