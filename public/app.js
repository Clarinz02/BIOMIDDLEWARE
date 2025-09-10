/**
 * Biometric Device Management System - Frontend JavaScript
 * Handles all frontend interactions, API calls, and real-time updates
 */

class BiometricDeviceApp {
    constructor() {
        this.apiBase = '/api';
        this.currentSection = 'dashboard';
        this.activeJobs = new Map();
        this.users = [];
        this.attendanceLogs = [];
        
        // Initialize app
        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        // Try to load device config
        try {
            const response = await this.apiCall('/device/config');
            if (response.connected) {
                this.updateDeviceStatus(response.config.ip, true);
                this.loadDashboard();
            } else {
                // Show dashboard with no device connected message
                this.loadDashboard();
            }
        } catch (error) {
            console.log('No device configured');
            // Show dashboard with no device connected message
            this.loadDashboard();
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
            });
        });

        // Connection modal
        document.getElementById('connectionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.connectToDevice();
        });

        // Device status click
        document.getElementById('deviceStatus').addEventListener('click', () => {
            this.showConnectionModal();
        });

        // Dashboard events
        this.setupDashboardEvents();
        
        // Device settings events
        this.setupDeviceSettingsEvents();
        
        // User management events
        this.setupUserManagementEvents();
        
        // Enrollment events
        this.setupEnrollmentEvents();
        
        // Attendance events
        this.setupAttendanceEvents();
        
        // Network events
        this.setupNetworkEvents();
        
        // API Keys events
        this.setupAPIKeyEvents();
        
        // Branch Management events
        this.setupBranchManagementEvents();

        // Volume slider
        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                document.getElementById('volumeValue').textContent = e.target.value;
            });
        }

        // Device control action
        const controlAction = document.getElementById('deviceControlAction');
        if (controlAction) {
            controlAction.addEventListener('change', (e) => {
                const executeBtn = document.getElementById('executeControlAction');
                executeBtn.disabled = !e.target.value;
            });
        }
    }

    setupDashboardEvents() {
        document.getElementById('refreshDashboard')?.addEventListener('click', () => {
            this.loadDashboard();
        });

        document.getElementById('lockDevice')?.addEventListener('click', () => {
            this.lockDevice(true);
        });

        document.getElementById('unlockDevice')?.addEventListener('click', () => {
            this.lockDevice(false);
        });

        document.getElementById('syncTime')?.addEventListener('click', () => {
            this.syncDeviceTime();
        });

        document.getElementById('refreshData')?.addEventListener('click', () => {
            this.loadDashboard();
        });
    }

    setupDeviceSettingsEvents() {
        // Volume form
        document.getElementById('volumeForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateVolume();
        });

        // Verify mode form
        document.getElementById('verifyModeForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateVerifyMode();
        });

        // Sync time button
        document.getElementById('syncTimeBtn')?.addEventListener('click', () => {
            this.syncDeviceTime();
        });

        // Execute control action
        document.getElementById('executeControlAction')?.addEventListener('click', () => {
            this.executeControlAction();
        });
    }

    setupUserManagementEvents() {
        document.getElementById('addUserBtn')?.addEventListener('click', () => {
            this.showUserModal();
        });

        document.getElementById('refreshUsers')?.addEventListener('click', () => {
            this.loadUsers();
        });

        document.getElementById('userForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUser();
        });

        document.getElementById('userSearch')?.addEventListener('input', (e) => {
            this.filterUsers(e.target.value);
        });
    }

    setupEnrollmentEvents() {
        document.getElementById('startFaceEnrollment')?.addEventListener('click', () => {
            this.startEnrollment('face');
        });

        document.getElementById('startFingerprintEnrollment')?.addEventListener('click', () => {
            this.startEnrollment('fingerprint');
        });

        document.getElementById('startCardEnrollment')?.addEventListener('click', () => {
            this.startEnrollment('card');
        });

        document.getElementById('startPalmEnrollment')?.addEventListener('click', () => {
            this.startEnrollment('palm');
        });

        document.getElementById('selectPhotoBtn')?.addEventListener('click', () => {
            document.getElementById('photoInput').click();
        });

        document.getElementById('photoInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('convertPhotoBtn').disabled = false;
            }
        });

        document.getElementById('convertPhotoBtn')?.addEventListener('click', () => {
            this.convertPhotoToFace();
        });

        document.getElementById('cancelAllJobs')?.addEventListener('click', () => {
            this.cancelAllJobs();
        });
    }

    setupAttendanceEvents() {
        document.getElementById('refreshAttendance')?.addEventListener('click', () => {
            this.loadAttendance();
        });

        document.getElementById('exportAttendance')?.addEventListener('click', () => {
            this.exportAttendance();
        });

        document.getElementById('uploaderConfigForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.configureAttendanceUploader();
        });

        document.getElementById('checkUploaderStatus')?.addEventListener('click', () => {
            this.checkUploaderStatus();
        });

        document.getElementById('applyFilters')?.addEventListener('click', () => {
            this.filterAttendance();
        });
    }

    setupAPIKeyEvents() {
        document.getElementById('generateApiKey')?.addEventListener('click', () => {
            this.showGenerateKeyModal();
        });

        document.getElementById('refreshApiKeys')?.addEventListener('click', () => {
            this.loadApiKeys();
        });

        document.getElementById('generateKeyForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateApiKey();
        });

        document.getElementById('editKeyForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveApiKeyEdit();
        });

        document.getElementById('createDefaults')?.addEventListener('click', () => {
            this.createDefaultKeys();
        });

        document.getElementById('cleanupKeys')?.addEventListener('click', () => {
            this.cleanupOldKeys();
        });

        document.getElementById('copyKeyBtn')?.addEventListener('click', () => {
            this.copyApiKeyToClipboard();
        });
    }

    setupNetworkEvents() {
        document.getElementById('refreshNetwork')?.addEventListener('click', () => {
            this.loadNetworkConfig();
        });

        document.getElementById('ethernetConfigForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEthernetConfig();
        });

        document.getElementById('wifiConfigForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveWifiConfig();
        });

        // DHCP checkbox events
        document.getElementById('ethernetDhcp')?.addEventListener('change', (e) => {
            document.getElementById('ethernetStaticConfig').style.display = 
                e.target.checked ? 'none' : 'block';
        });
    }

    // API Helper Methods
    async apiCall(endpoint, options = {}) {
        this.showLoading();
        
        try {
            const url = this.apiBase + endpoint;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            const data = await response.json();
            
            if (!data.success) {
                // Only show notification for non-device-not-initialized errors
                if (!data.error?.includes('Device not initialized')) {
                    this.showNotification('Error', data.error || 'API call failed', 'error');
                }
                throw new Error(data.error || 'API call failed');
            }

            return data.data;
        } catch (error) {
            // Only show notification for network errors, not device not initialized
            if (error.name === 'TypeError' || !error.message?.includes('Device not initialized')) {
                this.showNotification('Error', error.message, 'error');
            }
            throw error;
        } finally {
            this.hideLoading();
        }
    }

    // Connection Methods
    showConnectionModal() {
        const modal = document.getElementById('connectionModal');
        modal.classList.add('active');
    }

    hideConnectionModal() {
        const modal = document.getElementById('connectionModal');
        modal.classList.remove('active');
    }

    async connectToDevice() {
        const ip = document.getElementById('deviceIpInput').value;
        const apiKey = document.getElementById('apiKeyInput').value;
        const useHttps = document.getElementById('useHttpsInput').checked;

        try {
            await this.apiCall('/device/connect', {
                method: 'POST',
                body: JSON.stringify({ ip, apiKey, useHttps })
            });

            this.updateDeviceStatus(ip, true);
            this.hideConnectionModal();
            this.showNotification('Success', 'Connected to device successfully!', 'success');
            this.loadDashboard();
        } catch (error) {
            this.showNotification('Connection Failed', error.message, 'error');
        }
    }

    updateDeviceStatus(ip, connected) {
        const statusElement = document.getElementById('deviceStatus');
        const ipElement = document.getElementById('deviceIp');
        
        if (connected) {
            statusElement.textContent = 'Connected';
            statusElement.classList.add('connected');
            ipElement.textContent = ip;
        } else {
            statusElement.textContent = 'Disconnected';
            statusElement.classList.remove('connected');
            ipElement.textContent = 'No device configured';
        }
    }

    // Navigation Methods
    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Show selected section
        document.getElementById(sectionName).classList.add('active');
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        this.currentSection = sectionName;

        // Load section-specific data
        switch (sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'device-manager':
                // Enhanced device manager loads automatically
                if (window.enhancedDeviceManager) {
                    window.enhancedDeviceManager.refreshDeviceList();
                }
                break;
            case 'device':
                this.loadDeviceSettings();
                break;
            case 'users':
                this.loadUsers();
                break;
            case 'enrollment':
                this.loadActiveJobs();
                break;
            case 'attendance':
                this.loadAttendance();
                break;
            case 'network':
                this.loadNetworkConfig();
                break;
            case 'api-keys':
                this.loadApiKeys();
                break;
            case 'hr-management':
                this.loadHRManagement();
                break;
            case 'attendance-tracking':
                this.loadAttendanceTracking();
                break;
            case 'payroll-system':
                this.loadPayrollSystem();
                break;
            case 'branch-management':
                this.loadBranchManagement();
                break;
        }
    }

    // Dashboard Methods
    async loadDashboard() {
        try {
            // Check if device is connected first
            const response = await this.apiCall('/device/config');
            if (!response.connected) {
                this.showDeviceNotConnectedMessage();
                return;
            }

            // Load device information
            const [version, capabilities, usage, uid, time] = await Promise.all([
                this.apiCall('/device/version'),
                this.apiCall('/device/capabilities'),
                this.apiCall('/device/usage'),
                this.apiCall('/device/uid'),
                this.apiCall('/device/time')
            ]);

            // Update device info
            const firmwareEl = document.getElementById('firmwareVersion');
            const uidEl = document.getElementById('deviceUid');
            const timeEl = document.getElementById('deviceTime');
            
            if (firmwareEl) firmwareEl.textContent = version.firmware_version;
            if (uidEl) uidEl.textContent = uid.uid;
            if (timeEl) timeEl.textContent = new Date(time.time).toLocaleString();

            // Update capabilities
            this.updateCapabilities(capabilities);

            // Update usage stats
            this.updateUsageStats(usage.usage, usage.limits);

        } catch (error) {
            if (error.message?.includes('Device not initialized')) {
                this.showDeviceNotConnectedMessage();
            } else {
                console.error('Failed to load dashboard:', error);
            }
        }
    }

    showDeviceNotConnectedMessage() {
        // Clear dashboard content and show connection message
        const firmwareEl = document.getElementById('firmwareVersion');
        const uidEl = document.getElementById('deviceUid');
        const timeEl = document.getElementById('deviceTime');
        
        if (firmwareEl) firmwareEl.textContent = 'Device not connected';
        if (uidEl) uidEl.textContent = 'Connect to device first';
        if (timeEl) timeEl.textContent = 'N/A';
        
        const capabilitiesContainer = document.getElementById('deviceCapabilities');
        if (capabilitiesContainer) {
            capabilitiesContainer.innerHTML = '<div class="capability-item disabled"><i class="fas fa-unlink"></i><span>Device Disconnected</span></div>';
        }
        
        const usageContainer = document.getElementById('usageStats');
        if (usageContainer) {
            usageContainer.innerHTML = '<div class="info-item"><span class="label">Status:</span><span class="value">Connect to device to view usage statistics</span></div>';
        }
    }

    displayNoDeviceMessage(section) {
        if (section === 'users') {
            const tbody = document.getElementById('usersTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-unlink"></i> Device not connected. Click "Disconnected" in the header to connect to your device.</td></tr>';
        } else if (section === 'attendance') {
            const tbody = document.getElementById('attendanceTableBody');
            tbody.innerHTML = '<tr><td colspan="4" class="loading"><i class="fas fa-unlink"></i> Device not connected. Click "Disconnected" in the header to connect to your device.</td></tr>';
        }
    }

    showDeviceSettingsNotConnected() {
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.getElementById('volumeValue');
        const verifyModeSelect = document.getElementById('verifyModeSelect');
        const currentDeviceTime = document.getElementById('currentDeviceTime');
        
        if (volumeSlider) volumeSlider.value = 5;
        if (volumeValue) volumeValue.textContent = '-';
        if (verifyModeSelect) verifyModeSelect.value = 0;
        if (currentDeviceTime) currentDeviceTime.textContent = 'Device not connected';
    }

    showNetworkNotConnected() {
        const container = document.getElementById('networkStatus');
        container.innerHTML = '<div class="network-interface"><h4><i class="fas fa-unlink"></i> Device Not Connected</h4><p>Connect to your device first to view network configuration.</p></div>';
    }

    updateCapabilities(capabilities) {
        const container = document.getElementById('deviceCapabilities');
        container.innerHTML = '';

        const capabilityMap = {
            face: { icon: 'fa-smile', label: 'Face Recognition' },
            fingerprint: { icon: 'fa-fingerprint', label: 'Fingerprint' },
            card: { icon: 'fa-id-card', label: 'Card Reader' },
            palm: { icon: 'fa-hand-paper', label: 'Palm Recognition' },
            password: { icon: 'fa-key', label: 'Password' },
            wifi: { icon: 'fa-wifi', label: 'WiFi' },
            ethernet: { icon: 'fa-ethernet', label: 'Ethernet' },
            access_control: { icon: 'fa-door-open', label: 'Access Control' }
        };

        Object.entries(capabilities).forEach(([key, enabled]) => {
            const cap = capabilityMap[key];
            if (cap) {
                const item = document.createElement('div');
                item.className = `capability-item ${enabled ? 'enabled' : 'disabled'}`;
                item.innerHTML = `
                    <i class="fas ${cap.icon}"></i>
                    <span>${cap.label}</span>
                `;
                container.appendChild(item);
            }
        });
    }

    updateUsageStats(usage, limits) {
        const container = document.getElementById('usageStats');
        container.innerHTML = '';

        const statMap = {
            user_count: { label: 'Users', max: 'max_user' },
            face_count: { label: 'Faces', max: 'max_face' },
            fp_count: { label: 'Fingerprints', max: 'max_fp' },
            attend_log_count: { label: 'Attendance Logs', max: 'max_attend_log' },
            palm_count: { label: 'Palms', max: 'max_palm' }
        };

        Object.entries(statMap).forEach(([key, config]) => {
            const current = usage[key] || 0;
            const maximum = limits[config.max] || 0;
            
            if (maximum > 0) {
                const percentage = Math.round((current / maximum) * 100);
                
                const item = document.createElement('div');
                item.className = 'usage-item';
                item.innerHTML = `
                    <span class="label">${config.label}:</span>
                    <div class="usage-bar">
                        <div class="usage-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="usage-percentage">${current}/${maximum}</span>
                `;
                container.appendChild(item);
            }
        });
    }

    async lockDevice(locked) {
        try {
            await this.apiCall('/device/lock', {
                method: 'POST',
                body: JSON.stringify({ locked })
            });
            
            const action = locked ? 'locked' : 'unlocked';
            this.showNotification('Success', `Device ${action} successfully!`, 'success');
        } catch (error) {
            this.showNotification('Error', `Failed to ${locked ? 'lock' : 'unlock'} device`, 'error');
        }
    }

    async syncDeviceTime() {
        try {
            await this.apiCall('/device/time', {
                method: 'POST',
                body: JSON.stringify({ time: new Date().toISOString() })
            });
            
            this.showNotification('Success', 'Device time synchronized!', 'success');
            
            // Update displayed time
            const time = await this.apiCall('/device/time');
            document.getElementById('deviceTime').textContent = new Date(time.time).toLocaleString();
            
            const currentTime = document.getElementById('currentDeviceTime');
            if (currentTime) {
                currentTime.textContent = new Date(time.time).toLocaleString();
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to sync device time', 'error');
        }
    }

    // Device Settings Methods
    async loadDeviceSettings() {
        try {
            // Check if device is connected first
            const response = await this.apiCall('/device/config');
            if (!response.connected) {
                this.showDeviceSettingsNotConnected();
                return;
            }

            const [volume, verifyMode, time] = await Promise.all([
                this.apiCall('/device/volume'),
                this.apiCall('/device/verify-mode'),
                this.apiCall('/device/time')
            ]);

            document.getElementById('volumeSlider').value = volume.volume;
            document.getElementById('volumeValue').textContent = volume.volume;
            document.getElementById('verifyModeSelect').value = verifyMode.mode;
            document.getElementById('currentDeviceTime').textContent = new Date(time.time).toLocaleString();
        } catch (error) {
            if (error.message?.includes('Device not initialized')) {
                this.showDeviceSettingsNotConnected();
            } else {
                console.error('Failed to load device settings:', error);
            }
        }
    }

    async updateVolume() {
        try {
            const volume = parseInt(document.getElementById('volumeSlider').value);
            
            await this.apiCall('/device/volume', {
                method: 'POST',
                body: JSON.stringify({ volume })
            });
            
            this.showNotification('Success', 'Volume updated successfully!', 'success');
        } catch (error) {
            this.showNotification('Error', 'Failed to update volume', 'error');
        }
    }

    async updateVerifyMode() {
        try {
            const mode = parseInt(document.getElementById('verifyModeSelect').value);
            
            await this.apiCall('/device/verify-mode', {
                method: 'POST',
                body: JSON.stringify({ mode })
            });
            
            this.showNotification('Success', 'Verification mode updated!', 'success');
        } catch (error) {
            this.showNotification('Error', 'Failed to update verification mode', 'error');
        }
    }

    async executeControlAction() {
        const action = document.getElementById('deviceControlAction').value;
        if (!action) return;

        if (!confirm(`Are you sure you want to execute "${action}"? This action cannot be undone!`)) {
            return;
        }

        try {
            await this.apiCall('/device/control', {
                method: 'POST',
                body: JSON.stringify({ action })
            });
            
            this.showNotification('Success', `Action "${action}" executed successfully!`, 'success');
            document.getElementById('deviceControlAction').value = '';
            document.getElementById('executeControlAction').disabled = true;
        } catch (error) {
            this.showNotification('Error', `Failed to execute "${action}"`, 'error');
        }
    }

    // User Management Methods
    async loadUsers() {
        try {
            // Check if device is connected first
            const response = await this.apiCall('/device/config');
            if (!response.connected) {
                this.displayNoDeviceMessage('users');
                return;
            }

            const userIds = await this.apiCall('/users');
            this.users = [];
            
            // Load user details
            const userPromises = userIds.map(id => this.apiCall(`/users/${id}`));
            const userDetails = await Promise.all(userPromises.map(p => p.catch(e => null)));
            
            this.users = userDetails.filter(user => user !== null);
            this.displayUsers(this.users);
        } catch (error) {
            if (error.message?.includes('Device not initialized')) {
                this.displayNoDeviceMessage('users');
            } else {
                console.error('Failed to load users:', error);
                this.displayUsers([]);
            }
        }
    }

    displayUsers(users) {
        const tbody = document.getElementById('usersTableBody');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.name || '-'}</td>
                <td>${user.depart || '-'}</td>
                <td>${user.privilege || 'user'}</td>
                <td>
                    ${user.face ? '<i class="fas fa-smile" title="Face"></i>' : ''}
                    ${user.fp ? '<i class="fas fa-fingerprint" title="Fingerprint"></i>' : ''}
                    ${user.card ? '<i class="fas fa-id-card" title="Card"></i>' : ''}
                    ${user.palm ? '<i class="fas fa-hand-paper" title="Palm"></i>' : ''}
                    ${user.password ? '<i class="fas fa-key" title="Password"></i>' : ''}
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="app.editUser('${user.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteUser('${user.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    filterUsers(searchTerm) {
        const filtered = this.users.filter(user => 
            user.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.depart && user.depart.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        this.displayUsers(filtered);
    }

    showUserModal(userId = null) {
        const modal = document.getElementById('userModal');
        const title = document.getElementById('userModalTitle');
        const form = document.getElementById('userForm');
        
        if (userId) {
            title.innerHTML = '<i class="fas fa-user-edit"></i> Edit User';
            const user = this.users.find(u => u.id === userId);
            if (user) {
                document.getElementById('userId').value = user.id;
                document.getElementById('userId').readOnly = true;
                document.getElementById('userName').value = user.name || '';
                document.getElementById('userDepartment').value = user.depart || '';
                document.getElementById('userPrivilege').value = user.privilege || 'user';
                document.getElementById('userPassword').value = '';
                document.getElementById('userCard').value = user.card || '';
            }
        } else {
            title.innerHTML = '<i class="fas fa-user-plus"></i> Add User';
            form.reset();
            document.getElementById('userId').readOnly = false;
        }
        
        modal.classList.add('active');
    }

    async editUser(userId) {
        this.showUserModal(userId);
    }

    async deleteUser(userId) {
        if (!confirm(`Are you sure you want to delete user ${userId}?`)) {
            return;
        }

        try {
            await this.apiCall(`/users/${userId}`, { method: 'DELETE' });
            this.showNotification('Success', 'User deleted successfully!', 'success');
            this.loadUsers();
        } catch (error) {
            this.showNotification('Error', 'Failed to delete user', 'error');
        }
    }

    async saveUser() {
        const formData = {
            id: document.getElementById('userId').value,
            name: document.getElementById('userName').value,
            department: document.getElementById('userDepartment').value,
            privilege: document.getElementById('userPrivilege').value,
            password: document.getElementById('userPassword').value,
            card: document.getElementById('userCard').value
        };

        try {
            await this.apiCall('/users', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            
            this.showNotification('Success', 'User saved successfully!', 'success');
            this.closeModal('userModal');
            this.loadUsers();
        } catch (error) {
            this.showNotification('Error', 'Failed to save user', 'error');
        }
    }

    // Enrollment Methods
    async startEnrollment(type) {
        try {
            const result = await this.apiCall(`/enrollment/${type}`, { method: 'POST' });
            const jobId = result.jobId;
            
            this.showNotification('Info', `${type} enrollment started. Please follow device instructions.`, 'info');
            
            // Add to active jobs
            this.activeJobs.set(jobId, { type, status: 'pending', startTime: Date.now() });
            this.updateActiveJobsDisplay();
            
            // Start polling for status
            this.pollJobStatus(jobId);
            
        } catch (error) {
            this.showNotification('Error', `Failed to start ${type} enrollment`, 'error');
        }
    }

    async pollJobStatus(jobId) {
        try {
            const status = await this.apiCall(`/enrollment/status/${jobId}`);
            const job = this.activeJobs.get(jobId);
            
            if (job) {
                job.status = status.state;
                this.updateActiveJobsDisplay();
                
                if (status.state === 'succeeded') {
                    this.showNotification('Success', `${job.type} enrollment completed successfully!`, 'success');
                    this.activeJobs.delete(jobId);
                } else if (status.state === 'failed') {
                    this.showNotification('Error', `${job.type} enrollment failed`, 'error');
                    this.activeJobs.delete(jobId);
                } else if (status.state === 'pending') {
                    // Continue polling
                    setTimeout(() => this.pollJobStatus(jobId), 2000);
                }
            }
        } catch (error) {
            console.error('Failed to poll job status:', error);
            this.activeJobs.delete(jobId);
        }
        
        this.updateActiveJobsDisplay();
    }

    loadActiveJobs() {
        this.updateActiveJobsDisplay();
    }

    updateActiveJobsDisplay() {
        const container = document.getElementById('activeJobs');
        
        if (this.activeJobs.size === 0) {
            container.innerHTML = '<div class="no-jobs">No active enrollment jobs</div>';
            return;
        }

        container.innerHTML = Array.from(this.activeJobs.entries()).map(([jobId, job]) => `
            <div class="job-item">
                <span><i class="fas fa-${this.getJobIcon(job.type)}"></i> ${job.type} enrollment</span>
                <span class="job-status ${job.status}">${job.status}</span>
                <button class="btn btn-danger btn-sm" onclick="app.cancelJob(${jobId})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    getJobIcon(type) {
        const icons = {
            face: 'smile',
            fingerprint: 'fingerprint',
            card: 'id-card',
            palm: 'hand-paper'
        };
        return icons[type] || 'question';
    }

    async cancelJob(jobId) {
        try {
            await this.apiCall(`/enrollment/cancel/${jobId}`, { method: 'POST' });
            this.activeJobs.delete(jobId);
            this.updateActiveJobsDisplay();
            this.showNotification('Info', 'Job cancelled', 'info');
        } catch (error) {
            this.showNotification('Error', 'Failed to cancel job', 'error');
        }
    }

    async cancelAllJobs() {
        try {
            await this.apiCall('/enrollment/cancel-all', { method: 'POST' });
            this.activeJobs.clear();
            this.updateActiveJobsDisplay();
            this.showNotification('Info', 'All jobs cancelled', 'info');
        } catch (error) {
            this.showNotification('Error', 'Failed to cancel jobs', 'error');
        }
    }

    async convertPhotoToFace() {
        const fileInput = document.getElementById('photoInput');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showNotification('Error', 'Please select a photo first', 'error');
            return;
        }

        try {
            const base64 = await this.fileToBase64(file);
            const result = await this.apiCall('/enrollment/photo-to-face', {
                method: 'POST',
                body: JSON.stringify({ photoBase64: base64 })
            });

            const statusElement = document.getElementById('photoConversionStatus');
            
            if (result.state === 'succeeded') {
                statusElement.className = 'conversion-status success';
                statusElement.textContent = 'Photo converted successfully! Face data generated.';
                this.showNotification('Success', 'Photo converted to face data!', 'success');
            } else {
                statusElement.className = 'conversion-status error';
                statusElement.textContent = `Conversion failed: ${result.state}`;
                this.showNotification('Error', `Photo conversion failed: ${result.state}`, 'error');
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to convert photo', 'error');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                resolve(base64);
            };
            reader.onerror = reject;
        });
    }

    // Attendance Methods
    async loadAttendance() {
        try {
            // Check if device is connected first
            const response = await this.apiCall('/device/config');
            if (!response.connected) {
                this.displayNoDeviceMessage('attendance');
                return;
            }

            const logs = await this.apiCall('/attendance/all');
            this.attendanceLogs = logs;
            this.displayAttendance(logs);
            
            // Load user filter options
            this.updateUserFilter();
        } catch (error) {
            if (error.message?.includes('Device not initialized')) {
                this.displayNoDeviceMessage('attendance');
            } else {
                console.error('Failed to load attendance:', error);
                this.displayAttendance([]);
            }
        }
    }

    displayAttendance(logs) {
        const tbody = document.getElementById('attendanceTableBody');
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">No attendance records found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.slice(0, 100).map(log => { // Show first 100 records
            const date = new Date(log.time);
            return `
                <tr>
                    <td>${log.user_id}</td>
                    <td>${date.toLocaleTimeString()}</td>
                    <td>${log.mode}</td>
                    <td>${date.toLocaleDateString()}</td>
                </tr>
            `;
        }).join('');
    }

    updateUserFilter() {
        const select = document.getElementById('userFilter');
        const userIds = [...new Set(this.attendanceLogs.map(log => log.user_id))];
        
        select.innerHTML = '<option value="">All Users</option>' +
            userIds.map(id => `<option value="${id}">User ${id}</option>`).join('');
    }

    filterAttendance() {
        const dateFilter = document.getElementById('dateFilter').value;
        const userFilter = document.getElementById('userFilter').value;
        
        let filtered = this.attendanceLogs;
        
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            filtered = filtered.filter(log => {
                const logDate = new Date(log.time);
                return logDate.toDateString() === filterDate.toDateString();
            });
        }
        
        if (userFilter) {
            filtered = filtered.filter(log => log.user_id === userFilter);
        }
        
        this.displayAttendance(filtered);
    }

    async configureAttendanceUploader() {
        const targetUri = document.getElementById('targetUri').value;
        const interval = parseInt(document.getElementById('uploadInterval').value);

        try {
            await this.apiCall('/attendance/uploader', {
                method: 'POST',
                body: JSON.stringify({ targetUri, interval })
            });
            
            this.showNotification('Success', 'Attendance uploader configured!', 'success');
        } catch (error) {
            this.showNotification('Error', 'Failed to configure uploader', 'error');
        }
    }

    async checkUploaderStatus() {
        try {
            const status = await this.apiCall('/attendance/uploader/status');
            const statusElement = document.getElementById('uploaderStatus');
            
            statusElement.innerHTML = `
                <h4>Uploader Status</h4>
                <p><strong>Status:</strong> ${status.status}</p>
                <p><strong>Pending Records:</strong> ${status.pending_count}</p>
            `;
        } catch (error) {
            this.showNotification('Error', 'Failed to get uploader status', 'error');
        }
    }

    exportAttendance() {
        if (this.attendanceLogs.length === 0) {
            this.showNotification('Warning', 'No attendance records to export', 'warning');
            return;
        }

        const csv = this.attendanceLogsToCSV(this.attendanceLogs);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        this.showNotification('Success', 'Attendance records exported!', 'success');
    }

    attendanceLogsToCSV(logs) {
        const headers = ['User ID', 'Date', 'Time', 'Verification Method'];
        const rows = logs.map(log => {
            const date = new Date(log.time);
            return [
                log.user_id,
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                log.mode
            ];
        });
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    // Network Methods
    async loadNetworkConfig() {
        try {
            // Check if device is connected first
            const response = await this.apiCall('/device/config');
            if (!response.connected) {
                this.showNetworkNotConnected();
                return;
            }

            const config = await this.apiCall('/device/network');
            this.displayNetworkStatus(config);
            this.populateNetworkForms(config);
        } catch (error) {
            if (error.message?.includes('Device not initialized')) {
                this.showNetworkNotConnected();
            } else {
                console.error('Failed to load network config:', error);
            }
        }
    }

    displayNetworkStatus(config) {
        const container = document.getElementById('networkStatus');
        container.innerHTML = '';

        if (config.ethernet) {
            const eth = document.createElement('div');
            eth.className = 'network-interface';
            eth.innerHTML = `
                <h4><i class="fas fa-ethernet"></i> Ethernet</h4>
                <p><strong>IP Address:</strong> ${config.ethernet.running?.address || 'Not configured'}</p>
                <p><strong>Netmask:</strong> ${config.ethernet.running?.netmask || 'Not configured'}</p>
                <p><strong>Gateway:</strong> ${config.ethernet.running?.gateway || 'Not configured'}</p>
                <p><strong>DHCP:</strong> ${config.ethernet.config?.dhcp === 'on' ? 'Enabled' : 'Disabled'}</p>
            `;
            container.appendChild(eth);
        }

        if (config.wlan) {
            const wifi = document.createElement('div');
            wifi.className = 'network-interface';
            wifi.innerHTML = `
                <h4><i class="fas fa-wifi"></i> WiFi</h4>
                <p><strong>IP Address:</strong> ${config.wlan.running?.address || 'Not configured'}</p>
                <p><strong>DHCP:</strong> ${config.wlan.config?.dhcp === 'on' ? 'Enabled' : 'Disabled'}</p>
                <p><strong>Access Points:</strong> ${config.wlan.config?.access_points?.length || 0} configured</p>
            `;
            container.appendChild(wifi);
        }
    }

    populateNetworkForms(config) {
        // Ethernet form
        if (config.ethernet) {
            const ethConfig = config.ethernet.config;
            document.getElementById('ethernetDhcp').checked = ethConfig.dhcp === 'on';
            document.getElementById('ethernetIp').value = ethConfig.address || '';
            document.getElementById('ethernetNetmask').value = ethConfig.netmask || '';
            document.getElementById('ethernetGateway').value = ethConfig.gateway || '';
            document.getElementById('ethernetDns').value = ethConfig.nameservers?.join(', ') || '';
            
            // Show/hide static config
            document.getElementById('ethernetStaticConfig').style.display = 
                ethConfig.dhcp === 'on' ? 'none' : 'block';
        }

        // WiFi form
        if (config.wlan) {
            const wlanConfig = config.wlan.config;
            document.getElementById('wifiDhcp').checked = wlanConfig.dhcp !== 'off';
            
            const accessPoint = wlanConfig.access_points?.[0];
            if (accessPoint) {
                document.getElementById('wifiSsid').value = accessPoint.ssid || '';
                document.getElementById('wifiPassword').value = accessPoint.key || '';
            }
        }
    }

    async saveEthernetConfig() {
        const dhcp = document.getElementById('ethernetDhcp').checked;
        
        const config = {
            ethernet: {
                dhcp: dhcp ? 'on' : 'off'
            }
        };

        if (!dhcp) {
            config.ethernet.address = document.getElementById('ethernetIp').value;
            config.ethernet.netmask = document.getElementById('ethernetNetmask').value;
            config.ethernet.gateway = document.getElementById('ethernetGateway').value;
            
            const dnsServers = document.getElementById('ethernetDns').value;
            if (dnsServers) {
                config.ethernet.nameservers = dnsServers.split(',').map(s => s.trim());
            }
        }

        try {
            await this.apiCall('/device/network', {
                method: 'POST',
                body: JSON.stringify({ config })
            });
            
            this.showNotification('Success', 'Ethernet configuration saved!', 'success');
            setTimeout(() => this.loadNetworkConfig(), 2000);
        } catch (error) {
            this.showNotification('Error', 'Failed to save ethernet configuration', 'error');
        }
    }

    async saveWifiConfig() {
        const dhcp = document.getElementById('wifiDhcp').checked;
        const ssid = document.getElementById('wifiSsid').value;
        const password = document.getElementById('wifiPassword').value;

        const config = {
            wlan: {
                dhcp: dhcp ? 'on' : 'off',
                access_points: []
            }
        };

        if (ssid) {
            config.wlan.access_points.push({ ssid, key: password });
        }

        try {
            await this.apiCall('/device/network', {
                method: 'POST',
                body: JSON.stringify({ config })
            });
            
            this.showNotification('Success', 'WiFi configuration saved!', 'success');
            setTimeout(() => this.loadNetworkConfig(), 2000);
        } catch (error) {
            this.showNotification('Error', 'Failed to save WiFi configuration', 'error');
        }
    }

    // Utility Methods
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageElement = document.getElementById('loadingMessage');
        messageElement.textContent = message;
        overlay.classList.add('active');
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('active');
    }

    showNotification(title, message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas ${icons[type]}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
    }

    // API Key Management Methods
    async loadApiKeys() {
        try {
            const [keys, stats] = await Promise.all([
                this.apiCall('/keys'),
                this.apiCall('/keys/stats')
            ]);
            
            this.displayApiKeys(keys);
            this.displayApiKeyStats(stats);
        } catch (error) {
            console.error('Failed to load API keys:', error);
            this.displayApiKeys([]);
        }
    }

    displayApiKeys(keys) {
        const tbody = document.getElementById('apiKeysTableBody');
        
        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">No API keys found</td></tr>';
            return;
        }

        tbody.innerHTML = keys.map(key => `
            <tr>
                <td>${key.name}</td>
                <td><code>${key.keyPreview}</code></td>
                <td>${key.deviceId || '-'}</td>
                <td>${new Date(key.createdAt).toLocaleDateString()}</td>
                <td>${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : 'Never'}</td>
                <td>${key.usageCount}</td>
                <td>
                    <span class="status-badge ${key.active ? 'active' : 'inactive'}">
                        ${key.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="action-buttons">
                    <button class="btn btn-secondary btn-sm" onclick="app.editApiKey('${key.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-info btn-sm" onclick="app.generateQRCode('${key.id}')" title="QR Code">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="btn btn-${key.active ? 'warning' : 'success'} btn-sm" 
                            onclick="app.toggleApiKey('${key.id}', ${!key.active})" 
                            title="${key.active ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-${key.active ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteApiKey('${key.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    displayApiKeyStats(stats) {
        const container = document.getElementById('apiKeyStats');
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.totalKeys}</div>
                    <div class="stat-label">Total Keys</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.activeKeys}</div>
                    <div class="stat-label">Active Keys</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.usedKeys}</div>
                    <div class="stat-label">Used Keys</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.totalUsage}</div>
                    <div class="stat-label">Total API Calls</div>
                </div>
            </div>
            ${stats.mostUsedKey ? `
                <div class="most-used-key">
                    <h4>Most Used Key</h4>
                    <p><strong>${stats.mostUsedKey.name}</strong> - ${stats.mostUsedKey.usageCount} calls</p>
                </div>
            ` : ''}
        `;
    }

    showGenerateKeyModal() {
        const modal = document.getElementById('generateKeyModal');
        document.getElementById('generateKeyForm').reset();
        modal.classList.add('active');
    }

    async generateApiKey() {
        const name = document.getElementById('keyName').value;
        const deviceId = document.getElementById('keyDeviceId').value;
        
        try {
            const result = await this.apiCall('/keys/generate', {
                method: 'POST',
                body: JSON.stringify({ name, deviceId: deviceId || null })
            });
            
            this.closeModal('generateKeyModal');
            this.showGeneratedKey(result);
            this.showNotification('Success', 'API key generated successfully!', 'success');
            
            // Refresh the keys list
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to generate API key', 'error');
        }
    }

    showGeneratedKey(keyData) {
        const modal = document.getElementById('showKeyModal');
        const keyDisplay = document.getElementById('generatedKeyDisplay');
        const qrContainer = document.getElementById('generatedKeyQR');
        
        keyDisplay.value = keyData.key;
        
        // Generate QR code (simplified version)
        qrContainer.innerHTML = `
            <div class="qr-placeholder">
                <i class="fas fa-qrcode" style="font-size: 3rem; color: var(--gray-400);"></i>
                <p>QR Code would be generated here</p>
                <p><small>Key: ${keyData.key.substring(0, 16)}...</small></p>
            </div>
        `;
        
        modal.classList.add('active');
    }

    async copyApiKeyToClipboard() {
        const keyDisplay = document.getElementById('generatedKeyDisplay');
        
        try {
            await navigator.clipboard.writeText(keyDisplay.value);
            this.showNotification('Success', 'API key copied to clipboard!', 'success');
            
            // Visual feedback
            const copyBtn = document.getElementById('copyKeyBtn');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        } catch (error) {
            this.showNotification('Error', 'Failed to copy to clipboard', 'error');
        }
    }

    async editApiKey(keyId) {
        try {
            const keys = await this.apiCall('/keys');
            const key = keys.find(k => k.id === keyId);
            
            if (key) {
                const modal = document.getElementById('editKeyModal');
                document.getElementById('editKeyId').value = key.id;
                document.getElementById('editKeyName').value = key.name;
                
                // Set permissions checkboxes
                document.getElementById('permRead').checked = key.permissions.includes('read');
                document.getElementById('permWrite').checked = key.permissions.includes('write');
                document.getElementById('permAdmin').checked = key.permissions.includes('admin');
                
                modal.classList.add('active');
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to load key details', 'error');
        }
    }

    async saveApiKeyEdit() {
        const keyId = document.getElementById('editKeyId').value;
        const name = document.getElementById('editKeyName').value;
        const permissions = [];
        
        if (document.getElementById('permRead').checked) permissions.push('read');
        if (document.getElementById('permWrite').checked) permissions.push('write');
        if (document.getElementById('permAdmin').checked) permissions.push('admin');
        
        try {
            await this.apiCall(`/keys/${keyId}`, {
                method: 'PUT',
                body: JSON.stringify({ name, permissions })
            });
            
            this.closeModal('editKeyModal');
            this.showNotification('Success', 'API key updated successfully!', 'success');
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to update API key', 'error');
        }
    }

    async toggleApiKey(keyId, activate) {
        try {
            const endpoint = activate ? 'reactivate' : 'deactivate';
            await this.apiCall(`/keys/${keyId}/${endpoint}`, { method: 'POST' });
            
            const action = activate ? 'activated' : 'deactivated';
            this.showNotification('Success', `API key ${action} successfully!`, 'success');
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to update API key status', 'error');
        }
    }

    async deleteApiKey(keyId) {
        if (!confirm('Are you sure you want to delete this API key? This action cannot be undone!')) {
            return;
        }
        
        try {
            await this.apiCall(`/keys/${keyId}`, { method: 'DELETE' });
            this.showNotification('Success', 'API key deleted successfully!', 'success');
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to delete API key', 'error');
        }
    }

    async generateQRCode(keyId) {
        try {
            const qrData = await this.apiCall(`/keys/${keyId}/qr`);
            
            // Show QR code in a simple alert for now
            const configText = JSON.stringify(qrData, null, 2);
            alert(`QR Code Data:\n\n${configText}`);
        } catch (error) {
            this.showNotification('Error', 'Failed to generate QR code', 'error');
        }
    }

    async createDefaultKeys() {
        if (!confirm('Create default API keys for development, production, and testing?')) {
            return;
        }
        
        try {
            const keys = await this.apiCall('/keys/create-defaults', { method: 'POST' });
            this.showNotification('Success', `Created ${keys.length} default API keys!`, 'success');
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to create default keys', 'error');
        }
    }

    async cleanupOldKeys() {
        const days = prompt('Delete unused keys older than how many days?', '30');
        if (!days || isNaN(days)) {
            return;
        }
        
        try {
            const result = await this.apiCall('/keys/cleanup', {
                method: 'POST',
                body: JSON.stringify({ daysOld: parseInt(days) })
            });
            
            this.showNotification('Success', result.message, 'success');
            this.loadApiKeys();
        } catch (error) {
            this.showNotification('Error', 'Failed to cleanup old keys', 'error');
        }
    }

    // HR Management Methods
    async loadHRManagement() {
        try {
            // Load employee statistics
            const employees = await this.loadEmployeeData();
            this.updateEmployeeStats(employees);
            this.renderEmployeeDirectory(employees);
        } catch (error) {
            console.error('Failed to load HR management data:', error);
            this.showNotification('Error', 'Failed to load HR management data', 'error');
        }
    }

    async loadEmployeeData() {
        try {
            const response = await fetch('/api/employees');
            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                console.error('Failed to load employees:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Failed to load employee data:', error);
            return [];
        }
    }

    updateEmployeeStats(employees) {
        const totalEmployees = employees.length;
        const activeEmployees = employees.filter(emp => emp.status === 'active').length;
        const branches = [...new Set(employees.map(emp => emp.branch))].length;
        const departments = [...new Set(employees.map(emp => emp.department))].length;

        document.getElementById('totalEmployees').textContent = totalEmployees;
        document.getElementById('activeEmployees').textContent = activeEmployees;
        document.getElementById('totalBranches').textContent = branches;
        document.getElementById('totalDepartments').textContent = departments;
    }

    renderEmployeeDirectory(employees) {
        const tbody = document.getElementById('employeeTableBody');
        if (!tbody) return;

        if (employees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">No employees found</td></tr>';
            return;
        }

        tbody.innerHTML = employees.map(emp => `
            <tr>
                <td>${emp.id}</td>
                <td>${emp.name}</td>
                <td>${emp.position}</td>
                <td>${emp.department}</td>
                <td>${emp.branch}</td>
                <td>${new Date(emp.hireDate).toLocaleDateString()}</td>
                <td><span class="status-badge ${emp.status}">${emp.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="app.viewEmployee('${emp.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="app.editEmployee('${emp.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteEmployee('${emp.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Attendance Tracking Methods
    async loadAttendanceTracking() {
        try {
            // Load today's attendance data
            const attendanceData = await this.loadTodaysAttendance();
            this.updateAttendanceOverview(attendanceData);
            this.renderAttendanceFeed(attendanceData.feed);
            this.renderAttendanceExceptions(attendanceData.exceptions);
        } catch (error) {
            console.error('Failed to load attendance tracking data:', error);
            this.showNotification('Error', 'Failed to load attendance tracking data', 'error');
        }
    }

    async loadTodaysAttendance() {
        try {
            const response = await fetch('/api/attendance/today');
            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                console.error('Failed to load attendance data:', result.error);
                return this.getDefaultAttendanceData();
            }
        } catch (error) {
            console.error('Failed to load attendance data:', error);
            return this.getDefaultAttendanceData();
        }
    }

    getDefaultAttendanceData() {
        // Fallback data when API is unavailable
        return {
            present: 0,
            absent: 0,
            late: 0,
            onLeave: 0,
            feed: [],
            exceptions: []
        };
    }

    updateAttendanceOverview(data) {
        document.getElementById('presentCount').textContent = data.present;
        document.getElementById('absentCount').textContent = data.absent;
        document.getElementById('lateCount').textContent = data.late;
        document.getElementById('onLeaveCount').textContent = data.onLeave;
    }

    renderAttendanceFeed(feed) {
        const feedContainer = document.getElementById('attendanceFeed');
        if (!feedContainer) return;

        feedContainer.innerHTML = feed.map(item => `
            <div class="feed-item">
                <div class="feed-time">${item.time}</div>
                <div class="feed-employee">${item.employee}</div>
                <div class="feed-action ${item.type}">${item.action}</div>
                <div class="feed-device">${item.device}</div>
            </div>
        `).join('');
    }

    renderAttendanceExceptions(exceptions) {
        const container = document.getElementById('exceptionList');
        if (!container) return;

        container.innerHTML = exceptions.map(exception => `
            <div class="exception-item">
                <div class="exception-info">
                    <div class="exception-employee">${exception.employee}</div>
                    <div class="exception-type">${exception.type}</div>
                    <div class="exception-date">${exception.date}</div>
                </div>
                <div class="exception-actions">
                    <button class="btn btn-sm btn-success">Resolve</button>
                    <button class="btn btn-sm btn-info">Contact</button>
                </div>
            </div>
        `).join('');
    }

    // Payroll System Methods
    async loadPayrollSystem() {
        try {
            // Load payroll data
            const payrollData = await this.loadPayrollData();
            this.renderPayrollTable(payrollData.employees);
        } catch (error) {
            console.error('Failed to load payroll system data:', error);
            this.showNotification('Error', 'Failed to load payroll system data', 'error');
        }
    }

    async loadPayrollData() {
        // Mock payroll data for demonstration
        return {
            period: {
                start: '2025-09-01',
                end: '2025-09-15',
                status: 'processing',
                payDate: '2025-09-20'
            },
            summary: {
                grossPay: 1250000,
                deductions: 287500,
                netPay: 962500,
                employeeCount: 48
            },
            employees: [
                {
                    name: 'Juan Dela Cruz',
                    position: 'Senior Underwriter',
                    daysWorked: 10,
                    regularHours: 80.0,
                    overtime: 2.5,
                    grossPay: 22750,
                    deductions: 2847,
                    netPay: 19903,
                    status: 'calculated'
                },
                {
                    name: 'Maria Santos',
                    position: 'Claims Processor',
                    daysWorked: 10,
                    regularHours: 80.0,
                    overtime: 5.0,
                    grossPay: 18250,
                    deductions: 2281.25,
                    netPay: 15968.75,
                    status: 'calculated'
                },
                {
                    name: 'Carlos Reyes',
                    position: 'IT Support',
                    daysWorked: 10,
                    regularHours: 80.0,
                    overtime: 0.0,
                    grossPay: 14000,
                    deductions: 1750,
                    netPay: 12250,
                    status: 'processing'
                }
            ]
        };
    }

    renderPayrollTable(employees) {
        const tbody = document.getElementById('payrollTableBody');
        if (!tbody) return;

        if (employees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">No payroll data found</td></tr>';
            return;
        }

        tbody.innerHTML = employees.map(emp => `
            <tr>
                <td>${emp.name}</td>
                <td>${emp.position}</td>
                <td>${emp.daysWorked}</td>
                <td>${emp.regularHours}</td>
                <td>${emp.overtime}</td>
                <td>₱${emp.grossPay.toLocaleString()}</td>
                <td>₱${emp.deductions.toLocaleString()}</td>
                <td>₱${emp.netPay.toLocaleString()}</td>
                <td><span class="status-badge ${emp.status}">${emp.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-info">View</button>
                    <button class="btn btn-sm btn-warning">Edit</button>
                </td>
            </tr>
        `).join('');
    }

    // Employee action methods (placeholders)
    viewEmployee(id) {
        this.showNotification('Info', `Viewing employee ${id}`, 'info');
    }

    editEmployee(id) {
        this.showNotification('Info', `Editing employee ${id}`, 'info');
    }

    deleteEmployee(id) {
        if (confirm('Are you sure you want to delete this employee?')) {
            this.showNotification('Success', `Employee ${id} deleted`, 'success');
        }
    }

    // Branch Management Methods
    setupBranchManagementEvents() {
        document.getElementById('addBranchBtn')?.addEventListener('click', () => {
            this.showBranchModal();
        });
        
        document.getElementById('refreshBranches')?.addEventListener('click', () => {
            this.loadBranchManagement();
        });
        
        document.getElementById('branchForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBranch();
        });
    }
    
    async loadBranchManagement() {
        try {
            const branches = await this.loadBranchData();
            this.updateBranchStats(branches);
            this.renderBranchGrid(branches);
        } catch (error) {
            console.error('Failed to load branch management data:', error);
            this.showNotification('Error', 'Failed to load branch management data', 'error');
        }
    }
    
    async loadBranchData() {
        try {
            const response = await fetch('/api/branches');
            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                console.error('Failed to load branches:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Failed to load branch data:', error);
            return [];
        }
    }
    
    updateBranchStats(branches) {
        const totalBranches = branches.length;
        const activeBranches = branches.filter(branch => branch.status === 'active').length;
        const totalEmployees = branches.reduce((sum, branch) => sum + (branch.employeeCount || 0), 0);
        const connectedDevices = branches.reduce((sum, branch) => sum + (branch.deviceCount || 0), 0);
        
        document.getElementById('totalBranches').textContent = totalBranches;
        document.getElementById('activeBranches').textContent = activeBranches;
        document.getElementById('totalEmployeesAcrossBranches').textContent = totalEmployees;
        document.getElementById('connectedDevices').textContent = connectedDevices;
    }
    
    renderBranchGrid(branches) {
        const branchesGrid = document.getElementById('branchesGrid');
        const branchesLoading = document.getElementById('branchesLoading');
        const noBranches = document.getElementById('noBranches');
        
        if (!branchesGrid) return;
        
        branchesLoading.style.display = 'none';
        
        if (branches.length === 0) {
            branchesGrid.style.display = 'none';
            noBranches.style.display = 'block';
            return;
        }
        
        noBranches.style.display = 'none';
        branchesGrid.style.display = 'grid';
        
        branchesGrid.innerHTML = branches.map(branch => this.renderBranchCard(branch)).join('');
    }
    
    renderBranchCard(branch) {
        const statusClass = branch.status === 'active' ? 'active' : 'inactive';
        
        return `
            <div class="branch-card">
                <div class="branch-card-header">
                    <div>
                        <div class="branch-name">${branch.name}</div>
                        <div class="branch-location">
                            <i class="fas fa-map-marker-alt"></i> ${branch.address || 'No address specified'}
                        </div>
                    </div>
                    <span class="branch-status ${statusClass}">${branch.status}</span>
                </div>
                
                <div class="branch-details">
                    <div class="branch-detail-item">
                        <i class="fas fa-code"></i>
                        <span>${branch.code || 'No code'}</span>
                    </div>
                    <div class="branch-detail-item">
                        <i class="fas fa-phone"></i>
                        <span>${branch.phone || 'No phone'}</span>
                    </div>
                    <div class="branch-detail-item">
                        <i class="fas fa-user-tie"></i>
                        <span>${branch.manager || 'No manager'}</span>
                    </div>
                    <div class="branch-detail-item">
                        <i class="fas fa-envelope"></i>
                        <span>${branch.email || 'No email'}</span>
                    </div>
                    <div class="branch-detail-item">
                        <i class="fas fa-users"></i>
                        <span>${branch.employeeCount || 0} employees</span>
                    </div>
                    <div class="branch-detail-item">
                        <i class="fas fa-server"></i>
                        <span>${branch.deviceCount || 0} devices</span>
                    </div>
                </div>
                
                <div class="branch-actions">
                    <button class="btn btn-secondary" onclick="app.editBranch('${branch.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-info" onclick="app.viewBranchDetails('${branch.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-danger" onclick="app.deleteBranch('${branch.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }
    
    showBranchModal(branchId = null) {
        const modal = document.getElementById('branchModal');
        const title = document.getElementById('branchModalTitle');
        const submitText = document.getElementById('branchSubmitText');
        const form = document.getElementById('branchForm');
        
        if (branchId) {
            // Edit mode - load branch data
            title.innerHTML = '<i class="fas fa-building"></i> Edit Branch';
            submitText.textContent = 'Update Branch';
            this.loadBranchForEdit(branchId);
        } else {
            // Add mode - reset form
            title.innerHTML = '<i class="fas fa-building"></i> Add New Branch';
            submitText.textContent = 'Save Branch';
            form.reset();
            document.getElementById('branchId').value = '';
        }
        
        modal.classList.add('active');
    }
    
    async loadBranchForEdit(branchId) {
        try {
            const response = await fetch(`/api/branches/${branchId}`);
            const result = await response.json();
            
            if (result.success) {
                const branch = result.data;
                document.getElementById('branchId').value = branch.id;
                document.getElementById('branchName').value = branch.name || '';
                document.getElementById('branchCode').value = branch.code || '';
                document.getElementById('branchPhone').value = branch.phone || '';
                document.getElementById('branchAddress').value = branch.address || '';
                document.getElementById('branchManager').value = branch.manager || '';
                document.getElementById('branchEmail').value = branch.email || '';
                document.getElementById('branchTimezone').value = branch.timezone || 'America/Los_Angeles';
                document.getElementById('branchStatus').value = branch.status || 'active';
                document.getElementById('branchNotes').value = branch.notes || '';
            } else {
                this.showNotification('Error', 'Failed to load branch details', 'error');
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to load branch details', 'error');
        }
    }
    
    async saveBranch() {
        const branchData = {
            id: document.getElementById('branchId').value,
            name: document.getElementById('branchName').value,
            code: document.getElementById('branchCode').value,
            phone: document.getElementById('branchPhone').value,
            address: document.getElementById('branchAddress').value,
            manager: document.getElementById('branchManager').value,
            email: document.getElementById('branchEmail').value,
            timezone: document.getElementById('branchTimezone').value,
            status: document.getElementById('branchStatus').value,
            notes: document.getElementById('branchNotes').value
        };
        
        try {
            const isEdit = !!branchData.id;
            const url = isEdit ? `/api/branches/${branchData.id}` : '/api/branches';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(branchData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.closeBranchModal();
                this.showNotification('Success', `Branch ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
                this.loadBranchManagement();
            } else {
                this.showNotification('Error', result.error || 'Failed to save branch', 'error');
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to save branch', 'error');
        }
    }
    
    closeBranchModal() {
        const modal = document.getElementById('branchModal');
        modal.classList.remove('active');
    }
    
    async editBranch(branchId) {
        this.showBranchModal(branchId);
    }
    
    async viewBranchDetails(branchId) {
        this.showNotification('Info', `Viewing details for branch ${branchId}`, 'info');
        // TODO: Implement branch details view
    }
    
    async deleteBranch(branchId) {
        if (!confirm('Are you sure you want to delete this branch? This action cannot be undone!')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/branches/${branchId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Success', 'Branch deleted successfully!', 'success');
                this.loadBranchManagement();
            } else {
                this.showNotification('Error', result.error || 'Failed to delete branch', 'error');
            }
        } catch (error) {
            this.showNotification('Error', 'Failed to delete branch', 'error');
        }
    }

    // Migration function
    async migrateUsersToEmployees() {
        if (!confirm('This will migrate all biometric users to HR employee records. Continue?')) {
            return;
        }

        try {
            this.showLoading('Migrating users to employee records...');
            
            const response = await fetch('/api/employees/migrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    defaultPosition: 'Employee',
                    defaultDepartment: 'General',
                    defaultBranch: 'main'
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('Success', result.message, 'success');
                // Refresh HR management data
                if (this.currentSection === 'hr-management') {
                    this.loadHRManagement();
                }
            } else {
                this.showNotification('Error', result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Error', 'Migration failed: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
}

// Global modal close function
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
}

// Branch Management Global Functions
function closeBranchModal() {
    if (window.app) {
        window.app.closeBranchModal();
    }
}

function showBranchModal() {
    if (window.app) {
        window.app.showBranchModal();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BiometricDeviceApp();
});

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Enhanced Device Management System
class EnhancedDeviceManager {
    constructor() {
        this.devices = new Map();
        this.setupEventListeners();
        if (document.getElementById('device-manager')) {
            this.refreshDeviceList();
        }
    }

    setupEventListeners() {
        // Advanced options toggle
        document.getElementById('toggleAdvanced')?.addEventListener('click', () => {
            const advancedDiv = document.getElementById('advancedOptions');
            const isVisible = advancedDiv.style.display !== 'none';
            advancedDiv.style.display = isVisible ? 'none' : 'block';
        });

        // Refresh devices
        document.getElementById('refreshAllDevices')?.addEventListener('click', () => {
            this.refreshDeviceList();
        });
    }

    async refreshDeviceList() {
        try {
            window.app?.showNotification('Info', 'Refreshing device list...', 'info');
            const response = await fetch('/api/devices');
            const result = await response.json();
            
            if (result.success) {
                this.renderDeviceGrid(result.data.devices);
                this.updateDeviceStats(result.data.devices);
                if (window.app) {
                    window.app.showNotification('Success', 'Device list refreshed', 'success');
                }
            } else {
                if (window.app) {
                    window.app.showNotification('Error', 'Failed to refresh device list', 'error');
                }
            }
        } catch (error) {
            if (window.app) {
                window.app.showNotification('Error', 'Error refreshing devices: ' + error.message, 'error');
            }
            console.error('Failed to refresh device list:', error);
        }
    }

    renderDeviceGrid(devices) {
        const deviceGrid = document.getElementById('deviceGrid');
        if (!deviceGrid) return;

        if (devices.length === 0) {
            deviceGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-server fa-3x"></i>
                    <h3>No Devices Found</h3>
                    <p>Add your first biometric device using the Quick Add form above or Network Scanner.</p>
                </div>
            `;
            return;
        }

        deviceGrid.innerHTML = devices.map(device => this.renderDeviceCard(device)).join('');
    }

    renderDeviceCard(device) {
        const statusClass = device.connected ? 'online' : 'offline';
        const statusIcon = device.connected ? 'fa-check-circle' : 'fa-times-circle';
        const statusText = device.connected ? 'Online' : 'Offline';
        
        return `
            <div class="device-card ${statusClass}" data-device-id="${device.deviceId}">
                <div class="device-header">
                    <div class="device-title">
                        <h4>${device.name}</h4>
                        <span class="device-branch">${device.branch}</span>
                    </div>
                    <div class="device-status ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
                <div class="device-info">
                    <div class="info-row">
                        <span class="label"><i class="fas fa-network-wired"></i> IP:</span>
                        <span class="value">${device.ip}:${device.port || 80}</span>
                    </div>
                    <div class="info-row">
                        <span class="label"><i class="fas fa-map-marker-alt"></i> Location:</span>
                        <span class="value">${device.location || 'Not specified'}</span>
                    </div>
                    ${device.lastConnected ? `
                        <div class="info-row">
                            <span class="label"><i class="fas fa-clock"></i> Last Seen:</span>
                            <span class="value">${new Date(device.lastConnected).toLocaleString()}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="device-actions">
                    ${device.connected ? `
                        <button onclick="enhancedDeviceManager.disconnectDevice('${device.deviceId}')" 
                                class="btn btn-warning btn-sm">
                            <i class="fas fa-unlink"></i> Disconnect
                        </button>
                    ` : `
                        <button onclick="enhancedDeviceManager.connectDevice('${device.deviceId}')" 
                                class="btn btn-success btn-sm">
                            <i class="fas fa-link"></i> Connect
                        </button>
                    `}
                    <button onclick="enhancedDeviceManager.testDevice('${device.deviceId}')" 
                            class="btn btn-info btn-sm">
                        <i class="fas fa-heartbeat"></i> Test
                    </button>
                    <button onclick="enhancedDeviceManager.removeDevice('${device.ip}', ${device.port || 80})" 
                            class="btn btn-danger btn-sm">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        `;
    }

    updateDeviceStats(devices) {
        const statsDiv = document.getElementById('deviceStats');
        if (!statsDiv) return;

        const online = devices.filter(d => d.connected).length;
        const offline = devices.filter(d => !d.connected).length;
        const total = devices.length;

        statsDiv.innerHTML = `
            <span class="stat online">Online: ${online}</span>
            <span class="stat offline">Offline: ${offline}</span>
            <span class="stat total">Total: ${total}</span>
        `;
    }

    async connectDevice(deviceId) {
        try {
            if (window.app) {
                window.app.showNotification('Info', `Connecting to device ${deviceId}...`, 'info');
            }
            const response = await fetch(`/api/devices/${deviceId}/connect`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                if (window.app) {
                    window.app.showNotification('Success', result.message, 'success');
                }
                this.refreshDeviceList();
            } else {
                if (window.app) {
                    window.app.showNotification('Error', result.error, 'error');
                }
            }
        } catch (error) {
            if (window.app) {
                window.app.showNotification('Error', 'Connection failed: ' + error.message, 'error');
            }
        }
    }

    async disconnectDevice(deviceId) {
        try {
            if (window.app) {
                window.app.showNotification('Info', `Disconnecting from device ${deviceId}...`, 'info');
            }
            const response = await fetch(`/api/devices/${deviceId}/disconnect`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                if (window.app) {
                    window.app.showNotification('Success', result.message, 'success');
                }
                this.refreshDeviceList();
            } else {
                if (window.app) {
                    window.app.showNotification('Error', result.error, 'error');
                }
            }
        } catch (error) {
            if (window.app) {
                window.app.showNotification('Error', 'Disconnection failed: ' + error.message, 'error');
            }
        }
    }

    async testDevice(deviceId) {
        try {
            if (window.app) {
                window.app.showNotification('Info', `Testing device ${deviceId}...`, 'info');
            }
            const response = await fetch(`/api/devices/${deviceId}/test`);
            const result = await response.json();
            
            if (result.success) {
                if (window.app) {
                    window.app.showNotification('Success', 'Device test successful', 'success');
                }
            } else {
                if (window.app) {
                    window.app.showNotification('Error', 'Device test failed: ' + result.error, 'error');
                }
            }
        } catch (error) {
            if (window.app) {
                window.app.showNotification('Error', 'Device test failed: ' + error.message, 'error');
            }
        }
    }

    async removeDevice(ip, port) {
        if (!confirm(`Are you sure you want to remove the device at ${ip}:${port}?\n\nThis action cannot be undone.`)) {
            return;
        }

        try {
            if (window.app) {
                window.app.showNotification('Info', `Removing device at ${ip}:${port}...`, 'info');
            }
            const response = await fetch('/api/devices/quick-remove', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ip, port })
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (window.app) {
                    window.app.showNotification('Success', result.message, 'success');
                }
                this.refreshDeviceList();
            } else {
                if (window.app) {
                    window.app.showNotification('Error', result.error, 'error');
                }
            }
        } catch (error) {
            if (window.app) {
                window.app.showNotification('Error', 'Failed to remove device: ' + error.message, 'error');
            }
        }
    }
}

// Quick Add Device Function
async function quickAddDevice() {
    const ip = document.getElementById('deviceIP').value.trim();
    const port = parseInt(document.getElementById('devicePort').value) || 80;
    const apiKey = document.getElementById('deviceApiKey').value.trim();
    const deviceName = document.getElementById('deviceName').value.trim();
    const branch = document.getElementById('deviceBranch').value;
    const location = document.getElementById('deviceLocation').value.trim();
    const autoConnect = document.getElementById('autoConnect').checked;

    if (!ip) {
        if (window.app) {
            window.app.showNotification('Error', 'Please enter an IP address', 'error');
        } else {
            alert('Please enter an IP address');
        }
        document.getElementById('deviceIP').focus();
        return;
    }

    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
        if (window.app) {
            window.app.showNotification('Error', 'Please enter a valid IP address', 'error');
        } else {
            alert('Please enter a valid IP address');
        }
        document.getElementById('deviceIP').focus();
        return;
    }

    try {
        if (window.app) {
            window.app.showNotification('Info', 'Adding device...', 'info');
        }
        
        const response = await fetch('/api/devices/quick-add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ip, 
                port, 
                apiKey: apiKey || undefined, 
                deviceName: deviceName || undefined, 
                branch, 
                location: location || undefined, 
                autoConnect
            })
        });

        const result = await response.json();

        if (result.success) {
            if (window.app) {
                window.app.showNotification('Success', result.message, 'success');
            } else {
                alert(result.message);
            }
            // Clear form
            document.getElementById('deviceIP').value = '';
            document.getElementById('devicePort').value = '80';
            document.getElementById('deviceApiKey').value = '';
            document.getElementById('deviceName').value = '';
            document.getElementById('deviceLocation').value = '';
            
            // Refresh device list
            if (window.enhancedDeviceManager) {
                window.enhancedDeviceManager.refreshDeviceList();
            }
        } else {
            if (window.app) {
                window.app.showNotification('Error', result.error, 'error');
            } else {
                alert('Error: ' + result.error);
            }
        }
    } catch (error) {
        if (window.app) {
            window.app.showNotification('Error', 'Failed to add device: ' + error.message, 'error');
        } else {
            alert('Failed to add device: ' + error.message);
        }
    }
}

// Network Scan Function
async function scanNetwork() {
    const networkRange = document.getElementById('networkRange').value.trim();
    const autoAdd = document.getElementById('scanAutoAdd').checked;
    const autoConnect = document.getElementById('scanAutoConnect').checked;

    if (!networkRange) {
        if (window.app) {
            window.app.showNotification('Error', 'Please enter a network range', 'error');
        } else {
            alert('Please enter a network range');
        }
        document.getElementById('networkRange').focus();
        return;
    }

    const scanBtn = document.getElementById('scanBtn');
    const originalText = scanBtn.innerHTML;
    scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    scanBtn.disabled = true;

    try {
        if (window.app) {
            window.app.showNotification('Info', 'Scanning network...', 'info');
        }
        
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
            if (window.app) {
                window.app.showNotification('Success', result.message, 'success');
            } else {
                alert(result.message);
            }
            if (result.data && result.data.length > 0) {
                showScanResults(result.data);
            }
            
            // Refresh device list if devices were added
            if ((autoAdd || result.data.length > 0) && window.enhancedDeviceManager) {
                window.enhancedDeviceManager.refreshDeviceList();
            }
        } else {
            if (window.app) {
                window.app.showNotification('Error', result.error, 'error');
            } else {
                alert('Error: ' + result.error);
            }
        }
    } catch (error) {
        if (window.app) {
            window.app.showNotification('Error', 'Scan failed: ' + error.message, 'error');
        } else {
            alert('Scan failed: ' + error.message);
        }
    } finally {
        scanBtn.innerHTML = originalText;
        scanBtn.disabled = false;
    }
}

// Show Scan Results
function showScanResults(devices) {
    const resultsDiv = document.getElementById('scanResults');
    const tbody = document.getElementById('scanResultsBody');
    
    tbody.innerHTML = '';
    
    devices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.ip}</td>
            <td>${device.port}</td>
            <td>${device.detected ? 'Biometric Device' : 'Unknown'}</td>
            <td>-</td>
            <td>
                <span class="badge ${device.detected ? 'success' : 'secondary'}">
                    ${device.detected ? 'Detected' : 'Not Detected'}
                </span>
            </td>
            <td>
                ${device.detected ? `
                    <button onclick="addDiscoveredDevice('${device.ip}', ${device.port})" 
                            class="btn btn-success btn-sm">
                        <i class="fas fa-plus"></i> Add
                    </button>
                ` : 'N/A'}
            </td>
        `;
        tbody.appendChild(row);
    });
    
    resultsDiv.style.display = 'block';
}

// Add Discovered Device
async function addDiscoveredDevice(ip, port) {
    document.getElementById('deviceIP').value = ip;
    document.getElementById('devicePort').value = port;
    await quickAddDevice();
}

// Initialize Enhanced Device Manager
let enhancedDeviceManager;

// Update the existing DOMContentLoaded listener
const originalDOMContentLoaded = document.addEventListener;
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BiometricDeviceApp();
    
    // Initialize enhanced device manager after a short delay
    setTimeout(() => {
        window.enhancedDeviceManager = new EnhancedDeviceManager();
    }, 500);
    
    // Add HR migration button event listener
    const migrateBtn = document.getElementById('migrateUsersBtn');
    if (migrateBtn) {
        migrateBtn.addEventListener('click', () => {
            window.app.migrateUsersToEmployees();
        });
    }
});
