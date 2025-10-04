#!/bin/bash
# ChocoDrop Daemon Log Monitor
# Real-time monitoring of daemon requests

echo "🍫 ChocoDrop Daemon Log Monitor"
echo "================================"
echo ""
echo "監視中のエンドポイント:"
echo "  - GET /v1/health"
echo "  - GET /sdk.js"
echo "  - GET /ui/*"
echo "  - GET /vendor/*"
echo "  - GET /generated/*"
echo "  - OPTIONS (preflight)"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Function to colorize output
colorize() {
    while IFS= read -r line; do
        if [[ $line == *"GET /v1/health"* ]]; then
            echo -e "\033[0;32m✓ Health Check: $line\033[0m"
        elif [[ $line == *"GET /sdk.js"* ]]; then
            echo -e "\033[0;36m📦 SDK Load: $line\033[0m"
        elif [[ $line == *"GET /ui/"* ]]; then
            echo -e "\033[0;35m🎨 UI Bundle: $line\033[0m"
        elif [[ $line == *"GET /vendor/"* ]]; then
            echo -e "\033[0;33m📚 Vendor File: $line\033[0m"
        elif [[ $line == *"OPTIONS"* ]]; then
            echo -e "\033[0;34m🔐 CORS Preflight: $line\033[0m"
        elif [[ $line == *"ERROR"* ]] || [[ $line == *"error"* ]]; then
            echo -e "\033[0;31m❌ ERROR: $line\033[0m"
        else
            echo "$line"
        fi
    done
}

# Monitor daemon output
# Note: This assumes the daemon outputs to stdout
# Adjust the monitoring method based on your daemon's logging
tail -f /dev/null 2>&1 | colorize &

echo "ℹ️  Daemon PID: $(pgrep -f 'chocodropd.js' | head -1)"
echo "ℹ️  Daemon URL: http://127.0.0.1:43110"
echo ""
echo "🧪 テストを開始してください:"
echo "   1. https://threejs.org/examples/ を開く"
echo "   2. ブックマークレットをクリック"
echo "   3. このターミナルでリクエストログを確認"
echo ""

# Keep script running
wait
