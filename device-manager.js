#!/usr/bin/env node
/**
 * Device Manager for Multi-Branch Biometric System
 * 
 * Manages multiple biometric devices across different network connections
 * and provides a unified interface for device operations.
 */

const fs = require('fs').promises;
const path = require('path');
const { BiometricDeviceMiddleware, BiometricDeviceError } = require('./biometric-middleware');

class DeviceManager {
    constructor() {
        this.devices = new Map(); // deviceId -> device instance
        this.deviceConfigs = new Map(); // deviceId -> device configuration
        this.configFile = path.join(__dirname, 'data', 'device-configs.json');
        this.initialized = false;
    }

    /**
     * Initialize the device manager and load saved configurations
     */
    async init() {
        try {
            // Ensure data directory exists
            await fs.mkdir(path.dirname(this.configFile), { recursive: true });
            
            // Load saved device configurations
            await this.loadConfigurations();
            
            // Reconnect to previously configured devices
            await this.reconnectDevices();
            
            this.initialized = true;
            console.log(`🔌 DeviceManager initialized with ${this.deviceConfigs.size} device(s)`);
        } catch (error) {
            console.error('❌ Failed to initialize DeviceManager:', error.message);
            this.initialized = true; // Continue anyway
        }
    }

    /**
     * Load device configurations from file
     */
    async loadConfigurations() {
        try {
            const data = await fs.readFile(this.configFile, 'utf8');
            const configs = JSON.parse(data);
            
            for (const config of configs) {
                this.deviceConfigs.set(config.deviceId, {
                    ...config,
                    lastConnected: config.lastConnected ? new Date(config.lastConnected) : null
                });
            }
            
            console.log(`📁 Loaded ${configs.length} device configuration(s)`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('⚠️ Error loading device configurations:', error.message);
            }
        }
    }

    /**
     * Save device configurations to file
     */
    async saveConfigurations() {
        try {
            const configs = Array.from(this.deviceConfigs.values());
            await fs.writeFile(this.configFile, JSON.stringify(configs, null, 2));
        } catch (error) {
            console.error('⚠️ Error saving device configurations:', error.message);
        }
    }

    /**
     * Reconnect to all previously configured devices
     */
    async reconnectDevices() {
        const reconnectPromises = [];
        
        for (const [deviceId, config] of this.deviceConfigs) {
            if (config.autoReconnect !== false) {
                reconnectPromises.push(
                    this.connectDevice(deviceId, config, false) // false = don't save again
                        .catch(error => console.warn(`⚠️ Could not reconnect to ${deviceId}: ${error.message}`))
                );
            }
        }
        
        if (reconnectPromises.length > 0) {
            await Promise.allSettled(reconnectPromises);
        }
    }

    /**
     * Add or update a device configuration
     */
    async addDevice(deviceId, config) {
        const deviceConfig = {
            deviceId,
            name: config.name || deviceId,
            ip: config.ip,
            port: config.port || null,
            apiKey: config.apiKey || null,
            useHttps: config.useHttps || false,
            wifiNetwork: config.wifiNetwork || null,
            branch: config.branch || 'main',
            location: config.location || null,
            autoReconnect: config.autoReconnect !== false,
            createdAt: new Date().toISOString(),
            lastConnected: null,
            status: 'disconnected'
        };

        this.deviceConfigs.set(deviceId, deviceConfig);
        await this.saveConfigurations();
        
        console.log(`✅ Device configuration saved: ${deviceId} (${deviceConfig.name})`);
        return deviceConfig;
    }

    /**
     * Connect to a specific device
     */
    async connectDevice(deviceId, config = null, save = true) {
        if (!config) {
            config = this.deviceConfigs.get(deviceId);
            if (!config) {
                throw new Error(`Device configuration not found: ${deviceId}`);
            }
        }

        try {
            // Disconnect existing connection if any
            if (this.devices.has(deviceId)) {
                this.devices.delete(deviceId);
            }

            // Create new device instance
            // Construct device address with port if specified
            const deviceAddress = config.port ? `${config.ip}:${config.port}` : config.ip;
            const device = new BiometricDeviceMiddleware(
                deviceAddress,
                config.apiKey,
                config.useHttps
            );

            // Test connection by getting device info
            await device.getVersionInfo();

            // Store the connected device
            this.devices.set(deviceId, device);
            
            // Update configuration
            config.lastConnected = new Date();
            config.status = 'connected';
            this.deviceConfigs.set(deviceId, config);
            
            if (save) {
                await this.saveConfigurations();
            }

            console.log(`🔌 Connected to device: ${deviceId} (${config.ip})`);
            return device;
        } catch (error) {
            // Update status to disconnected
            config.status = 'disconnected';
            this.deviceConfigs.set(deviceId, config);
            
            if (save) {
                await this.saveConfigurations();
            }

            throw new BiometricDeviceError(
                `Failed to connect to device ${deviceId}: ${error.message}`,
                'CONNECTION_FAILED'
            );
        }
    }

    /**
     * Disconnect from a specific device
     */
    async disconnectDevice(deviceId) {
        if (this.devices.has(deviceId)) {
            this.devices.delete(deviceId);
            
            // Update configuration status
            const config = this.deviceConfigs.get(deviceId);
            if (config) {
                config.status = 'disconnected';
                this.deviceConfigs.set(deviceId, config);
                await this.saveConfigurations();
            }
            
            console.log(`🔌 Disconnected from device: ${deviceId}`);
            return true;
        }
        return false;
    }

    /**
     * Remove a device completely
     */
    async removeDevice(deviceId) {
        // Disconnect first
        await this.disconnectDevice(deviceId);
        
        // Remove from configurations
        this.deviceConfigs.delete(deviceId);
        await this.saveConfigurations();
        
        console.log(`🗑️ Removed device: ${deviceId}`);
        return true;
    }

    /**
     * Get a connected device instance
     */
    getDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            const config = this.deviceConfigs.get(deviceId);
            const deviceName = config ? config.name : deviceId;
            throw new BiometricDeviceError(
                `Device not connected: ${deviceName} (${deviceId})`,
                'DEVICE_NOT_CONNECTED'
            );
        }
        return device;
    }

    /**
     * Get device configuration
     */
    getDeviceConfig(deviceId) {
        return this.deviceConfigs.get(deviceId);
    }

    /**
     * Get all device configurations
     */
    getAllDeviceConfigs() {
        return Array.from(this.deviceConfigs.values());
    }

    /**
     * Get all connected devices
     */
    getConnectedDevices() {
        const connected = [];
        for (const [deviceId, device] of this.devices) {
            const config = this.deviceConfigs.get(deviceId);
            connected.push({
                deviceId,
                device,
                config
            });
        }
        return connected;
    }

    /**
     * Check if device is connected
     */
    isDeviceConnected(deviceId) {
        return this.devices.has(deviceId);
    }

    /**
     * Get device status summary
     */
    getDeviceStatus(deviceId) {
        const config = this.deviceConfigs.get(deviceId);
        if (!config) {
            return null;
        }

        return {
            deviceId: config.deviceId,
            name: config.name,
            branch: config.branch,
            location: config.location,
            ip: config.ip,
            connected: this.devices.has(deviceId),
            lastConnected: config.lastConnected,
            status: config.status,
            wifiNetwork: config.wifiNetwork
        };
    }

    /**
     * Get system overview
     */
    getSystemOverview() {
        const totalDevices = this.deviceConfigs.size;
        const connectedDevices = this.devices.size;
        const branches = new Set(Array.from(this.deviceConfigs.values()).map(c => c.branch));
        const locations = new Set(Array.from(this.deviceConfigs.values()).map(c => c.location).filter(Boolean));

        return {
            totalDevices,
            connectedDevices,
            disconnectedDevices: totalDevices - connectedDevices,
            branches: Array.from(branches),
            locations: Array.from(locations),
            devices: Array.from(this.deviceConfigs.values()).map(config => this.getDeviceStatus(config.deviceId))
        };
    }

    /**
     * Test device connectivity
     */
    async testDevice(deviceId) {
        try {
            const device = this.getDevice(deviceId);
            const version = await device.getVersionInfo();
            return {
                connected: true,
                version,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Update device configuration
     */
    async updateDeviceConfig(deviceId, updates) {
        const config = this.deviceConfigs.get(deviceId);
        if (!config) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        // Update configuration
        const updatedConfig = { ...config, ...updates };
        this.deviceConfigs.set(deviceId, updatedConfig);
        await this.saveConfigurations();

        // If connection details changed, reconnect
        const connectionFields = ['ip', 'apiKey', 'useHttps'];
        const needsReconnect = connectionFields.some(field => 
            updates.hasOwnProperty(field) && updates[field] !== config[field]
        );

        if (needsReconnect && this.devices.has(deviceId)) {
            try {
                await this.connectDevice(deviceId, updatedConfig, false);
            } catch (error) {
                console.warn(`⚠️ Could not reconnect after config update: ${error.message}`);
            }
        }

        return updatedConfig;
    }
}

module.exports = { DeviceManager };
