import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import UserService from "../express/services/user";
import { prismaClient } from "../express/clients/prisma";
import { Message } from "@prisma/client";
import { ChatService } from "../express/services/chat";
import { redisClient } from "../express/clients/redis";

// online users in different chats
interface OnlineUser {
  userId: string;
  socket: WebSocket;
}

type httpServerType = http.Server<
  typeof http.IncomingMessage,
  typeof http.ServerResponse
>;

function initSocketServer(httpServer: httpServerType) {
  // following maps for tracking online users
  const roomToOnlineUsersMap = new Map<string, OnlineUser[]>();
  const socketToRoomsMap = new Map<WebSocket, string[]>();
  const userIdToSocketMap = new Map<string, WebSocket>();
  const socketToUserIdMap = new Map<WebSocket, string>();

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (socket, req) => {
    console.log("new socket connected");

    socket.on("error", (err) => console.log(err));

    socket.on("close", async () => {
      console.log("socket disconnected");

      const targetUserId = socketToUserIdMap.get(socket);

      // sending the current user's offline status to other online users
      const uniqueOnlineUsers = new Set<string>();
      const lastSeenAt = Date.now();

      socketToRoomsMap.get(socket)?.forEach((roomId) => {
        const room = roomToOnlineUsersMap.get(roomId);
        if (!room) return;

        const userIndex = room.findIndex(
          (onlineUser) => onlineUser.socket === socket
        );

        if (userIndex !== -1) {
          room.splice(userIndex, 1);

          room.forEach((onlineUser) => {
            if (!uniqueOnlineUsers.has(onlineUser.userId)) {
              uniqueOnlineUsers.add(onlineUser.userId);

              if (onlineUser.socket.readyState === WebSocket.OPEN) {
                onlineUser.socket.send(
                  JSON.stringify({
                    type: "USER_IS_OFFLINE",
                    userId: targetUserId,
                    lastSeenAt,
                  })
                );
              }
            }
          });

          // check if the room is empty and remove it
          if (room.length === 0) roomToOnlineUsersMap.delete(roomId);
        }
      });

      if (targetUserId) {
        await UserService.setLastSeenAt(targetUserId, lastSeenAt);
        userIdToSocketMap.delete(targetUserId);
      }
      socketToUserIdMap.delete(socket);
      socketToRoomsMap.delete(socket);

      // console.log(
      //   "roomToOnlineUsersMap after disconnection -",
      //   roomToOnlineUsersMap
      // );
      // console.log("socketToRoomsMap after disconnection -", socketToRoomsMap);
      // console.log("userIdToSocketMap after disconnection -", userIdToSocketMap);
      // console.log("socketToUserIdMap after disconnection -", socketToRoomsMap);
    });

    socket.on("message", async (data, isBinary) => {
      // console.log("message recieved -", data.toString("utf-8"));
      const message = JSON.parse(data.toString("utf-8"));
      console.log("message recieved -", message);

      if (message.type === "AUTH") {
        const user = await UserService.decodeJwtToken(message.accessToken);
        const chats = await prismaClient.chat.findMany({
          where: { members: { some: { userId: user.id } } },
          include: { members: { where: { userId: { not: user.id } } } },
        });

        // sending the current user's online status to other online users
        const uniqueOnlineUsers = new Set();
        chats.forEach((chat) => {
          if (roomToOnlineUsersMap.size === 0) return;

          roomToOnlineUsersMap.get(chat.id)?.forEach((onlineUser) => {
            if (!uniqueOnlineUsers.has(onlineUser.userId)) {
              uniqueOnlineUsers.add(onlineUser.userId);

              if (
                onlineUser.socket.readyState === WebSocket.OPEN &&
                onlineUser.socket !== socket
              ) {
                onlineUser.socket.send(
                  JSON.stringify({
                    type: "USER_IS_ONLINE",
                    userId: user.id,
                  } as any)
                );
                socket.send(
                  JSON.stringify({
                    type: "USER_IS_ONLINE",
                    userId: onlineUser.userId,
                  })
                );
              }
            }
          });
        });

        // setting current user as online in one of the active rooms
        chats.forEach((chat) => {
          if (!roomToOnlineUsersMap.has(chat.id))
            roomToOnlineUsersMap.set(chat.id, []);
          if (!socketToRoomsMap.has(socket)) socketToRoomsMap.set(socket, []);

          roomToOnlineUsersMap.get(chat.id)?.push({ userId: user.id, socket });
          socketToRoomsMap.get(socket)?.push(chat.id);
        });

        // setting the (userId -> socket && socket -> userId) map for quick retreival
        userIdToSocketMap.set(user.id, socket);
        socketToUserIdMap.set(socket, user.id);

        // console.log(
        //   "roomToOnlineUsersMap after connection -",
        //   roomToOnlineUsersMap
        // );
        // console.log("socketToRoomsMap after connection -", socketToRoomsMap);
        // console.log("userIdToSocketMap -", userIdToSocketMap);
        // console.log("socketToUserIdMap -", socketToUserIdMap);
      }

      if (message.type === "CHAT_MESSAGE") {
        // sending an acknowledegement of "MESSAGE_RECIEVED_BY_SERVER" back to the sender
        socket.send(
          JSON.stringify({
            type: "CHAT_MESSAGE_IS_RECIEVED_BY_THE_SERVER",
            chatId: message.chatId,
            messageId: message.message.id,
          })
        );

        // initializing chatId
        let chatId = message.chatId;
        let messagesWithTempAndActualIds: any[] = [];

        // if the chat is not created
        if (typeof message.chatId === "number") {
          // sending the message ("with temporary message IDs") to whom sender wants to start the chat
          const targetUserSocket = userIdToSocketMap.get(
            message.targetUsers[0].id
          );
          if (targetUserSocket?.readyState === WebSocket.OPEN)
            targetUserSocket.send(JSON.stringify(message));

          // storing the current chat as "processing" in redis state
          const isChatCreated = await redisClient.exists(
            `CHAT_CREATED_WITH_TEMP_ID:${message.chatId}`
          );
          await redisClient.rpush(
            `CHAT_CREATED_WITH_TEMP_ID:${message.chatId}`,
            JSON.stringify(message.message)
          );
          if (isChatCreated) return;

          // creating the chat
          const chat = await ChatService.findOrCreateChat(
            message.message.sender.id,
            message.targetUsers.map((x: any) => x.id)
          );
          chatId = chat.id;

          // storing messages to DB
          const tempMessages = await redisClient.lrange(
            `CHAT_CREATED_WITH_TEMP_ID:${message.chatId}`,
            0,
            -1
          );
          const parsedTempMessages = tempMessages.map((x) => JSON.parse(x));
          const storedMessages: any = await ChatService.createMessages(
            message.message.sender.id,
            chatId,
            parsedTempMessages
          );

          // updating the messagesWithTempAndActualIds
          let temporaryMessagesIndex = 0;
          let actualMessagesIndex = storedMessages.length - 1;
          while (
            temporaryMessagesIndex < parsedTempMessages.length &&
            actualMessagesIndex >= 0
          ) {
            messagesWithTempAndActualIds.unshift({
              temporaryMessageId: parsedTempMessages[temporaryMessagesIndex].id,
              actualMessageId: storedMessages[actualMessagesIndex].id,
              sender: {
                id: message.message.sender.id,
              },
            });
            temporaryMessagesIndex++;
            actualMessagesIndex--;
          }

          // if the newly created chat is immediately seen by the reciepient
          const areChatMessagesSeen = await redisClient.exists(
            `SEEN_MESSAGES:${message.chatId}`
          );
          if (areChatMessagesSeen) {
            const seenChatMessages = await redisClient.lrange(
              `SEEN_MESSAGES:${message.chatId}`,
              0,
              -1
            );
            seenChatMessages.forEach(
              async (x) => await redisClient.rpush(`SEEN_MESSAGES:${chatId}`, x)
            );
            await redisClient.del(`SEEN_MESSAGES:${message.chatId}`);
          }

          // deleting the "temporary chat messages data" from the redis state
          await redisClient.del(`CHAT_CREATED_WITH_TEMP_ID:${message.chatId}`);

          // ------------ updating roomToOnlineUsersMap, socketToRoomsMap -----------------
          const onlineUsers: OnlineUser[] = [];
          if (socket?.readyState === WebSocket.OPEN) {
            onlineUsers.push({
              userId: message.message.sender.id,
              socket,
            });
            // updating socketToRoomsMap for sender
            if (socketToRoomsMap.has(socket))
              socketToRoomsMap.get(socket)?.push(chatId);
            else socketToRoomsMap.set(socket, [chatId]);
          }
          if (targetUserSocket?.readyState === WebSocket.OPEN) {
            onlineUsers.push({
              userId: message.targetUsers[0].id,
              socket: targetUserSocket,
            });
            // updating socketToRoomsMap for target
            if (socketToRoomsMap.has(targetUserSocket))
              socketToRoomsMap.get(targetUserSocket)?.push(chatId);
            else socketToRoomsMap.set(targetUserSocket, [chatId]);
          }

          // updating roomToOnlineUsersMap
          roomToOnlineUsersMap.set(chatId, onlineUsers);

          // console.log("------------ new chat created -----------");
          // console.log("roomToOnlineUsersMap -", roomToOnlineUsersMap);
          // console.log("socketToRoomsMap -", socketToRoomsMap);
        }
        // if the chat is already created
        else {
          // sending the message ("with temporary message IDs") to all connected users except the sender of the message
          roomToOnlineUsersMap.get(message.chatId)?.forEach((onlineUser) => {
            if (
              onlineUser.socket.readyState === WebSocket.OPEN &&
              onlineUser.socket !== socket
            )
              onlineUser.socket.send(JSON.stringify(message));
          });

          // storing message
          const storedMessages: any = await ChatService.createMessages(
            message.message.sender.id,
            chatId,
            [message.message]
          );

          messagesWithTempAndActualIds.push({
            temporaryMessageId: message.message.id,
            actualMessageId: storedMessages[0].id,
            sender: {
              id: message.message.sender.id,
            },
          });
        }

        // ---------------

        console.log(
          "messagesWithTempAndActualIds -",
          messagesWithTempAndActualIds
        );

        // sending the "actual message IDs" OR "actual newly created chatId" to all the users
        roomToOnlineUsersMap.get(chatId)?.forEach((onlineUser) => {
          if (onlineUser.socket.readyState === WebSocket.OPEN) {
            onlineUser.socket.send(
              JSON.stringify({
                type: "ACTUAL_CHAT_OR_MESSAGES_IDS",
                ...(typeof message.chatId === "number" && {
                  chat: {
                    temporaryChatId: message.chatId,
                    actualChatId: chatId,
                    creator: message.creator,
                  },
                }),
                messages: {
                  chatId,
                  messages: messagesWithTempAndActualIds,
                },
              })
            );
          }
        });

        // setting messages as "seen"
        const isSeenMessages = await redisClient.exists(
          `SEEN_MESSAGES:${chatId}`
        );
        if (!isSeenMessages) return;
        const seenMessages = await redisClient.lrange(
          `SEEN_MESSAGES:${chatId}`,
          0,
          -1
        );

        const parsedSeenMessages: any[] = [];
        seenMessages.forEach((x) => {
          const parsedMessage = JSON.parse(x);
          const finalMessage = messagesWithTempAndActualIds.find(
            (y) => y.temporaryMessageId === parsedMessage.message.id
          );
          if (!finalMessage) return;
          parsedMessage.message.id = finalMessage.actualMessageId;
          parsedSeenMessages.push(parsedMessage);
        });

        const seenByIdToMessagesMap = new Map();
        parsedSeenMessages.forEach((x) => {
          if (!seenByIdToMessagesMap.has(x.seenBy.id))
            seenByIdToMessagesMap.set(x.seenBy.id, []);
          seenByIdToMessagesMap.get(x.seenBy.id)?.push(x.message);
        });

        for (const entry of seenByIdToMessagesMap.entries()) {
          const [seenById, messages] = entry;
          await ChatService.setMessagesAsSeen(seenById, chatId, messages);
        }

        await redisClient.del(`SEEN_MESSAGES:${chatId}`);
      }

      if (message.type === "CHAT_MESSAGES_ARE_SEEN_BY_THE_RECIPIENT") {
        const { messages, chatId, seenBy } = message;

        const senderIdToMessagesMap = new Map<string, string[]>();
        let isMessageWithTemporaryIdPresent = false;

        messages.forEach(async (message: any) => {
          if (!senderIdToMessagesMap.has(message.sender.id))
            senderIdToMessagesMap.set(message.sender.id, []);
          senderIdToMessagesMap.get(message.sender.id)?.push(message.content);

          if (typeof message.id === "number") {
            isMessageWithTemporaryIdPresent = true;

            await redisClient.rpush(
              `SEEN_MESSAGES:${chatId}`,
              JSON.stringify({ message: { id: message.id }, seenBy })
            );

            // await redisClient.set(
            //   `MESSAGE_SEEN:${chatId}:${message.id}`,
            //   JSON.stringify({ isSeen: true, seenBy })
            // );
          }
        });

        for (const entry of senderIdToMessagesMap.entries()) {
          const [senderId, messages] = entry;
          const senderSocket = userIdToSocketMap.get(senderId);

          if (senderSocket?.readyState === WebSocket.OPEN) {
            senderSocket.send(
              JSON.stringify({
                type: message.type,
                chatId,
                messages,
                seenBy,
              })
            );
          }
        }

        if (!isMessageWithTemporaryIdPresent)
          await ChatService.setMessagesAsSeen(seenBy.id, chatId, messages);
      }

      if (message.type === "USER_IS_TYPING") {
        roomToOnlineUsersMap.get(message.chatId)?.forEach((onlineUser) => {
          if (
            onlineUser.socket.readyState === WebSocket.OPEN &&
            onlineUser.socket !== socket
          )
            onlineUser.socket.send(data, { binary: isBinary });
        });
      }

      if (message.type === "IS_USER_ONLINE") {
        const userSocket = userIdToSocketMap.get(message.userId);

        if (userSocket?.readyState !== WebSocket.OPEN) {
          const lastSeenAt = await UserService.getLastSeenAt(message.userId);
          socket.send(
            JSON.stringify({ ...message, isOnline: false, lastSeenAt })
          );
        } else
          socket.send(
            JSON.stringify({
              ...message,
              isOnline: true,
            })
          );
      }
    });
  });
}

export default initSocketServer;
