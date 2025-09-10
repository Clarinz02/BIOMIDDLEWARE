import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';

import {
  SecurityService,
  authenticateToken,
  requireRole,
  auditMiddleware,
  securityHeaders,
  rateLimitMiddleware,
  requestIdMiddleware,
  validateInput,
  errorHandler,
} from '../security';
import { createTestUser } from '../../../test/setup';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('helmet', () => jest.fn(() => (req: any, res: any, next: any) => next()));
jest.mock('express-rate-limit', () => jest.fn(() => (req: any, res: any, next: any) => next()));

const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('SecurityService', () => {
  let securityService: SecurityService;
  
  beforeEach(() => {
    securityService = new SecurityService();
    jest.clearAllMocks();
  });
  
  describe('generateToken', () => {
    it('should generate a JWT token for a user', async () => {
      const testUser = createTestUser();
      const expectedToken = 'test.jwt.token';
      
      mockedJwt.sign.mockReturnValue(expectedToken);
      
      const token = await securityService.generateToken(testUser);
      
      expect(token).toBe(expectedToken);
      expect(mockedJwt.sign).toHaveBeenCalledWith(
        {
          userId: testUser.id,
          username: testUser.username,
          role: testUser.role,
          branchId: testUser.branchId,
        },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });
  });
  
  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const testToken = 'valid.jwt.token';
      const decodedPayload = {
        userId: 'user-123',
        username: 'testuser',
        role: 'admin',
        branchId: 'branch-1',
      };
      
      mockedJwt.verify.mockReturnValue(decodedPayload);
      
      const result = await securityService.verifyToken(testToken);
      
      expect(result).toEqual(decodedPayload);
      expect(mockedJwt.verify).toHaveBeenCalledWith(
        testToken,
        expect.any(String)
      );
    });
    
    it('should return null for invalid token', async () => {
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      const result = await securityService.verifyToken('invalid.token');
      
      expect(result).toBeNull();
    });
  });
  
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testpassword';
      const hashedPassword = 'hashed-password';
      
      mockedBcrypt.hash.mockResolvedValue(hashedPassword);
      
      const result = await securityService.hashPassword(password);
      
      expect(result).toBe(hashedPassword);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 10);
    });
  });
  
  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'testpassword';
      const hashedPassword = 'hashed-password';
      
      mockedBcrypt.compare.mockResolvedValue(true);
      
      const result = await securityService.verifyPassword(password, hashedPassword);
      
      expect(result).toBe(true);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
    });
    
    it('should reject an incorrect password', async () => {
      const password = 'wrongpassword';
      const hashedPassword = 'hashed-password';
      
      mockedBcrypt.compare.mockResolvedValue(false);
      
      const result = await securityService.verifyPassword(password, hashedPassword);
      
      expect(result).toBe(false);
    });
  });
  
  describe('hasPermission', () => {
    it('should grant admin access to all permissions', () => {
      const result = securityService.hasPermission('admin', 'device:delete');
      expect(result).toBe(true);
    });
    
    it('should grant manager specific permissions', () => {
      expect(securityService.hasPermission('manager', 'device:read')).toBe(true);
      expect(securityService.hasPermission('manager', 'device:write')).toBe(true);
      expect(securityService.hasPermission('manager', 'device:delete')).toBe(false);
    });
    
    it('should grant operator limited permissions', () => {
      expect(securityService.hasPermission('operator', 'device:read')).toBe(true);
      expect(securityService.hasPermission('operator', 'device:write')).toBe(false);
    });
    
    it('should grant user minimal permissions', () => {
      expect(securityService.hasPermission('user', 'attendance:read')).toBe(true);
      expect(securityService.hasPermission('user', 'device:read')).toBe(false);
    });
  });
  
  describe('logAuditEvent', () => {
    it('should log an audit event', () => {
      const event = {
        userId: 'user-123',
        action: 'login',
        resource: 'auth',
        details: { ip: '192.168.1.1' },
      };
      
      securityService.logAuditEvent(event);
      
      const auditLogs = securityService.getAuditLogs();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject(event);
      expect(auditLogs[0].timestamp).toBeValidDate();
      expect(auditLogs[0].id).toBeValidUUID();
    });
  });
  
  describe('getAuditLogs', () => {
    it('should return filtered audit logs', () => {
      // Add test events
      securityService.logAuditEvent({
        userId: 'user-1',
        action: 'create',
        resource: 'device',
      });
      
      securityService.logAuditEvent({
        userId: 'user-2',
        action: 'delete',
        resource: 'user',
      });
      
      const deviceLogs = securityService.getAuditLogs({ resource: 'device' });
      expect(deviceLogs).toHaveLength(1);
      expect(deviceLogs[0].resource).toBe('device');
      
      const user1Logs = securityService.getAuditLogs({ userId: 'user-1' });
      expect(user1Logs).toHaveLength(1);
      expect(user1Logs[0].userId).toBe('user-1');
    });
    
    it('should respect limit parameter', () => {
      // Add multiple events
      for (let i = 0; i < 5; i++) {
        securityService.logAuditEvent({
          userId: 'user-1',
          action: 'test',
          resource: 'test',
        });
      }
      
      const logs = securityService.getAuditLogs({ limit: 3 });
      expect(logs).toHaveLength(3);
    });
  });
});

describe('Authentication Middleware', () => {
  let app: express.Application;
  let securityService: SecurityService;
  
  beforeEach(() => {
    app = express();
    securityService = new SecurityService();
    app.use(express.json());
  });
  
  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const testUser = createTestUser();
      const token = 'Bearer valid.jwt.token';
      
      mockedJwt.verify.mockReturnValue({
        userId: testUser.id,
        username: testUser.username,
        role: testUser.role,
        branchId: testUser.branchId,
      });
      
      app.get('/protected', authenticateToken, (req, res) => {
        res.json({ user: (req as any).user });
      });
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', token);
      
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        userId: testUser.id,
        username: testUser.username,
        role: testUser.role,
        branchId: testUser.branchId,
      });
    });
    
    it('should reject missing token', async () => {
      app.get('/protected', authenticateToken, (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app).get('/protected');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });
    
    it('should reject invalid token', async () => {
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      app.get('/protected', authenticateToken, (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid.token');
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });
  
  describe('requireRole', () => {
    it('should allow access for required role', async () => {
      app.use((req, res, next) => {
        (req as any).user = { role: 'admin' };
        next();
      });
      
      app.get('/admin', requireRole(['admin']), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app).get('/admin');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should deny access for insufficient role', async () => {
      app.use((req, res, next) => {
        (req as any).user = { role: 'user' };
        next();
      });
      
      app.get('/admin', requireRole(['admin']), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app).get('/admin');
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });
    
    it('should allow access for multiple allowed roles', async () => {
      app.use((req, res, next) => {
        (req as any).user = { role: 'manager' };
        next();
      });
      
      app.get('/management', requireRole(['admin', 'manager']), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app).get('/management');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

describe('Utility Middleware', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
  });
  
  describe('requestIdMiddleware', () => {
    it('should add request ID to request object', async () => {
      app.use(requestIdMiddleware);
      app.get('/test', (req, res) => {
        res.json({ requestId: (req as any).requestId });
      });
      
      const response = await request(app).get('/test');
      
      expect(response.status).toBe(200);
      expect(response.body.requestId).toBeValidUUID();
    });
    
    it('should use provided X-Request-ID header', async () => {
      const customRequestId = '123e4567-e89b-12d3-a456-426614174000';
      
      app.use(requestIdMiddleware);
      app.get('/test', (req, res) => {
        res.json({ requestId: (req as any).requestId });
      });
      
      const response = await request(app)
        .get('/test')
        .set('X-Request-ID', customRequestId);
      
      expect(response.status).toBe(200);
      expect(response.body.requestId).toBe(customRequestId);
    });
  });
  
  describe('validateInput', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name'],
      additionalProperties: false,
    };
    
    it('should validate correct input', async () => {
      app.post('/test', validateInput(schema), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .post('/test')
        .send({ name: 'John', age: 25 });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should reject invalid input', async () => {
      app.post('/test', validateInput(schema), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .post('/test')
        .send({ age: 25 }); // Missing required 'name'
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toBeDefined();
    });
    
    it('should reject additional properties', async () => {
      app.post('/test', validateInput(schema), (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(app)
        .post('/test')
        .send({ name: 'John', age: 25, extra: 'not allowed' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });
  });
  
  describe('errorHandler', () => {
    it('should handle validation errors', async () => {
      app.get('/test', (req, res, next) => {
        const error = new Error('Validation failed');
        (error as any).statusCode = 400;
        (error as any).code = 'VALIDATION_ERROR';
        next(error);
      });
      
      app.use(errorHandler);
      
      const response = await request(app).get('/test');
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
    
    it('should handle generic errors', async () => {
      app.get('/test', (req, res, next) => {
        throw new Error('Something went wrong');
      });
      
      app.use(errorHandler);
      
      const response = await request(app).get('/test');
      
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
    
    it('should include request ID in error response', async () => {
      app.use(requestIdMiddleware);
      app.get('/test', (req, res, next) => {
        throw new Error('Test error');
      });
      
      app.use(errorHandler);
      
      const response = await request(app).get('/test');
      
      expect(response.status).toBe(500);
      expect(response.body.requestId).toBeValidUUID();
    });
  });
});
