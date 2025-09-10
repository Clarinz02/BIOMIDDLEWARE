import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
import { SocketEvent, DeviceHealth, BulkOperation } from '@/types';
import { JWTService } from '@/middleware/security';
export declare class WebSocketService extends EventEmitter {
    private io;
    private jwtService;
    private connectedClients;
    private metricsInterval;
    constructor(httpServer: HttpServer, jwtService: JWTService);
    private setupSocketHandlers;
    private authenticateSocket;
    private handleConnection;
    private setupSocketEventHandlers;
    private handleDisconnection;
    broadcastToAll(event: string, data: unknown): void;
    broadcastToRoom(room: string, event: string, data: unknown): void;
    broadcastToUser(userId: string, event: string, data: unknown): void;
    broadcastDeviceStatus(deviceId: string, status: any): void;
    broadcastDeviceHealth(deviceId: string, health: DeviceHealth): void;
    broadcastUserVerification(deviceId: string, verification: any): void;
    broadcastSystemAlert(alert: {
        level: 'info' | 'warning' | 'error' | 'critical';
        title: string;
        message: string;
        deviceId?: string;
        branch?: string;
        metadata?: Record<string, unknown>;
    }): void;
    broadcastBulkOperationProgress(operation: BulkOperation): void;
    broadcastAuditEvent(auditEvent: {
        action: string;
        resource: string;
        userId: string;
        deviceId?: string;
        success: boolean;
        details?: Record<string, unknown>;
    }): void;
    private startMetricsBroadcast;
    private broadcastSystemMetrics;
    getConnectedClients(): Array<{
        socketId: string;
        userId: string;
        userRole: string;
        subscriptions: string[];
        joinedRooms: string[];
        connectedAt: Date;
    }>;
    getClientCount(): number;
    getClientsByRoom(room: string): string[];
    disconnectClient(socketId: string, reason?: string): boolean;
    disconnectAll(reason?: string): void;
    private generateAlertId;
    shutdown(): Promise<void>;
}
export declare class WebSocketEventBuilder {
    static deviceStatusChange(deviceId: string, status: any): SocketEvent;
    static userVerification(deviceId: string, userId: string, verification: any): SocketEvent;
    static systemAlert(level: 'info' | 'warning' | 'error' | 'critical', title: string, message: string, metadata?: Record<string, unknown>): SocketEvent;
    static jobProgress(jobId: string, progress: number, status: string, details?: Record<string, unknown>): SocketEvent;
}
//# sourceMappingURL=WebSocketService.d.ts.map