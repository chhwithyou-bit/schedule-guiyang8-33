<svelte:head>
  <title>帖子详情 · Schedule Guiyang</title>
</svelte:head>

<script lang="ts">
  import { communityFetch, readStoredCommunitySession } from '$lib/api/communityAuth';
  import { profileHref } from '$lib/state/communityRouteState';

  type CommentItem = {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string | null;
    content: string;
    created_at: string;
  };

  type PostItem = {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string | null;
    role?: string;
    content: string;
    media_json: string;
    created_at: string;
    like_count?: number;
    comment_count?: number;
    viewer_liked?: boolean;
  };

  export let data:
    | {
        id?: string;
        post?: PostItem | null;
        comments?: CommentItem[];
      }
    | undefined;

  let post = data?.post || null;
  let comments = Array.isArray(data?.comments) ? data.comments : [];
  let newComment = '';
  let reportReason = '';
  let submittingComment = false;
  let submittingReport = false;
  let likePending = false;
  let feedback = '';

  function isAuthenticated() {
    return Boolean(readStoredCommunitySession());
  }

  function formatDate(value: string) {
    if (!value) return '';
    return new Date(value).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function safeMedia(json: string) {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is { url: string } => Boolean(item && typeof item.url === 'string' && item.url.trim()))
        : [];
    } catch {
      return [];
    }
  }

  async function refreshComments() {
    if (!post?.id) return;

    try {
      const response = await communityFetch(`/api/community/comments?postId=${encodeURIComponent(post.id)}`);
      const payload = await response.json();
      comments = payload?.ok && Array.isArray(payload.comments) ? payload.comments : [];
      if (post) {
        post = {
          ...post,
          comment_count: comments.length
        };
      }
    } catch {
      comments = comments;
    }
  }

  async function toggleLike() {
    if (!post?.id) return;
    if (!isAuthenticated()) {
      feedback = '先登录，再点赞。';
      return;
    }
    if (likePending) return;

    likePending = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        feedback = payload?.msg || '点赞失败。';
        return;
      }

      const liked = payload.action === 'liked';
      post = {
        ...post,
        viewer_liked: liked,
        like_count: Math.max(0, Number(post.like_count || 0) + (liked ? 1 : -1))
      };
    } catch {
      feedback = '点赞失败。';
    } finally {
      likePending = false;
    }
  }

  async function submitComment() {
    if (!post?.id) return;
    if (!isAuthenticated()) {
      feedback = '先登录，再评论。';
      return;
    }

    const content = newComment.trim();
    if (!content) {
      feedback = '写点内容再发。';
      return;
    }

    submittingComment = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          content
        })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        feedback = payload?.msg || '评论没有发出去。';
        return;
      }

      newComment = '';
      await refreshComments();
      feedback = '评论已发布。';
    } catch {
      feedback = '评论没有发出去。';
    } finally {
      submittingComment = false;
    }
  }

  async function submitReport() {
    if (!post?.id) return;
    if (!isAuthenticated()) {
      feedback = '先登录，再举报。';
      return;
    }

    const reason = reportReason.trim();
    if (!reason) {
      feedback = '请写清楚举报原因。';
      return;
    }

    submittingReport = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'post',
          target_id: post.id,
          reason
        })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        feedback = payload?.msg || '举报没有提交成功。';
        return;
      }

      reportReason = '';
      feedback = '举报已提交。';
    } catch {
      feedback = '举报没有提交成功。';
    } finally {
      submittingReport = false;
    }
  }
</script>

{#if post}
  <section class="post-detail-page space-y-6">
    <section class="route-shell post-detail-shell" aria-label="帖子详情">
      <div class="post-detail-head">
        <div>
          <p class="route-kicker">Post detail</p>
          <h1>这条内容</h1>
          <div class="post-detail-meta">
            <a href={profileHref(post.user_id)}>{post.username}</a>
            <span>{formatDate(post.created_at)}</span>
            {#if post.role === 'admin' || post.role === 'owner'}
              <span class="post-detail-badge">{post.role === 'owner' ? '站长' : '管理员'}</span>
            {/if}
          </div>
        </div>
        <a href="/community">返回社区</a>
      </div>

      <div class="post-detail-content">
        <p>{post.content || '这条动态没有文字内容。'}</p>
      </div>

      {#if safeMedia(post.media_json).length > 0}
        <div class="post-detail-media">
          {#each safeMedia(post.media_json) as item, index}
            <div class="post-detail-media__item">
              <img src={item.url} alt={`帖子图片 ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} />
            </div>
          {/each}
        </div>
      {/if}

      <div class="post-detail-actions">
        <button type="button" class:active={Boolean(post.viewer_liked)} on:click={toggleLike} disabled={likePending}>
          ♥ {post.like_count || 0}
        </button>
        <a href="#comments">评论 {post.comment_count || comments.length}</a>
      </div>
    </section>

    <section class="route-shell comment-shell" id="comments" aria-label="评论区">
      <div class="comment-shell__head">
        <div>
          <p class="route-kicker">Comments</p>
          <h2>留言</h2>
        </div>
        <span>{comments.length} 条</span>
      </div>

      <div class="comment-composer">
        <textarea bind:value={newComment} rows="4" placeholder="想回一句什么，就写在这里。"></textarea>
        <div class="comment-composer__footer">
          <p>{feedback}</p>
          <button type="button" on:click={submitComment} disabled={submittingComment || !newComment.trim()}>
            {submittingComment ? '发布中…' : '发布评论'}
          </button>
        </div>
      </div>

      {#if comments.length > 0}
        <div class="comment-list">
          {#each comments as comment}
            <article class="comment-card">
              <a class="comment-card__avatar" href={profileHref(comment.user_id)} aria-label={`打开 ${comment.username} 的主页`}>
                {#if comment.avatar_url}
                  <img src={comment.avatar_url} alt={comment.username} loading="lazy" />
                {:else}
                  <span>{comment.username?.slice(0, 1).toUpperCase() || '?'}</span>
                {/if}
              </a>
              <div class="comment-card__body">
                <div class="comment-card__meta">
                  <a href={profileHref(comment.user_id)}>{comment.username}</a>
                  <span>{formatDate(comment.created_at)}</span>
                </div>
                <p>{comment.content}</p>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="comment-empty">还没人留言。</p>
      {/if}
    </section>

    <section class="route-shell report-shell" aria-label="举报面板">
      <div>
        <p class="route-kicker">Report</p>
        <h2>举报这条内容</h2>
      </div>
      <textarea bind:value={reportReason} rows="4" placeholder="例如：辱骂、人身攻击、恶意广告、盗图。"></textarea>
      <div class="comment-composer__footer">
        <p>举报会附带当前帖子 id 和你的账号信息。</p>
        <button type="button" on:click={submitReport} disabled={submittingReport || !reportReason.trim()}>
          {submittingReport ? '提交中…' : '提交举报'}
        </button>
      </div>
    </section>
  </section>
{:else}
  <section class="route-shell" aria-label="帖子详情不可用">
    <p class="route-kicker">Post detail</p>
    <h1>这条内容暂时不可用</h1>
    <p>帖子可能已经删除，或者当前接口还没有同步到这条数据。</p>
  </section>
{/if}

<style>
  .post-detail-page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .post-detail-shell,
  .comment-shell,
  .report-shell,
  .comment-card,
  .comment-composer textarea,
  .report-shell textarea,
  .post-detail-content,
  .post-detail-media__item {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .post-detail-head,
  .post-detail-meta,
  .post-detail-actions,
  .comment-shell__head,
  .comment-composer__footer,
  .comment-card,
  .comment-card__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .post-detail-head h1,
  .comment-shell h2,
  .report-shell h2 {
    margin: 0.4rem 0 0;
    font-size: clamp(1.6rem, 4vw, 2.5rem);
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .post-detail-meta,
  .comment-shell__head span,
  .comment-composer__footer p,
  .comment-card__meta span {
    opacity: 0.62;
  }

  .post-detail-badge {
    border-radius: 999px;
    background: rgba(var(--glow-primary-rgb), 0.22);
    padding: 0.2rem 0.55rem;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .post-detail-head > a,
  .post-detail-actions a,
  .post-detail-actions button,
  .comment-composer__footer button {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    min-height: 2.7rem;
    padding: 0.75rem 1rem;
    text-transform: uppercase;
    transition: transform 0.18s ease, border-color 0.18s ease;
  }

  .post-detail-head > a:hover,
  .post-detail-actions a:hover,
  .post-detail-actions button:hover,
  .comment-composer__footer button:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
  }

  .post-detail-actions button.active {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.28);
  }

  .post-detail-content,
  .comment-composer textarea,
  .report-shell textarea,
  .comment-card {
    border-radius: 1.5rem;
    padding: 1rem;
  }

  .post-detail-content {
    margin-top: 1.25rem;
  }

  .post-detail-content p,
  .comment-card__body p {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.75;
    opacity: 0.9;
  }

  .post-detail-media {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    margin-top: 1.25rem;
  }

  .post-detail-media__item {
    overflow: hidden;
    border-radius: 1.4rem;
    aspect-ratio: 4 / 3;
  }

  .post-detail-media__item img,
  .comment-card__avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .post-detail-actions {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .comment-composer,
  .comment-list {
    margin-top: 1rem;
  }

  .comment-composer textarea,
  .report-shell textarea {
    width: 100%;
    resize: vertical;
    color: inherit;
    outline: none;
  }

  .comment-composer textarea:focus,
  .report-shell textarea:focus {
    border-color: rgba(var(--glow-primary-rgb), 0.32);
    box-shadow: 0 0 0 2px rgba(var(--glow-primary-rgb), 0.14);
  }

  .comment-composer__footer {
    margin-top: 0.85rem;
  }

  .comment-list {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .comment-card {
    gap: 1rem;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .comment-card__avatar {
    display: inline-flex;
    width: 2.75rem;
    height: 2.75rem;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    font-weight: 900;
    color: var(--color-primary);
  }

  .comment-card__body {
    min-width: 0;
    flex: 1;
  }

  .comment-card__meta {
    justify-content: flex-start;
  }

  .comment-card__meta a {
    font-weight: 900;
  }

  .comment-empty {
    margin: 1rem 0 0;
    opacity: 0.62;
  }

  .report-shell textarea {
    margin-top: 1rem;
  }

  @media (max-width: 768px) {
    .post-detail-head,
    .post-detail-actions,
    .comment-shell__head,
    .comment-composer__footer {
      align-items: stretch;
    }

    .post-detail-head > a,
    .post-detail-actions > *,
    .comment-composer__footer > * {
      width: 100%;
      text-align: center;
      justify-content: center;
    }
  }
</style>
