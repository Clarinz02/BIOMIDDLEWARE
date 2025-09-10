import { EventEmitter } from 'events';
import { DeviceConfig, DeviceGroup, DeviceCapabilities } from '@/types';
import { BiometricDeviceMiddleware } from '../../biometric-middleware';
export interface DeviceTemplate {
    id: string;
    name: string;
    description?: string;
    deviceType: string;
    defaultSettings: Record<string, unknown>;
    capabilities: DeviceCapabilities;
    createdAt: string;
    updatedAt: string;
}
export interface BulkOperation {
    id: string;
    name: string;
    type: 'connect' | 'disconnect' | 'configure' | 'update' | 'backup' | 'sync_users';
    deviceIds: string[];
    parameters?: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    results: Array<{
        deviceId: string;
        success: boolean;
        message?: string;
        error?: string;
    }>;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
}
export declare class EnhancedDeviceManager extends EventEmitter {
    private devices;
    private deviceConfigs;
    private deviceGroups;
    private deviceTemplates;
    private deviceHealth;
    private bulkOperations;
    private configFile;
    private groupsFile;
    private templatesFile;
    private healthCheckInterval;
    private initialized;
    constructor(dataDir?: string);
    init(): Promise<void>;
    addDevice(deviceId: string, config: Partial<DeviceConfig>): Promise<DeviceConfig>;
    updateDeviceConfig(deviceId: string, updates: Partial<DeviceConfig>): Promise<DeviceConfig>;
    removeDevice(deviceId: string): Promise<boolean>;
    connectDevice(deviceId: string): Promise<BiometricDeviceMiddleware>;
    disconnectDevice(deviceId: string): Promise<boolean>;
    testConnection(deviceId: string): Promise<{
        connected: boolean;
        version?: any;
        error?: string;
        responseTime: number;
    }>;
    createGroup(groupData: Partial<DeviceGroup>): Promise<DeviceGroup>;
    updateGroup(groupId: string, updates: Partial<DeviceGroup>): Promise<DeviceGroup>;
    deleteGroup(groupId: string): Promise<boolean>;
    getGroupsByBranch(branch: string): DeviceGroup[];
    createTemplate(templateData: Partial<DeviceTemplate>): Promise<DeviceTemplate>;
    applyTemplate(deviceId: string, templateId: string): Promise<DeviceConfig>;
    createBulkOperation(name: string, type: BulkOperation['type'], deviceIds: string[], parameters?: Record<string, unknown>): Promise<string>;
    private executeBulkOperation;
    getBulkOperation(operationId: string): BulkOperation | undefined;
    private startHealthMonitoring;
    private performHealthCheck;
    private updateDeviceHealth;
    getDevice(deviceId: string): BiometricDeviceMiddleware;
    getDeviceConfig(deviceId: string): DeviceConfig | undefined;
    getAllDeviceConfigs(): DeviceConfig[];
    getConnectedDevices(): Array<{
        deviceId: string;
        device: BiometricDeviceMiddleware;
        config: DeviceConfig;
    }>;
    isDeviceConnected(deviceId: string): boolean;
    getDeviceStatus(deviceId: string): any;
    getSystemOverview(): any;
    private loadConfigurations;
    private saveConfigurations;
    private loadGroups;
    private saveGroups;
    private loadTemplates;
    private saveTemplates;
    private reconnectDevices;
    private updateDeviceStatus;
    private generateId;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=DeviceManagerService.d.ts.map