export const queries = `#graphql
    getChats: [Chat]

    getChatMessages(chatId: String!): [GroupedMessages]!
`;