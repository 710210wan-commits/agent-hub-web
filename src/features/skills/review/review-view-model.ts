import {
  AuthorSubmissionSchema,
  type MarketPublication,
  type PublishAndEnableResponse,
  type ReviewQueueItem,
  type TriggerTestRun,
} from "../contracts/generated";
import { defineSkillMarketViewModelAdapter } from "../contracts/view-models";

type SubmissionManifest = NonNullable<ReturnType<typeof parseManifest>>;
type ValidationReport = NonNullable<ReturnType<typeof parseValidationReport>>;

export interface ReviewSubmissionViewModel {
  artifactKey: string;
  authorId: string;
  contentHash: string;
  id: string;
  manifest?: SubmissionManifest;
  name: string;
  revision: number;
  reviews: NonNullable<ReviewQueueItem["reviews"]>;
  status: ReviewQueueItem["status"];
  submittedAt: string;
  triggerCases: NonNullable<ReviewQueueItem["triggerCases"]>;
  triggerRuns: NonNullable<ReviewQueueItem["triggerRuns"]>;
  validationReport?: ValidationReport;
}

export const reviewQueueAdapter = defineSkillMarketViewModelAdapter(
  "listSubmissions",
  (submissions): ReviewSubmissionViewModel[] => submissions.map(toSubmission),
);

export const reviewSubmissionAdapter = defineSkillMarketViewModelAdapter(
  "reviewSubmission",
  toSubmission,
);

export const triggerTestsAdapter = defineSkillMarketViewModelAdapter(
  "listTriggerTests",
  (runs): TriggerTestRun[] => runs,
);

export const triggerTestRunAdapter = defineSkillMarketViewModelAdapter(
  "runTriggerTests",
  (run): TriggerTestRun => run,
);

export const deleteSubmissionAdapter = defineSkillMarketViewModelAdapter(
  "deleteSubmission",
  (): undefined => undefined,
);

export const publishSubmissionAdapter = defineSkillMarketViewModelAdapter(
  "publishSubmission",
  (publication): MarketPublication => publication,
);

export const publishAndEnableAdapter = defineSkillMarketViewModelAdapter(
  "publishAndEnableSubmission",
  (result): PublishAndEnableResponse => result,
);

function toSubmission(submission: ReviewQueueItem): ReviewSubmissionViewModel {
  return {
    artifactKey: submission.artifactKey,
    authorId: submission.authorId,
    contentHash: submission.contentHash,
    id: submission.id,
    manifest: parseManifest(submission.manifest),
    name: submission.name,
    revision: submission.revision,
    reviews: submission.reviews ?? [],
    status: submission.status,
    submittedAt: submission.submittedAt,
    triggerCases: submission.triggerCases ?? [],
    triggerRuns: submission.triggerRuns ?? [],
    validationReport: parseValidationReport(submission.validationReport),
  };
}

function parseManifest(value: unknown) {
  const parsed = AuthorSubmissionSchema.shape.manifest.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseValidationReport(value: unknown) {
  const parsed = AuthorSubmissionSchema.shape.validationReport.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
