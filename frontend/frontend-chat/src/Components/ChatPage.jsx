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
            
            // Check for similar message (content + sender + time within 5 seconds)
            const isDuplicate = prev.some(existingMsg => 
              existingMsg.content === newMessage.content && 
              existingMsg.sender === newMessage.sender && 
              existingMsg.messageType === newMessage.messageType &&
              Math.abs(
                new Date(existingMsg.timestamp || existingMsg.messageTime) - 
                new Date(newMessage.timestamp || newMessage.messageTime)
              ) < 5000 // 5 seconds tolerance
            );
            
            if (isDuplicate) {
              console.log("🔄 Duplicate message detected by content/time, updating status");
              // Update existing message with server data and mark as delivered
              return prev.map(msg => 
                (msg.sender === newMessage.sender && 
                 msg.content === newMessage.content && 
                 msg.messageType === newMessage.messageType &&
                 (msg.status === "sending" || msg.status === "sent" || msg.status === "queued"))
                  ? { 
                      ...newMessage, 
                      status: "delivered",
                      timestamp: newMessage.timestamp || newMessage.messageTime || msg.timestamp
                    }
                  : msg
              );
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
    <div className="bg-[#0b141a]">
      {/* Header - WhatsApp-like minimalist dark theme */}
      <header className="fixed w-full top-0 left-0 right-0 py-3 sm:py-4 shadow-md bg-[#202c33] text-white z-50">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between sm:justify-around items-center space-y-2 sm:space-y-0">
          {/* Room name container */}
          <div className="text-center sm:text-left">
            <h1 className="text-base sm:text-lg font-medium">
              <span className="text-[#e9edef]">{roomId}</span>
              {roomCreator && (
                <span className="text-xs ml-2 bg-[#00a884] text-white px-2 py-0.5 rounded">
                  by {roomCreator}
                </span>
              )}
            </h1>
          </div>
          {/* Username container */}
          <div className="text-center sm:text-left">
            <h1 className="text-sm sm:text-base font-normal text-[#8696a0]">
              {currentUser}
              {/* Connection status indicator */}
              <span className="inline-flex items-center ml-2">
                <span 
                  className={`w-2 h-2 rounded-full inline-block ${stompConnected ? 'bg-[#00a884]' : 'bg-[#ff5757]'}`}
                ></span>
                <span className="text-xs ml-1">
                  {stompConnected ? 'online' : 'connecting...'}
                </span>
              </span>
            </h1>
          </div>
          {/* Buttons: info, leave room, delete (if creator), and logout */}
          <div className="flex gap-1.5 sm:gap-2">
            {/* Online Users Info Button */}
            <button
              onClick={() => setShowOnlineUsers(true)}
              className="bg-[#00a884] hover:bg-[#06cf9c] px-2 py-1.5 sm:px-3 sm:py-1.5 rounded text-white transition-colors text-xs sm:text-sm flex items-center gap-1"
              title="View online users"
            >
              <MdInfo size={16} />
              {onlineUsers.length > 0 && (
                <span className="bg-[#202c33] text-white rounded-full px-1.5 text-xs">
                  {onlineUsers.length}
                </span>
              )}
            </button>
            
            <button
              onClick={handleLeaveRoom}
              className="bg-[#374856] hover:bg-[#475d6f] px-2 py-1.5 sm:px-3 sm:py-1.5 rounded text-white transition-colors text-xs sm:text-sm"
            >
              Leave
            </button>
            
            {/* Delete Room Button - only show for creator */}
            {roomCreator === currentUser && (
              <button
                onClick={handleDeleteRoom}
                className="bg-[#ff5757] hover:bg-[#ff6b6b] px-2 py-1.5 sm:px-3 sm:py-1.5 rounded text-white transition-colors text-xs sm:text-sm flex items-center gap-1"
                title="Delete room (permanent)"
              >
                <MdDelete size={16} />
              </button>
            )}
            
            <button
              onClick={handleLogout}
              className="bg-[#ff5757] hover:bg-[#ff6b6b] px-2 py-1.5 sm:px-3 sm:py-1.5 rounded text-white transition-colors text-xs sm:text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Online Users Modal - WhatsApp-like */}
      {showOnlineUsers && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-60 p-4">
          <div className="bg-[#202c33] rounded-lg p-5 shadow-2xl max-w-md w-full max-h-96 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-[#e9edef]">
                Online Users ({onlineUsers.length})
              </h2>
              <button
                onClick={() => setShowOnlineUsers(false)}
                className="text-[#8696a0] hover:text-[#e9edef]"
              >
                <FaTimes size={20} />
              </button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {onlineUsers.length === 0 ? (
                <p className="text-[#8696a0] text-center py-4">
                  No users online
                </p>
              ) : (
                onlineUsers.map((user, index) => (
                  <div key={index} className="flex items-center gap-3 p-2.5 bg-[#111b21] hover:bg-[#202c33] rounded transition-colors">
                    <img
                      className="h-10 w-10 rounded-full"
                      src={`https://avatar.iran.liara.run/public/boy?username=${user}`}
                      alt={`${user} avatar`}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-[#e9edef]">
                        {user}
                        {user === currentUser && (
                          <span className="ml-2 text-xs bg-[#00a884] text-white px-2 py-0.5 rounded">
                            You
                          </span>
                        )}
                        {user === roomCreator && (
                          <span className="ml-2 text-xs bg-[#ffa500] text-white px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="w-2.5 h-2.5 bg-[#00a884] rounded-full" title="Online"></div>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-[#374856]">
              <button
                onClick={() => setShowOnlineUsers(false)}
                className="w-full bg-[#00a884] hover:bg-[#06cf9c] text-white py-2.5 px-4 rounded transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages - WhatsApp-like background */}
      <main
        ref={chatBoxRef}
        className="pt-20 sm:pt-24 pb-20 sm:pb-24 px-2 sm:px-4 md:px-6 lg:px-10 w-full mx-auto h-screen overflow-auto bg-[#0b141a]"
        style={{backgroundImage: 'url(https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png)', backgroundRepeat: 'repeat'}}
      >
        <div className="space-y-2">
          {messages.map((message, index) => {
            const isCurrentUser = message.sender === currentUser;

            return (
              <div
                key={index}
                className={`flex ${isCurrentUser ? "justify-end" : "justify-start"} px-2 sm:px-0`}
              >
                <div className={`p-2 sm:p-2.5 max-w-[85%] xs:max-w-[80%] sm:max-w-[70%] md:max-w-md lg:max-w-lg rounded-lg ${isCurrentUser ? 'bg-[#005c4b]' : 'bg-[#202c33]'} shadow-sm`}>
                  <div className="flex flex-row gap-2">
                    {!isCurrentUser && (
                      <img
                        className="h-8 w-8 rounded-full flex-shrink-0"
                        src={`https://avatar.iran.liara.run/public/boy?username=${message.sender}`}
                        alt=""
                      />
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      {!isCurrentUser && (
                        <p className="text-xs font-medium text-[#00a884]">{message.sender}</p>
                      )}
                      <div className="text-sm sm:text-[15px]">
                        {message.messageType === "IMAGE" ? (
                          <img 
                            src={`${baseURL}${message.content}`} 
                            alt="attachment" 
                            className="max-w-48 sm:max-w-64 rounded cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => window.open(`${baseURL}${message.content}`, '_blank')}
                          />
                        ) : message.messageType === "AUDIO" ? (
                          <audio 
                            controls 
                            src={`${baseURL}${message.content}`} 
                            className="w-48 sm:w-64"
                          />
                        ) : (
                          <p className="break-words text-[#e9edef]">{message.content}</p>
                        )}
                      </div>
                      <div className="flex justify-end items-center gap-1 mt-0.5">
                        <p className="text-[11px] text-[#8696a0]">
                          {timeAgo(message.timestamp || message.messageTime)}
                        </p>
                        {/* WhatsApp-style message status (only for current user) */}
                        {isCurrentUser && (
                          <div className="flex items-center">
                            {message.status === "sending" && (
                              <div className="w-3 h-3 border border-[#8696a0] border-t-transparent rounded-full animate-spin"></div>
                            )}
                            {message.status === "sent" && (
                              <span className="text-[#8696a0] text-sm">✓</span>
                            )}
                            {message.status === "delivered" && (
                              <span className="text-[#53bdeb] text-sm">✓✓</span>
                            )}
                            {message.status === "failed" && (
                              <span className="text-[#ff5757] text-sm">!</span>
                            )}
                            {message.status === "queued" && (
                              <span className="text-[#ffa500] text-sm" title="Queued">⏱</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Input Container - WhatsApp-like */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#202c33] py-2 sm:py-3">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="w-full mx-auto">
            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <button
                onClick={() => fileInputRef.current.click()}
                className="bg-[#374856] hover:bg-[#475d6f] h-9 w-9 sm:h-10 sm:w-10 flex justify-center items-center rounded-full text-[#8696a0] hover:text-[#e9edef] transition-colors flex-shrink-0"
              >
                <MdAttachFile size={20} />
              </button>
              
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                className={`h-9 w-9 sm:h-10 sm:w-10 flex justify-center items-center rounded-full transition-colors flex-shrink-0 ${isRecording ? 'bg-[#ff5757] text-white' : 'bg-[#374856] hover:bg-[#475d6f] text-[#8696a0] hover:text-[#e9edef]'}`}
              >
                <FaMicrophone size={16} />
              </button>

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSending) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                type="text"
                placeholder={stompConnected ? "Type a message" : "Connecting..."}
                disabled={!stompConnected}
                className={`flex-1 bg-[#2a3942] px-3 py-2.5 sm:px-4 rounded-lg focus:outline-none text-[#e9edef] placeholder-[#8696a0] text-sm sm:text-[15px] ${!stompConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() || !stompConnected || isSending}
                className="bg-[#00a884] hover:bg-[#06cf9c] disabled:bg-[#374856] disabled:cursor-not-allowed h-9 w-9 sm:h-10 sm:w-10 flex justify-center items-center rounded-full text-white transition-colors flex-shrink-0"
              >
                <MdSend size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;