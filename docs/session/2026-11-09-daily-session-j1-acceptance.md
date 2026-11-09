# Daily Session J1 验收记录

## 结论

状态：**待真实联调**。

确定性假后端浏览器验收通过；真实双用户 smoke 与真实桌面验收因未提供专用凭据而未执行。不得将本记录解释为生产后端验收通过。

## 基线

- 前端分支：`codex/daily-session-j1`
- 前端实现基线：`790816a`（Task 1—4）+ 本文件所在 Task 5 提交
- 后端契约基线：`projects_new@098201a`
- 确定性测试 origin：`http://127.0.0.1:3103`
- 记录日期：`2026-11-09`（Asia/Shanghai）

## 验收矩阵

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 登录门禁、退出 | 通过 | Playwright：管理链路 |
| 新建会话并写入 URL | 通过 | Playwright：create → `conversation` query |
| 列表、分页、切换 | 通过 | Playwright：两页列表与 URL 切换 |
| 重命名、409 刷新后重试 | 通过 | Playwright：冲突刷新 + 成功重命名 |
| 刷新恢复、空会话 | 通过 | Playwright：reload 后恢复同一会话 |
| 只读消息、历史分页、去重 | 通过 | Playwright：snapshot/messages 两页合并 |
| 401 清空身份与旧内容 | 通过 | Playwright：失效后返回登录门禁 |
| A/B 账号隔离 | 通过（假后端） | Playwright：B 不见 A 列表且 A 会话安全 404 |
| 日常旧 Loop 发送回归 | 通过 | Playwright mock transport 回归 |
| 办公历史回归 | 通过 | Playwright work history 回归 |
| 真实双用户后端 smoke | 未执行 | 缺少显式 origin 与 A/B 专用凭据 |
| 真实 1280px+ 桌面人工验收 | 未执行 | 等真实双用户环境 |

## 自动化命令

执行时间：`2026-11-09 15:05—15:09 +08:00`。

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm test` | 0 | 35 files / 319 tests 通过 |
| `pnpm lint` | 0 | 通过 |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm build` | 0 | 通过；使用仅本次进程的必需本机占位配置 |
| `pnpm test:e2e:daily-session` | 0 | Chromium 3/3 通过，1440×900 |
| `git diff --check` | 0 | 通过 |

复现命令：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e:daily-session
git diff --check
```

真实 smoke（不记录密码、Cookie）：

```powershell
$env:DAILY_SESSION_J1_ORIGIN='https://example.invalid'
$env:DAILY_SESSION_J1_USER_A='test-user-a'
$env:DAILY_SESSION_J1_PASSWORD_A='<secret>'
$env:DAILY_SESSION_J1_USER_B='test-user-b'
$env:DAILY_SESSION_J1_PASSWORD_B='<secret>'
pnpm smoke:daily-session-j1
```

未配置任一必需变量时，脚本以退出码 `2` 返回 `SKIP（非通过）`。只允许 HTTPS 或本机 HTTP origin。脚本使用两个隔离 Cookie jar，不输出凭据/Cookie；因 J1 无删除接口，创建的 smoke 会话会保留。

## 真实联调放行条件

1. 指定运行中的前端同源代理与 `projects_new` 后端 SHA。
2. 提供两个隔离测试账号；不得复用真实个人账号。
3. `pnpm smoke:daily-session-j1` 退出码为 `0`。
4. 1280px+ 桌面人工复核登录、新建、列表、切换、重命名、刷新、空态、分页、退出与 A/B 隔离。
5. 单独记录时间、origin、前后端 SHA、命令退出码和匿名化结果；不记录秘密。

## 范围边界

本次仅 J1：会话管理与只读历史。未加入 J2/J3 turn/event/SSE、恢复写入、归档、删除或停止能力。
