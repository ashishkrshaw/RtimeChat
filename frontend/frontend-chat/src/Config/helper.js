export function timeAgo(date) {
  // Handle invalid or missing dates
  if (!date) {
    return "just now";
  }
  
  try {
    // Parse the date - the date should already be in IST from backend
    const past = new Date(date);
    
    // Check if date is valid
    if (isNaN(past.getTime())) {
      return "just now";
    }
    
    // Get current time in IST
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const secondsAgo = Math.floor((nowIST - past) / 1000);
    
    if (secondsAgo < 60) {
      return "just now";
    }
    
    // Create date objects for comparison in IST
    const todayIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
    const pastDateIST = new Date(past.getFullYear(), past.getMonth(), past.getDate());
    
    if (todayIST.getTime() === pastDateIST.getTime()) {
      // Show time for today's messages
      return past.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
    }
    
    const yesterday = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate() - 1);
    if (yesterday.getTime() === pastDateIST.getTime()) {
      return "yesterday";
    }
    
    return past.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "just now";
  }
}