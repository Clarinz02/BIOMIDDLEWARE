/**
 * API Key Management System
 * Handles generation, validation, and storage of API keys for device synchronization
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class APIKeyManager {
    constructor() {
        this.keysFile = path.join(__dirname, 'api-keys.json');
        this.keys = new Map();
        this.init();
    }

    async init() {
        try {
            await this.loadKeys();
        } catch (error) {
            console.log('No existing API keys found, creating new storage...');
            await this.saveKeys();
        }
    }

    /**
     * Generate a new API key
     * @param {string} name - Name/description for the API key
     * @param {string} deviceId - Device identifier (optional)
     * @returns {Object} API key object
     */
    generateKey(name = 'Default', deviceId = null) {
        const keyId = crypto.randomUUID();
        const apiKey = this.generateSecureKey();
        const timestamp = new Date().toISOString();

        const keyObject = {
            id: keyId,
            key: apiKey,
            name: name,
            deviceId: deviceId,
            createdAt: timestamp,
            lastUsed: null,
            usageCount: 0,
            active: true,
            permissions: ['read', 'write', 'admin'] // Default full permissions
        };

        this.keys.set(keyId, keyObject);
        this.saveKeys();

        return keyObject;
    }

    /**
     * Generate a cryptographically secure API key
     * @returns {string} Base64 encoded API key
     */
    generateSecureKey() {
        // Generate 32 random bytes and encode as base64
        const randomBytes = crypto.randomBytes(32);
        return randomBytes.toString('base64')
            .replace(/[+/]/g, '') // Remove special characters
            .substring(0, 32); // Truncate to 32 characters
    }

    /**
     * Validate an API key
     * @param {string} apiKey - The API key to validate
     * @returns {Object|null} Key object if valid, null if invalid
     */
    validateKey(apiKey) {
        for (const [id, keyObj] of this.keys) {
            if (keyObj.key === apiKey && keyObj.active) {
                // Update last used timestamp and usage count
                keyObj.lastUsed = new Date().toISOString();
                keyObj.usageCount++;
                this.saveKeys();
                return keyObj;
            }
        }
        return null;
    }

    /**
     * Get all API keys (without exposing the actual keys)
     * @returns {Array} Array of key objects (keys redacted)
     */
    getAllKeys() {
        return Array.from(this.keys.values()).map(key => ({
            id: key.id,
            name: key.name,
            deviceId: key.deviceId,
            createdAt: key.createdAt,
            lastUsed: key.lastUsed,
            usageCount: key.usageCount,
            active: key.active,
            permissions: key.permissions,
            keyPreview: key.key.substring(0, 8) + '...' // Show only first 8 characters
        }));
    }

    /**
     * Get a specific API key by ID
     * @param {string} keyId - The key ID
     * @returns {Object|null} Key object if found
     */
    getKey(keyId) {
        return this.keys.get(keyId) || null;
    }

    /**
     * Deactivate an API key
     * @param {string} keyId - The key ID to deactivate
     * @returns {boolean} Success status
     */
    deactivateKey(keyId) {
        const keyObj = this.keys.get(keyId);
        if (keyObj) {
            keyObj.active = false;
            this.saveKeys();
            return true;
        }
        return false;
    }

    /**
     * Reactivate an API key
     * @param {string} keyId - The key ID to reactivate
     * @returns {boolean} Success status
     */
    reactivateKey(keyId) {
        const keyObj = this.keys.get(keyId);
        if (keyObj) {
            keyObj.active = true;
            this.saveKeys();
            return true;
        }
        return false;
    }

    /**
     * Delete an API key permanently
     * @param {string} keyId - The key ID to delete
     * @returns {boolean} Success status
     */
    deleteKey(keyId) {
        const deleted = this.keys.delete(keyId);
        if (deleted) {
            this.saveKeys();
        }
        return deleted;
    }

    /**
     * Update API key permissions
     * @param {string} keyId - The key ID
     * @param {Array} permissions - New permissions array
     * @returns {boolean} Success status
     */
    updatePermissions(keyId, permissions) {
        const keyObj = this.keys.get(keyId);
        if (keyObj) {
            keyObj.permissions = permissions;
            this.saveKeys();
            return true;
        }
        return false;
    }

    /**
     * Update API key name
     * @param {string} keyId - The key ID
     * @param {string} name - New name
     * @returns {boolean} Success status
     */
    updateName(keyId, name) {
        const keyObj = this.keys.get(keyId);
        if (keyObj) {
            keyObj.name = name;
            this.saveKeys();
            return true;
        }
        return false;
    }

    /**
     * Generate QR code data for easy device setup
     * @param {string} keyId - The key ID
     * @param {string} serverUrl - Server URL (optional)
     * @returns {Object|null} QR code data
     */
    generateQRData(keyId, serverUrl = null) {
        const keyObj = this.keys.get(keyId);
        if (!keyObj || !keyObj.active) {
            return null;
        }

        return {
            type: 'biometric_device_config',
            apiKey: keyObj.key,
            serverUrl: serverUrl || 'http://localhost:3000',
            keyName: keyObj.name,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clean up old unused keys
     * @param {number} daysOld - Delete keys older than this many days if never used
     */
    async cleanupOldKeys(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        let deletedCount = 0;
        for (const [id, keyObj] of this.keys) {
            const createdDate = new Date(keyObj.createdAt);
            if (createdDate < cutoffDate && keyObj.usageCount === 0) {
                this.keys.delete(id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            await this.saveKeys();
            console.log(`Cleaned up ${deletedCount} unused API keys`);
        }

        return deletedCount;
    }

    /**
     * Generate usage statistics
     * @returns {Object} Usage statistics
     */
    getUsageStats() {
        const allKeys = Array.from(this.keys.values());
        
        return {
            totalKeys: allKeys.length,
            activeKeys: allKeys.filter(k => k.active).length,
            inactiveKeys: allKeys.filter(k => !k.active).length,
            usedKeys: allKeys.filter(k => k.usageCount > 0).length,
            unusedKeys: allKeys.filter(k => k.usageCount === 0).length,
            totalUsage: allKeys.reduce((sum, k) => sum + k.usageCount, 0),
            mostUsedKey: allKeys.reduce((max, k) => k.usageCount > (max?.usageCount || 0) ? k : max, null),
            recentlyUsed: allKeys
                .filter(k => k.lastUsed)
                .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
                .slice(0, 5)
        };
    }

    /**
     * Load keys from storage
     */
    async loadKeys() {
        try {
            const data = await fs.readFile(this.keysFile, 'utf8');
            const keysArray = JSON.parse(data);
            
            this.keys.clear();
            keysArray.forEach(keyObj => {
                this.keys.set(keyObj.id, keyObj);
            });
            
            console.log(`Loaded ${this.keys.size} API keys from storage`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading API keys:', error);
            }
            throw error;
        }
    }

    /**
     * Save keys to storage
     */
    async saveKeys() {
        try {
            const keysArray = Array.from(this.keys.values());
            await fs.writeFile(this.keysFile, JSON.stringify(keysArray, null, 2));
        } catch (error) {
            console.error('Error saving API keys:', error);
            throw error;
        }
    }

    /**
     * Create default API keys for common scenarios
     */
    async createDefaultKeys() {
        const defaults = [
            { name: 'Development Key', deviceId: 'dev-001' },
            { name: 'Production Key', deviceId: 'prod-001' },
            { name: 'Test Device Key', deviceId: 'test-001' }
        ];

        const createdKeys = [];
        for (const def of defaults) {
            const key = this.generateKey(def.name, def.deviceId);
            createdKeys.push(key);
        }

        return createdKeys;
    }

    /**
     * Export keys for backup (keys are encrypted)
     * @param {string} password - Password to encrypt the backup
     * @returns {string} Encrypted backup data
     */
    exportKeys(password) {
        const data = JSON.stringify(Array.from(this.keys.values()));
        const cipher = crypto.createCipher('aes256', password);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            data: encrypted,
            timestamp: new Date().toISOString(),
            keyCount: this.keys.size
        };
    }

    /**
     * Import keys from backup
     * @param {string} encryptedData - Encrypted backup data
     * @param {string} password - Password to decrypt the backup
     * @returns {number} Number of keys imported
     */
    importKeys(encryptedData, password) {
        try {
            const decipher = crypto.createDecipher('aes256', password);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            const keysArray = JSON.parse(decrypted);
            let importedCount = 0;
            
            keysArray.forEach(keyObj => {
                if (!this.keys.has(keyObj.id)) {
                    this.keys.set(keyObj.id, keyObj);
                    importedCount++;
                }
            });
            
            this.saveKeys();
            return importedCount;
        } catch (error) {
            throw new Error('Failed to import keys: Invalid password or corrupted data');
        }
    }
}

// Create singleton instance
const apiKeyManager = new APIKeyManager();

module.exports = {
    APIKeyManager,
    apiKeyManager
};
