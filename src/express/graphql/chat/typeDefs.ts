export const typeDefs = `#graphql
    union ChatContentUnion = Message | ChatActivity
    
    type Chat {
        id: ID!
        name: String
        isGroupChat: Boolean
        creator: User
        createdAt: String
        
        totalMembersCount: Int
        members: [User]
        messages: [Message]
        latestChatContent: ChatContentUnion
        latestMessage: Message
        unseenMessagesCount: Int
    }

    enum ChatMemberRole {
        ADMIN,
        MEMBER
    }

    type ChatMembership {
        chat: Chat
        user: User
        role: ChatMemberRole
    }

    enum ChatActivityType {
        MEMBER_ADDED
        MEMBER_REMOVED
        ADMIN_ADDED
        ADMIN_REMOVED
        MEMBER_LEFT
        CHAT_RENAMED
    }

    type ChatActivityMetaData {
        chatName: String
    }

    type ChatActivity {
        id: ID!
        type: ChatActivityType
        chat: Chat
        user: User
        targetUser: User
        createdAt: String

        metaData: ChatActivityMetaData
    }

    type Message {
        id: ID!
        content: String
        sender: User
        createdAt: String
        seenBy: [User]
        chat: Chat
    }

    type Messages {
        unseenMessages: [Message]
        seenMessages: [Message]
        sessionUserMessages: [Message]
    }

    type ChatHistory {
        date: String!
        messages: Messages
        activities: [ChatActivity]
    }

    

    input CreateMessagePayload {
        targetUserIds: [String]
        content: String!
        chatId: String
    }
`;
