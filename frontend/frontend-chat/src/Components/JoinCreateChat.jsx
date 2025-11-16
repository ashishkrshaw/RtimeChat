import React, { useState, useEffect, useRef } from "react";
import chatIcon from "../assets/chat.png";
import toast from "react-hot-toast";
import { createRoomApi, joinChatApi, loginUserApi, registerUserApi, deleteRoomApi } from "../Services/RoomService.jsx";
import { baseURL } from "../Config/AxiosHelper.js";
import useChatContext from "../context/ChatContext.jsx";
import { useNavigate } from "react-router";

const JoinCreateChat = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [canDeleteRoom, setCanDeleteRoom] = useState(false);
  const [checkingRoom, setCheckingRoom] = useState(false);
  const [detail, setDetail] = useState({
    roomId: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  const { setCurrentUser, setRoomId, setConnected } = useChatContext();
  const navigate = useNavigate();
  const timeoutRef = useRef(null);

  // Check for existing session on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('chatUsername');
    const savedTimestamp = localStorage.getItem('chatSessionTimestamp');
    
    // Check if session is still valid (within 24 hours)
    const sessionExpiry = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    const isSessionValid = savedTimestamp && (now - parseInt(savedTimestamp)) < sessionExpiry;
    
    if (savedUser && isSessionValid) {
      setDetail(prev => ({ ...prev, username: savedUser }));
      setCurrentUser(savedUser);
      setIsLoggedIn(true);
      toast.success(`Welcome back, ${savedUser}!`);
    }

    // Check for Google OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const googleAuth = urlParams.get('googleAuth');
    const username = urlParams.get('username');
    const email = urlParams.get('email');
    const name = urlParams.get('name');
    
    if (googleAuth === 'true' && username) {
      setDetail(prev => ({ ...prev, username: username }));
      setCurrentUser(username);
      setIsLoggedIn(true);
      localStorage.setItem('chatUsername', username);
      localStorage.setItem('chatSessionTimestamp', Date.now().toString());
      toast.success(`Welcome, ${name || username}! Logged in with Google`);
      
      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    }

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setCurrentUser]);

  function handleFormInputChange(event) {
    setDetail({
      ...detail,
      [event.target.name]: event.target.value,
    });
    
    // Check if room can be deleted when room ID changes (only if room ID is meaningful)
    if (event.target.name === "roomId" && event.target.value && detail.username) {
      // Only check if room ID is at least 3 characters to avoid too many API calls
      if (event.target.value.trim().length >= 3) {
        // Debounce the API call to avoid excessive requests
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          checkRoomCreator(event.target.value, detail.username);
        }, 500); // Wait 500ms after user stops typing
      } else {
        setCanDeleteRoom(false);
      }
    }
  }

  // Function to check if the current user is the creator of the room
  async function checkRoomCreator(roomId, username) {
    if (!roomId.trim() || !username.trim()) {
      setCanDeleteRoom(false);
      return;
    }

    setCheckingRoom(true);
    try {
      const response = await fetch(`${baseURL}/api/v1/rooms/${roomId}`);
      if (response.ok) {
        const roomData = await response.json();
        setCanDeleteRoom(roomData.creator === username);
      } else {
        setCanDeleteRoom(false);
      }
    } catch (error) {
      setCanDeleteRoom(false);
    } finally {
      setCheckingRoom(false);
    }
  }

  // Check room creator when username changes (for logged in users)
  useEffect(() => {
    if (detail.roomId && detail.username && isLoggedIn) {
      checkRoomCreator(detail.roomId, detail.username);
    }
  }, [detail.roomId, detail.username, isLoggedIn]);

  function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      toast.error("Username can only contain letters, numbers, and underscores!");
      return false;
    }
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters long!");
      return false;
    }
    return true;
  }

  function validatePassword(password) {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long!");
      return false;
    }
    return true;
  }

  async function handleLogin() {
    if (detail.username === "" || detail.password === "") {
      toast.error("Username and Password are required!");
      return;
    }

    try {
      await loginUserApi({ username: detail.username, password: detail.password });
      toast.success("Logged in successfully!");
      setCurrentUser(detail.username);
      setIsLoggedIn(true);
    } catch (error) {
      toast.error("Invalid username or password");
    }
  }

  function handleGoogleLogin() {
    // Redirect to backend Google OAuth endpoint
    window.location.href = `${baseURL}/oauth2/authorization/google`;
  }

  async function handleSignUp() {
    if (detail.username === "" || detail.password === "" || detail.confirmPassword === "") {
      toast.error("All fields are required!");
      return;
    }
    if (!validateUsername(detail.username)) return;
    if (!validatePassword(detail.password)) return;
    if (detail.password !== detail.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    try {
      await registerUserApi({ username: detail.username, password: detail.password });
      toast.success("Registered successfully! Please login.");
      setIsLogin(true);
    } catch (error) {
      if (error.response && error.response.data) {
        toast.error(error.response.data);
      } else {
        toast.error("Registration failed");
      }
    }
  }

  async function joinChat() {
    if (detail.roomId === "") {
      toast.error("Room ID is required!");
      return;
    }
    try {
      const room = await joinChatApi(detail.roomId);
      toast.success("Joined room successfully!");
      setRoomId(room.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error.response && error.response.data) {
        toast.error(error.response.data);
      } else {
        toast.error("Error in joining room");
      }
    }
  }

  async function createRoom() {
    if (detail.roomId === "") {
      toast.error("Room ID is required!");
      return;
    }
    try {
      const response = await createRoomApi(detail.roomId, detail.username);
      toast.success("Room Created Successfully !!");
      setRoomId(response.roomId);
      setConnected(true);
      navigate("/chat");
    } catch (error) {
      if (error.response && error.response.data) {
        toast.error(error.response.data);
      } else {
        toast.error("Error in creating room");
      }
    }
  }

  async function handleDeleteRoom() {
    if (detail.roomId === "") {
      toast.error("Room ID is required!");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete room "${detail.roomId}"? This will permanently delete all messages and remove all users. This action cannot be undone.`
    );

    if (confirmDelete) {
      try {
        await deleteRoomApi(detail.roomId, detail.username);
        toast.success("Room deleted successfully!");
        setDetail(prev => ({ ...prev, roomId: "" }));
        setCanDeleteRoom(false);
      } catch (error) {
        console.error("Error deleting room:", error);
        if (error.response && error.response.data) {
          toast.error(error.response.data);
        } else {
          toast.error("Failed to delete room");
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b141a] p-4">
      <div className="w-full max-w-md">
        {/* Card Container */}
        <div className="bg-[#202c33] rounded-2xl shadow-2xl overflow-hidden">
          {/* Header Section */}
          <div className="bg-[#00a884] px-6 py-8 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00a884] to-[#008069]"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
                <img src={chatIcon} className="w-12 h-12" alt="Chat Icon" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">WeChat</h1>
              <p className="text-sm text-white/80">
                {isLoggedIn ? `Welcome back, ${detail.username}!` : 'Connect instantly with friends'}
              </p>
            </div>
          </div>

          {/* Body Section */}
          <div className="p-6 space-y-4">
            {/* Tab Switcher for Login/SignUp */}
            {!isLoggedIn && (
              <div className="flex bg-[#111b21] rounded-lg p-1">
                <button 
                  onClick={() => setIsLogin(true)} 
                  className={`flex-1 py-2.5 px-4 rounded-md font-medium transition-all text-sm ${
                    isLogin 
                      ? 'bg-[#00a884] text-white shadow-md' 
                      : 'text-[#8696a0] hover:text-[#e9edef]'
                  }`}
                >
                  Login
                </button>
                <button 
                  onClick={() => setIsLogin(false)} 
                  className={`flex-1 py-2.5 px-4 rounded-md font-medium transition-all text-sm ${
                    !isLogin 
                      ? 'bg-[#00a884] text-white shadow-md' 
                      : 'text-[#8696a0] hover:text-[#e9edef]'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Logout Option */}
            {isLoggedIn && (
              <div className="flex items-center justify-between p-3 bg-[#111b21] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-semibold">
                    {detail.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[#e9edef] font-medium">{detail.username}</span>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('chatRoomId');
                    localStorage.removeItem('chatUsername');
                    localStorage.removeItem('chatSessionTimestamp');
                    setIsLoggedIn(false);
                    setCurrentUser("");
                    setDetail({
                      roomId: "",
                      username: "",
                      password: "",
                      confirmPassword: "",
                    });
                    toast.success("Logged out successfully");
                  }}
                  className="text-xs text-[#ff5757] hover:text-[#ff6b6b] px-3 py-1.5 hover:bg-[#202c33] rounded transition-colors"
                >
                  Logout
                </button>
              </div>
            )}

            {/* Login/Signup Form */}
            {!isLoggedIn && (
              <div className="space-y-3">
                {/* Username Input */}
                <div>
                  <label htmlFor="username" className="block text-xs font-medium mb-1.5 text-[#8696a0]">
                    USERNAME
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <input
                      onChange={handleFormInputChange}
                      value={detail.username}
                      type="text"
                      id="username"
                      name="username"
                      placeholder="Enter username"
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] pl-10 pr-4 py-3 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm transition-all"
                      maxLength="20"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-xs font-medium mb-1.5 text-[#8696a0]">
                    PASSWORD
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      onChange={handleFormInputChange}
                      value={detail.password}
                      type="password"
                      id="password"
                      name="password"
                      placeholder="Enter password"
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] pl-10 pr-4 py-3 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm transition-all"
                    />
                  </div>
                </div>

                {/* Confirm Password - Only for Sign Up */}
                {!isLogin && (
                  <div>
                    <label htmlFor="confirmPassword" className="block text-xs font-medium mb-1.5 text-[#8696a0]">
                      CONFIRM PASSWORD
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <input
                        onChange={handleFormInputChange}
                        value={detail.confirmPassword}
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        placeholder="Confirm password"
                        className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] pl-10 pr-4 py-3 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button 
                  onClick={isLogin ? handleLogin : handleSignUp} 
                  className="w-full py-3 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-all font-semibold shadow-md hover:shadow-lg active:scale-[0.98] text-sm"
                >
                  {isLogin ? 'Login' : 'Sign Up'}
                </button>

                {/* Google Sign In - Only for Login */}
                {isLogin && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[#374856]"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-[#202c33] px-3 text-xs text-[#8696a0]">OR</span>
                      </div>
                    </div>

                    <button 
                      onClick={handleGoogleLogin}
                      className="w-full py-3 bg-white hover:bg-gray-50 rounded-lg text-gray-800 transition-all font-medium shadow-sm hover:shadow-md flex items-center justify-center gap-2 active:scale-[0.98] border border-gray-200 text-sm"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Room Management Section */}
            {isLoggedIn && (
              <div className="space-y-3 pt-1">
                <div className="h-px bg-[#374856]"></div>

                {/* Quick Rejoin Card */}
                {localStorage.getItem('chatRoomId') && (
                  <div className="p-3 bg-gradient-to-r from-[#00a884]/10 to-[#00a884]/5 border border-[#00a884]/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#8696a0] mb-0.5">Recent Room</p>
                        <p className="text-sm font-medium text-[#e9edef] truncate">
                          {localStorage.getItem('chatRoomId')}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const savedRoomId = localStorage.getItem('chatRoomId');
                          if (savedRoomId) {
                            // Instant navigation - no waiting for API
                            setRoomId(savedRoomId);
                            setConnected(true);
                            navigate("/chat");
                            
                            // Verify in background
                            joinChatApi(savedRoomId).catch(() => {
                              localStorage.removeItem('chatRoomId');
                            });
                          }
                        }}
                        className="px-3 py-2 bg-[#00a884] hover:bg-[#06cf9c] text-white rounded-md text-xs font-medium transition-all active:scale-95 flex-shrink-0 ml-2"
                      >
                        Rejoin
                      </button>
                    </div>
                  </div>
                )}

                {/* Room ID Input */}
                <div>
                  <label htmlFor="roomId" className="block text-xs font-medium mb-1.5 text-[#8696a0]">
                    ROOM ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                      </svg>
                    </div>
                    <input
                      name="roomId"
                      onChange={handleFormInputChange}
                      value={detail.roomId}
                      type="text"
                      id="roomId"
                      placeholder="Enter room ID"
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] pl-10 pr-4 py-3 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm transition-all"
                      maxLength="20"
                    />
                  </div>
                  
                  {/* Status Indicator */}
                  {detail.roomId && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      {checkingRoom ? (
                        <>
                          <div className="w-3 h-3 border-2 border-[#ffa500] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-[#ffa500]">Checking room...</span>
                        </>
                      ) : canDeleteRoom ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-[#00a884]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                          </svg>
                          <span className="text-[#00a884]">You own this room</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-[#8696a0]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                          </svg>
                          <span className="text-[#8696a0]">Ready to join or create</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={joinChat}
                    className="py-3 bg-[#374856] hover:bg-[#475d6f] rounded-lg text-white transition-all font-medium shadow-sm hover:shadow-md active:scale-[0.98] text-sm flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Join
                  </button>
                  <button
                    onClick={createRoom}
                    className="py-3 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-all font-medium shadow-sm hover:shadow-md active:scale-[0.98] text-sm flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create
                  </button>
                </div>

                {/* Delete Button - Only for Room Creator */}
                {canDeleteRoom && (
                  <button
                    onClick={handleDeleteRoom}
                    className="w-full py-2.5 bg-[#ff5757]/10 hover:bg-[#ff5757]/20 border border-[#ff5757]/30 rounded-lg text-[#ff5757] transition-all font-medium text-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Room
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-xs text-[#8696a0]">
            Made with ❤️ for instant messaging
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinCreateChat;