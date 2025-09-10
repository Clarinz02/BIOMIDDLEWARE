import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

export default async () => {
  console.log('Global test setup starting...');
  
  // Load test environment
  dotenv.config({ path: '.env.test' });
  
  // Ensure test directories exist
  const testDirs = [
    './test-data',
    './test-results',
    './coverage',
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }
  
  // Create test environment file if it doesn't exist
  const testEnvPath = '.env.test';
  try {
    await fs.access(testEnvPath);
  } catch {
    const testEnvContent = `# Test Environment Variables
NODE_ENV=test
PORT=0
JWT_SECRET=test-jwt-secret-key-for-testing-only
JWT_EXPIRES_IN=1h
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=error
DB_PATH=./test-data
HEALTH_CHECK_INTERVAL=30000
WEBSOCKET_HEARTBEAT_INTERVAL=30000
API_VERSION=v1
TEST_PORT=0
`;
    await fs.writeFile(testEnvPath, testEnvContent);
    console.log('Created test environment file');
  }
  
  // Set test-specific environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.DB_PATH = './test-data';
  
  console.log('Global test setup completed');
};
