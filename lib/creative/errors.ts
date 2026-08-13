/**
 * Creative Engine structured errors (sanitized for API / portal).
 */

export class CreativeEngineError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CreativeEngineError";
    this.code = code;
    this.details = details;
  }
}

export class NoApprovedTemplateError extends CreativeEngineError {
  constructor(message: string, details?: unknown) {
    super("NO_APPROVED_TEMPLATE", message, details);
    this.name = "NoApprovedTemplateError";
  }
}

export class DatasetMismatchError extends CreativeEngineError {
  constructor(message: string, details?: unknown) {
    super("DATASET_MISMATCH", message, details);
    this.name = "DatasetMismatchError";
  }
}

export class CreativeValidationError extends CreativeEngineError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "CreativeValidationError";
  }
}
