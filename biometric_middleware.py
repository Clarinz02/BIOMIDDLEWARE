"""
Biometric Device Middleware

A Python middleware for communicating with biometric devices using the specified HTTP/HTTPS JSON protocol.
Supports user management, attendance records, device configuration, and biometric enrollment.
"""

import json
import requests
import time
import uuid
from typing import Optional, Dict, List, Any, Union
from datetime import datetime
import base64


class BiometricDeviceError(Exception):
    """Custom exception for biometric device errors"""
    def __init__(self, message: str, error_code: str = None, arguments: List = None):
        self.error_code = error_code
        self.arguments = arguments
        super().__init__(message)


class BiometricDeviceMiddleware:
    """
    Middleware for communicating with biometric devices
    """
    
    def __init__(self, device_ip: str, api_key: Optional[str] = None, use_https: bool = False, timeout: int = 30):
        """
        Initialize the middleware
        
        Args:
            device_ip: IP address or hostname of the device
            api_key: API key for authentication (optional)
            use_https: Whether to use HTTPS instead of HTTP
            timeout: Request timeout in seconds
        """
        self.device_ip = device_ip
        self.api_key = api_key
        self.use_https = use_https
        self.timeout = timeout
        
        # Configure session
        self.session = requests.Session()
        self.session.timeout = timeout
        
        # Disable SSL verification for self-signed certificates (can be enabled if needed)
        if use_https:
            self.session.verify = False
            requests.packages.urllib3.disable_warnings()
    
    def _get_base_url(self) -> str:
        """Get the base URL for API requests"""
        protocol = "https" if self.use_https else "http"
        url = f"{protocol}://{self.device_ip}/control"
        if self.api_key:
            url += f"?api_key={self.api_key}"
        return url
    
    def _generate_message_id(self) -> str:
        """Generate a unique message ID"""
        return str(uuid.uuid4())[:8]
    
    def _send_request(self, command: str, payload: Dict = None) -> Dict:
        """
        Send a request to the device
        
        Args:
            command: Command to send
            payload: Command payload
            
        Returns:
            Response payload
            
        Raises:
            BiometricDeviceError: If the request fails or device returns an error
        """
        if payload is None:
            payload = {}
            
        message_id = self._generate_message_id()
        request_data = {
            "mid": message_id,
            "cmd": command,
            "payload": payload
        }
        
        try:
            response = self.session.post(
                self._get_base_url(),
                json=request_data,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
            
            response_data = response.json()
            
            # Check if message IDs match
            if response_data.get("mid") != message_id:
                raise BiometricDeviceError("Message ID mismatch in response")
            
            # Check for errors
            if response_data.get("result") == "Error":
                error_payload = response_data.get("payload", {})
                error_code = error_payload.get("code", "unknown_error")
                arguments = error_payload.get("arguments", [])
                raise BiometricDeviceError(
                    f"Device error: {error_code}",
                    error_code=error_code,
                    arguments=arguments
                )
            
            return response_data.get("payload", {})
            
        except requests.RequestException as e:
            raise BiometricDeviceError(f"Request failed: {str(e)}")
        except json.JSONDecodeError as e:
            raise BiometricDeviceError(f"Invalid JSON response: {str(e)}")
    
    # Security Configuration
    def set_security_config(self, api_key: str = None, enable_http: bool = True, 
                          enable_https: bool = False, validate_certificate: bool = True,
                          ca_cert: str = None, device_cert: str = None, device_key: str = None) -> bool:
        """
        Configure device security settings
        
        Args:
            api_key: API key for authentication
            enable_http: Enable HTTP interface
            enable_https: Enable HTTPS interface
            validate_certificate: Validate server certificates
            ca_cert: PEM-encoded CA certificate
            device_cert: PEM-encoded device certificate
            device_key: PEM-encoded private key
            
        Returns:
            True if successful
        """
        payload = {
            "enable_http": "yes" if enable_http else "no"
        }
        
        if api_key:
            payload["api_key"] = api_key
            
        tls_conf = {
            "enabled": "yes" if enable_https else "no",
            "validate_certificate": "yes" if validate_certificate else "no"
        }
        
        if ca_cert:
            tls_conf["ca_cert"] = ca_cert
        if device_cert:
            tls_conf["device_cert"] = device_cert
        if device_key:
            tls_conf["device_key"] = device_key
            
        payload["tls_conf"] = tls_conf
        
        self._send_request("SetSecurityConfig", payload)
        
        # Update local api_key if provided
        if api_key:
            self.api_key = api_key
            
        return True
    
    # User Management Methods
    def get_user_id_list(self, start_pos: int = None) -> Dict[str, Any]:
        """
        Get list of user IDs
        
        Args:
            start_pos: Starting position for pagination (optional)
            
        Returns:
            Dictionary containing user_id list and next_page_pos (if applicable)
        """
        payload = {}
        if start_pos is not None:
            payload["start_pos"] = start_pos
            
        return self._send_request("GetUserIdList", payload)
    
    def get_all_user_ids(self) -> List[str]:
        """
        Get all user IDs by handling pagination automatically
        
        Returns:
            Complete list of user IDs
        """
        all_user_ids = []
        start_pos = None
        
        while True:
            result = self.get_user_id_list(start_pos)
            user_ids = result.get("user_id", [])
            all_user_ids.extend(user_ids)
            
            next_page_pos = result.get("next_page_pos")
            if next_page_pos is None:
                break
            start_pos = next_page_pos
            
        return all_user_ids
    
    def get_user_info(self, user_id: str) -> Dict[str, Any]:
        """
        Get user information
        
        Args:
            user_id: User ID to retrieve information for
            
        Returns:
            User information dictionary
        """
        payload = {"id": user_id}
        return self._send_request("GetUserInfo", payload)
    
    def set_user_info(self, user_id: str, name: str = None, department: str = None,
                     privilege: str = None, password: str = None, card: str = None,
                     fingerprint_data: List[str] = None, face_data: str = None,
                     palm_data: List[str] = None) -> bool:
        """
        Set user information (create or update user)
        
        Args:
            user_id: User ID
            name: User name
            department: User department
            privilege: User privilege ("user", "manager", "admin")
            password: User password
            card: Card number
            fingerprint_data: List of base64-encoded fingerprint templates
            face_data: Base64-encoded face template
            palm_data: List of base64-encoded palm templates
            
        Returns:
            True if successful
        """
        payload = {"id": user_id}
        
        if name is not None:
            payload["name"] = name
        if department is not None:
            payload["depart"] = department
        if privilege is not None:
            payload["privilege"] = privilege
        if password is not None:
            payload["password"] = password
        if card is not None:
            payload["card"] = card
        if fingerprint_data is not None:
            payload["fp"] = fingerprint_data
        if face_data is not None:
            payload["face"] = face_data
        if palm_data is not None:
            payload["palm"] = palm_data
            
        self._send_request("SetUserInfo", payload)
        return True
    
    def delete_user_info(self, user_id: str) -> bool:
        """
        Delete a user
        
        Args:
            user_id: User ID to delete
            
        Returns:
            True if successful
        """
        payload = {"id": user_id}
        self._send_request("DeleteUserInfo", payload)
        return True
    
    # Device Control Methods
    def lock_device(self, is_locked: bool) -> bool:
        """
        Lock or unlock the device
        
        Args:
            is_locked: True to lock device, False to unlock
            
        Returns:
            True if successful
        """
        payload = {"is_locked": "yes" if is_locked else "no"}
        self._send_request("LockDevice", payload)
        return True
    
    # Biometric Enrollment Methods
    def begin_enroll_face(self) -> int:
        """
        Start face enrollment process
        
        Returns:
            Job ID for tracking enrollment status
        """
        result = self._send_request("BeginEnrollFace")
        return result.get("job_id")
    
    def begin_enroll_fingerprint(self) -> int:
        """
        Start fingerprint enrollment process
        
        Returns:
            Job ID for tracking enrollment status
        """
        result = self._send_request("BeginEnrollFp")
        return result.get("job_id")
    
    def begin_enroll_card(self) -> int:
        """
        Start card enrollment process
        
        Returns:
            Job ID for tracking enrollment status
        """
        result = self._send_request("BeginEnrollCard")
        return result.get("job_id")
    
    def begin_enroll_palm(self) -> int:
        """
        Start palm enrollment process
        
        Returns:
            Job ID for tracking enrollment status
        """
        result = self._send_request("BeginEnrollPalm")
        return result.get("job_id")
    
    def query_job_status(self, job_id: int) -> Dict[str, Any]:
        """
        Query the status of an enrollment job
        
        Args:
            job_id: Job ID returned from enrollment start methods
            
        Returns:
            Job status dictionary containing state and data (if completed)
        """
        payload = {"job_id": job_id}
        return self._send_request("QueryJobStatus", payload)
    
    def cancel_job(self, job_id: int) -> bool:
        """
        Cancel a specific enrollment job
        
        Args:
            job_id: Job ID to cancel
            
        Returns:
            True if successful
        """
        payload = {"job_id": job_id}
        self._send_request("CancelJob", payload)
        return True
    
    def cancel_all_jobs(self) -> bool:
        """
        Cancel all active enrollment jobs
        
        Returns:
            True if successful
        """
        self._send_request("CancelAllJobs")
        return True
    
    def photo_to_face_data(self, photo_base64: str) -> Dict[str, Any]:
        """
        Convert a photo to face template data
        
        Args:
            photo_base64: Base64-encoded JPG photo data
            
        Returns:
            Dictionary with conversion status and face_data (if successful)
        """
        payload = {"photo": photo_base64}
        return self._send_request("PhotoToFacedata", payload)
    
    def wait_for_enrollment_completion(self, job_id: int, timeout: int = 60, 
                                     poll_interval: float = 1.0) -> Dict[str, Any]:
        """
        Wait for an enrollment job to complete
        
        Args:
            job_id: Job ID to wait for
            timeout: Maximum time to wait in seconds
            poll_interval: Time between status checks in seconds
            
        Returns:
            Final job status dictionary
            
        Raises:
            BiometricDeviceError: If enrollment fails or times out
        """
        start_time = time.time()
        
        while True:
            status = self.query_job_status(job_id)
            state = status.get("state")
            
            if state == "succeeded":
                return status
            elif state == "failed":
                raise BiometricDeviceError("Enrollment job failed")
            elif state == "pending":
                if time.time() - start_time > timeout:
                    raise BiometricDeviceError("Enrollment job timed out")
                time.sleep(poll_interval)
            else:
                raise BiometricDeviceError(f"Unknown job state: {state}")
    
    # Attendance Record Management
    def get_attend_log(self, start_pos: int = None) -> Dict[str, Any]:
        """
        Get attendance logs
        
        Args:
            start_pos: Starting position for pagination (optional)
            
        Returns:
            Dictionary containing logs, start_pos, and next_pos (if applicable)
        """
        payload = {}
        if start_pos is not None:
            payload["start_pos"] = start_pos
            
        return self._send_request("GetAttendLog", payload)
    
    def get_all_attend_logs(self) -> List[Dict[str, Any]]:
        """
        Get all attendance logs by handling pagination automatically
        
        Returns:
            Complete list of attendance log entries
        """
        all_logs = []
        start_pos = None
        
        while True:
            result = self.get_attend_log(start_pos)
            logs = result.get("logs", [])
            all_logs.extend(logs)
            
            next_pos = result.get("next_pos")
            if next_pos is None:
                break
            start_pos = next_pos
            
        return all_logs
    
    def erase_attend_log(self, end_pos: int) -> bool:
        """
        Clear attendance records up to the specified position
        
        Args:
            end_pos: All records before this position will be deleted
            
        Returns:
            True if successful
        """
        payload = {"end_pos": end_pos}
        self._send_request("EraseAttendLog", payload)
        return True
    
    def config_attend_log_uploader(self, target_uri: str, interval: int) -> bool:
        """
        Configure automatic attendance log uploading
        
        Args:
            target_uri: Service address for uploading attendance records
            interval: Upload interval in seconds (5-3600)
            
        Returns:
            True if successful
        """
        if not 5 <= interval <= 3600:
            raise ValueError("Interval must be between 5 and 3600 seconds")
            
        payload = {
            "target_uri": target_uri,
            "interval": interval
        }
        self._send_request("ConfigAttendLogUploader", payload)
        return True
    
    def get_attend_log_uploader_status(self) -> Dict[str, Any]:
        """
        Get attendance log uploader status
        
        Returns:
            Dictionary containing status and pending_count
        """
        return self._send_request("GetAttendLogUploaderStatus")
    
    # Time Synchronization
    def get_device_time(self) -> str:
        """
        Get device time
        
        Returns:
            Current device time in ISO8601 format
        """
        result = self._send_request("GetDeviceTime")
        return result.get("time")
    
    def set_device_time(self, time_iso: str = None) -> bool:
        """
        Set device time
        
        Args:
            time_iso: Time in ISO8601 format (if None, uses current system time)
            
        Returns:
            True if successful
        """
        if time_iso is None:
            time_iso = datetime.now().isoformat()
            
        payload = {"time": time_iso}
        self._send_request("SetDeviceTime", payload)
        return True
    
    # Device Network Configuration
    def get_network_config(self) -> Dict[str, Any]:
        """
        Get device network configuration
        
        Returns:
            Network configuration dictionary
        """
        return self._send_request("GetNetworkConfig")
    
    def set_network_config(self, ethernet_config: Dict = None, wlan_config: Dict = None) -> bool:
        """
        Set device network configuration
        
        Args:
            ethernet_config: Ethernet configuration dictionary
            wlan_config: WLAN configuration dictionary
            
        Returns:
            True if successful
        """
        payload = {}
        
        if ethernet_config:
            payload["ethernet"] = ethernet_config
        if wlan_config:
            payload["wlan"] = wlan_config
            
        self._send_request("SetNetworkConfig", payload)
        return True
    
    # Device Information and Settings
    def get_version_info(self) -> Dict[str, str]:
        """
        Get device version information
        
        Returns:
            Dictionary containing firmware and algorithm versions
        """
        return self._send_request("GetVersionInfo")
    
    def get_capacity_limit(self) -> Dict[str, int]:
        """
        Get device capacity limits
        
        Returns:
            Dictionary containing maximum counts for users, faces, etc.
        """
        return self._send_request("GetCapacityLimit")
    
    def get_current_usage(self) -> Dict[str, int]:
        """
        Get current device usage statistics
        
        Returns:
            Dictionary containing current counts for users, faces, etc.
        """
        return self._send_request("GetCurrentUsage")
    
    def get_device_uid(self) -> str:
        """
        Get device unique ID
        
        Returns:
            Device UID as hexadecimal string
        """
        result = self._send_request("GetDeviceUid")
        return result.get("device_uid")
    
    def get_device_capabilities(self) -> Dict[str, bool]:
        """
        Get device capabilities
        
        Returns:
            Dictionary showing which features are supported
        """
        return self._send_request("GetDeviceCapabilities")
    
    def get_device_id(self) -> int:
        """
        Get device ID
        
        Returns:
            Device ID (1-255)
        """
        result = self._send_request("GetDeviceId")
        return result.get("device_id")
    
    def set_device_id(self, device_id: int) -> bool:
        """
        Set device ID
        
        Args:
            device_id: Device ID (1-255)
            
        Returns:
            True if successful
        """
        if not 1 <= device_id <= 255:
            raise ValueError("Device ID must be between 1 and 255")
            
        payload = {"device_id": device_id}
        self._send_request("SetDeviceId", payload)
        return True
    
    def get_sound_volume(self) -> int:
        """
        Get device sound volume
        
        Returns:
            Sound volume (1-10)
        """
        result = self._send_request("GetSoundVolume")
        return result.get("sound_volume")
    
    def set_sound_volume(self, volume: int) -> bool:
        """
        Set device sound volume
        
        Args:
            volume: Sound volume (1-10)
            
        Returns:
            True if successful
        """
        if not 1 <= volume <= 10:
            raise ValueError("Sound volume must be between 1 and 10")
            
        payload = {"sound_volume": volume}
        self._send_request("SetSoundVolume", payload)
        return True
    
    def get_verify_mode(self) -> int:
        """
        Get verification mode
        
        Returns:
            Verification mode number
        """
        result = self._send_request("GetVerifyMode")
        return result.get("verify_mode")
    
    def set_verify_mode(self, mode: int) -> bool:
        """
        Set verification mode
        
        Args:
            mode: Verification mode (0-15, see protocol documentation)
            
        Returns:
            True if successful
        """
        if not 0 <= mode <= 15:
            raise ValueError("Verify mode must be between 0 and 15")
            
        payload = {"verify_mode": mode}
        self._send_request("SetVerifyMode", payload)
        return True
    
    # Device Control Commands
    def device_control(self, action: str) -> bool:
        """
        Execute device control commands
        
        Args:
            action: Control action ("ClearAttendLog", "ClearAdminLog", "ClearUsers", 
                   "ClearAdmins", "ClearAllData")
                   
        Returns:
            True if successful
        """
        valid_actions = ["ClearAttendLog", "ClearAdminLog", "ClearUsers", 
                        "ClearAdmins", "ClearAllData"]
        if action not in valid_actions:
            raise ValueError(f"Invalid action. Must be one of: {valid_actions}")
            
        payload = {"Action": action}
        self._send_request("DeviceControl", payload)
        return True
