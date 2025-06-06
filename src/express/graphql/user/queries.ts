export const queries = `#graphql
    getCustomUserToken(googleToken: String, user: SignInFormInput): String
    getSessionUser: User
    getUser(username: String!): User
    getMutualFollowers(username: String!): [User]
    getRecommendedUsers: [User]
    getAllUsers: [User]
    getUsers(searchText: String!): [User]
    isUsernameExist(username: String!): Boolean 
    isEmailExist(email: String!): Boolean 
    isFollowing(userId: String!): Boolean
    getUserLastSeen(userId: String!): String
`;
