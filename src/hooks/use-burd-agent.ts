import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMockChallenge as createMockChallengeRequest,
  getAgentApiToken,
  generateSignedReport as generateSignedReportRequest,
  getActions,
  getBenchmarkStatus,
  getConfig,
  getEarnings,
  getFit,
  getHealth,
  getHistory,
  getIdentity,
  getLogs,
  getPricing,
  getProvider,
  getRaw,
  getReadiness,
  getRegistrationPayload,
  getReport,
  getScore,
  getSystem,
  getUptime,
  getVerification,
  initIdentity as initIdentityRequest,
  isAgentOfflineError,
  isTokenRequiredError,
  isUnauthorizedError,
  probeProtectedAccess as probeProtectedAccessRequest,
  rotateIdentity as rotateIdentityRequest,
  runBenchmark as runBenchmarkRequest,
  runChallenge as runChallengeRequest,
  verifyChallenge as verifyChallengeRequest,
  verifyProvider as verifyProviderRequest,
  verifySignedReport as verifySignedReportRequest,
  type AgentRequestErrorKind,
  type AgentRequestResult,
} from "../lib/burd-agent-client";
import type {
  AgentConfigInfo,
  BenchmarkHistoryInfo,
  BenchmarkRunResult,
  BenchmarkStatus,
  BurdAgentSnapshot,
  ChallengeCreateResult,
  ChallengeRunResult,
  ChallengeVerifyResult,
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
  UptimeInfo,
  VerificationInfo,
} from "../types/burd-agent";

export type BurdAgentConnectionStatus =
  | "checking"
  | "online"
  | "offline"
  | "error";

export type BurdAgentApiAuthStatus =
  | "unknown"
  | "not_required"
  | "authenticated"
  | "token_required"
  | "invalid_token";

type BurdAgentActionName =
  | "initIdentity"
  | "rotateIdentity"
  | "runBenchmark"
  | "generateSignedReport"
  | "verifySignedReport"
  | "createMockChallenge"
  | "runChallenge"
  | "verifyChallenge"
  | "verifyProvider";

interface UseBurdAgentOptions {
  enabled?: boolean;
  includeDetails?: boolean;
  pollIntervalMs?: number;
}

interface RefreshOptions {
  silent?: boolean;
}

export interface BurdAgentLastActionResult {
  action: BurdAgentActionName;
  status: "success" | "error";
  message: string;
  data: unknown;
  timestamp: string;
}

export interface UseBurdAgentResult {
  apiAuthStatus: BurdAgentApiAuthStatus;
  status: BurdAgentConnectionStatus;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  errorKind: AgentRequestErrorKind | null;
  errorStatusCode: number | null;
  actionError: string | null;
  actionErrorKind: AgentRequestErrorKind | null;
  actionErrorStatusCode: number | null;
  invalidToken: boolean;
  tokenRequired: boolean;
  data: BurdAgentSnapshot;
  lastUpdatedAt: string | null;
  lastActionResult: BurdAgentLastActionResult | null;
  isInitializingIdentity: boolean;
  isRotatingIdentity: boolean;
  isGeneratingReport: boolean;
  isVerifyingReport: boolean;
  isRunningChallenge: boolean;
  isVerifyingProvider: boolean;
  clearTransientState: () => void;
  refresh: (options?: RefreshOptions) => Promise<void>;
  refreshProvider: (options?: RefreshOptions) => Promise<void>;
  refreshReadiness: (options?: RefreshOptions) => Promise<void>;
  refreshHistory: (options?: RefreshOptions) => Promise<void>;
  refreshRegistrationPayload: (options?: RefreshOptions) => Promise<void>;
  refreshLogs: (options?: RefreshOptions) => Promise<void>;
  refreshRaw: (options?: RefreshOptions) => Promise<void>;
  refreshBenchmarkStatus: (
    options?: RefreshOptions,
  ) => Promise<AgentRequestResult<BenchmarkStatus>>;
  initIdentity: () => Promise<AgentRequestResult<IdentityInitResult>>;
  rotateIdentity: () => Promise<AgentRequestResult<IdentityRotateResult>>;
  runBenchmark: () => Promise<AgentRequestResult<BenchmarkRunResult>>;
  generateSignedReport: (runAll?: boolean) => Promise<AgentRequestResult<SignedReportResult>>;
  verifySignedReport: (
    report?: SignedReportResult | Record<string, unknown> | null,
  ) => Promise<AgentRequestResult<ReportVerificationResult>>;
  createMockChallenge: (
    profile?: string,
  ) => Promise<AgentRequestResult<ChallengeCreateResult>>;
  runChallenge: (
    challenge?: ChallengeCreateResult | ChallengeRunResult | Record<string, unknown> | null,
  ) => Promise<AgentRequestResult<ChallengeRunResult>>;
  verifyChallenge: (
    challengeResult?: ChallengeRunResult | Record<string, unknown> | null,
  ) => Promise<AgentRequestResult<ChallengeVerifyResult>>;
  verifyProvider: () => Promise<AgentRequestResult<ProviderVerificationResult>>;
  probeProtectedAccess: () => Promise<AgentRequestResult<AgentConfigInfo>>;
}

function createEmptySnapshot(): BurdAgentSnapshot {
  return {
    health: null,
    system: null,
    fit: null,
    provider: null,
    identity: null,
    verification: null,
    readiness: null,
    score: null,
    report: null,
    signedReport: null,
    reportVerification: null,
    mockChallenge: null,
    challengeRun: null,
    challengeVerification: null,
    providerVerification: null,
    history: null,
    registrationPayload: null,
    config: null,
    uptime: null,
    pricing: null,
    earnings: null,
    actions: [],
    logs: [],
    raw: null,
    benchmarkStatus: null,
  };
}

function normalizeConnectionState(error: string | null): BurdAgentConnectionStatus {
  if (!error) {
    return "offline";
  }

  return isAgentOfflineError(error) ? "offline" : "error";
}

function buildApiAuthMessage(status: BurdAgentApiAuthStatus) {
  switch (status) {
    case "token_required":
      return "API local protegida. Configure ou rotacione o token para continuar.";
    case "invalid_token":
      return "Token local inválido. Rotacione o token para continuar.";
    default:
      return null;
  }
}

function resolveApiAuthStatusFromResults(
  results: Array<AgentRequestResult<unknown>>,
  { allowSuccessInference = false }: { allowSuccessInference?: boolean } = {},
): BurdAgentApiAuthStatus | null {
  if (results.some((result) => isUnauthorizedError(result))) {
    return "invalid_token";
  }

  if (results.some((result) => isTokenRequiredError(result))) {
    return "token_required";
  }

  if (allowSuccessInference && results.some((result) => result.ok)) {
    return getAgentApiToken() ? "authenticated" : "not_required";
  }

  return null;
}

function findFailedResult(
  results: Array<AgentRequestResult<unknown>>,
): AgentRequestResult<unknown> | null {
  return results.find((result) => !result.ok && result.error) ?? null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeIdentityFromInitResult(result: IdentityInitResult): ProviderIdentity {
  const identity =
    result.identity && typeof result.identity === "object"
      ? (result.identity as Record<string, unknown>)
      : {};

  return {
    exists: true,
    status: "ready",
    provider_id: asNullableString(result.provider_id) ?? asNullableString(identity.provider_id),
    machine_id: asNullableString(result.machine_id) ?? asNullableString(identity.machine_id),
    public_key: asNullableString(result.public_key) ?? asNullableString(identity.public_key),
    key_algorithm:
      asNullableString(result.key_algorithm) ?? asNullableString(identity.key_algorithm),
    created_at: asNullableString(result.created_at) ?? asNullableString(identity.created_at),
    config_path: typeof result.config_path === "string" ? result.config_path : undefined,
    key_status: "ready",
  };
}

function normalizeIdentityFromRotateResult(
  result: IdentityRotateResult,
): ProviderIdentity {
  return {
    exists: true,
    status: "ready",
    provider_id: asNullableString(result.provider_id),
    machine_id: asNullableString(result.machine_id),
    public_key: asNullableString(result.public_key),
    key_algorithm: asNullableString(result.key_algorithm),
    created_at: asNullableString(result.created_at),
    config_path: typeof result.config_path === "string" ? result.config_path : undefined,
    key_status: typeof result.key_status === "string" ? result.key_status : undefined,
  };
}

function mergeProviderData(snapshot: BurdAgentSnapshot, provider: ProviderInfo | null) {
  if (!provider) {
    return snapshot;
  }

  return {
    ...snapshot,
    provider,
    score:
      provider.score && typeof provider.score === "object"
        ? provider.score
        : snapshot.score,
    pricing:
      provider.pricing && typeof provider.pricing === "object"
        ? provider.pricing
        : snapshot.pricing,
    earnings:
      provider.estimated_earnings && typeof provider.estimated_earnings === "object"
        ? provider.estimated_earnings
        : snapshot.earnings,
    verification:
      provider.verification && typeof provider.verification === "object"
        ? provider.verification
        : snapshot.verification,
    uptime:
      provider.uptime && typeof provider.uptime === "object"
        ? provider.uptime
        : snapshot.uptime,
  };
}

function coerceSignedReport(value: unknown): SignedReportResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as SignedReportResult;
}

function coerceReportVerification(value: unknown): ReportVerificationResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("verification_result" in value && value.verification_result) {
    return value.verification_result as ReportVerificationResult;
  }

  return value as ReportVerificationResult;
}

function coerceChallengeVerification(value: unknown): ChallengeVerifyResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("verification" in value && value.verification) {
    return value.verification as ChallengeVerifyResult;
  }

  return value as ChallengeVerifyResult;
}

function extractReport(value: SignedReportResult | null): ReportInfo | null {
  if (!value || !value.report || typeof value.report !== "object") {
    return null;
  }
  return value.report as ReportInfo;
}

export function useBurdAgent({
  enabled = true,
  includeDetails = false,
  pollIntervalMs = 15000,
}: UseBurdAgentOptions = {}): UseBurdAgentResult {
  const [status, setStatus] = useState<BurdAgentConnectionStatus>(
    enabled ? "checking" : "offline",
  );
  const [apiAuthStatus, setApiAuthStatus] = useState<BurdAgentApiAuthStatus>("unknown");
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AgentRequestErrorKind | null>(null);
  const [errorStatusCode, setErrorStatusCode] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorKind, setActionErrorKind] =
    useState<AgentRequestErrorKind | null>(null);
  const [actionErrorStatusCode, setActionErrorStatusCode] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] =
    useState<BurdAgentLastActionResult | null>(null);
  const [isInitializingIdentity, setIsInitializingIdentity] = useState(false);
  const [isRotatingIdentity, setIsRotatingIdentity] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isVerifyingReport, setIsVerifyingReport] = useState(false);
  const [isRunningChallenge, setIsRunningChallenge] = useState(false);
  const [isVerifyingProvider, setIsVerifyingProvider] = useState(false);
  const [data, setData] = useState<BurdAgentSnapshot>(createEmptySnapshot);
  const hasLoadedRef = useRef(false);

  const setActionOutcome = useCallback(
    (
      action: BurdAgentActionName,
      actionStatus: "success" | "error",
      message: string,
      payload: unknown,
      details?: {
        errorKind?: AgentRequestErrorKind | null;
        statusCode?: number;
      },
    ) => {
      setActionError(actionStatus === "error" ? message : null);
      setActionErrorKind(actionStatus === "error" ? details?.errorKind ?? null : null);
      setActionErrorStatusCode(
        actionStatus === "error" ? details?.statusCode ?? null : null,
      );
      setLastActionResult({
        action,
        status: actionStatus,
        message,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    },
    [],
  );

  const clearTransientState = useCallback(() => {
    setError(null);
    setErrorKind(null);
    setErrorStatusCode(null);
    setActionError(null);
    setActionErrorKind(null);
    setActionErrorStatusCode(null);
    setLastActionResult(null);
  }, []);

  const refreshProvider = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      const result = await getProvider();
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([result]);

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      setData((current) =>
        mergeProviderData(
          {
            ...current,
            provider: result.ok && result.data ? result.data : current.provider,
          },
          result.ok ? result.data : current.provider,
        ),
      );

      if (!result.ok && result.error && !silent) {
        setError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? result.error);
        setErrorKind(result.errorKind ?? null);
        setErrorStatusCode(result.statusCode ?? null);
      } else if (!silent) {
        setErrorKind(null);
        setErrorStatusCode(null);
      }
    },
    [],
  );

  const refreshReadiness = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      const [readinessResult, verificationResult] = await Promise.all([
        getReadiness(),
        getVerification(),
      ]);
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([
        readinessResult,
        verificationResult,
      ]);
      const failedResult = findFailedResult([readinessResult, verificationResult]);

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      setData((current) => ({
        ...current,
        readiness:
          readinessResult.ok && readinessResult.data
            ? readinessResult.data
            : current.readiness,
        verification:
          verificationResult.ok && verificationResult.data
            ? verificationResult.data
            : current.verification,
      }));

      if (!silent && !readinessResult.ok && readinessResult.error) {
        setActionError(
          buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? readinessResult.error,
        );
        setActionErrorKind(failedResult?.errorKind ?? null);
        setActionErrorStatusCode(failedResult?.statusCode ?? null);
      } else if (!silent) {
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }
    },
    [],
  );

  const refreshHistory = useCallback(async ({ silent = false }: RefreshOptions = {}) => {
    const result = await getHistory();
    const nextApiAuthStatus = resolveApiAuthStatusFromResults([result]);

    if (nextApiAuthStatus) {
      setApiAuthStatus(nextApiAuthStatus);
    }

    setData((current) => ({
      ...current,
      history: result.ok && result.data ? result.data : current.history,
    }));

    if (!silent && !result.ok && result.error) {
      setActionError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? result.error);
      setActionErrorKind(result.errorKind ?? null);
      setActionErrorStatusCode(result.statusCode ?? null);
    } else if (!silent) {
      setActionErrorKind(null);
      setActionErrorStatusCode(null);
    }
  }, []);

  const refreshRegistrationPayload = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      const result = await getRegistrationPayload();
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([result]);

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      setData((current) => ({
        ...current,
        registrationPayload:
          result.ok && result.data ? result.data : current.registrationPayload,
      }));

      if (!silent && !result.ok && result.error) {
        setActionError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? result.error);
        setActionErrorKind(result.errorKind ?? null);
        setActionErrorStatusCode(result.statusCode ?? null);
      } else if (!silent) {
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }
    },
    [],
  );

  const refreshLogs = useCallback(async ({ silent = false }: RefreshOptions = {}) => {
    const [actionsResult, logsResult] = await Promise.all([getActions(), getLogs()]);
    const nextApiAuthStatus = resolveApiAuthStatusFromResults([actionsResult, logsResult]);
    const failedResult = findFailedResult([actionsResult, logsResult]);

    if (nextApiAuthStatus) {
      setApiAuthStatus(nextApiAuthStatus);
    }

    setData((current) => ({
      ...current,
      actions:
        actionsResult.ok && actionsResult.data ? actionsResult.data : current.actions,
      logs: logsResult.ok && logsResult.data ? logsResult.data : current.logs,
    }));

    if (!silent) {
      const failed = [actionsResult, logsResult].find(
        (result) => !result.ok && result.error,
      );
      if (failed?.error) {
        setActionError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? failed.error);
        setActionErrorKind(failedResult?.errorKind ?? null);
        setActionErrorStatusCode(failedResult?.statusCode ?? null);
      } else {
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }
    }
  }, []);

  const refreshRaw = useCallback(async ({ silent = false }: RefreshOptions = {}) => {
    const [rawResult, configResult, reportResult] = await Promise.all([
      getRaw(),
      getConfig(),
      getReport(),
    ]);
    const nextApiAuthStatus = resolveApiAuthStatusFromResults([
      rawResult,
      configResult,
      reportResult,
    ], { allowSuccessInference: true });
    const failedResult = findFailedResult([rawResult, configResult, reportResult]);

    if (nextApiAuthStatus) {
      setApiAuthStatus(nextApiAuthStatus);
    }

    setData((current) => {
      const signedReportFromRaw = rawResult.ok
        ? coerceSignedReport(rawResult.data?.latest_signed_report_summary)
        : null;

      return {
        ...current,
        raw: rawResult.ok && rawResult.data ? rawResult.data : current.raw,
        config: configResult.ok && configResult.data ? configResult.data : current.config,
        report: reportResult.ok && reportResult.data ? reportResult.data : current.report,
        signedReport: signedReportFromRaw ?? current.signedReport,
      };
    });

    if (!silent) {
      const failed = [rawResult, configResult, reportResult].find(
        (result) => !result.ok && result.error,
      );
      if (failed?.error) {
        setActionError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? failed.error);
        setActionErrorKind(failedResult?.errorKind ?? null);
        setActionErrorStatusCode(failedResult?.statusCode ?? null);
      } else {
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }
    }
  }, []);

  const refreshBenchmarkStatus = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      const result = await getBenchmarkStatus();
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([result]);

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      setData((current) => ({
        ...current,
        benchmarkStatus:
          result.ok && result.data ? result.data : current.benchmarkStatus,
      }));

      if (!silent && !result.ok && result.error) {
        setActionError(buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? result.error);
        setActionErrorKind(result.errorKind ?? null);
        setActionErrorStatusCode(result.statusCode ?? null);
      } else if (!silent) {
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }

      return result;
    },
    [],
  );

  const refresh = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      if (!enabled) {
        setStatus("offline");
        setApiAuthStatus("unknown");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!silent) {
        if (!hasLoadedRef.current) {
          setLoading(true);
          setRefreshing(false);
        } else {
          setRefreshing(true);
        }
      }

      if (!hasLoadedRef.current) {
        setStatus("checking");
      }

      setError(null);
      setErrorKind(null);
      setErrorStatusCode(null);

      const healthResult = await getHealth();
      if (!healthResult.ok || !healthResult.data) {
        setData(createEmptySnapshot());
        setStatus(normalizeConnectionState(healthResult.error));
        setApiAuthStatus("unknown");
        setError(
          healthResult.error ?? "Não foi possível verificar o burd-agent local.",
        );
        setErrorKind(healthResult.errorKind ?? null);
        setErrorStatusCode(healthResult.statusCode ?? null);
        hasLoadedRef.current = true;
        setLoading(false);
        setRefreshing(false);
        setLastUpdatedAt(new Date().toISOString());
        return;
      }

      setStatus("online");
      setData((current) => ({ ...current, health: healthResult.data as HealthInfo }));

      if (!includeDetails) {
        setLoading(false);
        setRefreshing(false);
        hasLoadedRef.current = true;
        setLastUpdatedAt(new Date().toISOString());
        return;
      }

      const [
        identityResult,
        systemResult,
        fitResult,
        providerResult,
        benchmarkStatusResult,
        actionsResult,
        logsResult,
      ] = await Promise.all([
        getIdentity(),
        getSystem(),
        getFit(),
        getProvider(),
        getBenchmarkStatus(),
        getActions(),
        getLogs(),
      ]);
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([
        identityResult,
        systemResult,
        fitResult,
        providerResult,
        benchmarkStatusResult,
        actionsResult,
        logsResult,
      ]);
      const failedResult = findFailedResult([
        identityResult,
        systemResult,
        fitResult,
        providerResult,
        benchmarkStatusResult,
        actionsResult,
        logsResult,
      ]);
      const apiAuthMessage = buildApiAuthMessage(nextApiAuthStatus ?? "unknown");

      const primaryErrors = [
        identityResult,
        systemResult,
        providerResult,
        benchmarkStatusResult,
      ]
        .filter((result) => !result.ok && result.error)
        .map((result) => result.error as string);

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      setData((current) => {
        const providerSnapshot = mergeProviderData(
          {
            ...current,
            health: healthResult.data as HealthInfo,
            identity:
              identityResult.ok && identityResult.data
                ? identityResult.data
                : current.identity,
            system:
              systemResult.ok && systemResult.data
                ? systemResult.data
                : current.system,
            fit: fitResult.ok && fitResult.data ? fitResult.data : current.fit,
            provider:
              providerResult.ok && providerResult.data
                ? providerResult.data
                : current.provider,
            benchmarkStatus:
              benchmarkStatusResult.ok && benchmarkStatusResult.data
                ? benchmarkStatusResult.data
                : current.benchmarkStatus,
            actions:
              actionsResult.ok && actionsResult.data
                ? actionsResult.data
                : current.actions,
            logs:
              logsResult.ok && logsResult.data ? logsResult.data : current.logs,
          },
          providerResult.ok ? providerResult.data : current.provider,
        );

        return providerSnapshot;
      });

      setError(
        apiAuthMessage ??
          (primaryErrors.length > 0
          ? `Alguns dados principais do provider não puderam ser carregados: ${primaryErrors.join(" | ")}`
          : null),
      );
      setErrorKind(
        apiAuthMessage || primaryErrors.length > 0 ? failedResult?.errorKind ?? null : null,
      );
      setErrorStatusCode(
        apiAuthMessage || primaryErrors.length > 0 ? failedResult?.statusCode ?? null : null,
      );
      if (!apiAuthMessage && primaryErrors.length === 0) {
        setActionError(null);
        setActionErrorKind(null);
        setActionErrorStatusCode(null);
      }

      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
      setLastUpdatedAt(new Date().toISOString());

      if (!apiAuthMessage) {
        void Promise.allSettled([
          refreshReadiness({ silent: true }),
          refreshHistory({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshRaw({ silent: true }),
          refreshProvider({ silent: true }),
        ]);
      }
    },
    [
      enabled,
      includeDetails,
      refreshHistory,
      refreshProvider,
      refreshRaw,
      refreshReadiness,
      refreshRegistrationPayload,
    ],
  );

  const withAction = useCallback(
    async <T,>(
      action: BurdAgentActionName,
      run: () => Promise<AgentRequestResult<T>>,
      onSuccess: (result: AgentRequestResult<T>) => Promise<void> | void,
      successMessage: string,
      fallbackError: string,
      { protectedRequest = false }: { protectedRequest?: boolean } = {},
    ) => {
      setActionError(null);
      setActionErrorKind(null);
      setActionErrorStatusCode(null);
      const result = await run();
      const nextApiAuthStatus = resolveApiAuthStatusFromResults([result], {
        allowSuccessInference: protectedRequest,
      });

      if (nextApiAuthStatus) {
        setApiAuthStatus(nextApiAuthStatus);
      }

      if (result.ok) {
        await onSuccess(result);
        setActionOutcome(action, "success", successMessage, result.data);
      } else {
        setActionOutcome(
          action,
          "error",
          buildApiAuthMessage(nextApiAuthStatus ?? "unknown") ?? result.error ?? fallbackError,
          result.data,
          {
            errorKind: result.errorKind ?? null,
            statusCode: result.statusCode,
          },
        );
      }

      return result;
    },
    [setActionOutcome],
  );

  const initIdentity = useCallback(async () => {
    setIsInitializingIdentity(true);
    const result = await withAction(
      "initIdentity",
      () => initIdentityRequest(),
      async (actionResult) => {
        const nextIdentity = actionResult.data;
        if (nextIdentity) {
          setData((current) => ({
            ...current,
            identity: normalizeIdentityFromInitResult(nextIdentity),
          }));
        }
        await Promise.all([
          refreshProvider({ silent: true }),
          refreshReadiness({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshRaw({ silent: true }),
        ]);
      },
      "Identidade local criada com sucesso.",
      "Não foi possível criar a identidade local.",
      { protectedRequest: true },
    );
    setIsInitializingIdentity(false);
    return result;
  }, [refreshProvider, refreshRaw, refreshReadiness, refreshRegistrationPayload, withAction]);

  const rotateIdentity = useCallback(async () => {
    setIsRotatingIdentity(true);
    const result = await withAction(
      "rotateIdentity",
      () => rotateIdentityRequest(true),
      async (actionResult) => {
        const nextIdentity = actionResult.data;
        if (nextIdentity) {
          setData((current) => ({
            ...current,
            identity: normalizeIdentityFromRotateResult(nextIdentity),
          }));
        }
        await Promise.all([
          refreshProvider({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshRaw({ silent: true }),
        ]);
      },
      "Chave local rotacionada com sucesso.",
      "Não foi possível rotacionar a chave local.",
      { protectedRequest: true },
    );
    setIsRotatingIdentity(false);
    return result;
  }, [refreshProvider, refreshRaw, refreshRegistrationPayload, withAction]);

  const runBenchmark = useCallback(async () => {
    setData((current) => ({
      ...current,
      benchmarkStatus: {
        ...current.benchmarkStatus,
        status: "running",
      },
    }));

    const result = await withAction(
      "runBenchmark",
      () => runBenchmarkRequest(),
      async (actionResult) => {
        setData((current) => ({
          ...current,
          benchmarkStatus: actionResult.data
            ? {
                status: actionResult.data.status,
                last_report: actionResult.data.report,
              }
            : current.benchmarkStatus,
        }));
        await Promise.all([
          refreshBenchmarkStatus({ silent: true }),
          refreshProvider({ silent: true }),
          refreshReadiness({ silent: true }),
          refreshHistory({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshRaw({ silent: true }),
        ]);
      },
      "Benchmark concluído. Isso pode levar alguns minutos em máquinas mais lentas.",
      "Falha ao rodar o benchmark local.",
      { protectedRequest: true },
    );

    if (!result.ok) {
      setData((current) => ({
        ...current,
        benchmarkStatus: {
          ...current.benchmarkStatus,
          status: "failed",
        },
      }));
    }

    return result;
  }, [refreshBenchmarkStatus, refreshHistory, refreshProvider, refreshRaw, refreshReadiness, refreshRegistrationPayload, withAction]);

  const generateSignedReport = useCallback(async (runAll?: boolean) => {
    setIsGeneratingReport(true);
    const result = await withAction(
      "generateSignedReport",
      () => generateSignedReportRequest(runAll),
      async (actionResult) => {
        const signedReport = actionResult.data ?? null;
        setData((current) => ({
          ...current,
          signedReport,
          report: extractReport(signedReport) ?? current.report,
          reportVerification:
            signedReport?.verification_result ?? current.reportVerification,
        }));
        await Promise.all([
          refreshReadiness({ silent: true }),
          refreshHistory({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshRaw({ silent: true }),
          refreshProvider({ silent: true }),
        ]);
      },
      "Relatório assinado gerado com sucesso.",
      "Não foi possível gerar o relatório assinado.",
      { protectedRequest: true },
    );
    setIsGeneratingReport(false);
    return result;
  }, [refreshHistory, refreshProvider, refreshRaw, refreshReadiness, refreshRegistrationPayload, withAction]);

  const verifySignedReport = useCallback(
    async (report?: SignedReportResult | Record<string, unknown> | null) => {
      setIsVerifyingReport(true);
      const result = await withAction(
        "verifySignedReport",
        () => verifySignedReportRequest(report),
        async (actionResult) => {
          setData((current) => ({
            ...current,
            reportVerification:
              coerceReportVerification(actionResult.data) ?? current.reportVerification,
          }));
          await Promise.all([
            refreshReadiness({ silent: true }),
            refreshProvider({ silent: true }),
          ]);
        },
        "Relatório assinado verificado com sucesso.",
        "Não foi possível verificar o relatório assinado.",
        { protectedRequest: true },
      );
      setIsVerifyingReport(false);
      return result;
    },
    [refreshProvider, refreshReadiness, withAction],
  );

  const createMockChallenge = useCallback(
    async (profile = "profile_8gb") => {
      setIsRunningChallenge(true);
      const result = await withAction(
        "createMockChallenge",
        () => createMockChallengeRequest(profile),
        (actionResult) => {
          setData((current) => ({
            ...current,
            mockChallenge: actionResult.data ?? current.mockChallenge,
          }));
        },
        "Challenge mock criado com sucesso.",
        "Não foi possível criar o challenge mock.",
      );
      setIsRunningChallenge(false);
      return result;
    },
    [withAction],
  );

  const runChallenge = useCallback(
    async (
      challenge?:
        | ChallengeCreateResult
        | ChallengeRunResult
        | Record<string, unknown>
        | null,
    ) => {
      setIsRunningChallenge(true);
      const result = await withAction(
        "runChallenge",
        () => runChallengeRequest(challenge ?? data.mockChallenge),
        async (actionResult) => {
          const challengeVerification = coerceChallengeVerification(
            actionResult.data?.verification,
          );
          const signedReport = coerceSignedReport(actionResult.data?.signed_report);

          setData((current) => ({
            ...current,
            challengeRun: actionResult.data ?? current.challengeRun,
            challengeVerification:
              challengeVerification ?? current.challengeVerification,
            signedReport: signedReport ?? current.signedReport,
            report: extractReport(signedReport) ?? current.report,
          }));

          await Promise.all([
            refreshReadiness({ silent: true }),
            refreshHistory({ silent: true }),
            refreshRegistrationPayload({ silent: true }),
            refreshRaw({ silent: true }),
            refreshProvider({ silent: true }),
          ]);
        },
        "Challenge executado localmente com sucesso.",
        "Não foi possível rodar o challenge local.",
        { protectedRequest: true },
      );
      setIsRunningChallenge(false);
      return result;
    },
    [data.mockChallenge, refreshHistory, refreshProvider, refreshRaw, refreshReadiness, refreshRegistrationPayload, withAction],
  );

  const verifyChallenge = useCallback(
    async (challengeResult?: ChallengeRunResult | Record<string, unknown> | null) => {
      setIsRunningChallenge(true);
      const result = await withAction(
        "verifyChallenge",
        () => verifyChallengeRequest(challengeResult ?? data.challengeRun),
        async (actionResult) => {
          setData((current) => ({
            ...current,
            challengeVerification:
              coerceChallengeVerification(actionResult.data) ??
              current.challengeVerification,
          }));
          await Promise.all([
            refreshReadiness({ silent: true }),
            refreshProvider({ silent: true }),
          ]);
        },
        "Challenge validado localmente.",
        "Não foi possível verificar a resposta do challenge.",
        { protectedRequest: true },
      );
      setIsRunningChallenge(false);
      return result;
    },
    [data.challengeRun, refreshProvider, refreshReadiness, withAction],
  );

  const verifyProvider = useCallback(async () => {
    setIsVerifyingProvider(true);
    const result = await withAction(
      "verifyProvider",
      () => verifyProviderRequest(),
      async (actionResult) => {
        setData((current) => ({
          ...current,
          providerVerification:
            actionResult.data ?? current.providerVerification,
        }));
        await Promise.all([
          refreshReadiness({ silent: true }),
          refreshRegistrationPayload({ silent: true }),
          refreshHistory({ silent: true }),
          refreshProvider({ silent: true }),
        ]);
      },
      "Esta máquina foi reavaliada localmente com sucesso.",
      "Não foi possível verificar o provider local.",
    );
    setIsVerifyingProvider(false);
    return result;
  }, [refreshHistory, refreshProvider, refreshReadiness, refreshRegistrationPayload, withAction]);

  const probeProtectedAccess = useCallback(async () => {
    const result = await probeProtectedAccessRequest();
    const nextApiAuthStatus = resolveApiAuthStatusFromResults([result], {
      allowSuccessInference: true,
    });

    if (nextApiAuthStatus) {
      setApiAuthStatus(nextApiAuthStatus);
    }

    return result;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, pollIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, pollIntervalMs, refresh]);

  useEffect(() => {
    if (status !== "online" || data.benchmarkStatus?.status !== "running") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshBenchmarkStatus({ silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [data.benchmarkStatus?.status, refreshBenchmarkStatus, status]);

  return {
    apiAuthStatus,
    status,
    loading,
    refreshing,
    error,
    errorKind,
    errorStatusCode,
    actionError,
    actionErrorKind,
    actionErrorStatusCode,
    invalidToken: apiAuthStatus === "invalid_token",
    tokenRequired: apiAuthStatus === "token_required",
    data,
    lastUpdatedAt,
    lastActionResult,
    isInitializingIdentity,
    isRotatingIdentity,
    isGeneratingReport,
    isVerifyingReport,
    isRunningChallenge,
    isVerifyingProvider,
    clearTransientState,
    refresh,
    refreshProvider,
    refreshReadiness,
    refreshHistory,
    refreshRegistrationPayload,
    refreshLogs,
    refreshRaw,
    refreshBenchmarkStatus,
    initIdentity,
    rotateIdentity,
    runBenchmark,
    generateSignedReport,
    verifySignedReport,
    createMockChallenge,
    runChallenge,
    verifyChallenge,
    verifyProvider,
    probeProtectedAccess,
  };
}
