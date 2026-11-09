import type { CatalogItemViewModel } from "../contracts/catalog-view-model";

export const SKILL_SOURCE_LABELS: Record<CatalogItemViewModel["source"], string> = {
  "built-in": "内置 Skill",
  market: "市场发布",
};

export const SKILL_INSTALL_STATE_LABELS: Record<CatalogItemViewModel["installState"], string> = {
  "built-in-active": "运行中",
  enabled: "已启用",
  installable: "可安装",
  blocked: "不可用",
};
