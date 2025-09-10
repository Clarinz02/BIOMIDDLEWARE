#!/bin/bash

echo "🛑 Stopping Complete Biometric Device Management System"
echo "========================================================"

echo "📱 Stopping mock biometric devices..."
pkill -f "mock-device.js" 2>/dev/null || echo "No mock devices to stop"

echo "🖥️  Stopping main server..."
pkill -f "node server.js" 2>/dev/null || echo "No main server to stop"

echo "🧹 Stopping any other related processes..."
pkill -f "simple-server.js" 2>/dev/null || true
pkill -f "start-mock-devices.sh" 2>/dev/null || true

sleep 2

echo ""
echo "✅ All services stopped!"
echo ""
echo "🔄 To start again: ./start-system.sh"
echo ""
