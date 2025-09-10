#!/bin/bash

# Test runner script for CI/CD pipeline
set -e

echo "🧪 Starting test suite..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm ci
fi

# Clean previous test results
print_status "Cleaning previous test results..."
npm run clean 2>/dev/null || true

# Run linting
print_status "Running ESLint..."
npm run lint

# Check code formatting
print_status "Checking code formatting..."
npm run format:check

# Run TypeScript compilation
print_status "Compiling TypeScript..."
npm run build

# Set test environment variables
export NODE_ENV=test
export LOG_LEVEL=error
export JWT_SECRET=test-jwt-secret-for-ci
export DB_PATH=./test-data

# Create test directories
mkdir -p test-data test-results coverage

# Run unit tests
print_status "Running unit tests..."
npm run test:unit

# Run integration tests
print_status "Running integration tests..."
npm run test:integration

# Run e2e tests
print_status "Running end-to-end tests..."
npm run test:e2e

# Generate coverage report
print_status "Running full test suite with coverage..."
npm run test:coverage

# Check coverage thresholds
print_status "Checking coverage thresholds..."
if [ -f "coverage/lcov-report/index.html" ]; then
    print_status "Coverage report generated: coverage/lcov-report/index.html"
fi

# Generate JUnit XML for CI
if [ -f "test-results/junit.xml" ]; then
    print_status "JUnit XML report generated: test-results/junit.xml"
fi

# Output test results summary
if [ -f "coverage/coverage-summary.json" ]; then
    print_status "Test Results Summary:"
    echo "======================"
    
    # Extract coverage percentages (requires jq, fallback to cat if not available)
    if command -v jq &> /dev/null; then
        TOTAL_COVERAGE=$(cat coverage/coverage-summary.json | jq -r '.total.lines.pct')
        BRANCH_COVERAGE=$(cat coverage/coverage-summary.json | jq -r '.total.branches.pct')
        FUNCTION_COVERAGE=$(cat coverage/coverage-summary.json | jq -r '.total.functions.pct')
        STATEMENT_COVERAGE=$(cat coverage/coverage-summary.json | jq -r '.total.statements.pct')
        
        echo "Lines Coverage:      ${TOTAL_COVERAGE}%"
        echo "Branches Coverage:   ${BRANCH_COVERAGE}%"
        echo "Functions Coverage:  ${FUNCTION_COVERAGE}%"
        echo "Statements Coverage: ${STATEMENT_COVERAGE}%"
        
        # Check if coverage meets minimum thresholds
        if (( $(echo "$TOTAL_COVERAGE >= 80" | bc -l) )); then
            print_status "✅ Coverage threshold met!"
        else
            print_warning "⚠️  Coverage below threshold (80%)"
        fi
    else
        print_warning "jq not installed, showing raw coverage summary:"
        cat coverage/coverage-summary.json
    fi
fi

print_status "✅ All tests completed successfully!"

# Cleanup test environment
unset NODE_ENV LOG_LEVEL JWT_SECRET DB_PATH

echo ""
print_status "📊 Test artifacts generated:"
echo "  - Coverage Report: coverage/lcov-report/index.html"
echo "  - JUnit XML:       test-results/junit.xml"
echo "  - Build Output:    dist/"

exit 0
