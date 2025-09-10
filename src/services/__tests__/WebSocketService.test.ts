import { jest } from '@jest/globals';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

import { WebSocketService } from '../WebSocketService';
import { SecurityService } from '../../middleware/security';
import { createTestUser, createTestDevice, delay, getTestPort } from '../../../test/setup';

// Mock dependencies
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('WebSocketService', () => {
  let httpServer: HTTPServer;
  let webSocketService: WebSocketService;
  let securityService: SecurityService;
  let clientSocket: ClientSocket;
  let serverPort: number;
  
  beforeEach(async () => {
    // Create HTTP server
    httpServer = new HTTPServer();
    securityService = new SecurityService();
    
    // Get a random port for testing
    serverPort = getTestPort();
    if (serverPort === 0) {
      serverPort = 3001; // fallback port
    }
    
    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(serverPort, () => {
        resolve();
      });
    });
    
    // Initialize WebSocket service
    webSocketService = new WebSocketService(httpServer, securityService);
    await webSocketService.initialize();
    
    // Setup JWT mock
    mockedJwt.verify.mockReturnValue({
      userId: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      branchId: 'branch-1',
    });
    
    jest.clearAllMocks();
  });
  
  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    await webSocketService.shutdown();
    
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });
  
  describe('Initialization', () => {
    it('should initialize WebSocket server', () => {
      expect(webSocketService).toBeDefined();
    });
  });
  
  describe('Authentication', () => {
    it('should authenticate client with valid JWT token', (done) => {
      const testUser = createTestUser();
      mockedJwt.verify.mockReturnValue({
        userId: testUser.id,
        username: testUser.username,
        role: testUser.role,
        branchId: testUser.branchId,
      });
      
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: {
          token: 'valid.jwt.token',
        },
      });
      
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
      
      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });
    
    it('should reject client with invalid JWT token', (done) => {
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: {
          token: 'invalid.jwt.token',
        },
      });
      
      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
      
      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        done();
      });
    });
    
    it('should reject client without token', (done) => {
      clientSocket = ClientIO(`http://localhost:${serverPort}`);
      
      clientSocket.on('connect', () => {
        done(new Error('Should not connect without token'));
      });
      
      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        done();
      });
    });
  });
  
  describe('Room Subscriptions', () => {
    beforeEach((done) => {
      clientSocket = ClientIO(`http://localhost:${serverPort}`, {
        auth: {
          token: 'valid.jwt.token',
        },
      });
      
      clientSocket.on('connect', () => {
        done();
      });
    });
    
    it('should subscribe to device events', (done) => {
      const deviceId = 'device-1';
      
      clientSocket.emit('subscribe', {
        type: 'device-events',
        deviceId: deviceId,
      });
      
      clientSocket.on('subscribed', (data) => {
        expect(data.type).toBe('device-events');
        expect(data.deviceId).toBe(deviceId);
        done();
      });
    });
    
    it('should subscribe to branch events', (done) => {
      const branchId = 'branch-1';
      
      clientSocket.emit('subscribe', {
        type: 'branch-events',
        branchId: branchId,
      });
      
      clientSocket.on('subscribed', (data) => {
        expect(data.type).toBe('branch-events');
        expect(data.branchId).toBe(branchId);
        done();
      });
    });
    
    it('should subscribe to system events', (done) => {
      clientSocket.emit('subscribe', {
        type: 'system-events',
      });
      
      clientSocket.on('subscribed', (data) => {
        expect(data.type).toBe('system-events');
        done();
      });
    });
    
    it('should unsubscribe from events', (done) => {
      const deviceId = 'device-1';
      
      // First subscribe
      clientSocket.emit('subscribe', {
        type: 'device-events',
        deviceId: deviceId,
      });
      
      clientSocket.on('subscribed', () => {
        // Then unsubscribe
        clientSocket.emit('unsubscribe', {
          type: 'device-events',
          deviceId: deviceId,
        });
        
        clientSocket.on('unsubscribed', (data) => {
          expect(data.type).toBe('device-events');
          expect(data.deviceId).toBe(deviceId);
          done();
        });
      });
    });
  });
  
  describe('Broadcasting', () => {
    let client1: ClientSocket;
    let client2: ClientSocket;
    
    beforeEach((done) => {
      let connectedCount = 0;
      const checkAllConnected = () => {
        connectedCount++;
        if (connectedCount === 2) {
          done();
        }
      };
      
      client1 = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      client1.on('connect', checkAllConnected);
      
      client2 = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      client2.on('connect', checkAllConnected);
    });
    
    afterEach(() => {
      if (client1) client1.disconnect();
      if (client2) client2.disconnect();
    });
    
    describe('broadcastDeviceStatus', () => {
      it('should broadcast device status to subscribers', (done) => {
        const deviceId = 'device-1';
        const status = 'connected' as const;
        
        // Subscribe client1 to device events
        client1.emit('subscribe', {
          type: 'device-events',
          deviceId: deviceId,
        });
        
        client1.on('subscribed', () => {
          // Broadcast device status
          webSocketService.broadcastDeviceStatus(deviceId, status);
          
          // Client1 should receive the event
          client1.on('device-status', (data) => {
            expect(data.deviceId).toBe(deviceId);
            expect(data.status).toBe(status);
            expect(data.timestamp).toBeValidDate();
            done();
          });
        });
      });
      
      it('should not send to unsubscribed clients', (done) => {
        const deviceId = 'device-1';
        const status = 'connected' as const;
        
        let client1Received = false;
        let client2Received = false;
        
        // Only subscribe client1
        client1.emit('subscribe', {
          type: 'device-events',
          deviceId: deviceId,
        });
        
        client1.on('subscribed', () => {
          // Set up listeners
          client1.on('device-status', () => {
            client1Received = true;
            checkResults();
          });
          
          client2.on('device-status', () => {
            client2Received = true;
            checkResults();
          });
          
          // Broadcast after short delay
          setTimeout(() => {
            webSocketService.broadcastDeviceStatus(deviceId, status);
          }, 50);
          
          // Check results after longer delay
          setTimeout(() => {
            checkResults();
          }, 200);
        });
        
        const checkResults = () => {
          if (client1Received && !client2Received) {
            done();
          } else if (client1Received && client2Received) {
            done(new Error('Client2 should not have received the message'));
          }
          // If neither received yet, wait more
        };
      });
    });
    
    describe('broadcastDeviceHealth', () => {
      it('should broadcast device health updates', (done) => {
        const deviceId = 'device-1';
        const health = {
          status: 'healthy' as const,
          lastCheck: new Date().toISOString(),
          uptime: 3600,
          memoryUsage: 65,
          diskUsage: 40,
          errors: [],
        };
        
        client1.emit('subscribe', {
          type: 'device-events',
          deviceId: deviceId,
        });
        
        client1.on('subscribed', () => {
          webSocketService.broadcastDeviceHealth(deviceId, health);
          
          client1.on('device-health', (data) => {
            expect(data.deviceId).toBe(deviceId);
            expect(data.health).toMatchObject(health);
            expect(data.timestamp).toBeValidDate();
            done();
          });
        });
      });
    });
    
    describe('broadcastUserVerification', () => {
      it('should broadcast user verification events', (done) => {
        const deviceId = 'device-1';
        const verification = {
          userId: 'user-123',
          deviceId: deviceId,
          method: 'fingerprint' as const,
          result: 'success' as const,
          confidence: 95,
          timestamp: new Date().toISOString(),
        };
        
        client1.emit('subscribe', {
          type: 'device-events',
          deviceId: deviceId,
        });
        
        client1.on('subscribed', () => {
          webSocketService.broadcastUserVerification(verification);
          
          client1.on('user-verification', (data) => {
            expect(data).toMatchObject(verification);
            done();
          });
        });
      });
    });
    
    describe('broadcastSystemAlert', () => {
      it('should broadcast system alerts to all clients', (done) => {
        const alert = {
          id: 'alert-1',
          type: 'warning' as const,
          message: 'System alert test',
          source: 'test',
          timestamp: new Date().toISOString(),
        };
        
        let client1Received = false;
        let client2Received = false;
        
        const checkBothReceived = () => {
          if (client1Received && client2Received) {
            done();
          }
        };
        
        client1.on('system-alert', (data) => {
          expect(data).toMatchObject(alert);
          client1Received = true;
          checkBothReceived();
        });
        
        client2.on('system-alert', (data) => {
          expect(data).toMatchObject(alert);
          client2Received = true;
          checkBothReceived();
        });
        
        // Broadcast to all clients
        webSocketService.broadcastSystemAlert(alert);
      });
    });
    
    describe('broadcastBulkOperationProgress', () => {
      it('should broadcast bulk operation progress to branch subscribers', (done) => {
        const branchId = 'branch-1';
        const progress = {
          operationId: 'op-1',
          type: 'update' as const,
          progress: 50,
          processed: 5,
          total: 10,
          status: 'in-progress' as const,
        };
        
        client1.emit('subscribe', {
          type: 'branch-events',
          branchId: branchId,
        });
        
        client1.on('subscribed', () => {
          webSocketService.broadcastBulkOperationProgress(branchId, progress);
          
          client1.on('bulk-operation-progress', (data) => {
            expect(data).toMatchObject(progress);
            done();
          });
        });
      });
    });
    
    describe('broadcastAuditEvent', () => {
      it('should broadcast audit events to system event subscribers', (done) => {
        const auditEvent = {
          id: 'audit-1',
          userId: 'user-123',
          action: 'create',
          resource: 'device',
          timestamp: new Date().toISOString(),
          details: { deviceId: 'device-1' },
        };
        
        client1.emit('subscribe', {
          type: 'system-events',
        });
        
        client1.on('subscribed', () => {
          webSocketService.broadcastAuditEvent(auditEvent);
          
          client1.on('audit-event', (data) => {
            expect(data).toMatchObject(auditEvent);
            done();
          });
        });
      });
    });
  });
  
  describe('System Metrics Broadcasting', () => {
    it('should start and stop metrics broadcasting', async () => {
      const mockMetrics = {
        timestamp: new Date().toISOString(),
        devices: {
          total: 10,
          connected: 8,
          healthy: 9,
        },
        system: {
          uptime: 86400,
          memoryUsage: 60,
          cpuUsage: 45,
        },
        connections: {
          active: 15,
          peak24h: 20,
        },
      };
      
      // Start metrics broadcasting with short interval
      webSocketService.startMetricsBroadcasting(100, mockMetrics);
      
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      return new Promise<void>((resolve, reject) => {
        client.on('connect', () => {
          client.on('system-metrics', (data) => {
            try {
              expect(data).toMatchObject(mockMetrics);
              webSocketService.stopMetricsBroadcasting();
              client.disconnect();
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
        
        client.on('connect_error', reject);
        
        // Timeout after 500ms
        setTimeout(() => {
          reject(new Error('Metrics not received within timeout'));
        }, 500);
      });
    });
  });
  
  describe('Connection Management', () => {
    it('should track connected clients count', (done) => {
      expect(webSocketService.getConnectedClientsCount()).toBe(0);
      
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      client.on('connect', () => {
        setTimeout(() => {
          expect(webSocketService.getConnectedClientsCount()).toBe(1);
          client.disconnect();
          
          setTimeout(() => {
            expect(webSocketService.getConnectedClientsCount()).toBe(0);
            done();
          }, 100);
        }, 100);
      });
    });
    
    it('should handle client disconnection gracefully', (done) => {
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      client.on('connect', () => {
        expect(webSocketService.getConnectedClientsCount()).toBe(1);
        
        client.disconnect();
        
        setTimeout(() => {
          expect(webSocketService.getConnectedClientsCount()).toBe(0);
          done();
        }, 100);
      });
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid subscription requests', (done) => {
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      client.on('connect', () => {
        client.emit('subscribe', {
          type: 'invalid-type' as any,
        });
        
        client.on('error', (error) => {
          expect(error.message).toContain('Invalid subscription');
          done();
        });
      });
    });
    
    it('should handle malformed subscription data', (done) => {
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      client.on('connect', () => {
        client.emit('subscribe', 'invalid-data');
        
        client.on('error', (error) => {
          expect(error.message).toBeDefined();
          done();
        });
      });
    });
  });
  
  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const client = ClientIO(`http://localhost:${serverPort}`, {
        auth: { token: 'valid.jwt.token' },
      });
      
      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          resolve();
        });
      });
      
      expect(webSocketService.getConnectedClientsCount()).toBe(1);
      
      await webSocketService.shutdown();
      
      // Client should be disconnected
      await new Promise<void>((resolve) => {
        client.on('disconnect', () => {
          resolve();
        });
        
        // Force disconnect if not already disconnected
        setTimeout(() => {
          if (client.connected) {
            client.disconnect();
          }
          resolve();
        }, 1000);
      });
    });
  });
});
