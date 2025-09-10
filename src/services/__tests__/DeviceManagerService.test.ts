import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';

import { DeviceManagerService } from '../DeviceManagerService';
import { createTestDevice, createTestBranch, delay } from '../../../test/setup';
import type { Device, DeviceGroup, DeviceTemplate, BulkOperation } from '../../types';

// Mock file system operations
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DeviceManagerService', () => {
  let deviceManager: DeviceManagerService;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock file system calls
    mockedFs.readFile.mockImplementation((path) => {
      if (path.toString().includes('devices.json')) {
        return Promise.resolve(JSON.stringify([]));
      }
      if (path.toString().includes('groups.json')) {
        return Promise.resolve(JSON.stringify([]));
      }
      if (path.toString().includes('templates.json')) {
        return Promise.resolve(JSON.stringify([]));
      }
      return Promise.reject(new Error('File not found'));
    });
    
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.access.mockResolvedValue(undefined);
    
    deviceManager = new DeviceManagerService();
    await deviceManager.initialize();
  });
  
  afterEach(async () => {
    await deviceManager.shutdown();
  });
  
  describe('Device Management', () => {
    describe('addDevice', () => {
      it('should add a new device', async () => {
        const testDevice = createTestDevice();
        
        const addedDevice = await deviceManager.addDevice(testDevice);
        
        expect(addedDevice).toMatchObject(testDevice);
        expect(addedDevice.createdAt).toBeValidDate();
        expect(addedDevice.updatedAt).toBeValidDate();
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
      
      it('should throw error for duplicate device ID', async () => {
        const testDevice = createTestDevice();
        
        await deviceManager.addDevice(testDevice);
        
        await expect(deviceManager.addDevice(testDevice))
          .rejects.toThrow('Device with ID device-1 already exists');
      });
      
      it('should emit device-added event', async () => {
        const testDevice = createTestDevice();
        const eventSpy = jest.fn();
        
        deviceManager.on('device-added', eventSpy);
        
        await deviceManager.addDevice(testDevice);
        
        expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining(testDevice));
      });
    });
    
    describe('updateDevice', () => {
      it('should update an existing device', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const updates = { name: 'Updated Device Name', location: 'New Location' };
        const updatedDevice = await deviceManager.updateDevice(testDevice.id, updates);
        
        expect(updatedDevice.name).toBe('Updated Device Name');
        expect(updatedDevice.location).toBe('New Location');
        expect(updatedDevice.updatedAt).not.toBe(testDevice.updatedAt);
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
      
      it('should throw error for non-existent device', async () => {
        await expect(deviceManager.updateDevice('non-existent', {}))
          .rejects.toThrow('Device not found');
      });
      
      it('should emit device-updated event', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const eventSpy = jest.fn();
        deviceManager.on('device-updated', eventSpy);
        
        await deviceManager.updateDevice(testDevice.id, { name: 'New Name' });
        
        expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }));
      });
    });
    
    describe('removeDevice', () => {
      it('should remove a device', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const removed = await deviceManager.removeDevice(testDevice.id);
        
        expect(removed).toBe(true);
        expect(deviceManager.getDevice(testDevice.id)).toBeNull();
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
      
      it('should return false for non-existent device', async () => {
        const removed = await deviceManager.removeDevice('non-existent');
        expect(removed).toBe(false);
      });
      
      it('should emit device-removed event', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const eventSpy = jest.fn();
        deviceManager.on('device-removed', eventSpy);
        
        await deviceManager.removeDevice(testDevice.id);
        
        expect(eventSpy).toHaveBeenCalledWith(testDevice.id);
      });
    });
    
    describe('getDevice', () => {
      it('should return device by ID', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const found = deviceManager.getDevice(testDevice.id);
        
        expect(found).toMatchObject(testDevice);
      });
      
      it('should return null for non-existent device', () => {
        const found = deviceManager.getDevice('non-existent');
        expect(found).toBeNull();
      });
    });
    
    describe('getDevices', () => {
      it('should return all devices when no filter provided', async () => {
        const device1 = createTestDevice({ id: 'device-1', branchId: 'branch-1' });
        const device2 = createTestDevice({ id: 'device-2', branchId: 'branch-2' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const devices = deviceManager.getDevices();
        
        expect(devices).toHaveLength(2);
        expect(devices.map(d => d.id)).toEqual(['device-1', 'device-2']);
      });
      
      it('should filter devices by branch', async () => {
        const device1 = createTestDevice({ id: 'device-1', branchId: 'branch-1' });
        const device2 = createTestDevice({ id: 'device-2', branchId: 'branch-2' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const devices = deviceManager.getDevices({ branchId: 'branch-1' });
        
        expect(devices).toHaveLength(1);
        expect(devices[0].id).toBe('device-1');
      });
      
      it('should filter devices by status', async () => {
        const device1 = createTestDevice({ id: 'device-1', status: 'connected' });
        const device2 = createTestDevice({ id: 'device-2', status: 'disconnected' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const devices = deviceManager.getDevices({ status: 'connected' });
        
        expect(devices).toHaveLength(1);
        expect(devices[0].id).toBe('device-1');
      });
      
      it('should filter devices by type', async () => {
        const device1 = createTestDevice({ id: 'device-1', type: 'fingerprint' });
        const device2 = createTestDevice({ id: 'device-2', type: 'face' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const devices = deviceManager.getDevices({ type: 'face' });
        
        expect(devices).toHaveLength(1);
        expect(devices[0].id).toBe('device-2');
      });
      
      it('should filter devices by active status', async () => {
        const device1 = createTestDevice({ id: 'device-1', isActive: true });
        const device2 = createTestDevice({ id: 'device-2', isActive: false });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const devices = deviceManager.getDevices({ isActive: true });
        
        expect(devices).toHaveLength(1);
        expect(devices[0].id).toBe('device-1');
      });
    });
  });
  
  describe('Device Status Management', () => {
    describe('updateDeviceStatus', () => {
      it('should update device status and last seen', async () => {
        const testDevice = createTestDevice({ status: 'disconnected' });
        await deviceManager.addDevice(testDevice);
        
        const eventSpy = jest.fn();
        deviceManager.on('device-status-changed', eventSpy);
        
        await deviceManager.updateDeviceStatus(testDevice.id, 'connected');
        
        const updatedDevice = deviceManager.getDevice(testDevice.id);
        expect(updatedDevice?.status).toBe('connected');
        expect(updatedDevice?.lastSeen).toBeValidDate();
        expect(eventSpy).toHaveBeenCalledWith(testDevice.id, 'connected');
      });
      
      it('should throw error for non-existent device', async () => {
        await expect(deviceManager.updateDeviceStatus('non-existent', 'connected'))
          .rejects.toThrow('Device not found');
      });
      
      it('should not emit event if status unchanged', async () => {
        const testDevice = createTestDevice({ status: 'connected' });
        await deviceManager.addDevice(testDevice);
        
        const eventSpy = jest.fn();
        deviceManager.on('device-status-changed', eventSpy);
        
        await deviceManager.updateDeviceStatus(testDevice.id, 'connected');
        
        expect(eventSpy).not.toHaveBeenCalled();
      });
    });
    
    describe('updateDeviceHealth', () => {
      it('should update device health information', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        const newHealth = {
          status: 'healthy' as const,
          lastCheck: new Date().toISOString(),
          uptime: 7200,
          memoryUsage: 75,
          diskUsage: 45,
          errors: [],
        };
        
        const eventSpy = jest.fn();
        deviceManager.on('device-health-updated', eventSpy);
        
        await deviceManager.updateDeviceHealth(testDevice.id, newHealth);
        
        const updatedDevice = deviceManager.getDevice(testDevice.id);
        expect(updatedDevice?.health).toMatchObject(newHealth);
        expect(eventSpy).toHaveBeenCalledWith(testDevice.id, newHealth);
      });
      
      it('should throw error for non-existent device', async () => {
        const health = {
          status: 'healthy' as const,
          lastCheck: new Date().toISOString(),
          uptime: 0,
          memoryUsage: 0,
          diskUsage: 0,
          errors: [],
        };
        
        await expect(deviceManager.updateDeviceHealth('non-existent', health))
          .rejects.toThrow('Device not found');
      });
    });
  });
  
  describe('Device Groups', () => {
    describe('createGroup', () => {
      it('should create a new device group', async () => {
        const groupData = {
          name: 'Test Group',
          description: 'A test group',
          branchId: 'branch-1',
          deviceIds: ['device-1', 'device-2'],
        };
        
        const group = await deviceManager.createGroup(groupData);
        
        expect(group.id).toBeValidUUID();
        expect(group.name).toBe(groupData.name);
        expect(group.deviceIds).toEqual(groupData.deviceIds);
        expect(group.createdAt).toBeValidDate();
        expect(mockedFs.writeFile).toHaveBeenCalled();
      });
    });
    
    describe('updateGroup', () => {
      it('should update an existing group', async () => {
        const group = await deviceManager.createGroup({
          name: 'Test Group',
          description: 'Original description',
          branchId: 'branch-1',
          deviceIds: [],
        });
        
        const updatedGroup = await deviceManager.updateGroup(group.id, {
          description: 'Updated description',
          deviceIds: ['device-1'],
        });
        
        expect(updatedGroup.description).toBe('Updated description');
        expect(updatedGroup.deviceIds).toEqual(['device-1']);
        expect(updatedGroup.updatedAt).not.toBe(group.updatedAt);
      });
      
      it('should throw error for non-existent group', async () => {
        await expect(deviceManager.updateGroup('non-existent', {}))
          .rejects.toThrow('Group not found');
      });
    });
    
    describe('removeGroup', () => {
      it('should remove a group', async () => {
        const group = await deviceManager.createGroup({
          name: 'Test Group',
          description: 'Test',
          branchId: 'branch-1',
          deviceIds: [],
        });
        
        const removed = await deviceManager.removeGroup(group.id);
        
        expect(removed).toBe(true);
        expect(deviceManager.getGroup(group.id)).toBeNull();
      });
    });
    
    describe('getGroups', () => {
      it('should return groups filtered by branch', async () => {
        const group1 = await deviceManager.createGroup({
          name: 'Group 1',
          description: 'Test',
          branchId: 'branch-1',
          deviceIds: [],
        });
        
        const group2 = await deviceManager.createGroup({
          name: 'Group 2',
          description: 'Test',
          branchId: 'branch-2',
          deviceIds: [],
        });
        
        const branch1Groups = deviceManager.getGroups('branch-1');
        
        expect(branch1Groups).toHaveLength(1);
        expect(branch1Groups[0].id).toBe(group1.id);
      });
    });
  });
  
  describe('Device Templates', () => {
    describe('createTemplate', () => {
      it('should create a device template', async () => {
        const templateData = {
          name: 'Fingerprint Template',
          description: 'Standard fingerprint device template',
          type: 'fingerprint' as const,
          brand: 'TestBrand',
          model: 'TestModel',
          defaultConfig: {
            timeout: 30,
            retries: 3,
            enableSounds: true,
          },
        };
        
        const template = await deviceManager.createTemplate(templateData);
        
        expect(template.id).toBeValidUUID();
        expect(template.name).toBe(templateData.name);
        expect(template.type).toBe(templateData.type);
        expect(template.defaultConfig).toEqual(templateData.defaultConfig);
      });
    });
    
    describe('getTemplates', () => {
      it('should return templates filtered by type', async () => {
        const fpTemplate = await deviceManager.createTemplate({
          name: 'Fingerprint Template',
          description: 'FP template',
          type: 'fingerprint',
          brand: 'Brand1',
          model: 'Model1',
          defaultConfig: {},
        });
        
        const faceTemplate = await deviceManager.createTemplate({
          name: 'Face Template',
          description: 'Face template',
          type: 'face',
          brand: 'Brand2',
          model: 'Model2',
          defaultConfig: {},
        });
        
        const fpTemplates = deviceManager.getTemplates('fingerprint');
        
        expect(fpTemplates).toHaveLength(1);
        expect(fpTemplates[0].id).toBe(fpTemplate.id);
      });
    });
  });
  
  describe('Bulk Operations', () => {
    describe('createBulkOperation', () => {
      it('should create a bulk update operation', async () => {
        const device1 = createTestDevice({ id: 'device-1', branchId: 'branch-1' });
        const device2 = createTestDevice({ id: 'device-2', branchId: 'branch-1' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const operation = await deviceManager.createBulkOperation({
          type: 'update',
          deviceIds: ['device-1', 'device-2'],
          data: { location: 'New Location' },
          userId: 'user-123',
        });
        
        expect(operation.id).toBeValidUUID();
        expect(operation.type).toBe('update');
        expect(operation.deviceIds).toEqual(['device-1', 'device-2']);
        expect(operation.status).toBe('pending');
      });
      
      it('should execute bulk update operation', async (done) => {
        const device1 = createTestDevice({ id: 'device-1' });
        const device2 = createTestDevice({ id: 'device-2' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const operation = await deviceManager.createBulkOperation({
          type: 'update',
          deviceIds: ['device-1', 'device-2'],
          data: { location: 'Bulk Updated Location' },
          userId: 'user-123',
        });
        
        deviceManager.on('bulk-operation-completed', (completedOp) => {
          try {
            expect(completedOp.id).toBe(operation.id);
            expect(completedOp.status).toBe('completed');
            
            const updatedDevice1 = deviceManager.getDevice('device-1');
            const updatedDevice2 = deviceManager.getDevice('device-2');
            
            expect(updatedDevice1?.location).toBe('Bulk Updated Location');
            expect(updatedDevice2?.location).toBe('Bulk Updated Location');
            
            done();
          } catch (error) {
            done(error);
          }
        });
        
        await deviceManager.executeBulkOperation(operation.id);
      });
      
      it('should execute bulk delete operation', async (done) => {
        const device1 = createTestDevice({ id: 'device-1' });
        const device2 = createTestDevice({ id: 'device-2' });
        
        await deviceManager.addDevice(device1);
        await deviceManager.addDevice(device2);
        
        const operation = await deviceManager.createBulkOperation({
          type: 'delete',
          deviceIds: ['device-1', 'device-2'],
          userId: 'user-123',
        });
        
        deviceManager.on('bulk-operation-completed', (completedOp) => {
          try {
            expect(completedOp.id).toBe(operation.id);
            expect(completedOp.status).toBe('completed');
            
            expect(deviceManager.getDevice('device-1')).toBeNull();
            expect(deviceManager.getDevice('device-2')).toBeNull();
            
            done();
          } catch (error) {
            done(error);
          }
        });
        
        await deviceManager.executeBulkOperation(operation.id);
      });
    });
  });
  
  describe('Health Monitoring', () => {
    describe('startHealthChecks', () => {
      it('should start periodic health checks', async () => {
        const device = createTestDevice();
        await deviceManager.addDevice(device);
        
        const eventSpy = jest.fn();
        deviceManager.on('device-health-updated', eventSpy);
        
        deviceManager.startHealthChecks(100); // 100ms interval for testing
        
        await delay(250); // Wait for a few health checks
        
        deviceManager.stopHealthChecks();
        
        expect(eventSpy).toHaveBeenCalled();
      });
    });
  });
  
  describe('Data Persistence', () => {
    describe('saveData', () => {
      it('should save devices to file', async () => {
        const testDevice = createTestDevice();
        await deviceManager.addDevice(testDevice);
        
        await deviceManager.saveData();
        
        expect(mockedFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('devices.json'),
          expect.stringContaining(testDevice.id)
        );
      });
      
      it('should save groups to file', async () => {
        const group = await deviceManager.createGroup({
          name: 'Test Group',
          description: 'Test',
          branchId: 'branch-1',
          deviceIds: [],
        });
        
        await deviceManager.saveData();
        
        expect(mockedFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('groups.json'),
          expect.stringContaining(group.id)
        );
      });
      
      it('should save templates to file', async () => {
        const template = await deviceManager.createTemplate({
          name: 'Test Template',
          description: 'Test',
          type: 'fingerprint',
          brand: 'TestBrand',
          model: 'TestModel',
          defaultConfig: {},
        });
        
        await deviceManager.saveData();
        
        expect(mockedFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('templates.json'),
          expect.stringContaining(template.id)
        );
      });
    });
  });
  
  describe('Initialization and Shutdown', () => {
    it('should load data during initialization', async () => {
      const existingDevice = createTestDevice();
      mockedFs.readFile.mockImplementation((path) => {
        if (path.toString().includes('devices.json')) {
          return Promise.resolve(JSON.stringify([existingDevice]));
        }
        return Promise.resolve(JSON.stringify([]));
      });
      
      const newManager = new DeviceManagerService();
      await newManager.initialize();
      
      const loadedDevice = newManager.getDevice(existingDevice.id);
      expect(loadedDevice).toMatchObject(existingDevice);
      
      await newManager.shutdown();
    });
    
    it('should save data during shutdown', async () => {
      const testDevice = createTestDevice();
      await deviceManager.addDevice(testDevice);
      
      await deviceManager.shutdown();
      
      // Should have saved data during shutdown
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });
  });
});
