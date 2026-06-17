use base64::{engine::general_purpose, Engine as _};
use chrono::{Duration, Utc};
use hex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use worker::*;

const GDRIVE_TOKEN_CACHE_KEY: &str = "gdrive_access_token_cache_v1";
const GDRIVE_MEDIA_ARCHIVE_PREFIX: &str = "community_media_drive:";
const GDRIVE_TOKEN_REFRESH_SKEW_MS: i64 = 60_000;
const GDRIVE_TOKEN_DEFAULT_TTL_SECONDS: u64 = 3_300;
const COMMUNITY_SCHEMA_KV_KEY: &str = "community_schema_version";
const COMMUNITY_SCHEMA_VERSION: &str = "community_schema_v2_sessions";
const COMMUNITY_SESSION_TTL_SECONDS: i64 = 60 * 60 * 24 * 7;

mod utils {
    use super::*;

    pub const COMMUNITY_LEVEL_THRESHOLDS: [i32; 20] = [
        0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555,
        1810, 2090,
    ];

    pub fn get_community_level_from_xp(xp: i32) -> i32 {
        let xp = xp.max(0);
        for (i, &threshold) in COMMUNITY_LEVEL_THRESHOLDS.iter().enumerate().rev() {
            if xp >= threshold {
                return (i + 1) as i32;
            }
        }
        1
    }

    pub fn sha256_hex(text: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn cors_headers() -> Headers {
        let headers = Headers::new();
        let _ = headers.set("Access-Control-Allow-Origin", "*");
        let _ = headers.set(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS",
        );
        let _ = headers.set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        );
        headers
    }

    pub fn json_resp<T: Serialize>(data: T, status: u16) -> Result<Response> {
        let headers = cors_headers();
        let _ = headers.set("Content-Type", "application/json;charset=UTF-8");
        let _ = headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        let _ = headers.set("Pragma", "no-cache");
        let _ = headers.set("Expires", "0");

        Ok(Response::from_json(&data)?
            .with_status(status)
            .with_headers(headers))
    }

    pub fn empty_resp(status: u16) -> Result<Response> {
        Ok(Response::empty()?
            .with_status(status)
            .with_headers(cors_headers()))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct User {
    id: String,
    username: String,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    password_hash: String,
    role: String,
    avatar_url: Option<String>,
    signature: Option<String>,
    background_url: Option<String>,
    xp: i32,
    #[serde(default)]
    level: i32,
    is_banned: i32,
    created_at: String,
    #[serde(skip_deserializing)]
    followers_count: Option<i32>,
    #[serde(skip_deserializing)]
    following_count: Option<i32>,
    #[serde(skip_deserializing)]
    viewer_is_following: Option<bool>,
    #[serde(skip_deserializing)]
    drive_quota: Option<i64>,
    #[serde(skip_deserializing)]
    drive_used: Option<i64>,
}

impl Default for User {
    fn default() -> Self {
        Self {
            id: String::new(),
            username: String::new(),
            password_hash: String::new(),
            role: "user".to_string(),
            avatar_url: None,
            signature: None,
            background_url: None,
            xp: 0,
            level: 1,
            is_banned: 0,
            created_at: String::new(),
            followers_count: None,
            following_count: None,
            viewer_is_following: None,
            drive_quota: None,
            drive_used: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Report {
    id: String,
    user_id: String,
    target_type: String,
    target_id: String,
    reason: Option<String>,
    status: String,
    created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct DriveFile {
    id: String,
    user_id: String,
    name: String,
    size: i64,
    mime_type: String,
    url: Option<String>,
    parent_id: Option<String>,
    is_folder: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct DriveStats {
    quota_bytes: i64,
    used_bytes: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CachedGoogleAuthToken {
    access_token: String,
    expires_at_ms: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Post {
    id: String,
    user_id: String,
    content: Option<String>,
    media_json: Option<String>,
    #[serde(rename = "type")]
    post_type: String,
    repost_id: Option<String>,
    created_at: String,
    // Joined fields
    username: Option<String>,
    avatar_url: Option<String>,
    role: Option<String>,
    signature: Option<String>,
    background_url: Option<String>,
    xp: Option<i32>,
    level: Option<i32>,
    #[serde(rename = "like_count")]
    likes_count: Option<i32>,
    #[serde(rename = "comment_count")]
    comments_count: Option<i32>,
    #[serde(rename = "favorite_count")]
    favorites_count: Option<i32>,
    #[serde(rename = "viewer_liked")]
    viewer_has_liked: Option<i32>,
    #[serde(rename = "viewer_favorited")]
    viewer_has_favorited: Option<i32>,
    can_delete: Option<i32>,
    repost_data: Option<Box<Post>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Comment {
    id: String,
    post_id: String,
    user_id: String,
    parent_id: Option<String>,
    content: String,
    created_at: String,
    username: Option<String>,
    avatar_url: Option<String>,
    role: Option<String>,
    signature: Option<String>,
    background_url: Option<String>,
    xp: Option<i32>,
    level: Option<i32>,
    #[serde(rename = "like_count")]
    likes_count: Option<i32>,
    #[serde(rename = "viewer_liked")]
    viewer_has_liked: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Notification {
    id: String,
    user_id: String,
    #[serde(rename = "type")]
    notify_type: String,
    from_user_id: String,
    target_id: String,
    #[serde(default)]
    is_read: Option<i32>,
    created_at: String,
    username: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct PostLikeResult {
    liked: bool,
    like_count: i64,
}

struct MusicByteRange {
    start: u64,
    end: u64,
    length: u64,
    r2_range: Range,
}

enum MusicRangeRequest {
    Full,
    Partial(MusicByteRange),
    Unsatisfiable,
}

#[derive(Deserialize)]
struct AdminAction {
    action: String,
    target_type: Option<String>,
    target_id: Option<String>,
    report_id: Option<String>,
    new_password: Option<String>,
    content: Option<String>,
    #[allow(dead_code)]
    quota_gb: Option<f64>,
    source_id: Option<String>,
    source_type: Option<String>,
    source_url: Option<String>,
    source_content: Option<String>,
    source_label: Option<String>,
    enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct NodeSourceRecord {
    id: String,
    source_type: String,
    label: String,
    source_url: Option<String>,
    source_content: Option<String>,
    enabled: bool,
    node_count: usize,
    last_error: Option<String>,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ProxyNodeRecord {
    id: String,
    name: String,
    raw: String,
    protocol: String,
    source_id: Option<String>,
    source_label: Option<String>,
}

async fn find_user_by_credentials(
    db: &D1Database,
    username: &str,
    pass_hash: &str,
) -> Result<Option<User>> {
    db.prepare(
        "
        SELECT
            COALESCE(id, '') as id,
            COALESCE(username, '') as username,
            COALESCE(password_hash, '') as password_hash,
            COALESCE(role, 'user') as role,
            avatar_url,
            signature,
            background_url,
            COALESCE(xp, 0) as xp,
            COALESCE(level, 1) as level,
            COALESCE(is_banned, 0) as is_banned,
            COALESCE(created_at, '') as created_at
        FROM users
        WHERE username = ? AND password_hash = ?
        ",
    )
    .bind(&[username.into(), pass_hash.into()])?
    .first::<User>(None)
    .await
}

async fn find_user_by_session_token(db: &D1Database, token: &str) -> Result<Option<User>> {
    let token = token.trim();
    if token.is_empty() || token.contains(':') {
        return Ok(None);
    }

    let token_hash = utils::sha256_hex(token);
    let now = Utc::now().to_rfc3339();
    let user = db
        .prepare(
            "
            SELECT
                COALESCE(u.id, '') as id,
                COALESCE(u.username, '') as username,
                COALESCE(u.password_hash, '') as password_hash,
                COALESCE(u.role, 'user') as role,
                u.avatar_url,
                u.signature,
                u.background_url,
                COALESCE(u.xp, 0) as xp,
                COALESCE(u.level, 1) as level,
                COALESCE(u.is_banned, 0) as is_banned,
                COALESCE(u.created_at, '') as created_at
            FROM community_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
              AND s.expires_at > ?
              AND COALESCE(u.is_banned, 0) = 0
            ",
        )
        .bind(&[token_hash.clone().into(), now.clone().into()])?
        .first::<User>(None)
        .await?;

    if user.is_some() {
        db.prepare("UPDATE community_sessions SET last_used_at = ? WHERE token_hash = ?")
            .bind(&[now.into(), token_hash.into()])?
            .run()
            .await?;
    }

    Ok(user.map(with_community_level))
}

async fn issue_community_session(db: &D1Database, user_id: &str) -> Result<String> {
    let token = format!("cs_{}", Uuid::new_v4().to_string().replace('-', ""));
    let token_hash = utils::sha256_hex(&token);
    let now = Utc::now();
    let now_text = now.to_rfc3339();
    let expires_at = (now + Duration::seconds(COMMUNITY_SESSION_TTL_SECONDS)).to_rfc3339();

    db.prepare("DELETE FROM community_sessions WHERE expires_at <= ?")
        .bind(&[now_text.clone().into()])?
        .run()
        .await?;
    db.prepare(
        "INSERT INTO community_sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&[
        token_hash.into(),
        user_id.into(),
        now_text.clone().into(),
        expires_at.into(),
        now_text.into(),
    ])?
    .run()
    .await?;

    Ok(token)
}

async fn community_auth_response(db: &D1Database, user: User) -> Result<Response> {
    if user.is_banned == 1 {
        return utils::json_resp(json!({"ok": false, "msg": "账号已被封禁"}), 403);
    }

    let token = issue_community_session(db, &user.id).await?;
    utils::json_resp(
        json!({"ok": true, "token": token, "user": with_community_level(user)}),
        200,
    )
}

async fn register_community_user(
    db: &D1Database,
    username: &str,
    password: &str,
) -> Result<std::result::Result<User, Response>> {
    if username.len() < 2 || password.len() < 6 {
        return Ok(Err(utils::json_resp(
            json!({"ok": false, "msg": "用户名或密码太短"}),
            400,
        )?));
    }

    let existing = db
        .prepare("SELECT 1 FROM users WHERE username = ?")
        .bind(&[username.into()])?
        .first::<Value>(None)
        .await?;
    if existing.is_some() {
        return Ok(Err(utils::json_resp(
            json!({"ok": false, "msg": "用户名已存在"}),
            400,
        )?));
    }

    let id = Uuid::new_v4().to_string();
    let pass_hash = utils::sha256_hex(password);
    let role = if username == "admin" { "owner" } else { "user" };

    db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(&[
            id.clone().into(),
            username.into(),
            pass_hash.clone().into(),
            role.into(),
        ])?
        .run()
        .await?;

    Ok(Ok(User {
        id,
        username: username.to_string(),
        password_hash: pass_hash,
        role: role.to_string(),
        avatar_url: None,
        signature: None,
        background_url: None,
        xp: 0,
        level: 1,
        is_banned: 0,
        created_at: Utc::now().to_rfc3339(),
        followers_count: None,
        following_count: None,
        viewer_is_following: None,
        drive_quota: None,
        drive_used: None,
    }))
}

fn normalize_community_role(role: &str) -> String {
    match role {
        "owner" => "owner".to_string(),
        "admin" => "admin".to_string(),
        _ => "user".to_string(),
    }
}

fn is_community_admin_role(role: &str) -> bool {
    matches!(role, "admin" | "owner")
}

fn with_community_level(mut user: User) -> User {
    user.level = utils::get_community_level_from_xp(user.xp);
    user.role = normalize_community_role(&user.role);
    normalize_community_user_media(&mut user);
    user
}

fn decode_b64_if_needed(raw_text: &str) -> String {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(bytes) = general_purpose::STANDARD.decode(trimmed) {
        if let Ok(decoded) = String::from_utf8(bytes) {
            if decoded.contains("://") {
                return decoded;
            }
        }
    }

    trimmed.to_string()
}

fn parse_nodes(raw_text: &str) -> Vec<ProxyNodeRecord> {
    decode_b64_if_needed(raw_text)
        .lines()
        .map(str::trim)
        .filter(|line| {
            line.starts_with("ss://")
                || line.starts_with("vmess://")
                || line.starts_with("trojan://")
                || line.starts_with("vless://")
                || line.starts_with("ssr://")
        })
        .map(|raw| {
            let protocol = raw.split("://").next().unwrap_or("unknown").to_string();
            let mut name = format!("{}节点", protocol.to_uppercase());

            if raw.starts_with("vmess://") {
                if let Ok(bytes) =
                    general_purpose::STANDARD.decode(raw.trim_start_matches("vmess://"))
                {
                    if let Ok(decoded) = String::from_utf8(bytes) {
                        if let Ok(value) = serde_json::from_str::<Value>(&decoded) {
                            name = value["ps"]
                                .as_str()
                                .or_else(|| value["add"].as_str())
                                .unwrap_or("vmess节点")
                                .trim()
                                .to_string();
                        }
                    }
                }
            } else if let Some(hash) = raw.split('#').nth(1) {
                let decoded_name =
                    decode_url_component_if_needed(hash.split('\r').next().unwrap_or(""));
                if !decoded_name.trim().is_empty() {
                    name = decoded_name.trim().to_string();
                }
            }

            ProxyNodeRecord {
                id: Uuid::new_v4().to_string(),
                name,
                raw: raw.to_string(),
                protocol,
                source_id: None,
                source_label: None,
            }
        })
        .collect()
}

async fn read_node_sources(kv: &KvStore) -> Result<Vec<NodeSourceRecord>> {
    Ok(serde_json::from_str(
        &kv.get("proxy_node_sources")
            .text()
            .await?
            .unwrap_or_else(|| "[]".to_string()),
    )
    .unwrap_or_default())
}

async fn write_node_sources(kv: &KvStore, sources: &[NodeSourceRecord]) -> Result<()> {
    kv.put("proxy_node_sources", serde_json::to_string(sources)?)?
        .execute()
        .await?;
    Ok(())
}

async fn read_proxy_nodes(kv: &KvStore) -> Result<Vec<ProxyNodeRecord>> {
    let raw = kv
        .get("proxy_nodes")
        .text()
        .await?
        .unwrap_or_else(|| "[]".to_string());
    if let Ok(nodes) = serde_json::from_str(&raw) {
        return Ok(nodes);
    }

    let legacy_raw = kv
        .get("nodes_list")
        .text()
        .await?
        .unwrap_or_else(|| "[]".to_string());
    Ok(serde_json::from_str(&legacy_raw).unwrap_or_default())
}

async fn write_proxy_nodes(kv: &KvStore, nodes: &[ProxyNodeRecord]) -> Result<()> {
    let payload = serde_json::to_string(nodes)?;
    kv.put("proxy_nodes", payload.clone())?.execute().await?;
    kv.put("nodes_list", payload)?.execute().await?;
    Ok(())
}

async fn read_node_password_hash(kv: &KvStore) -> Result<String> {
    if let Some(hash) = kv.get("proxy_nodes_password_hash").text().await? {
        if !hash.trim().is_empty() {
            return Ok(hash);
        }
    }

    if let Some(legacy_pwd) = kv.get("nodes_user_pwd").text().await? {
        if !legacy_pwd.trim().is_empty() {
            let hash = utils::sha256_hex(legacy_pwd.trim());
            kv.put("proxy_nodes_password_hash", hash.clone())?
                .execute()
                .await?;
            return Ok(hash);
        }
    }

    Ok(String::new())
}

async fn verify_node_password(kv: &KvStore, password: &str) -> Result<bool> {
    let expected = read_node_password_hash(kv).await?;
    if expected.is_empty() {
        return Ok(false);
    }
    Ok(utils::sha256_hex(password.trim()) == expected)
}

async fn verify_node_admin(kv: &KvStore, username: &str, password: &str) -> Result<bool> {
    let stored_user = kv
        .get("nodes_admin_user")
        .text()
        .await?
        .unwrap_or_else(|| "admin".to_string());
    let stored_pass = kv
        .get("nodes_admin_pass")
        .text()
        .await?
        .unwrap_or_else(|| "admin888".to_string());
    Ok(username == stored_user && password == stored_pass)
}

fn build_client_launch_links(subscription_url: &str) -> Value {
    json!({
        "shadowrocket": format!("shadowrocket://add/sub://{}", url::form_urlencoded::byte_serialize(subscription_url.as_bytes()).collect::<String>()),
        "clash": subscription_url,
        "surge": subscription_url,
        "loon": subscription_url,
        "stash": subscription_url,
        "quantumult_x": subscription_url,
        "sing_box": subscription_url,
        "v2rayn": subscription_url,
        "v2rayng": subscription_url
    })
}

async fn fetch_remote_text(source_url: &str) -> Result<String> {
    let req = Request::new(source_url, Method::Get)?;
    let mut resp = Fetch::Request(req).send().await?;
    resp.text().await
}

async fn get_auth(req: &Request, db: &D1Database) -> Result<Option<User>> {
    let auth_header = req.headers().get("Authorization")?;
    if let Some(auth) = auth_header {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            return find_user_by_session_token(db, token).await;
        }
    }
    Ok(None)
}

fn normalize_media_url(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("/api/community/media/")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("data:image/")
        || trimmed.starts_with("/")
    {
        return Some(trimmed);
    }
    if trimmed.starts_with("api/community/media/") {
        return Some(format!("/{}", trimmed));
    }
    Some(format!("/api/community/media/{}", trimmed))
}

fn normalize_media_json(value: Option<String>) -> Option<String> {
    let raw = value?;
    let Ok(mut parsed) = serde_json::from_str::<Value>(&raw) else {
        return Some(raw);
    };

    let Some(items) = parsed.as_array_mut() else {
        return Some(raw);
    };

    for item in items {
        let Some(url) = item
            .get("url")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()) else {
            continue;
        };

        if let Some(normalized_url) = normalize_media_url(Some(url)) {
            item["url"] = Value::String(normalized_url);
        }
    }

    Some(parsed.to_string())
}

fn normalize_community_user_media(user: &mut User) {
    user.avatar_url = normalize_media_url(user.avatar_url.take());
    user.background_url = normalize_media_url(user.background_url.take());
}

fn normalize_community_post_media(post: &mut Post) {
    post.avatar_url = normalize_media_url(post.avatar_url.take());
    post.background_url = normalize_media_url(post.background_url.take());
    post.media_json = normalize_media_json(post.media_json.take());

    if let Some(repost) = post.repost_data.as_mut() {
        normalize_community_post_media(repost);
    }
}

fn normalize_community_comment_media(comment: &mut Comment) {
    comment.avatar_url = normalize_media_url(comment.avatar_url.take());
    comment.background_url = normalize_media_url(comment.background_url.take());
}

fn normalize_community_notification_media(notification: &mut Notification) {
    notification.avatar_url = normalize_media_url(notification.avatar_url.take());
}

fn extract_media_file_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(rest) = trimmed.strip_prefix("/api/community/media/") {
        return Some(rest.to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Ok(parsed) = url::Url::parse(trimmed) {
            if let Some(rest) = parsed.path().strip_prefix("/api/community/media/") {
                return Some(rest.to_string());
            }
        }
        return None;
    }
    Some(trimmed.to_string())
}

fn infer_extension_from_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => "bin",
    }
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn elapsed_ms(start_ms: i64) -> i64 {
    (now_ms() - start_ms).max(0)
}

fn is_supported_music_key(key: &str) -> bool {
    let lowered = key.trim().to_ascii_lowercase();
    [
        ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".webm",
    ]
    .iter()
    .any(|ext| lowered.ends_with(ext))
}

fn music_display_name_from_key(key: &str) -> String {
    let filename = key.trim().rsplit('/').next().unwrap_or(key).trim();

    if filename.is_empty() {
        return "Unknown".to_string();
    }

    match filename.rsplit_once('.') {
        Some((stem, _)) if !stem.trim().is_empty() => stem.trim().to_string(),
        _ => filename.to_string(),
    }
}

fn infer_music_mime_from_key(key: &str) -> &'static str {
    let lowered = key.to_ascii_lowercase();
    if lowered.ends_with(".mp3") {
        "audio/mpeg"
    } else if lowered.ends_with(".wav") {
        "audio/wav"
    } else if lowered.ends_with(".m4a") {
        "audio/mp4"
    } else if lowered.ends_with(".aac") {
        "audio/aac"
    } else if lowered.ends_with(".ogg") || lowered.ends_with(".oga") {
        "audio/ogg"
    } else if lowered.ends_with(".flac") {
        "audio/flac"
    } else if lowered.ends_with(".webm") {
        "audio/webm"
    } else {
        "audio/mpeg"
    }
}

fn effective_music_content_type(key: &str, stored_content_type: Option<String>) -> String {
    let trimmed = stored_content_type.unwrap_or_default().trim().to_string();
    let lowered = trimmed.to_ascii_lowercase();

    if trimmed.is_empty()
        || lowered == "application/octet-stream"
        || lowered == "binary/octet-stream"
        || lowered == "application/unknown"
    {
        return infer_music_mime_from_key(key).to_string();
    }

    trimmed
}

fn parse_music_range_header(range_header: Option<String>, size: u64) -> MusicRangeRequest {
    let Some(header) = range_header else {
        return MusicRangeRequest::Full;
    };

    let header = header.trim();
    if header.is_empty() {
        return MusicRangeRequest::Full;
    }

    let Some(spec) = header
        .strip_prefix("bytes=")
        .or_else(|| header.strip_prefix("Bytes="))
    else {
        return MusicRangeRequest::Unsatisfiable;
    };

    if size == 0 || spec.contains(',') {
        return MusicRangeRequest::Unsatisfiable;
    }

    let Some((start_text, end_text)) = spec.split_once('-') else {
        return MusicRangeRequest::Unsatisfiable;
    };

    let last = size - 1;
    let range_bounds = if start_text.trim().is_empty() {
        let Ok(suffix_length) = end_text.trim().parse::<u64>() else {
            return MusicRangeRequest::Unsatisfiable;
        };
        if suffix_length == 0 {
            return MusicRangeRequest::Unsatisfiable;
        }
        let start = size.saturating_sub(suffix_length);
        (start, last)
    } else {
        let Ok(start) = start_text.trim().parse::<u64>() else {
            return MusicRangeRequest::Unsatisfiable;
        };
        if start > last {
            return MusicRangeRequest::Unsatisfiable;
        }
        let end = if end_text.trim().is_empty() {
            last
        } else {
            let Ok(parsed_end) = end_text.trim().parse::<u64>() else {
                return MusicRangeRequest::Unsatisfiable;
            };
            parsed_end.min(last)
        };
        if end < start {
            return MusicRangeRequest::Unsatisfiable;
        }
        (start, end)
    };

    let (start, end) = range_bounds;
    let length = end - start + 1;
    MusicRangeRequest::Partial(MusicByteRange {
        start,
        end,
        length,
        r2_range: Range::OffsetWithLength {
            offset: start,
            length,
        },
    })
}

fn build_music_file_headers(
    content_type: &str,
    size: u64,
    range: Option<&MusicByteRange>,
) -> Result<Headers> {
    let headers = utils::cors_headers();
    headers.set("Content-Type", content_type)?;
    headers.set("Accept-Ranges", "bytes")?;
    headers.set("Cache-Control", "public, max-age=3600")?;

    if let Some(range) = range {
        headers.set("Content-Length", &range.length.to_string())?;
        headers.set(
            "Content-Range",
            &format!("bytes {}-{}/{}", range.start, range.end, size),
        )?;
    } else {
        headers.set("Content-Length", &size.to_string())?;
    }

    Ok(headers)
}

fn music_range_not_satisfiable_response(size: u64) -> Result<Response> {
    let headers = utils::cors_headers();
    headers.set("Accept-Ranges", "bytes")?;
    headers.set("Content-Range", &format!("bytes */{}", size))?;
    Ok(Response::empty()?.with_status(416).with_headers(headers))
}

fn encode_music_key_for_url(key: &str) -> String {
    url::form_urlencoded::byte_serialize(key.as_bytes()).collect::<String>()
}

fn decode_url_component_if_needed(value: &str) -> String {
    if !value.contains('%') {
        return value.to_string();
    }

    let decode_probe = format!("https://community.local/?key={}", value);
    if let Ok(parsed) = url::Url::parse(&decode_probe) {
        if let Some((_, decoded)) = parsed.query_pairs().find(|(k, _)| k == "key") {
            return decoded.into_owned();
        }
    }

    value.to_string()
}

fn build_music_track_payload(key: &str) -> Value {
    let name = music_display_name_from_key(key);
    let encoded_key = encode_music_key_for_url(key);
    json!({
        "id": key,
        "name": name,
        "title": name,
        "artist": "Unknown",
        "url": format!("/api/music/file/{}", encoded_key)
    })
}

async fn fetch_drive_media_bytes(
    env: &Env,
    file_id: &str,
) -> Result<Option<(Vec<u8>, String)>> {
    if file_id.trim().is_empty() {
        return Ok(None);
    }

    let token = match get_google_auth_token(env).await {
        Ok(t) if !t.is_empty() => t,
        _ => return Ok(None),
    };

    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media&supportsAllDrives=true",
        file_id
    );
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {}", token))?;

    let mut init = RequestInit::new();
    init.with_method(Method::Get);
    init.with_headers(headers);

    let req = Request::new_with_init(&url, &init)?;
    let mut resp = Fetch::Request(req).send().await?;

    if resp.status_code() != 200 {
        return Ok(None);
    }

    let content_type = resp
        .headers()
        .get("Content-Type")?
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let bytes = resp.bytes().await?;
    Ok(Some((bytes, content_type)))
}

fn build_public_media_headers(content_type: &str, cache_status: &str) -> Result<Headers> {
    let headers = Headers::new();
    let effective_content_type = if content_type.trim().is_empty() {
        "application/octet-stream"
    } else {
        content_type
    };

    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("Content-Type", effective_content_type)?;
    headers.set("Cache-Control", "public, max-age=31536000, immutable")?;
    headers.set("X-Cache", cache_status)?;

    Ok(headers)
}

fn build_public_media_response_from_bytes(
    bytes: Vec<u8>,
    content_type: &str,
    cache_status: &str,
) -> Result<Response> {
    let headers = build_public_media_headers(content_type, cache_status)?;
    Ok(Response::from_bytes(bytes)?.with_headers(headers))
}

async fn handle_community_media_library_upload(
    mut req: Request,
    ctx: RouteContext<Context>,
) -> Result<Response> {
    let db = ctx.env.d1("COMMUNITY_DB")?;
    let user = get_auth(&req, &db).await?;
    let user = match user {
        Some(u) => u,
        None => return utils::json_resp(json!({"ok": false}), 401),
    };

    let form = req.form_data().await?;
    let file = match form.get("file") {
        Some(FormEntry::File(f)) => f,
        _ => return utils::json_resp(json!({"ok": false, "msg": "file required"}), 400),
    };

    let parent_id = match form.get("parent_id") {
        Some(FormEntry::Field(s)) => Some(s),
        _ => None,
    };

    let name = file.name();
    let size = file.size() as i64;
    let mime_type = file.type_();
    let buffer = file.bytes().await?;

    db.prepare("INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, 0, 0) ON CONFLICT(user_id) DO NOTHING")
        .bind(&[user.id.clone().into()])?
        .run().await?;

    let stats = db
        .prepare("SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ?")
        .bind(&[user.id.clone().into()])?
        .first::<DriveStats>(None)
        .await?
        .unwrap_or(DriveStats {
            quota_bytes: 0,
            used_bytes: 0,
        });
    if stats.quota_bytes > 0 && stats.used_bytes + size > stats.quota_bytes {
        return utils::json_resp(json!({"ok": false, "msg": "storage quota exceeded"}), 400);
    }

    let media_key = format!(
        "media-{}.{}",
        Uuid::new_v4(),
        infer_extension_from_mime(&mime_type)
    );
    if let Err(err) = put_uploaded_media(&ctx.env, &media_key, &buffer, &mime_type).await {
        return utils::json_resp(
            json!({
                "ok": false,
                "msg": "Media cache upload failed",
                "error": format!("{}", err)
            }),
            503,
        );
    }

    let drive_sync = if has_drive_auth_config(&ctx.env) {
        let archive_env = ctx.env.clone();
        let archive_key = media_key.clone();
        let archive_name = name.clone();
        let archive_mime = mime_type.clone();
        let archive_bytes = buffer.clone();
        ctx.data.wait_until(async move {
            sync_media_to_drive_archive(
                archive_env,
                archive_key,
                archive_bytes,
                archive_name,
                archive_mime,
            )
            .await;
        });
        "pending"
    } else {
        write_drive_archive_status(&ctx.env, &media_key, "disabled", None, None).await;
        "disabled"
    };

    let id = Uuid::new_v4().to_string();
    let file_url = format!("/api/community/media/{}", media_key);
    db.prepare("INSERT INTO drive_files (id, user_id, name, size, mime_type, url, parent_id, is_folder) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
        .bind(&[
            id.clone().into(),
            user.id.clone().into(),
            name.clone().into(),
            size.into(),
            mime_type.clone().into(),
            file_url.clone().into(),
            parent_id.clone().into(),
        ])?
        .run()
        .await?;

    db.prepare("INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET used_bytes = used_bytes + excluded.used_bytes, updated_at = CURRENT_TIMESTAMP")
        .bind(&[user.id.clone().into(), size.into()])?
        .run()
        .await?;

    utils::json_resp(
        json!({
            "ok": true,
            "id": id,
            "fileId": media_key,
            "fromDrive": false,
            "driveSync": drive_sync,
            "file": {
                "id": id,
                "name": name,
                "size": size,
                "mime_type": mime_type,
                "url": file_url,
                "parent_id": parent_id,
                "is_folder": 0
            }
        }),
        200,
    )
}

fn resolve_cached_media_status(existing_status: Option<String>) -> &'static str {
    match existing_status.as_deref() {
        Some(status) if status.contains("GDrive") => "HIT-GDrive",
        Some(status) if status.contains("R2") => "HIT-R2",
        _ => "HIT-EDGE",
    }
}

fn update_cached_media_headers(response: &mut Response) -> Result<()> {
    let existing_status = response.headers().get("X-Cache")?;
    let cache_status = resolve_cached_media_status(existing_status);
    response
        .headers_mut()
        .set("Access-Control-Allow-Origin", "*")?;
    response.headers_mut().set("X-Cache", cache_status)?;
    Ok(())
}

async fn cache_public_media_response(cache: &Cache, cache_key: &str, response: &mut Response) {
    if let Ok(cloned) = response.cloned() {
        let _ = cache.put(cache_key.to_string(), cloned).await;
    }
}

async fn put_uploaded_media(
    env: &Env,
    file_id: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<()> {
    let bucket = env.bucket("COMMUNITY_R2")?;
    bucket
        .put(file_id, bytes.to_vec())
        .http_metadata(HttpMetadata {
            content_type: Some(content_type.to_string()),
            ..Default::default()
        })
        .execute()
        .await?;
    Ok(())
}

async fn cache_uploaded_media(env: &Env, file_id: &str, bytes: &[u8], content_type: &str) {
    if file_id.trim().is_empty() || bytes.is_empty() {
        return;
    }

    let _ = put_uploaded_media(env, file_id, bytes, content_type).await;
}

fn has_drive_auth_config(env: &Env) -> bool {
    let client_id = env
        .var("GDRIVE_CLIENT_ID")
        .ok()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let client_secret = env
        .var("GDRIVE_CLIENT_SECRET")
        .ok()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let refresh_token = env
        .var("GDRIVE_REFRESH_TOKEN")
        .ok()
        .map(|value| value.to_string())
        .unwrap_or_default();

    !client_id.trim().is_empty()
        && !client_secret.trim().is_empty()
        && !refresh_token.trim().is_empty()
}

fn drive_archive_key(media_key: &str) -> String {
    format!("{}{}", GDRIVE_MEDIA_ARCHIVE_PREFIX, media_key)
}

async fn write_drive_archive_status(
    env: &Env,
    media_key: &str,
    status: &str,
    drive_file_id: Option<&str>,
    error: Option<String>,
) {
    let payload = json!({
        "status": status,
        "driveFileId": drive_file_id.unwrap_or(""),
        "error": error.unwrap_or_default(),
        "updatedAt": Utc::now().to_rfc3339()
    });

    if let Ok(kv) = env.kv("SCHEDULE_KV") {
        if let Ok(builder) = kv.put(&drive_archive_key(media_key), payload.to_string()) {
            let _ = builder.execute().await;
        }
    }
}

async fn read_archived_drive_file_id(env: &Env, media_key: &str) -> Result<Option<String>> {
    let kv = match env.kv("SCHEDULE_KV") {
        Ok(kv) => kv,
        Err(_) => return Ok(None),
    };
    let raw = kv.get(&drive_archive_key(media_key)).text().await?;
    let Some(raw) = raw else {
        return Ok(None);
    };
    let payload: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if payload["status"].as_str() != Some("synced") {
        return Ok(None);
    }
    Ok(payload["driveFileId"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string))
}

async fn sync_media_to_drive_archive(
    env: Env,
    media_key: String,
    bytes: Vec<u8>,
    filename: String,
    mime_type: String,
) {
    if !has_drive_auth_config(&env) {
        write_drive_archive_status(&env, &media_key, "disabled", None, None).await;
        return;
    }

    match upload_to_drive(&env, bytes, &filename, &mime_type).await {
        Ok(drive_resp) => {
            let drive_file_id = drive_resp["id"]
                .as_str()
                .unwrap_or_default()
                .trim()
                .to_string();
            if drive_file_id.is_empty() {
                write_drive_archive_status(
                    &env,
                    &media_key,
                    "failed",
                    None,
                    Some("Google Drive upload returned no file id".to_string()),
                )
                .await;
            } else {
                write_drive_archive_status(&env, &media_key, "synced", Some(&drive_file_id), None)
                    .await;
            }
        }
        Err(err) => {
            write_drive_archive_status(&env, &media_key, "failed", None, Some(format!("{}", err)))
                .await;
        }
    }
}

async fn award_xp(db: &D1Database, user_id: &str, amount: i32) -> Result<()> {
    db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?")
        .bind(&[amount.into(), user_id.into()])?
        .run()
        .await?;
    Ok(())
}

async fn ensure_community_schema(db: &D1Database) -> Result<()> {
    let statements = [
        "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', avatar_url TEXT, signature TEXT, background_url TEXT, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, is_banned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS community_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT, media_json TEXT, type TEXT NOT NULL DEFAULT 'post', repost_id TEXT REFERENCES posts(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS likes (post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(post_id, user_id))",
        "CREATE TABLE IF NOT EXISTS favorites (post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(post_id, user_id))",
        "CREATE TABLE IF NOT EXISTS comment_likes (comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(comment_id, user_id))",
        "CREATE TABLE IF NOT EXISTS follows (follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(follower_id, following_id))",
        "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS user_drive_stats (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, quota_bytes INTEGER NOT NULL DEFAULT 0, used_bytes INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS drive_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, mime_type TEXT, url TEXT, parent_id TEXT, is_folder INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_community_sessions_user ON community_sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_community_sessions_expires ON community_sessions(expires_at)",
        "CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON favorites(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id)",
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_drive_files_user_parent ON drive_files(user_id, parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id)",
    ];

    let prepared: Vec<D1PreparedStatement> = statements
        .iter()
        .map(|statement| db.prepare(*statement))
        .collect();

    db.batch(prepared).await?;

    let migrations = [
        "ALTER TABLE notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE likes ADD COLUMN created_at TEXT",
        "ALTER TABLE follows ADD COLUMN created_at TEXT",
    ];
    for statement in migrations {
        run_schema_statement_best_effort(db, statement).await?;
    }

    Ok(())
}

async fn run_schema_statement_best_effort(db: &D1Database, statement: &str) -> Result<()> {
    match db.prepare(statement).run().await {
        Ok(_) => Ok(()),
        Err(err) => {
            let message = format!("{}", err).to_lowercase();
            if message.contains("duplicate column") {
                Ok(())
            } else {
                Err(err)
            }
        }
    }
}

async fn ensure_community_schema_once(env: &Env) -> Result<()> {
    let kv = env.kv("SCHEDULE_KV")?;
    if kv.get(COMMUNITY_SCHEMA_KV_KEY).text().await?.as_deref() == Some(COMMUNITY_SCHEMA_VERSION) {
        return Ok(());
    }

    let db = env.d1("COMMUNITY_DB")?;
    ensure_community_schema(&db).await?;
    kv.put(COMMUNITY_SCHEMA_KV_KEY, COMMUNITY_SCHEMA_VERSION)?
        .execute()
        .await?;
    Ok(())
}

async fn add_notify(
    db: &D1Database,
    user_id: &str,
    notify_type: &str,
    from_user_id: &str,
    target_id: &str,
) -> Result<()> {
    if user_id == from_user_id {
        return Ok(());
    }
    db.prepare("INSERT INTO notifications (id, user_id, type, from_user_id, target_id) VALUES (?, ?, ?, ?, ?)")
        .bind(&[
            Uuid::new_v4().to_string().into(),
            user_id.into(),
            notify_type.into(),
            from_user_id.into(),
            target_id.into()
        ])?
        .run().await?;
    Ok(())
}

async fn toggle_post_like(db: &D1Database, user: &User, post_id: &str) -> Result<PostLikeResult> {
    let existing = db
        .prepare("SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?")
        .bind(&[post_id.into(), user.id.clone().into()])?
        .first::<Value>(None)
        .await?;

    let liked = if existing.is_some() {
        db.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?")
            .bind(&[post_id.into(), user.id.clone().into()])?
            .run()
            .await?;
        false
    } else {
        db.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)")
            .bind(&[post_id.into(), user.id.clone().into()])?
            .run()
            .await?;

        let target = db
            .prepare("SELECT user_id FROM posts WHERE id = ?")
            .bind(&[post_id.into()])?
            .first::<Value>(None)
            .await?;
        if let Some(t) = target {
            if let Some(tid) = t["user_id"].as_str() {
                add_notify(db, tid, "like", &user.id, post_id).await?;
            }
        }
        true
    };

    let like_count = db
        .prepare("SELECT COUNT(*) as count FROM likes WHERE post_id = ?")
        .bind(&[post_id.into()])?
        .first::<Value>(None)
        .await?
        .and_then(|value| value["count"].as_i64().or_else(|| value["count"].as_f64().map(|f| f as i64)))
        .unwrap_or(0);

    Ok(PostLikeResult { liked, like_count })
}

async fn delete_post_cascade(db: &D1Database, post_id: &str) -> Result<()> {
    db.prepare(
        "DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?)",
    )
    .bind(&[post_id.into()])?
    .run()
    .await?;
    db.prepare("DELETE FROM comments WHERE post_id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    db.prepare("DELETE FROM likes WHERE post_id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    db.prepare("DELETE FROM favorites WHERE post_id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    db.prepare("DELETE FROM reports WHERE target_type = 'post' AND target_id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    db.prepare("DELETE FROM notifications WHERE target_id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    db.prepare("DELETE FROM posts WHERE id = ?")
        .bind(&[post_id.into()])?
        .run()
        .await?;
    Ok(())
}

async fn get_google_auth_token(env: &Env) -> Result<String> {
    if let Ok(kv) = env.kv("SCHEDULE_KV") {
        if let Some(raw) = kv.get(GDRIVE_TOKEN_CACHE_KEY).text().await? {
            if let Ok(cached) = serde_json::from_str::<CachedGoogleAuthToken>(&raw) {
                if !cached.access_token.trim().is_empty()
                    && cached.expires_at_ms > now_ms() + GDRIVE_TOKEN_REFRESH_SKEW_MS
                {
                    return Ok(cached.access_token);
                }
            }
        }
    }

    let client_id = env.var("GDRIVE_CLIENT_ID")?.to_string();
    let client_secret = env.var("GDRIVE_CLIENT_SECRET")?.to_string();
    let refresh_token = env.var("GDRIVE_REFRESH_TOKEN")?.to_string();

    let headers = Headers::new();
    headers.set("Content-Type", "application/x-www-form-urlencoded")?;

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("client_id", &client_id);
    serializer.append_pair("client_secret", &client_secret);
    serializer.append_pair("refresh_token", &refresh_token);
    serializer.append_pair("grant_type", "refresh_token");
    let form_data = serializer.finish();

    let mut init = RequestInit::new();
    init.with_method(Method::Post);
    init.with_headers(headers);
    init.with_body(Some(form_data.into()));
    let req = Request::new_with_init("https://oauth2.googleapis.com/token", &init)?;

    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    if status != 200 {
        return Err(format!("Google OAuth refresh failed with status {}", status).into());
    }
    let data: Value = resp.json().await?;
    let access_token = data["access_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    if access_token.trim().is_empty() {
        return Err("Google OAuth refresh returned no access token".into());
    }

    let expires_in = data["expires_in"]
        .as_u64()
        .unwrap_or(GDRIVE_TOKEN_DEFAULT_TTL_SECONDS);
    let cache_ttl = expires_in.saturating_sub(60).max(60);
    let cached = CachedGoogleAuthToken {
        access_token: access_token.clone(),
        expires_at_ms: now_ms() + (cache_ttl as i64 * 1000),
    };
    if let Ok(kv) = env.kv("SCHEDULE_KV") {
        if let Ok(payload) = serde_json::to_string(&cached) {
            if let Ok(builder) = kv.put(GDRIVE_TOKEN_CACHE_KEY, payload) {
                let _ = builder.expiration_ttl(cache_ttl).execute().await;
            }
        }
    }

    Ok(access_token)
}

#[allow(dead_code)]
async fn upload_to_drive(
    env: &Env,
    buffer: Vec<u8>,
    filename: &str,
    mime_type: &str,
) -> Result<Value> {
    let token = get_google_auth_token(env).await?;
    let folder_id = env.var("GDRIVE_FOLDER_ID")?.to_string();

    let metadata = json!({
        "name": filename,
        "parents": [folder_id]
    });

    let boundary = "foo_bar_baz";
    let mut body = Vec::new();
    body.extend_from_slice(
        format!(
            "--{}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n",
            boundary,
            metadata.to_string()
        )
        .as_bytes(),
    );
    body.extend_from_slice(
        format!("--{}\r\nContent-Type: {}\r\n\r\n", boundary, mime_type).as_bytes(),
    );
    body.extend_from_slice(&buffer);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {}", token))?;
    headers.set(
        "Content-Type",
        &format!("multipart/related; boundary={}", boundary),
    )?;

    let mut init = RequestInit::new();
    init.with_method(Method::Post);
    init.with_headers(headers);
    init.with_body(Some(body.into()));

    let mut resp = Fetch::Request(Request::new_with_init("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", &init)?).send().await?;
    resp.json().await
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, fetch_ctx: Context) -> Result<Response> {
    let request_url = req.url()?;
    if request_url.path().starts_with("/api/community") {
        ensure_community_schema_once(&env).await?;
    }

    let router = Router::with_data(fetch_ctx);

    router
        .options_async("/api/*path", |_req, _ctx| async move {
            utils::empty_resp(204)
        })
        .on_async("/api/data", |mut req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            match req.method() {
                Method::Get => {
                    let data = kv.get("schedule_data").text().await?.unwrap_or_else(|| "{}".to_string());
                    Response::ok(data)
                },
                Method::Post => {
                    let body = req.text().await?;
                    kv.put("schedule_data", body)?.execute().await?;
                    utils::json_resp(json!({"ok": true}), 200)
                },
                _ => Response::error("Method Not Allowed", 405)
            }
        })
        .get_async("/api/schedule", |_req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            let data = kv.get("schedule_data").text().await?.unwrap_or_else(|| "{}".to_string());
            Response::ok(data)
        })
        .post_async("/api/community/register", |mut req, ctx| async move {
            let body: Value = req.json().await?;
            let username = body["username"].as_str().unwrap_or("");
            let password = body["password"].as_str().unwrap_or("");

            let db = ctx.env.d1("COMMUNITY_DB")?;
            match register_community_user(&db, username, password).await? {
                Ok(user) => community_auth_response(&db, user).await,
                Err(response) => Ok(response),
            }
        })
        .post_async("/api/community/auth", |mut req, ctx| async move {
            let body: Value = req.json().await?;
            let action = body["action"].as_str().unwrap_or("login");
            let username = body["username"].as_str().unwrap_or("");
            let password = body["password"].as_str().unwrap_or("");

            if action == "register" {
                let db = ctx.env.d1("COMMUNITY_DB")?;
                return match register_community_user(&db, username, password).await? {
                    Ok(user) => community_auth_response(&db, user).await,
                    Err(response) => Ok(response),
                };
            }

            let pass_hash = utils::sha256_hex(password);
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = find_user_by_credentials(&db, username, &pass_hash).await?;

            if let Some(u) = user {
                if u.is_banned == 1 {
                    return utils::json_resp(json!({"ok": false, "msg": "账号已被封禁"}), 403);
                }
                community_auth_response(&db, u).await
            } else {
                utils::json_resp(json!({"ok": false, "msg": "用户名或密码错误"}), 401)
            }
        })
        .post_async("/api/community/login", |mut req, ctx| async move {
            let body: Value = req.json().await?;
            let username = body["username"].as_str().unwrap_or("");
            let password = body["password"].as_str().unwrap_or("");
            let pass_hash = utils::sha256_hex(password);

            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = find_user_by_credentials(&db, username, &pass_hash).await?;

            if let Some(u) = user {
                if u.is_banned == 1 {
                    return utils::json_resp(json!({"ok": false, "msg": "账号已被封禁"}), 403);
                }
                community_auth_response(&db, u).await
            } else {
                utils::json_resp(json!({"ok": false, "msg": "用户名或密码错误"}), 401)
            }
        })
        .get_async("/api/community/me", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            if let Some(user) = get_auth(&req, &db).await? {
                utils::json_resp(json!({"ok": true, "user": with_community_level(user)}), 200)
            } else {
                utils::json_resp(json!({"ok": false}), 401)
            }
        })
        .get_async("/api/community/posts", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let url = req.url()?;
            let uid = url.query_pairs().find(|(k, _)| k == "userId").map(|(_, v)| v.to_string());
            let q = url.query_pairs().find(|(k, _)| k == "q").map(|(_, v)| v.to_string()).unwrap_or_default();
            let favorites_only = url.query_pairs().any(|(k, v)| {
                (k == "favorites" || k == "bookmarked") && matches!(v.as_ref(), "1" | "true" | "yes")
            });

            if favorites_only && user.is_none() {
                return utils::json_resp(json!({"ok": false, "msg": "login required"}), 401);
            }

            let mut sql = "
                SELECT
                COALESCE(p.id, '') as id,
                COALESCE(p.user_id, '') as user_id,
                p.content,
                p.media_json,
                COALESCE(p.type, 'post') as type,
                p.repost_id,
                COALESCE(p.created_at, '') as created_at,
                COALESCE(u.username, '[账号不可用]') as username,
                u.avatar_url,
                COALESCE(u.role, 'user') as role,
                u.signature,
                u.background_url,
                COALESCE(u.xp, 0) as xp,
                COALESCE(u.level, 1) as level,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM favorites WHERE post_id = p.id) as favorite_count
            ".to_string();

            let mut params: Vec<wasm_bindgen::JsValue> = Vec::new();
            if let Some(ref u) = user {
                sql += ", EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as viewer_liked";
                params.push(u.id.clone().into());
                sql += ", (SELECT 1 FROM favorites WHERE post_id = p.id AND user_id = ?) as viewer_favorited";
                params.push(u.id.clone().into());
                sql += ", CASE WHEN p.user_id = ? OR ? IN ('admin', 'owner') THEN 1 ELSE 0 END as can_delete";
                params.push(u.id.clone().into());
                params.push(normalize_community_role(&u.role).into());
            } else {
                sql += ", 0 as viewer_liked";
                sql += ", 0 as viewer_favorited";
                sql += ", 0 as can_delete";
            }

            sql += " FROM posts p LEFT JOIN users u ON p.user_id = u.id ";

            let mut filters: Vec<String> = Vec::new();
            if let Some(id) = uid {
                filters.push("p.user_id = ?".to_string());
                params.push(id.into());
            }
            if favorites_only {
                if let Some(ref u) = user {
                    filters.push("EXISTS (SELECT 1 FROM favorites f WHERE f.post_id = p.id AND f.user_id = ?)".to_string());
                    params.push(u.id.clone().into());
                }
            }
            let trimmed_q = q.trim();
            if !trimmed_q.is_empty() {
                let like_query = format!("%{}%", trimmed_q);
                filters.push("(COALESCE(p.content, '') LIKE ? OR COALESCE(u.username, '') LIKE ?)".to_string());
                params.push(like_query.clone().into());
                params.push(like_query.into());
            }
            if !filters.is_empty() {
                sql += " WHERE ";
                sql += &filters.join(" AND ");
            }

            sql += " ORDER BY p.created_at DESC LIMIT 50";

            let results = db.prepare(&sql).bind(&params)?.all().await?.results::<Post>()?;

            let mut posts = Vec::new();
            for mut post in results {
                post.level = Some(utils::get_community_level_from_xp(post.xp.unwrap_or(0)));
                if let Some(ref rid) = post.repost_id {
                    let r_sql = "
                        SELECT
                        COALESCE(p.id, '') as id,
                        COALESCE(p.user_id, '') as user_id,
                        p.content,
                        p.media_json,
                        COALESCE(p.type, 'post') as type,
                        p.repost_id,
                        COALESCE(p.created_at, '') as created_at,
                        COALESCE(u.username, '[账号不可用]') as username,
                        u.avatar_url,
                        COALESCE(u.role, 'user') as role,
                        u.signature,
                        u.background_url,
                        COALESCE(u.xp, 0) as xp,
                        COALESCE(u.level, 1) as level,
                        0 as like_count,
                        0 as comment_count,
                        0 as favorite_count,
                        0 as viewer_liked,
                        0 as viewer_favorited,
                        0 as can_delete
                        FROM posts p LEFT JOIN users u ON p.user_id = u.id
                        WHERE p.id = ?
                    ";
                    let mut r_post = db.prepare(r_sql).bind(&[rid.clone().into()])?.first::<Post>(None).await?;
                    if let Some(ref mut repost) = r_post {
                        repost.level = Some(utils::get_community_level_from_xp(repost.xp.unwrap_or(0)));
                        normalize_community_post_media(repost);
                    }
                    post.repost_data = r_post.map(Box::new);
                }
                normalize_community_post_media(&mut post);
                posts.push(post);
            }

            utils::json_resp(json!({"ok": true, "posts": posts}), 200)
        })
        .post_async("/api/community/posts", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let content = body["content"].as_str();
            let media = &body["media"];
            let post_type = body["type"].as_str().unwrap_or("post");
            let repost_id = body["repost_id"].as_str();

            let id = Uuid::new_v4().to_string();
            let media_json = if media.is_null() { None } else { Some(media.to_string()) };

            let content_val = content.unwrap_or("");
            let repost_id_val = repost_id.unwrap_or("");

            let media_json_val: Option<String> = media_json;
            let repost_id_opt: Option<String> = if repost_id_val.is_empty() { None } else { Some(repost_id_val.to_string()) };

            let stmt = db.prepare("INSERT INTO posts (id, user_id, content, media_json, type, repost_id) VALUES (?, ?, ?, ?, ?, ?)");

            let mut params: Vec<wasm_bindgen::JsValue> = Vec::new();
            params.push(id.clone().into());
            params.push(user.id.clone().into());
            params.push(content_val.into());

            if let Some(m) = media_json_val {
                params.push(m.into());
            } else {
                params.push(wasm_bindgen::JsValue::NULL);
            }

            params.push(post_type.into());

            if let Some(r) = repost_id_opt {
                params.push(r.into());
            } else {
                params.push(wasm_bindgen::JsValue::NULL);
            }

            stmt.bind(&params)?
                .run().await?;

            award_xp(&db, &user.id, 5).await?;

            if let Some(rid) = repost_id {
                let target = db.prepare("SELECT user_id FROM posts WHERE id = ?").bind(&[rid.into()])?.first::<Value>(None).await?;
                if let Some(t) = target {
                    if let Some(tid) = t["user_id"].as_str() {
                        add_notify(&db, tid, "repost", &user.id, &id).await?;
                    }
                }
            }

            utils::json_resp(json!({"ok": true, "id": id}), 200)
        })
        .post_async("/api/community/posts/like", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let post_id = body["post_id"].as_str().unwrap_or("").trim().to_string();
            if post_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "missing post id"}), 400);
            }

            let result = toggle_post_like(&db, &user, &post_id).await?;
            utils::json_resp(json!({"ok": true, "liked": result.liked, "like_count": result.like_count}), 200)
        })
        .post_async("/api/community/like", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let post_id = body["post_id"].as_str().unwrap_or("").trim().to_string();
            if post_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "missing post id"}), 400);
            }

            let result = toggle_post_like(&db, &user, &post_id).await?;
            let action = if result.liked { "liked" } else { "unliked" };
            utils::json_resp(json!({"ok": true, "action": action, "liked": result.liked, "like_count": result.like_count}), 200)
        })
        .post_async("/api/community/posts/favorite", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let post_id = body["post_id"].as_str().unwrap_or("").trim().to_string();
            if post_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "missing post id"}), 400);
            }

            let target = db.prepare("SELECT 1 FROM posts WHERE id = ?")
                .bind(&[post_id.clone().into()])?
                .first::<Value>(None)
                .await?;
            if target.is_none() {
                return utils::json_resp(json!({"ok": false, "msg": "post not found"}), 404);
            }

            let existing = db.prepare("SELECT 1 FROM favorites WHERE post_id = ? AND user_id = ?")
                .bind(&[post_id.clone().into(), user.id.clone().into()])?
                .first::<Value>(None)
                .await?;

            let favorited = if existing.is_some() {
                db.prepare("DELETE FROM favorites WHERE post_id = ? AND user_id = ?")
                    .bind(&[post_id.clone().into(), user.id.clone().into()])?
                    .run()
                    .await?;
                false
            } else {
                db.prepare("INSERT INTO favorites (post_id, user_id) VALUES (?, ?)")
                    .bind(&[post_id.clone().into(), user.id.clone().into()])?
                    .run()
                    .await?;
                true
            };

            let favorite_count = db.prepare("SELECT COUNT(*) as count FROM favorites WHERE post_id = ?")
                .bind(&[post_id.into()])?
                .first::<Value>(None)
                .await?
                .and_then(|value| value["count"].as_i64().or_else(|| value["count"].as_f64().map(|f| f as i64)))
                .unwrap_or(0);

            utils::json_resp(json!({"ok": true, "favorited": favorited, "favorite_count": favorite_count}), 200)
        })
        .post_async("/api/community/posts/delete", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let post_id = body["post_id"].as_str().unwrap_or("").trim().to_string();
            if post_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "missing post id"}), 400);
            }

            let target = db.prepare("SELECT user_id FROM posts WHERE id = ?")
                .bind(&[post_id.clone().into()])?
                .first::<Value>(None)
                .await?;
            let Some(target) = target else {
                return utils::json_resp(json!({"ok": false, "msg": "post not found"}), 404);
            };

            let owner_id = target["user_id"].as_str().unwrap_or("");
            let role = normalize_community_role(&user.role);
            if owner_id != user.id && !is_community_admin_role(&role) {
                return utils::json_resp(json!({"ok": false, "msg": "forbidden"}), 403);
            }

            delete_post_cascade(&db, &post_id).await?;
            utils::json_resp(json!({"ok": true, "deleted": true, "post_id": post_id}), 200)
        })
        .get_async("/api/community/comments", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let viewer = get_auth(&req, &db).await?;
            let url = req.url()?;
            let post_id = url.query_pairs().find(|(k, _)| k == "postId").map(|(_, v)| v.to_string()).unwrap_or_default();

            if post_id.trim().is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "缺少帖子 ID"}), 400);
            }

            let mut sql = "
                SELECT
                    c.*,
                    u.username,
                    u.avatar_url,
                    COALESCE(u.role, 'user') as role,
                    u.signature,
                    u.background_url,
                    u.xp,
                    u.level,
                    (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count
            ".to_string();
            let mut params: Vec<wasm_bindgen::JsValue> = vec![post_id.clone().into()];
            if let Some(ref viewer) = viewer {
                sql.push_str(", (SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as viewer_liked");
                params.push(viewer.id.clone().into());
            } else {
                sql.push_str(", 0 as viewer_liked");
            }
            sql.push_str("
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.post_id = ? ORDER BY datetime(c.created_at) ASC
            ");

            let viewer_param = if params.len() > 1 { params.pop() } else { None };
            if let Some(param) = viewer_param {
                params.insert(0, param);
            }

            let results = db.prepare(&sql).bind(&params)?.all().await?.results::<Comment>()?;

            let mut comments = Vec::new();
            for mut comment in results {
                comment.level = Some(utils::get_community_level_from_xp(comment.xp.unwrap_or(0)));
                normalize_community_comment_media(&mut comment);
                comments.push(comment);
            }

            utils::json_resp(json!({"ok": true, "comments": comments}), 200)
        })
        .post_async("/api/community/comments", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let post_id = body["post_id"].as_str().unwrap_or("").trim().to_string();
            let content = body["content"].as_str().unwrap_or("").trim().to_string();
            let parent_id = body["parent_id"].as_str().map(str::trim).filter(|value| !value.is_empty());

            if post_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "缺少帖子 ID"}), 400);
            }
            if content.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "评论不能为空"}), 400);
            }
            if content.chars().count() > 500 {
                return utils::json_resp(json!({"ok": false, "msg": "评论太长了"}), 400);
            }

            let target = db.prepare("SELECT user_id FROM posts WHERE id = ?")
                .bind(&[post_id.clone().into()])?
                .first::<Value>(None)
                .await?;
            let Some(target) = target else {
                return utils::json_resp(json!({"ok": false, "msg": "帖子不存在"}), 404);
            };

            let mut parent_owner_id: Option<String> = None;
            if let Some(parent_id) = parent_id {
                let parent = db.prepare("SELECT user_id, post_id FROM comments WHERE id = ?")
                    .bind(&[parent_id.into()])?
                    .first::<Value>(None)
                    .await?;
                let Some(parent) = parent else {
                    return utils::json_resp(json!({"ok": false, "msg": "reply target not found"}), 404);
                };
                if parent["post_id"].as_str() != Some(post_id.as_str()) {
                    return utils::json_resp(json!({"ok": false, "msg": "reply target mismatch"}), 400);
                }
                parent_owner_id = parent["user_id"].as_str().map(|value| value.to_string());
            }

            let id = Uuid::new_v4().to_string();
            let mut insert_params: Vec<wasm_bindgen::JsValue> = vec![
                id.clone().into(),
                post_id.clone().into(),
                user.id.clone().into(),
                wasm_bindgen::JsValue::NULL,
                content.into()
            ];
            if let Some(parent_id) = parent_id {
                insert_params[3] = parent_id.into();
            }
            db.prepare("INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)")
                .bind(&insert_params)?
                .run().await?;

            award_xp(&db, &user.id, 2).await?;

            if let Some(tid) = target["user_id"].as_str() {
                add_notify(&db, tid, "comment", &user.id, &post_id).await?;
            }
            if let Some(parent_owner_id) = parent_owner_id {
                add_notify(&db, &parent_owner_id, "reply", &user.id, &id).await?;
            }

            let mut comment = db.prepare("
                SELECT
                    c.*,
                    u.username,
                    u.avatar_url,
                    COALESCE(u.role, 'user') as role,
                    u.signature,
                    u.background_url,
                    u.xp,
                    u.level,
                    0 as like_count,
                    0 as viewer_liked
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.id = ?
                LIMIT 1
            ")
            .bind(&[id.clone().into()])?
            .first::<Comment>(None)
            .await?;
            if let Some(ref mut comment) = comment {
                comment.level = Some(utils::get_community_level_from_xp(comment.xp.unwrap_or(0)));
                normalize_community_comment_media(comment);
            }

            let comment_count = db.prepare("SELECT COUNT(*) as count FROM comments WHERE post_id = ?")
                .bind(&[post_id.into()])?
                .first::<Value>(None)
                .await?
                .and_then(|value| value["count"].as_i64().or_else(|| value["count"].as_f64().map(|f| f as i64)))
                .unwrap_or(0);

            utils::json_resp(json!({"ok": true, "comment": comment, "comment_count": comment_count}), 200)
        })
        .post_async("/api/community/comments/like", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let comment_id = body["comment_id"].as_str().unwrap_or("").trim().to_string();
            if comment_id.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "缺少评论 ID"}), 400);
            }

            let target = db.prepare("SELECT user_id, post_id FROM comments WHERE id = ?")
                .bind(&[comment_id.clone().into()])?
                .first::<Value>(None)
                .await?;
            let Some(target) = target else {
                return utils::json_resp(json!({"ok": false, "msg": "评论不存在"}), 404);
            };

            let existing = db.prepare("SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?")
                .bind(&[comment_id.clone().into(), user.id.clone().into()])?
                .first::<Value>(None)
                .await?;

            let liked = if existing.is_some() {
                db.prepare("DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?")
                    .bind(&[comment_id.clone().into(), user.id.clone().into()])?
                    .run()
                    .await?;
                false
            } else {
                db.prepare("INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)")
                    .bind(&[comment_id.clone().into(), user.id.clone().into()])?
                    .run()
                    .await?;
                if let Some(owner_id) = target["user_id"].as_str() {
                    add_notify(&db, owner_id, "comment_like", &user.id, &comment_id).await?;
                }
                true
            };

            let like_count = db.prepare("SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?")
                .bind(&[comment_id.into()])?
                .first::<Value>(None)
                .await?
                .and_then(|value| value["count"].as_i64().or_else(|| value["count"].as_f64().map(|f| f as i64)))
                .unwrap_or(0);

            utils::json_resp(json!({"ok": true, "liked": liked, "like_count": like_count}), 200)
        })
        .get_async("/api/community/notifications", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let mut results = db.prepare("
                SELECT n.*, u.username, u.avatar_url FROM notifications n
                JOIN users u ON n.from_user_id = u.id
                WHERE n.user_id = ?
                  AND n.from_user_id <> ?
                  AND n.type IN ('like', 'comment', 'reply', 'repost', 'comment_like')
                ORDER BY n.created_at DESC LIMIT 50
            ").bind(&[user.id.clone().into(), user.id.into()])?.all().await?.results::<Notification>()?;
            for notification in results.iter_mut() {
                normalize_community_notification_media(notification);
            }

            utils::json_resp(json!({"ok": true, "notifications": results}), 200)
        })
        .get_async("/api/community/announcement", |_req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            let announcement = kv.get("community_announcement").text().await?.unwrap_or_else(|| "{}".to_string());
            utils::json_resp(json!({
                "ok": true,
                "announcement": serde_json::from_str::<Value>(&announcement).unwrap_or(json!({"content": "", "updatedAt": null}))
            }), 200)
        })
        .get_async("/api/community/profile", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let viewer = get_auth(&req, &db).await?;
            let url = req.url()?;
            let uid = url.query_pairs().find(|(k, _)| k == "id").map(|(_, v)| v.to_string());
            let uname = url.query_pairs().find(|(k, _)| k == "username").map(|(_, v)| v.to_string());

            let mut sql = "SELECT id, username, avatar_url, background_url, signature, level, xp, role, is_banned, created_at FROM users WHERE ".to_string();
            let param;
            if let Some(id) = uid {
                sql += "id = ?";
                param = id;
            } else if let Some(name) = uname {
                sql += "username = ?";
                param = name;
            } else {
                return utils::json_resp(json!({"ok": false}), 400);
            }

            let user = db.prepare(&sql).bind(&[param.into()])?.first::<User>(None).await?;
            if let Some(mut u) = user {
                u.level = utils::get_community_level_from_xp(u.xp);

                let followers = db.prepare("SELECT COUNT(*) as c FROM follows WHERE following_id = ?").bind(&[u.id.clone().into()])?.first::<Value>(None).await?;
                let following = db.prepare("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?").bind(&[u.id.clone().into()])?.first::<Value>(None).await?;

                u.followers_count = Some(followers.and_then(|v| v["c"].as_i64()).unwrap_or(0) as i32);
                u.following_count = Some(following.and_then(|v| v["c"].as_i64()).unwrap_or(0) as i32);
                u.viewer_is_following = Some(false);

                if let Some(v) = viewer {
                    if v.id != u.id {
                        let relation = db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?")
                            .bind(&[v.id.into(), u.id.clone().into()])?.first::<Value>(None).await?;
                        u.viewer_is_following = Some(relation.is_some());
                    }
                }

                normalize_community_user_media(&mut u);
                utils::json_resp(json!({"ok": true, "user": u}), 200)
            } else {
                utils::json_resp(json!({"ok": false}), 404)
            }
        })
        .post_async("/api/community/profile", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let signature = body["signature"].as_str();
            let background_url = body["background_url"].as_str();
            let avatar_url = body["avatar_url"].as_str();

            db.prepare("UPDATE users SET signature = COALESCE(?, signature), background_url = COALESCE(?, background_url), avatar_url = COALESCE(?, avatar_url) WHERE id = ?")
                .bind(&[signature.into(), background_url.into(), avatar_url.into(), user.id.clone().into()])?
                .run().await?;

            let updated = db.prepare("SELECT id, username, avatar_url, background_url, signature, level, xp, role, is_banned, created_at FROM users WHERE id = ?")
                .bind(&[user.id.into()])?
                .first::<User>(None)
                .await?
                .unwrap_or_default();
            utils::json_resp(json!({"ok": true, "user": with_community_level(updated)}), 200)
        })
        .get_async("/api/community/discovery", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let viewer = get_auth(&req, &db).await?;
            let viewer_id = viewer.as_ref().map(|u| u.id.clone());
            let url = req.url()?;
            let q = url.query_pairs().find(|(k, _)| k == "q").map(|(_, v)| v.to_string()).unwrap_or_default();
            let like_query = format!("%{}%", q.trim());

            let user_sql = if q.trim().is_empty() {
                "SELECT COALESCE(id, '') as id, COALESCE(username, '') as username, COALESCE(password_hash, '') as password_hash, COALESCE(role, 'user') as role, avatar_url, signature, background_url, COALESCE(xp, 0) as xp, COALESCE(level, 1) as level, COALESCE(is_banned, 0) as is_banned, COALESCE(created_at, '') as created_at FROM users WHERE is_banned = 0 ORDER BY xp DESC, created_at DESC LIMIT 8"
            } else {
                "SELECT COALESCE(id, '') as id, COALESCE(username, '') as username, COALESCE(password_hash, '') as password_hash, COALESCE(role, 'user') as role, avatar_url, signature, background_url, COALESCE(xp, 0) as xp, COALESCE(level, 1) as level, COALESCE(is_banned, 0) as is_banned, COALESCE(created_at, '') as created_at FROM users WHERE is_banned = 0 AND (username LIKE ? OR COALESCE(signature, '') LIKE ?) ORDER BY xp DESC, created_at DESC LIMIT 8"
            };

            let users = if q.trim().is_empty() {
                db.prepare(user_sql).all().await?.results::<User>()?
            } else {
                db.prepare(user_sql).bind(&[like_query.clone().into(), like_query.clone().into()])?.all().await?.results::<User>()?
            };

            let users: Vec<Value> = users.into_iter()
                .filter(|item| Some(item.id.clone()) != viewer_id)
                .map(with_community_level)
                .map(|item| json!({
                    "id": item.id,
                    "username": item.username,
                    "avatar_url": item.avatar_url,
                    "background_url": item.background_url,
                    "signature": item.signature,
                    "xp": item.xp,
                    "level": item.level,
                    "role": item.role
                }))
                .collect();

            utils::json_resp(json!({"ok": true, "users": users, "query": q}), 200)
        })
        .post_async("/api/community/follow", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };

            let body: Value = req.json().await?;
            let target_id = body["following_id"].as_str().or_else(|| body["target_id"].as_str()).unwrap_or("").trim().to_string();
            if target_id.is_empty() || target_id == user.id {
                return utils::json_resp(json!({"ok": false}), 400);
            }

            let existing = db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?")
                .bind(&[user.id.clone().into(), target_id.clone().into()])?.first::<Value>(None).await?;

            if existing.is_some() {
                db.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")
                    .bind(&[user.id.into(), target_id.into()])?.run().await?;
                utils::json_resp(json!({"ok": true, "action": "unfollowed", "following": false}), 200)
            } else {
                db.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)")
                    .bind(&[user.id.clone().into(), target_id.clone().into()])?.run().await?;
                add_notify(&db, &target_id, "follow", &user.id, &user.id).await?;
                utils::json_resp(json!({"ok": true, "action": "followed", "following": true}), 200)
            }
        })
        .get_async("/api/community/admin/data", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            if let Some(u) = user {
                if !is_community_admin_role(&normalize_community_role(&u.role)) {
                    return utils::json_resp(json!({"ok": false}), 403);
                }
                let reports = db.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC").all().await?.results::<Report>()?;
                let users = db.prepare("SELECT u.*, COALESCE(ds.quota_bytes, 0) as drive_quota, COALESCE(ds.used_bytes, 0) as drive_used FROM users u LEFT JOIN user_drive_stats ds ON u.id = ds.user_id ORDER BY u.created_at DESC").all().await?.results::<User>()?;

                let kv = ctx.env.kv("SCHEDULE_KV")?;
                let announcement = kv.get("community_announcement").text().await?.unwrap_or_else(|| "{}".to_string());
                let drive_folder_id = ctx.env.var("GDRIVE_FOLDER_ID").ok().map(|value| value.to_string()).unwrap_or_default();
                let mut r2_sample_keys: Vec<String> = Vec::new();
                let mut r2_error: Option<String> = None;
                let r2_configured = match ctx.env.bucket("COMMUNITY_R2") {
                    Ok(community_bucket) => {
                        match community_bucket.list().execute().await {
                            Ok(cache_listing) => {
                                for object in cache_listing.objects() {
                                    r2_sample_keys.push(object.key());
                                    if r2_sample_keys.len() >= 6 {
                                        break;
                                    }
                                }
                            },
                            Err(err) => {
                                r2_error = Some(format!("{}", err));
                            }
                        }
                        true
                    },
                    Err(err) => {
                        r2_error = Some(format!("{}", err));
                        false
                    }
                };

                utils::json_resp(json!({
                    "ok": true,
                    "reports": reports,
                    "users": users,
                    "announcement": serde_json::from_str::<Value>(&announcement).unwrap_or(json!({"content": "", "updatedAt": null})),
                    "media_storage": {
                        "mode": "r2-primary-drive-archive",
                        "drive_auth_configured": has_drive_auth_config(&ctx.env),
                        "drive_folder_id": drive_folder_id,
                        "drive_folder_configured": !drive_folder_id.trim().is_empty(),
                        "r2_configured": r2_configured,
                        "r2_error": r2_error,
                        "r2_sample_count": r2_sample_keys.len(),
                        "r2_sample_keys": r2_sample_keys
                    }
                }), 200)
            } else {
                utils::json_resp(json!({"ok": false}), 401)
            }
        })
        .post_async("/api/community/admin/action", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) if is_community_admin_role(&normalize_community_role(&u.role)) => with_community_level(u),
                _ => return utils::json_resp(json!({"ok": false}), 403)
            };

            let action: AdminAction = req.json().await?;
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            match action.action.as_str() {
                "reset_password" => {
                    if let Some(tid) = action.target_id {
                        let new_password = action.new_password.unwrap_or_default();
                        if new_password.trim().is_empty() {
                            return utils::json_resp(json!({"ok": false, "msg": "新密码不能为空"}), 400);
                        }
                        let pass_hash = utils::sha256_hex(&new_password);
                        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(&[pass_hash.into(), tid.into()])?.run().await?;
                    }
                },
                "ban_user" => {
                    if let Some(tid) = action.target_id {
                        db.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").bind(&[tid.into()])?.run().await?;
                    }
                },
                "unban_user" => {
                    if let Some(tid) = action.target_id {
                        db.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(&[tid.into()])?.run().await?;
                    }
                },
                "delete_item" => {
                    if let Some(tid) = action.target_id {
                        if action.target_type.as_deref() == Some("post") {
                            delete_post_cascade(&db, &tid).await?;
                        } else if action.target_type.as_deref() == Some("comment") {
                            db.prepare("DELETE FROM comments WHERE id = ?").bind(&[tid.into()])?.run().await?;
                        }
                    }
                    if let Some(rid) = action.report_id {
                        db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(&[rid.into()])?.run().await?;
                    }
                },
                "set_announcement" => {
                    kv.put("community_announcement", json!({
                        "content": action.content.unwrap_or_default(),
                        "updatedAt": Utc::now().to_rfc3339()
                    }).to_string())?.execute().await?;
                },
                "set_drive_quota" => {
                    if let (Some(tid), Some(quota_gb)) = (action.target_id, action.quota_gb) {
                        let quota_bytes = (quota_gb * 1024.0 * 1024.0 * 1024.0) as i64;
                        db.prepare("INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET quota_bytes = excluded.quota_bytes")
                            .bind(&[tid.into(), quota_bytes.into()])?.run().await?;
                    }
                },
                "grant_admin" => {
                    if let Some(tid) = action.target_id {
                        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(&[tid.into()])?.run().await?;
                    }
                },
                "revoke_admin" => {
                    if let Some(tid) = action.target_id {
                        db.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(&[tid.into()])?.run().await?;
                    }
                },
                "set_nodes_password" => {
                    let next_password = action.new_password.unwrap_or_default();
                    let hash = utils::sha256_hex(next_password.trim());
                    kv.put("proxy_nodes_password_hash", hash)?.execute().await?;
                    kv.put("nodes_user_pwd", next_password)?.execute().await?;
                },
                "create_node_source" | "update_node_source" => {
                    let mut sources = read_node_sources(&kv).await?;
                    let source_id = action.source_id.unwrap_or_else(|| Uuid::new_v4().to_string());
                    let source_type = action.source_type.unwrap_or_else(|| "manual".to_string());
                    let source_url = action.source_url.and_then(|value| if value.trim().is_empty() { None } else { Some(value) });
                    let source_content = action.source_content.and_then(|value| if value.trim().is_empty() { None } else { Some(value) });
                    let label = action.source_label.unwrap_or_else(|| "未命名来源".to_string());
                    let enabled = action.enabled.unwrap_or(true);

                    let resolved_content = if let Some(content) = source_content.clone() {
                        content
                    } else if let Some(url) = source_url.clone() {
                        fetch_remote_text(&url).await.unwrap_or_default()
                    } else {
                        String::new()
                    };
                    let parsed_nodes = parse_nodes(&resolved_content);
                    let node_count = parsed_nodes.len();
                    let last_error = if node_count == 0 { Some("没有解析出可用节点".to_string()) } else { None };

                    let record = NodeSourceRecord {
                        id: source_id.clone(),
                        source_type,
                        label,
                        source_url,
                        source_content: Some(resolved_content.clone()),
                        enabled,
                        node_count,
                        last_error,
                        updated_at: Utc::now().to_rfc3339(),
                    };

                    if let Some(existing) = sources.iter_mut().find(|item| item.id == source_id) {
                        *existing = record;
                    } else {
                        sources.push(record);
                    }

                    let mut merged_nodes: Vec<ProxyNodeRecord> = Vec::new();
                    for source in sources.iter().filter(|item| item.enabled) {
                        let source_nodes = parse_nodes(source.source_content.as_deref().unwrap_or(""))
                            .into_iter()
                            .map(|mut node| {
                                node.source_id = Some(source.id.clone());
                                node.source_label = Some(source.label.clone());
                                node
                            });
                        merged_nodes.extend(source_nodes);
                    }

                    write_node_sources(&kv, &sources).await?;
                    write_proxy_nodes(&kv, &merged_nodes).await?;
                },
                "delete_node_source" => {
                    if let Some(source_id) = action.source_id {
                        let mut sources = read_node_sources(&kv).await?;
                        sources.retain(|item| item.id != source_id);
                        let mut merged_nodes: Vec<ProxyNodeRecord> = Vec::new();
                        for source in sources.iter().filter(|item| item.enabled) {
                            let source_nodes = parse_nodes(source.source_content.as_deref().unwrap_or(""))
                                .into_iter()
                                .map(|mut node| {
                                    node.source_id = Some(source.id.clone());
                                    node.source_label = Some(source.label.clone());
                                    node
                                });
                            merged_nodes.extend(source_nodes);
                        }
                        write_node_sources(&kv, &sources).await?;
                        write_proxy_nodes(&kv, &merged_nodes).await?;
                    }
                },
                _ => return utils::json_resp(json!({"ok": false, "msg": "未知管理操作"}), 400)
            }
            let node_sources = read_node_sources(&kv).await.unwrap_or_default();
            let proxy_nodes = read_proxy_nodes(&kv).await.unwrap_or_default();
            utils::json_resp(json!({"ok": true, "node_sources": node_sources, "proxy_nodes": proxy_nodes, "actor": user.username}), 200)
        })
        .get_async("/api/community/drive/info", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            db.prepare("INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, 0, 0) ON CONFLICT(user_id) DO NOTHING")
                .bind(&[user.id.clone().into()])?
                .run().await?;
            let stats = db.prepare("SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ?").bind(&[user.id.into()])?.first::<DriveStats>(None).await?.unwrap_or(DriveStats { quota_bytes: 0, used_bytes: 0 });
            utils::json_resp(json!({"ok": true, "stats": stats}), 200)
        })
        .get_async("/api/community/drive/list", |req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            let url = req.url()?;
            let parent_id = url.query_pairs().find(|(k, _)| k == "parent_id").map(|(_, v)| v.to_string());

            let mut sql = "SELECT * FROM drive_files WHERE user_id = ? ".to_string();
            let mut params = vec![user.id.into()];
            if let Some(pid) = parent_id {
                sql += " AND parent_id = ? ";
                params.push(pid.into());
            } else {
                sql += " AND parent_id IS NULL ";
            }
            sql += " ORDER BY is_folder DESC, created_at DESC";

            let mut files = db.prepare(&sql).bind(&params)?.all().await?.results::<DriveFile>()?;
            for file in files.iter_mut() {
                file.url = normalize_media_url(file.url.clone());
            }
            utils::json_resp(json!({"ok": true, "files": files}), 200)
        })
        .post_async("/api/community/drive/mkdir", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            let body: Value = req.json().await?;
            let name = body["name"].as_str().unwrap_or("新建文件夹");
            let parent_id = body["parent_id"].as_str();
            let id = Uuid::new_v4().to_string();

            db.prepare("INSERT INTO drive_files (id, user_id, name, parent_id, is_folder) VALUES (?, ?, ?, ?, 1)")
                .bind(&[id.clone().into(), user.id.into(), name.into(), parent_id.into()])?.run().await?;
            utils::json_resp(json!({"ok": true, "id": id}), 200)
        })
        .post_async("/api/community/drive/rename", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            let body: Value = req.json().await?;
            let id = body["id"].as_str().unwrap_or("");
            let name = body["name"].as_str().unwrap_or("");

            db.prepare("UPDATE drive_files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
                .bind(&[name.into(), id.into(), user.id.into()])?.run().await?;
            utils::json_resp(json!({"ok": true}), 200)
        })
        .post_async("/api/community/drive/delete", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            let body: Value = req.json().await?;
            let id = body["id"].as_str().unwrap_or("");

            db.prepare("DELETE FROM drive_files WHERE id = ? AND user_id = ?")
                .bind(&[id.into(), user.id.into()])?.run().await?;
            utils::json_resp(json!({"ok": true}), 200)
        })
        .post_async("/api/community/media/upload", |req, ctx| async move {
            handle_community_media_library_upload(req, ctx).await
        })
        .post_async("/api/community/drive/upload", |req, ctx| async move {
            handle_community_media_library_upload(req, ctx).await
        })
        .get_async("/api/community/link-preview", |req, _ctx| async move {
            let url = req.url()?;
            let target_url = url.query_pairs().find(|(k, _)| k == "url").map(|(_, v)| v.to_string()).unwrap_or_default();
            if target_url.is_empty() { return utils::json_resp(json!({"ok": false, "msg": "缺少链接"}), 400); }

            // Basic fallback preview
            let preview = json!({
                "url": target_url,
                "title": target_url.clone(),
                "description": "无法获取详细预览信息",
                "image": null,
                "siteName": null
            });

            // In a real worker, we would fetch and parse HTML here.
            // For now, we return a basic preview to ensure functionality is not "missing".
            utils::json_resp(json!({"ok": true, "preview": preview}), 200)
        })
        .post_async("/api/community/report", |mut req, ctx| async move {
            let db = ctx.env.d1("COMMUNITY_DB")?;
            let user = get_auth(&req, &db).await?;
            let user = match user {
                Some(u) => u,
                None => return utils::json_resp(json!({"ok": false}), 401)
            };
            let body: Value = req.json().await?;
            let target_type = body["target_type"].as_str().unwrap_or("");
            let target_id = body["target_id"].as_str().unwrap_or("");
            let reason = body["reason"].as_str();
            let reason_text = reason.unwrap_or("").trim();

            if !matches!(target_type, "post" | "comment" | "user") || target_id.trim().is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "invalid report target"}), 400);
            }
            if reason_text.is_empty() {
                return utils::json_resp(json!({"ok": false, "msg": "reason required"}), 400);
            }

            let target_exists = match target_type {
                "post" => db.prepare("SELECT 1 FROM posts WHERE id = ?").bind(&[target_id.into()])?.first::<Value>(None).await?,
                "comment" => db.prepare("SELECT 1 FROM comments WHERE id = ?").bind(&[target_id.into()])?.first::<Value>(None).await?,
                "user" => db.prepare("SELECT 1 FROM users WHERE id = ?").bind(&[target_id.into()])?.first::<Value>(None).await?,
                _ => None
            };
            if target_exists.is_none() {
                return utils::json_resp(json!({"ok": false, "msg": "target not found"}), 404);
            }

            let id = Uuid::new_v4().to_string();
            db.prepare("INSERT INTO reports (id, user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)")
                .bind(&[id.clone().into(), user.id.into(), target_type.into(), target_id.into(), reason_text.into()])?.run().await?;

            utils::json_resp(json!({"ok": true, "report_id": id, "msg": "report received"}), 200)
        })
        .post_async("/api/community/upload", |mut req, ctx| async move {
            let upload_started_ms = now_ms();
            let db = ctx.env.d1("COMMUNITY_DB")?;
            if get_auth(&req, &db).await?.is_none() {
                return utils::json_resp(json!({"ok": false}), 401);
            }

            let content_type_header = req.headers().get("Content-Type")?.unwrap_or_default();
            let is_multipart = content_type_header
                .to_ascii_lowercase()
                .starts_with("multipart/form-data");

            let mut detected_name = String::new();
            let mut detected_mime = String::new();
            let bytes = if is_multipart {
                let form = req.form_data().await?;
                let file = match form.get("file") {
                    Some(FormEntry::File(f)) => f,
                    _ => return utils::json_resp(json!({"ok": false, "msg": "未找到文件"}), 400)
                };
                detected_name = file.name();
                detected_mime = file.type_();
                file.bytes().await?
            } else {
                let raw = req.bytes().await?;
                if raw.is_empty() {
                    return utils::json_resp(json!({"ok": false, "msg": "未找到文件"}), 400);
                }
                raw
            };

            if detected_mime.is_empty() {
                detected_mime = content_type_header
                    .split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
            }
            if detected_mime.is_empty() {
                detected_mime = "application/octet-stream".to_string();
            }
            if detected_name.trim().is_empty() {
                detected_name = format!(
                    "upload-{}.{}",
                    Uuid::new_v4(),
                    infer_extension_from_mime(&detected_mime)
                );
            }

            let media_key = format!("media-{}.{}", Uuid::new_v4(), infer_extension_from_mime(&detected_mime));
            let byte_len = bytes.len();
            let r2_started_ms = now_ms();
            if let Err(err) = put_uploaded_media(&ctx.env, &media_key, &bytes, &detected_mime).await {
                return utils::json_resp(json!({
                    "ok": false,
                    "msg": "Media cache upload failed",
                    "error": format!("{}", err)
                }), 503);
            }
            let r2_ms = elapsed_ms(r2_started_ms);

            let drive_sync = if has_drive_auth_config(&ctx.env) {
                let archive_env = ctx.env.clone();
                let archive_key = media_key.clone();
                let archive_name = detected_name.clone();
                let archive_mime = detected_mime.clone();
                let archive_bytes = bytes.clone();
                ctx.data.wait_until(async move {
                    sync_media_to_drive_archive(
                        archive_env,
                        archive_key,
                        archive_bytes,
                        archive_name,
                        archive_mime,
                    )
                    .await;
                });
                "pending"
            } else {
                "disabled"
            };

            if drive_sync == "disabled" {
                write_drive_archive_status(&ctx.env, &media_key, "disabled", None, None).await;
            }

            utils::json_resp(json!({
                "ok": true,
                "fileId": media_key,
                "url": format!("/api/community/media/{}", media_key),
                "fromDrive": false,
                "driveSync": drive_sync,
                "timing": {
                    "r2Ms": r2_ms,
                    "totalMs": elapsed_ms(upload_started_ms)
                },
                "size": byte_len
            }), 200)
        })
        .get_async("/api/community/media/:key", |req, ctx| async move {
            let key = match ctx.param("key") {
                Some(v) => v.to_string(),
                None => return Response::error("Not Found", 404),
            };
            let cache = Cache::default();
            let mut cache_url = req.url()?;
            cache_url.set_query(None);
            let cache_key = cache_url.to_string();

            if let Some(mut cached_response) = cache.get(cache_key.as_str(), false).await? {
                update_cached_media_headers(&mut cached_response)?;
                return Ok(cached_response);
            }

            let bucket = ctx.env.bucket("COMMUNITY_R2")?;
            let obj = bucket.get(&key).execute().await?;
            match obj {
                Some(o) => {
                    let content_type = o
                        .http_metadata()
                        .content_type
                        .filter(|ct| !ct.trim().is_empty())
                        .unwrap_or_else(|| "application/octet-stream".to_string());
                    let headers = build_public_media_headers(&content_type, "MISS-R2")?;
                    let body = match o.body() {
                        Some(body) => body.response_body()?,
                        None => return Response::error("Not Found", 404),
                    };
                    let mut response = Response::from_body(body)?.with_headers(headers);
                    cache_public_media_response(&cache, &cache_key, &mut response).await;
                    Ok(response)
                },
                None => {
                    let db = ctx.env.d1("COMMUNITY_DB")?;
                    let mut candidate_ids: Vec<String> = Vec::new();

                    if let Some(id) = extract_media_file_id(&key) {
                        candidate_ids.push(id);
                    }

                    let mapping = db.prepare("SELECT url FROM drive_files WHERE id = ?")
                        .bind(&[key.clone().into()])?
                        .first::<Value>(None)
                        .await?;
                    if let Some(row) = mapping {
                        if let Some(raw_url) = row["url"].as_str() {
                            if let Some(mapped_id) = extract_media_file_id(raw_url) {
                                if !candidate_ids.iter().any(|v| v == &mapped_id) {
                                    candidate_ids.push(mapped_id);
                                }
                            }
                        }
                    }

                    if let Some(archived_id) = read_archived_drive_file_id(&ctx.env, &key).await? {
                        if !candidate_ids.iter().any(|v| v == &archived_id) {
                            candidate_ids.push(archived_id);
                        }
                    }

                    for drive_file_id in candidate_ids {
                        if let Ok(Some((bytes, content_type))) =
                            fetch_drive_media_bytes(&ctx.env, &drive_file_id).await
                        {
                            let _ = put_uploaded_media(&ctx.env, &key, &bytes, &content_type).await;
                            let mut response = build_public_media_response_from_bytes(
                                bytes,
                                &content_type,
                                "MISS-GDrive-REFILL",
                            )?;
                            cache_public_media_response(&cache, &cache_key, &mut response).await;
                            return Ok(response);
                        }
                    }

                    Response::error("Not Found", 404)
                }
            }
        })
        .get_async("/api/music", |_req, ctx| async move {
            let bucket = ctx.env.bucket("MUSIC_BUCKET")?;
            let objects = bucket.list().execute().await?;
            let mut list = Vec::new();
            for obj in objects.objects() {
                let key = obj.key();
                if is_supported_music_key(&key) {
                    list.push(build_music_track_payload(&key));
                }
            }
            utils::json_resp(json!({
                "ok": true,
                "list": list,
                "playlist": list.clone()
            }), 200)
        })
        .get_async("/api/music/file/:key", |req, ctx| async move {
            let raw_key = ctx.param("key").unwrap().to_string();
            let decoded_key = decode_url_component_if_needed(&raw_key);
            let mut candidate_keys = vec![raw_key.clone()];
            if decoded_key != raw_key {
                candidate_keys.push(decoded_key);
            }
            let requested_range = req.headers().get("Range")?;

            let bucket = ctx.env.bucket("MUSIC_BUCKET")?;

            for key in candidate_keys {
                let Some(head) = bucket.head(key.clone()).await? else {
                    continue;
                };

                let size = head.size();
                let content_type = effective_music_content_type(&key, head.http_metadata().content_type);

                match parse_music_range_header(requested_range.clone(), size) {
                    MusicRangeRequest::Unsatisfiable => {
                        return music_range_not_satisfiable_response(size);
                    }
                    MusicRangeRequest::Full => {
                        let Some(o) = bucket.get(key.clone()).execute().await? else {
                            continue;
                        };
                        let Some(body) = o.body() else {
                            continue;
                        };
                        let headers = build_music_file_headers(&content_type, size, None)?;
                        return Ok(Response::from_body(body.response_body()?)?.with_headers(headers));
                    }
                    MusicRangeRequest::Partial(range) => {
                        let Some(o) = bucket
                            .get(key.clone())
                            .range(range.r2_range.clone())
                            .execute()
                            .await?
                        else {
                            continue;
                        };
                        let Some(body) = o.body() else {
                            continue;
                        };
                        let headers = build_music_file_headers(&content_type, size, Some(&range))?;
                        return Ok(Response::from_body(body.response_body()?)?
                            .with_status(206)
                            .with_headers(headers));
                    }
                }
            }

            Response::error("Not Found", 404)
        })
        .post_async("/api/proxy-gemini", |mut req, ctx| async move {
            let body = req.text().await?;
            let api_key = ctx.env.var("GEMINI_API_KEY")?.to_string();
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={}", api_key);

            let headers = Headers::new();
            headers.set("Content-Type", "application/json")?;

            let mut init = RequestInit::new();
            init.with_method(Method::Post);
            init.with_headers(headers);
            init.with_body(Some(body.into()));
            let req = Request::new_with_init(&url, &init)?;

            Fetch::Request(req).send().await
        })
        .get_async("/api/nodes", |req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            let url = req.url()?;
            let password = url.query_pairs().find(|(k, _)| k == "pwd").map(|(_, v)| v.to_string()).unwrap_or_default();
            if !verify_node_password(&kv, &password).await? {
                return utils::json_resp(json!({"ok": false, "msg": "无权访问"}), 401);
            }

            let nodes = read_proxy_nodes(&kv).await?;
            let sources = read_node_sources(&kv).await?;
            let subscription_url = format!("/api/nodes/subscription?pwd={}", url::form_urlencoded::byte_serialize(password.as_bytes()).collect::<String>());
            let raw_bundle = nodes.iter().map(|node| node.raw.clone()).collect::<Vec<_>>().join("\n");

            utils::json_resp(json!({
                "ok": true,
                "nodes": nodes,
                "sources": sources,
                "subscription_url": subscription_url,
                "raw": raw_bundle,
                "clients": build_client_launch_links(&subscription_url)
            }), 200)
        })
        .get_async("/api/nodes/subscription", |req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            let url = req.url()?;
            let password = url.query_pairs().find(|(k, _)| k == "pwd").map(|(_, v)| v.to_string()).unwrap_or_default();
            if !verify_node_password(&kv, &password).await? {
                return utils::json_resp(json!({"ok": false, "msg": "无权访问"}), 401);
            }

            let nodes = read_proxy_nodes(&kv).await?;
            let body = nodes.into_iter().map(|node| node.raw).collect::<Vec<_>>().join("\n");
            let mut response = Response::ok(body)?;
            response.headers_mut().set("Content-Type", "text/plain;charset=UTF-8")?;
            response.headers_mut().set("Access-Control-Allow-Origin", "*")?;
            Ok(response)
        })
        .post_async("/api/nodes", |mut req, ctx| async move {
            let kv = ctx.env.kv("SCHEDULE_KV")?;
            let body: Value = req.json().await?;
            let admin_user = body["adminUser"].as_str().unwrap_or("");
            let admin_pass = body["adminPass"].as_str().unwrap_or("");
            if !verify_node_admin(&kv, admin_user, admin_pass).await? {
                return utils::json_resp(json!({"ok": false, "msg": "认证失败"}), 401);
            }

            match body["action"].as_str().unwrap_or("") {
                "getNodes" => {
                    let nodes = read_proxy_nodes(&kv).await?;
                    let sources = read_node_sources(&kv).await?;
                    let password_configured = !read_node_password_hash(&kv).await?.is_empty();
                    utils::json_resp(json!({"ok": true, "nodes": nodes, "sources": sources, "password_configured": password_configured}), 200)
                },
                "clearNodes" => {
                    write_proxy_nodes(&kv, &[]).await?;
                    utils::json_resp(json!({"ok": true}), 200)
                },
                "setPassword" => {
                    let next_password = body["password"].as_str().unwrap_or("");
                    kv.put("proxy_nodes_password_hash", utils::sha256_hex(next_password))?.execute().await?;
                    kv.put("nodes_user_pwd", next_password)?.execute().await?;
                    utils::json_resp(json!({"ok": true}), 200)
                },
                "importText" => {
                    let label = body["label"].as_str().unwrap_or("手工导入").to_string();
                    let source_content = body["content"].as_str().unwrap_or("").to_string();
                    let mut sources = read_node_sources(&kv).await?;
                    let source = NodeSourceRecord {
                        id: Uuid::new_v4().to_string(),
                        source_type: "manual".to_string(),
                        label,
                        source_url: None,
                        source_content: Some(source_content.clone()),
                        enabled: true,
                        node_count: parse_nodes(&source_content).len(),
                        last_error: None,
                        updated_at: Utc::now().to_rfc3339(),
                    };
                    sources.push(source.clone());
                    let mut nodes = read_proxy_nodes(&kv).await?;
                    for mut node in parse_nodes(&source_content) {
                        node.source_id = Some(source.id.clone());
                        node.source_label = Some(source.label.clone());
                        nodes.push(node);
                    }
                    write_node_sources(&kv, &sources).await?;
                    write_proxy_nodes(&kv, &nodes).await?;
                    utils::json_resp(json!({"ok": true, "source": source, "nodes": nodes}), 200)
                },
                _ => utils::json_resp(json!({"ok": false, "msg": "未知操作"}), 400)
            }
        })
        .run(req, env).await
}
