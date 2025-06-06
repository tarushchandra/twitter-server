import axios from "axios";
import { prismaClient } from "../clients/prisma";
import { NotificationType, User } from "@prisma/client";
import JWT from "jsonwebtoken";
import bcrypt from "bcrypt";
import { redisClient } from "../clients/redis";
import { NotificationService } from "./notification";

interface GoogleTokenResult {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: string;
  nbf: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  locale: string;
  iat: string;
  exp: string;
  jti: string;
  alg: string;
  kid: string;
  typ: string;
}

export interface JwtUser {
  id: string;
  email: string;
  username: string;
}

class UserService {
  // Utility Functions
  private static async decodeGoogleToken(googleToken: String) {
    const URL = `https://oauth2.googleapis.com/tokeninfo?id_token=${googleToken}`;
    const { data } = await axios.get<GoogleTokenResult>(URL);
    return data;
  }

  // ---------------------------

  private static async hashPassword(password: string, saltRounds: number) {
    return await bcrypt.hash(password, saltRounds);
  }

  private static async compareHashedPassword(
    inputPassword: string,
    hashedPassword: string
  ) {
    return await bcrypt.compare(inputPassword, hashedPassword);
  }

  // ---------------------------

  private static async generateJwtToken(payload: User) {
    return JWT.sign(
      { id: payload.id, email: payload.email, username: payload.username },
      process.env.JWT_SECRET!
    );
  }

  public static async decodeJwtToken(token: string) {
    return JWT.verify(token, process.env.JWT_SECRET!) as JwtUser;
  }

  // ---------------------------

  private static async getUserByEmail(email: string) {
    return prismaClient.user.findUnique({
      where: { email },
    });
  }

  // ---------------------------

  public static async isUsernameExist(username: string) {
    try {
      const count = await prismaClient.user.count({
        where: { username },
      });
      return count > 0;
    } catch (err) {
      return err;
    }
  }

  public static async isEmailExist(email: string) {
    try {
      const count = await prismaClient.user.count({
        where: { email },
      });
      return count > 0;
    } catch (err) {
      return err;
    }
  }

  // ---------------------------

  private static async createUser(payload: any) {
    return prismaClient.user.create({
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        username: payload.username,
        profileImageURL: payload.profileImageURL && payload.profileImageURL,
        password:
          payload.password &&
          (await UserService.hashPassword(payload.password, 10)),
      },
    });
  }

  // ---------------------------

  private static async signInWithGoogle(googleToken: string) {
    const decodedToken: GoogleTokenResult = await UserService.decodeGoogleToken(
      googleToken
    );
    const { given_name, family_name, email, picture } = decodedToken;

    let user = await UserService.getUserByEmail(email);
    if (!user) {
      user = await UserService.createUser({
        firstName: given_name,
        lastName: family_name,
        email: email,
        username: email.split("@")[0],
        profileImageURL: picture,
      });
    }

    return user;
  }

  private static async signInWithEmailAndPassword(inputUser: any) {
    console.log("input user -", inputUser);

    const { email, password } = inputUser;
    let user = await UserService.getUserByEmail(email);

    console.log("user -", user);

    if (!user || !user.password) {
      throw new Error("Credentials not found");
    }

    const isMatch = await UserService.compareHashedPassword(
      password,
      user.password
    );

    if (!isMatch) throw new Error("Password don't match");

    return user;
  }

  // -------------------------------------------------------------
  // Social Connection Functions

  public static getSessionUserAsConnection(
    sessionUserId: string,
    connections: User[]
  ) {
    for (const myConnection of connections) {
      if (myConnection?.id === sessionUserId) return myConnection;
    }
  }

  public static getMutualConnections(
    sessionUserId: string,
    connections: any[]
  ) {
    const mutualConnections: User[] = [];

    for (const myConnection of connections) {
      // console.log("myConnection -", myConnection);

      const followersOfMyConnection = myConnection.followings.map(
        (follow: any) => follow.follower
      );
      // console.log("followersOfMyConnection -", followersOfMyConnection);

      for (const followerOfMyConnection of followersOfMyConnection) {
        if (followerOfMyConnection.id !== sessionUserId) continue;
        mutualConnections.push(myConnection);
      }
    }
    return mutualConnections;
  }

  public static getRemainingConnections(
    sessionUserId: string,
    connections: User[],
    mutualConnections: User[]
  ) {
    if (mutualConnections.length === 0)
      return connections.filter(
        (myConnection) => myConnection?.id !== sessionUserId
      ) as User[];

    const remainingConnections: User[] = [];
    for (const myConnection of connections) {
      const isMutualConnection = mutualConnections.find(
        (mutualConnection) => myConnection?.id === mutualConnection.id
      );
      if (isMutualConnection) continue;
      if (myConnection?.id === sessionUserId) continue;
      remainingConnections.push(myConnection as User);
    }
    return remainingConnections;
  }

  public static getRearrangedConnectionsBasedOnSessionUser(
    sessionUserId: string,
    connections: User[]
  ) {
    // console.log("sessionUserId -", sessionUserId);
    // console.log("connections -", connections);

    const sessionUserAsConnection = UserService.getSessionUserAsConnection(
      sessionUserId,
      connections
    );

    // console.log("sessionUserAsConnection -", sessionUserAsConnection);

    const mutualConnections = UserService.getMutualConnections(
      sessionUserId,
      connections
    );

    // console.log("mutualConnections -", mutualConnections);

    const remainingConnections = UserService.getRemainingConnections(
      sessionUserId,
      connections,
      mutualConnections
    );

    // console.log("remainingConnections -", remainingConnections);

    if (!sessionUserAsConnection)
      return [...mutualConnections, ...remainingConnections];
    return [
      sessionUserAsConnection,
      ...mutualConnections,
      ...remainingConnections,
    ];
  }

  // --------------------------------------------------------------------------------------
  // Service Functions (Queries and Mutations Resolvers)

  public static async getCustomUserToken(payload: any) {
    try {
      let user: User;

      if (payload.googleToken) {
        user = await UserService.signInWithGoogle(payload.googleToken);
      } else {
        user = await UserService.signInWithEmailAndPassword(payload.user);
      }

      const customToken = await UserService.generateJwtToken(user);
      return customToken;
    } catch (err) {
      return err;
    }
  }

  public static async signUpWithEmailAndPassword(inputUser: any) {
    try {
      await UserService.createUser(inputUser);
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async getUserById(userId: string) {
    try {
      return await prismaClient.user.findUnique({
        where: { id: userId },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getUserByUsername(username: string) {
    const cachedUser = await redisClient.get(`USER:${username}`);
    if (cachedUser) return JSON.parse(cachedUser);

    const result = await prismaClient.user.findUnique({
      where: { username },
    });

    await redisClient.set(`USER:${result?.id}`, JSON.stringify(result));
    return result;
  }

  public static async getAllUsers(sessionUserId: string) {
    try {
      return await prismaClient.user.findMany({
        where: { NOT: { id: sessionUserId } },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getUsers(sessionUserId: string, searchText: string) {
    try {
      if (searchText.length === 0) return [];

      return await prismaClient.user.findMany({
        where: {
          NOT: { id: sessionUserId },
          OR: [
            {
              firstName: {
                contains:
                  searchText.length > 1
                    ? searchText.slice(0, 1).toUpperCase() + searchText.slice(1)
                    : searchText,
              },
            },
            {
              lastName: {
                contains:
                  searchText.length > 1
                    ? searchText.slice(0, 1).toUpperCase() + searchText.slice(1)
                    : searchText,
              },
            },
            {
              username:
                searchText.length > 1
                  ? { equals: searchText }
                  : { contains: searchText },
            },
          ],
        },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getUsersWithout(
    sessionUserId: string,
    targetUserIds: string[],
    searchText: string
  ) {
    try {
      if (searchText.length === 0) return [];

      return await prismaClient.user.findMany({
        where: {
          AND: [sessionUserId, ...targetUserIds].map((memberId) => ({
            NOT: { id: memberId },
          })),
          OR: [
            {
              firstName: {
                contains:
                  searchText.length > 1
                    ? searchText.slice(0, 1).toUpperCase() + searchText.slice(1)
                    : searchText,
              },
            },
            {
              lastName: {
                contains:
                  searchText.length > 1
                    ? searchText.slice(0, 1).toUpperCase() + searchText.slice(1)
                    : searchText,
              },
            },
            {
              username:
                searchText.length > 1
                  ? { equals: searchText }
                  : { contains: searchText },
            },
          ],
        },
      });
    } catch (err) {
      return err;
    }
  }

  // -----------------------------------------

  public static async followUser(from: string, to: string) {
    try {
      await prismaClient.follows.create({
        data: {
          follower: { connect: { id: from } },
          following: { connect: { id: to } },
        },
      });

      // create notification
      await NotificationService.createNotification(
        NotificationType.FOLLOW,
        from,
        to
      );

      await redisClient.del(`FOLLOWERS_COUNT:${to}`);
      await redisClient.del(`FOLLOWINGS_COUNT:${from}`);

      const cachedMutualFollowers = await redisClient.keys(
        `MUTUAL_FOLLOWERS:*:${to}`
      );
      cachedMutualFollowers.forEach(async (cachedKey) => {
        if (cachedKey.includes(from)) return;
        await redisClient.del(cachedKey);
      });

      const cachedSessionUserFollowersList = await redisClient.keys(
        `TOTAL_FOLLOWERS:${from}:*`
      );
      cachedSessionUserFollowersList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );
      await redisClient.del(`TOTAL_FOLLOWERS:${to}:${to}`);

      const cachedSessionUserFollowingsList = await redisClient.keys(
        `TOTAL_FOLLOWINGS:${from}:*`
      );
      cachedSessionUserFollowingsList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );

      await redisClient.del(`RECOMMENDED_USERS:${from}`);
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async unfollowUser(from: string, to: string) {
    try {
      await prismaClient.follows.delete({
        where: {
          followerId_followingId: { followerId: from, followingId: to },
        },
      });

      // delete notification
      await NotificationService.deleteNotification(
        NotificationType.FOLLOW,
        from,
        to
      );

      await redisClient.del(`FOLLOWERS_COUNT:${to}`);
      await redisClient.del(`FOLLOWINGS_COUNT:${from}`);

      const cachedMutualFollowers = await redisClient.keys(
        `MUTUAL_FOLLOWERS:*:${to}`
      );
      cachedMutualFollowers.forEach(async (cachedKey) => {
        if (cachedKey.includes(from)) return;
        await redisClient.del(cachedKey);
      });

      const cachedSessionUserFollowersList = await redisClient.keys(
        `TOTAL_FOLLOWERS:${from}:*`
      );
      cachedSessionUserFollowersList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );
      await redisClient.del(`TOTAL_FOLLOWERS:${to}:${to}`);

      const cachedSessionUserFollowingsList = await redisClient.keys(
        `TOTAL_FOLLOWINGS:${from}:*`
      );
      cachedSessionUserFollowingsList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );

      await redisClient.del(`RECOMMENDED_USERS:${from}`);
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async removeFollower(
    sessionUserId: string,
    targetUserId: string
  ) {
    try {
      await prismaClient.follows.delete({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: sessionUserId,
          },
        },
      });

      await redisClient.del(`FOLLOWERS_COUNT:${sessionUserId}`);
      await redisClient.del(`FOLLOWINGS_COUNT:${targetUserId}`);

      const cachedMutualFollowers = await redisClient.keys(
        `MUTUAL_FOLLOWERS:*:${sessionUserId}`
      );
      cachedMutualFollowers.forEach(async (cachedKey) => {
        if (cachedKey.includes(targetUserId)) return;
        await redisClient.del(cachedKey);
      });

      const cachedTargetUserFollowersList = await redisClient.keys(
        `TOTAL_FOLLOWERS:${targetUserId}:*`
      );
      cachedTargetUserFollowersList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );
      await redisClient.del(
        `TOTAL_FOLLOWERS:${sessionUserId}:${sessionUserId}`
      );

      const cachedTargetUserFollowingsList = await redisClient.keys(
        `TOTAL_FOLLOWINGS:${targetUserId}:*`
      );
      cachedTargetUserFollowingsList.forEach(
        async (cachedKey) => await redisClient.del(cachedKey)
      );

      await redisClient.del(`RECOMMENDED_USERS:${targetUserId}`);

      return true;
    } catch (err) {
      return false;
    }
  }

  public static async getFollowers(
    sessionUserId: string,
    targetUserId: string
  ) {
    try {
      const cachedFollowers = await redisClient.get(
        `TOTAL_FOLLOWERS:${sessionUserId}:${targetUserId}`
      );
      if (cachedFollowers) return JSON.parse(cachedFollowers);

      const result = await prismaClient.follows.findMany({
        where: { followingId: targetUserId },
        include: {
          follower: {
            include: { followings: { include: { follower: true } } },
          },
        },
      });
      const followers = result.map((follow) => follow.follower);

      const rearrangedFollowers =
        UserService.getRearrangedConnectionsBasedOnSessionUser(
          sessionUserId,
          followers
        );
      await redisClient.set(
        `TOTAL_FOLLOWERS:${sessionUserId}:${targetUserId}`,
        JSON.stringify(rearrangedFollowers)
      );

      return rearrangedFollowers;
    } catch (err) {
      return err;
    }
  }

  public static async getFollowings(
    sessionUserId: string,
    targetUserId: string
  ) {
    try {
      const cachedFollowings = await redisClient.get(
        `TOTAL_FOLLOWINGS:${sessionUserId}:${targetUserId}`
      );
      if (cachedFollowings) return JSON.parse(cachedFollowings);

      const result = await prismaClient.follows.findMany({
        where: { followerId: targetUserId },
        include: {
          following: {
            include: { followings: { include: { follower: true } } },
          },
        },
      });
      const followings = result.map((follow) => follow.following);

      const rearrangedFollowings =
        UserService.getRearrangedConnectionsBasedOnSessionUser(
          sessionUserId,
          followings
        );
      await redisClient.set(
        `TOTAL_FOLLOWINGS:${sessionUserId}:${targetUserId}`,
        JSON.stringify(rearrangedFollowings)
      );
      return rearrangedFollowings;
    } catch (err) {
      return err;
    }
  }

  public static async getFollowersCount(targetUserId: string) {
    try {
      const result = await prismaClient.follows.findMany({
        where: { followingId: targetUserId },
        include: { follower: true },
      });

      const followersCount = result.map((follow) => follow.follower).length;
      redisClient.set(`FOLLOWERS_COUNT:${targetUserId}`, followersCount);

      return followersCount;
    } catch (err) {
      return err;
    }
  }

  public static async getFollowingsCount(targetUserId: string) {
    try {
      const result = await prismaClient.follows.findMany({
        where: { followerId: targetUserId },
        include: { following: true },
      });

      const followingsCount = result.map((follow) => follow.following).length;
      redisClient.set(`FOLLOWINGS_COUNT:${targetUserId}`, followingsCount);

      return followingsCount;
    } catch (err) {
      return err;
    }
  }

  public static async isFollowing(sessionUserId: string, targetUserId: string) {
    if (sessionUserId === targetUserId) return null;
    try {
      const amIFollowing = await prismaClient.follows.findUnique({
        where: {
          followerId_followingId: {
            followerId: sessionUserId,
            followingId: targetUserId,
          },
        },
      });

      if (!amIFollowing) return false;
      return true;
    } catch (err) {
      return err;
    }
  }

  public static async getMutualFollowers(
    sessionUserId: string,
    targetUsername: string
  ) {
    try {
      const targetUser = await UserService.getUserByUsername(targetUsername);
      if (!targetUser || !targetUser.id)
        throw new Error("Target User not found");

      const cachedMutualFollowers = await redisClient.get(
        `MUTUAL_FOLLOWERS:${sessionUserId}:${targetUser.id}`
      );
      if (cachedMutualFollowers) return JSON.parse(cachedMutualFollowers);

      const result = await prismaClient.follows.findMany({
        where: { followingId: targetUser.id },
        include: {
          follower: {
            include: { followings: { include: { follower: true } } },
          },
        },
      });
      const targetUserFollowers = result.map((follow) => follow.follower);

      const mutualFollowers = UserService.getMutualConnections(
        sessionUserId,
        targetUserFollowers
      );
      await redisClient.set(
        `MUTUAL_FOLLOWERS:${sessionUserId}:${targetUser.id}`,
        JSON.stringify(mutualFollowers)
      );

      return mutualFollowers;
    } catch (err) {
      return err;
    }
  }

  public static async getRecommendedUsers(userId: string) {
    try {
      const cachedRecommendedUsers = await redisClient.get(
        `RECOMMENDED_USERS:${userId}`
      );
      if (cachedRecommendedUsers) return JSON.parse(cachedRecommendedUsers);

      const myFollowings = await prismaClient.follows.findMany({
        where: { followerId: userId },
        include: {
          following: {
            include: { followers: { include: { following: true } } },
          },
        },
      });

      const recommendedUsers: User[] = [];
      const recommendedUsersSet = new Set<string>();

      for (const myFollowing of myFollowings) {
        const followingsOfMyFollowing = myFollowing.following.followers;
        for (const followingOfMyFollowing of followingsOfMyFollowing) {
          // neglect if session user already follows this user.
          if (
            myFollowings.find(
              (myFollowing) =>
                myFollowing.followingId === followingOfMyFollowing.followingId
            )
          )
            continue;

          // neglect if session user is being recommended.
          if (followingOfMyFollowing.followingId === userId) continue;

          // neglect if same user is recommended twice.
          if (
            recommendedUsersSet.has(followingOfMyFollowing.following.username)
          )
            continue;

          recommendedUsersSet.add(followingOfMyFollowing.following.username);
          recommendedUsers.push(followingOfMyFollowing.following);
        }
      }

      await redisClient.set(
        `RECOMMENDED_USERS:${userId}`,
        JSON.stringify(recommendedUsers)
      );

      return recommendedUsers;
    } catch (err) {
      return err;
    }
  }

  public static async setLastSeenAt(sessionUserId: string, lastSeenAt: number) {
    try {
      await prismaClient.user.update({
        where: { id: sessionUserId },
        data: { lastSeenAt: new Date(lastSeenAt) },
      });
    } catch (err) {
      return err;
    }
  }

  public static async getLastSeenAt(sessionUserId: string) {
    try {
      const result = await prismaClient.user.findUnique({
        where: { id: sessionUserId },
        select: { lastSeenAt: true },
      });
      return result?.lastSeenAt;
    } catch (err) {
      return err;
    }
  }
}

export default UserService;
