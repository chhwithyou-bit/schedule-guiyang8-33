const { test, expect } = require('@playwright/test');

function buildDiscoveryState() {
  return {
    directUser: {
      id: 'user-alice',
      username: 'Alice',
      signature: '夜间联调搭子',
      avatar_url: '',
      role: 'user',
      xp: 220
    },
    group: {
      id: 'group-night-sprint',
      title: 'Night Sprint',
      description: '深夜修交互和动画的协作群',
      member_count: 6,
      joined: false
    },
    conversations: [
      {
        id: 'group-general',
        kind: 'group',
        title: 'General Lounge',
        description: '默认测试群组',
        member_count: 4,
        avatar_url: '',
        unread_count: 1,
        last_message: '欢迎进入联调环境',
        last_sender_name: 'System',
        last_message_at: '2026-03-28T10:30:00.000Z',
        updated_at: '2026-03-28T10:30:00.000Z'
      }
    ],
    messages: {
      'group-general': [
        {
          id: 'msg-g-1',
          sender_id: 'system',
          sender: { username: 'System' },
          content: '欢迎进入联调环境',
          created_at: '2026-03-28T10:30:00.000Z'
        }
      ]
    }
  };
}

function installApiMocks(page, state) {
  const getUnreadTotal = () => state.conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);

  const ensureConversation = (conversation) => {
    const index = state.conversations.findIndex(item => item.id === conversation.id);
    if (index >= 0) {
      state.conversations[index] = { ...state.conversations[index], ...conversation };
      return state.conversations[index];
    }
    state.conversations.unshift(conversation);
    return conversation;
  };

  return page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/chats' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        conversations: state.conversations,
        unread_total: getUnreadTotal()
      });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'GET') {
      const conversationId = url.searchParams.get('conversation_id') || '';
      return fulfill({ ok: true, messages: state.messages[conversationId] || [] });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const conversationId = payload.conversation_id;
      const content = String(payload.content || '').trim();
      const message = {
        id: `msg-${conversationId}-${(state.messages[conversationId] || []).length + 1}`,
        sender_id: 'debug-user',
        sender: { username: 'debugger' },
        content,
        created_at: '2026-03-28T11:20:00.000Z'
      };
      state.messages[conversationId] = [...(state.messages[conversationId] || []), message];
      const target = state.conversations.find(item => item.id === conversationId);
      if (target) {
        target.last_message = content;
        target.last_sender_name = 'debugger';
        target.last_message_at = message.created_at;
        target.updated_at = message.created_at;
        target.unread_count = 0;
      }
      return fulfill({ ok: true, message });
    }

    if (pathname === '/api/community/chats/direct' && req.method() === 'POST') {
      const conversation = ensureConversation({
        id: 'dm-alice',
        kind: 'direct',
        title: state.directUser.username,
        description: state.directUser.signature,
        avatar_url: state.directUser.avatar_url,
        unread_count: 0,
        last_message: '',
        last_sender_name: '',
        last_message_at: '2026-03-28T11:00:00.000Z',
        updated_at: '2026-03-28T11:00:00.000Z'
      });
      state.messages['dm-alice'] = state.messages['dm-alice'] || [];
      return fulfill({ ok: true, conversation });
    }

    if (pathname === '/api/community/discovery' && req.method() === 'GET') {
      const users = [state.directUser].filter(user => {
        if (!query) return true;
        return [user.username, user.signature].some(value => String(value || '').toLowerCase().includes(query));
      });
      const groups = [state.group].filter(group => {
        if (!query) return true;
        return [group.title, group.description].some(value => String(value || '').toLowerCase().includes(query));
      });
      return fulfill({ ok: true, users, groups });
    }

    if (pathname === '/api/community/groups/join' && req.method() === 'POST') {
      state.group.joined = true;
      ensureConversation({
        id: state.group.id,
        kind: 'group',
        title: state.group.title,
        description: state.group.description,
        member_count: state.group.member_count,
        avatar_url: '',
        unread_count: 0,
        last_message: '',
        last_sender_name: '',
        last_message_at: '2026-03-28T11:05:00.000Z',
        updated_at: '2026-03-28T11:05:00.000Z'
      });
      state.messages[state.group.id] = state.messages[state.group.id] || [];
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/groups' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const conversationId = 'group-created-debug';
      ensureConversation({
        id: conversationId,
        kind: 'group',
        title: String(payload.title || '未命名群组'),
        description: String(payload.description || ''),
        member_count: Number(payload.member_ids?.length || 0) + 1,
        avatar_url: '',
        unread_count: 0,
        last_message: '',
        last_sender_name: '',
        last_message_at: '2026-03-28T11:10:00.000Z',
        updated_at: '2026-03-28T11:10:00.000Z'
      });
      state.messages[conversationId] = [];
      return fulfill({ ok: true, conversation_id: conversationId });
    }

    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/notifies') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/schedule') return fulfill({ ok: true, days: [] });

    return fulfill({ ok: true, users: [], groups: [], posts: [], messages: [], conversations: [], unread_total: 0 });
  });
}

test.beforeEach(async ({ page }) => {
  const state = buildDiscoveryState();
  await page.addInitScript(user => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    passHash: 'playwright-session',
    role: 'owner',
    xp: 999
  });
  await installApiMocks(page, state);
});

test('liquid bar compacts cleanly and keeps chat actions attached to the bottom rail', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.waitForSelector('#liquidBar');
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    window.__underlayClicks = 0;

    const probe = document.createElement('button');
    probe.id = 'underlay-probe';
    probe.textContent = 'probe';
    probe.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:0',
      'transform:translateX(-50%)',
      'width:520px',
      'height:120px',
      'border:none',
      'background:rgba(255,0,0,0.12)',
      'z-index:1'
    ].join(';');
    probe.addEventListener('click', () => { window.__underlayClicks += 1; });
    document.body.appendChild(probe);

    const activePage = document.querySelector('.page.active');
    if (activePage && !document.getElementById('debug-scroll-spacer')) {
      const spacer = document.createElement('div');
      spacer.id = 'debug-scroll-spacer';
      spacer.style.height = '1800px';
      spacer.style.pointerEvents = 'none';
      activePage.appendChild(spacer);
    }
  });

  await page.screenshot({ path: testInfo.outputPath('liquid-expanded.png') });

  const barBox = await page.locator('#liquidBar').boundingBox();
  await page.mouse.click(barBox.x + (barBox.width / 2), barBox.y + (barBox.height / 2));
  await expect.poll(() => page.evaluate(() => window.__underlayClicks)).toBe(0);

  await page.locator('.page.active').evaluate(node => { node.scrollTop = 520; });
  await page.waitForTimeout(1200);
  await expect(page.locator('#liquidBar')).toHaveClass(/compact/);
  await page.screenshot({ path: testInfo.outputPath('liquid-compact.png') });

  await page.locator('#liquidBar').click();
  await expect(page.locator('#liquidBar')).not.toHaveClass(/compact/);

  await page.locator('#liquidSearchBtn').click();
  await expect(page.locator('#liquidSurface')).toHaveClass(/open/);
  await expect(page.locator('#liquidSearchInput')).toBeVisible();
  await page.locator('#liquidSearchInput').fill('Alice');
  await page.waitForTimeout(500);
  await expect(page.locator('#liquidUserResults')).toContainText('Alice');
  await page.getByRole('button', { name: '开始私聊' }).click();
  await page.waitForTimeout(900);
  await expect(page.locator('#liquidSurface')).toHaveClass(/open/);
  await expect(page.locator('#liquidBar')).toHaveClass(/mode-messages/);
  await expect(page.locator('#liquidCenterTitle')).toContainText('Alice');
  await expect(page.locator('#liquidThreadComposerInput')).toBeVisible();
  await expect(page.locator('#liquidThreadComposeMeta')).toContainText('Alice');

  await page.screenshot({ path: testInfo.outputPath('liquid-dm.png') });

  await page.locator('#liquidThreadComposerInput').fill('浏览器联调消息');
  await page.locator('#liquidThreadSendBtn').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#liquidThreadBody')).toContainText('浏览器联调消息');

  await page.locator('.liquid-surface-close').click({ force: true });
  await expect(page.locator('#liquidSurface')).not.toHaveClass(/open/);
  await page.locator('#liquidSearchBtn').click();
  await page.locator('#liquidSearchInput').fill('Night');
  await page.waitForTimeout(500);
  await expect(page.locator('#liquidGroupResults')).toContainText('Night Sprint');
  await page.getByRole('button', { name: '加入并进入' }).click();
  await page.waitForTimeout(900);
  await expect(page.locator('#liquidSurface')).toHaveClass(/open/);
  await expect(page.locator('#liquidCenterTitle')).toContainText('Night Sprint');
  await expect(page.locator('#liquidThreadHead')).toContainText('Night Sprint');

  await page.screenshot({ path: testInfo.outputPath('liquid-group.png') });
});

test.describe('mobile liquid bar', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true
  });

  test('touching the compact bar during ongoing scroll expands it and keeps it open', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#liquidBar');
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      const activePage = document.querySelector('.page.active');
      if (activePage && !document.getElementById('debug-scroll-spacer-mobile')) {
        const spacer = document.createElement('div');
        spacer.id = 'debug-scroll-spacer-mobile';
        spacer.style.height = '1800px';
        spacer.style.pointerEvents = 'none';
        activePage.appendChild(spacer);
      }
    });

    await page.locator('.page.active').evaluate(node => { node.scrollTop = 520; });
    await page.waitForTimeout(500);
    await expect(page.locator('#liquidBar')).toHaveClass(/compact/);

    const barBox = await page.locator('#liquidBar').boundingBox();
    await page.touchscreen.tap(barBox.x + (barBox.width / 2), barBox.y + (barBox.height / 2));
    await page.locator('.page.active').evaluate(node => { node.scrollTop = 660; });
    await page.waitForTimeout(150);

    await expect(page.locator('#liquidBar')).not.toHaveClass(/compact/);
  });
});
