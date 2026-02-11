export interface ApiClientErrorPayload extends Record<string, unknown> {
  code?: unknown;
  message?: unknown;
  error?: unknown;
}

interface ApiClientErrorInit {
  status: number;
  code: string;
  serverMessage: string;
  payload: ApiClientErrorPayload | null;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  serverMessage: string;
  payload: ApiClientErrorPayload | null;

  constructor(init: ApiClientErrorInit) {
    super(init.serverMessage || `API request failed with status ${init.status}`);
    this.name = "ApiClientError";
    this.status = init.status;
    this.code = init.code;
    this.serverMessage = init.serverMessage;
    this.payload = init.payload;
  }
}

interface ApiErrorMessageOptions {
  defaultMessage: string;
  statusMessages?: Partial<Record<number, string>>;
  codeMessages?: Record<string, string>;
  useServerMessageFallback?: boolean;
}

function parseApiErrorPayload(value: unknown): ApiClientErrorPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ApiClientErrorPayload;
}

function parseApiErrorCode(payload: ApiClientErrorPayload | null) {
  return typeof payload?.code === "string" ? payload.code.trim() : "";
}

function parseApiErrorMessage(payload: ApiClientErrorPayload | null) {
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  return "";
}

async function readJsonResponse(response: Response) {
  return response.json().catch(() => null);
}

async function toApiClientError(response: Response) {
  const rawPayload = await readJsonResponse(response);
  const payload = parseApiErrorPayload(rawPayload);
  const code = parseApiErrorCode(payload);
  const serverMessage = parseApiErrorMessage(payload);
  return new ApiClientError({
    status: response.status,
    code,
    serverMessage,
    payload,
  });
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function getApiClientErrorPayload(error: unknown) {
  return isApiClientError(error) ? error.payload : null;
}

export function mapApiClientErrorMessage(error: unknown, options: ApiErrorMessageOptions) {
  if (!isApiClientError(error)) {
    return options.defaultMessage;
  }

  const mappedByCode = error.code ? options.codeMessages?.[error.code] : undefined;
  if (mappedByCode) {
    return mappedByCode;
  }

  const mappedByStatus = options.statusMessages?.[error.status];
  if (mappedByStatus) {
    return mappedByStatus;
  }

  if (options.useServerMessageFallback && error.serverMessage) {
    return error.serverMessage;
  }

  return options.defaultMessage;
}

export async function apiRequestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await toApiClientError(response);
  }
  return (await readJsonResponse(response)) as T;
}

export async function apiGetJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  return apiRequestJson<T>(input, init);
}

export async function apiPostJson<T>(
  input: RequestInfo | URL,
  body: unknown,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return apiRequestJson<T>(input, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
