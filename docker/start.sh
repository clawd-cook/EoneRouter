#! /bin/bash

cp /home/docker/nginx.conf /etc/nginx/nginx.conf

sudo /usr/sbin/nginx

echo "Nginx started successfully!"

cd /home/ && npm run start

echo "Server started successfully!"
