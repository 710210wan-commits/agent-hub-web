import { defineSkillMarketViewModelAdapter } from "../contracts/view-models";

export const analyzeRequirementAdapter = defineSkillMarketViewModelAdapter("analyzeRequirement", (value) => value);
export const reviseRequirementAdapter = defineSkillMarketViewModelAdapter("reviseRequirement", (value) => value);
export const confirmRequirementAdapter = defineSkillMarketViewModelAdapter("confirmRequirement", (value) => value);
export const creatorToolsAdapter = defineSkillMarketViewModelAdapter("listCreatorTools", (value) => value);
export const recommendToolsAdapter = defineSkillMarketViewModelAdapter("recommendToolResolution", (value) => value);
export const confirmToolsAdapter = defineSkillMarketViewModelAdapter("confirmToolResolution", (value) => value);
export const generateBundleAdapter = defineSkillMarketViewModelAdapter("generateSkillBundle", (value) => value);
export const suggestSmokeAdapter = defineSkillMarketViewModelAdapter("suggestSmokeCases", (value) => value);
export const runSmokeAdapter = defineSkillMarketViewModelAdapter("runSmokeCases", (value) => value);
export const creatorDraftAdapter = defineSkillMarketViewModelAdapter("getDraft", (value) => value);
