const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs').promises;

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../data/biometric.db');
        this.migrationVersion = 2;
    }

    async init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            await fs.mkdir(dataDir, { recursive: true });

            // Open database connection
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            // Enable foreign keys
            await this.db.exec('PRAGMA foreign_keys = ON');

            // Run migrations
            await this.runMigrations();

            console.log(`💾 Database initialized: ${this.dbPath}`);
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    async runMigrations() {
        // Create migrations table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check current version
        const result = await this.db.get('SELECT MAX(version) as version FROM migrations');
        const currentVersion = result?.version || 0;

        if (currentVersion < this.migrationVersion) {
            console.log(`🔄 Running database migrations from v${currentVersion} to v${this.migrationVersion}`);
            
            for (let version = currentVersion + 1; version <= this.migrationVersion; version++) {
                await this.runMigration(version);
            }
        }
    }

    async runMigration(version) {
        console.log(`📝 Applying migration v${version}`);

        if (version === 1) {
            // Initial schema
            await this.db.exec(`
                -- Employees table (HR data)
                CREATE TABLE IF NOT EXISTS employees (
                    id TEXT PRIMARY KEY,
                    user_id TEXT UNIQUE,
                    name TEXT NOT NULL,
                    position TEXT,
                    department TEXT,
                    branch TEXT,
                    hire_date DATE,
                    status TEXT DEFAULT 'active',
                    email TEXT,
                    phone TEXT,
                    address TEXT,
                    emergency_contact TEXT,
                    salary DECIMAL(10,2),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Biometric users table (device data)
                CREATE TABLE IF NOT EXISTS biometric_users (
                    id TEXT PRIMARY KEY,
                    employee_id TEXT,
                    device_id TEXT,
                    name TEXT NOT NULL,
                    privilege TEXT DEFAULT 'user',
                    card TEXT,
                    password TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
                );

                -- Biometric data table
                CREATE TABLE IF NOT EXISTS biometric_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    type TEXT, -- 'fingerprint', 'face', 'palm'
                    data BLOB,
                    template TEXT,
                    device_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES biometric_users(id) ON DELETE CASCADE
                );

                -- Attendance logs table
                CREATE TABLE IF NOT EXISTS attendance_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    employee_id TEXT,
                    device_id TEXT,
                    timestamp DATETIME,
                    verification_mode TEXT,
                    in_out_mode TEXT,
                    work_code TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES biometric_users(id),
                    FOREIGN KEY (employee_id) REFERENCES employees(id)
                );

                -- Device sync status table
                CREATE TABLE IF NOT EXISTS device_sync (
                    device_id TEXT PRIMARY KEY,
                    last_sync_at DATETIME,
                    last_user_count INTEGER DEFAULT 0,
                    last_attendance_count INTEGER DEFAULT 0,
                    sync_status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Indexes for performance
                CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch);
                CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
                CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
                CREATE INDEX IF NOT EXISTS idx_biometric_users_device ON biometric_users(device_id);
                CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_logs(timestamp);
                CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_logs(employee_id);
                CREATE INDEX IF NOT EXISTS idx_attendance_device ON attendance_logs(device_id);
            `);
        }

        if (version === 2) {
            // Add branches table and update schema
            await this.db.exec(`
                -- Branches table
                CREATE TABLE IF NOT EXISTS branches (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    code TEXT UNIQUE NOT NULL,
                    address TEXT,
                    phone TEXT,
                    manager_name TEXT,
                    manager_email TEXT,
                    description TEXT,
                    status TEXT DEFAULT 'active',
                    timezone TEXT DEFAULT 'UTC',
                    business_hours TEXT, -- JSON string for operating hours
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Insert default branches
                INSERT OR IGNORE INTO branches (id, name, code, description) VALUES 
                    ('main', 'Main Branch', 'MAIN', 'Primary company location'),
                    ('warehouse', 'Warehouse', 'WH', 'Storage and distribution center'),
                    ('security', 'Security Office', 'SEC', 'Security department'),
                    ('reception', 'Reception', 'REC', 'Front desk and reception area');

                -- Add branch_id column to employees if it doesn't exist
                ALTER TABLE employees ADD COLUMN branch_id TEXT DEFAULT 'main';
                
                -- Update existing employees to use branch_id instead of branch text
                UPDATE employees SET branch_id = 
                    CASE 
                        WHEN branch = 'main' OR branch IS NULL THEN 'main'
                        WHEN branch = 'warehouse' THEN 'warehouse'
                        WHEN branch = 'security' THEN 'security'
                        WHEN branch = 'reception' THEN 'reception'
                        ELSE 'main'
                    END
                WHERE branch_id = 'main';

                -- Add foreign key index
                CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
            `);
        }

        // Record migration
        await this.db.run('INSERT INTO migrations (version) VALUES (?)', version);
        console.log(`✅ Migration v${version} applied successfully`);
    }

    // Employee operations
    async createEmployee(employeeData, biometricData = null) {
        try {
            await this.db.run('BEGIN TRANSACTION');
            
            // Insert employee record
            await this.db.run(`
                INSERT INTO employees (
                    id, user_id, name, position, department, branch_id, hire_date,
                    status, email, phone, address, emergency_contact, salary
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                employeeData.id,
                employeeData.userId || employeeData.id,
                employeeData.name,
                employeeData.position,
                employeeData.department,
                employeeData.branch,
                employeeData.hireDate,
                employeeData.status || 'active',
                employeeData.email,
                employeeData.phone,
                employeeData.address,
                employeeData.emergencyContact,
                employeeData.salary
            ]);

            // Insert biometric user record if provided
            if (biometricData) {
                await this.db.run(`
                    INSERT INTO biometric_users (
                        id, employee_id, device_id, name, privilege, card, password
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    biometricData.uid || biometricData.id,
                    employeeData.id,
                    biometricData.deviceId || 'default',
                    biometricData.name,
                    biometricData.privilege || 'user',
                    biometricData.card || '',
                    biometricData.password || ''
                ]);
            }

            await this.db.run('COMMIT');
            console.log(`👤 Created employee: ${employeeData.name} (${employeeData.id})`);
            
            return await this.getEmployee(employeeData.id);
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    async getEmployee(id) {
        return await this.db.get(`
            SELECT e.*, 
                   bu.id as biometric_user_id,
                   bu.device_id,
                   bu.privilege,
                   bu.card
            FROM employees e
            LEFT JOIN biometric_users bu ON e.id = bu.employee_id
            WHERE e.id = ?
        `, id);
    }

    async getAllEmployees() {
        return await this.db.all(`
            SELECT e.*,
                   bu.id as biometric_user_id,
                   bu.device_id,
                   bu.privilege,
                   bu.card
            FROM employees e
            LEFT JOIN biometric_users bu ON e.id = bu.employee_id
            ORDER BY e.created_at DESC
        `);
    }

    async updateEmployee(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id') continue; // Don't update ID
            fields.push(`${key} = ?`);
            values.push(value);
        }

        if (fields.length === 0) return false;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const result = await this.db.run(
            `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        console.log(`👤 Updated employee: ${id}`);
        return result.changes > 0;
    }

    async deleteEmployee(id) {
        const result = await this.db.run('DELETE FROM employees WHERE id = ?', id);
        console.log(`🗑️ Deleted employee: ${id}`);
        return result.changes > 0;
    }

    async searchEmployees(query) {
        return await this.db.all(`
            SELECT e.*,
                   bu.id as biometric_user_id,
                   bu.device_id,
                   bu.privilege,
                   bu.card
            FROM employees e
            LEFT JOIN biometric_users bu ON e.id = bu.employee_id
            WHERE e.name LIKE ? OR e.id LIKE ? OR e.position LIKE ? OR e.department LIKE ?
            ORDER BY e.name
        `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);
    }

    async getEmployeeStats() {
        const stats = await this.db.all(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
                COUNT(DISTINCT branch) as branches,
                COUNT(DISTINCT department) as departments
            FROM employees
        `);

        const branchCounts = await this.db.all(`
            SELECT branch, COUNT(*) as count
            FROM employees
            GROUP BY branch
            ORDER BY count DESC
        `);

        const departmentCounts = await this.db.all(`
            SELECT department, COUNT(*) as count
            FROM employees
            GROUP BY department
            ORDER BY count DESC
        `);

        return {
            ...stats[0],
            byBranch: branchCounts.reduce((acc, row) => {
                acc[row.branch] = row.count;
                return acc;
            }, {}),
            byDepartment: departmentCounts.reduce((acc, row) => {
                acc[row.department] = row.count;
                return acc;
            }, {})
        };
    }

    // Biometric user operations
    async syncBiometricUser(userData, deviceId = 'default') {
        try {
            await this.db.run('BEGIN TRANSACTION');
            
            // Check if biometric user exists
            const existingUser = await this.db.get(
                'SELECT * FROM biometric_users WHERE id = ?',
                userData.uid || userData.id
            );

            if (existingUser) {
                // Update existing user
                await this.db.run(`
                    UPDATE biometric_users 
                    SET name = ?, privilege = ?, card = ?, password = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [
                    userData.name,
                    userData.privilege || 'user',
                    userData.card || '',
                    userData.password || '',
                    userData.uid || userData.id
                ]);
                console.log(`🔄 Updated biometric user: ${userData.name} (${userData.uid || userData.id})`);
            } else {
                // Create new biometric user
                await this.db.run(`
                    INSERT INTO biometric_users (id, device_id, name, privilege, card, password)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    userData.uid || userData.id,
                    deviceId,
                    userData.name,
                    userData.privilege || 'user',
                    userData.card || '',
                    userData.password || ''
                ]);
                console.log(`➕ Created biometric user: ${userData.name} (${userData.uid || userData.id})`);
            }

            await this.db.run('COMMIT');
            return true;
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    async getBiometricUsers(deviceId = null) {
        const query = deviceId 
            ? 'SELECT * FROM biometric_users WHERE device_id = ? ORDER BY name'
            : 'SELECT * FROM biometric_users ORDER BY name';
        
        const params = deviceId ? [deviceId] : [];
        return await this.db.all(query, params);
    }

    // Attendance operations
    async logAttendance(logData) {
        await this.db.run(`
            INSERT INTO attendance_logs (
                user_id, employee_id, device_id, timestamp, verification_mode, in_out_mode, work_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            logData.userId,
            logData.employeeId,
            logData.deviceId,
            logData.timestamp,
            logData.verificationMode,
            logData.inOutMode,
            logData.workCode
        ]);
    }

    async getAttendanceLogs(filters = {}) {
        let query = `
            SELECT al.*, e.name as employee_name, e.position, e.department, e.branch
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.startDate) {
            query += ' AND timestamp >= ?';
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND timestamp <= ?';
            params.push(filters.endDate);
        }

        if (filters.employeeId) {
            query += ' AND employee_id = ?';
            params.push(filters.employeeId);
        }

        if (filters.deviceId) {
            query += ' AND device_id = ?';
            params.push(filters.deviceId);
        }

        query += ' ORDER BY timestamp DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        return await this.db.all(query, params);
    }

    // Device sync operations
    async updateDeviceSync(deviceId, syncData) {
        await this.db.run(`
            INSERT OR REPLACE INTO device_sync (
                device_id, last_sync_at, last_user_count, last_attendance_count, sync_status, updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            deviceId,
            syncData.lastSyncAt || new Date().toISOString(),
            syncData.userCount || 0,
            syncData.attendanceCount || 0,
            syncData.status || 'completed'
        ]);
    }

    async getDeviceSync(deviceId) {
        return await this.db.get(
            'SELECT * FROM device_sync WHERE device_id = ?',
            deviceId
        );
    }

    async getAllDeviceSync() {
        return await this.db.all('SELECT * FROM device_sync ORDER BY last_sync_at DESC');
    }

    // Branch operations
    async createBranch(branchData) {
        const id = branchData.id || branchData.code.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        await this.db.run(`
            INSERT INTO branches (
                id, name, code, address, phone, manager_name, manager_email,
                description, status, timezone, business_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            branchData.name,
            branchData.code,
            branchData.address || '',
            branchData.phone || '',
            branchData.managerName || '',
            branchData.managerEmail || '',
            branchData.description || '',
            branchData.status || 'active',
            branchData.timezone || 'UTC',
            branchData.businessHours ? JSON.stringify(branchData.businessHours) : null
        ]);
        
        console.log(`🏢 Created branch: ${branchData.name} (${id})`);
        return await this.getBranch(id);
    }

    async updateBranch(id, updates) {
        const fields = [];
        const params = [];
        
        const allowedFields = ['name', 'code', 'address', 'phone', 'manager_name', 'manager_email', 'description', 'status', 'timezone', 'business_hours'];
        
        for (const [key, value] of Object.entries(updates)) {
            let dbField = key;
            if (key === 'managerName') dbField = 'manager_name';
            else if (key === 'managerEmail') dbField = 'manager_email';
            else if (key === 'businessHours') dbField = 'business_hours';
            
            if (allowedFields.includes(dbField)) {
                fields.push(`${dbField} = ?`);
                params.push(key === 'businessHours' ? JSON.stringify(value) : value);
            }
        }
        
        if (fields.length > 0) {
            fields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);
            
            await this.db.run(
                `UPDATE branches SET ${fields.join(', ')} WHERE id = ?`,
                params
            );
            
            console.log(`🏢 Updated branch: ${id}`);
        }
        
        return await this.getBranch(id);
    }

    async deleteBranch(id) {
        // Check if branch has employees
        const employeeCount = await this.db.get(
            'SELECT COUNT(*) as count FROM employees WHERE branch_id = ?',
            id
        );
        
        if (employeeCount.count > 0) {
            throw new Error(`Cannot delete branch ${id}: ${employeeCount.count} employees are assigned to this branch`);
        }
        
        await this.db.run('DELETE FROM branches WHERE id = ?', id);
        console.log(`🗑️ Deleted branch: ${id}`);
    }

    async getBranch(id) {
        const branch = await this.db.get('SELECT * FROM branches WHERE id = ?', id);
        
        if (branch && branch.business_hours) {
            try {
                branch.businessHours = JSON.parse(branch.business_hours);
                delete branch.business_hours;
            } catch (e) {
                branch.businessHours = null;
            }
        }
        
        return branch;
    }

    async getAllBranches() {
        const branches = await this.db.all('SELECT * FROM branches ORDER BY name');
        
        return branches.map(branch => {
            if (branch.business_hours) {
                try {
                    branch.businessHours = JSON.parse(branch.business_hours);
                    delete branch.business_hours;
                } catch (e) {
                    branch.businessHours = null;
                }
            }
            return branch;
        });
    }

    async getBranchStats() {
        const stats = await this.db.all(`
            SELECT 
                b.id,
                b.name,
                b.code,
                b.status,
                COUNT(e.id) as employee_count,
                COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_employees,
                COUNT(CASE WHEN e.status = 'inactive' THEN 1 END) as inactive_employees
            FROM branches b
            LEFT JOIN employees e ON b.id = e.branch_id
            GROUP BY b.id, b.name, b.code, b.status
            ORDER BY b.name
        `);
        
        return stats;
    }

    async getEmployeesByBranch(branchId) {
        return await this.db.all(`
            SELECT e.*, b.name as branch_name, b.code as branch_code
            FROM employees e
            LEFT JOIN branches b ON e.branch_id = b.id
            WHERE e.branch_id = ?
            ORDER BY e.name
        `, branchId);
    }

    // Migration from JSON files
    async migrateFromJSON() {
        try {
            const employeesPath = path.join(__dirname, '../data/employees.json');
            
            try {
                const data = await fs.readFile(employeesPath, 'utf8');
                const employees = JSON.parse(data);
                
                if (employees.length > 0) {
                    console.log(`🔄 Migrating ${employees.length} employees from JSON to database`);
                    
                    for (const emp of employees) {
                        try {
                            await this.createEmployee({
                                id: emp.id,
                                userId: emp.userId || emp.id,
                                name: emp.name,
                                position: emp.position,
                                department: emp.department,
                                branch: emp.branch,
                                hireDate: emp.hireDate,
                                status: emp.status,
                                email: emp.email,
                                phone: emp.phone,
                                address: emp.address,
                                emergencyContact: emp.emergencyContact,
                                salary: emp.salary
                            }, emp.biometricData ? {
                                uid: emp.id,
                                name: emp.name,
                                privilege: emp.privilege,
                                card: emp.card,
                                password: emp.password
                            } : null);
                        } catch (error) {
                            console.log(`⚠️ Error migrating employee ${emp.id}: ${error.message}`);
                        }
                    }
                    
                    // Backup and remove JSON file
                    await fs.rename(employeesPath, `${employeesPath}.backup`);
                    console.log(`✅ JSON migration completed, backup created`);
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.log(`⚠️ JSON migration error: ${error.message}`);
                }
            }
        } catch (error) {
            console.error('❌ Migration from JSON failed:', error);
        }
    }

    async close() {
        if (this.db) {
            await this.db.close();
            console.log('💾 Database connection closed');
        }
    }
}

module.exports = DatabaseService;
