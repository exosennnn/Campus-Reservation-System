// Thin wrapper around fetch. Errors from the server carry a readable message.
export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // Not JSON: fall through to the status-based message below.
  }
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data);
  }
  return data;
}
