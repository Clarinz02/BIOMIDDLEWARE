export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    meta?: {
        timestamp: string;
        version: string;
        requestId?: string;
    };
}
export interface DeviceConfig {
    deviceId: string;
    name: string;
    ip: string;
    port?: number;
    apiKey?: string;
    useHttps: boolean;
    wifiNetwork?: string;
    branch: string;
    location?: string;
    autoReconnect: boolean;
    createdAt: string;
    lastConnected?: Date | null;
    status: DeviceStatus;
    deviceType?: DeviceType;
    capabilities?: DeviceCapabilities;
    metadata?: Record<string, unknown>;
}
export type DeviceStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'maintenance';
export type DeviceType = 'fingerprint' | 'face' | 'iris' | 'palm' | 'card' | 'multi-modal';
export interface DeviceCapabilities {
    fingerprint?: {
        maxTemplates: number;
        supportedFormats: string[];
        quality: 'low' | 'medium' | 'high';
    };
    face?: {
        maxTemplates: number;
        liveDetection: boolean;
        maskDetection: boolean;
    };
    card?: {
        supportedTypes: string[];
        encryption: boolean;
    };
    network?: {
        wifi: boolean;
        ethernet: boolean;
        bluetooth: boolean;
    };
}
export interface DeviceGroup {
    id: string;
    name: string;
    description?: string;
    deviceIds: string[];
    branch: string;
    createdAt: string;
    updatedAt: string;
}
export interface DeviceHealth {
    deviceId: string;
    timestamp: string;
    cpu?: number;
    memory?: number;
    storage?: number;
    temperature?: number;
    uptime: number;
    responseTime: number;
    errorCount: number;
    lastError?: string;
}
export interface BiometricUser {
    id: string;
    name: string;
    email?: string;
    department?: string;
    role?: string;
    privilege: UserPrivilege;
    active: boolean;
    createdAt: string;
    updatedAt: string;
    enrolledDevices: string[];
    biometricData?: {
        fingerprints?: BiometricTemplate[];
        face?: BiometricTemplate;
        iris?: BiometricTemplate;
        palm?: BiometricTemplate;
        card?: string;
    };
    metadata?: Record<string, unknown>;
}
export type UserPrivilege = 'user' | 'operator' | 'admin' | 'super_admin';
export interface BiometricTemplate {
    templateId: string;
    quality: number;
    format: string;
    createdAt: string;
    deviceId: string;
    version: string;
}
export interface AuthUser {
    id: string;
    username: string;
    email: string;
    role: SystemRole;
    permissions: Permission[];
    lastLogin?: Date;
    active: boolean;
    createdAt: string;
}
export type SystemRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'device_manager';
export interface Permission {
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete' | 'execute';
    scope?: 'own' | 'branch' | 'all';
}
export interface ApiKey {
    id: string;
    name: string;
    deviceId?: string;
    key: string;
    keyPreview: string;
    permissions: Permission[];
    active: boolean;
    expiresAt?: Date;
    createdAt: string;
    lastUsed?: Date;
    usageCount: number;
    metadata?: Record<string, unknown>;
}
export interface AuditLog {
    id: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details: Record<string, unknown>;
    ipAddress: string;
    userAgent: string;
    timestamp: string;
    deviceId?: string;
    success: boolean;
}
export interface AttendanceRecord {
    id: string;
    userId: string;
    userName: string;
    deviceId: string;
    deviceName: string;
    timestamp: string;
    direction: 'in' | 'out';
    verificationMode: VerificationMode;
    matchScore?: number;
    location: string;
    branch: string;
    metadata?: Record<string, unknown>;
}
export type VerificationMode = 'fingerprint' | 'face' | 'iris' | 'palm' | 'card' | 'pin' | 'multi_factor';
export interface AttendanceReport {
    reportId: string;
    title: string;
    description?: string;
    dateRange: {
        from: string;
        to: string;
    };
    filters: {
        branches?: string[];
        devices?: string[];
        users?: string[];
        departments?: string[];
    };
    format: 'csv' | 'json' | 'pdf' | 'excel';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
    downloadUrl?: string;
    recordCount?: number;
}
export interface SystemMetrics {
    timestamp: string;
    activeDevices: number;
    totalDevices: number;
    activeUsers: number;
    totalVerifications: number;
    averageResponseTime: number;
    errorRate: number;
    systemUptime: number;
    memoryUsage: number;
    cpuUsage: number;
    dbConnections: number;
}
export interface DeviceMetrics {
    deviceId: string;
    timestamp: string;
    verificationCount: number;
    successRate: number;
    averageResponseTime: number;
    errorCount: number;
    uptime: number;
    lastActiveUser?: string;
    queueLength: number;
}
export interface UsageAnalytics {
    period: 'hour' | 'day' | 'week' | 'month';
    data: {
        timestamp: string;
        verifications: number;
        uniqueUsers: number;
        devices: number;
        branches: string[];
        peakHour?: number;
    }[];
}
export interface JobQueue {
    id: string;
    type: JobType;
    priority: number;
    data: Record<string, unknown>;
    status: JobStatus;
    progress: number;
    result?: unknown;
    error?: string;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
}
export type JobType = 'user_sync' | 'device_backup' | 'report_generation' | 'device_update' | 'data_cleanup' | 'health_check';
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
export interface SocketEvent {
    event: string;
    data: unknown;
    timestamp: string;
    deviceId?: string;
    userId?: string;
}
export type WebSocketEventType = 'device_status_change' | 'user_verification' | 'system_alert' | 'job_progress' | 'health_update' | 'audit_event';
export interface SystemConfig {
    database: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        ssl: boolean;
        poolMin: number;
        poolMax: number;
    };
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    security: {
        jwtSecret: string;
        jwtExpiresIn: string;
        bcryptRounds: number;
        apiRateLimit: {
            windowMs: number;
            max: number;
        };
    };
    server: {
        port: number;
        cors: {
            origin: string[];
            credentials: boolean;
        };
        uploadLimits: {
            fileSize: number;
            files: number;
        };
    };
    features: {
        enableAnalytics: boolean;
        enableAuditLog: boolean;
        enableDeviceDiscovery: boolean;
        enableMachineLearning: boolean;
    };
}
export interface BiometricError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    deviceId?: string;
    userId?: string;
    context?: string;
}
export type ErrorCode = 'DEVICE_UNREACHABLE' | 'AUTHENTICATION_FAILED' | 'INVALID_TEMPLATE' | 'DATABASE_ERROR' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'RATE_LIMIT_EXCEEDED' | 'SYSTEM_ERROR';
export type PaginatedResponse<T> = ApiResponse<{
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}>;
export interface RequestContext {
    requestId: string;
    userId?: string;
    deviceId?: string;
    ipAddress: string;
    userAgent: string;
    timestamp: string;
}
export interface FilterOptions {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filters?: Record<string, unknown>;
}
//# sourceMappingURL=index.d.ts.map