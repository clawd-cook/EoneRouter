#! /bin/bash

cp /home/docker/nginx.conf /etc/nginx/nginx.conf

sudo /usr/sbin/nginx

echo "Nginx started successfully!"

# Force IPv4 loopback for world-local queue self-fetch.
# `localhost` may resolve to ::1 while eve listens on 127.0.0.1 → TypeError: fetch failed.
export WORKFLOW_LOCAL_BASE_URL="${WORKFLOW_LOCAL_BASE_URL:-http://127.0.0.1:3001}"

cd /home/ && npm run start

echo "Server started successfully!"
