CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'admin' or 'user'
    avatar_url TEXT,
    signature TEXT,
    background_url TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    is_banned INTEGER DEFAULT 0, -- 0: active, 1: banned
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_json TEXT, -- JSON array of media objects {type, url}
    type TEXT DEFAULT 'post', -- 'post' or 'repost'
    repost_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'like', 'follow', 'repost', 'comment'
    from_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_id TEXT, -- ID of post or comment
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL, -- 'post', 'comment', 'user'
    target_id TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'direct', -- 'direct' or 'group'
    title TEXT,
    description TEXT,
    avatar_url TEXT,
    direct_key TEXT UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
    last_read_at DATETIME,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    meta_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_kind_updated
    ON conversations(kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
    ON conversation_members(user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_drive_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    quota_bytes INTEGER DEFAULT 0,
    used_bytes INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drive_files (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT,
    url TEXT,
    parent_id TEXT,
    is_folder INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drive_files_user ON drive_files(user_id, parent_id);
