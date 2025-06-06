import { Tweet } from "@prisma/client";
import { GraphqlContext } from "..";
import TweetService from "../../services/tweet";
import { TweetEngagementService } from "../../services/tweet-engagement";
import UserService from "../../services/user";

export interface TweetInput {
  content?: string;
  imageURL?: string;
}
export interface ImageUploadInput {
  imageName: string;
  imageType: string;
}

const queries = {
  getTweet: async (_: any, { tweetId }: { tweetId: string }) =>
    await TweetService.getTweet(tweetId),
  getPaginatedTweets: async (
    _: any,
    {
      userId,
      limit,
      cursor,
    }: { userId: string; limit: number; cursor?: string }
  ) => await TweetService.getTweets(userId, limit, cursor),
  getAllTweets: async () => TweetService.getAllTweets(),
  getSignedURLForUploadingImage: async (
    _: any,
    { payload }: { payload: ImageUploadInput },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await TweetService.getSignedURLForUploadingTweet(
      ctx.user.id,
      payload
    );
  },
  getPaginatedTweetsFeed: async (
    _: any,
    { limit, cursor }: { limit: number; cursor?: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await TweetService.getTweetsFeed(ctx.user.id, limit, cursor);
  },
};

const mutations = {
  createTweet: async (
    _: any,
    { payload }: { payload: TweetInput },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await TweetService.createTweet(payload, ctx.user.id);
  },
  deleteTweet: async (
    _: any,
    { tweetId }: { tweetId: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await TweetService.deleteTweet(ctx.user.id, tweetId);
  },
  updateTweet: async (
    _: any,
    { tweetId, payload }: { tweetId: string; payload: TweetInput },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) return null;
    return await TweetService.updateTweet(ctx.user.id, tweetId, payload);
  },
};

const extraResolvers = {
  Tweet: {
    author: async (parent: Tweet) =>
      await UserService.getUserById(parent.authorId),
    tweetEngagement: async (parent: Tweet) =>
      await TweetEngagementService.getTweetEngagement(parent.id),
  },
};

export const resolvers = { queries, mutations, extraResolvers };
