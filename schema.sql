CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'owner', 'admin', or 'user'
    avatar_url TEXT,
    signature TEXT,
    background_url TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    is_banned INTEGER NOT NULL DEFAULT 0, -- 0: active, 1: banned
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_json TEXT, -- JSON array of media objects {type, url}
    type TEXT NOT NULL DEFAULT 'post', -- 'post' or 'repost'
    repost_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'like', 'repost', 'comment', 'reply', 'comment_like'
    from_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_id TEXT, -- ID of post or comment
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL, -- 'post', 'comment', 'user'
    target_id TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at
    ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_sessions_user
    ON community_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_community_sessions_expires
    ON community_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment
    ON comment_likes(comment_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_created
    ON favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_post_created
    ON comments(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_drive_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    quota_bytes INTEGER NOT NULL DEFAULT 0,
    used_bytes INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drive_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT,
    url TEXT,
    parent_id TEXT,
    is_folder INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drive_files_user_parent ON drive_files(user_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id);
