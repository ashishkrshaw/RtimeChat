package com.chat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.oauth2.core.user.OAuth2User;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login/oauth2/**", "/api/v1/auth/google/**").permitAll()
                .anyRequest().permitAll()
            )
            .oauth2Login(oauth2 -> oauth2
                .successHandler(oauth2AuthenticationSuccessHandler())
            );
        return http.build();
    }
    
    @Bean
    public AuthenticationSuccessHandler oauth2AuthenticationSuccessHandler() {
        return (request, response, authentication) -> {
            OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();
            String email = oauth2User.getAttribute("email");
            String name = oauth2User.getAttribute("name");
            
            // Extract username from email (part before @)
            String username = email != null ? email.split("@")[0] : name;
            
            // Determine redirect URL based on environment
            String frontendUrl = System.getenv("FRONTEND_URL") != null 
                ? System.getenv("FRONTEND_URL") 
                : "http://localhost:5173";
            
            // For production, use your Render frontend URL
            String host = request.getHeader("Host");
            if (host != null && host.contains("duckdns.org")) {
                frontendUrl = "https://wecord-s3vw.onrender.com";
            }
            
            // Redirect to frontend with user info
            String redirectUrl = String.format(
                "%s?googleAuth=true&username=%s&email=%s&name=%s",
                frontendUrl, username, email, name
            );
            response.sendRedirect(redirectUrl);
        };
    }
}
