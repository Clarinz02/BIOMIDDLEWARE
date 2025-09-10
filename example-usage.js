#!/usr/bin/env node
/**
 * Biometric Device Middleware - Node.js Example Usage
 * 
 * This script demonstrates how to use the BiometricDeviceMiddleware to interact
 * with biometric devices using the specified protocol.
 */

const { BiometricDeviceMiddleware, BiometricDeviceError } = require('./biometric-middleware');

async function main() {
    // Initialize the middleware
    const deviceIp = '192.168.1.100';  // Replace with your device IP
    const apiKey = 'your_api_key';     // Replace with your API key (if configured)
    
    // Create middleware instance
    const device = new BiometricDeviceMiddleware(deviceIp, apiKey);
    
    console.log('=== Biometric Device Middleware Demo ===\n');
    
    try {
        // 1. Get device information
        console.log('1. Getting device information...');
        const deviceInfo = await device.getVersionInfo();
        console.log(`   Firmware version: ${deviceInfo.firmware_version}`);
        console.log(`   Face algorithm: ${deviceInfo.face_algorithm_version || 'N/A'}`);
        console.log(`   Fingerprint algorithm: ${deviceInfo.fp_algorithm_version || 'N/A'}`);
        
        // Get device capabilities
        const capabilities = await device.getDeviceCapabilities();
        console.log(`   Capabilities:`, capabilities);
        
        // Get device usage
        const usage = await device.getCurrentUsage();
        console.log(`   Current usage:`, usage);
        
        console.log();
        
        // 2. Time synchronization
        console.log('2. Time synchronization...');
        const currentTime = await device.getDeviceTime();
        console.log(`   Current device time: ${currentTime}`);
        
        // Set device time to current system time
        await device.setDeviceTime();
        const newTime = await device.getDeviceTime();
        console.log(`   Updated device time: ${newTime}`);
        console.log();
        
        // 3. User management
        console.log('3. User management...');
        
        // Get all user IDs
        const userIds = await device.getAllUserIds();
        console.log(`   Found ${userIds.length} users: ${userIds.slice(0, 10)}`);  // Show first 10
        
        // Create a test user
        const testUserId = '999';
        console.log(`   Creating test user with ID: ${testUserId}`);
        await device.setUserInfo({
            id: testUserId,
            name: 'Test User',
            department: 'Engineering',
            privilege: 'user',
            password: '12345'
        });
        
        // Get user information
        const userInfo = await device.getUserInfo(testUserId);
        console.log(`   Test user info:`, userInfo);
        console.log();
        
        // 4. Device settings
        console.log('4. Device settings...');
        
        // Get and display current volume
        const volume = await device.getSoundVolume();
        console.log(`   Current sound volume: ${volume}`);
        
        // Get verify mode
        const verifyMode = await device.getVerifyMode();
        console.log(`   Current verify mode: ${verifyMode}`);
        
        console.log();
        
        // 5. Biometric enrollment demo (face)
        console.log('5. Biometric enrollment demo...');
        
        // Lock device before enrollment to prevent interference
        console.log('   Locking device for enrollment...');
        await device.lockDevice(true);
        
        try {
            // Start face enrollment
            console.log('   Starting face enrollment...');
            console.log('   Please look at the device camera when prompted...');
            
            const jobId = await device.beginEnrollFace();
            console.log(`   Enrollment job started with ID: ${jobId}`);
            
            // Wait for enrollment completion (with timeout)
            console.log('   Waiting for enrollment completion...');
            try {
                const result = await device.waitForEnrollmentCompletion(jobId, 30000);
                console.log(`   Enrollment successful! Face data length: ${result.face_data?.length || 0}`);
                
                // Update user with face data
                await device.setUserInfo({
                    id: testUserId,
                    faceData: result.face_data
                });
                console.log('   User updated with face data');
                
            } catch (enrollmentError) {
                console.log(`   Enrollment failed or timed out: ${enrollmentError.message}`);
            }
            
        } finally {
            // Always unlock device
            await device.lockDevice(false);
            console.log('   Device unlocked');
        }
        
        console.log();
        
        // 6. Attendance log management
        console.log('6. Attendance log management...');
        
        // Get recent attendance logs
        const logs = await device.getAttendLog();
        console.log(`   Retrieved ${logs.logs?.length || 0} attendance records`);
        
        // Show first few logs
        const logEntries = logs.logs || [];
        for (let i = 0; i < Math.min(3, logEntries.length); i++) {
            const log = logEntries[i];
            console.log(`   Log ${i + 1}: User ${log.user_id} at ${log.time} via ${log.mode}`);
        }
        
        console.log();
        
        // 7. Network configuration info
        console.log('7. Network configuration...');
        const networkConfig = await device.getNetworkConfig();
        
        if (networkConfig.ethernet) {
            const ethConfig = networkConfig.ethernet;
            const running = ethConfig.running || {};
            console.log(`   Ethernet IP: ${running.address}`);
        }
        
        if (networkConfig.wlan) {
            const wlanConfig = networkConfig.wlan;
            const running = wlanConfig.running || {};
            console.log(`   WiFi IP: ${running.address}`);
        }
        
        console.log();
        
        // 8. Clean up test user
        console.log('8. Cleaning up...');
        try {
            await device.deleteUserInfo(testUserId);
            console.log(`   Test user ${testUserId} deleted`);
        } catch (deleteError) {
            console.log(`   Test user ${testUserId} not found (already deleted?)`);
        }
        
    } catch (error) {
        if (error instanceof BiometricDeviceError) {
            console.error(`Error communicating with device: ${error.message}`);
            if (error.errorCode) {
                console.error(`Error code: ${error.errorCode}`);
            }
        } else {
            console.error(`Unexpected error: ${error.message}`);
        }
    }
    
    console.log('\n=== Demo completed ===');
}

async function demoPhotoToFace() {
    /**
     * Demonstrate photo to face data conversion
     */
    console.log('\n=== Photo to Face Data Demo ===');
    
    const deviceIp = '192.168.1.100';  // Replace with your device IP
    const device = new BiometricDeviceMiddleware(deviceIp);
    
    // This is a placeholder - you would load an actual base64-encoded JPG image
    // const photoBase64 = await loadPhotoAsBase64('path/to/photo.jpg');
    
    console.log('Note: This demo requires a base64-encoded JPG photo.');
    console.log('To use this feature, uncomment and modify the code above.');
    
    // Example usage:
    // try {
    //     const result = await device.photoToFaceData(photoBase64);
    //     if (result.state === 'succeeded') {
    //         const faceData = result.face_data;
    //         console.log(`Face data extracted successfully! Length: ${faceData.length}`);
    //         // You can now use this faceData with setUserInfo
    //     } else {
    //         console.log(`Photo conversion failed: ${result.state}`);
    //     }
    // } catch (error) {
    //     console.error(`Error: ${error.message}`);
    // }
}

async function demoAttendanceUploader() {
    /**
     * Demonstrate automatic attendance log uploading
     */
    console.log('\n=== Attendance Uploader Demo ===');
    
    const deviceIp = '192.168.1.100';  // Replace with your device IP
    const device = new BiometricDeviceMiddleware(deviceIp);
    
    try {
        // Configure attendance log uploader
        const targetUri = 'http://your-server.com/attendance';  // Replace with your server
        const interval = 300;  // 5 minutes
        
        console.log(`Configuring attendance uploader to ${targetUri} every ${interval} seconds...`);
        await device.configAttendLogUploader(targetUri, interval);
        
        // Check uploader status
        const status = await device.getAttendLogUploaderStatus();
        console.log('Uploader status:', status);
        
    } catch (error) {
        console.error(`Error configuring uploader: ${error.message}`);
    }
}

async function demoAdvancedUserManagement() {
    /**
     * Demonstrate advanced user management features
     */
    console.log('\n=== Advanced User Management Demo ===');
    
    const deviceIp = '192.168.1.100';
    const device = new BiometricDeviceMiddleware(deviceIp);
    
    try {
        // Get device capacity limits
        const limits = await device.getCapacityLimit();
        console.log('Device capacity limits:', limits);
        
        // Get current usage
        const usage = await device.getCurrentUsage();
        console.log('Current usage:', usage);
        
        // Calculate remaining capacity
        console.log('\nRemaining capacity:');
        if (limits.max_user && usage.user_count) {
            console.log(`   Users: ${limits.max_user - usage.user_count} remaining`);
        }
        if (limits.max_face && usage.face_count) {
            console.log(`   Faces: ${limits.max_face - usage.face_count} remaining`);
        }
        if (limits.max_fp && usage.fp_count) {
            console.log(`   Fingerprints: ${limits.max_fp - usage.fp_count} remaining`);
        }
        
        // Demonstrate batch user operations
        console.log('\nBatch user operations...');
        const userIds = await device.getAllUserIds();
        console.log(`Processing ${userIds.length} users...`);
        
        // You could process users in batches here
        for (let i = 0; i < Math.min(3, userIds.length); i++) {
            const userId = userIds[i];
            const userInfo = await device.getUserInfo(userId);
            console.log(`   User ${userId}: ${userInfo.name} (${userInfo.privilege})`);
        }
        
    } catch (error) {
        console.error(`Error in advanced user management demo: ${error.message}`);
    }
}

// Helper function to load photo as base64 (example implementation)
async function loadPhotoAsBase64(imagePath) {
    const fs = require('fs').promises;
    try {
        const imageBuffer = await fs.readFile(imagePath);
        return imageBuffer.toString('base64');
    } catch (error) {
        throw new Error(`Failed to load image: ${error.message}`);
    }
}

// Main execution
if (require.main === module) {
    // Run main demo
    main()
        .then(() => {
            console.log('\nAll demos completed successfully!');
        })
        .catch((error) => {
            console.error('Demo failed:', error.message);
            process.exit(1);
        });
    
    // Uncomment to run additional demos
    // demoPhotoToFace();
    // demoAttendanceUploader();
    // demoAdvancedUserManagement();
}

module.exports = {
    main,
    demoPhotoToFace,
    demoAttendanceUploader,
    demoAdvancedUserManagement,
    loadPhotoAsBase64
};
