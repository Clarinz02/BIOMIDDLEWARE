#!/bin/bash

echo "🚀 Starting Mock Biometric Devices..."
echo "========================================="

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Kill any existing mock devices
pkill -f "mock-device.js" 2>/dev/null

# Start mock devices in background
echo "📱 Starting branch-main device on port 4001..."
node mock-device.js 4001 "branch-main" "main123" &
MAIN_PID=$!

echo "🏢 Starting branch-warehouse device on port 4002..."
node mock-device.js 4002 "branch-warehouse" "warehouse456" &
WAREHOUSE_PID=$!

echo "🔒 Starting branch-security device on port 4003..."
node mock-device.js 4003 "branch-security" "security789" &
SECURITY_PID=$!

echo "🏨 Starting reception-desk device on port 4004..."
node mock-device.js 4004 "reception-desk" "reception123" &
RECEPTION_PID=$!

# Wait a moment for devices to start
sleep 2

echo ""
echo "✅ All mock devices started!"
echo "========================================="
echo "📋 Device Status:"
echo "   branch-main:      http://127.0.0.1:4001 (PID: $MAIN_PID)"
echo "   branch-warehouse: http://127.0.0.1:4002 (PID: $WAREHOUSE_PID)"
echo "   branch-security:  http://127.0.0.1:4003 (PID: $SECURITY_PID)"
echo "   reception-desk:   http://127.0.0.1:4004 (PID: $RECEPTION_PID)"
echo ""
echo "🧪 Test endpoints:"
echo "   curl http://127.0.0.1:4001/health"
echo "   curl -H 'x-api-key: main123' http://127.0.0.1:4001/status"
echo ""
echo "🛑 To stop all devices: pkill -f mock-device.js"
echo "⌨️  Press Ctrl+C to stop all devices"

# Wait for interrupt
wait
