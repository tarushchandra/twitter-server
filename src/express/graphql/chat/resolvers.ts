import { Chat } from "@prisma/client";
import { GraphqlContext } from "..";
import { ChatService, CreateMessagePayload } from "../../services/chat";

const queries = {
  getChats: async (_: any, {}, ctx: GraphqlContext) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getChats(ctx.user.id);
  },
  getChat: async (
    _: any,
    { targetUserId }: { targetUserId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getChat(ctx.user.id, targetUserId);
  },
  getChatHistory: async (
    _: any,
    { chatId }: { chatId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getChatHistory(ctx.user.id, chatId);
  },
  getChatMembers: async (
    _: any,
    { chatId }: { chatId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getChatMembers(ctx.user.id, chatId);
  },
  getAvailableMembers: async (
    _: any,
    { chatId, searchText }: { chatId: string; searchText: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getAvailableMembers(
      ctx.user.id,
      chatId,
      searchText
    );
  },
  getUnseenChatsCount: async (_: any, {}, ctx: GraphqlContext) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getUnseenChatsCount(ctx.user.id);
  },
  getPeopleWithMessageSeen: async (
    _: any,
    { messageId }: { messageId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.getPeopleWithMessageSeen(ctx.user.id, messageId);
  },
};

const mutations = {
  createGroup: async (
    _: any,
    { targetUserIds, name }: { targetUserIds: string[]; name: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.createGroup(ctx.user.id, name, targetUserIds);
  },
  renameGroup: async (
    _: any,
    { chatId, name }: { chatId: string; name: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.renameGroup(ctx.user.id, chatId, name);
  },
  addMembersToGroup: async (
    _: any,
    { chatId, targetUserIds }: { chatId: string; targetUserIds: string[] },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.addMembersToGroup(
      ctx.user.id,
      chatId,
      targetUserIds
    );
  },
  removeMemberFromGroup: async (
    _: any,
    { chatId, targetUserId }: { chatId: string; targetUserId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.removeMemberFromGroup(
      ctx.user.id,
      chatId,
      targetUserId
    );
  },
  makeGroupAdmin: async (
    _: any,
    { chatId, targetUserId }: { chatId: string; targetUserId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.makeGroupAdmin(ctx.user.id, chatId, targetUserId);
  },
  removeGroupAdmin: async (
    _: any,
    { chatId, targetUserId }: { chatId: string; targetUserId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.removeGroupAdmin(
      ctx.user.id,
      chatId,
      targetUserId
    );
  },
  leaveGroup: async (
    _: any,
    { chatId }: { chatId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.leaveGroup(ctx.user.id, chatId);
  },
  seenBy: async (
    _: any,
    { chatId, messageIds }: { chatId: string; messageIds: string[] },
    ctx: GraphqlContext
  ) => {
    if (!ctx || !ctx.user?.id) return null;
    return await ChatService.setMessagesAsSeen(ctx.user.id, chatId, messageIds);
  },
};

const extraResolvers = {
  Chat: {
    latestChatContent: async (parent: Chat) => {
      const result = await ChatService.getLatestChatContent(parent.id);
      return result;
    },

    latestMessage: async (parent: Chat, {}, ctx: GraphqlContext) => {
      if (!ctx || !ctx.user?.id) return null;
      return await ChatService.getLatestMessage(ctx.user.id, parent.id);
    },
    totalMembersCount: async (parent: Chat, {}, ctx: GraphqlContext) => {
      if (!ctx || !ctx.user?.id) return null;
      return await ChatService.getMembersCount(ctx.user.id, parent.id);
    },
    unseenMessagesCount: async (parent: Chat, {}, ctx: GraphqlContext) => {
      if (!ctx || !ctx.user?.id) return null;
      return await ChatService.getUnseenMessagesCount(ctx.user.id, parent.id);
    },
  },
};

export const resolvers = { queries, mutations, extraResolvers };
