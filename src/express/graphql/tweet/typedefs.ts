export const typeDefs = `#graphql
    type Tweet {
        id: ID!
        content: String
        imageURL: String
        createdAt: String!
        updatedAt: String!

        author: User
        tweetEngagement: TweetEngagement
    }

    type PaginatedTweets {
        tweets: [Tweet]!
        nextCursor: String
    }

    input TweetInput {
        content: String
        imageURL: String
    }

    input imageUploadInput {
        imageName: String!
        imageType: String!
    }
`;
