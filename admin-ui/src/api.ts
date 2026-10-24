export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

let onUnauthorized: () => void = () => {};

/** Called when a request fails with 401 because the session ended. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

// 401 is an expected answer on these, not an expired session
const SESSION_PROBES = ['/admin-session/login', '/admin-session/me'];

/**
 * Calls the API on the same origin with the session cookie. Never sends nor stores the
 * admin API key: the httpOnly cookie is the only credential, and X-Admin-UI is the CSRF guard.
 */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Admin-UI': '1',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload: { data?: T; message?: string | string[] } | null = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !SESSION_PROBES.includes(path)) {
      onUnauthorized();
    }
    throw new ApiError(response.status, errorMessage(response.status, payload?.message));
  }

  return payload?.data as T;
}

function errorMessage(status: number, message: string | string[] | undefined): string {
  if (Array.isArray(message)) return message.join('. ');
  if (message) return message;
  return status >= 500
    ? 'El servidor no pudo completar la operación. Intenta de nuevo.'
    : `Error ${status}`;
}
