package com.chat.controllers;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import com.chat.entities.Message;
// Remove or comment out this line if present:
// import org.apache.logging.log4j.message.Message;
// ...existing code...
// ...existing code...


import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
// ...existing code...

import com.chat.entities.Room;
import com.chat.repositories.RoomRepository;

import java.util.Map;




@RestController
@RequestMapping("/api/v1/rooms")
@CrossOrigin(origins = {"https://your-app-name.onrender.com", "https://wecord-s3vw.onrender.com", "http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:3000"})
public class RoomController {

    private RoomRepository roomRepository;


    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    //create room
    @PostMapping
    public ResponseEntity<?> createRoom(
            @RequestBody Map<String, String> request
    ) {
        String roomId = request.get("roomId");
        String creator = request.get("creator");

        if (roomId == null || roomId.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Room ID is required!");
        }
        
        if (creator == null || creator.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Creator is required!");
        }

        if (roomRepository.findByRoomId(roomId) != null) {
            //room is already there
            return ResponseEntity.badRequest().body("Room already exists!");
        }

        //create new room
        Room room = new Room();
        room.setRoomId(roomId);
        room.setCreator(creator);
        room.setCreatedAt(ZonedDateTime.now(ZoneId.of("Asia/Kolkata")).toLocalDateTime());
        room.getOnlineUsers().add(creator); // Add creator as first online user
        Room savedRoom = roomRepository.save(room);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedRoom);
    }


    //get room: join
    @GetMapping("/{roomId}")
    public ResponseEntity<?> joinRoom(
            @PathVariable String roomId
    ) {

        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest()
                    .body("Room not found!!");
        }
        return ResponseEntity.ok(room);
    }

    // Delete room - only creator can delete
    @DeleteMapping("/{roomId}")
    public ResponseEntity<?> deleteRoom(
            @PathVariable String roomId,
            @RequestParam String username
    ) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().body("Room not found!");
        }

        // Check if the requesting user is the creator
        if (!room.getCreator().equals(username)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Only the room creator can delete this room!");
        }

        // Delete the room (this will cascade delete all messages)
        roomRepository.delete(room);
        return ResponseEntity.ok("Room deleted successfully!");
    }

    // Add user to online users list
    @PostMapping("/{roomId}/join-user")
    public ResponseEntity<?> addUserToRoom(
            @PathVariable String roomId,
            @RequestBody Map<String, String> request
    ) {
        String username = request.get("username");
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().body("Room not found!");
        }

        room.getOnlineUsers().add(username);
        roomRepository.save(room);
        return ResponseEntity.ok(room.getOnlineUsers());
    }

    // Remove user from online users list
    @PostMapping("/{roomId}/leave-user")
    public ResponseEntity<?> removeUserFromRoom(
            @PathVariable String roomId,
            @RequestBody Map<String, String> request
    ) {
        String username = request.get("username");
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().body("Room not found!");
        }

        room.getOnlineUsers().remove(username);
        roomRepository.save(room);
        return ResponseEntity.ok(room.getOnlineUsers());
    }

    // Get online users
    @GetMapping("/{roomId}/online-users")
    public ResponseEntity<?> getOnlineUsers(@PathVariable String roomId) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().body("Room not found!");
        }
        return ResponseEntity.ok(room.getOnlineUsers());
    }


    //get messages of room

    @GetMapping("/{roomId}/messages")
    public ResponseEntity<List<Message>> getMessages(
            @PathVariable String roomId,
            @RequestParam(value = "page", defaultValue = "0", required = false) int page,
            @RequestParam(value = "size", defaultValue = "20", required = false) int size
    ) {
        Room room = roomRepository.findByRoomId(roomId);
        if (room == null) {
            return ResponseEntity.badRequest().build()
                    ;
        }
        //get messages :
        //pagination
        List<Message> messages = room.getMessages();
        int start = Math.max(0, messages.size() - (page + 1) * size);
        int end = Math.min(messages.size(), start + size);
        List<Message> paginatedMessages = messages.subList(start, end);
        return ResponseEntity.ok(paginatedMessages);

    }


}