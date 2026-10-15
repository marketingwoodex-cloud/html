/**
 * api.ts — the typed client for api/v2.
 *
 * Master plan §11 Phase 1 lists this file's job: "typed fetch wrapper, error-code mapping, retry
 * policy, request-id surfaced in errors". Each of those exists because of a specific v2.1 failure:
 *
 *   · **Typed.** The old admin used `fetch(...).then(r => r.json())` and read whatever came back, so
 *     a PHP notice that reached the body became `undefined.someField` and a blank screen. Here the
 *     envelope is parsed once, and a malformed body is an ApiFailure like any other.
 *   · **Coded.** v2.1 returned `{ok:false,error:"Not signed in"}` and each screen tested the message
 *     text. The client branches on `code`, and `error.message` is only ever shown to a person.
 *   · **Request-id.** Every failure carries the id the server logged, so "it didn't work" becomes a
 *     grep. `ApiFailure.requestId` is rendered in the error toast and copied by the "Copy details"
 *     action.
 *   · **Retry.** Only for GETs, only for network failures and 502/503/504, at most twice with
 *     backoff. A POST is never retried automatically: two lead saves are worse than one error.
 */

export type ErrorCode =
  | "AUTH"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "UPSTREAM"
  | "INTERNAL";

export interface ApiMeta {
  requestId: string;
  took?: number;
  version?: string;
  [k: string]: unknown;
}

export interface ApiEnvelope<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  field?: string;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: ApiErrorBody;
  meta: ApiMeta;
}

/** Every failure the client can see, in one type, so `catch` never has to guess. */
export class ApiFailure extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly status: number;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(body: ApiErrorBody, status: number, requestId: string, retryable = false) {
    super(body.message);
    this.name = "ApiFailure";
    this.code = body.code;
    this.field = body.field;
    this.status = status;
    this.requestId = requestId;
    this.retryable = retryable;
  }

  /** What the toast shows. The request-id is the part that makes a bug report actionable. */
  get detail(): string {
    return `${this.code}${this.field ? ` · ${this.field}` : ""} · ${this.requestId}`;
  }

  get isAuthFailure(): boolean {
    return this.code === "AUTH";
  }

  get isPermissionFailure(): boolean {
    return this.code === "FORBIDDEN";
  }
}

/* ---------------------------------------------------------------- configuration */

const BASE = "/api/v2";

/** How long a request may hang before it is abandoned. v2.1 had no timeout at all. */
const TIMEOUT_MS = 20_000;
const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

/* ---------------------------------------------------------------- session state
 * The CSRF token lives in memory only. It is never written to localStorage or sessionStorage: the
 * v2.1 token was readable by any script on the page, and keeping the replacement in memory is the
 * point of the whole change. A reload re-fetches it from /me.
 */
let csrfToken: string | null = null;

export function setCsrf(token: string | null): void {
  csrfToken = token;
}

export function getCsrf(): string | null {
  return csrfToken;
}

/** Where the app sends the browser when a session is gone. */
let onAuthLost: (() => void) | null = null;

export function onAuthFailure(handler: () => void): void {
  onAuthLost = handler;
}

/* ---------------------------------------------------------------- the request */

interface RequestOptions {
  /** Query parameters; undefined/empty values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body. Objects and arrays are stringified; a string is sent as-is. */
  body?: unknown;
  /** AbortSignal from the caller, e.g. a screen that unmounted. */
  signal?: AbortSignal;
  /** Skip the auth handler — used by /me, which expects AUTH when signed out. */
  quiet?: boolean;
  retries?: number;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const rel = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${BASE}${rel}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function once<T>(method: string, path: string, opts: RequestOptions): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, headers, credentials: "same-origin", signal: controller.signal };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  // The double-submit: the server checks this against the session row.
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers["X-WX-CSRF"] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), init);
  } catch (err) {
    window.clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    throw new ApiFailure(
      {
        code: "UPSTREAM",
        message: aborted ? "The request took too long. Check your connection and try again." : "The server could not be reached.",
      },
      0,
      "—",
      true,
    );
  } finally {
    window.clearTimeout(timer);
  }

  const requestId = response.headers.get("X-WX-Request-Id") ?? "—";
  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body means something answered that is not this API: a proxy error page, maintenance
    // mode, or a PHP fatal before the boundary. Say so, and keep the first line for the log.
    throw new ApiFailure(
      { code: "INTERNAL", message: `The server sent an unexpected reply (${response.status}).` },
      response.status,
      requestId,
      false,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ApiFailure(
      { code: "INTERNAL", message: "The server sent an empty reply." },
      response.status,
      requestId,
    );
  }

  const body = parsed as ApiEnvelope<T> | ApiErrorEnvelope;
  if (body.ok === false) {
    const failure = new ApiFailure(
      body.error ?? { code: "INTERNAL", message: "Request failed" },
      response.status,
      body.meta?.requestId ?? requestId,
      response.status === 0 || RETRY_STATUSES.has(response.status),
    );
    if (failure.isAuthFailure && !opts.quiet) onAuthLost?.();
    throw failure;
  }
  return body;
}

/**
 * Perform a request. Retries only apply to safe methods; see the header comment.
 */
async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const max = opts.retries ?? (method === "GET" || method === "HEAD" ? MAX_RETRIES : 0);
  let attempt = 0;
  for (;;) {
    try {
      const envelope = await once<T>(method, path, opts);
      return envelope.data;
    } catch (err) {
      const retryable = err instanceof ApiFailure && err.retryable;
      if (!retryable || attempt >= max) throw err;
      attempt += 1;
      // 250 ms, 750 ms — long enough for a shared host to finish a restart, short enough to stay
      // inside a user's patience.
      await new Promise((r) => window.setTimeout(r, 250 * attempt * attempt));
    }
  }
}

/* ---------------------------------------------------------------- the surface */

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "body">) => request<T>("GET", path, opts ?? {}),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) => request<T>("POST", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) => request<T>("PATCH", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) => request<T>("PUT", path, { ...opts, body }),
  del: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) => request<T>("DELETE", path, { ...opts, body }),

  /** Health probe. Never throws: a boolean is what callers want. */
  async healthy(): Promise<boolean> {
    try {
      const d = await request<{ ready: boolean }>("GET", "/health", { retries: 0 });
      return Boolean(d?.ready);
    } catch {
      return false;
    }
  },
};

/* ---------------------------------------------------------------- domain types
 * Shapes mirror the PHP handlers in api/v2/routes. Kept beside the client so a change on one side is
 * visible from the other; a fuller generated type layer arrives with the Phase 2 port.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "sales" | "support";
  roleLabel: string;
  perms: string[];
  active: boolean;
  created_at: string | null;
  last_login: string | null;
  twofa: boolean;
}

export interface Caps {
  label: string;
  groups: string[];
  perms: string[];
}

export interface MeResponse {
  user: User;
  caps: Caps;
  csrf: string;
  session: { expires_at: string | null; ip: string | null };
}

export interface LoginResponse {
  need2fa: boolean;
  ticket?: string;
  csrf?: string;
  user?: User;
  caps?: Caps;
}

export type LeadStage = "new" | "contacted" | "visit" | "quote" | "hold" | "won" | "lost";

export interface Lead {
  id: number;
  created_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  location: string | null;
  source: string;
  service: string | null;
  message: string | null;
  stage: LeadStage;
  priority: string | null;
  budget: string | null;
  tags: string | null;
  assigned_to: number | null;
  followup: string | null;
  value: number;
  valueDisplay: string;
  is_read: boolean;
  last_contact: string | null;
  next_at: string | null;
}

export interface LeadsPage {
  leads: Lead[];
  total: number;
  limit: number;
  offset: number;
  board?: Record<string, { count: number; value: number }>;
  stages?: LeadStage[];
}

export interface SessionInfo {
  id: string;
  current: boolean;
  ip: string;
  ua: string;
  created_at: string;
  seen_at: string;
  expires_at: string;
}

/* ---------------------------------------------------------------- auth helpers */

export const session = {
  async me(): Promise<MeResponse | null> {
    try {
      const me = await api.get<MeResponse>("/me", { quiet: true, retries: 0 });
      csrfToken = me.csrf;
      return me;
    } catch (err) {
      if (err instanceof ApiFailure && err.isAuthFailure) return null;
      throw err;
    }
  },
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>("/auth/login", { email, password }, { retries: 0 });
    if (res.csrf) csrfToken = res.csrf;
    return res;
  },
  async loginTwoFactor(ticket: string, code: string): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>("/auth/login/2fa", { ticket, code }, { retries: 0 });
    if (res.csrf) csrfToken = res.csrf;
    return res;
  },
  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout", {});
    } finally {
      csrfToken = null;
    }
  },
};
