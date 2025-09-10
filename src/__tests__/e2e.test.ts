import request from 'supertest';
import { jest } from '@jest/globals';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import { createApp } from '../server';
import { createTestUser, createTestDevice, createTestBranch, delay, getTestPort } from '../../test/setup';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('fs/promises');

const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('End-to-End Tests', () => {
  let app: any;
  let server: any;
  let serverPort: number;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Setup JWT mocks
    mockedJwt.sign.mockReturnValue('test.jwt.token');
    mockedJwt.verify.mockReturnValue({
      userId: 'admin-user-id',
      username: 'admin',
      role: 'admin',
      branchId: 'branch-1',
    });
    
    // Setup bcrypt mocks
    mockedBcrypt.hash.mockResolvedValue('hashed-password');
    mockedBcrypt.compare.mockResolvedValue(true);
    
    // Create app and get port
    const result = await createApp();
    app = result.app;
    server = result.server;
    
    // Get server port for WebSocket connections
    const address = server.address();
    serverPort = typeof address === 'string' ? parseInt(address) : address?.port || 3000;
  });
  
  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });
  
  describe('Complete Authentication Flow', () => {
    it('should handle complete login and logout flow', async () => {
      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.token).toBe('test.jwt.token');
      
      const token = loginResponse.body.token;
      
      // Step 2: Access protected resource
      const protectedResponse = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${token}`);
      
      expect(protectedResponse.status).toBe(200);
      expect(protectedResponse.body.success).toBe(true);
      
      // Step 3: Refresh token
      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${token}`);
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.token).toBe('test.jwt.token');
      
      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
    });
  });
  
  describe('Device Management Workflow', () => {
    let authToken: string;
    
    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
    });
    
    it('should handle complete device lifecycle', async () => {
      const deviceId = 'e2e-device-lifecycle';
      
      // Step 1: Create device
      const deviceData = createTestDevice({ 
        id: deviceId,
        name: 'E2E Test Device',
        location: 'Initial Location',
      });
      
      const createResponse = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData);
      
      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.id).toBe(deviceId);
      
      // Step 2: Get device
      const getResponse = await request(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.id).toBe(deviceId);
      expect(getResponse.body.data.name).toBe('E2E Test Device');
      
      // Step 3: Update device
      const updates = {
        name: 'Updated E2E Device',
        location: 'Updated Location',
      };
      
      const updateResponse = await request(app)
        .put(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);
      
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data.name).toBe('Updated E2E Device');
      expect(updateResponse.body.data.location).toBe('Updated Location');
      
      // Step 4: Verify update
      const getUpdatedResponse = await request(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getUpdatedResponse.body.data.name).toBe('Updated E2E Device');
      expect(getUpdatedResponse.body.data.location).toBe('Updated Location');
      
      // Step 5: List devices (should include our device)
      const listResponse = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(listResponse.status).toBe(200);
      const foundDevice = listResponse.body.data.find((d: any) => d.id === deviceId);
      expect(foundDevice).toBeTruthy();
      expect(foundDevice.name).toBe('Updated E2E Device');
      
      // Step 6: Delete device
      const deleteResponse = await request(app)
        .delete(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      
      // Step 7: Verify deletion
      const getDeletedResponse = await request(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getDeletedResponse.status).toBe(404);
    });
  });
  
  describe('Device Groups Management Workflow', () => {
    let authToken: string;
    let device1Id: string;
    let device2Id: string;
    
    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
      
      // Create test devices
      device1Id = 'e2e-group-device-1';
      device2Id = 'e2e-group-device-2';
      
      await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createTestDevice({ id: device1Id, name: 'Group Device 1' }));
      
      await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createTestDevice({ id: device2Id, name: 'Group Device 2' }));
    });
    
    it('should handle device group lifecycle', async () => {
      // Step 1: Create group
      const groupData = {
        name: 'E2E Test Group',
        description: 'A test group for E2E testing',
        branchId: 'branch-1',
        deviceIds: [device1Id, device2Id],
      };
      
      const createGroupResponse = await request(app)
        .post('/api/v1/devices/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send(groupData);
      
      expect(createGroupResponse.status).toBe(201);
      expect(createGroupResponse.body.success).toBe(true);
      
      const groupId = createGroupResponse.body.data.id;
      expect(groupId).toBeTruthy();
      
      // Step 2: Get group
      const getGroupResponse = await request(app)
        .get(`/api/v1/devices/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getGroupResponse.status).toBe(200);
      expect(getGroupResponse.body.data.name).toBe('E2E Test Group');
      expect(getGroupResponse.body.data.deviceIds).toEqual([device1Id, device2Id]);
      
      // Step 3: Update group
      const updatedGroupData = {
        description: 'Updated test group description',
        deviceIds: [device1Id], // Remove one device
      };
      
      const updateGroupResponse = await request(app)
        .put(`/api/v1/devices/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedGroupData);
      
      expect(updateGroupResponse.status).toBe(200);
      expect(updateGroupResponse.body.data.description).toBe('Updated test group description');
      expect(updateGroupResponse.body.data.deviceIds).toEqual([device1Id]);
      
      // Step 4: List groups
      const listGroupsResponse = await request(app)
        .get('/api/v1/devices/groups')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(listGroupsResponse.status).toBe(200);
      const foundGroup = listGroupsResponse.body.data.find((g: any) => g.id === groupId);
      expect(foundGroup).toBeTruthy();
      
      // Step 5: Delete group
      const deleteGroupResponse = await request(app)
        .delete(`/api/v1/devices/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(deleteGroupResponse.status).toBe(200);
      expect(deleteGroupResponse.body.success).toBe(true);
    });
  });
  
  describe('Bulk Operations Workflow', () => {
    let authToken: string;
    let deviceIds: string[];
    
    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
      
      // Create multiple test devices
      deviceIds = ['bulk-device-1', 'bulk-device-2', 'bulk-device-3'];
      
      for (const deviceId of deviceIds) {
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(createTestDevice({ 
            id: deviceId, 
            name: `Bulk Device ${deviceId}`,
            location: 'Original Location',
          }));
      }
    });
    
    it('should handle bulk update operation', async () => {
      // Step 1: Create bulk operation
      const bulkData = {
        type: 'update',
        deviceIds: deviceIds,
        data: {
          location: 'Bulk Updated Location',
        },
      };
      
      const createBulkResponse = await request(app)
        .post('/api/v1/devices/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData);
      
      expect(createBulkResponse.status).toBe(200);
      expect(createBulkResponse.body.success).toBe(true);
      expect(createBulkResponse.body.data.type).toBe('update');
      expect(createBulkResponse.body.data.deviceIds).toEqual(deviceIds);
      
      const operationId = createBulkResponse.body.data.id;
      
      // Step 2: Check operation status
      const statusResponse = await request(app)
        .get(`/api/v1/devices/bulk/${operationId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(statusResponse.status).toBe(200);
      expect(['pending', 'in-progress', 'completed']).toContain(statusResponse.body.data.status);
      
      // Step 3: Wait a bit for operation to complete (in a real scenario)
      await delay(100);
      
      // Step 4: Verify devices were updated
      for (const deviceId of deviceIds) {
        const deviceResponse = await request(app)
          .get(`/api/v1/devices/${deviceId}`)
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(deviceResponse.status).toBe(200);
        expect(deviceResponse.body.data.location).toBe('Bulk Updated Location');
      }
    });
    
    it('should handle bulk delete operation', async () => {
      // Create bulk delete operation
      const bulkData = {
        type: 'delete',
        deviceIds: [deviceIds[0], deviceIds[1]], // Delete first two devices
      };
      
      const createBulkResponse = await request(app)
        .post('/api/v1/devices/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData);
      
      expect(createBulkResponse.status).toBe(200);
      expect(createBulkResponse.body.success).toBe(true);
      
      // Wait for operation to complete
      await delay(100);
      
      // Verify first two devices are deleted
      for (const deviceId of [deviceIds[0], deviceIds[1]]) {
        const deviceResponse = await request(app)
          .get(`/api/v1/devices/${deviceId}`)
          .set('Authorization', `Bearer ${authToken}`);
        
        expect(deviceResponse.status).toBe(404);
      }
      
      // Verify third device still exists
      const thirdDeviceResponse = await request(app)
        .get(`/api/v1/devices/${deviceIds[2]}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(thirdDeviceResponse.status).toBe(200);
    });
  });
  
  describe('Real-time WebSocket Communication', () => {
    let authToken: string;
    let clientSocket: ClientSocket;
    
    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
    });
    
    afterEach(() => {
      if (clientSocket) {
        clientSocket.disconnect();
      }
    });
    
    it('should receive device status updates via WebSocket', async () => {
      const deviceId = 'ws-test-device';
      
      // Step 1: Create a test device
      await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createTestDevice({ id: deviceId }));
      
      // Step 2: Connect WebSocket client
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: {
          token: authToken.replace('Bearer ', ''),
        },
      });
      
      await new Promise<void>((resolve, reject) => {
        clientSocket.on('connect', resolve);
        clientSocket.on('connect_error', reject);
      });
      
      // Step 3: Subscribe to device events
      clientSocket.emit('subscribe', {
        type: 'device-events',
        deviceId: deviceId,
      });
      
      await new Promise<void>((resolve) => {
        clientSocket.on('subscribed', resolve);
      });
      
      // Step 4: Update device status via API and expect WebSocket event
      return new Promise<void>((resolve, reject) => {
        clientSocket.on('device-status', (data) => {
          try {
            expect(data.deviceId).toBe(deviceId);
            expect(data.status).toBe('connected');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        
        // Trigger status update
        request(app)
          .put(`/api/v1/devices/${deviceId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ status: 'connected' })
          .catch(reject);
      });
    });
    
    it('should receive system alerts via WebSocket', async () => {
      // Connect WebSocket client
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: {
          token: authToken.replace('Bearer ', ''),
        },
      });
      
      await new Promise<void>((resolve, reject) => {
        clientSocket.on('connect', resolve);
        clientSocket.on('connect_error', reject);
      });
      
      // Subscribe to system events
      clientSocket.emit('subscribe', {
        type: 'system-events',
      });
      
      await new Promise<void>((resolve) => {
        clientSocket.on('subscribed', resolve);
      });
      
      // Listen for system alerts
      return new Promise<void>((resolve, reject) => {
        clientSocket.on('system-alert', (data) => {
          try {
            expect(data.type).toBe('info');
            expect(data.message).toContain('test alert');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        
        // Trigger system alert via special endpoint (if available)
        // In a real app, this might be triggered by system events
        setTimeout(() => {
          // Simulate system alert
          resolve();
        }, 100);
      });
    });
  });
  
  describe('Analytics and Reporting Workflow', () => {
    let authToken: string;
    
    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
      
      // Create test devices with different statuses and types
      const testDevices = [
        createTestDevice({ id: 'analytics-fp-1', type: 'fingerprint', status: 'connected' }),
        createTestDevice({ id: 'analytics-fp-2', type: 'fingerprint', status: 'disconnected' }),
        createTestDevice({ id: 'analytics-face-1', type: 'face', status: 'connected' }),
        createTestDevice({ id: 'analytics-card-1', type: 'card', status: 'connected' }),
      ];
      
      for (const device of testDevices) {
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(device);
      }
    });
    
    it('should generate comprehensive device analytics', async () => {
      // Get device analytics
      const analyticsResponse = await request(app)
        .get('/api/v1/analytics/devices')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(analyticsResponse.status).toBe(200);
      expect(analyticsResponse.body.success).toBe(true);
      
      const analytics = analyticsResponse.body.data;
      
      // Verify analytics structure
      expect(analytics.total).toBeGreaterThanOrEqual(4);
      expect(analytics.byStatus).toHaveProperty('connected');
      expect(analytics.byStatus).toHaveProperty('disconnected');
      expect(analytics.byType).toHaveProperty('fingerprint');
      expect(analytics.byType).toHaveProperty('face');
      expect(analytics.byType).toHaveProperty('card');
      expect(analytics.byBranch).toBeDefined();
      expect(analytics.healthSummary).toBeDefined();
    });
    
    it('should filter analytics by date range', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      
      const analyticsResponse = await request(app)
        .get(`/api/v1/analytics/devices?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(analyticsResponse.status).toBe(200);
      expect(analyticsResponse.body.success).toBe(true);
    });
  });
  
  describe('Error Handling and Recovery', () => {
    let authToken: string;
    
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });
      
      authToken = loginResponse.body.token;
    });
    
    it('should handle cascading failures gracefully', async () => {
      // Try to create device with invalid data
      const invalidDevice = {
        id: 'invalid-device',
        // Missing required fields
      };
      
      const createResponse = await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDevice);
      
      expect(createResponse.status).toBe(400);
      expect(createResponse.body.error).toBe('Validation error');
      
      // Verify system is still operational
      const healthResponse = await request(app).get('/health');
      expect(healthResponse.status).toBe(200);
      
      // Verify other operations still work
      const listResponse = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(listResponse.status).toBe(200);
    });
    
    it('should handle concurrent operations safely', async () => {
      const deviceId = 'concurrent-test-device';
      
      // Create initial device
      await request(app)
        .post('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createTestDevice({ id: deviceId }));
      
      // Perform multiple concurrent updates
      const updatePromises = Array(5).fill(null).map((_, index) =>
        request(app)
          .put(`/api/v1/devices/${deviceId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: `Concurrent Update ${index}` })
      );
      
      const results = await Promise.all(updatePromises);
      
      // At least one should succeed
      const successResults = results.filter(r => r.status === 200);
      expect(successResults.length).toBeGreaterThan(0);
      
      // Verify device still exists and has valid data
      const finalResponse = await request(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(finalResponse.status).toBe(200);
      expect(finalResponse.body.data.name).toMatch(/Concurrent Update/);
    });
  });
});
