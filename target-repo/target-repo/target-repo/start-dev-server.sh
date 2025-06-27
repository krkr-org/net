#!/bin/bash

# Get the local IP address (works on most Linux systems)
LOCAL_IP=$(hostname -I | awk '{print $1}')

# Alternative method if the above doesn't work
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+')
fi

# Fallback to a common method
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
fi

PORT=8080

echo "🚀 Starting development server..."
echo "📱 Access from your mobile device at: http://$LOCAL_IP:$PORT"
echo "💻 Local access: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start Python HTTP server
python3 -m http.server $PORT --bind 0.0.0.0