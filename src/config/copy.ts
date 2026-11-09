export const copy = {
  productName: "智能体平台",
  productTagline: "AGENT HUB",
  mode: {
    daily: "1",
    work: "2",
  },
  user: {
    name: "演示用户",
    workspace: "办公空间",
  },
  dailySessionAuth: {
    checking: "正在恢复登录状态…",
    title: "登录日常会话",
    description: "使用现有账号验证后查看持久会话。",
    username: "用户名",
    password: "密码",
    login: "登录",
    logout: "退出登录",
    retry: "重试",
    restoreFailed: "登录状态读取失败，请稍后重试",
    loginFailed: "登录失败，请检查账号后重试",
    logoutFailed: "退出失败，请稍后重试",
  },
} as const;
