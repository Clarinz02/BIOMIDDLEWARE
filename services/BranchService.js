class BranchService {
    constructor(databaseService) {
        this.db = databaseService;
    }

    async init() {
        console.log('🏢 BranchService initialized');
    }

    // Create a new branch
    async createBranch(branchData) {
        // Validate required fields
        if (!branchData.name || !branchData.code) {
            throw new Error('Branch name and code are required');
        }

        // Check if code already exists
        const existing = await this.getBranchByCode(branchData.code);
        if (existing) {
            throw new Error(`Branch code '${branchData.code}' already exists`);
        }

        return await this.db.createBranch(branchData);
    }

    // Update branch information
    async updateBranch(id, updates) {
        const existingBranch = await this.getBranch(id);
        if (!existingBranch) {
            throw new Error(`Branch not found: ${id}`);
        }

        // If updating code, check for uniqueness
        if (updates.code && updates.code !== existingBranch.code) {
            const existing = await this.getBranchByCode(updates.code);
            if (existing && existing.id !== id) {
                throw new Error(`Branch code '${updates.code}' already exists`);
            }
        }

        return await this.db.updateBranch(id, updates);
    }

    // Delete a branch
    async deleteBranch(id) {
        const branch = await this.getBranch(id);
        if (!branch) {
            throw new Error(`Branch not found: ${id}`);
        }

        // Prevent deletion of main branch
        if (id === 'main') {
            throw new Error('Cannot delete the main branch');
        }

        return await this.db.deleteBranch(id);
    }

    // Get branch by ID
    async getBranch(id) {
        return await this.db.getBranch(id);
    }

    // Get branch by code
    async getBranchByCode(code) {
        const branches = await this.getAllBranches();
        return branches.find(branch => branch.code === code);
    }

    // Get all branches
    async getAllBranches() {
        return await this.db.getAllBranches();
    }

    // Get active branches only
    async getActiveBranches() {
        const branches = await this.getAllBranches();
        return branches.filter(branch => branch.status === 'active');
    }

    // Get branch statistics
    async getBranchStats() {
        return await this.db.getBranchStats();
    }

    // Get employees for a specific branch
    async getBranchEmployees(branchId) {
        return await this.db.getEmployeesByBranch(branchId);
    }

    // Get branch summary with employee count
    async getBranchSummary() {
        const branches = await this.getAllBranches();
        const stats = await this.getBranchStats();
        
        const branchMap = new Map(stats.map(stat => [stat.id, stat]));
        
        return branches.map(branch => ({
            ...branch,
            employeeCount: branchMap.get(branch.id)?.employee_count || 0,
            activeEmployees: branchMap.get(branch.id)?.active_employees || 0,
            inactiveEmployees: branchMap.get(branch.id)?.inactive_employees || 0
        }));
    }

    // Validate branch data
    validateBranchData(data, isUpdate = false) {
        const errors = [];
        
        if (!isUpdate && (!data.name || data.name.trim().length === 0)) {
            errors.push('Branch name is required');
        } else if (isUpdate && data.name !== undefined && data.name.trim().length === 0) {
            errors.push('Branch name cannot be empty');
        }
        
        if (!isUpdate && (!data.code || data.code.trim().length === 0)) {
            errors.push('Branch code is required');
        } else if (data.code !== undefined && (data.code.trim().length === 0 || !/^[A-Z0-9_-]+$/.test(data.code))) {
            errors.push('Branch code must contain only uppercase letters, numbers, underscores, and hyphens');
        }
        
        if (data.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.managerEmail)) {
            errors.push('Invalid manager email format');
        }
        
        if (data.phone && !/^[\d\s\-\+\(\)]+$/.test(data.phone)) {
            errors.push('Invalid phone number format');
        }

        if (data.businessHours) {
            if (typeof data.businessHours !== 'object') {
                errors.push('Business hours must be an object');
            } else {
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                for (const day of days) {
                    if (data.businessHours[day] && typeof data.businessHours[day] !== 'object') {
                        errors.push(`Business hours for ${day} must be an object with 'open' and 'close' times`);
                    }
                }
            }
        }
        
        return errors;
    }

    // Create branch from device addition
    async createBranchFromDevice(deviceData) {
        if (!deviceData.branch) {
            return null; // No branch specified
        }

        // Check if branch already exists
        const existing = await this.getBranchByCode(deviceData.branch.toUpperCase());
        if (existing) {
            return existing; // Branch already exists
        }

        // Create new branch
        const branchData = {
            name: deviceData.branchName || this.formatBranchName(deviceData.branch),
            code: deviceData.branch.toUpperCase(),
            description: `Branch created for device: ${deviceData.name || deviceData.deviceId}`,
            address: deviceData.location || '',
            status: 'active'
        };

        console.log(`🏢 Auto-creating branch: ${branchData.name} (${branchData.code}) for device ${deviceData.deviceId}`);
        return await this.createBranch(branchData);
    }

    // Helper to format branch name from code
    formatBranchName(branchCode) {
        return branchCode
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ') + ' Branch';
    }

    // Get default business hours template
    getDefaultBusinessHours() {
        return {
            monday: { open: '09:00', close: '17:00' },
            tuesday: { open: '09:00', close: '17:00' },
            wednesday: { open: '09:00', close: '17:00' },
            thursday: { open: '09:00', close: '17:00' },
            friday: { open: '09:00', close: '17:00' },
            saturday: { closed: true },
            sunday: { closed: true }
        };
    }
}

module.exports = BranchService;
