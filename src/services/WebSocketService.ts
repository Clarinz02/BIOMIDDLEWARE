import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';

import { 
  SocketEvent, 
  WebSocketEventType, 
  AuthUser, 
  DeviceConfig, 
  DeviceHealth,
  SystemMetrics,
  BulkOperation 
} from '@/types';
import { JWTService } from '@/middleware/security';

interface SocketData {
  user?: AuthUser;
  subscriptions: Set<string>;
  joinedRooms: Set<string>;
}

export class WebSocketService extends EventEmitter {
  private io: SocketIOServer;
  private jwtService: JWTService;
  private connectedClients: Map<string, Socket & { data: SocketData }> = new Map();
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(httpServer: HttpServer, jwtService: JWTService) {
    super();
    this.jwtService = jwtService;
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    });

    this.setupSocketHandlers();
    this.startMetricsBroadcast();
  }

  private setupSocketHandlers(): void {
    this.io.use(this.authenticateSocket.bind(this));
    
    this.io.on('connection', (socket: Socket & { data: SocketData }) => {
      this.handleConnection(socket);
    });
  }

  private async authenticateSocket(
    socket: Socket & { data: SocketData },
    next: (err?: Error) => void
  ): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token as string;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const user = this.jwtService.verifyToken(token);
      
      socket.data = {
        user,
        subscriptions: new Set(),
        joinedRooms: new Set(),
      };

      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  }

  private handleConnection(socket: Socket & { data: SocketData }): void {
    const userId = socket.data.user?.id;
    const userRole = socket.data.user?.role;
    
    console.log(`🔌 WebSocket connected: ${userId} (${userRole}) - Socket: ${socket.id}`);
    
    this.connectedClients.set(socket.id, socket);
    
    // Send initial connection confirmation
    socket.emit('connected', {
      message: 'WebSocket connection established',
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Setup event handlers
    this.setupSocketEventHandlers(socket);
    
    // Handle disconnection
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(socket, reason);
    });

    this.emit('client:connected', { userId, socketId: socket.id, userRole });
  }

  private setupSocketEventHandlers(socket: Socket & { data: SocketData }): void {
    // Subscribe to specific event types
    socket.on('subscribe', (data: { events: WebSocketEventType[] }) => {
      data.events.forEach(eventType => {
        socket.data.subscriptions.add(eventType);
        socket.join(`event:${eventType}`);
        socket.data.joinedRooms.add(`event:${eventType}`);
      });
      
      socket.emit('subscribed', {
        success: true,
        subscriptions: Array.from(socket.data.subscriptions),
      });
    });

    // Unsubscribe from events
    socket.on('unsubscribe', (data: { events: WebSocketEventType[] }) => {
      data.events.forEach(eventType => {
        socket.data.subscriptions.delete(eventType);
        socket.leave(`event:${eventType}`);
        socket.data.joinedRooms.delete(`event:${eventType}`);
      });
      
      socket.emit('unsubscribed', {
        success: true,
        subscriptions: Array.from(socket.data.subscriptions),
      });
    });

    // Join device-specific rooms
    socket.on('join_device', (data: { deviceId: string }) => {
      const roomName = `device:${data.deviceId}`;
      socket.join(roomName);
      socket.data.joinedRooms.add(roomName);
      
      socket.emit('joined_device', {
        success: true,
        deviceId: data.deviceId,
        room: roomName,
      });
    });

    // Leave device-specific rooms
    socket.on('leave_device', (data: { deviceId: string }) => {
      const roomName = `device:${data.deviceId}`;
      socket.leave(roomName);
      socket.data.joinedRooms.delete(roomName);
      
      socket.emit('left_device', {
        success: true,
        deviceId: data.deviceId,
        room: roomName,
      });
    });

    // Join branch-specific rooms
    socket.on('join_branch', (data: { branch: string }) => {
      const roomName = `branch:${data.branch}`;
      socket.join(roomName);
      socket.data.joinedRooms.add(roomName);
      
      socket.emit('joined_branch', {
        success: true,
        branch: data.branch,
        room: roomName,
      });
    });

    // Request current system status
    socket.on('get_system_status', () => {
      // This would typically fetch from a service
      socket.emit('system_status', {
        timestamp: new Date().toISOString(),
        connectedClients: this.connectedClients.size,
        activeSubscriptions: Array.from(socket.data.subscriptions),
        joinedRooms: Array.from(socket.data.joinedRooms),
      });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Error handling
    socket.on('error', (error: Error) => {
      console.error(`WebSocket error for ${socket.id}:`, error);
      this.emit('socket:error', { socketId: socket.id, error: error.message });
    });
  }

  private handleDisconnection(socket: Socket & { data: SocketData }, reason: string): void {
    const userId = socket.data.user?.id;
    
    console.log(`🔌 WebSocket disconnected: ${userId} - ${reason}`);
    
    this.connectedClients.delete(socket.id);
    
    this.emit('client:disconnected', { 
      userId, 
      socketId: socket.id, 
      reason,
      duration: Date.now() - (socket.handshake.time || Date.now())
    });
  }

  // ===========================================
  // EVENT BROADCASTING METHODS
  // ===========================================

  // Broadcast to all connected clients
  broadcastToAll(event: string, data: unknown): void {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast to specific room
  broadcastToRoom(room: string, event: string, data: unknown): void {
    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast to specific user
  broadcastToUser(userId: string, event: string, data: unknown): void {
    const userSockets = Array.from(this.connectedClients.values())
      .filter(socket => socket.data.user?.id === userId);
    
    userSockets.forEach(socket => {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // Broadcast device status change
  broadcastDeviceStatus(deviceId: string, status: any): void {
    const event = 'device_status_change';
    const data = {
      deviceId,
      status,
      eventType: 'device_status_change' as WebSocketEventType,
    };

    // Broadcast to device-specific room
    this.broadcastToRoom(`device:${deviceId}`, event, data);
    
    // Broadcast to event subscribers
    this.broadcastToRoom(`event:device_status_change`, event, data);
    
    // Broadcast to branch room if device config is available
    if (status.branch) {
      this.broadcastToRoom(`branch:${status.branch}`, event, data);
    }
  }

  // Broadcast device health update
  broadcastDeviceHealth(deviceId: string, health: DeviceHealth): void {
    const event = 'device_health_update';
    const data = {
      deviceId,
      health,
      eventType: 'health_update' as WebSocketEventType,
    };

    this.broadcastToRoom(`device:${deviceId}`, event, data);
    this.broadcastToRoom(`event:health_update`, event, data);
  }

  // Broadcast user verification event
  broadcastUserVerification(deviceId: string, verification: any): void {
    const event = 'user_verification';
    const data = {
      deviceId,
      verification,
      eventType: 'user_verification' as WebSocketEventType,
    };

    this.broadcastToRoom(`device:${deviceId}`, event, data);
    this.broadcastToRoom(`event:user_verification`, event, data);
    
    if (verification.branch) {
      this.broadcastToRoom(`branch:${verification.branch}`, event, data);
    }
  }

  // Broadcast system alert
  broadcastSystemAlert(alert: {
    level: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    deviceId?: string;
    branch?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const event = 'system_alert';
    const data = {
      ...alert,
      id: this.generateAlertId(),
      eventType: 'system_alert' as WebSocketEventType,
    };

    // Broadcast to all alert subscribers
    this.broadcastToRoom(`event:system_alert`, event, data);
    
    // Broadcast to specific device if specified
    if (alert.deviceId) {
      this.broadcastToRoom(`device:${alert.deviceId}`, event, data);
    }
    
    // Broadcast to specific branch if specified
    if (alert.branch) {
      this.broadcastToRoom(`branch:${alert.branch}`, event, data);
    }
  }

  // Broadcast bulk operation progress
  broadcastBulkOperationProgress(operation: BulkOperation): void {
    const event = 'job_progress';
    const data = {
      operationId: operation.id,
      progress: operation.progress,
      status: operation.status,
      results: operation.results,
      eventType: 'job_progress' as WebSocketEventType,
    };

    this.broadcastToRoom(`event:job_progress`, event, data);
    
    // Notify users who might be interested in specific devices
    operation.deviceIds.forEach(deviceId => {
      this.broadcastToRoom(`device:${deviceId}`, event, data);
    });
  }

  // Broadcast audit event
  broadcastAuditEvent(auditEvent: {
    action: string;
    resource: string;
    userId: string;
    deviceId?: string;
    success: boolean;
    details?: Record<string, unknown>;
  }): void {
    const event = 'audit_event';
    const data = {
      ...auditEvent,
      eventType: 'audit_event' as WebSocketEventType,
    };

    // Only broadcast to admin users
    const adminSockets = Array.from(this.connectedClients.values())
      .filter(socket => ['admin', 'super_admin'].includes(socket.data.user?.role || ''));
    
    adminSockets.forEach(socket => {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // ===========================================
  // SYSTEM METRICS BROADCASTING
  // ===========================================

  private startMetricsBroadcast(): void {
    // Broadcast system metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.broadcastSystemMetrics();
    }, 30000);
  }

  private broadcastSystemMetrics(): void {
    const metrics: Partial<SystemMetrics> = {
      timestamp: new Date().toISOString(),
      // These would typically come from actual system monitoring
      memoryUsage: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      activeUsers: this.connectedClients.size,
      // Add other metrics as needed
    };

    this.broadcastToRoom('event:system_metrics', 'system_metrics', {
      metrics,
      eventType: 'system_metrics' as WebSocketEventType,
    });
  }

  // ===========================================
  // CONNECTION MANAGEMENT
  // ===========================================

  getConnectedClients(): Array<{
    socketId: string;
    userId: string;
    userRole: string;
    subscriptions: string[];
    joinedRooms: string[];
    connectedAt: Date;
  }> {
    return Array.from(this.connectedClients.values()).map(socket => ({
      socketId: socket.id,
      userId: socket.data.user?.id || 'unknown',
      userRole: socket.data.user?.role || 'unknown',
      subscriptions: Array.from(socket.data.subscriptions),
      joinedRooms: Array.from(socket.data.joinedRooms),
      connectedAt: new Date(socket.handshake.time),
    }));
  }

  getClientCount(): number {
    return this.connectedClients.size;
  }

  getClientsByRoom(room: string): string[] {
    const roomSockets = this.io.sockets.adapter.rooms.get(room);
    return roomSockets ? Array.from(roomSockets) : [];
  }

  // Disconnect specific client
  disconnectClient(socketId: string, reason = 'Server initiated disconnect'): boolean {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit('force_disconnect', { reason });
      socket.disconnect(true);
      return true;
    }
    return false;
  }

  // Disconnect all clients
  disconnectAll(reason = 'Server shutdown'): void {
    this.broadcastToAll('force_disconnect', { reason });
    this.io.disconnectSockets(true);
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down WebSocket service...');
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Notify all clients of shutdown
    this.disconnectAll('Server shutdown');
    
    // Close the socket server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        console.log('🔌 WebSocket service shutdown complete');
        resolve();
      });
    });
  }
}

// ===========================================
// WEBSOCKET EVENT HELPERS
// ===========================================

export class WebSocketEventBuilder {
  static deviceStatusChange(deviceId: string, status: any): SocketEvent {
    return {
      event: 'device_status_change',
      data: { deviceId, status },
      timestamp: new Date().toISOString(),
      deviceId,
    };
  }

  static userVerification(
    deviceId: string, 
    userId: string, 
    verification: any
  ): SocketEvent {
    return {
      event: 'user_verification',
      data: { deviceId, userId, verification },
      timestamp: new Date().toISOString(),
      deviceId,
      userId,
    };
  }

  static systemAlert(
    level: 'info' | 'warning' | 'error' | 'critical',
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): SocketEvent {
    return {
      event: 'system_alert',
      data: { level, title, message, metadata },
      timestamp: new Date().toISOString(),
    };
  }

  static jobProgress(
    jobId: string,
    progress: number,
    status: string,
    details?: Record<string, unknown>
  ): SocketEvent {
    return {
      event: 'job_progress',
      data: { jobId, progress, status, details },
      timestamp: new Date().toISOString(),
    };
  }
}
