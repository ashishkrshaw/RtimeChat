package com.chat.entities;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;



@Document(collection="rooms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class Room {
    @Id
    private String id;//mongodb unique id
    private String roomId;
    private String creator; // Who created the room
    private LocalDateTime createdAt; // When the room was created
    private Set<String> onlineUsers = new HashSet<>(); // Currently online users

    private List<Message> messages=new ArrayList<>();


}
