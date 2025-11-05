package com.chat.controllers;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/files")
@CrossOrigin(origins = {"https://your-app-name.onrender.com", "https://wecord-s3vw.onrender.com", "http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:3000"})
public class FileController {

    @Value("${project.media}")
    private String path;

    @PostMapping("/upload")
    public ResponseEntity<String> uploadFile(@RequestParam("file") MultipartFile file) {
        String name = file.getOriginalFilename();
        String randomID = UUID.randomUUID().toString();
        String fileName = randomID.concat(name.substring(name.lastIndexOf(".")));
        String filePath = path + File.separator + fileName;

        File f = new File(path);
        if (!f.exists()) {
            f.mkdir();
        }

        try {
            Files.copy(file.getInputStream(), Paths.get(filePath));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to upload file");
        }

        // Return the URL of the file
        String fileUrl = "/media/" + fileName;
        return ResponseEntity.ok(fileUrl);
    }
}
