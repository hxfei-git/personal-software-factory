export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(code: string, message: string, details?: unknown): ApiError {
  return new ApiError(400, code, message, details);
}

export function notFound(resource: string, id: string): ApiError {
  return new ApiError(404, "NOT_FOUND", resource + " not found: " + id);
}

export function invalidTransition(message: string): ApiError {
  return new ApiError(400, "INVALID_MISSION_TRANSITION", message);
}

export function unauthorized(message = "Missing or invalid API token"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function serviceUnavailable(code: string, message: string, details?: unknown): ApiError {
  return new ApiError(503, code, message, details);
}

export function toErrorResponse(error: ApiError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}
