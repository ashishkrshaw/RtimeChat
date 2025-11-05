#!/bin/bash

# Complete HTTPS Setup for EC2 Chat App Backend
# Usage: ./setup-https-ec2.sh your-domain.com

set -e  # Exit on any error

DOMAIN_NAME=${1:-}

echo "🔐 Setting up HTTPS on EC2 for Chat App..."

# Check if domain provided
if [ -z "$DOMAIN_NAME" ]; then
    echo "❌ Domain name required!"
    echo "Usage: ./setup-https-ec2.sh your-domain.com"
    echo ""
    echo "📋 Free domain options:"
    echo "- No-IP: yourapp.ddns.net"
    echo "- DuckDNS: yourapp.duckdns.org"
    echo "- Freenom: yourapp.tk"
    exit 1
fi

echo "🌐 Setting up HTTPS for domain: $DOMAIN_NAME"

# Step 1: Update system and install requirements
echo "📦 Installing requirements..."
sudo yum update -y
sudo yum install -y certbot python3-certbot-nginx curl

# Step 2: Check if Spring Boot is running
echo "🔍 Checking Spring Boot application..."
if ! curl -s http://localhost:8080/actuator/health > /dev/null; then
    echo "⚠️  Spring Boot not responding on port 8080"
    echo "   Starting application..."
    cd /opt/chat-app/chat-app-backend && ./manage-app.sh start
    sleep 10
fi

# Step 3: Backup existing nginx config
echo "💾 Backing up Nginx configuration..."
sudo cp /etc/nginx/conf.d/chat-app.conf /etc/nginx/conf.d/chat-app.conf.backup 2>/dev/null || true

# Step 4: Create HTTPS Nginx configuration
echo "⚙️  Creating HTTPS Nginx configuration..."
sudo tee /etc/nginx/conf.d/chat-app-https.conf > /dev/null <<EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN_NAME;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;
    
    # SSL certificates (will be configured by certbot)
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    
    # CORS headers for frontend
    add_header Access-Control-Allow-Origin "https://wecord-s3vw.onrender.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
    add_header Access-Control-Allow-Credentials true always;
    
    # Handle preflight requests
    location / {
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "https://wecord-s3vw.onrender.com" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
            add_header Access-Control-Allow-Credentials true always;
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type "text/plain charset=UTF-8";
            add_header Content-Length 0;
            return 204;
        }
        
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Increase timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # WebSocket endpoint for real-time chat
    location /chat {
        proxy_pass http://localhost:8080/chat;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Step 5: Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# Step 6: Remove old config to avoid conflicts
sudo rm -f /etc/nginx/conf.d/chat-app.conf

# Step 7: Restart Nginx
sudo systemctl restart nginx

# Step 8: Get SSL certificate
echo "📜 Getting SSL certificate for $DOMAIN_NAME..."
sudo certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME --redirect

# Step 9: Setup auto-renewal
echo "🔄 Setting up SSL auto-renewal..."
sudo systemctl enable crond
(sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -

# Step 10: Final restart
sudo systemctl restart nginx

# Step 11: Test the setup
echo "🧪 Testing HTTPS setup..."
sleep 5

if curl -k -s https://$DOMAIN_NAME/actuator/health > /dev/null; then
    echo "✅ HTTPS setup successful!"
    echo ""
    echo "🎉 Your chat app backend is now available at:"
    echo "   🌐 https://$DOMAIN_NAME"
    echo ""
    echo "� Next steps:"
    echo "1. Update Render environment variable:"
    echo "   VITE_API_URL=https://$DOMAIN_NAME"
    echo ""
    echo "2. Test endpoints:"
    echo "   curl https://$DOMAIN_NAME/actuator/health"
    echo "   curl https://$DOMAIN_NAME/api/v1/rooms"
    echo ""
    echo "3. Your frontend should now work without Mixed Content errors!"
else
    echo "❌ HTTPS setup failed. Check the logs:"
    echo "   sudo tail -f /var/log/nginx/error.log"
    echo "   ./manage-app.sh logs"
fi

echo ""
echo "📋 SSL Certificate info:"
sudo certbot certificates

echo ""
echo "🔧 Useful commands:"
echo "   sudo certbot renew --dry-run  # Test renewal"
echo "   sudo systemctl status nginx   # Check Nginx status"
echo "   ./manage-app.sh status       # Check app status"