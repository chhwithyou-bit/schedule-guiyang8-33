import { createCommunityD1Repositories } from '@schedule-guiyang/db';
import {
  getCommunityAuthUser,
  getCommunityLevelFromXp,
  insertCommunityNotification,
  normalizeCommunityRole,
  type CommunityAuthEnv
} from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function buildDirectConversationKey(userA: string, userB: string) {
  return [userA.trim(), userB.trim()].sort().join(':');
}

async function serializeConversation(
  repositories: ReturnType<typeof createCommunityD1Repositories>,
  conversation: Record<string, unknown>,
  userId: string,
  options: { includeDirectPartnerLookup?: boolean } = {}
) {
  const kind = String(conversation.kind || 'direct');
  let title = normalizeNullableText(conversation.title);
  let description = normalizeNullableText(conversation.description);
  let avatarUrl = normalizeNullableText(conversation.avatar_url);
  let partner: Record<string, unknown> | null = null;

  if (kind === 'direct') {
    let directPartner: Record<string, unknown> | null = null;

    if (options.includeDirectPartnerLookup !== false) {
      const partnerIds = await repositories.conversationMembers.listOtherUserIds(String(conversation.id || ''), userId);
      directPartner = partnerIds[0] ? await repositories.users.findById(partnerIds[0]) : null;
    } else if (normalizeNullableText(conversation.partner_id)) {
      directPartner = {
        id: conversation.partner_id,
        username: conversation.partner_username,
        avatar_url: conversation.partner_avatar_url,
        signature: conversation.partner_signature,
        role: conversation.partner_role,
        xp: conversation.partner_xp
      };
    }

    if (directPartner) {
      const xp = Math.max(0, Number(directPartner.xp || 0));
      title = normalizeNullableText(directPartner.username) || title || '私聊';
      description = normalizeNullableText(directPartner.signature) || description;
      avatarUrl = normalizeNullableText(directPartner.avatar_url) || avatarUrl;
      partner = {
        id: String(directPartner.id || ''),
        username: String(directPartner.username || '私聊'),
        avatar_url: normalizeNullableText(directPartner.avatar_url),
        signature: normalizeNullableText(directPartner.signature),
        xp,
        level: getCommunityLevelFromXp(xp),
        role: normalizeCommunityRole(directPartner.role)
      };
    }
  }

  return {
    id: String(conversation.id || ''),
    kind: kind === 'group' ? 'group' : 'direct',
    title: title || '未命名会话',
    description,
    avatar_url: avatarUrl,
    updated_at: String(conversation.updated_at || ''),
    member_role: String(conversation.member_role || 'member'),
    member_count: Number(conversation.member_count || 0),
    message_count: Number(conversation.message_count || 0),
    unread_count: Number(conversation.unread_count || 0),
    last_message: normalizeNullableText(conversation.last_message),
    last_message_at: normalizeNullableText(conversation.last_message_at),
    last_sender_name: normalizeNullableText(conversation.last_sender_name),
    ...(partner ? { partner } : {})
  };
}

export async function listCommunityChats(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  const repositories = createCommunityD1Repositories(env.COMMUNITY_DB);
  const rows = await repositories.conversations.listForUser(user.id, { limit: 50 });

  const conversations = await Promise.all(
    rows.map((row: Record<string, unknown>) =>
      serializeConversation(repositories, row, user.id, { includeDirectPartnerLookup: false })
    )
  );

  return {
    status: 200,
    body: {
      ok: true,
      conversations,
      unread_total: conversations.reduce((sum: number, item: { unread_count?: number }) => sum + Number(item.unread_count || 0), 0)
    }
  };
}

export async function openDirectCommunityChat(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  const targetUserId = String(body.target_user_id || '').trim();
  if (!targetUserId || targetUserId === user.id) {
    return { status: 400, body: { ok: false, msg: '目标用户无效' } };
  }

  const repositories = createCommunityD1Repositories(env.COMMUNITY_DB);
  const targetUser = await repositories.users.findById(targetUserId);

  if (!targetUser || Number(targetUser.is_banned || 0) !== 0) {
    return { status: 404, body: { ok: false, msg: '用户不存在' } };
  }

  const directKey = buildDirectConversationKey(user.id, targetUserId);
  let conversation = await repositories.conversations.findDirectByKey(directKey);

  if (!conversation) {
    const conversationId = crypto.randomUUID();
    conversation = await repositories.conversations.createDirectConversation({
      id: conversationId,
      title: String(targetUser.username || '私聊'),
      description: normalizeNullableText(targetUser.signature),
      avatarUrl: normalizeNullableText(targetUser.avatar_url),
      directKey,
      createdBy: user.id
    });

    await repositories.conversationMembers.createDirectPair(conversationId, user.id, targetUserId);
  }

  if (!conversation) {
    return { status: 500, body: { ok: false, msg: '会话创建失败' } };
  }

  const membership = await repositories.conversationMembers.findMembership(String(conversation.id || ''), user.id);
  const detail = await serializeConversation(
    repositories,
    {
      ...conversation,
      member_role: membership?.member_role || 'member',
      member_count: 2,
      unread_count: 0
    },
    user.id
  );

  return {
    status: 200,
    body: {
      ok: true,
      conversation: detail
    }
  };
}

export async function listCommunityChatMessages(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  const url = new URL(request.url);
  const conversationId = String(url.searchParams.get('conversation_id') || '').trim();
  if (!conversationId) {
    return { status: 400, body: { ok: false, msg: '缺少会话 ID' } };
  }

  const repositories = createCommunityD1Repositories(env.COMMUNITY_DB);
  const membership = await repositories.conversationMembers.findMembership(conversationId, user.id);
  if (!membership) {
    return { status: 404, body: { ok: false, msg: '会话不存在' } };
  }

  const rows = await repositories.messages.listByConversation(conversationId, { limit: 80 });
  await repositories.conversationMembers.markRead(conversationId, user.id);

  const messages = rows.reverse().map((row: Record<string, unknown>) => {
    const senderId = normalizeNullableText(row.sender_id);
    const xp = Math.max(0, Number(row.xp || 0));
    return {
      id: String(row.id || ''),
      conversation_id: String(row.conversation_id || ''),
      sender_id: senderId,
      content: String(row.content || ''),
      meta_json: normalizeNullableText(row.meta_json),
      created_at: String(row.created_at || ''),
      sender: senderId
        ? {
            id: senderId,
            username: String(row.username || '[账号不可用]'),
            avatar_url: normalizeNullableText(row.avatar_url),
            xp,
            level: getCommunityLevelFromXp(xp),
            role: normalizeCommunityRole(row.role)
          }
        : null
    };
  });

  return { status: 200, body: { ok: true, messages } };
}

export async function createCommunityChatMessage(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  const conversationId = String(body.conversation_id || '').trim();
  const trimmedContent = String(body.content || '').trim();
  if (!conversationId || !trimmedContent) {
    return { status: 400, body: { ok: false, msg: '消息内容不能为空' } };
  }

  const repositories = createCommunityD1Repositories(env.COMMUNITY_DB);
  const membership = await repositories.conversationMembers.findMembership(conversationId, user.id);
  if (!membership) {
    return { status: 404, body: { ok: false, msg: '会话不存在' } };
  }

  const messageId = crypto.randomUUID();
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  await repositories.messages.create({
    id: messageId,
    conversationId,
    senderId: user.id,
    content: trimmedContent,
    metaJson: JSON.stringify(meta)
  });

  await env.COMMUNITY_DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();
  await repositories.conversationMembers.markRead(conversationId, user.id);

  const conversation = await repositories.conversations.findById(conversationId);
  if (String(conversation?.kind || 'direct') === 'direct') {
    const targetIds = await repositories.conversationMembers.listOtherUserIds(conversationId, user.id);
    await Promise.all(
      targetIds.map((targetUserId: string) =>
        insertCommunityNotification(env, targetUserId, 'message', user.id, conversationId)
      )
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      message: {
        id: messageId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmedContent,
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          username: user.username,
          avatar_url: normalizeNullableText(user.avatar_url),
          xp: user.xp,
          level: user.level,
          role: user.role
        }
      }
    }
  };
}
