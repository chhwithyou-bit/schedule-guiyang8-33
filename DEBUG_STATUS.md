# 社区功能调试记录 (2026-03-25)

## 已解决的问题
1. **R2 容错增强**：修复了 `worker.js` 在 R2 存储桶未绑定或写入失败时会导致整个上传流程崩溃的 bug。现在 R2 仅作为可选缓存，不影响 Google Drive 的主上传流程。
2. **CORS 跨域支持**：在 `/api/community/media/` 接口和 Google Drive 回退响应中添加了 `Access-Control-Allow-Origin: *` 表头。
3. **自定义域名支持**：将图片返回 URL 更新为使用你的自定义 R2 域名 `https://media.thefallback.cc.cd/`。
4. **Google Drive 兼容性**：
   - 增加了 `supportsAllDrives=true` 参数，解决了共享云端硬盘（团队盘）的权限识别问题。
   - 改进了错误报告机制，现在会直接弹出 Google API 返回的具体报错信息。

## 当前状态
- **Google Drive 连接测试**：通过 (`/api/community/test-drive`)。
- **存储桶配置**：用户已为 R2 绑定域名 `media.thefallback.cc.cd`。
- **待验证**：在添加 `supportsAllDrives=true` 后，发布带图片的新评论是否能成功。

## 待办事项 (如果仍有问题)
- 检查 R2 控制台的 CORS 策略（建议设置为允许所有来源 `*`）。
- 观察发布图片时弹出的具体红色报错详情。
