import type {
  AgentActionLog,
  AgentConfigInfo,
  AgentLogItem,
  BenchmarkHistoryInfo,
  BenchmarkRunResult,
  BenchmarkStatus,
  ChallengeCreateResult,
  ChallengeInfo,
  ChallengeRunResult,
  ChallengeVerifyResult,
  EarningsInfo,
  FitInfo,
  HealthInfo,
  IdentityInitResult,
  IdentityRotateResult,
  PricingInfo,
  ProviderIdentity,
  ProviderInfo,
  ProviderVerificationResult,
  RawAgentData,
  ReadinessInfo,
  RegistrationPayload,
  ReportInfo,
  ReportVerificationResult,
  ScoreInfo,
  SignedReportResult,
  SystemInfo,
  UptimeInfo,
  VerificationInfo,
} from "../types/burd-agent";

export const BURD_AGENT_BASE_URL =
  import.meta.env.VITE_BURD_AGENT_BASE_URL?.trim() || "http://127.0.0.1:8787";
const BURD_AGENT_DEV_PROXY_BASE_URL = "/__burd_agent__";
export const BURD_AGENT_CARGO_COMMAND = [
  "cd F:\\Burd\\benchmark",
  ".\\target\\debug\\burd-agent.exe serve --host 127.0.0.1 --port 8787",
].join("\n");
export const BURD_AGENT_BINARY_COMMAND =
  "burd-agent serve --host 127.0.0.1 --port 8787";

const SENSITIVE_FIELD_NAMES = new Set([
  "private_key",
  "private_key_path",
  "secret_key_base64",
  "api_token",
  "api_token_hash",
  "token_hash",
  "credentials",
  "password",
  "token",
]);

export interface AgentRequestResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  errorKind?: AgentRequestErrorKind;
  statusCode?: number;
}

export type AgentRequestErrorKind =
  | "offline"
  | "not_found"
  | "token_required"
  | "unauthorized"
  | "server"
  | "http"
  | "timeout"
  | "unknown";

interface RequestOptions {
  body?: unknown;
  method?: "GET" | "POST";
  timeoutMs?: number;
}

type FetchImplementation = typeof fetch;

let runtimeAgentApiToken: string | null = null;
const SHOULD_LOG_AGENT_REQUESTS = import.meta.env.DEV;

async function resolveFetchImplementation(): Promise<FetchImplementation> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const plugin = await import("@tauri-apps/plugin-http");
    return plugin.fetch as unknown as FetchImplementation;
  }

  return globalThis.fetch.bind(globalThis);
}

function resolveAgentBaseUrl() {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return BURD_AGENT_BASE_URL;
  }

  if (
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http")
  ) {
    return BURD_AGENT_DEV_PROXY_BASE_URL;
  }

  return BURD_AGENT_BASE_URL;
}

export function redactSensitiveValue(key: string, value: unknown): unknown {
  return SENSITIVE_FIELD_NAMES.has(key.toLowerCase()) ? "<redacted>" : value;
}

export function redactSensitiveJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveJson(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => {
        const redacted = redactSensitiveValue(key, item);
        return [
          key,
          redacted === item ? redactSensitiveJson(item) : redacted,
        ] as const;
      },
    );

    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function setAgentApiToken(token: string) {
  const normalized = token.trim();
  runtimeAgentApiToken = normalized ? normalized : null;
}

export function clearAgentApiToken() {
  runtimeAgentApiToken = null;
}

export function getAgentApiToken() {
  return runtimeAgentApiToken;
}

export function isAgentOfflineError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const errObj = error as { errorKind?: AgentRequestErrorKind; message?: string; error?: string; statusCode?: number };
    if (errObj.errorKind === "offline" || errObj.errorKind === "timeout") {
      return true;
    }
    const msg = errObj.message || errObj.error || "";
    if (typeof msg === "string") {
      const normalized = msg.toLowerCase();
      return (
        normalized.includes("failed to fetch") ||
        normalized.includes("network") ||
        normalized.includes("connect") ||
        normalized.includes("timeout") ||
        normalized.includes("conectar") ||
        normalized.includes("não foi possível conectar") ||
        normalized.includes("nao foi possivel conectar") ||
        normalized.includes("burd agent não encontrado") ||
        normalized.includes("burd agent nao encontrado")
      );
    }
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("failed to fetch") ||
      normalized.includes("network") ||
      normalized.includes("connect") ||
      normalized.includes("timeout") ||
      normalized.includes("conectar") ||
      normalized.includes("não foi possível conectar") ||
      normalized.includes("nao foi possivel conectar") ||
      normalized.includes("burd agent não encontrado") ||
      normalized.includes("burd agent nao encontrado")
    );
  }

  return false;
}

export function isTokenRequiredError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const errObj = error as { errorKind?: AgentRequestErrorKind; message?: string; error?: string; statusCode?: number };
    if (errObj.errorKind === "token_required") {
      return true;
    }
    if (errObj.statusCode === 401 && errObj.errorKind !== "unauthorized") {
      return true;
    }
    const msg = errObj.message || errObj.error || "";
    if (typeof msg === "string") {
      const normalized = msg.toLowerCase();
      return (
        normalized.includes("exige token") ||
        normalized.includes("token required") ||
        normalized.includes("api local protegida") ||
        normalized.includes("token necessário") ||
        normalized.includes("token necessario")
      );
    }
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("exige token") ||
      normalized.includes("token required") ||
      normalized.includes("api local protegida") ||
      normalized.includes("token necessário") ||
      normalized.includes("token necessario")
    );
  }

  return false;
}

export function isUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const errObj = error as { errorKind?: AgentRequestErrorKind; message?: string; error?: string; statusCode?: number };
    if (errObj.errorKind === "unauthorized" || errObj.statusCode === 401) {
      // 401 might be either token_required or unauthorized, but if errorKind says unauthorized or if we have a token that failed, it is unauthorized
      if (errObj.errorKind === "token_required") {
        return false;
      }
      return true;
    }
    const msg = errObj.message || errObj.error || "";
    if (typeof msg === "string") {
      const normalized = msg.toLowerCase();
      return (
        normalized.includes("token local inválido") ||
        normalized.includes("token local invalido") ||
        normalized.includes("invalid token") ||
        normalized.includes("unauthorized")
      );
    }
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("token local inválido") ||
      normalized.includes("token local invalido") ||
      normalized.includes("invalid token") ||
      normalized.includes("unauthorized")
    );
  }

  return false;
}

export function isEndpointNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const errObj = error as { errorKind?: AgentRequestErrorKind; message?: string; error?: string; statusCode?: number };
    if (errObj.errorKind === "not_found" || errObj.statusCode === 404) {
      return true;
    }
    const msg = errObj.message || errObj.error || "";
    if (typeof msg === "string") {
      const normalized = msg.toLowerCase();
      return (
        normalized.includes("endpoint local não encontrado") ||
        normalized.includes("endpoint local nao encontrado") ||
        normalized.includes("rota solicitada")
      );
    }
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("endpoint local não encontrado") ||
      normalized.includes("endpoint local nao encontrado") ||
      normalized.includes("rota solicitada")
    );
  }

  return false;
}

export function isEndpointServerError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const errObj = error as { errorKind?: AgentRequestErrorKind; message?: string; error?: string; statusCode?: number };
    if (errObj.errorKind === "server" || (errObj.statusCode !== undefined && errObj.statusCode >= 500)) {
      return true;
    }
    const msg = errObj.message || errObj.error || "";
    if (typeof msg === "string") {
      const normalized = msg.toLowerCase();
      return normalized.includes("burd agent respondeu com erro");
    }
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return normalized.includes("burd agent respondeu com erro");
  }

  return false;
}

function extractPayloadText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return [
    (payload as { error?: unknown }).error,
    (payload as { message?: unknown }).message,
    (payload as { hint?: unknown }).hint,
    (payload as { status?: unknown }).status,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function hasWindowRuntime() {
  return typeof window !== "undefined";
}

async function parseResponsePayload<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();

  if (!bodyText.trim()) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText) as T;
  }

  return bodyText as T;
}

export function resolveErrorKind(
  payload: unknown,
  statusCode: number,
  hadToken: boolean,
): AgentRequestErrorKind {
  const payloadText = extractPayloadText(payload);

  if (statusCode === 401) {
    if (
      payloadText.includes("token required") ||
      payloadText.includes("token necessário") ||
      payloadText.includes("token necessario")
    ) {
      return "token_required";
    }

    if (
      payloadText.includes("invalid token") ||
      payloadText.includes("unauthorized") ||
      payloadText.includes("token inválido") ||
      payloadText.includes("token invalido")
    ) {
      return "unauthorized";
    }

    return hadToken ? "unauthorized" : "token_required";
  }

  if (statusCode === 404) {
    return "not_found";
  }

  if (statusCode >= 500) {
    return "server";
  }

  if (payload && typeof payload === "object") {
    const status = (payload as { status?: unknown }).status;
    if (typeof status === "string" && status.toLowerCase() === "unauthorized") {
      return hadToken ? "unauthorized" : "token_required";
    }
  }

  return "http";
}

function logAgentRequest(event: {
  method: string;
  path: string;
  statusCode?: number;
  ok: boolean;
  errorKind?: AgentRequestErrorKind;
}) {
  if (!SHOULD_LOG_AGENT_REQUESTS) {
    return;
  }

  const { errorKind, method, ok, path, statusCode } = event;
  const parts = ["[burd-agent]", method, path, ok ? "ok" : "error"];

  if (typeof statusCode === "number") {
    parts.push(`status=${statusCode}`);
  }

  if (errorKind) {
    parts.push(`kind=${errorKind}`);
  }

  if (ok) {
    console.info(parts.join(" "));
  } else {
    console.warn(parts.join(" "));
  }
}

async function requestJson<T>(
  path: string,
  { body, method = "GET", timeoutMs = 8000 }: RequestOptions = {},
): Promise<AgentRequestResult<T>> {
  const controller = new AbortController();
  const timeoutId = hasWindowRuntime()
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImplementation = await resolveFetchImplementation();
    const token = getAgentApiToken();
    const response = await fetchImplementation(`${resolveAgentBaseUrl()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const parsed = await parseResponsePayload<T>(response);
    const redacted = parsed === null ? null : redactSensitiveJson(parsed);

    if (!response.ok || payloadIndicatesFailure(redacted)) {
      const errorKind = resolveErrorKind(redacted, response.status, Boolean(token));
      logAgentRequest({
        method,
        path,
        statusCode: response.status,
        ok: false,
        errorKind,
      });
      return {
        ok: false,
        data: redacted,
        error: extractErrorMessage(redacted, response.status, Boolean(token)),
        errorKind,
        statusCode: response.status,
      };
    }

    logAgentRequest({ method, path, statusCode: response.status, ok: true });
    return {
      ok: true,
      data: redacted,
      error: null,
      statusCode: response.status,
    };
  } catch (error) {
    const normalized = normalizeRequestError(error, timeoutMs);
    logAgentRequest({
      method,
      path,
      ok: false,
      errorKind: normalized.errorKind,
    });
    return {
      ok: false,
      data: null,
      ...normalized,
    };
  } finally {
    if (hasWindowRuntime()) {
      window.clearTimeout(timeoutId as number);
    } else {
      globalThis.clearTimeout(timeoutId as ReturnType<typeof globalThis.setTimeout>);
    }
  }
}

function postJson<T>(path: string, body?: unknown, timeoutMs?: number) {
  return requestJson<T>(path, { method: "POST", body, timeoutMs });
}

function payloadIndicatesFailure(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) {
    return true;
  }

  const status = (payload as { status?: unknown }).status;
  return (
    typeof status === "string" &&
    ["error", "unauthorized"].includes(status.toLowerCase())
  );
}

export function extractErrorMessage(
  payload: unknown,
  statusCode: number,
  hadToken: boolean,
): string {
  const errorKind = resolveErrorKind(payload, statusCode, hadToken);

  if (errorKind === "token_required") {
    return "API local protegida.";
  }

  if (errorKind === "unauthorized") {
    return "Token local inválido.";
  }

  if (errorKind === "not_found" || statusCode === 404) {
    return "Endpoint local não encontrado. Verifique se o app está usando o burd-agent atualizado.";
  }

  if (errorKind === "server" || statusCode >= 500) {
    return "Burd Agent respondeu com erro ao carregar os dados.";
  }

  if (errorKind === "offline") {
    return "Burd Agent não encontrado.";
  }

  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    const message = (payload as { message?: unknown }).message;
    const hint = (payload as { hint?: unknown }).hint;

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    if (typeof message === "string" && message.trim()) {
      return message;
    }

    if (typeof hint === "string" && hint.trim()) {
      return hint;
    }
  }

  return `A API local respondeu com status ${statusCode}.`;
}

function normalizeRequestError(error: unknown, timeoutMs: number) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      error: `Tempo limite excedido ao consultar o burd-agent (${timeoutMs} ms).`,
      errorKind: "timeout" as const,
    };
  }

  if (error instanceof Error && error.message.trim()) {
    if (isAgentOfflineError(error.message)) {
      return {
        error: "Burd Agent não encontrado.",
        errorKind: "offline" as const,
      };
    }

    return {
      error: error.message,
      errorKind: "unknown" as const,
    };
  }

  return {
    error: "Burd Agent não encontrado.",
    errorKind: "offline" as const,
  };
}

function normalizeSignedReportPayload(
  payload?: SignedReportResult | Record<string, unknown> | null,
) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if ("signed_report" in payload && payload.signed_report) {
    return { signed_report: payload.signed_report };
  }

  return { signed_report: payload };
}

function normalizeChallengePayload(
  payload?:
    | ChallengeCreateResult
    | ChallengeRunResult
    | ChallengeInfo
    | Record<string, unknown>
    | null,
) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if ("challenge" in payload && payload.challenge) {
    return { challenge: payload.challenge };
  }

  return payload;
}

export { postJson, requestJson };

export function getHealth() {
  return requestJson<HealthInfo>("/health", { timeoutMs: 4000 });
}

export function getSystem() {
  return requestJson<SystemInfo>("/api/v1/system", { timeoutMs: 10000 });
}

export function getFit() {
  return requestJson<FitInfo>("/api/v1/fit", { timeoutMs: 15000 });
}

export function getScore() {
  return requestJson<ScoreInfo>("/api/v1/score", { timeoutMs: 15000 });
}

export function getReport() {
  return requestJson<ReportInfo>("/api/v1/report", { timeoutMs: 20000 });
}

export function getProvider() {
  return requestJson<ProviderInfo>("/api/v1/provider", { timeoutMs: 20000 });
}

export function getReadiness() {
  return requestJson<ReadinessInfo>("/api/v1/readiness", { timeoutMs: 12000 });
}

export function getVerification() {
  return requestJson<VerificationInfo>("/api/v1/verification", { timeoutMs: 12000 });
}

export function getUptime() {
  return requestJson<UptimeInfo>("/api/v1/uptime", { timeoutMs: 8000 });
}

export function getHistory() {
  return requestJson<BenchmarkHistoryInfo>("/api/v1/history", { timeoutMs: 8000 });
}

export function getRegistrationPayload() {
  return requestJson<RegistrationPayload>("/api/v1/registration-payload", {
    timeoutMs: 15000,
  });
}

export function getPricing() {
  return requestJson<PricingInfo>("/api/v1/pricing", { timeoutMs: 15000 });
}

export function getEarnings() {
  return requestJson<EarningsInfo>("/api/v1/earnings", { timeoutMs: 15000 });
}

export function getActions() {
  return requestJson<AgentActionLog[]>("/api/v1/actions", { timeoutMs: 8000 });
}

export function getLogs() {
  return requestJson<AgentLogItem[]>("/api/v1/logs", { timeoutMs: 8000 });
}

export function getRaw() {
  return requestJson<RawAgentData>("/api/v1/raw", { timeoutMs: 20000 });
}

export function getConfig() {
  return requestJson<AgentConfigInfo>("/api/v1/config", { timeoutMs: 12000 });
}

export function getIdentity() {
  return requestJson<ProviderIdentity>("/api/v1/identity", { timeoutMs: 8000 });
}

export function initIdentity() {
  return postJson<IdentityInitResult>("/api/v1/identity/init", {}, 60000);
}

export function rotateIdentity(confirm = true) {
  return postJson<IdentityRotateResult>(
    "/api/v1/identity/rotate",
    { confirm },
    60000,
  );
}

export function runBenchmark() {
  return postJson<BenchmarkRunResult>("/api/v1/benchmark/run", {}, 300000);
}

export function getBenchmarkStatus() {
  return requestJson<BenchmarkStatus>("/api/v1/benchmark/status", {
    timeoutMs: 6000,
  });
}

export function generateSignedReport(runAll?: boolean) {
  const queryParam = typeof runAll === "boolean" ? `?run_all=${runAll}` : "";
  return postJson<SignedReportResult>(`/api/v1/report/signed${queryParam}`, {}, 300000);
}

export function verifySignedReport(
  report?: SignedReportResult | Record<string, unknown> | null,
) {
  return postJson<ReportVerificationResult>(
    "/api/v1/report/verify",
    normalizeSignedReportPayload(report),
    120000,
  );
}

export function createMockChallenge(profile = "profile_8gb") {
  return postJson<ChallengeCreateResult>(
    "/api/v1/challenge/create-mock",
    { profile },
    30000,
  );
}

export function runChallenge(
  challenge?:
    | ChallengeCreateResult
    | ChallengeRunResult
    | ChallengeInfo
    | Record<string, unknown>
    | null,
) {
  return postJson<ChallengeRunResult>(
    "/api/v1/challenge/run",
    normalizeChallengePayload(challenge),
    300000,
  );
}

export function verifyChallenge(
  challengeResult?: ChallengeRunResult | Record<string, unknown> | null,
) {
  return postJson<ChallengeVerifyResult>(
    "/api/v1/challenge/verify",
    challengeResult ?? {},
    120000,
  );
}

export function verifyProvider() {
  return postJson<ProviderVerificationResult>(
    "/api/v1/provider/verify",
    {},
    120000,
  );
}

export function probeProtectedAccess() {
  return requestJson<AgentConfigInfo>("/api/v1/config", { timeoutMs: 15000 });
}
