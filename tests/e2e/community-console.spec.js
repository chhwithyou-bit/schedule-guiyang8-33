const { test, expect } = require('@playwright/test');

let appState;

function buildState() {
  return {
    profile: {
      id: 'debug-user',
      username: 'debugger',
      avatar_url: '',
      background_url: '',
      signature: 'before save',
      level: 9,
      xp: 999,
      role: 'owner',
      followers_count: 4,
      following_count: 7
    },
    personalPosts: [
      {
        id: 'own-post-1',
        user_id: 'debug-user',
        username: 'debugger',
        avatar_url: '',
        background_url: '',
        signature: 'before save',
        role: 'owner',
        content: 'Own post from personal surface',
        media_json: '[]',
        like_count: 0,
        comment_count: 0,
        created_at: '2026-03-31T11:20:00.000Z'
      }
    ],
    conversations: [
      {
        id: 'group-general',
        kind: 'group',
        title: 'General Lounge',
        description: 'Default testing group',
        member_count: 4,
        avatar_url: '',
        unread_count: 1,
        last_message: 'Welcome back',
        last_sender_name: 'System',
        last_message_at: '2026-03-31T11:30:00.000Z',
        updated_at: '2026-03-31T11:30:00.000Z'
      }
    ],
    messages: {
      'group-general': [
        {
          id: 'msg-1',
          conversation_id: 'group-general',
          sender_id: 'system',
          content: 'Welcome back',
          created_at: '2026-03-31T11:30:00.000Z',
          sender: { username: 'System' }
        }
      ]
    },
    notifications: [
      { id: 'n-1', type: 'message', username: 'Alice', created_at: '2026-03-31T11:40:00.000Z' }
    ],
    savedProfile: null
  };
}

async function dismissThemePicker(page) {
  try {
    const button = page.locator('button[data-theme-id="theme-default"]');
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      await page.waitForTimeout(1200);
    }
  } catch {}
}

async function bootApp(page) {
  await page.goto('/');
  await dismissThemePicker(page);
  await expect(page.locator('#liquidBar')).toBeVisible();
}

async function openPersonalView(page) {
  await bootApp(page);
  await page.locator('header .header-avatar-shell').click();
  await expect(page.locator('.personal-shell')).toBeVisible();
}

async function openMessagesSection(page) {
  await bootApp(page);
  await page.locator('.community-pill').nth(2).click();
  await expect(page.locator('.console-tab-card')).toHaveCount(2);
}

test.beforeEach(async ({ page }) => {
  appState = buildState();

  await page.addInitScript((user) => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    passHash: 'playwright-session',
    role: 'owner',
    xp: 999,
    level: 9,
    signature: 'before save'
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/discovery') return fulfill({ ok: true, users: [], groups: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });

    if (pathname === '/api/community/posts' && req.method() === 'GET') {
      const userId = url.searchParams.get('userId');
      if (userId === 'debug-user') {
        return fulfill({ ok: true, posts: appState.personalPosts });
      }
      return fulfill({ ok: true, posts: [] });
    }

    if (pathname === '/api/community/profile' && req.method() === 'GET') {
      return fulfill({ ok: true, user: appState.profile });
    }

    if (pathname === '/api/community/profile' && req.method() === 'POST') {
      appState.savedProfile = req.postDataJSON();
      appState.profile = { ...appState.profile, ...appState.savedProfile };
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/chats' && req.method() === 'GET') {
      return fulfill({ ok: true, conversations: appState.conversations, unread_total: 1 });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'GET') {
      const conversationId = url.searchParams.get('conversation_id');
      return fulfill({ ok: true, messages: appState.messages[conversationId] || [] });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const message = {
        id: `msg-${Date.now()}`,
        conversation_id: payload.conversation_id,
        sender_id: 'debug-user',
        content: payload.content,
        created_at: '2026-03-31T11:45:00.000Z',
        sender: { username: 'debugger' }
      };
      appState.messages[payload.conversation_id] = [...(appState.messages[payload.conversation_id] || []), message];
      appState.conversations[0] = {
        ...appState.conversations[0],
        last_message: payload.content,
        last_sender_name: 'debugger',
        unread_count: 0
      };
      return fulfill({ ok: true, message });
    }

    if (pathname === '/api/community/notifications') {
      return fulfill({ ok: true, notifications: appState.notifications });
    }

    return fulfill({ ok: true, users: [], groups: [], posts: [], messages: [], conversations: [], unread_total: 0 });
  });
});

test('personal view exposes the account editor and the user post list', async ({ page }) => {
  await openPersonalView(page);

  await expect(page.getByRole('heading', { name: 'debugger' }).first()).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Own post from personal surface' })).toBeVisible();

  const signatureInput = page.locator('.console-panel textarea').first();
  await expect(signatureInput).toHaveValue('before save');
});

test('community messages and notifications stay reachable in the embedded surfaces', async ({ page }) => {
  await openMessagesSection(page);

  await expect(page.locator('.console-list-row').first()).toContainText('General Lounge');
  await page.locator('.console-list-row').first().click();

  const messageInput = page.locator('.console-panel input[type="text"]').last();
  await messageInput.fill('console smoke test');
  await messageInput.press('Enter');
  await expect(page.locator('article').filter({ hasText: 'console smoke test' }).last()).toBeVisible();

  await page.locator('.console-tab-card').nth(1).click();
  await expect(page.locator('article').filter({ hasText: 'General Lounge' }).first()).toBeVisible();

  await page.locator('#liquidBar .liquid-trigger').click();
  await page.locator('#liquidBar [data-liquid-target="notifications"]').click();
  await expect(page.locator('article').filter({ hasText: 'Alice' }).first()).toBeVisible();
});

test('mobile personal view keeps the account editor reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPersonalView(page);

  const heading = page.getByRole('heading', { name: 'debugger' }).first();
  await expect(heading).toBeVisible();

  const signatureInput = page.locator('.console-panel textarea').first();
  await signatureInput.scrollIntoViewIfNeeded();
  await expect(signatureInput).toBeVisible();

  const ownPost = page.locator('article').filter({ hasText: 'Own post from personal surface' }).first();
  await ownPost.scrollIntoViewIfNeeded();
  await expect(ownPost).toBeVisible();
});
