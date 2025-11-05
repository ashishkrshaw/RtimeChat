#!/bin/bash

# Application management script for EC2

APP_NAME="chat-app"
JAR_FILE="/opt/chat-app/chat-app-backend/target/chat-app-backend-0.0.1-SNAPSHOT.jar"
LOG_FILE="/var/log/chat-app.log"

case "$1" in
    start)
        echo "🚀 Starting $APP_NAME..."
        sudo systemctl start $APP_NAME
        ;;
    stop)
        echo "🛑 Stopping $APP_NAME..."
        sudo systemctl stop $APP_NAME
        ;;
    restart)
        echo "🔄 Restarting $APP_NAME..."
        sudo systemctl restart $APP_NAME
        ;;
    status)
        echo "📊 Status of $APP_NAME:"
        sudo systemctl status $APP_NAME
        ;;
    logs)
        echo "📋 Logs for $APP_NAME:"
        sudo journalctl -u $APP_NAME -f
        ;;
    build)
        echo "🔨 Building application..."
        cd /opt/chat-app/chat-app-backend
        ./mvnw clean package -DskipTests
        ;;
    deploy)
        echo "🚀 Deploying application..."
        cd /opt/chat-app/chat-app-backend
        ./mvnw clean package -DskipTests
        sudo systemctl restart $APP_NAME
        echo "✅ Deployment completed!"
        ;;
    health)
        echo "🏥 Checking application health..."
        curl -f http://localhost:8080/actuator/health || echo "❌ Application is not healthy"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|build|deploy|health}"
        exit 1
        ;;
esac