package com.chat.controllers;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@CrossOrigin(origins = {"https://your-app-name.onrender.com", "https://wecord-s3vw.onrender.com", "http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:3000"})
public class AuthController {

    @GetMapping("/google/login")
    public String googleLogin() {
        return "redirect:/oauth2/authorization/google";
    }
}
