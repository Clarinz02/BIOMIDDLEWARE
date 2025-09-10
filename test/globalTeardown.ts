import { promises as fs } from 'fs';
import path from 'path';

export default async () => {
  console.log('Global test teardown starting...');
  
  // Clean up test data directory
  try {
    const testDataPath = './test-data';
    const files = await fs.readdir(testDataPath);
    
    for (const file of files) {
      const filePath = path.join(testDataPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile()) {
        await fs.unlink(filePath);
      }
    }
    
    console.log('Cleaned up test data directory');
  } catch (error) {
    // Ignore if directory doesn't exist or is already clean
  }
  
  // Clean up any other test artifacts
  try {
    // Remove temporary test files
    const tempFiles = [
      './test-temp.json',
      './test-config.json',
    ];
    
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  } catch (error) {
    console.warn('Warning during cleanup:', error);
  }
  
  console.log('Global test teardown completed');
};
