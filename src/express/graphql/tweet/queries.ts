export const queries = `#graphql
    getTweet(tweetId: String!): Tweet
    getPaginatedTweets(userId: String!, limit: Int!, cursor: String): PaginatedTweets!
    getAllTweets: [Tweet]
    getSignedURLForUploadingImage(payload: imageUploadInput!): String!
    getPaginatedTweetsFeed(limit: Int!, cursor: String): PaginatedTweets!
`;
