import request from 'supertest';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import { createApp } from '../server';
import { createTestUser, createTestDevice, createTestBranch, delay } from '../../test/setup';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('fs/promises');

const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Server Integration Tests', () => {
  let app: any;
  let server: any;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Setup JWT mocks
    mockedJwt.sign.mockReturnValue('test.jwt.token');
    mockedJwt.verify.mockReturnValue({
      userId: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      branchId: 'branch-1',
    });
    
    // Setup bcrypt mocks
    mockedBcrypt.hash.mockResolvedValue('hashed-password');
    mockedBcrypt.compare.mockResolvedValue(true);
    
    // Create app
    const result = await createApp();
    app = result.app;
    server = result.server;
  });
  
  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });
  
  describe('Health Endpoints', () => {
    describe('GET /health', () => {
      it('should return system health status', async () => {
        const response = await request(app).get('/health');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: 'healthy',
          timestamp: expect.any(String),
          services: {
            api: expect.objectContaining({
              status: 'healthy',
            }),
            websocket: expect.objectContaining({
              status: 'healthy',
            }),
            deviceManager: expect.objectContaining({
              status: 'healthy',
            }),
          },
        });
      });
    });
    
    describe('GET /ready', () => {
      it('should return readiness status', async () => {
        const response = await request(app).get('/ready');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          ready: true,
          timestamp: expect.any(String),
          checks: expect.objectContaining({
            database: expect.any(Boolean),
            services: expect.any(Boolean),
          }),
        });
      });
    });
  });
  
  describe('Authentication Endpoints', () => {
    describe('POST /api/v1/auth/login', () => {
      it('should authenticate user with valid credentials', async () => {
        const loginData = {
          username: 'testuser',
          password: 'password123',
        };
        
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData);
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          token: 'test.jwt.token',
          user: expect.objectContaining({
            username: 'testuser',
            role: 'admin',
          }),
        });
        
        expect(mockedBcrypt.compare).toHaveBeenCalledWith(loginData.password, expect.any(String));
        expect(mockedJwt.sign).toHaveBeenCalled();
      });
      
      it('should reject invalid credentials', async () => {
        mockedBcrypt.compare.mockResolvedValue(false);
        
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            username: 'testuser',\n            password: 'wrongpassword',
          });
        
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid credentials',
        });
      });
      
      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'testuser' }); // Missing password
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation error');
      });
    });
    
    describe('POST /api/v1/auth/refresh', () => {
      it('should refresh valid token', async () => {
        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .set('Authorization', 'Bearer valid.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          token: 'test.jwt.token',
        });
      });
      
      it('should reject missing token', async () => {
        const response = await request(app)
          .post('/api/v1/auth/refresh');
        
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Access token required');
      });
    });
    
    describe('POST /api/v1/auth/logout', () => {
      it('should logout successfully', async () => {
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', 'Bearer valid.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          message: 'Logged out successfully',
        });
      });
    });
  });
  
  describe('Device Management Endpoints', () => {
    beforeEach(() => {
      // Setup authenticated user for device endpoints
      mockedJwt.verify.mockReturnValue({
        userId: 'admin-user-id',
        username: 'admin',
        role: 'admin',
        branchId: 'branch-1',
      });
    });
    
    describe('GET /api/v1/devices', () => {
      it('should return list of devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.any(Array),
          pagination: expect.objectContaining({
            page: expect.any(Number),
            limit: expect.any(Number),
            total: expect.any(Number),
          }),
        });
      });
      
      it('should filter devices by branch', async () => {
        const response = await request(app)
          .get('/api/v1/devices?branchId=branch-1')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
      
      it('should filter devices by status', async () => {
        const response = await request(app)
          .get('/api/v1/devices?status=connected')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
      
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/devices');
        
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Access token required');
      });
    });
    
    describe('POST /api/v1/devices', () => {
      it('should create a new device', async () => {
        const deviceData = {
          id: 'new-device-1',
          name: 'New Test Device',
          type: 'fingerprint',
          brand: 'TestBrand',
          model: 'TestModel',
          ipAddress: '192.168.1.200',
          port: 4370,
          serialNumber: 'NEW123456',
          branchId: 'branch-1',
          location: 'New Location',
        };
        
        const response = await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(deviceData);
        
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining(deviceData),
        });
      });
      
      it('should validate device data', async () => {
        const invalidData = {
          name: 'Invalid Device',
          // Missing required fields
        };
        
        const response = await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(invalidData);
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation error');
      });
      
      it('should require admin role', async () => {
        mockedJwt.verify.mockReturnValue({
          userId: 'user-id',
          username: 'user',
          role: 'user',
          branchId: 'branch-1',
        });
        
        const response = await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer user.jwt.token')
          .send(createTestDevice());
        
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Insufficient permissions');
      });
    });
    
    describe('GET /api/v1/devices/:id', () => {
      it('should return device by ID', async () => {
        // First create a device
        const deviceData = createTestDevice({ id: 'test-device-get' });
        
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(deviceData);
        
        // Then get it
        const response = await request(app)
          .get('/api/v1/devices/test-device-get')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining({
            id: 'test-device-get',
          }),
        });
      });
      
      it('should return 404 for non-existent device', async () => {
        const response = await request(app)
          .get('/api/v1/devices/non-existent')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Device not found');
      });
    });
    
    describe('PUT /api/v1/devices/:id', () => {
      it('should update existing device', async () => {
        // First create a device
        const deviceData = createTestDevice({ id: 'test-device-update' });
        
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(deviceData);
        
        // Then update it
        const updates = {
          name: 'Updated Device Name',
          location: 'Updated Location',
        };
        
        const response = await request(app)
          .put('/api/v1/devices/test-device-update')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(updates);
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining(updates),
        });
      });
      
      it('should return 404 for non-existent device', async () => {
        const response = await request(app)
          .put('/api/v1/devices/non-existent')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send({ name: 'Updated Name' });
        
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Device not found');
      });
    });
    
    describe('DELETE /api/v1/devices/:id', () => {
      it('should delete existing device', async () => {
        // First create a device
        const deviceData = createTestDevice({ id: 'test-device-delete' });
        
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(deviceData);
        
        // Then delete it
        const response = await request(app)
          .delete('/api/v1/devices/test-device-delete')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          message: 'Device deleted successfully',
        });
        
        // Verify it's deleted
        const getResponse = await request(app)
          .get('/api/v1/devices/test-device-delete')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(getResponse.status).toBe(404);
      });
      
      it('should return 404 for non-existent device', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/non-existent')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Device not found');
      });
    });
  });
  
  describe('Device Groups Endpoints', () => {
    beforeEach(() => {
      mockedJwt.verify.mockReturnValue({
        userId: 'admin-user-id',
        username: 'admin',
        role: 'admin',
        branchId: 'branch-1',
      });
    });
    
    describe('GET /api/v1/devices/groups', () => {
      it('should return list of device groups', async () => {
        const response = await request(app)
          .get('/api/v1/devices/groups')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.any(Array),
        });
      });
    });
    
    describe('POST /api/v1/devices/groups', () => {
      it('should create a new device group', async () => {
        const groupData = {
          name: 'Test Group',
          description: 'A test group',
          branchId: 'branch-1',
          deviceIds: ['device-1', 'device-2'],
        };
        
        const response = await request(app)
          .post('/api/v1/devices/groups')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(groupData);
        
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining({
            name: groupData.name,
            description: groupData.description,
            branchId: groupData.branchId,
            deviceIds: groupData.deviceIds,
          }),
        });
      });
    });
  });
  
  describe('Bulk Operations Endpoints', () => {
    beforeEach(() => {
      mockedJwt.verify.mockReturnValue({
        userId: 'admin-user-id',
        username: 'admin',
        role: 'admin',
        branchId: 'branch-1',
      });
    });
    
    describe('POST /api/v1/devices/bulk', () => {
      it('should create bulk operation', async () => {
        // First create some devices
        const device1 = createTestDevice({ id: 'bulk-device-1' });
        const device2 = createTestDevice({ id: 'bulk-device-2' });
        
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(device1);
        
        await request(app)
          .post('/api/v1/devices')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(device2);
        
        // Create bulk operation
        const bulkData = {
          type: 'update',
          deviceIds: ['bulk-device-1', 'bulk-device-2'],
          data: { location: 'Bulk Updated Location' },
        };
        
        const response = await request(app)
          .post('/api/v1/devices/bulk')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(bulkData);
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining({
            type: 'update',
            deviceIds: ['bulk-device-1', 'bulk-device-2'],
            status: 'pending',
          }),
        });
      });
      
      it('should validate bulk operation data', async () => {
        const invalidData = {
          type: 'invalid-type',
          deviceIds: [],
        };
        
        const response = await request(app)
          .post('/api/v1/devices/bulk')
          .set('Authorization', 'Bearer admin.jwt.token')
          .send(invalidData);
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation error');
      });
    });
  });
  
  describe('Analytics Endpoints', () => {
    beforeEach(() => {
      mockedJwt.verify.mockReturnValue({
        userId: 'admin-user-id',
        username: 'admin',
        role: 'admin',
        branchId: 'branch-1',
      });
    });
    
    describe('GET /api/v1/analytics/devices', () => {
      it('should return device analytics', async () => {
        const response = await request(app)
          .get('/api/v1/analytics/devices')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          data: expect.objectContaining({
            total: expect.any(Number),
            byStatus: expect.any(Object),
            byType: expect.any(Object),
            byBranch: expect.any(Object),
            healthSummary: expect.any(Object),
          }),
        });
      });
      
      it('should filter analytics by date range', async () => {
        const response = await request(app)
          .get('/api/v1/analytics/devices?startDate=2023-01-01&endDate=2023-12-31')
          .set('Authorization', 'Bearer admin.jwt.token');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
  
  describe('Legacy API Compatibility', () => {
    it('should handle legacy device list endpoint', async () => {
      const response = await request(app).get('/api/devices');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        devices: expect.any(Array),
      });
    });
    
    it('should handle legacy device status endpoint', async () => {
      const response = await request(app).get('/api/device/status/device-1');
      
      // Should return 404 if device doesn't exist, or device data if it does
      expect([200, 404]).toContain(response.status);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/v1/unknown-endpoint');
      
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Endpoint not found',
      });
    });
    
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      
      expect(response.status).toBe(400);
    });
    
    it('should include request ID in error responses', async () => {
      const response = await request(app).get('/api/v1/unknown-endpoint');
      
      expect(response.status).toBe(404);
      expect(response.body.requestId).toBeValidUUID();
    });
  });
  
  describe('Rate Limiting', () => {
    it('should not exceed rate limits for normal usage', async () => {
      // Make several requests that should not hit rate limit
      const requests = Array(5).fill(null).map(() =>
        request(app).get('/health')
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
  
  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });
  
  describe('CORS', () => {
    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/devices')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeTruthy();
      expect(response.headers['access-control-allow-methods']).toBeTruthy();
    });
  });
});
