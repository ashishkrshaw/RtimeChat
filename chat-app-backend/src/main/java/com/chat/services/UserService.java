package com.chat.services;

import com.chat.entities.User;

public interface UserService {
    User registerUser(User user);
    User loginUser(String username, String password);
}
