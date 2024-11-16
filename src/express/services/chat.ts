import { Chat, ChatActivity, ChatMemberRole, Message } from "@prisma/client";
import { prismaClient } from "../clients/prisma";
import UserService from "./user";

export interface CreateMessagePayload {
  targetUserIds: string[] | null;
  content: string;
  chatId?: string;
}

interface ChatMetaData {
  chatName: string;
  isGroupChat: boolean;
}

interface ChatHistory {
  date: string;
  messages: {
    unseenMessages: Message[];
    seenMessages: Message[];
    sessionUserMessages: Message[];
  };
  activities: ChatActivity[];
}

export class ChatService {
  public static async findOrCreateChat(
    sessionUserId: string,
    targetUserIds: string[],
    metaData?: ChatMetaData
  ) {
    const totalMemberIds = [sessionUserId, ...targetUserIds];

    console.log("totalMembersId -", totalMemberIds);
    console.log("metaData -", metaData);

    if (!metaData || !metaData.isGroupChat) {
      const chat = await prismaClient.chat.findFirst({
        where: {
          isGroupChat: false,
          AND: totalMemberIds.map((memberId) => ({
            members: { some: { userId: memberId } },
          })),
        },
      });
      // console.log("chat -", chat);
      if (chat) return chat;

      // create chat
      return prismaClient.chat.create({
        data: {
          creator: { connect: { id: sessionUserId } },
          members: {
            create: totalMemberIds.map((memberId) => ({
              user: { connect: { id: memberId } },
            })),
          },
        },
      });
    }

    const chat = await prismaClient.chat.findFirst({
      where: {
        name: metaData.chatName,
      },
    });
    // console.log("chat -", chat);
    if (chat) throw new Error("Group already exists");

    return prismaClient.chat.create({
      data: {
        creator: { connect: { id: sessionUserId } },
        members: {
          create: totalMemberIds.map((memberId) => ({
            user: { connect: { id: memberId } },
            role:
              memberId === sessionUserId
                ? ChatMemberRole.ADMIN
                : ChatMemberRole.MEMBER,
          })),
        },
        name: metaData.chatName,
        isGroupChat: metaData.isGroupChat,
      },
    });
  }

  public static async getChat(sessionUserId: string, targetUserId: string) {
    try {
      const chat = await prismaClient.chat.findFirst({
        where: {
          isGroupChat: false,
          AND: [
            { members: { some: { userId: sessionUserId } } },
            { members: { some: { userId: targetUserId } } },
          ],
        },
        include: {
          members: {
            where: { userId: { not: sessionUserId } },
            include: { user: true },
          },
          creator: true,
        },
      });
      // console.log("chat -", chat);
      // console.log("user -", chat?.members[0].user);
      if (!chat) return null;
      return { ...chat, members: chat?.members.map((x) => x.user) };
    } catch (err) {
      return err;
    }
  }

  public static async createGroup(
    sessionUserId: string,
    name: string,
    targetUserIds: string[]
  ) {
    try {
      await ChatService.findOrCreateChat(sessionUserId, targetUserIds, {
        chatName: name,
        isGroupChat: true,
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async renameGroup(
    sessionUserId: string,
    chatId: string,
    name: string
  ) {
    try {
      await prismaClient.chat.update({
        where: {
          id: chatId,
          isGroupChat: true,
          members: {
            some: { AND: [{ userId: sessionUserId }, { role: "ADMIN" }] },
          },
        },
        data: {
          name,
          activites: {
            create: {
              type: "CHAT_RENAMED",
              metaData: {
                chatName: name,
              },
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: sessionUserId } },
            },
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async getAvailableMembers(
    sessionUserId: string,
    chatId: string,
    searchText: string
  ) {
    try {
      const result = await prismaClient.chatMembership.findMany({
        where: { chatId, NOT: { userId: sessionUserId } },
      });
      const targetMemberIds = result.map((x) => x.userId);

      return UserService.getUsersWithout(
        sessionUserId,
        targetMemberIds,
        searchText
      );
    } catch (err) {
      return err;
    }
  }

  public static async addMembersToGroup(
    sessionUserId: string,
    chatId: string,
    targetUserIds: string[]
  ) {
    try {
      await prismaClient.chat.update({
        where: {
          id: chatId,
          members: {
            some: { AND: [{ userId: sessionUserId }, { role: "ADMIN" }] },
          },
        },
        data: {
          members: {
            create: targetUserIds.map((memberId) => ({
              user: { connect: { id: memberId } },
            })),
          },
          activites: {
            create: targetUserIds.map((memberId) => ({
              type: "MEMBER_ADDED",
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: memberId } },
            })),
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async removeMemberFromGroup(
    sessionUserId: string,
    chatId: string,
    targetUserId: string
  ) {
    try {
      await prismaClient.chat.update({
        where: {
          id: chatId,
          members: {
            some: { AND: [{ userId: sessionUserId }, { role: "ADMIN" }] },
          },
        },
        data: {
          members: {
            delete: { chatId_userId: { chatId, userId: targetUserId } },
          },
          activites: {
            create: {
              type: "MEMBER_REMOVED",
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: targetUserId } },
            },
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async makeGroupAdmin(
    sessionUserId: string,
    chatId: string,
    targetUserId: string
  ) {
    try {
      await prismaClient.chat.update({
        where: {
          id: chatId,
          members: {
            some: { AND: [{ userId: sessionUserId }, { role: "ADMIN" }] },
          },
        },
        data: {
          members: {
            update: {
              where: { chatId_userId: { chatId, userId: targetUserId } },
              data: { role: "ADMIN" },
            },
          },
          activites: {
            create: {
              type: "ADMIN_ADDED",
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: targetUserId } },
            },
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async removeGroupAdmin(
    sessionUserId: string,
    chatId: string,
    targetUserId: string
  ) {
    try {
      await prismaClient.chat.update({
        where: {
          id: chatId,
          members: {
            some: { AND: [{ userId: sessionUserId }, { role: "ADMIN" }] },
          },
        },
        data: {
          members: {
            update: {
              where: { chatId_userId: { chatId, userId: targetUserId } },
              data: { role: "MEMBER" },
            },
          },
          activites: {
            create: {
              type: "ADMIN_REMOVED",
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: targetUserId } },
            },
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async leaveGroup(sessionUserId: string, chatId: string) {
    try {
      await prismaClient.chat.update({
        where: { id: chatId, members: { some: { userId: sessionUserId } } },
        data: {
          members: {
            delete: { chatId_userId: { chatId, userId: sessionUserId } },
          },
          activites: {
            create: {
              type: "MEMBER_LEFT",
              user: { connect: { id: sessionUserId } },
              targetUser: { connect: { id: sessionUserId } },
            },
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async getChats(sessionUserId: string) {
    try {
      const result = await prismaClient.chat.findMany({
        where: { members: { some: { userId: sessionUserId } } },
        include: {
          members: {
            where: { userId: { not: sessionUserId } },
            include: { user: true },
            take: 2,
            orderBy: { createdAt: "asc" },
          },
          creator: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      // console.log("chats -", result);
      // console.log("message -", result[0].messages[0]);

      return result.map((chat) => ({
        ...chat,
        members: chat.members.map((x) => x.user),
      }));
    } catch (err) {
      return err;
    }
  }

  public static async getChatMembers(sessionUserId: string, chatId: string) {
    try {
      const result = await prismaClient.chatMembership.findMany({
        where: {
          chatId,
          chat: { members: { some: { userId: sessionUserId } } },
        },
        include: { user: true },
      });

      const sessionUserChatMembership = result.filter(
        (x) => x.userId === sessionUserId
      );
      const adminChatMemberships = result.filter((x) => {
        if (x.userId === sessionUserId) return;
        return x.role === ChatMemberRole.ADMIN;
      });
      const remainingChatMemberships = result.filter(
        (x) => x.userId !== sessionUserId && x.role !== ChatMemberRole.ADMIN
      );

      // console.log("sessionUserChatMembership -", sessionUserChatMembership);
      // console.log("adminChatMemberships -", adminChatMemberships);
      // console.log("remainingChatMemberships -", remainingChatMemberships);

      return [
        {
          user: sessionUserChatMembership[0].user,
          role: sessionUserChatMembership[0].role,
        },
        ...adminChatMemberships,
        ...remainingChatMemberships,
      ];
    } catch (err) {
      return err;
    }
  }

  public static async getMembersCount(sessionUserId: string, chatId: string) {
    try {
      return prismaClient.chatMembership.count({
        where: {
          chatId,
          chat: { members: { some: { userId: sessionUserId } } },
        },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getChatHistory(sessionUserId: string, chatId: string) {
    try {
      const result = await prismaClient.chat.findUnique({
        where: { id: chatId, members: { some: { userId: sessionUserId } } },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            include: {
              sender: true,
              seenBy: { select: { id: true } },
            },
          },
          activites: {
            orderBy: { createdAt: "desc" },
            include: { user: true, targetUser: true },
          },
        },
      });

      // console.log("Result -", result);
      // console.log("seenBy -", result?.messages[0].seenBy);

      const items = [...result!.messages, ...result!.activites];
      items.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

      console.log("items -", items);

      const chatHistory = items.reduce((acc: ChatHistory[], curr: any) => {
        const createdAtDate = new Date(curr.createdAt).toDateString();

        const item = acc.find((x: any) => x.date === createdAtDate);
        const isSeen = curr?.seenBy?.find(
          (user: any) => user.id === sessionUserId
        );

        if (!item) {
          if (curr.type) {
            acc.push({
              date: createdAtDate,
              messages: {
                unseenMessages: [],
                seenMessages: [],
                sessionUserMessages: [],
              },
              activities: [curr],
            });
            return acc;
          }

          if (curr.sender.id === sessionUserId)
            acc.push({
              date: createdAtDate,
              messages: {
                seenMessages: [],
                unseenMessages: [],
                sessionUserMessages: [{ ...curr, seenBy: curr.seenBy }],
              },
              activities: [],
            });
          else if (isSeen) {
            acc.push({
              date: createdAtDate,
              messages: {
                seenMessages: [curr],
                unseenMessages: [],
                sessionUserMessages: [],
              },
              activities: [],
            });
          } else
            acc.push({
              date: createdAtDate,
              messages: {
                seenMessages: [],
                unseenMessages: [curr],
                sessionUserMessages: [],
              },
              activities: [],
            });
          return acc;
        }

        if (curr.type) {
          item.activities.push(curr);
          return acc;
        }

        if (curr.sender.id === sessionUserId)
          item.messages.sessionUserMessages.push({
            ...curr,
            seenBy: curr.seenBy,
          });
        else if (isSeen) item.messages.seenMessages.push(curr);
        else item.messages.unseenMessages.push(curr);

        return acc;
      }, []);

      console.log("chatHistory -", chatHistory);

      return chatHistory;
    } catch (err) {
      return err;
    }
  }

  // ---------------------------------------------------------------------------------

  // public static async createMessage(
  //   sessionUserId: string,
  //   payload: CreateMessagePayload
  // ) {
  //   // console.log("session user -", sessionUserId);
  //   // console.log("payload -", payload);

  //   const { content, targetUserIds, chatId } = payload;
  //   let chat: Chat | null = null;

  //   try {
  //     if (!chatId && targetUserIds)
  //       chat = await ChatService.findOrCreateChat(sessionUserId, targetUserIds);

  //     const updatedChat = await prismaClient.chat.update({
  //       where: {
  //         id: chatId ? chatId : chat?.id,
  //         members: { some: { userId: sessionUserId } },
  //       },
  //       data: {
  //         messages: {
  //           create: [{ content, sender: { connect: { id: sessionUserId } } }],
  //         },
  //         updatedAt: new Date(Date.now()),
  //       },
  //       select: {
  //         messages: {
  //           select: { id: true },
  //           orderBy: { createdAt: "desc" },
  //           take: 1,
  //         },
  //       },
  //     });

  //     // console.log("updated chat -", updatedChat);

  //     return {
  //       id: updatedChat.messages[0].id,
  //       chat,
  //     };
  //   } catch (err) {
  //     return err;
  //   }
  // }

  public static async createMessages(
    sessionUserId: string,
    chatId: string,
    messages: any[]
  ) {
    // console.log("session user -", sessionUserId);
    // console.log("payload -", payload);

    try {
      const updatedChat = await prismaClient.chat.update({
        where: {
          id: chatId,
          members: { some: { userId: sessionUserId } },
        },
        data: {
          messages: {
            create: messages.map((message) => ({
              content: message.content,
              sender: { connect: { id: sessionUserId } },
              createdAt: new Date(Number(message.createdAt)),
            })),
          },
          updatedAt: new Date(Date.now()),
        },
        select: {
          messages: {
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: messages.length,
          },
        },
      });

      // console.log("updated chat -", updatedChat);

      return updatedChat.messages;
    } catch (err) {
      return err;
    }
  }

  public static async getLatestChatContent(chatId: string) {
    try {
      const latestMessage = await prismaClient.message.findFirst({
        where: { chatId },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      });

      const latestChatActivity = await prismaClient.chatActivity.findFirst({
        where: { chatId },
        orderBy: {
          createdAt: "desc",
        },
        include: { user: true, targetUser: true },
        take: 1,
      });

      // console.log("latestMessage -", latestMessage);
      // console.log("latestChatActivity -", latestChatActivity);

      if (!latestChatActivity) return latestMessage;

      const result =
        latestMessage?.createdAt! > latestChatActivity?.createdAt!
          ? latestMessage
          : latestChatActivity;

      // console.log("result - ", result);

      return result;
    } catch (err) {
      return err;
    }
  }

  public static async getLatestMessage(sessionUserId: string, chatId: string) {
    try {
      return await prismaClient.message.findFirst({
        where: {
          chatId,
          chat: { members: { some: { userId: sessionUserId } } },
        },
        orderBy: { createdAt: "desc" },
        include: {
          sender: {
            select: { firstName: true, username: true, profileImageURL: true },
          },
        },
      });
    } catch (err) {
      return err;
    }
  }

  // public static async setMessagesAsSeen(
  //   sessionUserId: string,
  //   chatId: string,
  //   messageIds: string[]
  // ) {
  //   try {
  //     await prismaClient.chat.update({
  //       where: { id: chatId, members: { some: { userId: sessionUserId } } },
  //       data: {
  //         messages: {
  //           update: messageIds.map((messageId) => ({
  //             where: {
  //               id: messageId,
  //               AND: [
  //                 { seenBy: { none: { id: sessionUserId } } },
  //                 { senderId: { not: sessionUserId } },
  //               ],
  //             },
  //             data: { seenBy: { connect: { id: sessionUserId } } },
  //           })),
  //         },
  //       },
  //     });
  //     return true;
  //   } catch (err) {
  //     return err;
  //   }
  // }

  public static async setMessagesAsSeen(
    sessionUserId: string,
    chatId: string,
    messages: any
  ) {
    console.log("setMessagesAsSeen args -", sessionUserId, chatId, messages);

    try {
      await prismaClient.chat.update({
        where: { id: chatId, members: { some: { userId: sessionUserId } } },
        data: {
          messages: {
            update: messages.map((message: any) => ({
              where: {
                id: message.id,
                AND: [
                  { seenBy: { none: { id: sessionUserId } } },
                  { senderId: { not: sessionUserId } },
                ],
              },
              data: { seenBy: { connect: { id: sessionUserId } } },
            })),
          },
        },
      });
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async getUnseenChatsCount(sessionUserId: string) {
    try {
      return await prismaClient.chat.count({
        where: {
          members: { some: { userId: sessionUserId } },
          messages: {
            some: {
              AND: [
                { seenBy: { none: { id: sessionUserId } } },
                { senderId: { not: sessionUserId } },
              ],
            },
          },
        },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getUnseenMessagesCount(
    sessionUserId: string,
    chatId: string
  ) {
    try {
      return await prismaClient.message.count({
        where: {
          chatId,
          AND: [
            { seenBy: { none: { id: sessionUserId } } },
            { senderId: { not: sessionUserId } },
          ],
        },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getPeopleWithMessageSeen(
    sessionUserId: string,
    messageId: string
  ) {
    try {
      const result = await prismaClient.message.findUnique({
        where: {
          id: messageId,
          chat: { members: { some: { userId: sessionUserId } } },
        },
        include: { seenBy: true },
      });
      return result?.seenBy;
    } catch (err) {
      return err;
    }
  }
}
