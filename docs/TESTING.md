# Testing Guide

This document provides comprehensive information about the testing strategy, setup, and execution for the Biometric Device Middleware project.

## Overview

The project uses a comprehensive testing strategy with multiple layers:

- **Unit Tests**: Test individual functions, classes, and modules in isolation
- **Integration Tests**: Test API endpoints and service interactions
- **End-to-End Tests**: Test complete workflows from client to server
- **Performance Tests**: Load and stress testing (future enhancement)

## Technology Stack

- **Jest**: Testing framework
- **Supertest**: HTTP assertion library for API testing
- **Socket.io-client**: WebSocket testing
- **TypeScript**: Full TypeScript support in tests
- **Coverage**: Istanbul/nyc for code coverage

## Test Structure

```
├── src/
│   ├── __tests__/           # E2E and integration tests
│   ├── middleware/
│   │   └── __tests__/       # Unit tests for middleware
│   └── services/
│       └── __tests__/       # Unit tests for services
├── test/
│   ├── setup.ts            # Global test setup
│   ├── globalSetup.ts      # Jest global setup
│   └── globalTeardown.ts   # Jest global teardown
└── jest.config.js          # Jest configuration
```

## Test Categories

### Unit Tests

Test individual components in isolation:

```typescript
// Example: Testing SecurityService
describe('SecurityService', () => {
  it('should generate JWT token for user', async () => {
    const user = createTestUser();
    const token = await securityService.generateToken(user);
    expect(token).toBeValidJWT();
  });
});
```

**Location**: `src/{module}/__tests__/{module}.test.ts`

**Run with**: `npm run test:unit`

### Integration Tests

Test API endpoints and service interactions:

```typescript
// Example: Testing device endpoints
describe('Device Management API', () => {
  it('should create device via POST /api/v1/devices', async () => {
    const response = await request(app)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send(deviceData);
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

**Location**: `src/__tests__/{feature}.integration.test.ts`

**Run with**: `npm run test:integration`

### End-to-End Tests

Test complete user workflows:

```typescript
// Example: Complete device lifecycle
it('should handle complete device lifecycle', async () => {
  // 1. Login
  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send(credentials);
  
  // 2. Create device
  // 3. Update device
  // 4. Delete device
  // 5. Verify deletion
});
```

**Location**: `src/__tests__/e2e.test.ts`

**Run with**: `npm run test:e2e`

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test type
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage
npm run test:coverage

# Run for CI (no watch, with coverage)
npm run test:ci
```

### Using the Test Script

```bash
# Run comprehensive test suite
./scripts/test.sh
```

This script will:
1. Install dependencies
2. Run linting and formatting checks
3. Compile TypeScript
4. Run all test suites
5. Generate coverage reports
6. Output results summary

### Environment Setup

Tests use environment variables for configuration:

```bash
# Required for testing
NODE_ENV=test
LOG_LEVEL=error
JWT_SECRET=test-jwt-secret-key
DB_PATH=./test-data
TEST_PORT=0  # Random port assignment
```

## Test Configuration

### Jest Configuration

Key configuration in `jest.config.js`:

```javascript
module.exports = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
```

### Custom Matchers

The test suite includes custom Jest matchers:

```typescript
// Custom matchers available in all tests
expect(uuid).toBeValidUUID();
expect(dateString).toBeValidDate();
expect(jwtToken).toBeValidJWT();
```

## Test Utilities

### Test Data Factories

```typescript
// Create test data easily
const user = createTestUser({ role: 'admin' });
const device = createTestDevice({ status: 'connected' });
const branch = createTestBranch({ name: 'Test Branch' });
```

### Mock Utilities

```typescript
// Mock external dependencies
mockExternalDependencies();

// Individual service mocks
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('fs/promises');
```

## WebSocket Testing

Testing real-time features with Socket.io:

```typescript
// Connect WebSocket client
const clientSocket = ClientIO(`http://localhost:${port}`, {
  auth: { token: authToken }
});

// Test event subscription
clientSocket.emit('subscribe', {
  type: 'device-events',
  deviceId: 'test-device'
});

// Verify event reception
clientSocket.on('device-status', (data) => {
  expect(data.deviceId).toBe('test-device');
  expect(data.status).toBe('connected');
});
```

## Coverage Reports

### Viewing Coverage

After running tests with coverage:

```bash
# Open coverage report in browser
open coverage/lcov-report/index.html

# View summary in terminal
cat coverage/coverage-summary.json
```

### Coverage Thresholds

The project maintains minimum coverage thresholds:
- **Lines**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Statements**: 80%

### Coverage Exclusions

Excluded from coverage:
- Type definition files (`*.d.ts`)
- Test files (`*.test.ts`, `*.spec.ts`)
- Test directories (`__tests__/`)

## Mocking Strategies

### External Dependencies

```typescript
// File system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

// Authentication libraries
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock.jwt.token'),
  verify: jest.fn(() => ({ userId: 'test' })),
}));
```

### Service Dependencies

```typescript
// Mock DeviceManager for WebSocket tests
const mockDeviceManager = {
  getDevice: jest.fn(),
  getDevices: jest.fn(() => []),
  on: jest.fn(),
  off: jest.fn(),
};
```

## Best Practices

### Test Organization

1. **Group related tests** using `describe` blocks
2. **Use descriptive test names** that explain the scenario
3. **Follow AAA pattern**: Arrange, Act, Assert
4. **Clean up after tests** using `afterEach` hooks

### Test Data

1. **Use factories** for creating test data
2. **Make tests independent** - don't rely on other tests
3. **Use realistic data** that mirrors production scenarios
4. **Clean up test data** after each test

### Async Testing

```typescript
// Proper async test handling
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// WebSocket events with promises
it('should receive WebSocket event', () => {
  return new Promise<void>((resolve, reject) => {
    socket.on('event', (data) => {
      try {
        expect(data).toBeDefined();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    triggerEvent();
  });
});
```

### Error Testing

```typescript
// Test error scenarios
it('should handle invalid input', async () => {
  await expect(service.processInvalidData({}))
    .rejects.toThrow('Invalid data provided');
});

// Test HTTP errors
it('should return 400 for invalid request', async () => {
  const response = await request(app)
    .post('/api/endpoint')
    .send(invalidData);
    
  expect(response.status).toBe(400);
  expect(response.body.error).toBeDefined();
});
```

## Debugging Tests

### Running Specific Tests

```bash
# Run single test file
npm test -- src/services/__tests__/DeviceManagerService.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should create device"

# Run tests for specific file
npm test -- --testPathPattern="security"
```

### Debug Mode

```bash
# Run tests with Node.js inspector
node --inspect-brk node_modules/.bin/jest --runInBand

# With VS Code, use built-in debugger
# Add breakpoints and run "Jest Debug" configuration
```

## Continuous Integration

### GitHub Actions

The CI pipeline automatically:
1. Runs tests on multiple Node.js versions
2. Generates and uploads coverage reports
3. Creates test result artifacts
4. Performs security audits
5. Builds and deploys on success

### Coverage Integration

- **Codecov**: Uploads coverage reports for tracking
- **GitHub**: Shows coverage in PR comments
- **Artifacts**: Stores test results for later analysis

## Common Issues & Solutions

### Port Conflicts

Tests use random ports to avoid conflicts:

```typescript
// Get available port
const port = getTestPort() || 0;
server.listen(port, () => {
  // Server started on random available port
});
```

### Async Test Timeouts

```typescript
// Increase timeout for slow operations
jest.setTimeout(30000);

// Or per test
it('slow operation', async () => {
  // test code
}, 30000);
```

### Memory Leaks

```typescript
// Proper cleanup
afterEach(async () => {
  await server.close();
  await service.shutdown();
});
```

### Mock Persistence

```typescript
// Clear mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Performance Testing (Future)

Planning to add:
- Load testing with Artillery
- Memory usage monitoring
- Response time benchmarks
- Stress testing for concurrent connections

## Reporting Issues

When reporting test failures:
1. Include full error message and stack trace
2. Specify Node.js version and OS
3. Provide steps to reproduce
4. Include relevant test logs
5. Check if issue exists in CI environment

---

For more information, see:
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Guide](https://github.com/visionmedia/supertest)
- [Socket.io Testing](https://socket.io/docs/v4/testing/)
