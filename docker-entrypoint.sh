#!/bin/sh
set -e

# MAX Proxy sessions persist in the Docker volume (.data)
mkdir -p /app/.data/max-proxy-sessions
rm -rf /app/sessions
ln -s /app/.data/max-proxy-sessions /app/sessions
chown -R nextjs:nodejs /app/.data

exec su-exec nextjs node server.js
