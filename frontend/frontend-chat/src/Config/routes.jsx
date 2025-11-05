import React from "react";
import { Routes, Route } from "react-router";
import App from "../App.jsx";
import ChatPage from "../Components/ChatPage.jsx";


const AppRoutes = () => { // Updated line
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/chat/" element={< ChatPage/>} />
      <Route path="/about" element={<h1>This is about page</h1>}/>
      <Route path= "*" element={<h1>404 page Not found</h1>}/>

    </Routes>
  );
};

export default AppRoutes;
