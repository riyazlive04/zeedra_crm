export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`);
export const forbidden = (msg = "You do not have permission to do this") => new ApiError(403, msg);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
