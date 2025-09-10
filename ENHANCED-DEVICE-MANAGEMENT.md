# Enhanced Biometric Device Management System

## Overview
This enhancement adds intelligent IP-based device discovery, automatic connection management, and simplified device administration to the existing biometric middleware system.

## New Features

### 1. IP-Based Device Discovery

#### Network Scanner Service
```typescript
// src/services/DeviceDiscoveryService.ts
import { EventEmitter } from 'events';
import ping from 'ping';
import axios from 'axios';

interface DiscoveredDevice {
  ip: string;
  port: number;
  deviceInfo?: {
    model: string;
    serialNumber: string;
    firmware: string;
    capabilities: string[];
  };
  status: 'online' | 'offline' | 'unknown';
  responseTime: number;
  lastSeen: Date;
}

export class DeviceDiscoveryService extends EventEmitter {
  private discoveredDevices: Map<string, DiscoveredDevice> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private commonPorts = [80, 8080, 4370, 5000, 8000]; // Common biometric device ports

  async scanNetwork(networkRange: string): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];
    const ipRange = this.generateIPRange(networkRange);
    
    console.log(`🔍 Scanning ${ipRange.length} IPs for biometric devices...`);
    
    // Parallel ping scan with limited concurrency
    const batchSize = 50;
    for (let i = 0; i < ipRange.length; i += batchSize) {
      const batch = ipRange.slice(i, i + batchSize);
      const batchPromises = batch.map(ip => this.scanSingleIP(ip));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          devices.push(result.value);
        }
      });
    }

    // Update discovered devices map
    devices.forEach(device => {
      this.discoveredDevices.set(`${device.ip}:${device.port}`, device);
    });

    this.emit('discovery:complete', devices);
    return devices;
  }

  private async scanSingleIP(ip: string): Promise<DiscoveredDevice | null> {
    try {
      // First, ping the IP to check if it's alive
      const pingResult = await ping.promise.probe(ip, { timeout: 2 });
      
      if (!pingResult.alive) {
        return null;
      }

      // Try common ports for biometric devices
      for (const port of this.commonPorts) {
        const device = await this.probeBiometricDevice(ip, port);
        if (device) {
          return device;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async probeBiometricDevice(ip: string, port: number): Promise<DiscoveredDevice | null> {
    try {
      const timeout = 3000;
      const startTime = Date.now();

      // Try to connect and get device info
      const response = await axios.get(`http://${ip}:${port}/api/device/info`, {
        timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BiometricDeviceManager/1.0'
        }
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 200 && response.data) {
        return {
          ip,
          port,
          deviceInfo: {
            model: response.data.model || 'Unknown',
            serialNumber: response.data.serial || 'Unknown',
            firmware: response.data.firmware || 'Unknown',
            capabilities: response.data.capabilities || []
          },
          status: 'online',
          responseTime,
          lastSeen: new Date()
        };
      }

      return null;
    } catch (error) {
      // Try alternative endpoints
      return await this.tryAlternativeEndpoints(ip, port);
    }
  }

  private async tryAlternativeEndpoints(ip: string, port: number): Promise<DiscoveredDevice | null> {
    const endpoints = [
      '/api/version',
      '/api/device/status',
      '/cgi-bin/deviceinfo.cgi',
      '/device/info',
      '/'
    ];

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`http://${ip}:${port}${endpoint}`, {
          timeout: 2000,
          headers: { 'Accept': 'application/json' }
        });

        if (response.status === 200) {
          const responseTime = Date.now() - startTime;
          return {
            ip,
            port,
            deviceInfo: {
              model: 'Detected',
              serialNumber: 'Unknown',
              firmware: 'Unknown',
              capabilities: []
            },
            status: 'online',
            responseTime,
            lastSeen: new Date()
          };
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private generateIPRange(networkRange: string): string[] {
    // Support formats: 192.168.1.1-192.168.1.254, 192.168.1.0/24
    const ips: string[] = [];

    if (networkRange.includes('/')) {
      // CIDR notation
      const [network, cidr] = networkRange.split('/');
      const [a, b, c, d] = network.split('.').map(Number);
      const mask = parseInt(cidr);
      const hostBits = 32 - mask;
      const hostCount = Math.pow(2, hostBits) - 2; // Exclude network and broadcast

      for (let i = 1; i <= hostCount; i++) {
        const ip = this.numberToIP((a << 24) + (b << 16) + (c << 8) + d + i);
        ips.push(ip);
      }
    } else if (networkRange.includes('-')) {
      // Range notation
      const [startIP, endIP] = networkRange.split('-');
      const start = this.ipToNumber(startIP);
      const end = this.ipToNumber(endIP);

      for (let i = start; i <= end; i++) {
        ips.push(this.numberToIP(i));
      }
    } else {
      // Single IP
      ips.push(networkRange);
    }

    return ips;
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  private numberToIP(num: number): string {
    return [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255
    ].join('.');
  }

  startPeriodicScan(networkRanges: string[], intervalMs: number = 300000) {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    this.scanInterval = setInterval(async () => {
      for (const range of networkRanges) {
        try {
          await this.scanNetwork(range);
        } catch (error) {
          console.error(`Error scanning network ${range}:`, error);
        }
      }
    }, intervalMs);

    console.log(`📡 Started periodic device scanning every ${intervalMs / 1000}s`);
  }

  stopPeriodicScan() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('📡 Stopped periodic device scanning');
    }
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  getDeviceByIP(ip: string, port?: number): DiscoveredDevice | undefined {
    if (port) {
      return this.discoveredDevices.get(`${ip}:${port}`);
    }

    // Find first matching IP regardless of port
    for (const [key, device] of this.discoveredDevices.entries()) {
      if (device.ip === ip) {
        return device;
      }
    }

    return undefined;
  }
}
```

#### Enhanced Device Manager with Auto-Discovery
```typescript
// src/services/EnhancedDeviceManager.ts
import { DeviceManager } from './DeviceManager';
import { DeviceDiscoveryService, DiscoveredDevice } from './DeviceDiscoveryService';
import { BiometricDeviceMiddleware } from '../biometric-middleware';

interface QuickAddConfig {
  ip: string;
  port?: number;
  apiKey?: string;
  deviceName?: string;
  branch?: string;
  location?: string;
  autoConnect?: boolean;
}

export class EnhancedDeviceManager extends DeviceManager {
  private discoveryService: DeviceDiscoveryService;
  private autoConnectEnabled: boolean = true;
  private defaultApiKey: string = '';

  constructor(configPath: string = './data') {
    super(configPath);
    this.discoveryService = new DeviceDiscoveryService();
    this.setupDiscoveryEvents();
  }

  private setupDiscoveryEvents() {
    this.discoveryService.on('discovery:complete', (devices: DiscoveredDevice[]) => {
      console.log(`🔍 Discovery complete: Found ${devices.length} potential biometric devices`);
      this.emit('discovery:complete', devices);
    });
  }

  async quickAddDevice(config: QuickAddConfig): Promise<any> {
    try {
      const {
        ip,
        port = 80,
        apiKey = this.defaultApiKey,
        deviceName,
        branch = 'main',
        location,
        autoConnect = true
      } = config;

      console.log(`⚡ Quick-adding device at ${ip}:${port}...`);

      // First, try to discover and verify the device
      const discoveredDevice = await this.discoveryService.probeBiometricDevice(ip, port);
      
      if (!discoveredDevice) {
        throw new Error(`No biometric device found at ${ip}:${port}`);
      }

      // Generate device ID based on IP and discovered info
      const deviceId = this.generateDeviceId(ip, discoveredDevice.deviceInfo?.serialNumber);
      
      // Check if device already exists
      if (this.getDeviceStatus(deviceId)) {
        throw new Error(`Device ${deviceId} already exists`);
      }

      // Create device configuration
      const deviceConfig = {
        name: deviceName || `${discoveredDevice.deviceInfo?.model} (${ip})`,
        ip: ip,
        port: port,
        apiKey: apiKey,
        useHttps: false,
        branch: branch,
        location: location || `Auto-discovered at ${ip}`,
        autoReconnect: true,
        deviceType: this.detectDeviceType(discoveredDevice.deviceInfo?.capabilities || []),
        capabilities: discoveredDevice.deviceInfo?.capabilities || [],
        serialNumber: discoveredDevice.deviceInfo?.serialNumber,
        model: discoveredDevice.deviceInfo?.model,
        firmware: discoveredDevice.deviceInfo?.firmware,
        discoveredAt: new Date().toISOString()
      };

      // Add device to manager
      const addedDevice = await this.addDevice(deviceId, deviceConfig);

      // Auto-connect if requested
      if (autoConnect) {
        try {
          await this.connectDevice(deviceId);
          console.log(`✅ Successfully connected to device ${deviceId}`);
        } catch (connectError) {
          console.warn(`⚠️ Device added but connection failed: ${connectError.message}`);
        }
      }

      return {
        deviceId,
        config: addedDevice,
        discovered: discoveredDevice,
        connected: autoConnect
      };

    } catch (error) {
      console.error(`❌ Failed to quick-add device:`, error);
      throw error;
    }
  }

  async quickRemoveDevice(ip: string, port?: number): Promise<boolean> {
    try {
      // Find device by IP
      const devices = this.getSystemOverview().devices;
      const targetDevice = devices.find(device => {
        return device.ip === ip && (port === undefined || device.port === port);
      });

      if (!targetDevice) {
        throw new Error(`No device found with IP ${ip}${port ? `:${port}` : ''}`);
      }

      console.log(`🗑️ Quick-removing device ${targetDevice.deviceId} (${ip})...`);

      // Disconnect first if connected
      if (targetDevice.connected) {
        try {
          await this.disconnectDevice(targetDevice.deviceId);
        } catch (error) {
          console.warn(`⚠️ Failed to disconnect device before removal: ${error.message}`);
        }
      }

      // Remove device
      await this.removeDevice(targetDevice.deviceId);
      
      console.log(`✅ Successfully removed device ${targetDevice.deviceId}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to quick-remove device:`, error);
      throw error;
    }
  }

  async scanAndAddDevices(networkRange: string, options: {
    branch?: string;
    autoConnect?: boolean;
    apiKey?: string;
  } = {}): Promise<any[]> {
    const {
      branch = 'main',
      autoConnect = false,
      apiKey = this.defaultApiKey
    } = options;

    console.log(`🔍 Scanning network ${networkRange} for biometric devices...`);
    
    const discoveredDevices = await this.discoveryService.scanNetwork(networkRange);
    const addedDevices: any[] = [];

    for (const discovered of discoveredDevices) {
      try {
        const result = await this.quickAddDevice({
          ip: discovered.ip,
          port: discovered.port,
          apiKey: apiKey,
          branch: branch,
          autoConnect: autoConnect
        });
        addedDevices.push(result);
      } catch (error) {
        console.warn(`⚠️ Failed to add discovered device ${discovered.ip}:${discovered.port}: ${error.message}`);
      }
    }

    console.log(`✅ Successfully added ${addedDevices.length} out of ${discoveredDevices.length} discovered devices`);
    return addedDevices;
  }

  async refreshDeviceStatus(deviceId?: string): Promise<void> {
    const devices = deviceId ? [deviceId] : this.getAllDeviceIds();
    
    for (const id of devices) {
      try {
        const device = this.getDevice(id);
        const config = this.getDeviceStatus(id);
        
        if (config) {
          // Check if device is still reachable
          const discovered = await this.discoveryService.probeBiometricDevice(config.ip, config.port || 80);
          
          if (discovered) {
            // Update last seen and status
            await this.updateDeviceConfig(id, {
              lastSeen: new Date().toISOString(),
              responseTime: discovered.responseTime,
              status: 'active'
            });
          } else {
            // Mark as unreachable
            await this.updateDeviceConfig(id, {
              status: 'unreachable',
              lastSeen: config.lastSeen // Keep previous last seen
            });
          }
        }
      } catch (error) {
        console.error(`Error refreshing status for device ${id}:`, error);
      }
    }
  }

  private generateDeviceId(ip: string, serialNumber?: string): string {
    const ipParts = ip.split('.');
    const ipSuffix = ipParts.slice(-2).join('-'); // Last two octets
    const serial = serialNumber ? `-${serialNumber.slice(-4)}` : '';
    return `device-${ipSuffix}${serial}`;
  }

  private detectDeviceType(capabilities: string[]): string {
    if (capabilities.includes('face') && capabilities.includes('fingerprint')) {
      return 'multimodal';
    } else if (capabilities.includes('face')) {
      return 'facial';
    } else if (capabilities.includes('fingerprint')) {
      return 'fingerprint';
    } else if (capabilities.includes('card')) {
      return 'card';
    }
    return 'unknown';
  }

  setDefaultApiKey(apiKey: string): void {
    this.defaultApiKey = apiKey;
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    return this.discoveryService.getDiscoveredDevices();
  }

  async startNetworkMonitoring(networkRanges: string[], intervalMs: number = 300000): Promise<void> {
    this.discoveryService.startPeriodicScan(networkRanges, intervalMs);
  }

  stopNetworkMonitoring(): void {
    this.discoveryService.stopPeriodicScan();
  }
}
```

### 2. Enhanced API Endpoints

```typescript
// Enhanced server.js routes for device management

// Quick add device by IP
app.post('/api/devices/quick-add', async (req, res) => {
  try {
    const { ip, port, apiKey, deviceName, branch, location, autoConnect } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    const result = await deviceManager.quickAddDevice({
      ip,
      port,
      apiKey,
      deviceName,
      branch,
      location,
      autoConnect
    });
    
    res.json({
      success: true,
      message: `Device successfully added${result.connected ? ' and connected' : ''}`,
      data: result
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Quick remove device by IP
app.delete('/api/devices/quick-remove', async (req, res) => {
  try {
    const { ip, port } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }
    
    const removed = await deviceManager.quickRemoveDevice(ip, port);
    
    res.json({
      success: true,
      message: `Device at ${ip} successfully removed`,
      data: { removed }
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Network scan for devices
app.post('/api/devices/scan', async (req, res) => {
  try {
    const { networkRange, branch, autoConnect, apiKey } = req.body;
    
    if (!networkRange) {
      return res.status(400).json({
        success: false,
        error: 'Network range is required (e.g., "192.168.1.0/24" or "192.168.1.1-192.168.1.254")'
      });
    }
    
    const discoveredDevices = await deviceManager.scanAndAddDevices(networkRange, {
      branch,
      autoConnect: autoConnect || false,
      apiKey
    });
    
    res.json({
      success: true,
      message: `Network scan complete. Found and added ${discoveredDevices.length} devices`,
      data: discoveredDevices
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Get discovered devices (not yet added)
app.get('/api/devices/discovered', async (req, res) => {
  try {
    const discovered = deviceManager.getDiscoveredDevices();
    const existing = deviceManager.getSystemOverview().devices;
    
    // Filter out already added devices
    const available = discovered.filter(device => {
      return !existing.some(existing => 
        existing.ip === device.ip && existing.port === device.port
      );
    });
    
    res.json({
      success: true,
      data: {
        available: available,
        total_discovered: discovered.length,
        already_added: discovered.length - available.length
      }
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Refresh device status
app.post('/api/devices/refresh-status', async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    await deviceManager.refreshDeviceStatus(deviceId);
    
    const overview = deviceManager.getSystemOverview();
    
    res.json({
      success: true,
      message: 'Device status refreshed',
      data: deviceId ? deviceManager.getDeviceStatus(deviceId) : overview
    });
  } catch (error) {
    handleError(res, error);
  }
});

// Start/stop network monitoring
app.post('/api/devices/monitoring/start', async (req, res) => {
  try {
    const { networkRanges, intervalMs } = req.body;
    
    if (!networkRanges || !Array.isArray(networkRanges)) {
      return res.status(400).json({
        success: false,
        error: 'networkRanges array is required'
      });
    }
    
    await deviceManager.startNetworkMonitoring(networkRanges, intervalMs);
    
    res.json({
      success: true,
      message: 'Network monitoring started',
      data: { networkRanges, intervalMs: intervalMs || 300000 }
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/devices/monitoring/stop', async (req, res) => {
  try {
    deviceManager.stopNetworkMonitoring();
    
    res.json({
      success: true,
      message: 'Network monitoring stopped'
    });
  } catch (error) {
    handleError(res, error);
  }
});
```

### 3. Enhanced Frontend UI

```html
<!-- Device Management Panel Enhancement -->
<div class="device-management-panel">
  <!-- Quick Add Device Section -->
  <div class="quick-add-section">
    <h3>📡 Quick Add Device</h3>
    <div class="input-group">
      <input type="text" id="deviceIP" placeholder="192.168.1.100" class="form-control">
      <input type="number" id="devicePort" placeholder="80" class="form-control" style="width: 80px;">
      <button onclick="quickAddDevice()" class="btn btn-success">
        <i class="fas fa-plus"></i> Add
      </button>
    </div>
    <div class="advanced-options" style="display:none;">
      <input type="text" id="deviceApiKey" placeholder="API Key (optional)" class="form-control">
      <input type="text" id="deviceName" placeholder="Device Name (auto-generated)" class="form-control">
      <select id="deviceBranch" class="form-control">
        <option value="main">Main Branch</option>
        <option value="warehouse">Warehouse</option>
        <option value="security">Security</option>
      </select>
      <input type="text" id="deviceLocation" placeholder="Location (optional)" class="form-control">
      <label>
        <input type="checkbox" id="autoConnect" checked> Auto-connect after adding
      </label>
    </div>
    <button onclick="toggleAdvancedOptions()" class="btn btn-link">
      <i class="fas fa-cog"></i> Advanced Options
    </button>
  </div>

  <!-- Network Scanner Section -->
  <div class="network-scanner-section">
    <h3>🔍 Network Scanner</h3>
    <div class="scanner-controls">
      <div class="input-group">
        <input type="text" id="networkRange" placeholder="192.168.1.0/24 or 192.168.1.1-192.168.1.50" class="form-control">
        <button onclick="scanNetwork()" class="btn btn-primary" id="scanBtn">
          <i class="fas fa-search"></i> Scan Network
        </button>
      </div>
      <div class="scan-options">
        <label>
          <input type="checkbox" id="scanAutoAdd"> Auto-add discovered devices
        </label>
        <label>
          <input type="checkbox" id="scanAutoConnect"> Auto-connect after adding
        </label>
      </div>
    </div>
    
    <!-- Scan Results -->
    <div id="scanResults" class="scan-results" style="display:none;">
      <h4>Scan Results</h4>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>Port</th>
              <th>Model</th>
              <th>Response Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="scanResultsBody">
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Device List with Quick Actions -->
  <div class="device-list-enhanced">
    <div class="list-header">
      <h3>🖥️ Managed Devices</h3>
      <div class="list-controls">
        <button onclick="refreshAllDevices()" class="btn btn-outline-secondary">
          <i class="fas fa-sync"></i> Refresh All
        </button>
        <button onclick="startNetworkMonitoring()" class="btn btn-outline-info" id="monitoringBtn">
          <i class="fas fa-radar"></i> Start Monitoring
        </button>
      </div>
    </div>
    
    <div class="device-grid" id="deviceGrid">
      <!-- Device cards will be populated here -->
    </div>
  </div>
</div>
```

```javascript
// Enhanced Frontend JavaScript
class EnhancedDeviceManager {
  constructor() {
    this.monitoringActive = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // WebSocket for real-time updates
    this.ws = new WebSocket(`ws://${location.host}/devices/status`);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleDeviceUpdate(data);
    };
  }

  async quickAddDevice() {
    const ip = document.getElementById('deviceIP').value;
    const port = document.getElementById('devicePort').value || 80;
    const apiKey = document.getElementById('deviceApiKey').value;
    const deviceName = document.getElementById('deviceName').value;
    const branch = document.getElementById('deviceBranch').value;
    const location = document.getElementById('deviceLocation').value;
    const autoConnect = document.getElementById('autoConnect').checked;

    if (!ip) {
      showToast('Please enter an IP address', 'error');
      return;
    }

    try {
      showToast('Adding device...', 'info');
      
      const response = await fetch('/api/devices/quick-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ip, port: parseInt(port), apiKey, deviceName, branch, location, autoConnect
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(result.message, 'success');
        document.getElementById('deviceIP').value = '';
        document.getElementById('devicePort').value = '';
        this.refreshDeviceList();
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to add device: ' + error.message, 'error');
    }
  }

  async scanNetwork() {
    const networkRange = document.getElementById('networkRange').value;
    const autoAdd = document.getElementById('scanAutoAdd').checked;
    const autoConnect = document.getElementById('scanAutoConnect').checked;

    if (!networkRange) {
      showToast('Please enter a network range', 'error');
      return;
    }

    const scanBtn = document.getElementById('scanBtn');
    const originalText = scanBtn.innerHTML;
    scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    scanBtn.disabled = true;

    try {
      if (autoAdd) {
        // Scan and auto-add
        const response = await fetch('/api/devices/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            networkRange,
            autoConnect,
            branch: document.getElementById('deviceBranch').value
          })
        });

        const result = await response.json();
        
        if (result.success) {
          showToast(result.message, 'success');
          this.refreshDeviceList();
        } else {
          showToast(result.error, 'error');
        }
      } else {
        // Just discover and show results
        const discoveryService = new DeviceDiscoveryService();
        const discovered = await discoveryService.scanNetwork(networkRange);
        this.showScanResults(discovered);
      }
    } catch (error) {
      showToast('Scan failed: ' + error.message, 'error');
    } finally {
      scanBtn.innerHTML = originalText;
      scanBtn.disabled = false;
    }
  }

  showScanResults(devices) {
    const resultsDiv = document.getElementById('scanResults');
    const tbody = document.getElementById('scanResultsBody');
    
    tbody.innerHTML = '';
    
    devices.forEach(device => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${device.ip}</td>
        <td>${device.port}</td>
        <td>${device.deviceInfo?.model || 'Unknown'}</td>
        <td>${device.responseTime}ms</td>
        <td>
          <span class="badge badge-${device.status === 'online' ? 'success' : 'secondary'}">
            ${device.status}
          </span>
        </td>
        <td>
          <button onclick="addDiscoveredDevice('${device.ip}', ${device.port})" 
                  class="btn btn-sm btn-success">
            <i class="fas fa-plus"></i> Add
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    resultsDiv.style.display = 'block';
  }

  async addDiscoveredDevice(ip, port) {
    document.getElementById('deviceIP').value = ip;
    document.getElementById('devicePort').value = port;
    await this.quickAddDevice();
  }

  async quickRemoveDevice(ip, port) {
    if (!confirm(`Are you sure you want to remove the device at ${ip}:${port}?`)) {
      return;
    }

    try {
      const response = await fetch('/api/devices/quick-remove', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ip, port })
      });

      const result = await response.json();

      if (result.success) {
        showToast(result.message, 'success');
        this.refreshDeviceList();
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to remove device: ' + error.message, 'error');
    }
  }

  async refreshAllDevices() {
    try {
      showToast('Refreshing device status...', 'info');
      
      const response = await fetch('/api/devices/refresh-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();

      if (result.success) {
        showToast('Device status refreshed', 'success');
        this.refreshDeviceList();
      } else {
        showToast('Failed to refresh status', 'error');
      }
    } catch (error) {
      showToast('Refresh failed: ' + error.message, 'error');
    }
  }

  async startNetworkMonitoring() {
    const btn = document.getElementById('monitoringBtn');
    
    if (this.monitoringActive) {
      // Stop monitoring
      try {
        await fetch('/api/devices/monitoring/stop', { method: 'POST' });
        this.monitoringActive = false;
        btn.innerHTML = '<i class="fas fa-radar"></i> Start Monitoring';
        btn.classList.remove('btn-outline-danger');
        btn.classList.add('btn-outline-info');
        showToast('Network monitoring stopped', 'info');
      } catch (error) {
        showToast('Failed to stop monitoring', 'error');
      }
    } else {
      // Start monitoring
      const networkRanges = ['192.168.1.0/24', '10.0.0.0/24']; // Configurable
      
      try {
        await fetch('/api/devices/monitoring/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            networkRanges,
            intervalMs: 300000 // 5 minutes
          })
        });
        
        this.monitoringActive = true;
        btn.innerHTML = '<i class="fas fa-stop"></i> Stop Monitoring';
        btn.classList.remove('btn-outline-info');
        btn.classList.add('btn-outline-danger');
        showToast('Network monitoring started', 'success');
      } catch (error) {
        showToast('Failed to start monitoring', 'error');
      }
    }
  }

  renderDeviceCard(device) {
    const statusClass = device.connected ? 'success' : 'secondary';
    const statusIcon = device.connected ? 'fa-check-circle' : 'fa-times-circle';
    
    return `
      <div class="device-card" data-device-id="${device.deviceId}">
        <div class="device-header">
          <h5>${device.name}</h5>
          <span class="badge badge-${statusClass}">
            <i class="fas ${statusIcon}"></i> ${device.connected ? 'Online' : 'Offline'}
          </span>
        </div>
        <div class="device-info">
          <div class="info-row">
            <strong>IP:</strong> ${device.ip}:${device.port || 80}
          </div>
          <div class="info-row">
            <strong>Branch:</strong> ${device.branch}
          </div>
          <div class="info-row">
            <strong>Model:</strong> ${device.model || 'Unknown'}
          </div>
          ${device.lastSeen ? `
            <div class="info-row">
              <strong>Last Seen:</strong> ${new Date(device.lastSeen).toLocaleString()}
            </div>
          ` : ''}
        </div>
        <div class="device-actions">
          ${device.connected ? `
            <button onclick="deviceManager.disconnectDevice('${device.deviceId}')" 
                    class="btn btn-sm btn-warning">
              <i class="fas fa-unlink"></i> Disconnect
            </button>
          ` : `
            <button onclick="deviceManager.connectDevice('${device.deviceId}')" 
                    class="btn btn-sm btn-success">
              <i class="fas fa-link"></i> Connect
            </button>
          `}
          <button onclick="deviceManager.testDevice('${device.deviceId}')" 
                  class="btn btn-sm btn-info">
            <i class="fas fa-heartbeat"></i> Test
          </button>
          <button onclick="deviceManager.quickRemoveDevice('${device.ip}', ${device.port || 80})" 
                  class="btn btn-sm btn-danger">
            <i class="fas fa-trash"></i> Remove
          </button>
        </div>
      </div>
    `;
  }

  async refreshDeviceList() {
    try {
      const response = await fetch('/api/devices');
      const result = await response.json();
      
      if (result.success) {
        const deviceGrid = document.getElementById('deviceGrid');
        deviceGrid.innerHTML = result.data.devices.map(device => 
          this.renderDeviceCard(device)
        ).join('');
      }
    } catch (error) {
      console.error('Failed to refresh device list:', error);
    }
  }

  handleDeviceUpdate(data) {
    if (data.type === 'device:status_changed') {
      // Update specific device card
      const deviceCard = document.querySelector(`[data-device-id="${data.deviceId}"]`);
      if (deviceCard) {
        // Update the card content
        this.refreshDeviceList(); // For simplicity, refresh the entire list
      }
    }
  }
}

function toggleAdvancedOptions() {
  const advancedDiv = document.querySelector('.advanced-options');
  const isVisible = advancedDiv.style.display !== 'none';
  advancedDiv.style.display = isVisible ? 'none' : 'block';
}

// Initialize enhanced device manager
const deviceManager = new EnhancedDeviceManager();

// Auto-refresh device list every 30 seconds
setInterval(() => deviceManager.refreshDeviceList(), 30000);
```

### 4. Usage Examples

#### Example 1: Quick Add Single Device
```bash
# Add a device at IP 192.168.1.150
curl -X POST http://localhost:5173/api/devices/quick-add \
  -H "Content-Type: application/json" \
  -d '{
    "ip": "192.168.1.150",
    "port": 80,
    "deviceName": "Reception Scanner",
    "branch": "main",
    "location": "Front Reception",
    "autoConnect": true
  }'
```

#### Example 2: Scan Entire Network Range
```bash
# Scan network range and auto-add all discovered devices
curl -X POST http://localhost:5173/api/devices/scan \
  -H "Content-Type: application/json" \
  -d '{
    "networkRange": "192.168.1.0/24",
    "branch": "main",
    "autoConnect": true,
    "apiKey": "your-default-api-key"
  }'
```

#### Example 3: Quick Remove Device
```bash
# Remove device by IP address
curl -X DELETE http://localhost:5173/api/devices/quick-remove \
  -H "Content-Type: application/json" \
  -d '{
    "ip": "192.168.1.150",
    "port": 80
  }'
```

### 5. Advanced Features

#### Network Monitoring with Alerts
```typescript
// Monitor network and alert on device changes
deviceManager.on('device:discovered', (device) => {
  console.log(`🔍 New device discovered: ${device.ip}:${device.port}`);
  // Send notification or auto-add based on policies
});

deviceManager.on('device:lost', (device) => {
  console.log(`⚠️ Device lost connection: ${device.ip}:${device.port}`);
  // Send alert to administrators
});
```

#### Bulk Device Management
```typescript
// Add multiple devices from a configuration file
const deviceConfigs = [
  { ip: "192.168.1.101", branch: "main", location: "Entrance" },
  { ip: "192.168.1.102", branch: "warehouse", location: "Loading Dock" },
  { ip: "192.168.1.103", branch: "security", location: "Security Gate" }
];

for (const config of deviceConfigs) {
  await deviceManager.quickAddDevice(config);
}
```

### 6. Installation and Setup

```bash
# Install additional dependencies
npm install ping axios

# Update your existing server.js or create enhanced version
# The enhanced device manager will automatically extend your existing system

# Start the server
npm start
```

### Key Benefits

1. **Simplified Device Management**: Add/remove devices with just IP addresses
2. **Network Discovery**: Automatically find all biometric devices on network
3. **Cross-Network Support**: Works with devices on different subnets/VLANs
4. **Real-time Monitoring**: Continuous network scanning and status updates
5. **Bulk Operations**: Add multiple devices at once
6. **Smart Detection**: Automatically detects device types and capabilities
7. **Enhanced UI**: User-friendly interface for device management
8. **Backward Compatibility**: Works with your existing device management system

This enhancement makes it incredibly easy to manage biometric devices across multiple network segments, whether they're on the same WiFi/LAN or distributed across different network locations.
