#!/bin/bash

echo "🚀 Starting Complete Biometric Device Management System"
echo "======================================================"

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "✅ Port $port is already in use"
        return 0
    else
        echo "❌ Port $port is free"
        return 1
    fi
}

# Function to wait for service to start
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_wait=10
    local count=0
    
    echo "⏳ Waiting for $service_name to start on port $port..."
    while [ $count -lt $max_wait ]; do
        if curl -s http://localhost:$port >/dev/null 2>&1; then
            echo "✅ $service_name is ready on port $port"
            return 0
        fi
        sleep 1
        ((count++))
    done
    echo "❌ $service_name failed to start on port $port"
    return 1
}

# Step 1: Start Mock Devices
echo ""
echo "📱 Step 1: Starting Mock Biometric Devices..."
if ! check_port 4001 || ! check_port 4002 || ! check_port 4003 || ! check_port 4004; then
    echo "🔧 Starting mock devices..."
    nohup ./start-mock-devices.sh > mock-devices-system.log 2>&1 &
    sleep 3
else
    echo "✅ Mock devices are already running"
fi

# Step 2: Start Main Server
echo ""
echo "🖥️  Step 2: Starting Main Biometric Server..."
if ! check_port 5173; then
    echo "🔧 Starting main server..."
    nohup node server.js > main-server-system.log 2>&1 &
    wait_for_service 5173 "Main Server"
else
    echo "✅ Main server is already running on port 5173"
fi

echo ""
echo "🎉 System Startup Complete!"
echo "======================================================"
echo ""
echo "🌍 Frontend Dashboard: http://localhost:5173"
echo "📡 API Base URL:       http://localhost:5173/api"
echo ""
echo "📈 System Status:"
echo "  🖥️  Main Server:     http://localhost:5173"
echo "  📱 Mock Devices:     4001, 4002, 4003, 4004"
echo ""
echo "🔗 Quick Links:"
echo "  📋 Device Status:    http://localhost:5173/api/devices"
echo "  🏥 Health Check:     http://localhost:5173/api/health"
echo "  📈 Dashboard:        http://localhost:5173"
echo ""
echo "🛑 To stop everything: ./stop-system.sh"
echo "📄 View logs:          tail -f main-server-system.log"
echo ""
