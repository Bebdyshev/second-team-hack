#!/bin/bash
# Run this to get your Mac's IP for mobile config
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then
  echo "Could not get IP. Try: ipconfig getifaddr en0"
  exit 1
fi
echo ""
echo "Your Mac IP: $IP"
echo ""
echo "Edit mobile/src/config.ts and change:"
echo "  const YOUR_MAC_IP = '$IP';"
echo ""
