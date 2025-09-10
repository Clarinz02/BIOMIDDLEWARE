"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedDeviceManager = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const biometric_middleware_1 = require("../../biometric-middleware");
class EnhancedDeviceManager extends events_1.EventEmitter {
    constructor(dataDir = './data') {
        super();
        this.devices = new Map();
        this.deviceConfigs = new Map();
        this.deviceGroups = new Map();
        this.deviceTemplates = new Map();
        this.deviceHealth = new Map();
        this.bulkOperations = new Map();
        this.healthCheckInterval = null;
        this.initialized = false;
        this.configFile = path.join(dataDir, 'device-configs.json');
        this.groupsFile = path.join(dataDir, 'device-groups.json');
        this.templatesFile = path.join(dataDir, 'device-templates.json');
    }
    async init() {
        try {
            await fs.mkdir(path.dirname(this.configFile), { recursive: true });
            await Promise.all([
                this.loadConfigurations(),
                this.loadGroups(),
                this.loadTemplates(),
            ]);
            await this.reconnectDevices();
            this.startHealthMonitoring();
            this.initialized = true;
            this.emit('manager:initialized', { deviceCount: this.deviceConfigs.size });
            console.log(`🔌 Enhanced DeviceManager initialized with ${this.deviceConfigs.size} device(s)`);
        }
        catch (error) {
            console.error('❌ Failed to initialize Enhanced DeviceManager:', error);
            this.initialized = true;
        }
    }
    async addDevice(deviceId, config) {
        const deviceConfig = {
            deviceId,
            name: config.name || deviceId,
            ip: config.ip,
            port: config.port || 80,
            apiKey: config.apiKey,
            useHttps: config.useHttps || false,
            wifiNetwork: config.wifiNetwork,
            branch: config.branch || 'main',
            location: config.location,
            autoReconnect: config.autoReconnect !== false,
            createdAt: new Date().toISOString(),
            lastConnected: null,
            status: 'disconnected',
            deviceType: config.deviceType,
            capabilities: config.capabilities,
            metadata: config.metadata || {},
        };
        this.deviceConfigs.set(deviceId, deviceConfig);
        await this.saveConfigurations();
        this.emit('device:added', { deviceId, config: deviceConfig });
        console.log(`✅ Device added: ${deviceId} (${deviceConfig.name})`);
        return deviceConfig;
    }
    async updateDeviceConfig(deviceId, updates) {
        const config = this.deviceConfigs.get(deviceId);
        if (!config) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        const updatedConfig = {
            ...config,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.deviceConfigs.set(deviceId, updatedConfig);
        await this.saveConfigurations();
        const connectionFields = ['ip', 'port', 'apiKey', 'useHttps'];
        const needsReconnect = connectionFields.some(field => updates.hasOwnProperty(field) &&
            updates[field] !== config[field]);
        if (needsReconnect && this.devices.has(deviceId)) {
            try {
                await this.connectDevice(deviceId);
                this.emit('device:reconnected', { deviceId, reason: 'config_update' });
            }
            catch (error) {
                console.warn(`⚠️ Could not reconnect after config update: ${error}`);
            }
        }
        this.emit('device:updated', { deviceId, updates, config: updatedConfig });
        return updatedConfig;
    }
    async removeDevice(deviceId) {
        await this.disconnectDevice(deviceId);
        const removed = this.deviceConfigs.delete(deviceId);
        this.deviceHealth.delete(deviceId);
        for (const [groupId, group] of this.deviceGroups) {
            if (group.deviceIds.includes(deviceId)) {
                group.deviceIds = group.deviceIds.filter(id => id !== deviceId);
                group.updatedAt = new Date().toISOString();
            }
        }
        await Promise.all([
            this.saveConfigurations(),
            this.saveGroups(),
        ]);
        this.emit('device:removed', { deviceId });
        console.log(`🗑️ Device removed: ${deviceId}`);
        return removed;
    }
    async connectDevice(deviceId) {
        const config = this.deviceConfigs.get(deviceId);
        if (!config) {
            throw new Error(`Device configuration not found: ${deviceId}`);
        }
        try {
            if (this.devices.has(deviceId)) {
                this.devices.delete(deviceId);
            }
            this.updateDeviceStatus(deviceId, 'connecting');
            const device = new biometric_middleware_1.BiometricDeviceMiddleware(config.ip, config.apiKey, config.useHttps);
            const [version, capabilities] = await Promise.all([
                device.getVersionInfo(),
                device.getDeviceCapabilities().catch(() => null),
            ]);
            this.devices.set(deviceId, device);
            config.lastConnected = new Date();
            config.capabilities = capabilities || config.capabilities;
            this.updateDeviceStatus(deviceId, 'connected');
            await this.saveConfigurations();
            this.emit('device:connected', {
                deviceId,
                config,
                version,
                capabilities: config.capabilities
            });
            console.log(`🔌 Connected to device: ${deviceId} (${config.ip})`);
            return device;
        }
        catch (error) {
            this.updateDeviceStatus(deviceId, 'error');
            await this.saveConfigurations();
            this.emit('device:connection_failed', { deviceId, error: error.message });
            throw new Error(`Failed to connect to device ${deviceId}: ${error.message}`);
        }
    }
    async disconnectDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            this.devices.delete(deviceId);
            this.updateDeviceStatus(deviceId, 'disconnected');
            await this.saveConfigurations();
            this.emit('device:disconnected', { deviceId });
            console.log(`🔌 Disconnected from device: ${deviceId}`);
            return true;
        }
        return false;
    }
    async testConnection(deviceId) {
        const startTime = Date.now();
        try {
            const device = this.getDevice(deviceId);
            const version = await device.getVersionInfo();
            const responseTime = Date.now() - startTime;
            this.updateDeviceHealth(deviceId, { responseTime, errorCount: 0 });
            return {
                connected: true,
                version,
                responseTime,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateDeviceHealth(deviceId, { responseTime, errorCount: 1, lastError: error.message });
            return {
                connected: false,
                error: error.message,
                responseTime,
            };
        }
    }
    async createGroup(groupData) {
        const group = {
            id: groupData.id || this.generateId('group'),
            name: groupData.name,
            description: groupData.description,
            deviceIds: groupData.deviceIds || [],
            branch: groupData.branch,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.deviceGroups.set(group.id, group);
        await this.saveGroups();
        this.emit('group:created', { group });
        return group;
    }
    async updateGroup(groupId, updates) {
        const group = this.deviceGroups.get(groupId);
        if (!group) {
            throw new Error(`Group not found: ${groupId}`);
        }
        const updatedGroup = {
            ...group,
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        this.deviceGroups.set(groupId, updatedGroup);
        await this.saveGroups();
        this.emit('group:updated', { groupId, updates, group: updatedGroup });
        return updatedGroup;
    }
    async deleteGroup(groupId) {
        const removed = this.deviceGroups.delete(groupId);
        if (removed) {
            await this.saveGroups();
            this.emit('group:deleted', { groupId });
        }
        return removed;
    }
    getGroupsByBranch(branch) {
        return Array.from(this.deviceGroups.values())
            .filter(group => group.branch === branch);
    }
    async createTemplate(templateData) {
        const template = {
            id: templateData.id || this.generateId('template'),
            name: templateData.name,
            description: templateData.description,
            deviceType: templateData.deviceType,
            defaultSettings: templateData.defaultSettings || {},
            capabilities: templateData.capabilities,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.deviceTemplates.set(template.id, template);
        await this.saveTemplates();
        this.emit('template:created', { template });
        return template;
    }
    async applyTemplate(deviceId, templateId) {
        const template = this.deviceTemplates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }
        const updates = {
            deviceType: template.deviceType,
            capabilities: template.capabilities,
            metadata: {
                ...this.deviceConfigs.get(deviceId)?.metadata,
                appliedTemplate: templateId,
                templateAppliedAt: new Date().toISOString(),
            },
        };
        return this.updateDeviceConfig(deviceId, updates);
    }
    async createBulkOperation(name, type, deviceIds, parameters) {
        const operationId = this.generateId('bulk');
        const operation = {
            id: operationId,
            name,
            type,
            deviceIds,
            parameters,
            status: 'pending',
            progress: 0,
            results: [],
            createdAt: new Date().toISOString(),
        };
        this.bulkOperations.set(operationId, operation);
        this.executeBulkOperation(operationId).catch(error => {
            console.error(`Bulk operation ${operationId} failed:`, error);
        });
        return operationId;
    }
    async executeBulkOperation(operationId) {
        const operation = this.bulkOperations.get(operationId);
        if (!operation)
            return;
        operation.status = 'running';
        operation.startedAt = new Date().toISOString();
        this.emit('bulk_operation:started', { operationId, operation });
        const totalDevices = operation.deviceIds.length;
        let completedDevices = 0;
        for (const deviceId of operation.deviceIds) {
            try {
                let result;
                switch (operation.type) {
                    case 'connect':
                        await this.connectDevice(deviceId);
                        result = { success: true, message: 'Connected successfully' };
                        break;
                    case 'disconnect':
                        await this.disconnectDevice(deviceId);
                        result = { success: true, message: 'Disconnected successfully' };
                        break;
                    case 'configure':
                        if (operation.parameters) {
                            await this.updateDeviceConfig(deviceId, operation.parameters);
                            result = { success: true, message: 'Configuration updated' };
                        }
                        else {
                            result = { success: false, error: 'No configuration parameters provided' };
                        }
                        break;
                    default:
                        result = { success: false, error: `Unknown operation type: ${operation.type}` };
                }
                operation.results.push({ deviceId, ...result });
            }
            catch (error) {
                operation.results.push({
                    deviceId,
                    success: false,
                    error: error.message,
                });
            }
            completedDevices++;
            operation.progress = (completedDevices / totalDevices) * 100;
            this.emit('bulk_operation:progress', {
                operationId,
                progress: operation.progress,
                completedDevices,
                totalDevices
            });
        }
        operation.status = 'completed';
        operation.completedAt = new Date().toISOString();
        this.emit('bulk_operation:completed', { operationId, operation });
    }
    getBulkOperation(operationId) {
        return this.bulkOperations.get(operationId);
    }
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000);
    }
    async performHealthCheck() {
        const connectedDevices = Array.from(this.devices.keys());
        for (const deviceId of connectedDevices) {
            try {
                const result = await this.testConnection(deviceId);
                if (!result.connected) {
                    this.updateDeviceStatus(deviceId, 'error');
                    this.emit('device:health_check_failed', { deviceId, error: result.error });
                }
            }
            catch (error) {
                console.warn(`Health check failed for device ${deviceId}:`, error);
            }
        }
    }
    updateDeviceHealth(deviceId, updates) {
        const current = this.deviceHealth.get(deviceId) || {
            deviceId,
            timestamp: new Date().toISOString(),
            uptime: 0,
            responseTime: 0,
            errorCount: 0,
        };
        const updated = {
            ...current,
            ...updates,
            timestamp: new Date().toISOString(),
        };
        this.deviceHealth.set(deviceId, updated);
        this.emit('device:health_updated', { deviceId, health: updated });
    }
    getDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            const config = this.deviceConfigs.get(deviceId);
            const deviceName = config ? config.name : deviceId;
            throw new Error(`Device not connected: ${deviceName} (${deviceId})`);
        }
        return device;
    }
    getDeviceConfig(deviceId) {
        return this.deviceConfigs.get(deviceId);
    }
    getAllDeviceConfigs() {
        return Array.from(this.deviceConfigs.values());
    }
    getConnectedDevices() {
        const connected = [];
        for (const [deviceId, device] of this.devices) {
            const config = this.deviceConfigs.get(deviceId);
            if (config) {
                connected.push({ deviceId, device, config });
            }
        }
        return connected;
    }
    isDeviceConnected(deviceId) {
        return this.devices.has(deviceId);
    }
    getDeviceStatus(deviceId) {
        const config = this.deviceConfigs.get(deviceId);
        const health = this.deviceHealth.get(deviceId);
        if (!config)
            return null;
        return {
            deviceId: config.deviceId,
            name: config.name,
            branch: config.branch,
            location: config.location,
            ip: config.ip,
            connected: this.devices.has(deviceId),
            lastConnected: config.lastConnected,
            status: config.status,
            wifiNetwork: config.wifiNetwork,
            deviceType: config.deviceType,
            capabilities: config.capabilities,
            health,
            metadata: config.metadata,
        };
    }
    getSystemOverview() {
        const totalDevices = this.deviceConfigs.size;
        const connectedDevices = this.devices.size;
        const branches = new Set(Array.from(this.deviceConfigs.values()).map(c => c.branch));
        const locations = new Set(Array.from(this.deviceConfigs.values()).map(c => c.location).filter(Boolean));
        const deviceTypes = new Set(Array.from(this.deviceConfigs.values()).map(c => c.deviceType).filter(Boolean));
        return {
            totalDevices,
            connectedDevices,
            disconnectedDevices: totalDevices - connectedDevices,
            branches: Array.from(branches),
            locations: Array.from(locations),
            deviceTypes: Array.from(deviceTypes),
            totalGroups: this.deviceGroups.size,
            totalTemplates: this.deviceTemplates.size,
            activeBulkOperations: Array.from(this.bulkOperations.values())
                .filter(op => op.status === 'running').length,
            devices: Array.from(this.deviceConfigs.values()).map(config => this.getDeviceStatus(config.deviceId)),
        };
    }
    async loadConfigurations() {
        try {
            const data = await fs.readFile(this.configFile, 'utf8');
            const configs = JSON.parse(data);
            for (const config of configs) {
                this.deviceConfigs.set(config.deviceId, {
                    ...config,
                    lastConnected: config.lastConnected ? new Date(config.lastConnected) : null,
                });
            }
            console.log(`📁 Loaded ${configs.length} device configuration(s)`);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('⚠️ Error loading device configurations:', error.message);
            }
        }
    }
    async saveConfigurations() {
        try {
            const configs = Array.from(this.deviceConfigs.values());
            await fs.writeFile(this.configFile, JSON.stringify(configs, null, 2));
        }
        catch (error) {
            console.error('⚠️ Error saving device configurations:', error);
        }
    }
    async loadGroups() {
        try {
            const data = await fs.readFile(this.groupsFile, 'utf8');
            const groups = JSON.parse(data);
            for (const group of groups) {
                this.deviceGroups.set(group.id, group);
            }
            console.log(`📁 Loaded ${groups.length} device group(s)`);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('⚠️ Error loading device groups:', error.message);
            }
        }
    }
    async saveGroups() {
        try {
            const groups = Array.from(this.deviceGroups.values());
            await fs.writeFile(this.groupsFile, JSON.stringify(groups, null, 2));
        }
        catch (error) {
            console.error('⚠️ Error saving device groups:', error);
        }
    }
    async loadTemplates() {
        try {
            const data = await fs.readFile(this.templatesFile, 'utf8');
            const templates = JSON.parse(data);
            for (const template of templates) {
                this.deviceTemplates.set(template.id, template);
            }
            console.log(`📁 Loaded ${templates.length} device template(s)`);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('⚠️ Error loading device templates:', error.message);
            }
        }
    }
    async saveTemplates() {
        try {
            const templates = Array.from(this.deviceTemplates.values());
            await fs.writeFile(this.templatesFile, JSON.stringify(templates, null, 2));
        }
        catch (error) {
            console.error('⚠️ Error saving device templates:', error);
        }
    }
    async reconnectDevices() {
        const reconnectPromises = [];
        for (const [deviceId, config] of this.deviceConfigs) {
            if (config.autoReconnect !== false) {
                reconnectPromises.push(this.connectDevice(deviceId)
                    .catch(error => console.warn(`⚠️ Could not reconnect to ${deviceId}: ${error.message}`)));
            }
        }
        if (reconnectPromises.length > 0) {
            await Promise.allSettled(reconnectPromises);
        }
    }
    updateDeviceStatus(deviceId, status) {
        const config = this.deviceConfigs.get(deviceId);
        if (config) {
            config.status = status;
            this.emit('device:status_changed', { deviceId, status, config });
        }
    }
    generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        const disconnectPromises = Array.from(this.devices.keys())
            .map(deviceId => this.disconnectDevice(deviceId));
        await Promise.allSettled(disconnectPromises);
        this.emit('manager:shutdown');
        console.log('🔌 Enhanced DeviceManager shutdown complete');
    }
}
exports.EnhancedDeviceManager = EnhancedDeviceManager;
//# sourceMappingURL=DeviceManagerService.js.map