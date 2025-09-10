class EmployeeService {
    constructor(databaseService) {
        this.db = databaseService;
    }

    async init() {
        // Database initialization is handled by DatabaseService
        console.log('📋 EmployeeService initialized with database backend');
    }

    async createEmployee(userData, hrData = {}) {
        const employeeData = {
            id: userData.uid || userData.id,
            userId: userData.uid || userData.id,
            name: userData.name,
            position: hrData.position || 'Employee',
            department: hrData.department || 'General',
            branch: hrData.branchId || hrData.branch || 'main', // Support both branch and branchId
            hireDate: hrData.hireDate || new Date().toISOString().split('T')[0],
            status: hrData.status || 'active',
            email: hrData.email || '',
            phone: hrData.phone || '',
            address: hrData.address || '',
            emergencyContact: hrData.emergencyContact || '',
            salary: hrData.salary || 0
        };

        const biometricData = {
            uid: userData.uid || userData.id,
            name: userData.name,
            privilege: userData.privilege || 'user',
            card: userData.card || '',
            password: userData.password || '',
            deviceId: userData.deviceId || 'default'
        };

        return await this.db.createEmployee(employeeData, biometricData);
    }

    async updateEmployee(id, updates) {
        return await this.db.updateEmployee(id, updates);
    }

    async deleteEmployee(id) {
        return await this.db.deleteEmployee(id);
    }

    async getEmployee(id) {
        return await this.db.getEmployee(id);
    }

    async getAllEmployees() {
        const employees = await this.db.getAllEmployees();
        
        // Transform database results to match expected format
        return employees.map(emp => ({
            id: emp.id,
            userId: emp.user_id,
            name: emp.name,
            position: emp.position,
            department: emp.department,
            branch: emp.branch || emp.branch_id, // Support legacy branch field
            branchId: emp.branch_id,
            hireDate: emp.hire_date,
            status: emp.status,
            email: emp.email,
            phone: emp.phone,
            address: emp.address,
            emergencyContact: emp.emergency_contact,
            salary: emp.salary,
            createdAt: emp.created_at,
            updatedAt: emp.updated_at,
            privilege: emp.privilege,
            card: emp.card,
            biometricUserId: emp.biometric_user_id,
            deviceId: emp.device_id,
            biometricData: {
                fingerprints: [],
                faces: [],
                palms: []
            }
        }));
    }

    async getEmployeesByBranch(branch) {
        const allEmployees = await this.getAllEmployees();
        return allEmployees.filter(emp => emp.branch === branch);
    }

    async getEmployeesByDepartment(department) {
        const allEmployees = await this.getAllEmployees();
        return allEmployees.filter(emp => emp.department === department);
    }

    async getEmployeesByStatus(status) {
        const allEmployees = await this.getAllEmployees();
        return allEmployees.filter(emp => emp.status === status);
    }

    async searchEmployees(query) {
        const employees = await this.db.searchEmployees(query);
        
        // Transform database results to match expected format
        return employees.map(emp => ({
            id: emp.id,
            userId: emp.user_id,
            name: emp.name,
            position: emp.position,
            department: emp.department,
            branch: emp.branch,
            hireDate: emp.hire_date,
            status: emp.status,
            email: emp.email,
            phone: emp.phone,
            address: emp.address,
            emergencyContact: emp.emergency_contact,
            salary: emp.salary,
            createdAt: emp.created_at,
            updatedAt: emp.updated_at,
            privilege: emp.privilege,
            card: emp.card,
            biometricUserId: emp.biometric_user_id,
            deviceId: emp.device_id
        }));
    }

    async getEmployeeStats() {
        return await this.db.getEmployeeStats();
    }

    async getEmployeeCountsByBranch() {
        const stats = await this.getEmployeeStats();
        return stats.byBranch;
    }

    async getEmployeeCountsByDepartment() {
        const stats = await this.getEmployeeStats();
        return stats.byDepartment;
    }

    // Sync with biometric user data
    async syncWithBiometricUser(userData, hrData = {}) {
        // First check if employee exists
        const existingEmployee = await this.db.getEmployee(userData.uid || userData.id);
        
        if (existingEmployee) {
            // Update existing employee with new biometric data and HR data if provided
            const updates = {
                name: userData.name
            };
            
            // Add HR data updates if provided
            Object.assign(updates, hrData);
            
            await this.updateEmployee(existingEmployee.id, updates);
            
            // Update biometric user data
            await this.db.syncBiometricUser(userData);
            
            return await this.getEmployee(existingEmployee.id);
        } else {
            // Create new employee from biometric user
            return await this.createEmployee(userData, hrData);
        }
    }

    // Migrate existing biometric users to employee records
    async migrateUsersToEmployees(users, defaultHRData = {}) {
        const results = [];
        
        for (const user of users) {
            try {
                const employee = await this.syncWithBiometricUser(user, {
                    position: defaultHRData.position || 'Employee',
                    department: defaultHRData.department || 'General',
                    branch: defaultHRData.branch || 'main',
                    ...defaultHRData
                });
                results.push({ success: true, employee });
            } catch (error) {
                results.push({ success: false, user: user.uid || user.id, error: error.message });
            }
        }

        console.log(`🔄 Migration completed: ${results.filter(r => r.success).length}/${results.length} users migrated to employees`);
        return results;
    }

    // Attendance methods
    async logAttendance(logData) {
        return await this.db.logAttendance(logData);
    }

    async getAttendanceLogs(filters = {}) {
        return await this.db.getAttendanceLogs(filters);
    }

    // Get today's attendance data for dashboard
    async getTodaysAttendance() {
        const today = new Date().toISOString().split('T')[0];
        const logs = await this.getAttendanceLogs({
            startDate: today + ' 00:00:00',
            endDate: today + ' 23:59:59'
        });

        // Process logs to get attendance stats
        const employeeStats = new Map();
        logs.forEach(log => {
            const empId = log.employee_id;
            if (!employeeStats.has(empId)) {
                employeeStats.set(empId, {
                    id: empId,
                    name: log.employee_name,
                    logs: []
                });
            }
            employeeStats.get(empId).logs.push(log);
        });

        const allEmployees = await this.getAllEmployees();
        const totalEmployees = allEmployees.length;
        
        let present = 0;
        let late = 0;
        const onLeave = 0; // Would need leave management system
        
        employeeStats.forEach((empStat) => {
            const hasCheckedIn = empStat.logs.some(log => log.in_out_mode === 'in' || log.in_out_mode === 'IN');
            if (hasCheckedIn) {
                present++;
                // Check if late (after 8:30 AM for example)
                const firstCheckIn = empStat.logs
                    .filter(log => log.in_out_mode === 'in' || log.in_out_mode === 'IN')
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
                
                if (firstCheckIn) {
                    const checkInTime = new Date(firstCheckIn.timestamp);
                    const cutoffTime = new Date();
                    cutoffTime.setHours(8, 30, 0, 0); // 8:30 AM
                    
                    if (checkInTime > cutoffTime) {
                        late++;
                    }
                }
            }
        });

        const absent = totalEmployees - present;

        return {
            present,
            absent,
            late,
            onLeave,
            feed: logs.slice(0, 10).map(log => ({
                time: new Date(log.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                employee: log.employee_name,
                action: log.in_out_mode === 'in' || log.in_out_mode === 'IN' ? 'Clock In' : 'Clock Out',
                device: log.device_id,
                type: log.in_out_mode === 'in' || log.in_out_mode === 'IN' ? 'time-in' : 'time-out'
            })),
            exceptions: [] // Would need exception detection logic
        };
    }
}

module.exports = EmployeeService;
