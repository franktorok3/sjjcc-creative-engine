import "server-only";

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function logMilestone(
  requestId: string,
  event: string,
  extra?: string,
): void {
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[${requestId}] ${event}${suffix}`);
}

export function logFailed(
  requestId: string,
  stage: string,
  reason: string,
): void {
  const sanitized = reason.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  console.error(`[${requestId}] FAILED stage=${stage} reason=${sanitized}`);
}
