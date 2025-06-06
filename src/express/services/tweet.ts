import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prismaClient } from "../clients/prisma";
import { ImageUploadInput, TweetInput } from "../graphql/tweet/resolvers";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../clients/aws";
import UserService from "./user";
import { Tweet, User } from "@prisma/client";

class TweetService {
  public static async getTweet(tweetId: string) {
    try {
      return await prismaClient.tweet.findUnique({ where: { id: tweetId } });
    } catch (err) {
      return err;
    }
  }

  public static async createTweet(payload: TweetInput, sessionUserId: string) {
    const { content, imageURL } = payload;
    try {
      await prismaClient.tweet.create({
        data: {
          content,
          imageURL,
          author: { connect: { id: sessionUserId } },
        },
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async deleteTweet(sessionUserId: string, tweetId: string) {
    try {
      await prismaClient.tweet.delete({
        where: { id: tweetId, authorId: sessionUserId },
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async updateTweet(
    sessionUserId: string,
    tweetId: string,
    payload: TweetInput
  ) {
    const { content, imageURL } = payload;
    try {
      await prismaClient.tweet.update({
        where: { id: tweetId, authorId: sessionUserId },
        data: { content, imageURL, updatedAt: new Date(Date.now()) },
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async getAllTweets() {
    try {
      return await prismaClient.tweet.findMany();
    } catch (err) {
      return err;
    }
  }

  public static async getSignedURLForUploadingTweet(
    sessionUserId: string,
    payload: ImageUploadInput
  ) {
    const { imageName, imageType } = payload;

    const allowedImagesTypes = ["jpg", "jpeg", "png", "webp"];
    if (!allowedImagesTypes.includes(imageType))
      throw new Error("Unsupported Image Type");

    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: `uploads/${sessionUserId}/images/${imageName}-${Date.now()}.${imageType}`,
    });

    const signedURL = await getSignedUrl(s3Client, putObjectCommand);
    return signedURL;
  }

  // public static async getTweetsFeed(
  //   sessionUserId: string,
  //   limit: number,
  //   cursor?: string
  // ) {
  //   try {
  //     const sessionUserFollowings = await UserService.getFollowings(
  //       sessionUserId,
  //       sessionUserId
  //     );

  //     let followingsTweets: any[] = [];
  //     for (const following of sessionUserFollowings) {
  //       const tweets = await TweetService.getTweets(following.id);
  //       followingsTweets.push(tweets);
  //     }
  //     const sessionUserTweets: any = await TweetService.getTweets(
  //       sessionUserId
  //     );

  //     const result = [];
  //     for (const tweets of followingsTweets) {
  //       result.push(...tweets);
  //     }
  //     result.push(...sessionUserTweets);

  //     result.sort((a, b) => Number(b?.createdAt) - Number(a?.createdAt));
  //     return result;
  //   } catch (err) {
  //     return err;
  //   }
  // }

  public static async getTweetsFeed(
    sessionUserId: string,
    limit: number,
    cursor?: string
  ) {
    try {
      const sessionUserFollowings = await UserService.getFollowings(
        sessionUserId,
        sessionUserId
      );
      const followingIds = sessionUserFollowings.map((x: any) => x.id);

      const tweets = await prismaClient.tweet.findMany({
        where: { authorId: { in: [...followingIds, sessionUserId] } },
        orderBy: { createdAt: "desc" },
        cursor: cursor ? { id: cursor } : undefined,
        take: limit + 1,
        skip: cursor ? 1 : 0,
      });

      const hasNextPage = tweets.length > limit;
      if (hasNextPage) tweets.pop();
      return {
        tweets,
        nextCursor: hasNextPage ? tweets[tweets.length - 1].id : null,
      };
    } catch (err) {
      return err;
    }
  }

  // public static async getTweets(targetUserId: string) {
  //   try {
  //     const tweets = await prismaClient.tweet.findMany({
  //       where: { authorId: targetUserId },
  //       orderBy: { createdAt: "desc" },
  //     });

  //     console.log("user tweets -", tweets);

  //     return tweets;
  //   } catch (err) {
  //     return err;
  //   }
  // }

  public static async getTweets(
    targetUserId: string,
    limit: number = 4,
    cursor?: string
  ) {
    try {
      const tweets = await prismaClient.tweet.findMany({
        where: { authorId: targetUserId },
        orderBy: { createdAt: "desc" },
        cursor: cursor ? { id: cursor } : undefined,
        take: limit + 1,
        skip: cursor ? 1 : 0,
      });

      const hasNextPage = tweets.length > limit;
      if (hasNextPage) tweets.pop();
      return {
        tweets,
        nextCursor: hasNextPage ? tweets[tweets.length - 1].id : null,
      };
    } catch (err) {
      return err;
    }
  }

  public static async getTweetsCount(targetUserId: string) {
    try {
      const tweets = await prismaClient.tweet.findMany({
        where: { authorId: targetUserId },
      });
      return tweets.length;
    } catch (err) {
      return err;
    }
  }
}

export default TweetService;
