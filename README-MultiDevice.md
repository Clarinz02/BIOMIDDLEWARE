# Multi-Device Biometric Middleware System

A comprehensive web-based system for managing multiple biometric devices across different network connections and branches. Support for fingerprint scanners, face recognition systems, and other biometric devices with modern, responsive interface.

## 🌟 Key Features

### Multi-Device Support
- **Branch-Based Management**: Organize devices by branch (main, warehouse, security, etc.)
- **Multiple Network Support**: Connect devices across different WiFi networks (10.0.1.x, 192.168.1.x, 192.168.2.x, etc.)
- **Centralized Control**: Manage all devices from a single interface
- **Device Auto-Discovery**: Automatic reconnection to previously configured devices
- **Independent Operations**: Each device can be controlled separately

### Device Management
- **Real-time Status**: Live connection status for all devices
- **Remote Configuration**: Configure device settings from anywhere
- **Network Switching**: Support for devices on different WiFi connections
- **Location Tracking**: Organize devices by physical location
- **Branch Isolation**: Separate device operations by branch

### User Management
- **Cross-Device Users**: Manage users across multiple devices
- **Device-Specific Data**: User data per device for isolated systems
- **Bulk Operations**: Manage users across multiple devices simultaneously

### Biometric Operations
- **Multi-Device Enrollment**: Enroll biometrics on specific devices
- **Real-time Status**: Live enrollment progress per device
- **Cross-Device Sync**: Optional user synchronization between devices

### Attendance & Analytics
- **Branch-Specific Reports**: Attendance data per location/branch
- **Device Comparison**: Compare usage across different devices
- **Export Capabilities**: CSV export with device filtering

### Security & API Management
- **Device-Specific API Keys**: Separate authentication per device
- **Branch-Level Access Control**: Permission management by branch
- **Secure Multi-Network**: Encrypted communication across networks

## 🏗️ System Architecture

```
Multi-Device Middleware Server
├── Device Manager
│   ├── Branch Main (192.168.1.100)
│   ├── Branch Warehouse (192.168.2.100)
│   ├── Branch Security (10.0.1.50)
│   └── Branch Remote (172.16.0.100)
├── API Key Manager
├── Configuration Storage
└── Web Interface
```

## 🚀 Quick Start

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd Biomiddleware
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the server**
```bash
npm start
# or
node server.js
```

4. **Access the web interface**
Open http://localhost:3000 in your browser

### Adding Your First Device

1. **Navigate to Device Management**
   - Go to the web interface
   - Look for "Add Device" or "+" button

2. **Configure Device Settings**
   ```json
   {
     "deviceId": "branch-main",
     "name": "Main Office Scanner",
     "ip": "192.168.1.100",
     "apiKey": "device_api_key_here",
     "branch": "main",
     "location": "Main Office",
     "wifiNetwork": "OfficeWiFi"
   }
   ```

3. **Connect and Test**
   - Click "Connect" to establish connection
   - Use "Test Connection" to verify connectivity

## 📡 API Documentation

### Multi-Device Endpoints

#### Get All Devices
```http
GET /api/devices
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDevices": 3,
    "connectedDevices": 2,
    "disconnectedDevices": 1,
    "branches": ["main", "warehouse", "security"],
    "locations": ["Main Office", "Warehouse", "Security Gate"],
    "devices": [...]
  }
}
```

#### Add New Device
```http
POST /api/devices
Content-Type: application/json

{
  "deviceId": "branch-warehouse",
  "name": "Warehouse Scanner",
  "ip": "192.168.2.100",
  "apiKey": "warehouse123",
  "branch": "warehouse",
  "location": "Warehouse",
  "wifiNetwork": "WarehouseWiFi"
}
```

#### Connect to Device
```http
POST /api/devices/{deviceId}/connect
```

#### Get Device-Specific Information
```http
GET /api/devices/{deviceId}/version
GET /api/devices/{deviceId}/usage
GET /api/devices/{deviceId}/users
```

### Device-Specific Operations

All traditional biometric operations now support device selection:

#### Users Management (Per Device)
```http
GET /api/devices/{deviceId}/users
POST /api/devices/{deviceId}/users
DELETE /api/devices/{deviceId}/users/{userId}
```

#### Attendance Records (Per Device)
```http
GET /api/devices/{deviceId}/attendance
POST /api/devices/{deviceId}/attendance/erase
```

#### Biometric Enrollment (Per Device)
```http
POST /api/devices/{deviceId}/enroll/fingerprint
POST /api/devices/{deviceId}/enroll/face
GET /api/devices/{deviceId}/enroll/status/{jobId}
```

### Legacy API Support

All existing single-device APIs remain functional for backward compatibility:

```http
GET /api/device/config      # Uses default or first device
GET /api/users             # Works with default device
GET /api/attendance        # Works with default device
```

You can specify which device to use with headers or query parameters:
```http
GET /api/users?deviceId=branch-warehouse
GET /api/users -H "X-Device-ID: branch-security"
```

## 🌐 Multi-Network Setup Examples

### Example 1: Office with Multiple Subnets

```json
{
  "devices": [
    {
      "deviceId": "main-entrance",
      "name": "Main Entrance Scanner",
      "ip": "192.168.1.100",
      "branch": "main",
      "location": "Main Entrance",
      "wifiNetwork": "Office-Main"
    },
    {
      "deviceId": "executive-floor",
      "name": "Executive Floor Scanner", 
      "ip": "192.168.10.50",
      "branch": "executive",
      "location": "Executive Floor",
      "wifiNetwork": "Office-Executive"
    }
  ]
}
```

### Example 2: Multi-Location Company

```json
{
  "devices": [
    {
      "deviceId": "hq-lobby",
      "ip": "10.0.1.100",
      "branch": "headquarters",
      "location": "HQ Lobby",
      "wifiNetwork": "HQ-Corporate"
    },
    {
      "deviceId": "warehouse-1",
      "ip": "172.16.1.100", 
      "branch": "warehouse",
      "location": "Warehouse Building 1",
      "wifiNetwork": "Warehouse-WiFi"
    },
    {
      "deviceId": "remote-office",
      "ip": "192.168.100.50",
      "branch": "remote",
      "location": "Remote Office",
      "wifiNetwork": "Remote-Office"
    }
  ]
}
```

### Example 3: Security-Focused Setup

```json
{
  "devices": [
    {
      "deviceId": "security-main",
      "ip": "10.10.1.100",
      "branch": "security",
      "location": "Main Security Gate",
      "wifiNetwork": "Security-Primary"
    },
    {
      "deviceId": "security-backup", 
      "ip": "10.10.1.101",
      "branch": "security",
      "location": "Backup Security Gate",
      "wifiNetwork": "Security-Primary"
    },
    {
      "deviceId": "server-room",
      "ip": "10.10.2.50",
      "branch": "datacenter", 
      "location": "Server Room Access",
      "wifiNetwork": "Security-Datacenter"
    }
  ]
}
```

## ⚙️ Configuration

### Device Configuration File

The system automatically creates and maintains device configurations in `data/device-configs.json`:

```json
[
  {
    "deviceId": "branch-main",
    "name": "Main Branch Scanner", 
    "ip": "192.168.1.100",
    "apiKey": "main123",
    "useHttps": false,
    "wifiNetwork": "OfficeWiFi",
    "branch": "main",
    "location": "Main Office",
    "autoReconnect": true,
    "createdAt": "2025-09-06T06:42:13.497Z",
    "lastConnected": "2025-09-06T06:45:30.123Z",
    "status": "connected"
  }
]
```

### Environment Variables

```bash
# Server Configuration
PORT=3000

# Default Device (Optional)
DEVICE_IP=192.168.1.100
API_KEY=default_api_key

# HTTPS Configuration (Optional)
USE_HTTPS=false
```

## 🔒 Security Features

### API Key Management
- **Device-Specific Keys**: Each device can have its own API key
- **Branch-Level Permissions**: Restrict access by branch
- **Key Rotation**: Regular API key updates
- **Usage Tracking**: Monitor API key usage patterns

### Network Security
- **Multi-Network Support**: Secure communication across different networks
- **HTTPS Support**: Encrypted connections to devices
- **Certificate Validation**: SSL/TLS certificate verification
- **Firewall Friendly**: Works with corporate firewalls

## 📊 Usage Examples

### Managing Multiple Warehouses

```javascript
// Connect to multiple warehouse scanners
const devices = [
  { id: 'warehouse-a', ip: '192.168.1.100', network: 'Warehouse-A-WiFi' },
  { id: 'warehouse-b', ip: '192.168.2.100', network: 'Warehouse-B-WiFi' },
  { id: 'warehouse-c', ip: '192.168.3.100', network: 'Warehouse-C-WiFi' }
];

// Add all devices
for (const device of devices) {
  await addDevice(device.id, {
    name: `Warehouse ${device.id.split('-')[1].toUpperCase()} Scanner`,
    ip: device.ip,
    branch: 'warehouse',
    location: `Warehouse ${device.id.split('-')[1].toUpperCase()}`,
    wifiNetwork: device.network
  });
}

// Get attendance from all warehouses
const allAttendance = [];
for (const device of devices) {
  const attendance = await getDeviceAttendance(device.id);
  allAttendance.push(...attendance.map(record => ({
    ...record,
    warehouse: device.id
  })));
}
```

### Branch-Specific User Management

```javascript
// Enroll user on main office device
await enrollUser('branch-main', {
  id: '12345',
  name: 'John Doe',
  department: 'IT',
  branch: 'main'
});

// Replicate user to warehouse device
await enrollUser('branch-warehouse', {
  id: '12345', 
  name: 'John Doe',
  department: 'IT',
  branch: 'warehouse',
  // Different permissions for warehouse access
  privilege: 'user'
});
```

## 🛠️ Troubleshooting

### Device Connection Issues

1. **Check Network Connectivity**
   ```bash
   ping 192.168.1.100  # Replace with your device IP
   ```

2. **Verify API Key**
   - Ensure API key is correct
   - Check device API key configuration

3. **Firewall Settings**
   - Ensure ports 80/443 are open
   - Check corporate firewall rules

4. **WiFi Network Issues**
   - Verify device is connected to correct network
   - Check DHCP settings
   - Verify network isolation rules

### Multi-Device Conflicts

1. **IP Address Conflicts**
   - Ensure each device has unique IP
   - Check for DHCP conflicts

2. **API Key Conflicts**
   - Use unique API keys per device
   - Implement key rotation policy

3. **Branch Configuration**
   - Verify branch names are consistent
   - Check location mappings

## 🔧 Advanced Configuration

### Load Balancing Multiple Devices

For high-traffic scenarios, you can configure multiple devices per location:

```javascript
const loadBalancedConfig = {
  'main-office': [
    { id: 'main-1', ip: '192.168.1.100' },
    { id: 'main-2', ip: '192.168.1.101' },
    { id: 'main-3', ip: '192.168.1.102' }
  ],
  'warehouse': [
    { id: 'warehouse-1', ip: '192.168.2.100' },
    { id: 'warehouse-2', ip: '192.168.2.101' }
  ]
};
```

### Custom Device Discovery

Implement automatic device discovery for dynamic networks:

```javascript
async function discoverDevices(networkRange) {
  // Scan network range for biometric devices
  // Auto-configure discovered devices
  // Update device list dynamically
}
```

## 📈 Monitoring & Analytics

### System Health Dashboard
- **Device Status**: Real-time connection status
- **Network Performance**: Latency and throughput metrics
- **Usage Statistics**: Device utilization patterns
- **Error Rates**: Connection and operation failures

### Branch Analytics
- **Attendance Patterns**: Peak usage times per branch
- **Device Performance**: Compare device efficiency
- **User Distribution**: User activity across locations
- **System Reliability**: Uptime and availability metrics

## 🤝 Support & Contribution

For questions, issues, or contributions:

1. **Issues**: Report bugs or request features
2. **Documentation**: Help improve documentation
3. **Testing**: Test with different device models
4. **Network Configurations**: Share your network setups

## 📝 License

[License information here]

---

**Multi-Device Biometric Middleware System** - Connecting your organization across all networks and locations! 🌐🔒👥
