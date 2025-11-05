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
    <div className="min-h-screen flex items-center justify-center bg-[#0b141a]">
      <div className="p-8 sm:p-10 w-full flex flex-col gap-5 max-w-md rounded-lg bg-[#202c33] shadow-lg">
        <div>
          <img src={chatIcon} className="w-20 mx-auto" alt="Chat Icon" />
        </div>

        {!isLoggedIn && (
          <div className="flex justify-center gap-2">
            <button onClick={() => setIsLogin(true)} className={`px-5 py-2 rounded-lg font-medium transition-colors ${isLogin ? 'bg-[#00a884] text-white' : 'bg-[#374856] text-[#8696a0] hover:text-[#e9edef]'}`}>Login</button>
            <button onClick={() => setIsLogin(false)} className={`px-5 py-2 rounded-lg font-medium transition-colors ${!isLogin ? 'bg-[#00a884] text-white' : 'bg-[#374856] text-[#8696a0] hover:text-[#e9edef]'}`}>Sign Up</button>
          </div>
        )}

        <h1 className="text-xl font-medium text-center text-[#e9edef]">{isLoggedIn ? `Welcome, ${detail.username}` : (isLogin ? "Login" : "Sign Up")}</h1>

        {/* Complete logout option when logged in */}
        {isLoggedIn && (
          <div className="text-center">
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
                toast.success("Logged out completely");
              }}
              className="text-sm text-[#ff5757] hover:text-[#ff6b6b] underline"
            >
              Complete Logout
            </button>
          </div>
        )}

        {!isLoggedIn && (
          <>
            {/* Username div */}
            <div className="">
              <label htmlFor="username" className="block font-medium mb-2 text-[#e9edef] text-sm">
                Username
              </label>
              <input
                onChange={handleFormInputChange}
                value={detail.username}
                type="text"
                id="username"
                name="username"
                placeholder="Enter your username"
                className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] px-4 py-2.5 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] text-sm"
                maxLength="20"
              />
            </div>

            {/* Password div */}
            <div className="">
              <label htmlFor="password" className="block font-medium mb-2 text-[#e9edef] text-sm">
                Password
              </label>
              <input
                onChange={handleFormInputChange}
                value={detail.password}
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] px-4 py-2.5 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] text-sm"
              />
            </div>

            {/* Confirm Password div - only show when creating */}
            {!isLogin && (
              <div className="">
                <label htmlFor="confirmPassword" className="block font-medium mb-2 text-[#e9edef] text-sm">
                  Confirm Password
                </label>
                <input
                  onChange={handleFormInputChange}
                  value={detail.confirmPassword}
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Confirm your password"
                  className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] px-4 py-2.5 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] text-sm"
                />
              </div>
            )}

            {isLogin ? (
              <button onClick={handleLogin} className="px-4 py-2.5 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-colors font-medium">
                Login
              </button>
            ) : (
              <button onClick={handleSignUp} className="px-4 py-2.5 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-colors font-medium">
                Sign Up
              </button>
            )}

            {/* Google Sign In Button - only show on login screen */}
            {isLogin && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#374856]"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#202c33] px-2 text-[#8696a0]">Or continue with</span>
                  </div>
                </div>

                <button 
                  onClick={handleGoogleLogin}
                  className="w-full px-4 py-2.5 bg-white hover:bg-gray-50 rounded-lg text-gray-700 transition-colors font-medium flex items-center justify-center gap-3 border border-[#374856]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
              </>
            )}
          </>
        )}

        {isLoggedIn && (
          <>
            <hr className="border-[#374856]" />

            {/* Quick rejoin if there's a saved room */}
            {localStorage.getItem('chatRoomId') && (
              <div className="mb-2 p-3 bg-[#2a3942] rounded-lg">
                <p className="text-sm text-[#8696a0] mb-2">
                  Previous room: <span className="font-medium text-[#e9edef]">{localStorage.getItem('chatRoomId')}</span>
                </p>
                <button
                  onClick={async () => {
                    const savedRoomId = localStorage.getItem('chatRoomId');
                    if (savedRoomId) {
                      try {
                        const room = await joinChatApi(savedRoomId);
                        toast.success("Rejoined room successfully!");
                        setRoomId(room.roomId);
                        setConnected(true);
                        navigate("/chat");
                      } catch (error) {
                        toast.error("Could not rejoin previous room. It may no longer exist.");
                        localStorage.removeItem('chatRoomId'); // Clear invalid room
                      }
                    }
                  }}
                  className="px-3 py-1.5 bg-[#00a884] hover:bg-[#06cf9c] text-white rounded-lg text-sm transition-colors font-medium"
                >
                  Quick Rejoin
                </button>
              </div>
            )}

            {/* Room ID div */}
            <div className="">
              <label htmlFor="roomId" className="block font-medium mb-2 text-[#e9edef] text-sm">
                Room ID
              </label>
              <input
                name="roomId"
                onChange={handleFormInputChange}
                value={detail.roomId}
                type="text"
                id="roomId"
                placeholder="Enter the room id"
                className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] px-4 py-2.5 border border-[#374856] rounded-lg focus:outline-none focus:border-[#00a884] text-sm"
                maxLength="20"
              />
              
              {/* Room status indicator */}
              {detail.roomId && (
                <div className="mt-2 text-xs">
                  {checkingRoom && (
                    <span className="text-[#ffa500]">🔍 Checking room...</span>
                  )}
                  {!checkingRoom && canDeleteRoom && (
                    <span className="text-[#00a884]">✅ You created this room</span>
                  )}
                  {!checkingRoom && detail.roomId && !canDeleteRoom && (
                    <span className="text-[#8696a0]">👤 Check if room exists</span>
                  )}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-center gap-2 mt-2">
              <button
                onClick={joinChat}
                className="px-4 py-2.5 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-colors font-medium text-sm"
              >
                Join Room
              </button>
              <button
                onClick={createRoom}
                className="px-4 py-2.5 bg-[#00a884] hover:bg-[#06cf9c] rounded-lg text-white transition-colors font-medium text-sm"
              >
                Create Room
              </button>
              
              {/* Delete Room Button - only show if user created this room */}
              {canDeleteRoom && (
                <button
                  onClick={handleDeleteRoom}
                  className="px-3 py-2.5 bg-[#ff5757] hover:bg-[#ff6b6b] rounded-lg text-white transition-colors flex items-center gap-1.5 text-sm font-medium"
                  title="Delete room (permanent)"
                >
                  🗑️ Delete
                </button>
              )}
              
              {checkingRoom && (
                <div className="px-3 py-2.5 bg-[#374856] rounded-lg text-[#8696a0] text-sm">
                  Checking...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JoinCreateChat;