#!/usr/bin/env node

/**
 * Test Script for Branch Management System
 * 
 * This script tests:
 * 1. Branch creation, updating, and deletion
 * 2. Branch assignment when adding devices
 * 3. Employee assignment to branches
 * 4. Branch statistics and relationships
 */

const axios = require('axios').default;
const { spawn } = require('child_process');

class BranchManagementTester {
    constructor() {
        this.baseUrl = 'http://localhost:5173';
        this.serverProcess = null;
        this.testBranchId = 'test-branch';
        this.testBranchCode = 'TEST';
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
            return response.data && response.data.success ? response.data.data : response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}: ${error.response.data?.error || error.response.statusText}`);
            } else if (error.request) {
                throw new Error('No response from server');
            } else {
                throw new Error(`Request error: ${error.message}`);
            }
        }
    }

    async testBranchCRUD() {
        console.log('\n🏢 Testing Branch CRUD Operations...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Create a new branch
            console.log('1️⃣ Creating new branch...');
            const newBranchData = {
                name: 'Test Branch Location',
                code: this.testBranchCode,
                description: 'Test branch for validation',
                address: '123 Test Street, Test City',
                phone: '+1-555-0123',
                managerName: 'Test Manager',
                managerEmail: 'manager@test.com',
                status: 'active'
            };

            const createdBranch = await this.makeRequest('POST', '/api/branches', newBranchData);
            if (!createdBranch.id || createdBranch.code !== this.testBranchCode) {
                throw new Error('Branch not created properly');
            }
            this.testBranchId = createdBranch.id;
            console.log(`✅ Branch created: ${createdBranch.name} (${createdBranch.id})`);

            // Test 2: Get branch by ID
            console.log('2️⃣ Retrieving branch by ID...');
            const retrievedBranch = await this.makeRequest('GET', `/api/branches/${this.testBranchId}`);
            if (retrievedBranch.name !== newBranchData.name) {
                throw new Error('Retrieved branch data does not match');
            }
            console.log('✅ Branch retrieved successfully');

            // Test 3: Update branch
            console.log('3️⃣ Updating branch...');
            const updates = {
                name: 'Updated Test Branch',
                managerName: 'Updated Manager'
            };
            const updatedBranch = await this.makeRequest('PUT', `/api/branches/${this.testBranchId}`, updates);
            if (updatedBranch.name !== updates.name) {
                throw new Error('Branch update failed');
            }
            console.log('✅ Branch updated successfully');

            // Test 4: Get all branches
            console.log('4️⃣ Getting all branches...');
            const allBranches = await this.makeRequest('GET', '/api/branches');
            const testBranchExists = allBranches.some(branch => branch.id === this.testBranchId);
            if (!testBranchExists) {
                throw new Error('Test branch not found in branches list');
            }
            console.log(`✅ Found ${allBranches.length} branches total`);

            console.log('\n🎉 Branch CRUD Operations Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Branch CRUD Operations Test FAILED:', error.message);
            return false;
        }
    }

    async testDeviceWithBranchCreation() {
        console.log('\n📱 Testing Device Creation with New Branch...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Add device with new branch
            console.log('1️⃣ Adding device with new branch...');
            const deviceData = {
                deviceId: 'test-device-new-branch',
                name: 'Test Device with New Branch',
                ip: '192.168.1.199',
                branch: 'NEWBR',
                branchName: 'New Branch Location',
                location: '456 New Street, New City',
                autoReconnect: false
            };

            const deviceResponse = await this.makeRequest('POST', '/api/devices', deviceData);
            if (!deviceResponse.branch) {
                console.warn('⚠️ Branch information not in device response, checking branches...');
            } else {
                console.log(`✅ Device added with branch: ${deviceResponse.branch.name}`);
            }

            // Test 2: Verify new branch was created
            console.log('2️⃣ Verifying auto-created branch...');
            const branches = await this.makeRequest('GET', '/api/branches');
            const newBranch = branches.find(branch => branch.code === 'NEWBR');
            if (!newBranch) {
                throw new Error('New branch was not auto-created');
            }
            console.log(`✅ Auto-created branch found: ${newBranch.name} (${newBranch.id})`);

            // Test 3: Cleanup - Remove test device
            console.log('3️⃣ Cleaning up test device...');
            await this.makeRequest('DELETE', `/api/devices/${deviceData.deviceId}`);
            console.log('✅ Test device removed');

            console.log('\n🎉 Device with Branch Creation Test PASSED');
            return { success: true, createdBranchId: newBranch.id };

        } catch (error) {
            console.error('\n❌ Device with Branch Creation Test FAILED:', error.message);
            return { success: false };
        }
    }

    async testEmployeeBranchAssignment() {
        console.log('\n👥 Testing Employee Branch Assignment...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Create employee with branch assignment
            console.log('1️⃣ Creating employee with branch assignment...');
            const employeeData = {
                id: 'TEST_EMP_001',
                userId: 'TEST_EMP_001',
                name: 'Test Employee',
                position: 'QA Tester',
                department: 'Testing',
                branchId: this.testBranchId, // Use the test branch we created
                hireDate: '2024-01-01',
                status: 'active',
                email: 'testemployee@example.com'
            };

            const createdEmployee = await this.makeRequest('POST', '/api/employees', employeeData);
            if (!createdEmployee) {
                throw new Error('Employee not created');
            }
            console.log(`✅ Employee created: ${createdEmployee.name}`);

            // Test 2: Get employees by branch
            console.log('2️⃣ Getting employees by branch...');
            const branchEmployees = await this.makeRequest('GET', `/api/branches/${this.testBranchId}/employees`);
            const employeeExists = branchEmployees.some(emp => emp.id === employeeData.id);
            if (!employeeExists) {
                throw new Error('Employee not found in branch employees list');
            }
            console.log(`✅ Found ${branchEmployees.length} employees in test branch`);

            // Test 3: Get branch statistics
            console.log('3️⃣ Checking branch statistics...');
            const branchStats = await this.makeRequest('GET', '/api/branches?includeStats=true');
            const testBranchStats = branchStats.find(branch => branch.id === this.testBranchId);
            if (!testBranchStats || testBranchStats.employeeCount === 0) {
                throw new Error('Branch statistics do not reflect employee assignment');
            }
            console.log(`✅ Branch statistics: ${testBranchStats.employeeCount} employees, ${testBranchStats.activeEmployees} active`);

            // Test 4: Cleanup - Remove test employee
            console.log('4️⃣ Cleaning up test employee...');
            await this.makeRequest('DELETE', `/api/employees/${employeeData.id}`);
            console.log('✅ Test employee removed');

            console.log('\n🎉 Employee Branch Assignment Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Employee Branch Assignment Test FAILED:', error.message);
            return false;
        }
    }

    async testBranchValidation() {
        console.log('\n✅ Testing Branch Validation...');
        console.log('=' .repeat(50));

        try {
            // Test 1: Try to create branch with missing required fields
            console.log('1️⃣ Testing validation for missing fields...');
            try {
                await this.makeRequest('POST', '/api/branches', { description: 'Invalid branch' });
                throw new Error('Should have failed validation');
            } catch (error) {
                if (error.message.includes('Validation failed') || error.message.includes('required')) {
                    console.log('✅ Missing required fields validation working');
                } else {
                    throw error;
                }
            }

            // Test 2: Try to create branch with duplicate code
            console.log('2️⃣ Testing duplicate code validation...');
            try {
                await this.makeRequest('POST', '/api/branches', {
                    name: 'Duplicate Branch',
                    code: this.testBranchCode // Use existing test branch code
                });
                throw new Error('Should have failed duplicate code validation');
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log('✅ Duplicate code validation working');
                } else {
                    throw error;
                }
            }

            // Test 3: Try to delete branch with employees (if any)
            console.log('3️⃣ Testing deletion protection...');
            // First create an employee in the test branch
            const tempEmployee = {
                id: 'TEMP_EMP_001',
                userId: 'TEMP_EMP_001',
                name: 'Temporary Employee',
                position: 'Temp',
                department: 'Temp',
                branchId: this.testBranchId
            };
            
            await this.makeRequest('POST', '/api/employees', tempEmployee);
            
            try {
                await this.makeRequest('DELETE', `/api/branches/${this.testBranchId}`);
                throw new Error('Should have failed deletion protection');
            } catch (error) {
                if (error.message.includes('employees are assigned')) {
                    console.log('✅ Deletion protection working');
                } else {
                    throw error;
                }
            }
            
            // Cleanup temp employee
            await this.makeRequest('DELETE', `/api/employees/${tempEmployee.id}`);

            console.log('\n🎉 Branch Validation Test PASSED');
            return true;

        } catch (error) {
            console.error('\n❌ Branch Validation Test FAILED:', error.message);
            return false;
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test data...');

        try {
            // Remove test branch
            await this.makeRequest('DELETE', `/api/branches/${this.testBranchId}`);
            console.log('✅ Test branch removed');
        } catch (error) {
            console.warn('⚠️ Could not remove test branch:', error.message);
        }

        try {
            // Remove auto-created branch from device test
            await this.makeRequest('DELETE', '/api/branches/newbr');
            console.log('✅ Auto-created branch removed');
        } catch (error) {
            console.warn('⚠️ Could not remove auto-created branch:', error.message);
        }
    }

    async runAllTests() {
        console.log('🏢 Starting Branch Management System Tests');
        console.log('='.repeat(60));

        const results = {
            crud: false,
            deviceBranchCreation: false,
            employeeAssignment: false,
            validation: false
        };

        try {
            // Wait for server to be ready
            await this.delay(2000);

            // Run tests
            results.crud = await this.testBranchCRUD();
            const deviceResult = await this.testDeviceWithBranchCreation();
            results.deviceBranchCreation = deviceResult.success;
            results.employeeAssignment = await this.testEmployeeBranchAssignment();
            results.validation = await this.testBranchValidation();

            // Cleanup
            await this.cleanup();

            // Summary
            console.log('\n📋 Branch Management Test Results');
            console.log('=' .repeat(40));
            console.log(`Branch CRUD Operations: ${results.crud ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Device Branch Creation: ${results.deviceBranchCreation ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Employee Assignment: ${results.employeeAssignment ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Branch Validation: ${results.validation ? '✅ PASS' : '❌ FAIL'}`);

            const allPassed = Object.values(results).every(result => result === true);
            
            if (allPassed) {
                console.log('\n🎉 ALL BRANCH MANAGEMENT TESTS PASSED!');
                console.log('🏢 Your branch management system is working correctly.');
            } else {
                console.log('\n❌ Some branch management tests failed.');
            }

            return allPassed;

        } catch (error) {
            console.error('\n💥 Test execution failed:', error.message);
            return false;
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new BranchManagementTester();
    
    tester.runAllTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Unexpected error:', error.message);
            process.exit(1);
        });
}

module.exports = BranchManagementTester;
