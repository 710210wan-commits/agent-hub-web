import type { SkillCatalogViewModel } from "../contracts/catalog-view-model";
import type { MarketInstallation, MarketPublication, MarketPublicationSummary } from "../contracts/generated";
import { defineSkillMarketViewModelAdapter } from "../contracts/view-models";

export type PublicationAvailability = "blocked" | "enabled" | "historical" | "installable" | "unavailable" | "withdrawn";

export interface PublicationViewModel extends MarketPublicationSummary {
  availability: PublicationAvailability;
  installable: boolean;
  installationSummary: string;
  isLatest: boolean;
}

export const publicationSummariesAdapter = defineSkillMarketViewModelAdapter(
  "listPublications",
  (items): MarketPublicationSummary[] => items,
);

export const installationStatusAdapter = defineSkillMarketViewModelAdapter(
  "setInstallationStatus",
  (installation): MarketInstallation => installation,
);

export const withdrawPublicationAdapter = defineSkillMarketViewModelAdapter(
  "withdrawPublication",
  (publication): MarketPublication => publication,
);

export const revisePublicationAdapter = defineSkillMarketViewModelAdapter(
  "revisePublication",
  (response) => response.draft,
);

export function toPublicationViewModels(
  publications: MarketPublicationSummary[],
  catalog: SkillCatalogViewModel,
): PublicationViewModel[] {
  const latestRevision = new Map<string, number>();
  for (const publication of publications) {
    latestRevision.set(publication.skillName, Math.max(latestRevision.get(publication.skillName) ?? 0, publication.revision));
  }

  return publications.map((publication) => {
    const isLatest = publication.revision === latestRevision.get(publication.skillName);
    const catalogItem = catalog.items.find((item) => item.source === "market" && item.publicationId === publication.id);
    const availability = resolveAvailability(publication, isLatest, catalogItem);
    return {
      ...publication,
      availability,
      installable: availability === "enabled" || availability === "installable",
      installationSummary: availabilityLabel(availability),
      isLatest,
    };
  });
}

function resolveAvailability(
  publication: MarketPublicationSummary,
  isLatest: boolean,
  catalogItem: SkillCatalogViewModel["items"][number] | undefined,
): PublicationAvailability {
  if (publication.status === "withdrawn") return "withdrawn";
  if (!isLatest) return "historical";
  if (!catalogItem) return "unavailable";
  if (catalogItem.conflict || catalogItem.installState === "blocked") return "blocked";
  return catalogItem.installState === "enabled" ? "enabled" : "installable";
}

export function availabilityLabel(availability: PublicationAvailability): string {
  return {
    blocked: "名称冲突，不可安装",
    enabled: "daily 已启用",
    historical: "历史版本，不可安装",
    installable: "daily 未启用",
    unavailable: "当前 Catalog 未提供安装状态",
    withdrawn: "已下架，不可安装",
  }[availability];
}
