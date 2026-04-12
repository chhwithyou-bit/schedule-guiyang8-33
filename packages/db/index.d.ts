export * from './src/index.js';

type AnyRecord = Record<string, unknown>;

declare class CommunityD1UsersRepository {
  constructor(db: unknown);
  findById(id: string): Promise<AnyRecord | null>;
}

declare class CommunityD1ConversationsRepository {
  constructor(db: unknown);
  listForUser(userId: string, options?: { limit?: number }): Promise<AnyRecord[]>;
  findById(id: string): Promise<AnyRecord | null>;
  findDirectByKey(directKey: string): Promise<AnyRecord | null>;
  createDirectConversation(input: {
    id: string;
    title: string | null;
    description: string | null;
    avatarUrl: string | null;
    directKey: string;
    createdBy: string;
  }): Promise<AnyRecord | null>;
}

declare class CommunityD1ConversationMembersRepository {
  constructor(db: unknown);
  createDirectPair(conversationId: string, userAId: string, userBId: string): Promise<void>;
  findMembership(conversationId: string, userId: string): Promise<AnyRecord | null>;
  listOtherUserIds(conversationId: string, userId: string): Promise<string[]>;
  markRead(conversationId: string, userId: string): Promise<void>;
}

declare class CommunityD1MessagesRepository {
  constructor(db: unknown);
  listByConversation(conversationId: string, options?: { limit?: number }): Promise<AnyRecord[]>;
  create(input: {
    id: string;
    conversationId: string;
    senderId: string | null;
    content: string;
    metaJson: string | null;
  }): Promise<void>;
}

export declare function createCommunityD1Repositories(db: unknown): {
  users: CommunityD1UsersRepository;
  conversations: CommunityD1ConversationsRepository;
  conversationMembers: CommunityD1ConversationMembersRepository;
  messages: CommunityD1MessagesRepository;
};
