/**
 * Biometric Device Middleware for Node.js
 * 
 * A Node.js middleware for communicating with biometric devices using the specified HTTP/HTTPS JSON protocol.
 * Supports user management, attendance records, device configuration, and biometric enrollment.
 */

const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

/**
 * Custom error class for biometric device errors
 */
class BiometricDeviceError extends Error {
    constructor(message, errorCode = null, arguments_ = null) {
        super(message);
        this.name = 'BiometricDeviceError';
        this.errorCode = errorCode;
        this.arguments = arguments_;
    }
}

/**
 * Middleware for communicating with biometric devices
 */
class BiometricDeviceMiddleware {
    /**
     * Initialize the middleware
     * 
     * @param {string} deviceIp - IP address or hostname of the device
     * @param {string|null} apiKey - API key for authentication (optional)
     * @param {boolean} useHttps - Whether to use HTTPS instead of HTTP
     * @param {number} timeout - Request timeout in milliseconds
     */
    constructor(deviceIp, apiKey = null, useHttps = false, timeout = 30000) {
        this.deviceIp = deviceIp;
        this.apiKey = apiKey;
        this.useHttps = useHttps;
        this.timeout = timeout;

        // Configure axios instance
        this.axios = axios.create({
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Disable SSL verification for self-signed certificates if using HTTPS
        if (useHttps) {
            this.axios.defaults.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }
    }

    /**
     * Get the base URL for API requests
     * @returns {string} Base URL
     */
    _getBaseUrl() {
        const protocol = this.useHttps ? 'https' : 'http';
        let url = `${protocol}://${this.deviceIp}/control`;
        if (this.apiKey) {
            url += `?api_key=${this.apiKey}`;
        }
        return url;
    }

    /**
     * Generate a unique message ID
     * @returns {string} Message ID
     */
    _generateMessageId() {
        return uuidv4().substring(0, 8);
    }

    /**
     * Send a request to the device
     * 
     * @param {string} command - Command to send
     * @param {Object} payload - Command payload
     * @returns {Promise<Object>} Response payload
     * @throws {BiometricDeviceError} If the request fails or device returns an error
     */
    async _sendRequest(command, payload = {}) {
        const messageId = this._generateMessageId();
        const requestData = {
            mid: messageId,
            cmd: command,
            payload: payload
        };

        try {
            const response = await this.axios.post(this._getBaseUrl(), requestData);
            const responseData = response.data;

            // Check if message IDs match
            if (responseData.mid !== messageId) {
                throw new BiometricDeviceError('Message ID mismatch in response');
            }

            // Check for errors
            if (responseData.result === 'Error') {
                const errorPayload = responseData.payload || {};
                const errorCode = errorPayload.code || 'unknown_error';
                const arguments_ = errorPayload.arguments || [];
                throw new BiometricDeviceError(
                    `Device error: ${errorCode}`,
                    errorCode,
                    arguments_
                );
            }

            return responseData.payload || {};

        } catch (error) {
            if (error instanceof BiometricDeviceError) {
                throw error;
            }
            if (error.response) {
                throw new BiometricDeviceError(`HTTP error: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                throw new BiometricDeviceError(`Network error: ${error.message}`);
            } else {
                throw new BiometricDeviceError(`Request error: ${error.message}`);
            }
        }
    }

    // Security Configuration Methods

    /**
     * Configure device security settings
     * 
     * @param {Object} config - Security configuration
     * @param {string} config.apiKey - API key for authentication
     * @param {boolean} config.enableHttp - Enable HTTP interface
     * @param {boolean} config.enableHttps - Enable HTTPS interface
     * @param {boolean} config.validateCertificate - Validate server certificates
     * @param {string} config.caCert - PEM-encoded CA certificate
     * @param {string} config.deviceCert - PEM-encoded device certificate
     * @param {string} config.deviceKey - PEM-encoded private key
     * @returns {Promise<boolean>} True if successful
     */
    async setSecurityConfig(config = {}) {
        const payload = {
            enable_http: config.enableHttp !== false ? 'yes' : 'no'
        };

        if (config.apiKey) {
            payload.api_key = config.apiKey;
        }

        const tlsConf = {
            enabled: config.enableHttps ? 'yes' : 'no',
            validate_certificate: config.validateCertificate !== false ? 'yes' : 'no'
        };

        if (config.caCert) tlsConf.ca_cert = config.caCert;
        if (config.deviceCert) tlsConf.device_cert = config.deviceCert;
        if (config.deviceKey) tlsConf.device_key = config.deviceKey;

        payload.tls_conf = tlsConf;

        await this._sendRequest('SetSecurityConfig', payload);

        // Update local apiKey if provided
        if (config.apiKey) {
            this.apiKey = config.apiKey;
        }

        return true;
    }

    // User Management Methods

    /**
     * Get list of user IDs
     * 
     * @param {number|null} startPos - Starting position for pagination (optional)
     * @returns {Promise<Object>} Dictionary containing user_id list and next_page_pos (if applicable)
     */
    async getUserIdList(startPos = null) {
        const payload = {};
        if (startPos !== null) {
            payload.start_pos = startPos;
        }
        return await this._sendRequest('GetUserIdList', payload);
    }

    /**
     * Get all user IDs by handling pagination automatically
     * 
     * @returns {Promise<string[]>} Complete list of user IDs
     */
    async getAllUserIds() {
        const allUserIds = [];
        let startPos = null;

        while (true) {
            const result = await this.getUserIdList(startPos);
            const userIds = result.user_id || [];
            allUserIds.push(...userIds);

            const nextPagePos = result.next_page_pos;
            if (nextPagePos === undefined) {
                break;
            }
            startPos = nextPagePos;
        }

        return allUserIds;
    }

    /**
     * Get user information
     * 
     * @param {string} userId - User ID to retrieve information for
     * @returns {Promise<Object>} User information dictionary
     */
    async getUserInfo(userId) {
        const payload = { id: userId };
        return await this._sendRequest('GetUserInfo', payload);
    }

    /**
     * Set user information (create or update user)
     * 
     * @param {Object} userInfo - User information
     * @param {string} userInfo.id - User ID
     * @param {string} userInfo.name - User name
     * @param {string} userInfo.department - User department
     * @param {string} userInfo.privilege - User privilege ("user", "manager", "admin")
     * @param {string} userInfo.password - User password
     * @param {string} userInfo.card - Card number
     * @param {string[]} userInfo.fingerprintData - Array of base64-encoded fingerprint templates
     * @param {string} userInfo.faceData - Base64-encoded face template
     * @param {string[]} userInfo.palmData - Array of base64-encoded palm templates
     * @returns {Promise<boolean>} True if successful
     */
    async setUserInfo(userInfo) {
        const payload = { id: userInfo.id };

        if (userInfo.name !== undefined) payload.name = userInfo.name;
        if (userInfo.department !== undefined) payload.depart = userInfo.department;
        if (userInfo.privilege !== undefined) payload.privilege = userInfo.privilege;
        if (userInfo.password !== undefined) payload.password = userInfo.password;
        if (userInfo.card !== undefined) payload.card = userInfo.card;
        if (userInfo.fingerprintData !== undefined) payload.fp = userInfo.fingerprintData;
        if (userInfo.faceData !== undefined) payload.face = userInfo.faceData;
        if (userInfo.palmData !== undefined) payload.palm = userInfo.palmData;

        await this._sendRequest('SetUserInfo', payload);
        return true;
    }

    /**
     * Delete a user
     * 
     * @param {string} userId - User ID to delete
     * @returns {Promise<boolean>} True if successful
     */
    async deleteUserInfo(userId) {
        const payload = { id: userId };
        await this._sendRequest('DeleteUserInfo', payload);
        return true;
    }

    // Device Control Methods

    /**
     * Lock or unlock the device
     * 
     * @param {boolean} isLocked - True to lock device, False to unlock
     * @returns {Promise<boolean>} True if successful
     */
    async lockDevice(isLocked) {
        const payload = { is_locked: isLocked ? 'yes' : 'no' };
        await this._sendRequest('LockDevice', payload);
        return true;
    }

    // Biometric Enrollment Methods

    /**
     * Start face enrollment process
     * 
     * @returns {Promise<number>} Job ID for tracking enrollment status
     */
    async beginEnrollFace() {
        const result = await this._sendRequest('BeginEnrollFace');
        return result.job_id;
    }

    /**
     * Start fingerprint enrollment process
     * 
     * @returns {Promise<number>} Job ID for tracking enrollment status
     */
    async beginEnrollFingerprint() {
        const result = await this._sendRequest('BeginEnrollFp');
        return result.job_id;
    }

    /**
     * Start card enrollment process
     * 
     * @returns {Promise<number>} Job ID for tracking enrollment status
     */
    async beginEnrollCard() {
        const result = await this._sendRequest('BeginEnrollCard');
        return result.job_id;
    }

    /**
     * Start palm enrollment process
     * 
     * @returns {Promise<number>} Job ID for tracking enrollment status
     */
    async beginEnrollPalm() {
        const result = await this._sendRequest('BeginEnrollPalm');
        return result.job_id;
    }

    /**
     * Query the status of an enrollment job
     * 
     * @param {number} jobId - Job ID returned from enrollment start methods
     * @returns {Promise<Object>} Job status dictionary containing state and data (if completed)
     */
    async queryJobStatus(jobId) {
        const payload = { job_id: jobId };
        return await this._sendRequest('QueryJobStatus', payload);
    }

    /**
     * Cancel a specific enrollment job
     * 
     * @param {number} jobId - Job ID to cancel
     * @returns {Promise<boolean>} True if successful
     */
    async cancelJob(jobId) {
        const payload = { job_id: jobId };
        await this._sendRequest('CancelJob', payload);
        return true;
    }

    /**
     * Cancel all active enrollment jobs
     * 
     * @returns {Promise<boolean>} True if successful
     */
    async cancelAllJobs() {
        await this._sendRequest('CancelAllJobs');
        return true;
    }

    /**
     * Convert a photo to face template data
     * 
     * @param {string} photoBase64 - Base64-encoded JPG photo data
     * @returns {Promise<Object>} Dictionary with conversion status and face_data (if successful)
     */
    async photoToFaceData(photoBase64) {
        const payload = { photo: photoBase64 };
        return await this._sendRequest('PhotoToFacedata', payload);
    }

    /**
     * Wait for an enrollment job to complete
     * 
     * @param {number} jobId - Job ID to wait for
     * @param {number} timeout - Maximum time to wait in milliseconds
     * @param {number} pollInterval - Time between status checks in milliseconds
     * @returns {Promise<Object>} Final job status dictionary
     * @throws {BiometricDeviceError} If enrollment fails or times out
     */
    async waitForEnrollmentCompletion(jobId, timeout = 60000, pollInterval = 1000) {
        const startTime = Date.now();

        while (true) {
            const status = await this.queryJobStatus(jobId);
            const state = status.state;

            if (state === 'succeeded') {
                return status;
            } else if (state === 'failed') {
                throw new BiometricDeviceError('Enrollment job failed');
            } else if (state === 'pending') {
                if (Date.now() - startTime > timeout) {
                    throw new BiometricDeviceError('Enrollment job timed out');
                }
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } else {
                throw new BiometricDeviceError(`Unknown job state: ${state}`);
            }
        }
    }

    // Attendance Record Management

    /**
     * Get attendance logs
     * 
     * @param {number|null} startPos - Starting position for pagination (optional)
     * @returns {Promise<Object>} Dictionary containing logs, start_pos, and next_pos (if applicable)
     */
    async getAttendLog(startPos = null) {
        const payload = {};
        if (startPos !== null) {
            payload.start_pos = startPos;
        }
        return await this._sendRequest('GetAttendLog', payload);
    }

    /**
     * Get all attendance logs by handling pagination automatically
     * 
     * @returns {Promise<Object[]>} Complete list of attendance log entries
     */
    async getAllAttendLogs() {
        const allLogs = [];
        let startPos = null;

        while (true) {
            const result = await this.getAttendLog(startPos);
            const logs = result.logs || [];
            allLogs.push(...logs);

            const nextPos = result.next_pos;
            if (nextPos === undefined) {
                break;
            }
            startPos = nextPos;
        }

        return allLogs;
    }

    /**
     * Clear attendance records up to the specified position
     * 
     * @param {number} endPos - All records before this position will be deleted
     * @returns {Promise<boolean>} True if successful
     */
    async eraseAttendLog(endPos) {
        const payload = { end_pos: endPos };
        await this._sendRequest('EraseAttendLog', payload);
        return true;
    }

    /**
     * Configure automatic attendance log uploading
     * 
     * @param {string} targetUri - Service address for uploading attendance records
     * @param {number} interval - Upload interval in seconds (5-3600)
     * @returns {Promise<boolean>} True if successful
     */
    async configAttendLogUploader(targetUri, interval) {
        if (interval < 5 || interval > 3600) {
            throw new Error('Interval must be between 5 and 3600 seconds');
        }

        const payload = {
            target_uri: targetUri,
            interval: interval
        };
        await this._sendRequest('ConfigAttendLogUploader', payload);
        return true;
    }

    /**
     * Get attendance log uploader status
     * 
     * @returns {Promise<Object>} Dictionary containing status and pending_count
     */
    async getAttendLogUploaderStatus() {
        return await this._sendRequest('GetAttendLogUploaderStatus');
    }

    // Time Synchronization

    /**
     * Get device time
     * 
     * @returns {Promise<string>} Current device time in ISO8601 format
     */
    async getDeviceTime() {
        const result = await this._sendRequest('GetDeviceTime');
        return result.time;
    }

    /**
     * Set device time
     * 
     * @param {string|null} timeIso - Time in ISO8601 format (if null, uses current system time)
     * @returns {Promise<boolean>} True if successful
     */
    async setDeviceTime(timeIso = null) {
        if (timeIso === null) {
            timeIso = new Date().toISOString();
        }

        const payload = { time: timeIso };
        await this._sendRequest('SetDeviceTime', payload);
        return true;
    }

    // Device Network Configuration

    /**
     * Get device network configuration
     * 
     * @returns {Promise<Object>} Network configuration dictionary
     */
    async getNetworkConfig() {
        return await this._sendRequest('GetNetworkConfig');
    }

    /**
     * Set device network configuration
     * 
     * @param {Object} config - Network configuration
     * @param {Object} config.ethernet - Ethernet configuration dictionary
     * @param {Object} config.wlan - WLAN configuration dictionary
     * @returns {Promise<boolean>} True if successful
     */
    async setNetworkConfig(config = {}) {
        const payload = {};

        if (config.ethernet) {
            payload.ethernet = config.ethernet;
        }
        if (config.wlan) {
            payload.wlan = config.wlan;
        }

        await this._sendRequest('SetNetworkConfig', payload);
        return true;
    }

    // Device Information and Settings

    /**
     * Get device version information
     * 
     * @returns {Promise<Object>} Dictionary containing firmware and algorithm versions
     */
    async getVersionInfo() {
        return await this._sendRequest('GetVersionInfo');
    }

    /**
     * Get device capacity limits
     * 
     * @returns {Promise<Object>} Dictionary containing maximum counts for users, faces, etc.
     */
    async getCapacityLimit() {
        return await this._sendRequest('GetCapacityLimit');
    }

    /**
     * Get current device usage statistics
     * 
     * @returns {Promise<Object>} Dictionary containing current counts for users, faces, etc.
     */
    async getCurrentUsage() {
        return await this._sendRequest('GetCurrentUsage');
    }

    /**
     * Get device unique ID
     * 
     * @returns {Promise<string>} Device UID as hexadecimal string
     */
    async getDeviceUid() {
        const result = await this._sendRequest('GetDeviceUid');
        return result.device_uid;
    }

    /**
     * Get device capabilities
     * 
     * @returns {Promise<Object>} Dictionary showing which features are supported
     */
    async getDeviceCapabilities() {
        return await this._sendRequest('GetDeviceCapabilities');
    }

    /**
     * Get device ID
     * 
     * @returns {Promise<number>} Device ID (1-255)
     */
    async getDeviceId() {
        const result = await this._sendRequest('GetDeviceId');
        return result.device_id;
    }

    /**
     * Set device ID
     * 
     * @param {number} deviceId - Device ID (1-255)
     * @returns {Promise<boolean>} True if successful
     */
    async setDeviceId(deviceId) {
        if (deviceId < 1 || deviceId > 255) {
            throw new Error('Device ID must be between 1 and 255');
        }

        const payload = { device_id: deviceId };
        await this._sendRequest('SetDeviceId', payload);
        return true;
    }

    /**
     * Get device sound volume
     * 
     * @returns {Promise<number>} Sound volume (1-10)
     */
    async getSoundVolume() {
        const result = await this._sendRequest('GetSoundVolume');
        return result.sound_volume;
    }

    /**
     * Set device sound volume
     * 
     * @param {number} volume - Sound volume (1-10)
     * @returns {Promise<boolean>} True if successful
     */
    async setSoundVolume(volume) {
        if (volume < 1 || volume > 10) {
            throw new Error('Sound volume must be between 1 and 10');
        }

        const payload = { sound_volume: volume };
        await this._sendRequest('SetSoundVolume', payload);
        return true;
    }

    /**
     * Get verification mode
     * 
     * @returns {Promise<number>} Verification mode number
     */
    async getVerifyMode() {
        const result = await this._sendRequest('GetVerifyMode');
        return result.verify_mode;
    }

    /**
     * Set verification mode
     * 
     * @param {number} mode - Verification mode (0-15, see protocol documentation)
     * @returns {Promise<boolean>} True if successful
     */
    async setVerifyMode(mode) {
        if (mode < 0 || mode > 15) {
            throw new Error('Verify mode must be between 0 and 15');
        }

        const payload = { verify_mode: mode };
        await this._sendRequest('SetVerifyMode', payload);
        return true;
    }

    // Device Control Commands

    /**
     * Execute device control commands
     * 
     * @param {string} action - Control action ("ClearAttendLog", "ClearAdminLog", "ClearUsers", "ClearAdmins", "ClearAllData")
     * @returns {Promise<boolean>} True if successful
     */
    async deviceControl(action) {
        const validActions = ['ClearAttendLog', 'ClearAdminLog', 'ClearUsers', 'ClearAdmins', 'ClearAllData'];
        if (!validActions.includes(action)) {
            throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
        }

        const payload = { Action: action };
        await this._sendRequest('DeviceControl', payload);
        return true;
    }
}

module.exports = {
    BiometricDeviceMiddleware,
    BiometricDeviceError
};
