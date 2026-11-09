import type * as z from "zod";

import {
  skillMarketOperationSchemas,
  type SkillMarketOperationId,
} from "./generated";

type OperationMap = typeof skillMarketOperationSchemas;

export type SkillMarketOperationResponse<TOperation extends SkillMarketOperationId> =
  z.infer<OperationMap[TOperation]["response"]>;

export interface SkillMarketViewModelAdapter<
  TOperation extends SkillMarketOperationId,
  TViewModel,
> {
  operation: TOperation;
  toViewModel: (dto: SkillMarketOperationResponse<TOperation>) => TViewModel;
}

export function defineSkillMarketViewModelAdapter<
  TOperation extends SkillMarketOperationId,
  TViewModel,
>(
  operation: TOperation,
  toViewModel: (dto: SkillMarketOperationResponse<TOperation>) => TViewModel,
): SkillMarketViewModelAdapter<TOperation, TViewModel> {
  return { operation, toViewModel };
}
