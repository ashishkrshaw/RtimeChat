import { httpClient } from "../Config/AxiosHelper";

export const createRoomApi = async (roomDetail, creator) => {
  const response = await httpClient.post(`/api/v1/rooms`, {
    roomId: roomDetail,
    creator: creator
  }, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  return response.data;
};

export const joinChatApi = async (roomId) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}`);
  return response.data;
};

export const deleteRoomApi = async (roomId, username) => {
  const response = await httpClient.delete(`/api/v1/rooms/${roomId}?username=${username}`);
  return response.data;
};

export const getOnlineUsersApi = async (roomId) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}/online-users`);
  return response.data;
};

export const addUserToRoomApi = async (roomId, username) => {
  const response = await httpClient.post(`/api/v1/rooms/${roomId}/join-user`, {
    username: username
  });
  return response.data;
};

export const removeUserFromRoomApi = async (roomId, username) => {
  const response = await httpClient.post(`/api/v1/rooms/${roomId}/leave-user`, {
    username: username
  });
  return response.data;
};

export const getMessages = async (roomId, size = 50, page = 0) => {
  const response = await httpClient.get(
    `/api/v1/rooms/${roomId}/messages?size=${size}&page=${page}`
  );
  return response.data;
};

export const registerUserApi = async (user) => {
  const response = await httpClient.post("/api/v1/users/register", user);
  return response.data;
};

export const loginUserApi = async (credentials) => {
  const response = await httpClient.post("/api/v1/users/login", credentials);
  return response.data;
};