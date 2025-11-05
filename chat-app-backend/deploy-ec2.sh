#!/bin/bash

# AWS EC2 Deployment Script for Spring Boot Chat Application

echo "🚀 Starting deployment process..."

# Update system packages
echo "📦 Updating system packages..."
sudo yum update -y

# Install Java 17 (Amazon Corretto)
echo "☕ Installing Java 17..."
sudo yum install -y java-17-amazon-corretto-devel

# Set JAVA_HOME
echo "🔧 Setting JAVA_HOME..."
export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto' >> ~/.bashrc

# Install Maven (optional, we'll use mvnw)
echo "🔨 Installing Maven..."
sudo yum install -y maven

# Install Git
echo "📥 Installing Git..."
sudo yum install -y git

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/chat-app
sudo chown ec2-user:ec2-user /opt/chat-app
cd /opt/chat-app

# Clone or upload your application
echo "📋 Clone your repository here or upload your JAR file"
echo "git clone https://github.com/ashishsaw11/RtimeChat.git"

# Create systemd service file
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/chat-app.service > /dev/null <<EOF
[Unit]
Description=Spring Boot Chat Application
After=network.target

[Service]
Type=forking
User=ec2-user
WorkingDirectory=/opt/chat-app/chat-app-backend
ExecStart=/usr/bin/java -jar -Dspring.profiles.active=prod target/chat-app-backend-0.0.1-SNAPSHOT.jar
SuccessExitStatus=143
TimeoutStopSec=10
Restart=on-failure
RestartSec=5

# Environment variables
Environment=PORT=8080
Environment=MONGODB_URI=mongodb+srv://sawashishkumar327:QfVK0ogY0EOQ5Ptf@cluster0.0eme8jm.mongodb.net/Chatdb?retryWrites=true&w=majority

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
echo "🔄 Enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable chat-app.service

# Install and configure Nginx as reverse proxy
echo "🌐 Installing Nginx..."
sudo yum install -y nginx

# Configure Nginx
sudo tee /etc/nginx/conf.d/chat-app.conf > /dev/null <<EOF
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # WebSocket upgrade
    location /chat {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Media files
    location /media {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location /actuator/health {
        proxy_pass http://localhost:8080;
        access_log off;
    }
}
EOF

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

echo "✅ Deployment script completed!"
echo "📝 Next steps:"
echo "1. Upload your application JAR file to /opt/chat-app/chat-app-backend/target/"
echo "2. Update YOUR_DOMAIN_OR_IP in /etc/nginx/conf.d/chat-app.conf"
echo "3. Start the application: sudo systemctl start chat-app"
echo "4. Check status: sudo systemctl status chat-app"
echo "5. View logs: sudo journalctl -u chat-app -f"