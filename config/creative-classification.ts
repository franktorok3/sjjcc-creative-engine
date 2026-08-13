/**
 * Tunable thresholds for content-density classification.
 * Adjust these numbers without changing selection logic.
 *
 * Scoring summary (see classifyContentDensity):
 * - Description length bands add weight
 * - Each populated detail field adds weight
 * - Pricing / contact / additional details add weight
 *
 * Final cutoffs:
 * - score <= scoreMinimalMax → minimal
 * - score <= scoreStandardMax → standard
 * - else → dense
 */
export const DENSITY_THRESHOLDS = {
  /** Headline characters considered "long". */
  headlineCharsLong: 60,
  /** Description characters above this push toward standard. */
  descriptionCharsStandard: 80,
  /** Description characters above this push toward dense. */
  descriptionCharsDense: 280,
  /** Description words above this push toward dense. */
  descriptionWordsDense: 45,
  /** Score cutoffs after weighted accumulation (inclusive max for band). */
  scoreMinimalMax: 2,
  scoreStandardMax: 5,
} as const;

export const DENSITY_WEIGHTS = {
  longHeadline: 1,
  descriptionStandard: 1,
  descriptionDense: 2,
  descriptionWordsDense: 1,
  detailField: 1,
  pricing: 1,
  contact: 1,
  additionalDetails: 1,
  registrationDeadline: 1,
  audience: 1,
} as const;
