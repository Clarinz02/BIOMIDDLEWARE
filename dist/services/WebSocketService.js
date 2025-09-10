"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketEventBuilder = exports.WebSocketService = void 0;
const socket_io_1 = require("socket.io");
const events_1 = require("events");
class WebSocketService extends events_1.EventEmitter {
    constructor(httpServer, jwtService) {
        super();
        this.connectedClients = new Map();
        this.metricsInterval = null;
        this.jwtService = jwtService;
        this.io = new socket_io_1.Server(httpServer, {
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
    setupSocketHandlers() {
        this.io.use(this.authenticateSocket.bind(this));
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
    }
    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
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
        }
        catch (error) {
            next(new Error('Invalid authentication token'));
        }
    }
    handleConnection(socket) {
        const userId = socket.data.user?.id;
        const userRole = socket.data.user?.role;
        console.log(`🔌 WebSocket connected: ${userId} (${userRole}) - Socket: ${socket.id}`);
        this.connectedClients.set(socket.id, socket);
        socket.emit('connected', {
            message: 'WebSocket connection established',
            userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
        });
        this.setupSocketEventHandlers(socket);
        socket.on('disconnect', (reason) => {
            this.handleDisconnection(socket, reason);
        });
        this.emit('client:connected', { userId, socketId: socket.id, userRole });
    }
    setupSocketEventHandlers(socket) {
        socket.on('subscribe', (data) => {
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
        socket.on('unsubscribe', (data) => {
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
        socket.on('join_device', (data) => {
            const roomName = `device:${data.deviceId}`;
            socket.join(roomName);
            socket.data.joinedRooms.add(roomName);
            socket.emit('joined_device', {
                success: true,
                deviceId: data.deviceId,
                room: roomName,
            });
        });
        socket.on('leave_device', (data) => {
            const roomName = `device:${data.deviceId}`;
            socket.leave(roomName);
            socket.data.joinedRooms.delete(roomName);
            socket.emit('left_device', {
                success: true,
                deviceId: data.deviceId,
                room: roomName,
            });
        });
        socket.on('join_branch', (data) => {
            const roomName = `branch:${data.branch}`;
            socket.join(roomName);
            socket.data.joinedRooms.add(roomName);
            socket.emit('joined_branch', {
                success: true,
                branch: data.branch,
                room: roomName,
            });
        });
        socket.on('get_system_status', () => {
            socket.emit('system_status', {
                timestamp: new Date().toISOString(),
                connectedClients: this.connectedClients.size,
                activeSubscriptions: Array.from(socket.data.subscriptions),
                joinedRooms: Array.from(socket.data.joinedRooms),
            });
        });
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date().toISOString() });
        });
        socket.on('error', (error) => {
            console.error(`WebSocket error for ${socket.id}:`, error);
            this.emit('socket:error', { socketId: socket.id, error: error.message });
        });
    }
    handleDisconnection(socket, reason) {
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
    broadcastToAll(event, data) {
        this.io.emit(event, {
            ...data,
            timestamp: new Date().toISOString(),
        });
    }
    broadcastToRoom(room, event, data) {
        this.io.to(room).emit(event, {
            ...data,
            timestamp: new Date().toISOString(),
        });
    }
    broadcastToUser(userId, event, data) {
        const userSockets = Array.from(this.connectedClients.values())
            .filter(socket => socket.data.user?.id === userId);
        userSockets.forEach(socket => {
            socket.emit(event, {
                ...data,
                timestamp: new Date().toISOString(),
            });
        });
    }
    broadcastDeviceStatus(deviceId, status) {
        const event = 'device_status_change';
        const data = {
            deviceId,
            status,
            eventType: 'device_status_change',
        };
        this.broadcastToRoom(`device:${deviceId}`, event, data);
        this.broadcastToRoom(`event:device_status_change`, event, data);
        if (status.branch) {
            this.broadcastToRoom(`branch:${status.branch}`, event, data);
        }
    }
    broadcastDeviceHealth(deviceId, health) {
        const event = 'device_health_update';
        const data = {
            deviceId,
            health,
            eventType: 'health_update',
        };
        this.broadcastToRoom(`device:${deviceId}`, event, data);
        this.broadcastToRoom(`event:health_update`, event, data);
    }
    broadcastUserVerification(deviceId, verification) {
        const event = 'user_verification';
        const data = {
            deviceId,
            verification,
            eventType: 'user_verification',
        };
        this.broadcastToRoom(`device:${deviceId}`, event, data);
        this.broadcastToRoom(`event:user_verification`, event, data);
        if (verification.branch) {
            this.broadcastToRoom(`branch:${verification.branch}`, event, data);
        }
    }
    broadcastSystemAlert(alert) {
        const event = 'system_alert';
        const data = {
            ...alert,
            id: this.generateAlertId(),
            eventType: 'system_alert',
        };
        this.broadcastToRoom(`event:system_alert`, event, data);
        if (alert.deviceId) {
            this.broadcastToRoom(`device:${alert.deviceId}`, event, data);
        }
        if (alert.branch) {
            this.broadcastToRoom(`branch:${alert.branch}`, event, data);
        }
    }
    broadcastBulkOperationProgress(operation) {
        const event = 'job_progress';
        const data = {
            operationId: operation.id,
            progress: operation.progress,
            status: operation.status,
            results: operation.results,
            eventType: 'job_progress',
        };
        this.broadcastToRoom(`event:job_progress`, event, data);
        operation.deviceIds.forEach(deviceId => {
            this.broadcastToRoom(`device:${deviceId}`, event, data);
        });
    }
    broadcastAuditEvent(auditEvent) {
        const event = 'audit_event';
        const data = {
            ...auditEvent,
            eventType: 'audit_event',
        };
        const adminSockets = Array.from(this.connectedClients.values())
            .filter(socket => ['admin', 'super_admin'].includes(socket.data.user?.role || ''));
        adminSockets.forEach(socket => {
            socket.emit(event, {
                ...data,
                timestamp: new Date().toISOString(),
            });
        });
    }
    startMetricsBroadcast() {
        this.metricsInterval = setInterval(() => {
            this.broadcastSystemMetrics();
        }, 30000);
    }
    broadcastSystemMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            memoryUsage: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
            activeUsers: this.connectedClients.size,
        };
        this.broadcastToRoom('event:system_metrics', 'system_metrics', {
            metrics,
            eventType: 'system_metrics',
        });
    }
    getConnectedClients() {
        return Array.from(this.connectedClients.values()).map(socket => ({
            socketId: socket.id,
            userId: socket.data.user?.id || 'unknown',
            userRole: socket.data.user?.role || 'unknown',
            subscriptions: Array.from(socket.data.subscriptions),
            joinedRooms: Array.from(socket.data.joinedRooms),
            connectedAt: new Date(socket.handshake.time),
        }));
    }
    getClientCount() {
        return this.connectedClients.size;
    }
    getClientsByRoom(room) {
        const roomSockets = this.io.sockets.adapter.rooms.get(room);
        return roomSockets ? Array.from(roomSockets) : [];
    }
    disconnectClient(socketId, reason = 'Server initiated disconnect') {
        const socket = this.connectedClients.get(socketId);
        if (socket) {
            socket.emit('force_disconnect', { reason });
            socket.disconnect(true);
            return true;
        }
        return false;
    }
    disconnectAll(reason = 'Server shutdown') {
        this.broadcastToAll('force_disconnect', { reason });
        this.io.disconnectSockets(true);
    }
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    async shutdown() {
        console.log('🔌 Shutting down WebSocket service...');
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        this.disconnectAll('Server shutdown');
        await new Promise((resolve) => {
            this.io.close(() => {
                console.log('🔌 WebSocket service shutdown complete');
                resolve();
            });
        });
    }
}
exports.WebSocketService = WebSocketService;
class WebSocketEventBuilder {
    static deviceStatusChange(deviceId, status) {
        return {
            event: 'device_status_change',
            data: { deviceId, status },
            timestamp: new Date().toISOString(),
            deviceId,
        };
    }
    static userVerification(deviceId, userId, verification) {
        return {
            event: 'user_verification',
            data: { deviceId, userId, verification },
            timestamp: new Date().toISOString(),
            deviceId,
            userId,
        };
    }
    static systemAlert(level, title, message, metadata) {
        return {
            event: 'system_alert',
            data: { level, title, message, metadata },
            timestamp: new Date().toISOString(),
        };
    }
    static jobProgress(jobId, progress, status, details) {
        return {
            event: 'job_progress',
            data: { jobId, progress, status, details },
            timestamp: new Date().toISOString(),
        };
    }
}
exports.WebSocketEventBuilder = WebSocketEventBuilder;
//# sourceMappingURL=WebSocketService.js.map