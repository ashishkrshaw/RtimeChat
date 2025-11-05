import React, { useEffect, useRef, useState } from "react";
import { MdAttachFile, MdSend, MdImage, MdMic, MdVideoCall, MdStop, MdClose } from "react-icons/md";

// Mock context and services for demonstration
const useChatContext = () => ({
  roomId: "demo-room-123",
  currentUser: "john_doe",
  connected: true,
  setConnected: () => {},
  setRoomId: () => {},
  setCurrentUser: () => {},
});

const getMessages = () => Promise.resolve([]);
const baseURL = "http://localhost:8080";

// Enhanced timeAgo function with proper formatting
const timeAgo = (timestamp, currentTime = new Date()) => {
  const now = currentTime.getTime();
  const messageTime = new Date(timestamp).getTime();
  
  // Check if timestamp is invalid
  if (isNaN(messageTime)) {
    return "Just now";
  }
  
  const diff = Math.floor((now - messageTime) / 1000);

  // If message is from future or very recent, show "Just now"
  if (diff < 30 || diff < 0) return "Just now";
  
  // Less than an hour
  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes}m ago`;
  }
  
  // Less than 24 hours
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  
  // Less than 7 days
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }
  
  // Less than 30 days
  if (diff < 2592000) {
    const weeks = Math.floor(diff / 604800);
    return weeks === 1 ? '1w ago' : `${weeks}w ago`;
  }
  
  // Less than a year
  if (diff < 31536000) {
    const months = Math.floor(diff / 2592000);
    return months === 1 ? '1mo ago' : `${months}mo ago`;
  }
  
  // More than a year
  const years = Math.floor(diff / 31536000);
  return years === 1 ? '1y ago' : `${years}y ago`;
};

// Generate consistent color for username based on hash
const generateUserColor = (username, isCurrentUser = false) => {
  if (isCurrentUser) {
    return "bg-gradient-to-br from-blue-600 to-blue-700 text-white border-2 border-blue-400";
  }
  
  // Create hash from username
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    const char = username.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const colors = [
    "bg-gradient-to-br from-green-500 to-green-600 text-white",
    "bg-gradient-to-br from-purple-500 to-purple-600 text-white", 
    "bg-gradient-to-br from-pink-500 to-pink-600 text-white",
    "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white",
    "bg-gradient-to-br from-red-500 to-red-600 text-white",
    "bg-gradient-to-br from-orange-500 to-orange-600 text-white",
    "bg-gradient-to-br from-teal-500 to-teal-600 text-white",
    "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white",
    "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white",
    "bg-gradient-to-br from-yellow-500 to-yellow-600 text-gray-900",
    "bg-gradient-to-br from-rose-500 to-rose-600 text-white",
    "bg-gradient-to-br from-violet-500 to-violet-600 text-white",
    "bg-gradient-to-br from-lime-500 to-lime-600 text-white",
    "bg-gradient-to-br from-amber-500 to-amber-600 text-gray-900",
    "bg-gradient-to-br from-sky-500 to-sky-600 text-white",
  ];
  
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
};

const ChatPage = () => {
  const {
    roomId,
    currentUser,
    connected,
    setConnected,
    setRoomId,
    setCurrentUser,
  } = useChatContext();

  // Demo messages with various timestamps for testing
  const [messages, setMessages] = useState([
    {
      sender: "alice_smith",
      content: "Hey everyone! How's it going?",
      messageType: "text",
      timeStamp: new Date(Date.now() - 30000).toISOString() // 30 seconds ago
    },
    {
      sender: "bob_jones",
      content: "Pretty good! Just working on some code.",
      messageType: "text", 
      timeStamp: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
    },
    {
      sender: "john_doe",
      content: "Same here! This chat app is looking great.",
      messageType: "text",
      timeStamp: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
    },
    {
      sender: "charlie_brown",
      content: "📷 Photo: vacation.jpg",
      messageType: "photo",
      timeStamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      fileUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop"
    }
  ]);

  const [input, setInput] = useState("");
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const inputRef = useRef(null);
  const chatBoxRef = useRef(null);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Update current time every 30 seconds for real-time timestamp updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scroll({
        top: chatBoxRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Send text message
  const sendMessage = async () => {
    if (input.trim()) {
      const message = {
        sender: currentUser,
        content: input,
        messageType: 'text',
        timeStamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, message]);
      setInput("");
    }
  };

  // Mock file upload function
  const uploadFile = async (file, messageType = 'file') => {
    if (!file) return null;
    // In real app, this would upload to server
    return URL.createObjectURL(file);
  };

  // Handle photo selection
  const handlePhotoSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileUrl = await uploadFile(file, 'photo');
      
      const message = {
        sender: currentUser,
        content: `📷 Photo: ${file.name}`,
        messageType: 'photo',
        timeStamp: new Date().toISOString(),
        fileUrl: fileUrl,
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type
        }
      };

      setMessages(prev => [...prev, message]);
    }
    setAttachmentMenu(false);
    event.target.value = '';
  };

  // Handle video selection
  const handleVideoSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileUrl = await uploadFile(file, 'video');
      
      const message = {
        sender: currentUser,
        content: `🎥 Video: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        messageType: 'video',
        timeStamp: new Date().toISOString(),
        fileUrl: fileUrl,
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type
        }
      };

      setMessages(prev => [...prev, message]);
    }
    setAttachmentMenu(false);
    event.target.value = '';
  };

  // Handle document upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileUrl = await uploadFile(file, 'document');
      
      const message = {
        sender: currentUser,
        content: `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        messageType: 'document',
        timeStamp: new Date().toISOString(),
        fileUrl: fileUrl,
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type
        }
      };

      setMessages(prev => [...prev, message]);
    }
    setAttachmentMenu(false);
    event.target.value = '';
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.wav`, { type: 'audio/wav' });
        const fileUrl = await uploadFile(audioFile, 'audio');
        
        const message = {
          sender: currentUser,
          content: `🎵 Voice message (${recordingTime}s)`,
          messageType: 'audio',
          timeStamp: new Date().toISOString(),
          fileUrl: fileUrl,
          duration: recordingTime,
          fileInfo: {
            name: audioFile.name,
            size: audioFile.size,
            type: audioFile.type
          }
        };

        setMessages(prev => [...prev, message]);
        stream.getTracks().forEach(track => track.stop());
        setRecordingTime(0);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
    setAttachmentMenu(false);
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      setRecordingTime(0);
      clearInterval(recordingTimerRef.current);
    }
  };

  // Render message content based on type
  const renderMessageContent = (message) => {
    switch (message.messageType) {
      case 'photo':
        return (
          <div className="space-y-2">
            <p className="text-sm">{message.content}</p>
            {message.fileUrl && (
              <img 
                src={message.fileUrl} 
                alt="Shared photo" 
                className="max-w-48 max-h-48 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.fileUrl, '_blank')}
              />
            )}
          </div>
        );
      case 'video':
        return (
          <div className="space-y-2">
            <p className="text-sm">{message.content}</p>
            {message.fileUrl && (
              <video 
                src={message.fileUrl} 
                controls 
                className="max-w-48 max-h-48 rounded-lg"
              />
            )}
          </div>
        );
      case 'audio':
        return (
          <div className="space-y-2">
            <p className="text-sm">{message.content}</p>
            {message.fileUrl && (
              <audio 
                src={message.fileUrl} 
                controls 
                className="w-48"
              />
            )}
          </div>
        );
      case 'document':
        return (
          <div className="space-y-2">
            <p className="text-sm cursor-pointer hover:underline" onClick={() => window.open(message.fileUrl, '_blank')}>
              {message.content}
            </p>
          </div>
        );
      default:
        return <p className="break-words">{message.content}</p>;
    }
  };

  const handleLogout = () => {
    // Mock logout functionality
    console.log("Logging out...");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Responsive */}
      <header className="fixed w-full py-3 md:py-4 shadow-lg flex flex-col sm:flex-row justify-between items-center bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 text-white z-10 px-4 space-y-2 sm:space-y-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-center sm:text-left">
          <div>
            <h1 className="text-base md:text-lg font-semibold">
              Room: <span className="font-bold">{roomId}</span>
            </h1>
          </div>
          <div>
            <h1 className="text-base md:text-lg font-semibold">
              User: <span className="font-bold">{currentUser}</span>
            </h1>
          </div>
        </div>
        <div>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-700 px-3 py-2 md:px-4 md:py-2 rounded-full text-white font-semibold shadow-lg transition-colors text-sm md:text-base"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Chat Messages - Responsive */}
      <main
        ref={chatBoxRef}
        className="pt-24 sm:pt-20 md:pt-24 pb-24 md:pb-20 px-2 sm:px-4 md:px-6 lg:px-10 w-full max-w-4xl mx-auto h-screen overflow-auto"
      >
        <div className="space-y-3 md:space-y-4">
          {messages.map((message, index) => {
            const isCurrentUser = message.sender === currentUser;
            const colorClass = generateUserColor(message.sender, isCurrentUser);

            return (
              <div
                key={index}
                className={`flex ${isCurrentUser ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div className={`max-w-[280px] sm:max-w-sm md:max-w-md lg:max-w-lg p-3 rounded-2xl ${colorClass} shadow-lg`}>
                  <div className="flex flex-row gap-2 md:gap-3">
                    <img
                      className="h-8 w-8 md:h-10 md:w-10 rounded-full border-2 border-white shadow-md flex-shrink-0"
                      src={`https://avatar.iran.liara.run/public/${message.sender.charCodeAt(0) % 100}`}
                      alt="Avatar"
                    />
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <p className="text-xs md:text-sm font-bold truncate">{message.sender}</p>
                      <div className="text-sm md:text-base">
                        {renderMessageContent(message)}
                      </div>
                      <p className="text-xs opacity-75 italic">
                        {timeAgo(message.timeStamp, currentTime)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Recording Overlay */}
      {isRecording && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl text-center max-w-sm w-full">
            <div className="animate-pulse mb-4">
              <MdMic size={48} className="text-red-500 mx-auto" />
            </div>
            <p className="text-lg font-semibold mb-2">Recording Voice Message</p>
            <p className="text-2xl font-mono text-blue-600 mb-6">{recordingTime}s</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={stopRecording}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-colors text-sm"
              >
                <MdStop size={18} />
                Send
              </button>
              <button
                onClick={cancelRecording}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-colors text-sm"
              >
                <MdClose size={18} />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Container - Responsive */}
      <div className="fixed bottom-2 sm:bottom-4 left-2 right-2 sm:left-4 sm:right-4 md:left-auto md:right-auto md:w-2/3 lg:w-1/2 md:mx-auto">
        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 rounded-2xl shadow-2xl p-2 md:p-4">
          <div className="flex items-center gap-1 md:gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              type="text"
              placeholder="Type your message here..."
              className="flex-1 bg-white dark:bg-gray-800 px-3 py-2 md:px-4 md:py-3 rounded-full focus:outline-none text-gray-900 dark:text-white shadow-inner text-sm md:text-base"
            />

            <div className="flex gap-1 relative">
              {/* Attachment Menu */}
              {attachmentMenu && (
                <div className="absolute bottom-12 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-2 min-w-36 sm:min-w-48 border border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-2 md:gap-3 w-full p-2 md:p-3 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg text-xs md:text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <MdImage className="text-blue-500 text-lg md:text-xl" />
                    <span>Photo</span>
                  </button>
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 md:gap-3 w-full p-2 md:p-3 hover:bg-green-50 dark:hover:bg-gray-700 rounded-lg text-xs md:text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <MdMic className="text-green-500 text-lg md:text-xl" />
                    <span>Voice</span>
                  </button>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-2 md:gap-3 w-full p-2 md:p-3 hover:bg-purple-50 dark:hover:bg-gray-700 rounded-lg text-xs md:text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <MdVideoCall className="text-purple-500 text-lg md:text-xl" />
                    <span>Video</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 md:gap-3 w-full p-2 md:p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-xs md:text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <MdAttachFile className="text-gray-500 text-lg md:text-xl" />
                    <span>File</span>
                  </button>
                </div>
              )}

              <button 
                onClick={() => setAttachmentMenu(!attachmentMenu)}
                className="bg-purple-600 hover:bg-purple-700 h-8 w-8 md:h-12 md:w-12 flex justify-center items-center rounded-full text-white shadow-lg transition-colors"
              >
                <MdAttachFile size={16} className="md:hidden" />
                <MdAttachFile size={20} className="hidden md:block" />
              </button>
              <button
                onClick={sendMessage}
                className="bg-green-600 hover:bg-green-700 h-8 w-8 md:h-12 md:w-12 flex justify-center items-center rounded-full text-white shadow-lg transition-colors"
              >
                <MdSend size={16} className="md:hidden" />
                <MdSend size={20} className="hidden md:block" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="*/*" />
      <input ref={photoInputRef} type="file" onChange={handlePhotoSelect} className="hidden" accept="image/*" />
      <input ref={videoInputRef} type="file" onChange={handleVideoSelect} className="hidden" accept="video/*" />

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ChatPage;