#!/usr/bin/env python3
"""
Biometric Device Middleware - Example Usage

This script demonstrates how to use the BiometricDeviceMiddleware to interact
with biometric devices using the specified protocol.
"""

import time
from datetime import datetime
from biometric_middleware import BiometricDeviceMiddleware, BiometricDeviceError


def main():
    # Initialize the middleware
    device_ip = "192.168.1.100"  # Replace with your device IP
    api_key = "your_api_key"     # Replace with your API key (if configured)
    
    # Create middleware instance
    device = BiometricDeviceMiddleware(device_ip, api_key=api_key)
    
    print("=== Biometric Device Middleware Demo ===\n")
    
    try:
        # 1. Get device information
        print("1. Getting device information...")
        device_info = device.get_version_info()
        print(f"   Firmware version: {device_info.get('firmware_version')}")
        print(f"   Face algorithm: {device_info.get('face_algorithm_version', 'N/A')}")
        print(f"   Fingerprint algorithm: {device_info.get('fp_algorithm_version', 'N/A')}")
        
        # Get device capabilities
        capabilities = device.get_device_capabilities()
        print(f"   Capabilities: {capabilities}")
        
        # Get device usage
        usage = device.get_current_usage()
        print(f"   Current usage: {usage}")
        
        print()
        
        # 2. Time synchronization
        print("2. Time synchronization...")
        current_time = device.get_device_time()
        print(f"   Current device time: {current_time}")
        
        # Set device time to current system time
        device.set_device_time()
        new_time = device.get_device_time()
        print(f"   Updated device time: {new_time}")
        print()
        
        # 3. User management
        print("3. User management...")
        
        # Get all user IDs
        user_ids = device.get_all_user_ids()
        print(f"   Found {len(user_ids)} users: {user_ids[:10]}")  # Show first 10
        
        # Create a test user
        test_user_id = "999"
        print(f"   Creating test user with ID: {test_user_id}")
        device.set_user_info(
            user_id=test_user_id,
            name="Test User",
            department="Engineering",
            privilege="user",
            password="12345"
        )
        
        # Get user information
        user_info = device.get_user_info(test_user_id)
        print(f"   Test user info: {user_info}")
        print()
        
        # 4. Device settings
        print("4. Device settings...")
        
        # Get and display current volume
        volume = device.get_sound_volume()
        print(f"   Current sound volume: {volume}")
        
        # Get verify mode
        verify_mode = device.get_verify_mode()
        print(f"   Current verify mode: {verify_mode}")
        
        print()
        
        # 5. Biometric enrollment demo (face)
        print("5. Biometric enrollment demo...")
        
        # Lock device before enrollment to prevent interference
        print("   Locking device for enrollment...")
        device.lock_device(True)
        
        try:
            # Start face enrollment
            print("   Starting face enrollment...")
            print("   Please look at the device camera when prompted...")
            
            job_id = device.begin_enroll_face()
            print(f"   Enrollment job started with ID: {job_id}")
            
            # Wait for enrollment completion (with timeout)
            print("   Waiting for enrollment completion...")
            try:
                result = device.wait_for_enrollment_completion(job_id, timeout=30)
                print(f"   Enrollment successful! Face data length: {len(result.get('face_data', ''))}")
                
                # Update user with face data
                device.set_user_info(test_user_id, face_data=result.get('face_data'))
                print("   User updated with face data")
                
            except BiometricDeviceError as e:
                print(f"   Enrollment failed or timed out: {e}")
                
        finally:
            # Always unlock device
            device.lock_device(False)
            print("   Device unlocked")
        
        print()
        
        # 6. Attendance log management
        print("6. Attendance log management...")
        
        # Get recent attendance logs
        logs = device.get_attend_log()
        print(f"   Retrieved {len(logs.get('logs', []))} attendance records")
        
        # Show first few logs
        for i, log in enumerate(logs.get('logs', [])[:3]):
            print(f"   Log {i+1}: User {log.get('user_id')} at {log.get('time')} via {log.get('mode')}")
        
        print()
        
        # 7. Network configuration info
        print("7. Network configuration...")
        network_config = device.get_network_config()
        
        if 'ethernet' in network_config:
            eth_config = network_config['ethernet']
            running = eth_config.get('running', {})
            print(f"   Ethernet IP: {running.get('address')}")
            
        if 'wlan' in network_config:
            wlan_config = network_config['wlan']
            running = wlan_config.get('running', {})
            print(f"   WiFi IP: {running.get('address')}")
        
        print()
        
        # 8. Clean up test user
        print("8. Cleaning up...")
        try:
            device.delete_user_info(test_user_id)
            print(f"   Test user {test_user_id} deleted")
        except BiometricDeviceError:
            print(f"   Test user {test_user_id} not found (already deleted?)")
            
    except BiometricDeviceError as e:
        print(f"Error communicating with device: {e}")
        if hasattr(e, 'error_code'):
            print(f"Error code: {e.error_code}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    
    print("\n=== Demo completed ===")


def demo_photo_to_face():
    """
    Demonstrate photo to face data conversion
    """
    print("\n=== Photo to Face Data Demo ===")
    
    device_ip = "192.168.1.100"  # Replace with your device IP
    device = BiometricDeviceMiddleware(device_ip)
    
    # This is a placeholder - you would load an actual base64-encoded JPG image
    # photo_base64 = load_photo_as_base64("path/to/photo.jpg")
    
    print("Note: This demo requires a base64-encoded JPG photo.")
    print("To use this feature, uncomment and modify the code above.")
    
    # Example usage:
    # try:
    #     result = device.photo_to_face_data(photo_base64)
    #     if result.get('state') == 'succeeded':
    #         face_data = result.get('face_data')
    #         print(f"Face data extracted successfully! Length: {len(face_data)}")
    #         # You can now use this face_data with set_user_info
    #     else:
    #         print(f"Photo conversion failed: {result.get('state')}")
    # except BiometricDeviceError as e:
    #     print(f"Error: {e}")


def demo_attendance_uploader():
    """
    Demonstrate automatic attendance log uploading
    """
    print("\n=== Attendance Uploader Demo ===")
    
    device_ip = "192.168.1.100"  # Replace with your device IP
    device = BiometricDeviceMiddleware(device_ip)
    
    try:
        # Configure attendance log uploader
        target_uri = "http://your-server.com/attendance"  # Replace with your server
        interval = 300  # 5 minutes
        
        print(f"Configuring attendance uploader to {target_uri} every {interval} seconds...")
        device.config_attend_log_uploader(target_uri, interval)
        
        # Check uploader status
        status = device.get_attend_log_uploader_status()
        print(f"Uploader status: {status}")
        
    except BiometricDeviceError as e:
        print(f"Error configuring uploader: {e}")


if __name__ == "__main__":
    # Run main demo
    main()
    
    # Uncomment to run additional demos
    # demo_photo_to_face()
    # demo_attendance_uploader()
