class DeviceSyncService {
    constructor(databaseService, deviceManager) {
        this.db = databaseService;
        this.deviceManager = deviceManager;
        this.syncInProgress = new Set();
        this.autoSyncInterval = 60000; // 1 minute
        this.syncIntervals = new Map();
    }

    async init() {
        console.log('🔄 Device Sync Service initialized');
        
        // Start monitoring for connected devices
        this.startAutoSync();
    }

    async onDeviceConnected(deviceId) {
        try {
            // Perform initial sync when device connects
            await this.syncDevice(deviceId);
            
            // Start periodic sync for this device
            this.startDeviceSync(deviceId);
        } catch (error) {
            console.error(`❌ Error handling device connection ${deviceId}:`, error.message);
        }
    }

    onDeviceDisconnected(deviceId) {
        // Stop periodic sync for disconnected device
        this.stopDeviceSync(deviceId);
    }

    async syncDevice(deviceId, options = {}) {
        if (this.syncInProgress.has(deviceId)) {
            console.log(`⚠️ Sync already in progress for device: ${deviceId}`);
            return;
        }

        this.syncInProgress.add(deviceId);
        
        try {
            console.log(`🔄 Starting sync for device: ${deviceId}`);
            
            const device = this.deviceManager.getDevice(deviceId);
            if (!device || !device.connected) {
                console.log(`⚠️ Device not connected: ${deviceId}`);
                return;
            }

            const syncStartTime = new Date().toISOString();
            let syncStats = {
                usersProcessed: 0,
                attendanceProcessed: 0,
                errors: 0
            };

            // Get previous sync info
            const lastSync = await this.db.getDeviceSync(deviceId);
            const lastUserCount = lastSync?.last_user_count || 0;
            const lastAttendanceCount = lastSync?.last_attendance_count || 0;

            try {
                // Sync users from device
                const users = await device.getUsers(0, 1000); // Get all users
                console.log(`📋 Found ${users.length} users on device ${deviceId}`);

                for (const user of users) {
                    try {
                        // Sync biometric user to database
                        await this.db.syncBiometricUser(user, deviceId);
                        
                        // Check if employee record exists, create if not
                        const existingEmployee = await this.db.getEmployee(user.uid || user.id);
                        if (!existingEmployee) {
                            // Create employee record from biometric user
                            await this.db.createEmployee({
                                id: user.uid || user.id,
                                userId: user.uid || user.id,
                                name: user.name,
                                position: 'Employee',
                                department: 'General',
                                branch: deviceId.includes('main') ? 'main' : 
                                       deviceId.includes('warehouse') ? 'warehouse' :
                                       deviceId.includes('security') ? 'security' : 'main',
                                hireDate: new Date().toISOString().split('T')[0],
                                status: 'active',
                                email: '',
                                phone: '',
                                address: '',
                                emergencyContact: '',
                                salary: 0
                            });
                            console.log(`➕ Created employee record for: ${user.name} (${user.uid || user.id})`);
                        } else {
                            // Update existing employee with biometric data
                            await this.db.updateEmployee(existingEmployee.id, {
                                name: user.name // Update name if changed
                            });
                        }
                        
                        syncStats.usersProcessed++;
                    } catch (error) {
                        console.error(`❌ Error syncing user ${user.uid || user.id}:`, error.message);
                        syncStats.errors++;
                    }
                }

                // Sync attendance logs if supported
                if (options.syncAttendance !== false) {
                    try {
                        // Get recent attendance logs (last 7 days)
                        const endDate = new Date();
                        const startDate = new Date();
                        startDate.setDate(startDate.getDate() - 7);
                        
                        const attendanceLogs = await device.getAttendanceLogs(
                            startDate.toISOString().split('T')[0],
                            endDate.toISOString().split('T')[0],
                            0, // position
                            1000 // count
                        );

                        console.log(`📊 Found ${attendanceLogs.length} attendance logs on device ${deviceId}`);

                        for (const log of attendanceLogs) {
                            try {
                                // Check if log already exists to avoid duplicates
                                const existingLogs = await this.db.getAttendanceLogs({
                                    employeeId: log.userSn || log.uid,
                                    deviceId: deviceId,
                                    startDate: log.recordTime,
                                    endDate: log.recordTime,
                                    limit: 1
                                });

                                if (existingLogs.length === 0) {
                                    await this.db.logAttendance({
                                        userId: log.userSn || log.uid,
                                        employeeId: log.userSn || log.uid,
                                        deviceId: deviceId,
                                        timestamp: log.recordTime,
                                        verificationMode: this.getVerificationModeString(log.verifyMode),
                                        inOutMode: log.inOutMode || 'unknown',
                                        workCode: log.workCode || ''
                                    });
                                    syncStats.attendanceProcessed++;
                                }
                            } catch (error) {
                                console.error(`❌ Error syncing attendance log:`, error.message);
                                syncStats.errors++;
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error syncing attendance logs from ${deviceId}:`, error.message);
                    }
                }

                // Update device sync status
                await this.db.updateDeviceSync(deviceId, {
                    lastSyncAt: syncStartTime,
                    userCount: users.length,
                    attendanceCount: syncStats.attendanceProcessed,
                    status: syncStats.errors === 0 ? 'completed' : 'completed_with_errors'
                });

                console.log(`✅ Device sync completed for ${deviceId}: ${syncStats.usersProcessed} users, ${syncStats.attendanceProcessed} attendance logs, ${syncStats.errors} errors`);
                
                return {
                    success: true,
                    deviceId,
                    syncStats,
                    syncTime: syncStartTime
                };

            } catch (error) {
                // Update sync status with error
                await this.db.updateDeviceSync(deviceId, {
                    lastSyncAt: syncStartTime,
                    userCount: 0,
                    attendanceCount: 0,
                    status: 'error'
                });
                throw error;
            }

        } catch (error) {
            console.error(`❌ Device sync failed for ${deviceId}:`, error.message);
            return {
                success: false,
                deviceId,
                error: error.message
            };
        } finally {
            this.syncInProgress.delete(deviceId);
        }
    }

    async syncAllDevices(options = {}) {
        console.log('🔄 Starting sync for all connected devices');
        
        try {
            const overview = this.deviceManager.getSystemOverview();
            const connectedDevices = overview.devices
                .filter(d => d.connected)
                .map(d => d.deviceId);
            const results = [];

            for (const deviceId of connectedDevices) {
                const result = await this.syncDevice(deviceId, options);
                results.push(result);
            }

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            console.log(`✅ Bulk sync completed: ${successful} successful, ${failed} failed`);
            return results;
        } catch (error) {
            console.error('⚠️ Error in bulk sync:', error.message);
            return [];
        }
    }

    startDeviceSync(deviceId) {
        if (this.syncIntervals.has(deviceId)) {
            return; // Already running
        }

        const interval = setInterval(async () => {
            await this.syncDevice(deviceId, { syncAttendance: true });
        }, this.autoSyncInterval);

        this.syncIntervals.set(deviceId, interval);
        console.log(`⏰ Auto-sync started for device: ${deviceId} (every ${this.autoSyncInterval/1000}s)`);
    }

    stopDeviceSync(deviceId) {
        const interval = this.syncIntervals.get(deviceId);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(deviceId);
            console.log(`⏰ Auto-sync stopped for device: ${deviceId}`);
        }
    }

    startAutoSync() {
        // Sync all connected devices periodically
        setInterval(async () => {
            try {
                const overview = this.deviceManager.getSystemOverview();
                const connectedDevices = overview.devices
                    .filter(d => d.connected)
                    .map(d => d.deviceId);
                    
                for (const deviceId of connectedDevices) {
                    if (!this.syncIntervals.has(deviceId)) {
                        this.startDeviceSync(deviceId);
                    }
                }
            } catch (error) {
                console.error('⚠️ Error in auto-sync monitoring:', error.message);
            }
        }, 30000); // Check every 30 seconds

        console.log('⏰ Auto-sync monitoring started');
    }

    async forceSyncDevice(deviceId) {
        console.log(`🔄 Force syncing device: ${deviceId}`);
        return await this.syncDevice(deviceId, { forceSync: true, syncAttendance: true });
    }

    async getSyncStatus(deviceId = null) {
        if (deviceId) {
            return await this.db.getDeviceSync(deviceId);
        } else {
            return await this.db.getAllDeviceSync();
        }
    }

    getVerificationModeString(verifyMode) {
        const modes = {
            0: 'Any',
            1: 'Fingerprint',
            2: 'Card + Fingerprint',
            3: 'Card',
            4: 'ID + Fingerprint',
            5: 'ID + Password',
            6: 'Card + Password',
            7: 'Fingerprint + Password',
            8: 'Fingerprint + Card + Password',
            9: 'Face',
            10: 'Card + Face',
            11: 'Face + Password',
            12: 'Face + Card + Password',
            13: 'Face + Fingerprint',
            14: 'Face + Fingerprint + Card',
            15: 'Face + Fingerprint + Password'
        };
        return modes[verifyMode] || 'Unknown';
    }

    async stop() {
        // Stop all sync intervals
        for (const [deviceId, interval] of this.syncIntervals) {
            clearInterval(interval);
            console.log(`⏰ Stopped auto-sync for device: ${deviceId}`);
        }
        this.syncIntervals.clear();
        console.log('🔄 Device Sync Service stopped');
    }
}

module.exports = DeviceSyncService;
