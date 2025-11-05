package com.chat.controllers;

import com.chat.entities.Message;
import com.chat.entities.Room;
import com.chat.payload.MessageRequest;
import com.chat.repositories.RoomRepository;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestBody;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
    



@Controller
@CrossOrigin(origins = {"https://your-app-name.onrender.com", "https://wecord-s3vw.onrender.com", "http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:3000"})
public class ChatController {


    private RoomRepository roomRepository;
    private SimpMessagingTemplate messagingTemplate;

    public ChatController(RoomRepository roomRepository, SimpMessagingTemplate messagingTemplate) {
        this.roomRepository = roomRepository;
        this.messagingTemplate = messagingTemplate;
    }


    //for sending and receiving messages
    @MessageMapping("/sendMessage/{roomId}")// /app/sendMessage/roomId
    @SendTo("/topic/room/{roomId}")//subscribe
    public Message sendMessage(
            @DestinationVariable String roomId,
            @RequestBody MessageRequest request
    ) {

        Room room = roomRepository.findByRoomId(request.getRoomId());
        Message message = new Message();
        message.setContent(request.getContent());
        message.setSender(request.getSender());
        // Use IST timezone for timestamps
        LocalDateTime istTime = request.getMessageTime() != null 
            ? request.getMessageTime() 
            : ZonedDateTime.now(ZoneId.of("Asia/Kolkata")).toLocalDateTime();
        message.setTimestamp(istTime);
        message.setMessageType(request.getMessageType());
        if (room != null) {
            room.getMessages().add(message);
            roomRepository.save(room);
        } else {
            throw new RuntimeException("room not found !!");
        }

        return message;
    }

    // Handle user joining a room
    @MessageMapping("/joinRoom/{roomId}")
    public void handleUserJoin(
            @DestinationVariable String roomId,
            @RequestBody Map<String, String> request
    ) {
        String username = request.get("username");
        Room room = roomRepository.findByRoomId(roomId);
        if (room != null) {
            room.getOnlineUsers().add(username);
            roomRepository.save(room);
            
            // Broadcast updated online users list
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/online-users", 
                Map.of("type", "USER_JOINED", "username", username, "onlineUsers", room.getOnlineUsers()));
        }
    }

    // Handle user leaving a room
    @MessageMapping("/leaveRoom/{roomId}")
    public void handleUserLeave(
            @DestinationVariable String roomId,
            @RequestBody Map<String, String> request
    ) {
        String username = request.get("username");
        Room room = roomRepository.findByRoomId(roomId);
        if (room != null) {
            room.getOnlineUsers().remove(username);
            roomRepository.save(room);
            
            // Broadcast updated online users list
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/online-users", 
                Map.of("type", "USER_LEFT", "username", username, "onlineUsers", room.getOnlineUsers()));
        }
    }
}