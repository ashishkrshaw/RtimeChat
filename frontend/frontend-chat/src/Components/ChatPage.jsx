import React, { useEffect, useRef, useState } from "react";
import { MdAttachFile, MdSend, MdInfo, MdDelete } from "react-icons/md";
import { FaMicrophone, FaTimes } from "react-icons/fa";
import useChatContext from "../context/ChatContext";
import { useNavigate } from "react-router";
import SockJS from "sockjs-client";
import { Stomp } from "@stomp/stompjs";
import toast from "react-hot-toast";
import { baseURL } from "../Config/AxiosHelper.js";
import { getMessages, deleteRoomApi, getOnlineUsersApi, addUserToRoomApi, removeUserFromRoomApi } from "../Services/RoomService.jsx";
import { timeAgo } from "../Config/helper.js";

const ChatPage = () => {
  const {
    roomId,
    currentUser,
    connected,
    setConnected,
    setRoomId,
    setCurrentUser,
  } = useChatContext();

  const navigate = useNavigate();
  
  // Check connection and persist on page refresh
  useEffect(() => {
    // Try to restore session from localStorage if available
    const savedRoomId = localStorage.getItem('chatRoomId');
    const savedUser = localStorage.getItem('chatUsername');
    const savedTimestamp = localStorage.getItem('chatSessionTimestamp');
    
    // Check if session is still valid (within 24 hours)
    const sessionExpiry = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    const isSessionValid = savedTimestamp && (now - parseInt(savedTimestamp)) < sessionExpiry;
    
    if (!connected && savedRoomId && savedUser && isSessionValid) {
      // Restore session
      setRoomId(savedRoomId);
      setCurrentUser(savedUser);
      setConnected(true);
      toast.success(`Welcome back, ${savedUser}! Rejoining room: ${savedRoomId}`);
    } else if (!connected && (!roomId || !currentUser)) {
      // Clear expired session data
      if (!isSessionValid) {
        localStorage.removeItem('chatRoomId');
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('chatSessionTimestamp');
      }
      navigate("/");
    }
  }, [connected, roomId, currentUser, navigate, setConnected, setRoomId, setCurrentUser]);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const chatBoxRef = useRef(null);
  const fileInputRef = useRef(null);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const stompClientRef = useRef(null);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  // New states for online users and room info
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [roomCreator, setRoomCreator] = useState(null);
  
  // WhatsApp-style message queue for offline support
  const [messageQueue, setMessageQueue] = useState([]);
  const messageQueueRef = useRef([]);
  const [currentRoomData, setCurrentRoomData] = useState(null);

  // Load messages and persist login state
  useEffect(() => {
    async function loadMessages() {
      try {
        const messages = await getMessages(roomId);
        setMessages(messages);
        
        // Save session to localStorage on successful connection
        if (roomId && currentUser) {
          localStorage.setItem('chatRoomId', roomId);
          localStorage.setItem('chatUsername', currentUser);
          localStorage.setItem('chatSessionTimestamp', Date.now().toString());
        }
      } catch (error) {}
    }

    async function loadRoomData() {
      try {
        // Get room data to check creator and get online users
        const response = await fetch(`${baseURL}/api/v1/rooms/${roomId}`);
        if (response.ok) {
          const roomData = await response.json();
          setCurrentRoomData(roomData);
          setRoomCreator(roomData.creator);
          setOnlineUsers(Array.from(roomData.onlineUsers || []));
        }
        
        // Add current user to online users
        await addUserToRoomApi(roomId, currentUser);
      } catch (error) {
        console.error("Error loading room data:", error);
      }
    }

    if (connected && roomId && currentUser) {
      loadMessages();
      loadRoomData();
    }
  }, [connected, roomId, currentUser]);

  //scroll down
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scroll({
        top: chatBoxRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Handle page refresh/close gracefully
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      // Disconnect WebSocket and notify server of user leaving
      if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.send(`/app/leaveRoom/${roomId}`, {}, JSON.stringify({
          username: currentUser
        }));
        stompClientRef.current.disconnect();
      }
      // Remove user from room API call
      if (roomId && currentUser) {
        removeUserFromRoomApi(roomId, currentUser).catch(console.error);
      }
      // Don't clear localStorage - let user rejoin on refresh
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && connected && roomId && !stompConnected) {
        // Page became visible and we should be connected but aren't
        // This helps with reconnection when user comes back to tab
        setTimeout(() => {
          if (!stompConnected && connected && roomId) {
            // Trigger reconnection by slightly modifying a dependency
            setStompConnected(false);
          }
        }, 1000);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connected, roomId, stompConnected, currentUser]);

  //stompClient ko init karne honge
  //subscribe
  useEffect(() => {
    const connectWebSocket = () => {
      // Disconnect existing connection if any
      if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.disconnect();
      }

      console.log("🔌 Connecting to WebSocket...", `${baseURL}/chat`);
      setStompConnected(false); // Reset connection state
      
      // Optimize SockJS for faster connection
      const sockJSOptions = {
        timeout: 5000,        // Reduce timeout
        heartbeat: 25000,     // Faster heartbeat
        transports: ['websocket', 'xhr-polling'] // Prefer WebSocket
      };
      
      const sock = new SockJS(`${baseURL}/chat`, null, sockJSOptions);
      const client = Stomp.over(() => sock);

      // Disable console logging for cleaner output
      client.debug = () => {};
      
      // Optimize STOMP heartbeat for faster detection
      client.heartbeat.outgoing = 10000; // Send heartbeat every 10s
      client.heartbeat.incoming = 10000; // Expect heartbeat every 10s

      // Store client in ref
      stompClientRef.current = client;

      // Reduced connection timeout for faster feedback
      const connectionTimeout = setTimeout(() => {
        console.error("⏰ WebSocket connection timeout");
        toast.error("Connection timeout. Retrying...");
        setStompConnected(false);
        // Auto-retry immediately
        setTimeout(connectWebSocket, 1000);
      }, 5000); // 5 second timeout (reduced from 10)

      client.connect({}, () => {
        clearTimeout(connectionTimeout); // Clear timeout on successful connection
        console.log("✅ WebSocket connected successfully");
        setStompClient(client);
        setStompConnected(true);
        
        // Reset retry count on successful connection
        if (stompClientRef.current) {
          stompClientRef.current.retryCount = 0;
        }

        toast.success("Connected to chat!");
        
        // WhatsApp-style: Process queued messages when connection restored
        if (messageQueueRef.current.length > 0) {
          console.log(`📤 Sending ${messageQueueRef.current.length} queued messages`);
          messageQueueRef.current.forEach((queuedMessage) => {
            client.send(
              `/app/sendMessage/${roomId}`,
              {},
              JSON.stringify(queuedMessage)
            );
          });
          messageQueueRef.current = [];
          setMessageQueue([]);
        }

        // Subscribe to messages
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          console.log("📨 New message received:", message);
          const newMessage = JSON.parse(message.body);
          
          // Check if this message is already in our optimistic UI (prevent duplicates)
          setMessages((prev) => {
            // Check for exact ID match first
            if (newMessage.id && prev.some(msg => msg.id === newMessage.id)) {
              console.log("🔄 Duplicate message detected by ID, skipping");
              return prev;
            }
            
            // Check for temporary ID from current user (optimistic message)
            const tempMessageIndex = prev.findIndex(msg => 
              msg.sender === newMessage.sender && 
              msg.content === newMessage.content && 
              msg.messageType === newMessage.messageType &&
              msg.id && msg.id.startsWith('temp_') &&
              (msg.status === "sending" || msg.status === "sent")
            );
            
            if (tempMessageIndex !== -1) {
              console.log("🔄 Replacing optimistic message with server message");
              // Replace the temporary message with the server message
              const updatedMessages = [...prev];
              updatedMessages[tempMessageIndex] = {
                ...newMessage,
                status: "delivered",
                timestamp: newMessage.timestamp || newMessage.messageTime
              };
              return updatedMessages;
            }
            
            // Check for duplicate by content (for messages from other users or edge cases)
            const isDuplicate = prev.some(existingMsg => 
              existingMsg.content === newMessage.content && 
              existingMsg.sender === newMessage.sender && 
              existingMsg.messageType === newMessage.messageType &&
              existingMsg.timestamp === newMessage.timestamp
            );
            
            if (isDuplicate) {
              console.log("🔄 Duplicate message detected, skipping");
              return prev;
            }
            
            // Add new message with delivered status
            return [...prev, { ...newMessage, status: newMessage.status || "delivered" }];
          });
        });

        // Subscribe to online users updates
        client.subscribe(`/topic/room/${roomId}/online-users`, (message) => {
          const data = JSON.parse(message.body);
          setOnlineUsers(Array.from(data.onlineUsers || []));
          
          if (data.type === "USER_JOINED") {
            toast.success(`${data.username} joined the room`);
          } else if (data.type === "USER_LEFT") {
            toast.info(`${data.username} left the room`);
          }
        });

        // Notify that user joined - immediate send
        client.send(`/app/joinRoom/${roomId}`, {}, JSON.stringify({
          username: currentUser
        }));

      }, (error) => {
        clearTimeout(connectionTimeout); // Clear timeout on error
        console.error('❌ STOMP connection error:', error);
        setStompConnected(false);
        setStompClient(null);
        stompClientRef.current = null;
        toast.error("Connection failed. Retrying...");
        
        // WhatsApp-style exponential backoff retry
        const retryAttempts = stompClientRef.current?.retryCount || 0;
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempts), 30000); // Max 30s
        
        setTimeout(() => {
          if (connected && roomId && !stompClientRef.current?.connected) {
            console.log(`🔄 Retrying WebSocket connection... (attempt ${retryAttempts + 1})`);
            if (stompClientRef.current) {
              stompClientRef.current.retryCount = retryAttempts + 1;
            }
            connectWebSocket();
          }
        }, retryDelay);
      });

      // Handle disconnection
      client.onDisconnect = () => {
        setStompConnected(false);
        setStompClient(null);
        stompClientRef.current = null;
        console.log("STOMP disconnected");
        
        // Attempt to reconnect after a delay if we should still be connected
        setTimeout(() => {
          if (connected && roomId && !stompConnected) {
            console.log("Attempting to reconnect...");
            toast.info("Reconnecting...");
            connectWebSocket();
          }
        }, 3000);
      };
    };

    if (connected && roomId) {
      // Show connecting status immediately
      setStompConnected(false);
      console.log("Connecting to chat...");
      
      // Start connection immediately
      connectWebSocket();
    }

    // Cleanup function
    return () => {
      // Notify that user is leaving
      if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.send(`/app/leaveRoom/${roomId}`, {}, JSON.stringify({
          username: currentUser
        }));
        stompClientRef.current.disconnect();
      }
      stompClientRef.current = null;
      setStompConnected(false);
      setStompClient(null);
    };

  }, [roomId, connected, baseURL, currentUser]);

  //send message handle - WhatsApp style optimistic UI
  const sendMessage = async () => {
    if (isSending) {
      return; // Prevent multiple rapid sends
    }

    if (stompClient && stompConnected && connected && input.trim()) {
      setIsSending(true);
      
      const tempId = `temp_${Date.now()}_${Math.random()}`; // Temporary ID
      // Create IST timestamp
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const message = {
        id: tempId,
        sender: currentUser,
        content: input,
        roomId: roomId,
        messageType: "TEXT",
        timestamp: istTime.toISOString(),
        status: "sending" // WhatsApp-style status: sending -> sent -> delivered
      };

      // 🚀 OPTIMISTIC UI: Add message to UI immediately (WhatsApp style)
      setMessages((prev) => [...prev, message]);
      setInput(""); // Clear input immediately
      
      try {
        // Send to server in background
        stompClient.send(
          `/app/sendMessage/${roomId}`,
          {},
          JSON.stringify({
            ...message,
            id: undefined, // Let server generate real ID
            status: undefined
          })
        );
        
        // Update status to "sent" after small delay (simulate WhatsApp)
        setTimeout(() => {
          setMessages((prev) => 
            prev.map(msg => 
              msg.id === tempId 
                ? { ...msg, status: "sent" }
                : msg
            )
          );
        }, 200);
        
      } catch (error) {
        console.error('Error sending message:', error);
        // Mark message as failed (WhatsApp red exclamation mark style)
        setMessages((prev) => 
          prev.map(msg => 
            msg.id === tempId 
              ? { ...msg, status: "failed" }
              : msg
          )
        );
        toast.error("Failed to send message");
      } finally {
        setTimeout(() => setIsSending(false), 100); // Faster reset
      }
    } else if (!stompConnected) {
      console.log("🔄 Connection status:", { stompConnected, connected, hasStompClient: !!stompClient });
      
      // WhatsApp-style: Queue message for later sending if input is provided
      if (input.trim()) {
        const tempId = `temp_${Date.now()}_${Math.random()}`;
        // Create IST timestamp
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const queuedMessage = {
          id: tempId,
          sender: currentUser,
          content: input,
          roomId: roomId,
          messageType: "TEXT",
          timestamp: istTime.toISOString(),
          status: "queued"
        };
        
        // Add to UI immediately with "queued" status
        setMessages((prev) => [...prev, queuedMessage]);
        
        // Add to queue for sending when connection restored
        messageQueueRef.current.push({
          ...queuedMessage,
          id: undefined,
          status: undefined
        });
        setMessageQueue(prev => [...prev, queuedMessage]);
        
        setInput(""); // Clear input
        console.log("Message queued. Will send when connected.");
      }
      
      // Try to reconnect if not connected
      if (connected && roomId && !stompConnected) {
        connectWebSocket();
      }
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${baseURL}/api/v1/files/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const fileUrl = await response.text();
        let messageType = "TEXT";
        if (file.type.startsWith("image/")) {
          messageType = "IMAGE";
        } else if (file.type.startsWith("audio/")) {
          messageType = "AUDIO";
        }

        // Create IST timestamp
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const message = {
          sender: currentUser,
          content: fileUrl,
          roomId: roomId,
          messageType: messageType,
          timestamp: istTime.toISOString(),
        };

        if (stompClient && stompConnected) {
          stompClient.send(
            `/app/sendMessage/${roomId}`,
            {},
            JSON.stringify(message)
          );
        } else {
          toast.error("Connection not ready, file uploaded but message not sent");
        }
      } else {
        toast.error("File upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("File upload failed");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    uploadFile(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const audioFile = new File([audioBlob], "recording.wav", { type: "audio/wav" });
        uploadFile(audioFile);
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      toast.success("Recording started...");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Could not start recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success("Recording stopped.");
    }
  };

  // Leave room without logging out (preserves session)
  function handleLeaveRoom() {
    if (stompClientRef.current && stompClientRef.current.connected) {
      // Notify that user is leaving
      stompClientRef.current.send(`/app/leaveRoom/${roomId}`, {}, JSON.stringify({
        username: currentUser
      }));
      stompClientRef.current.disconnect();
    }
    stompClientRef.current = null;
    setStompClient(null);
    setStompConnected(false);
    setConnected(false);
    setRoomId("");
    
    // Keep user session but clear room data
    localStorage.removeItem('chatRoomId');
    // Keep chatUsername and chatSessionTimestamp for quick rejoin
    
    toast.success("Left room. You can join another room or rejoin this one.");
    navigate("/");
  }

  // Delete room (only for creator)
  async function handleDeleteRoom() {
    if (roomCreator !== currentUser) {
      toast.error("Only the room creator can delete this room!");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete room "${roomId}"? This will permanently delete all messages and remove all users. This action cannot be undone.`
    );

    if (confirmDelete) {
      try {
        await deleteRoomApi(roomId, currentUser);
        toast.success("Room deleted successfully!");
        
        // Disconnect and navigate away
        if (stompClientRef.current && stompClientRef.current.connected) {
          stompClientRef.current.disconnect();
        }
        setStompClient(null);
        setStompConnected(false);
        setConnected(false);
        setRoomId("");
        
        // Clear room data
        localStorage.removeItem('chatRoomId');
        navigate("/");
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

  // Complete logout (clears all session data)
  function handleLogout() {
    if (stompClientRef.current && stompClientRef.current.connected) {
      // Notify that user is leaving
      stompClientRef.current.send(`/app/leaveRoom/${roomId}`, {}, JSON.stringify({
        username: currentUser
      }));
      stompClientRef.current.disconnect();
    }
    stompClientRef.current = null;
    setStompClient(null);
    setStompConnected(false);
    setConnected(false);
    setRoomId("");
    setCurrentUser("");
    
    // Clear all localStorage on complete logout
    localStorage.removeItem('chatRoomId');
    localStorage.removeItem('chatUsername');
    localStorage.removeItem('chatSessionTimestamp');
    
    toast.success("Logged out successfully");
    navigate("/");
  }

  return (
    <div className="bg-[#0b141a] h-screen flex flex-col">
      {/* Header - Compact WhatsApp-like */}
      <header className="flex-shrink-0 bg-[#202c33] text-white shadow-md">
        <div className="flex items-center justify-between px-3 py-2.5">
          {/* Left: Room info with avatar */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center text-white font-semibold text-sm">
                {roomId.charAt(0).toUpperCase()}
              </div>
              <span 
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#202c33] ${stompConnected ? 'bg-[#00a884]' : 'bg-[#8696a0]'}`}
              ></span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-medium text-[#e9edef] truncate">
                  {roomId}
                </h1>
                {onlineUsers.length > 0 && (
                  <span className="text-xs text-[#8696a0] flex-shrink-0">
                    ({onlineUsers.length})
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8696a0] truncate">
                {currentUser}
                {roomCreator && roomCreator === currentUser && (
                  <span className="ml-1">• Admin</span>
                )}
              </p>
            </div>
          </div>
          
          {/* Right: Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowOnlineUsers(true)}
              className="p-2 hover:bg-[#374856] rounded-full transition-colors relative"
              title="Online users"
            >
              <MdInfo size={20} className="text-[#8696a0]" />
              {onlineUsers.length > 1 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[#00a884] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {onlineUsers.length}
                </span>
              )}
            </button>
            
            {roomCreator === currentUser && (
              <button
                onClick={handleDeleteRoom}
                className="p-2 hover:bg-[#374856] rounded-full transition-colors"
                title="Delete room"
              >
                <MdDelete size={20} className="text-[#ff5757]" />
              </button>
            )}
            
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-[#374856] rounded-full transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Online Users Modal - Compact WhatsApp-like */}
      {showOnlineUsers && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-end sm:items-center justify-center z-60">
          <div className="bg-[#202c33] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] sm:max-h-96 overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#374856]">
              <div>
                <h2 className="text-base font-medium text-[#e9edef]">
                  Room Members
                </h2>
                <p className="text-xs text-[#8696a0]">{onlineUsers.length} online</p>
              </div>
              <button
                onClick={() => setShowOnlineUsers(false)}
                className="p-2 hover:bg-[#374856] rounded-full transition-colors"
              >
                <FaTimes size={18} className="text-[#8696a0]" />
              </button>
            </div>
            
            {/* User List */}
            <div className="overflow-y-auto max-h-[60vh] sm:max-h-72">
              {onlineUsers.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="text-[#8696a0] text-sm">No users online</p>
                </div>
              ) : (
                onlineUsers.map((user, index) => (
                  <div key={index} className="flex items-center gap-3 px-4 py-3 hover:bg-[#111b21] transition-colors border-b border-[#374856] last:border-b-0">
                    <div className="relative flex-shrink-0">
                      <img
                        className="h-11 w-11 rounded-full ring-2 ring-[#374856]"
                        src={`https://avatar.iran.liara.run/public/boy?username=${user}`}
                        alt={`${user} avatar`}
                      />
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00a884] rounded-full ring-2 ring-[#202c33]"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#e9edef] text-sm truncate">
                        {user}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {user === currentUser && (
                          <span className="text-[10px] bg-[#00a884] text-white px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                        {user === roomCreator && (
                          <span className="text-[10px] bg-[#ffa500] text-white px-1.5 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                        <span className="text-xs text-[#00a884]">Active now</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages - Compact WhatsApp-like */}
      <main
        ref={chatBoxRef}
        className="flex-1 overflow-y-auto px-3 py-3 bg-[#0b141a]"
        style={{backgroundImage: 'url(https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png)', backgroundRepeat: 'repeat'}}
      >
        <div className="space-y-1.5">
          {messages.map((message, index) => {
            const isCurrentUser = message.sender === currentUser;

            return (
              <div
                key={index}
                className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
              >
                <div className={`relative max-w-[85%] sm:max-w-[75%] md:max-w-md`}>
                  {/* Message bubble */}
                  <div className={`rounded-lg ${isCurrentUser ? 'bg-[#005c4b] rounded-tr-sm' : 'bg-[#202c33] rounded-tl-sm'} shadow-md px-2.5 py-1.5`}>
                    {/* Sender name for other users */}
                    {!isCurrentUser && (
                      <p className="text-xs font-semibold text-[#00a884] mb-0.5">{message.sender}</p>
                    )}
                    
                    {/* Message content */}
                    <div className="text-[14.2px] leading-[19px]">
                      {message.messageType === "IMAGE" ? (
                        <img 
                          src={`${baseURL}${message.content}`} 
                          alt="attachment" 
                          className="max-w-[280px] rounded-md cursor-pointer hover:opacity-95 transition-opacity mb-1" 
                          onClick={() => window.open(`${baseURL}${message.content}`, '_blank')}
                        />
                      ) : message.messageType === "AUDIO" ? (
                        <audio 
                          controls 
                          src={`${baseURL}${message.content}`} 
                          className="w-56 h-8 mb-1"
                          style={{filter: 'invert(1) hue-rotate(180deg)'}}
                        />
                      ) : (
                        <p className="break-words text-[#e9edef] whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                    
                    {/* Time and status */}
                    <div className="flex justify-end items-center gap-1 mt-1 -mb-0.5">
                      <span className="text-[11px] text-[#8696a0] leading-none">
                        {timeAgo(message.timestamp || message.messageTime)}
                      </span>
                      {isCurrentUser && (
                        <span className="leading-none">
                          {message.status === "sending" && (
                            <svg className="w-3.5 h-3.5 text-[#8696a0] animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                          {message.status === "sent" && (
                            <svg className="w-4 h-3.5 text-[#8696a0]" viewBox="0 0 16 11" fill="none">
                              <path d="M11.796 0.161L5.036 6.921 2.696 4.581 0.676 6.601 5.036 10.961 13.816 2.181 11.796 0.161Z" fill="currentColor"/>
                            </svg>
                          )}
                          {message.status === "delivered" && (
                            <svg className="w-4 h-3.5 text-[#53bdeb]" viewBox="0 0 16 11" fill="none">
                              <path d="M11.796 0.161L5.036 6.921 2.696 4.581 0.676 6.601 5.036 10.961 13.816 2.181 11.796 0.161Z" fill="currentColor"/>
                              <path d="M13.796 0.161L7.036 6.921 5.736 5.621 7.036 6.921 13.796 0.161 15.816 2.181 7.036 10.961 5.736 9.661 7.036 10.961 15.816 2.181 13.796 0.161Z" fill="currentColor" opacity="0.6"/>
                            </svg>
                          )}
                          {message.status === "failed" && (
                            <svg className="w-3.5 h-3.5 text-[#ff5757]" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Input Container - Compact WhatsApp-like */}
      <div className="flex-shrink-0 bg-[#202c33] px-3 py-2 border-t border-[#374856]">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => fileInputRef.current.click()}
              className="p-2 hover:bg-[#374856] rounded-full text-[#8696a0] hover:text-[#e9edef] transition-colors"
              title="Attach file"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-[#ff5757] text-white animate-pulse' : 'hover:bg-[#374856] text-[#8696a0] hover:text-[#e9edef]'}`}
              title={isRecording ? "Release to send" : "Hold to record"}
            >
              <FaMicrophone size={18} />
            </button>
          </div>

          {/* Input field */}
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSending && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              type="text"
              placeholder={stompConnected ? "Message" : "Connecting..."}
              disabled={!stompConnected}
              className={`w-full bg-[#2a3942] pl-4 pr-10 py-2.5 rounded-lg focus:outline-none text-[#e9edef] placeholder-[#8696a0] text-[15px] ${!stompConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !stompConnected || isSending}
            className={`p-2.5 rounded-full transition-all flex-shrink-0 ${input.trim() && stompConnected ? 'bg-[#00a884] hover:bg-[#06cf9c] text-white scale-100' : 'bg-transparent text-[#8696a0] scale-0'}`}
            title="Send message"
          >
            <MdSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;