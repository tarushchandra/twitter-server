import { User } from "@prisma/client";
import UserService from "../../services/user";
import { GraphqlContext } from "..";
import TweetService from "../../services/tweet";

const queries = {
  getCustomUserToken: async (
    _: any,
    { googleToken, user }: { googleToken?: string; user?: any }
  ) => await UserService.getCustomUserToken({ googleToken, user }),
  getSessionUser: async (_: any, args: any, ctx: GraphqlContext) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getUserById(ctx.user.id);
  },
  getUser: async (_: any, { username }: { username: string }) => {
    console.log("getUser called -", username);
    return await UserService.getUserByUsername(username);
  },
  getMutualFollowers: async (
    _: any,
    { username }: { username: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getMutualFollowers(ctx.user.id, username);
  },
  getRecommendedUsers: async (_: any, __: any, ctx: GraphqlContext) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getRecommendedUsers(ctx.user.id);
  },
  getAllUsers: async (_: any, {}: any, ctx: GraphqlContext) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getAllUsers(ctx.user.id);
  },
  getUsers: async (
    _: any,
    { searchText }: { searchText: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getUsers(ctx.user.id, searchText);
  },
  isUsernameExist: async (_: any, { username }: { username: string }) =>
    await UserService.isUsernameExist(username),
  isEmailExist: async (_: any, { email }: { email: string }) =>
    await UserService.isEmailExist(email),
  isFollowing: async (
    _: any,
    { userId }: { userId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.isFollowing(ctx.user.id, userId);
  },
  getUserLastSeen: async (
    _: any,
    { userId }: { userId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.getLastSeenAt(userId);
  },
};

const mutations = {
  createUserWithEmailAndPassword: async (_: any, { user }: { user: any }) =>
    await UserService.signUpWithEmailAndPassword(user),
  followUser: async (_: any, { to }: { to: string }, ctx: GraphqlContext) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.followUser(ctx.user?.id, to);
  },
  unfollowUser: async (_: any, { to }: { to: string }, ctx: GraphqlContext) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.unfollowUser(ctx.user?.id, to);
  },
  removeFollower: async (
    _: any,
    { userId }: { userId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await UserService.removeFollower(ctx.user.id, userId);
  },
};

const extraResolvers = {
  User: {
    followers: async (parent: User, _: any, ctx: GraphqlContext) => {
      if (!ctx.user || !ctx.user.id) return null;
      return await UserService.getFollowers(ctx.user.id, parent.id);
    },
    followings: async (parent: User, _: any, ctx: GraphqlContext) => {
      if (!ctx.user || !ctx.user.id) return null;
      return await UserService.getFollowings(ctx.user.id, parent.id);
    },
    followersCount: async (parent: User) =>
      await UserService.getFollowersCount(parent.id),
    followingsCount: async (parent: User) =>
      await UserService.getFollowingsCount(parent.id),
    tweetsCount: async (parent: User) =>
      await TweetService.getTweetsCount(parent.id),
  },
};

export const resolvers = { queries, mutations, extraResolvers };
