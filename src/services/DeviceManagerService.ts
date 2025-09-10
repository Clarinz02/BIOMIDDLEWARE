import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

import { 
  DeviceConfig, 
  DeviceStatus, 
  DeviceGroup, 
  DeviceHealth,
  DeviceCapabilities,
  BiometricDeviceError,
  JobQueue
} from '@/types';
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

export class EnhancedDeviceManager extends EventEmitter {
  private devices: Map<string, BiometricDeviceMiddleware> = new Map();
  private deviceConfigs: Map<string, DeviceConfig> = new Map();
  private deviceGroups: Map<string, DeviceGroup> = new Map();
  private deviceTemplates: Map<string, DeviceTemplate> = new Map();
  private deviceHealth: Map<string, DeviceHealth> = new Map();
  private bulkOperations: Map<string, BulkOperation> = new Map();
  
  private configFile: string;
  private groupsFile: string;
  private templatesFile: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(dataDir = './data') {
    super();
    this.configFile = path.join(dataDir, 'device-configs.json');
    this.groupsFile = path.join(dataDir, 'device-groups.json');
    this.templatesFile = path.join(dataDir, 'device-templates.json');
  }

  // ===========================================
  // INITIALIZATION AND CONFIGURATION
  // ===========================================

  async init(): Promise<void> {
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
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced DeviceManager:', error);
      this.initialized = true; // Continue anyway
    }
  }

  // ===========================================
  // DEVICE CONFIGURATION MANAGEMENT
  // ===========================================

  async addDevice(deviceId: string, config: Partial<DeviceConfig>): Promise<DeviceConfig> {
    const deviceConfig: DeviceConfig = {
      deviceId,
      name: config.name || deviceId,
      ip: config.ip!,
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

  async updateDeviceConfig(deviceId: string, updates: Partial<DeviceConfig>): Promise<DeviceConfig> {
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

    // Reconnect if connection settings changed
    const connectionFields = ['ip', 'port', 'apiKey', 'useHttps'];
    const needsReconnect = connectionFields.some(field => 
      updates.hasOwnProperty(field) && 
      updates[field as keyof DeviceConfig] !== config[field as keyof DeviceConfig]
    );

    if (needsReconnect && this.devices.has(deviceId)) {
      try {
        await this.connectDevice(deviceId);
        this.emit('device:reconnected', { deviceId, reason: 'config_update' });
      } catch (error) {
        console.warn(`⚠️ Could not reconnect after config update: ${error}`);
      }
    }

    this.emit('device:updated', { deviceId, updates, config: updatedConfig });
    return updatedConfig;
  }

  async removeDevice(deviceId: string): Promise<boolean> {
    await this.disconnectDevice(deviceId);
    
    const removed = this.deviceConfigs.delete(deviceId);
    this.deviceHealth.delete(deviceId);
    
    // Remove from groups
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

  // ===========================================
  // CONNECTION MANAGEMENT
  // ===========================================

  async connectDevice(deviceId: string): Promise<BiometricDeviceMiddleware> {
    const config = this.deviceConfigs.get(deviceId);
    if (!config) {
      throw new Error(`Device configuration not found: ${deviceId}`);
    }

    try {
      // Disconnect existing connection
      if (this.devices.has(deviceId)) {
        this.devices.delete(deviceId);
      }

      this.updateDeviceStatus(deviceId, 'connecting');

      const device = new BiometricDeviceMiddleware(
        config.ip,
        config.apiKey,
        config.useHttps
      );

      // Test connection and get capabilities
      const [version, capabilities] = await Promise.all([
        device.getVersionInfo(),
        device.getDeviceCapabilities().catch(() => null),
      ]);

      // Store connected device
      this.devices.set(deviceId, device);
      
      // Update configuration
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
      
    } catch (error) {
      this.updateDeviceStatus(deviceId, 'error');
      await this.saveConfigurations();
      
      this.emit('device:connection_failed', { deviceId, error: error.message });
      
      throw new Error(`Failed to connect to device ${deviceId}: ${error.message}`);
    }
  }

  async disconnectDevice(deviceId: string): Promise<boolean> {
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

  async testConnection(deviceId: string): Promise<{ connected: boolean; version?: any; error?: string; responseTime: number }> {
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
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateDeviceHealth(deviceId, { responseTime, errorCount: 1, lastError: error.message });
      
      return {
        connected: false,
        error: error.message,
        responseTime,
      };
    }
  }

  // ===========================================
  // DEVICE GROUPING
  // ===========================================

  async createGroup(groupData: Partial<DeviceGroup>): Promise<DeviceGroup> {
    const group: DeviceGroup = {
      id: groupData.id || this.generateId('group'),
      name: groupData.name!,
      description: groupData.description,
      deviceIds: groupData.deviceIds || [],
      branch: groupData.branch!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.deviceGroups.set(group.id, group);
    await this.saveGroups();
    
    this.emit('group:created', { group });
    return group;
  }

  async updateGroup(groupId: string, updates: Partial<DeviceGroup>): Promise<DeviceGroup> {
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

  async deleteGroup(groupId: string): Promise<boolean> {
    const removed = this.deviceGroups.delete(groupId);
    if (removed) {
      await this.saveGroups();
      this.emit('group:deleted', { groupId });
    }
    return removed;
  }

  getGroupsByBranch(branch: string): DeviceGroup[] {
    return Array.from(this.deviceGroups.values())
      .filter(group => group.branch === branch);
  }

  // ===========================================
  // DEVICE TEMPLATES
  // ===========================================

  async createTemplate(templateData: Partial<DeviceTemplate>): Promise<DeviceTemplate> {
    const template: DeviceTemplate = {
      id: templateData.id || this.generateId('template'),
      name: templateData.name!,
      description: templateData.description,
      deviceType: templateData.deviceType!,
      defaultSettings: templateData.defaultSettings || {},
      capabilities: templateData.capabilities!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.deviceTemplates.set(template.id, template);
    await this.saveTemplates();
    
    this.emit('template:created', { template });
    return template;
  }

  async applyTemplate(deviceId: string, templateId: string): Promise<DeviceConfig> {
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

  // ===========================================
  // BULK OPERATIONS
  // ===========================================

  async createBulkOperation(
    name: string,
    type: BulkOperation['type'],
    deviceIds: string[],
    parameters?: Record<string, unknown>
  ): Promise<string> {
    const operationId = this.generateId('bulk');
    
    const operation: BulkOperation = {
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
    
    // Start operation asynchronously
    this.executeBulkOperation(operationId).catch(error => {
      console.error(`Bulk operation ${operationId} failed:`, error);
    });

    return operationId;
  }

  private async executeBulkOperation(operationId: string): Promise<void> {
    const operation = this.bulkOperations.get(operationId);
    if (!operation) return;

    operation.status = 'running';
    operation.startedAt = new Date().toISOString();
    
    this.emit('bulk_operation:started', { operationId, operation });

    const totalDevices = operation.deviceIds.length;
    let completedDevices = 0;

    for (const deviceId of operation.deviceIds) {
      try {
        let result: { success: boolean; message?: string; error?: string };

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
              await this.updateDeviceConfig(deviceId, operation.parameters as Partial<DeviceConfig>);
              result = { success: true, message: 'Configuration updated' };
            } else {
              result = { success: false, error: 'No configuration parameters provided' };
            }
            break;
            
          default:
            result = { success: false, error: `Unknown operation type: ${operation.type}` };
        }

        operation.results.push({ deviceId, ...result });
        
      } catch (error) {
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

  getBulkOperation(operationId: string): BulkOperation | undefined {
    return this.bulkOperations.get(operationId);
  }

  // ===========================================
  // HEALTH MONITORING
  // ===========================================

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthCheck(): Promise<void> {
    const connectedDevices = Array.from(this.devices.keys());
    
    for (const deviceId of connectedDevices) {
      try {
        const result = await this.testConnection(deviceId);
        if (!result.connected) {
          this.updateDeviceStatus(deviceId, 'error');
          this.emit('device:health_check_failed', { deviceId, error: result.error });
        }
      } catch (error) {
        console.warn(`Health check failed for device ${deviceId}:`, error);
      }
    }
  }

  private updateDeviceHealth(
    deviceId: string, 
    updates: Partial<DeviceHealth>
  ): void {
    const current = this.deviceHealth.get(deviceId) || {
      deviceId,
      timestamp: new Date().toISOString(),
      uptime: 0,
      responseTime: 0,
      errorCount: 0,
    };

    const updated: DeviceHealth = {
      ...current,
      ...updates,
      timestamp: new Date().toISOString(),
    };

    this.deviceHealth.set(deviceId, updated);
    this.emit('device:health_updated', { deviceId, health: updated });
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  getDevice(deviceId: string): BiometricDeviceMiddleware {
    const device = this.devices.get(deviceId);
    if (!device) {
      const config = this.deviceConfigs.get(deviceId);
      const deviceName = config ? config.name : deviceId;
      throw new Error(`Device not connected: ${deviceName} (${deviceId})`);
    }
    return device;
  }

  getDeviceConfig(deviceId: string): DeviceConfig | undefined {
    return this.deviceConfigs.get(deviceId);
  }

  getAllDeviceConfigs(): DeviceConfig[] {
    return Array.from(this.deviceConfigs.values());
  }

  getConnectedDevices(): Array<{ deviceId: string; device: BiometricDeviceMiddleware; config: DeviceConfig }> {
    const connected = [];
    for (const [deviceId, device] of this.devices) {
      const config = this.deviceConfigs.get(deviceId);
      if (config) {
        connected.push({ deviceId, device, config });
      }
    }
    return connected;
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  getDeviceStatus(deviceId: string): any {
    const config = this.deviceConfigs.get(deviceId);
    const health = this.deviceHealth.get(deviceId);
    
    if (!config) return null;

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

  getSystemOverview(): any {
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
      devices: Array.from(this.deviceConfigs.values()).map(config => 
        this.getDeviceStatus(config.deviceId)
      ),
    };
  }

  // ===========================================
  // PERSISTENCE METHODS
  // ===========================================

  private async loadConfigurations(): Promise<void> {
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
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('⚠️ Error loading device configurations:', error.message);
      }
    }
  }

  private async saveConfigurations(): Promise<void> {
    try {
      const configs = Array.from(this.deviceConfigs.values());
      await fs.writeFile(this.configFile, JSON.stringify(configs, null, 2));
    } catch (error) {
      console.error('⚠️ Error saving device configurations:', error);
    }
  }

  private async loadGroups(): Promise<void> {
    try {
      const data = await fs.readFile(this.groupsFile, 'utf8');
      const groups = JSON.parse(data);
      
      for (const group of groups) {
        this.deviceGroups.set(group.id, group);
      }
      
      console.log(`📁 Loaded ${groups.length} device group(s)`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('⚠️ Error loading device groups:', error.message);
      }
    }
  }

  private async saveGroups(): Promise<void> {
    try {
      const groups = Array.from(this.deviceGroups.values());
      await fs.writeFile(this.groupsFile, JSON.stringify(groups, null, 2));
    } catch (error) {
      console.error('⚠️ Error saving device groups:', error);
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      const data = await fs.readFile(this.templatesFile, 'utf8');
      const templates = JSON.parse(data);
      
      for (const template of templates) {
        this.deviceTemplates.set(template.id, template);
      }
      
      console.log(`📁 Loaded ${templates.length} device template(s)`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('⚠️ Error loading device templates:', error.message);
      }
    }
  }

  private async saveTemplates(): Promise<void> {
    try {
      const templates = Array.from(this.deviceTemplates.values());
      await fs.writeFile(this.templatesFile, JSON.stringify(templates, null, 2));
    } catch (error) {
      console.error('⚠️ Error saving device templates:', error);
    }
  }

  private async reconnectDevices(): Promise<void> {
    const reconnectPromises = [];
    
    for (const [deviceId, config] of this.deviceConfigs) {
      if (config.autoReconnect !== false) {
        reconnectPromises.push(
          this.connectDevice(deviceId)
            .catch(error => console.warn(`⚠️ Could not reconnect to ${deviceId}: ${error.message}`))
        );
      }
    }
    
    if (reconnectPromises.length > 0) {
      await Promise.allSettled(reconnectPromises);
    }
  }

  private updateDeviceStatus(deviceId: string, status: DeviceStatus): void {
    const config = this.deviceConfigs.get(deviceId);
    if (config) {
      config.status = status;
      this.emit('device:status_changed', { deviceId, status, config });
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Disconnect all devices
    const disconnectPromises = Array.from(this.devices.keys())
      .map(deviceId => this.disconnectDevice(deviceId));
    
    await Promise.allSettled(disconnectPromises);
    
    this.emit('manager:shutdown');
    console.log('🔌 Enhanced DeviceManager shutdown complete');
  }
}
