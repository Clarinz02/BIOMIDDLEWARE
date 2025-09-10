import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test configuration
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
const originalConsole = global.console;

beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidDate(): R;
      toBeValidJWT(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
  
  toBeValidDate(received: any) {
    const date = new Date(received);
    const pass = date instanceof Date && !isNaN(date.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
  
  toBeValidJWT(received: string) {
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    const pass = jwtRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid JWT`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid JWT`,
        pass: false,
      };
    }
  },
});

// Test data factories
export const createTestUser = (overrides: Partial<any> = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'user' as const,
  branchId: 'branch-1',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createTestDevice = (overrides: Partial<any> = {}) => ({
  id: 'device-1',
  name: 'Test Device',
  type: 'fingerprint' as const,
  brand: 'TestBrand',
  model: 'TestModel',
  ipAddress: '192.168.1.100',
  port: 4370,
  serialNumber: 'TEST123456',
  branchId: 'branch-1',
  location: 'Test Location',
  isActive: true,
  lastSeen: new Date().toISOString(),
  status: 'connected' as const,
  health: {
    status: 'healthy' as const,
    lastCheck: new Date().toISOString(),
    uptime: 86400,
    memoryUsage: 50,
    diskUsage: 30,
    errors: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createTestBranch = (overrides: Partial<any> = {}) => ({
  id: 'branch-1',
  name: 'Test Branch',
  code: 'TB001',
  address: '123 Test Street',
  city: 'Test City',
  state: 'Test State',
  country: 'Test Country',
  timezone: 'UTC',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Test server utilities
export const getTestPort = () => {
  return parseInt(process.env.TEST_PORT || '0', 10);
};

export const delay = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Mock external dependencies
export const mockExternalDependencies = () => {
  // Mock file system operations
  jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
  }));
  
  // Mock crypto
  jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
    randomBytes: jest.fn(() => Buffer.from('test-random-bytes')),
    createHash: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(() => 'test-hash'),
    })),
  }));
  
  // Mock bcrypt
  jest.mock('bcrypt', () => ({
    hash: jest.fn(() => Promise.resolve('hashed-password')),
    compare: jest.fn(() => Promise.resolve(true)),
    genSalt: jest.fn(() => Promise.resolve('test-salt')),
  }));
  
  // Mock jsonwebtoken
  jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(() => 'test.jwt.token'),
    verify: jest.fn(() => ({ userId: 'test-user-id', role: 'admin' })),
    decode: jest.fn(() => ({ userId: 'test-user-id', role: 'admin' })),
  }));
};

// Cleanup utilities
export const cleanupTestFiles = async () => {
  // Implementation would clean up any test files created during tests
  // This is a placeholder for actual cleanup logic
};

console.log('Test setup completed');
