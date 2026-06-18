# 交接：8Community 前端 Claude 风格重设计

> 给接手者（Codex CLI）。目标：把现有 Svelte 前端**彻底重写**为 Claude/Anthropic 风格。
> 用户核心要求三条：**功能完整、排版好看、动效丝滑**。设计基调：**简洁、少字、多留白**。

---

## 1. 设计系统（已定稿，严格遵守）

锚点 = Anthropic/Claude 官方品牌语言（暖白纸感 + 陶土橙 editorial）。

```
配色
  --paper      #F0EEE6   纸感暖白底（主背景）
  --surface    #FAF9F5   卡片面
  --ink        #191919   主文字
  --ink-soft   #6B6862   次级文字暖灰
  --clay       #CC785C   主强调（按钮/链接/active）
  --clay-light #D4A27F   辅助暖色（hover/光晕/标签）
  --hairline   #E3DFD3   1px 极淡描边
  --hairline-strong #D8D3C5

字体（原型用免费近似，落地保持一致；若有授权可换官方 Styrene/Tiempos）
  标题  Space Grotesk（类 Styrene 几何无衬线）
  正文  Newsreader（类 Tiempos 衬线）

间距   8px 基准网格：8 / 16 / 24 / 40 / 64 / 96，editorial 大留白
圆角   卡片 12px，按钮 8px，头像圆；不要超大圆角
分层   不用阴影/玻璃拟态，用 1px 暖灰细线 + 极淡阴影做纸面分层
签名   Anthropic 标志性的 `/` 斜杠用在 logo/分隔/按钮收尾
```

**禁止**：紫粉渐变、emoji 当图标、左边框强调卡片、Inter/Roboto、深色玻璃拟态。

---

## 2. 已完成的设计原型（视觉真相来源）

`design-prototypes/` 下 4 个单文件 HTML，**已经用户确认方向通过**。重写时以它们为像素级参照：

| 文件 | 页面 |
|---|---|
| `community-feed-v0.html` | 社区信息流主页（4 分区 / 发帖入口 / 帖子流 / 右栏公告） |
| `profile-v0.html` | 个人主页（资料头 + 数据条 + XP 细线 + 帖子/收藏/网盘 tab） |
| `post-detail-v0.html` | 帖子详情（阅读级大字主帖 + 嵌套评论 + 输入框） |
| `auth-v0.html` | 登录/注册弹窗 |

直接在浏览器打开看。所有 CSS token、组件细节都在里面。

---

## 3. 原型还没画、但必须实现的页面/组件

以同一套设计系统补齐（参照后端 API 第 5 节）：

- **发现页** — 搜索用户（`/api/community/discovery`）
- **通知页** — 互动提醒（`/api/community/notifications`），类型：like/repost/comment/reply/comment_like
- **发帖弹窗** — 写帖 + 传图（`/api/community/posts` + `/api/community/media/upload`）
- **网盘** — 列表/上传/建文件夹/重命名/删除（`/api/community/drive/*`），含配额显示
- **管理后台** — 举报处理、封禁、公告编辑（`/api/community/admin/*`）
- **举报** — 帖子/评论/用户（`/api/community/report`）

---

## 4. 重写目标与现状

**目标目录**：`v5-svelte-migration/`（Svelte 5 + Vite + TS + Tailwind）。
现有结构（全部要按新风格重做，不是新建）：

```
src/
  App.svelte                  主壳（现用 GSAP+Lenis 重动效，背景大图）
  components/
    layout/   Header LiquidBar PageTransition
    modals/   AuthModal CommunityConsole PostModal
    ui/       AnimatedHeading CommunityWordmark CustomCursor LoadingScreen Preloader ReliableImage ThemeSwitcher
    views/    AdminView CommunityView PersonalView PostCard PostDetail ProfileView
  lib/        appRouter communityApi communityNavigation motion uploadQueue
  stores/     appState communityConsoleState communityViewState modalState theme
  styles/     app.css
```

**主题系统改动（用户已确认）**：`stores/theme.ts` 现有 4 套东方暗色主题（烟玫黑茶/苔石青岚/雾蓝沉香/乌木琥珀）→ **全部删除，只留 Claude 暖白一套**。ThemeSwitcher 相应简化或移除。`index.html` 里的 FOUC 暗色脚本也要改成暖白。

---

## 5. 后端 API（不要改后端，只对接）

后端 = Rust/Wasm on Cloudflare Workers（`src/lib.rs`）。前端通过 `lib/communityApi.ts` 调用。完整路由：

```
认证    POST /api/community/register | /auth | /login    GET /api/community/me
帖子    GET  /api/community/posts (?userId= &q= &favorites=)
        POST /api/community/posts  /posts/delete  /posts/like  /posts/favorite
评论    GET/POST /api/community/comments    POST /api/community/comments/like
互动    POST /api/community/like  /follow  /report
个人    GET  /api/community/profile
发现    GET  /api/community/discovery
通知    GET  /api/community/notifications
公告    GET/POST /api/community/announcement
媒体    POST /api/community/media/upload    GET /api/community/media/:key
网盘    GET /drive/list /drive/info   POST /drive/upload /drive/mkdir /drive/rename /drive/delete
后台    GET /api/community/admin/data    POST /api/community/admin/action
其它    /api/data /api/schedule（日程KV） /api/nodes（代理节点）
```

认证：登录返回 token，存会话（D1，7天TTL）；请求带 `Authorization`。
等级：XP→Lv 阈值表在 `src/lib.rs` 的 `COMMUNITY_LEVEL_THRESHOLDS`（20级）。
密码：后端用 SHA-256（已知偏弱，本次不动）。

---

## 6. 动效要求（用户强调“丝滑”）

- **不要** GSAP / Lenis / 自定义光标那套重方案（现有 App.svelte 用了，重写时换掉）。
- 用 **Svelte 原生 transition**（fade/fly/scale + `cubic-out`）+ CSS transition 做微交互。
- 时长 150–250ms，ease-out；hover 微移 1px、淡入、tab 下划线滑动。
- 尊重 `prefers-reduced-motion`。
- 页面切换：轻量 fade/fly，不要视差、不要炫技。

---

## 7. 落地顺序建议

1. 重写 `stores/theme.ts` + `styles/app.css` + `index.html` → 定下 Claude token，砍暗色主题。
2. 重写 `App.svelte` 壳（去 GSAP/Lenis/背景大图，改纸感底 + 轻动效）。
3. 按原型重写 4 个核心页面：CommunityView / ProfileView / PostDetail / AuthModal。
4. PostCard、Header、发帖弹窗 PostModal。
5. 补齐缺的：发现 / 通知 / 网盘 / 后台 / 举报。
6. 跑 `npm run dev`（项目根 wrangler dev）或 `v5-svelte-migration` 内 `npm run dev` 验证；不破坏现有 API 对接。

## 8. 验收

- 四页与原型视觉一致，全站只剩 Claude 一套主题。
- 上面所有功能可用、对接后端不报错。
- 动效丝滑、克制；console 无报错；移动端正常。
- 风格自检：简洁、少字、多留白。
