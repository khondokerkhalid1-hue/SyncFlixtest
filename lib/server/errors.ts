export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number
  ) {
    super(message)
  }
}

export const bad = (message: string) => new AppError(400, 'bad_request', message)

const noStore = { 'Cache-Control': 'no-store' }

export function errorResponse(e: AppError): Response {
  const headers: Record<string, string> = { ...noStore }
  if (e.retryAfter) headers['Retry-After'] = String(e.retryAfter)
  return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers })
}

// Turns any thrown value into a safe response. Details of unexpected errors never reach the browser.
export function jsonError(e: unknown): Response {
  if (e instanceof AppError) return errorResponse(e)
  console.error('Unexpected server error:', e instanceof Error ? e.message : 'unknown')
  return errorResponse(new AppError(500, 'server_error', 'Something went wrong on the server.'))
}

export const jsonOk = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore })
