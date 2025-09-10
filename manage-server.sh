#!/bin/bash
# Multi-Device Biometric Server Management Script

PID_FILE="server.pid"
LOG_FILE="server.log"

case "$1" in
    start)
        echo "🚀 Starting Multi-Device Biometric Server..."
        if [ -f $PID_FILE ]; then
            PID=$(cat $PID_FILE)
            if kill -0 $PID 2>/dev/null; then
                echo "❌ Server is already running (PID: $PID)"
                exit 1
            else
                echo "🔄 Removing stale PID file..."
                rm -f $PID_FILE
            fi
        fi
        
        nohup node simple-server.js > $LOG_FILE 2>&1 &
        SERVER_PID=$!
        echo $SERVER_PID > $PID_FILE
        echo "✅ Server started successfully (PID: $SERVER_PID)"
        echo "📄 Logs: tail -f $LOG_FILE"
        echo "🌐 Access: http://localhost:3000"
        ;;
    
    stop)
        echo "🛑 Stopping Multi-Device Biometric Server..."
        if [ -f $PID_FILE ]; then
            PID=$(cat $PID_FILE)
            if kill -0 $PID 2>/dev/null; then
                kill $PID
                rm -f $PID_FILE
                echo "✅ Server stopped successfully"
            else
                echo "❌ Server is not running"
                rm -f $PID_FILE
            fi
        else
            # Fallback: kill any node simple-server.js process
            pkill -f "node simple-server.js" 2>/dev/null
            echo "🔄 Stopped any running server processes"
        fi
        ;;
    
    restart)
        echo "🔄 Restarting Multi-Device Biometric Server..."
        $0 stop
        sleep 2
        $0 start
        ;;
    
    status)
        if [ -f $PID_FILE ]; then
            PID=$(cat $PID_FILE)
            if kill -0 $PID 2>/dev/null; then
                echo "✅ Server is running (PID: $PID)"
                echo "🌐 Access: http://localhost:3000"
                
                # Test API endpoint
                if curl -s http://localhost:3000/api/devices > /dev/null; then
                    DEVICE_COUNT=$(curl -s http://localhost:3000/api/devices | grep -o '"totalDevices":[0-9]*' | cut -d: -f2)
                    echo "📱 Managing $DEVICE_COUNT devices"
                else
                    echo "⚠️ Server running but API not responding"
                fi
            else
                echo "❌ Server is not running"
                rm -f $PID_FILE
            fi
        else
            echo "❌ Server is not running"
        fi
        ;;
    
    logs)
        if [ -f $LOG_FILE ]; then
            echo "📄 Showing server logs (Press Ctrl+C to exit):"
            tail -f $LOG_FILE
        else
            echo "❌ No log file found"
        fi
        ;;
    
    devices)
        echo "📱 Current Device Status:"
        if curl -s http://localhost:3000/api/devices > /dev/null; then
            curl -s http://localhost:3000/api/devices | python3 -m json.tool 2>/dev/null || \
            curl -s http://localhost:3000/api/devices
        else
            echo "❌ Server not responding or not running"
        fi
        ;;
    
    *)
        echo "Multi-Device Biometric Server Management"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|devices}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the server"
        echo "  stop     - Stop the server"
        echo "  restart  - Restart the server"
        echo "  status   - Show server status"
        echo "  logs     - Show server logs (real-time)"
        echo "  devices  - Show current device status"
        echo ""
        echo "Examples:"
        echo "  ./manage-server.sh start"
        echo "  ./manage-server.sh devices"
        echo "  ./manage-server.sh logs"
        ;;
esac
