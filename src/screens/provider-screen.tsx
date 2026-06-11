import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Database,
  FileClock,
  Gauge,
  HardDrive,
  KeyRound,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ServerCog,
  ShieldCheck,
  ShieldQuestion,
  TerminalSquare,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  BURD_AGENT_BASE_URL,
  BURD_AGENT_BINARY_COMMAND,
  BURD_AGENT_CARGO_COMMAND,
  isAgentOfflineError,
  isEndpointNotFoundError,
  isEndpointServerError,
  isTokenRequiredError,
  isUnauthorizedError,
  redactSensitiveJson,
  getIdentity,
  getProvider,
  getReadiness,
  getRegistrationPayload,
  getReport,
  type AgentRequestResult,
} from "../lib/burd-agent-client";
import type { AgentBinaryDiagnostics } from "../lib/agent-manager-client";
import type {
  AgentActionTask,
  AgentActionLog,
  AgentLogItem,
  BenchmarkHistoryItem,
  ChallengeRunResult,
  ChallengeVerifyResult,
  ProviderVerificationResult,
  RawAgentData,
  ReadinessCheck,
  RegistrationPayload,
  SignedReportResult,
} from "../types/burd-agent";
import type {
  UseBurdAgentResult,
} from "../hooks/use-burd-agent";
import type { UseAgentManagerResult } from "../hooks/use-agent-manager";

interface ProviderScreenProps {
  agentManager: UseAgentManagerResult;
  burdAgent: UseBurdAgentResult;
}

type FlowStepState = "pending" | "ready" | "running" | "error" | "warning";
type ValidationStepState = "pending" | "running" | "passed" | "warning" | "failed";
type ValidationRunStatus = "idle" | "running" | "success" | "partial" | "failed";
type ProviderMainState =
  | "offline"
  | "transport_error"
  | "api_protected"
  | "token_invalid"
  | "idle"
  | "validating"
  | "success"
  | "partial"
  | "failed";
type ValidationStepId =
  | "agent"
  | "identity"
  | "hardware"
  | "benchmark"
  | "signedReport"
  | "challenge"
  | "providerVerification"
  | "readiness";

interface ActivityEntry {
  id: string;
  timestamp: string | null;
  type: string;
  status: string;
  message: string;
}

const validationSteps: Array<{ id: ValidationStepId; label: string }> = [
  { id: "agent", label: "Agent local" },
  { id: "identity", label: "Identidade" },
  { id: "hardware", label: "Hardware" },
  { id: "benchmark", label: "Benchmark" },
  { id: "signedReport", label: "Relatório assinado" },
  { id: "challenge", label: "Challenge" },
  { id: "providerVerification", label: "Provider verification" },
  { id: "readiness", label: "Readiness" },
];

class ValidationStepError extends Error {
  stepId: ValidationStepId;

  constructor(stepId: ValidationStepId, message: string) {
    super(message);
    this.name = "ValidationStepError";
    this.stepId = stepId;
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function logProviderValidationStep(
  stepId: ValidationStepId,
  status: "start" | "success" | "error",
  message?: string,
) {
  if (!import.meta.env.DEV) {
    return;
  }

  if (status === "success") {
    console.info(`[provider-flow] step=${stepId} success`);
  } else if (status === "start") {
    console.info(`[provider-flow] step=${stepId} running`);
  } else {
    console.warn(`[provider-flow] step=${stepId} failed | message=${message}`);
  }
}

function logProviderAuthState(details: {
  action: string;
  authEnabled: boolean;
  hasRuntimeToken: boolean;
  tokenConfigured: boolean;
}) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(
    `[provider-flow] step=ensureRuntimeBearerToken authEnabled=${details.authEnabled} tokenConfigured=${details.tokenConfigured} runtimeToken=${details.hasRuntimeToken} action=${details.action}`,
  );
}

export function hasValidIdentity(
  identity: any,
  provider?: any,
  readinessChecks?: any[] | null,
  registrationPayload?: any,
  signedReport?: any,
  reportVerification?: any,
): boolean {
  if (identity) {
    const pId = identity.provider_id || identity.providerId;
    const mId = identity.machine_id || identity.machineId;
    if (identity.exists === true && pId) return true;
    if (pId && mId) return true;
  }
  if (provider) {
    const pId = provider.provider_id || provider.providerId;
    const identityCheck = readinessChecks?.find(
      (c) => c.id === "identity" || c.id?.toLowerCase().includes("identity")
    );
    if (pId && identityCheck?.status === "passed") return true;
  }
  if (registrationPayload) {
    const pId = registrationPayload.provider_id || registrationPayload.providerId;
    const mId = registrationPayload.machine_id || registrationPayload.machineId;
    if (pId && mId) return true;
  }
  if (signedReport) {
    const pId = signedReport.provider_id || signedReport.providerId;
    const isReportValid = Boolean(
      reportVerification?.signature_valid || signedReport?.signature_valid_locally
    );
    if (pId && isReportValid) return true;
  }
  return false;
}

function getProviderMainState({
  agentOnline,
  apiAuthEnabled,
  currentError,
  hasRuntimeToken,
  healthOk,
  readinessStatus,
  tokenInvalid,
  validationRunStatus,
}: {
  agentOnline: boolean;
  apiAuthEnabled: boolean;
  currentError: string | null;
  hasRuntimeToken: boolean;
  healthOk: boolean;
  readinessStatus: string | undefined;
  tokenInvalid: boolean;
  validationRunStatus: ValidationRunStatus;
}): ProviderMainState {
  if (validationRunStatus === "running") {
    return "validating";
  }

  // Regra absoluta: offline só se o Agent Manager e o health falharem juntos
  if (!healthOk && !agentOnline) {
    return "offline";
  }

  // Se o manager diz online, mas a WebView falhou por transporte HTTP
  if (agentOnline && !healthOk) {
    return "transport_error";
  }

  if (isTokenRequiredError(currentError) || (apiAuthEnabled && !hasRuntimeToken)) {
    return "api_protected";
  }

  if (tokenInvalid || isUnauthorizedError(currentError)) {
    return "token_invalid";
  }

  if (readinessStatus === "ready_locally") {
    return "success";
  }

  if (validationRunStatus === "failed" || readinessStatus === "failed") {
    return "failed";
  }

  if (validationRunStatus === "partial" || readinessStatus === "partial") {
    return "partial";
  }

  if (currentError) {
    return "failed";
  }

  return "idle";
}

export function ProviderScreen({ agentManager, burdAgent }: ProviderScreenProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAgentLogs, setShowAgentLogs] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showPayloadJson, setShowPayloadJson] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [validationRunStatus, setValidationRunStatus] =
    useState<ValidationRunStatus>("idle");
  const [validationCurrentStep, setValidationCurrentStep] =
    useState<ValidationStepId | null>(null);
  const [validationFailedStep, setValidationFailedStep] =
    useState<ValidationStepId | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    actions,
    benchmarkStatus,
    challengeRun,
    challengeVerification,
    config,
    earnings,
    fit,
    health,
    history,
    identity,
    logs,
    mockChallenge,
    pricing,
    provider,
    providerVerification,
    raw,
    readiness,
    registrationPayload,
    reportVerification,
    score,
    signedReport,
    system,
    verification,
  } = burdAgent.data;

  const lastAction = burdAgent.lastActionResult;
  const activityEntries = useMemo(
    () => buildActivityEntries(actions, logs),
    [actions, logs],
  );
  const activeChallenge = challengeRun?.challenge ?? mockChallenge?.challenge ?? null;
  const activeChallengeVerification =
    challengeVerification ?? coerceChallengeVerification(challengeRun?.verification);
  const activeSignedReport = signedReport;
  const readinessChecks = readiness?.checks ?? [];
  const pendingReadinessChecks = readinessChecks.filter(
    (check) => check.status !== "passed",
  );
  const payloadJson = registrationPayload
    ? JSON.stringify(redactSensitiveJson(registrationPayload), null, 2)
    : "";
  const rawJson = raw ? JSON.stringify(redactSensitiveJson(raw), null, 2) : "";
  const latestHistory = history?.entries?.[history.entries.length - 1] ?? history?.latest ?? null;
  const agentLogs = agentManager.logs;
  const binaryDiagnostics = agentManager.binaryDiagnostics;
  const agentManagerStatus = agentManager.status?.status;
  const healthOk = health?.status === "ok";
  const agentOnline = healthOk || agentManager.isOnline || burdAgent.status === "online";
  const apiProtected = burdAgent.tokenRequired || burdAgent.invalidToken;
  const agentApiAuthEnabled = Boolean(agentManager.apiTokenStatus?.apiAuthEnabled);
  const apiTokenConfigured = Boolean(agentManager.apiTokenStatus?.tokenConfigured);
  const sessionMissingApiToken =
    agentOnline && agentApiAuthEnabled && !burdAgent.invalidToken && !agentManager.hasApiToken;
  const apiProtectionActive = apiProtected || sessionMissingApiToken;
  const shouldRotateApiToken =
    burdAgent.invalidToken ||
    apiTokenConfigured ||
    agentManager.hasApiToken;
  const apiTokenActionLabel = shouldRotateApiToken
    ? "Rotacionar token local"
    : "Configurar token local";
  const apiProtectionMessage = burdAgent.invalidToken
    ? "Um token já existe, mas o token configurado nesta sessão é inválido. Rotacione o token local para continuar."
    : apiTokenConfigured
      ? "Um token já existe, mas o app não possui o valor bruto para autenticar esta sessão. Rotacione o token local para continuar."
      : "O Burd Agent está online, mas exige token local para liberar os dados técnicos.";
  const agentDiagnosticMessage =
    agentManagerStatus === "failed"
      ? agentManager.error ?? agentManager.status?.lastError ?? agentManager.status?.message ?? null
      : agentManagerStatus === "missing"
        ? agentManager.resolution?.message ?? agentManager.status?.message ?? null
        : null;
  const resolvedBinaryPath =
    binaryDiagnostics?.resolvedBinaryPath ??
    agentManager.status?.binaryPath ??
    agentManager.resolution?.binaryPath ??
    "Indisponível";

  const agentStepState = resolveAgentStepState(agentManagerStatus, burdAgent.status);
  const identityReady = hasValidIdentity(
    identity,
    provider,
    readiness?.checks,
    registrationPayload,
    activeSignedReport,
    reportVerification,
  );
  const hardwareReady = Boolean(system?.cpu || system?.primary_gpu_name);
  const benchmarkEvidenceStatus = hasCompleteBenchmarkEvidence(activeSignedReport?.report, score);
  const benchmarkReady = benchmarkEvidenceStatus === "passed";
  const signedReportGenerated = Boolean(activeSignedReport?.report_hash);
  const signedReportVerified = Boolean(
    reportVerification?.signature_valid ||
      activeSignedReport?.signature_valid_locally ||
      activeSignedReport?.report_hash
  );
  const challengeReady = Boolean(activeChallengeVerification?.valid);
  const providerVerificationReady = Boolean(
    providerVerification?.status || providerVerification?.readiness_status,
  );
  const providerVerificationPassed = Boolean(
    providerVerification?.status === "ready_locally" ||
    providerVerification?.readiness_status === "ready_locally" ||
    (providerVerification && !providerVerification.error && providerVerification.status !== "failed")
  );
  const readinessReady = readiness?.status === "ready_locally";
  const readinessFailed =
    readiness?.status === "failed" || providerVerification?.status === "failed";
  const readinessPartial =
    Boolean(readiness?.status) && !readinessReady && !readinessFailed;
  const identityStepState = resolveFlowStepState({
    ready: identityReady,
    running: burdAgent.isInitializingIdentity || burdAgent.isRotatingIdentity,
    hasError: validationFailedStep === "identity",
  });
  const hardwareStepState = resolveFlowStepState({
    ready: hardwareReady,
  });
  const benchmarkStepState = resolveFlowStepState({
    ready: benchmarkReady,
    running: benchmarkStatus?.status === "running",
    hasError: validationFailedStep === "benchmark",
    warning: benchmarkEvidenceStatus === "warning",
  });
  const scoreStepState = resolveFlowStepState({
    ready: typeof score?.burd_compute_score === "number",
    warning: score?.eligible === false,
  });
  const signedReportStepState = resolveFlowStepState({
    ready: signedReportGenerated,
    running: burdAgent.isGeneratingReport || burdAgent.isVerifyingReport,
    hasError: validationFailedStep === "signedReport",
    warning:
      Boolean(reportVerification && reportVerification.signature_valid === false) ||
      Boolean(readinessChecks.find((check) => check.id === "signed_report" && check.status !== "passed")),
  });
  const challengeStepState = resolveFlowStepState({
    ready: challengeReady,
    running: burdAgent.isRunningChallenge,
    hasError: validationFailedStep === "challenge",
    warning:
      Boolean(activeChallenge) && !activeChallengeVerification?.valid && !burdAgent.isRunningChallenge,
  });
  const readinessStepState = resolveFlowStepState({
    ready: readinessReady,
    running: burdAgent.isVerifyingProvider,
    hasError: validationFailedStep === "providerVerification" || validationFailedStep === "readiness",
    warning: readinessPartial,
  });

  const benchmarkStages = buildBenchmarkStages(
    benchmarkStatus?.status,
    activeSignedReport?.report || benchmarkStatus?.last_report,
    score,
  );

  const validationErrorPayload = lastAction?.data
    ? JSON.stringify(redactSensitiveJson(lastAction.data), null, 2)
    : "";
  const getPartialStatusExplanation = () => {
    const list: string[] = [];
    if (!challengeReady) {
      list.push("Challenge evidence não persistida ou pendente");
    }
    const scoreWarnings = score?.warnings ?? [];
    if (scoreWarnings.some((w: string) => w.includes("LLM benchmark unavailable") || w.includes("llmfit TPS estimate"))) {
      list.push("LLM benchmark indisponível (usando estimativa fit)");
    }
    if (scoreWarnings.some((w: string) => w.includes("stability benchmark unavailable") || w.includes("neutral stability"))) {
      list.push("Stability fallback (usando score neutro)");
    }
    if (scoreWarnings.some((w: string) => w.includes("network benchmark unavailable") || w.includes("neutral network"))) {
      list.push("Network fallback (usando score neutro)");
    }
    if (scoreWarnings.some((w: string) => w.includes("disk benchmark unavailable") || w.includes("neutral disk"))) {
      list.push("Disk fallback (usando score neutro)");
    }
    pendingReadinessChecks.forEach((check) => {
      const label = check.label || check.id;
      if (check.id === "challenge" || check.id === "history" || check.id === "api_token" || check.id === "raw_redaction") {
        return;
      }
      list.push(`${label}`);
    });
    return list;
  };

  const partialExplanations = getPartialStatusExplanation();

  const validationResultTitle =
    validationRunStatus === "failed"
      ? "Não foi possível concluir a validação"
      : readinessReady
        ? "Máquina pronta localmente"
        : validationRunStatus === "partial" || readinessPartial || providerVerificationReady
          ? "Validação parcial"
          : "Validação local da máquina";
  const validationResultMessage =
    validationRunStatus === "failed"
      ? validationError ??
        "A validação automática parou antes do fim. Revise a etapa destacada e tente novamente."
      : readinessReady
        ? "A Burd concluiu a validação local desta máquina, gerou os artefatos necessários e deixou o payload de registro pronto para o próximo passo."
        : readinessPartial || validationRunStatus === "partial"
          ? `A máquina já avançou no fluxo local, mas ainda existem pendências: ${partialExplanations.join(" | ")}.`
          : "A Burd verifica sua máquina localmente, gera score, relatório assinado, challenge e readiness.";
  const readinessScoreLabel =
    typeof readiness?.readiness_score === "number"
      ? `${readiness.readiness_score}/100`
      : providerVerification?.readiness_score !== undefined
        ? `${providerVerification.readiness_score}/100`
        : "Indisponível";
  const failedValidationStepLabel = validationSteps.find(
    (step) => step.id === validationFailedStep,
  )?.label;
  const endpointFailureMessage = !agentOnline
    ? null
    : burdAgent.actionError ?? burdAgent.error;
  const providerMainState = getProviderMainState({
    agentOnline,
    apiAuthEnabled: agentApiAuthEnabled,
    currentError: endpointFailureMessage ?? validationError,
    hasRuntimeToken: agentManager.hasApiToken,
    healthOk,
    readinessStatus: readiness?.status,
    tokenInvalid: burdAgent.invalidToken,
    validationRunStatus,
  });
  const online = providerMainState !== "offline";
  const primaryStatusTitle =
    providerMainState === "offline"
      ? "Burd Agent não encontrado"
      : providerMainState === "transport_error"
        ? "API local indisponível na interface"
        : providerMainState === "api_protected"
          ? "API local protegida"
          : providerMainState === "token_invalid"
            ? "Token local inválido"
            : providerMainState === "validating"
              ? "Validando máquina"
              : providerMainState === "success"
                ? "Máquina pronta localmente"
                : providerMainState === "partial"
                  ? "Validação parcial"
                  : providerMainState === "failed"
                    ? "Não foi possível concluir a validação"
                    : "Burd Agent online";
  const primaryStatusMessage =
    providerMainState === "offline"
      ? "Inicie o serviço local para validar esta máquina."
      : providerMainState === "transport_error"
        ? "O serviço local está ativo. Verifique transporte HTTP, permissões Tauri ou CORS da API local."
        : providerMainState === "api_protected"
          ? "O Burd Agent está online, mas exige token local para liberar os dados técnicos."
          : providerMainState === "token_invalid"
            ? "O token da sessão atual não é mais aceito pela API local. Rotacione o token local para continuar."
            : providerMainState === "validating"
              ? "Aguarde enquanto a Burd executa benchmark, relatório assinado, challenge e readiness."
              : providerMainState === "success"
                ? "A Burd concluiu a validação local desta máquina e deixou o payload de registro pronto para o próximo passo."
                : providerMainState === "partial"
                  ? "A máquina já avançou no fluxo local, mas ainda existem checks pendentes ou warnings antes do estado Ready Locally."
                  : providerMainState === "failed"
                    ? validationError ?? endpointFailureMessage ?? "Burd Agent respondeu com erro ao carregar os dados."
                    : "O Burd Agent está online e pronto para validar esta máquina.";
  const primaryStatusDetail =
    providerMainState === "offline"
      ? agentDiagnosticMessage
      : providerMainState === "transport_error"
        ? "Burd Agent está online, mas a interface não conseguiu ler a API local."
        : providerMainState === "api_protected"
          ? apiProtectionMessage
          : providerMainState === "token_invalid"
            ? "A Burd precisa rotacionar o token local desta sessão antes de continuar as rotas protegidas."
            : providerMainState === "failed" && endpointFailureMessage && !isEndpointNotFoundError(endpointFailureMessage) && !isEndpointServerError(endpointFailureMessage)
              ? "Atualize o status ou tente novamente para recarregar os dados técnicos desta máquina."
              : null;
  const primaryStatusBadge =
    providerMainState === "offline"
      ? ("danger" as const)
      : providerMainState === "transport_error"
        ? ("warning" as const)
        : providerMainState === "api_protected"
          ? ("warning" as const)
          : providerMainState === "token_invalid"
            ? ("danger" as const)
            : providerMainState === "validating"
              ? ("brand" as const)
              : providerMainState === "success"
                ? ("success" as const)
                : providerMainState === "partial"
                  ? ("warning" as const)
                  : providerMainState === "failed"
                    ? ("danger" as const)
                    : ("default" as const);
  const primaryStatusBadgeLabel =
    providerMainState === "offline"
      ? "Offline"
      : providerMainState === "transport_error"
        ? "Transporte"
        : providerMainState === "api_protected"
          ? "Protegida"
          : providerMainState === "token_invalid"
            ? "Token inválido"
            : providerMainState === "validating"
              ? "Verificando"
              : providerMainState === "success"
                ? "Ready Locally"
                : providerMainState === "partial"
                  ? "Parcial"
                  : providerMainState === "failed"
                    ? "Falhou"
                    : "Online";
  const primaryActionLabel =
    providerMainState === "validating"
      ? "Verificando..."
      : providerMainState === "offline"
      ? "Iniciar Agent"
      : providerMainState === "transport_error"
        ? "Tentar novamente"
        : providerMainState === "api_protected"
            ? shouldRotateApiToken
              ? "Rotacionar token e verificar"
              : "Configurar token e verificar"
            : providerMainState === "token_invalid"
              ? "Rotacionar token e verificar"
              : providerMainState === "failed"
                ? "Tentar novamente"
                : providerMainState === "partial" || providerMainState === "success"
                  ? "Verificar novamente"
                  : "Verificar minha máquina";
  const primaryActionDisabled =
    validationRunStatus === "running" ||
    agentManager.isStarting ||
    agentManager.isUpdatingApiToken ||
    (providerMainState === "offline" && agentManager.isMissing);

  const burdAgentDataRef = useRef(burdAgent.data);
  const burdAgentStatusRef = useRef(burdAgent.status);
  const burdAgentApiAuthStatusRef = useRef(burdAgent.apiAuthStatus);
  const agentManagerStatusRef = useRef(agentManager.status);
  const agentApiTokenStatusRef = useRef(agentManager.apiTokenStatus);
  const agentOnlineRef = useRef(agentOnline);
  const hasRuntimeApiTokenRef = useRef(agentManager.hasApiToken);

  // Sincronizar as referências em cada render para funções assíncronas
  burdAgentDataRef.current = burdAgent.data;
  burdAgentStatusRef.current = burdAgent.status;
  burdAgentApiAuthStatusRef.current = burdAgent.apiAuthStatus;
  agentManagerStatusRef.current = agentManager.status;
  agentApiTokenStatusRef.current = agentManager.apiTokenStatus;
  agentOnlineRef.current = agentOnline;
  hasRuntimeApiTokenRef.current = agentManager.hasApiToken;

  function logProviderRequest<T>(details: {
    stepId: ValidationStepId;
    method: "GET" | "POST";
    path: string;
    result: AgentRequestResult<T>;
  }) {
    if (!import.meta.env.DEV) {
      return;
    }

    console.info(
      `[provider-flow] step=${details.stepId} method=${details.method} endpoint=${details.path} status=${details.result.statusCode ?? "n/a"} errorKind=${details.result.errorKind ?? "none"} agentOnline=${agentOnlineRef.current} authEnabled=${Boolean(agentApiTokenStatusRef.current?.apiAuthEnabled)} runtimeTokenAvailable=${hasRuntimeApiTokenRef.current}`,
    );
  }

  function throwValidationRequestError<T>(
    stepId: ValidationStepId,
    fallbackMessage: string,
    result: AgentRequestResult<T>,
  ): never {
    const failureStepId =
      result.errorKind === "token_required" ||
      result.errorKind === "unauthorized" ||
      result.errorKind === "offline" ||
      result.errorKind === "timeout"
        ? "agent"
        : stepId;

    if (result.errorKind === "unauthorized") {
      throw new ValidationStepError(
        failureStepId,
        "Token local inválido. Rotacione o token local para continuar.",
      );
    }

    if (result.errorKind === "token_required") {
      throw new ValidationStepError(
        failureStepId,
        "API local protegida. Configure ou rotacione o token para continuar.",
      );
    }

    throw new ValidationStepError(stepId === failureStepId ? stepId : failureStepId, result.error ?? fallbackMessage);
  }

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info(
        `[provider-debug] agentManagerStatus=${agentManagerStatus} agentManagerHealthOk=${healthOk} burdClientHealthOk=${healthOk} burdClientHealthErrorKind=${burdAgent.errorKind ?? "none"} burdClientHealthMessage=${burdAgent.error ?? "none"} mainState=${providerMainState} authState=${burdAgent.apiAuthStatus} hasRuntimeToken=${agentManager.hasApiToken}`
      );
    }
  }, [
    agentManagerStatus,
    healthOk,
    burdAgent.errorKind,
    burdAgent.error,
    providerMainState,
    burdAgent.apiAuthStatus,
    agentManager.hasApiToken,
  ]);

  const automatedStepStates = useMemo<Record<ValidationStepId, ValidationStepState>>(
    () => ({
      agent: resolveValidationStepState({
        passed: agentOnline,
        running:
          validationCurrentStep === "agent" || agentManagerStatus === "starting",
        failed: (validationFailedStep === "agent" && !agentOnline) || agentManagerStatus === "failed",
      }),
      identity: resolveValidationStepState({
        passed: identityReady,
        running:
          validationCurrentStep === "identity" ||
          burdAgent.isInitializingIdentity ||
          burdAgent.isRotatingIdentity,
        failed: validationFailedStep === "identity" && !identityReady,
      }),
      hardware: resolveValidationStepState({
        passed: hardwareReady,
        running: validationCurrentStep === "hardware",
        failed: validationFailedStep === "hardware" && !hardwareReady,
      }),
      benchmark: resolveValidationStepState({
        passed: benchmarkReady,
        running:
          validationCurrentStep === "benchmark" ||
          benchmarkStatus?.status === "running",
        failed: validationFailedStep === "benchmark" && benchmarkEvidenceStatus === "pending",
        warning: benchmarkEvidenceStatus === "warning",
      }),
      signedReport: resolveValidationStepState({
        passed: signedReportVerified,
        running:
          validationCurrentStep === "signedReport" ||
          validationCurrentStep === "benchmark" ||
          burdAgent.isGeneratingReport ||
          burdAgent.isVerifyingReport,
        failed: validationFailedStep === "signedReport" && !signedReportVerified,
        warning: signedReportGenerated && !signedReportVerified,
      }),
      challenge: resolveValidationStepState({
        passed: challengeReady,
        running:
          validationCurrentStep === "challenge" || burdAgent.isRunningChallenge,
        failed: validationFailedStep === "challenge" && !challengeReady,
        warning: Boolean(activeChallenge) && !challengeReady && !burdAgent.isRunningChallenge,
      }),
      providerVerification: resolveValidationStepState({
        passed: providerVerificationPassed,
        running:
          validationCurrentStep === "providerVerification" ||
          burdAgent.isVerifyingProvider,
        failed: validationFailedStep === "providerVerification" && !providerVerificationPassed,
        warning: providerVerificationReady && !providerVerificationPassed,
      }),
      readiness: resolveValidationStepState({
        passed: readinessReady,
        running: validationCurrentStep === "readiness",
        failed: (validationFailedStep === "readiness" || readinessFailed) && !readinessReady,
        warning: readinessPartial && !readinessReady,
      }),
    }),
    [
      activeChallenge,
      agentManagerStatus,
      agentOnline,
      benchmarkReady,
      benchmarkStatus?.status,
      burdAgent.isGeneratingReport,
      burdAgent.isInitializingIdentity,
      burdAgent.isRotatingIdentity,
      burdAgent.isRunningChallenge,
      burdAgent.isVerifyingProvider,
      burdAgent.isVerifyingReport,
      challengeReady,
      hardwareReady,
      identityReady,
      providerVerificationPassed,
      providerVerificationReady,
      readinessFailed,
      readinessPartial,
      readinessReady,
      signedReportGenerated,
      signedReportVerified,
      validationCurrentStep,
      validationFailedStep,
      benchmarkEvidenceStatus,
    ],
  );

  async function handleStartAgent() {
    await agentManager.startAgent();
    await burdAgent.refresh({ silent: true });
  }

  async function handleStopAgent() {
    await agentManager.stopAgent();
    await burdAgent.refresh({ silent: true });
  }

  async function handleRestartAgent() {
    await agentManager.restartAgent();
    await burdAgent.refresh({ silent: true });
  }

  async function handleRefreshStatus() {
    await Promise.all([
      agentManager.refreshStatus(),
      agentManager.refreshBinaryDiagnostics(),
      agentManager.refreshApiTokenStatus(),
      burdAgent.refresh({ silent: true }),
    ]);
  }

  async function handleRefreshHardware() {
    await burdAgent.refresh();
  }

  async function settleValidationSnapshot() {
    await wait(80);
  }

  async function refreshValidationSnapshot() {
    await burdAgent.refresh({ silent: true });
    await settleValidationSnapshot();
  }

  async function runCompleteBenchmark() {
    console.info("[provider-flow] benchmark:complete start");
    const result = await burdAgent.generateSignedReport(true);
    logProviderRequest({
      stepId: "benchmark",
      method: "POST",
      path: "/api/v1/report/signed?run_all=true",
      result,
    });

    if (!result.ok) {
      throwValidationRequestError(
        "benchmark",
        "Falha ao rodar o benchmark completo e gerar relatório assinado.",
        result,
      );
    }

    await Promise.all([
      burdAgent.refreshProvider({ silent: true }),
      burdAgent.refreshHistory({ silent: true }),
      burdAgent.refreshLogs({ silent: true }),
    ]);

    const signedReportData = (result.data as any)?.signed_report ?? result.data;
    const reportData = (signedReportData as any)?.report;
    const scoreData = reportData?.score;

    console.info(`[provider-flow] benchmark:score score=${scoreData?.burd_compute_score ?? "unknown"}`);

    const evidence = hasCompleteBenchmarkEvidence(reportData, scoreData);
    const systemVal = reportData?.system;
    const fitVal = reportData?.fit;
    const llmVal = reportData?.llm_benchmark;
    const stabilityVal = reportData?.stability;
    const networkVal = reportData?.network;
    const diskVal = reportData?.disk;

    const isValSkipped = (v: any) => v && typeof v === "object" && v.status === "skipped";

    const getSubtestStatus = (key: string, val: any) => {
      if (!val) return "failed";
      if (isValSkipped(val)) return "skipped";
      const warnings = scoreData?.warnings ?? [];
      if (key === "llm_benchmark" && warnings.some((w: string) => w.includes("LLM benchmark unavailable") || w.includes("llmfit TPS estimate"))) {
        return "warning";
      }
      if (key === "stability" && warnings.some((w: string) => w.includes("stability benchmark unavailable") || w.includes("neutral stability"))) {
        return "warning";
      }
      if (key === "network" && warnings.some((w: string) => w.includes("network benchmark unavailable") || w.includes("neutral network"))) {
        return "warning";
      }
      if (key === "disk" && warnings.some((w: string) => w.includes("disk benchmark unavailable") || w.includes("neutral disk"))) {
        return "warning";
      }
      return "passed";
    };

    const subtests = {
      completed: evidence === "passed",
      systemStatus: systemVal ? "passed" : "failed",
      fitStatus: fitVal ? "passed" : "failed",
      llmStatus: getSubtestStatus("llm_benchmark", llmVal),
      stabilityStatus: getSubtestStatus("stability", stabilityVal),
      networkStatus: getSubtestStatus("network", networkVal),
      diskStatus: getSubtestStatus("disk", diskVal),
      scoreStatus: scoreData ? "passed" : "failed",
      reportStatus: signedReportData ? "passed" : "failed",
      warnings: scoreData?.warnings ?? [],
      skipped: [llmVal, stabilityVal, networkVal, diskVal].filter(isValSkipped).length > 0,
      errors: result.error ? [result.error] : [],
    };

    console.info(
      `[provider-flow] benchmark:status system=${subtests.systemStatus} fit=${subtests.fitStatus} llm=${subtests.llmStatus} stability=${subtests.stabilityStatus} network=${subtests.networkStatus} disk=${subtests.diskStatus}`
    );

    return subtests;
  }

  async function ensureRuntimeBearerToken() {
    const latestTokenStatus =
      (await agentManager.refreshApiTokenStatus()) ?? agentApiTokenStatusRef.current;
    const authEnabled = Boolean(latestTokenStatus?.apiAuthEnabled);
    const tokenConfigured = Boolean(latestTokenStatus?.tokenConfigured);
    const hasRuntimeToken = hasRuntimeApiTokenRef.current;

    if (hasRuntimeToken && burdAgentApiAuthStatusRef.current !== "invalid_token") {
      logProviderAuthState({
        action: "probe",
        authEnabled,
        hasRuntimeToken,
        tokenConfigured,
      });
      const probeResult = await burdAgent.probeProtectedAccess();
      logProviderRequest({
        stepId: "agent",
        method: "GET",
        path: "/api/v1/config",
        result: probeResult,
      });

      if (probeResult.ok) {
        await refreshValidationSnapshot();
        return;
      }
    }

    // Regras de auto-provisionamento de token solicitadas pelo usuário:
    // * se apiAuthEnabled === false, criar token local
    // * se tokenConfigured === false, criar token local
    // * se tokenConfigured === true, mas o app não tem o token bruto em runtime, rotacionar token local
    const action = (!authEnabled || !tokenConfigured) ? "create" : "rotate";
    logProviderAuthState({
      action,
      authEnabled,
      hasRuntimeToken,
      tokenConfigured,
    });
    const result =
      action === "rotate"
        ? await agentManager.rotateApiToken()
        : await agentManager.createApiToken();

    if (!result) {
      throw new ValidationStepError(
        "agent",
        action === "rotate"
          ? "Não foi possível rotacionar o token local."
          : "Não foi possível configurar o token local.",
      );
    }

    hasRuntimeApiTokenRef.current = true;
    agentApiTokenStatusRef.current = result;

    const protectedProbe = await burdAgent.probeProtectedAccess();
    logProviderRequest({
      stepId: "agent",
      method: "GET",
      path: "/api/v1/config",
      result: protectedProbe,
    });
    if (!protectedProbe.ok) {
      throwValidationRequestError(
        "agent",
        "Burd Agent respondeu com erro ao carregar os dados.",
        protectedProbe,
      );
    }

    await refreshValidationSnapshot();
  }

  async function ensureAgentAuthenticated() {
    await ensureRuntimeBearerToken();
  }

  async function waitForAgentOnline() {
    const deadline = Date.now() + 45000;

    while (Date.now() < deadline) {
      const managerStatus = await agentManager.refreshStatus();
      await burdAgent.refresh({ silent: true });
      await settleValidationSnapshot();

      if (managerStatus?.status === "missing") {
        throw new ValidationStepError(
          "agent",
          "O binário burd-agent.exe não foi encontrado no app. Rode npm run sync:agent antes de validar esta máquina.",
        );
      }

      if (managerStatus?.status === "failed") {
        throw new ValidationStepError(
          "agent",
          managerStatus.lastError ??
            managerStatus.message ??
            "Não foi possível iniciar o Burd Agent local.",
        );
      }

      if (
        managerStatus?.status === "online" ||
        agentManagerStatusRef.current?.status === "online" ||
        burdAgentStatusRef.current === "online"
      ) {
        logProviderValidationStep("agent", "success");
        console.info("[provider-flow] step=ensureAgentOnline healthOk=true");
        return;
      }

      await wait(1500);
    }

    throw new ValidationStepError(
      "agent",
      "Burd Agent não encontrado.",
    );
  }

  async function runValidationStep(
    stepId: ValidationStepId,
    fallbackMessage: string,
    action: () => Promise<void>,
  ) {
    setValidationCurrentStep(stepId);
    logProviderValidationStep(stepId, "start");

    try {
      await action();
      logProviderValidationStep(stepId, "success");
    } catch (error) {
      if (error instanceof ValidationStepError) {
        logProviderValidationStep(stepId, "error", error.message);
        throw error;
      }

      const message = normalizeErrorMessage(error, fallbackMessage);
      logProviderValidationStep(stepId, "error", message);
      throw new ValidationStepError(
        stepId,
        message,
      );
    }
  }

  async function handleAutomatedValidation() {
    if (validationRunStatus === "running") {
      return;
    }

    agentManager.clearError();
    burdAgent.clearTransientState();
    setValidationRunStatus("running");
    setValidationCurrentStep("agent");
    setValidationFailedStep(null);
    setValidationError(null);
    setShowTechnicalLogs(false);
    logProviderValidationStep("agent", "start", "reset-state");

    try {
      await runValidationStep(
        "agent",
        "Burd Agent não encontrado.",
        async () => {
          if (agentManager.isMissing) {
            throw new ValidationStepError(
              "agent",
              "O binário burd-agent.exe não foi encontrado no app. Rode npm run sync:agent antes de validar esta máquina.",
            );
          }

          if (!agentOnlineRef.current) {
            const startResult = await agentManager.startAgent();

            if (startResult?.status === "failed") {
              throw new ValidationStepError(
                "agent",
                startResult.lastError ??
                  startResult.message ??
                  "Não foi possível iniciar o Burd Agent local.",
              );
            }
          }

          await waitForAgentOnline();
          await ensureAgentAuthenticated();
        },
      );

      await runValidationStep(
        "identity",
        "Não foi possível validar a identidade local desta máquina.",
        async () => {
          // 1. Buscar identidade atual
          const identityResult = await getIdentity();
          let currentIdentity = identityResult.ok ? identityResult.data : null;

          const hasP = Boolean(currentIdentity?.provider_id || currentIdentity?.providerId);
          const hasM = Boolean(currentIdentity?.machine_id || currentIdentity?.machineId);
          console.info(`[provider-flow] identity:get hasProviderId=${hasP} hasMachineId=${hasM} exists=${currentIdentity?.exists ?? false}`);

          // Buscar outras fontes sequencialmente para ter certeza
          const providerResult = await getProvider();
          const readinessResult = await getReadiness();
          const registrationPayloadResult = await getRegistrationPayload();

          const currentProvider = providerResult.ok ? providerResult.data : null;
          const currentChecks = readinessResult.ok ? readinessResult.data?.checks : null;
          const currentPayload = registrationPayloadResult.ok ? registrationPayloadResult.data : null;

          let valid = hasValidIdentity(
            currentIdentity,
            currentProvider,
            currentChecks,
            currentPayload,
            burdAgent.data.signedReport,
            burdAgent.data.reportVerification
          );
          
          let resolvedSource = "";
          if (valid) {
            if (currentIdentity && (currentIdentity.provider_id || currentIdentity.providerId)) resolvedSource = "identity";
            else if (currentProvider && (currentProvider.provider_id || currentProvider.providerId)) resolvedSource = "provider";
            else if (currentPayload && (currentPayload.provider_id || currentPayload.providerId)) resolvedSource = "registrationPayload";
            else resolvedSource = "identity";
          }

          // 2. Se não for válida, inicializar
          if (!valid) {
            console.info("[provider-flow] identity:init calling /api/v1/identity/init");
            const initResult = await burdAgent.initIdentity();
            logProviderRequest({
              stepId: "identity",
              method: "POST",
              path: "/api/v1/identity/init",
              result: initResult,
            });

            if (!initResult.ok) {
              throwValidationRequestError(
                "identity",
                "Não foi possível criar a identidade local.",
                initResult,
              );
            }

            // Buscar novamente tudo de novo após init
            const refIdentityResult = await getIdentity();
            const refProviderResult = await getProvider();
            const refReadinessResult = await getReadiness();
            const refRegistrationPayloadResult = await getRegistrationPayload();

            const refIdentity = refIdentityResult.ok ? refIdentityResult.data : null;
            const refProvider = refProviderResult.ok ? refProviderResult.data : null;
            const refChecks = refReadinessResult.ok ? refReadinessResult.data?.checks : null;
            const refPayload = refRegistrationPayloadResult.ok ? refRegistrationPayloadResult.data : null;

            valid = hasValidIdentity(
              refIdentity,
              refProvider,
              refChecks,
              refPayload,
              burdAgent.data.signedReport,
              burdAgent.data.reportVerification
            );

            if (valid) {
              if (refIdentity && (refIdentity.provider_id || refIdentity.providerId)) resolvedSource = "identity";
              else if (refProvider && (refProvider.provider_id || refProvider.providerId)) resolvedSource = "provider";
              else if (refPayload && (refPayload.provider_id || refPayload.providerId)) resolvedSource = "registrationPayload";
              else resolvedSource = "identity";
            }
          }

          if (valid) {
            console.info(`[provider-flow] identity:resolved source=${resolvedSource}`);
            await refreshValidationSnapshot();
          } else {
            throw new ValidationStepError(
              "identity",
              "A identidade local ainda não está disponível depois da inicialização.",
            );
          }
        },
      );

      await runValidationStep(
        "hardware",
        "Não foi possível detectar o hardware local desta máquina.",
        async () => {
          await refreshValidationSnapshot();

          if (
            !burdAgentDataRef.current.system?.cpu &&
            !burdAgentDataRef.current.system?.primary_gpu_name
          ) {
            throw new ValidationStepError(
              "hardware",
              "O Burd Agent ainda não retornou CPU ou GPU detectados para esta máquina.",
            );
          }
        },
      );

      await runValidationStep(
        "benchmark",
        "Não foi possível concluir o benchmark local completo.",
        async () => {
          const subtests = await runCompleteBenchmark();
          if (subtests.errors.length > 0) {
            throw new ValidationStepError("benchmark", subtests.errors[0]);
          }
          await refreshValidationSnapshot();
        },
      );

      await runValidationStep(
        "signedReport",
        "Não foi possível gerar ou validar o relatório assinado.",
        async () => {
          console.info("[provider-flow] report:signed verification start");
          const verifyResult = await burdAgent.verifySignedReport();
          logProviderRequest({
            stepId: "signedReport",
            method: "POST",
            path: "/api/v1/report/verify",
            result: verifyResult,
          });

          if (!verifyResult.ok) {
            throwValidationRequestError(
              "signedReport",
              "O relatório foi gerado, mas não pôde ser verificado localmente.",
              verifyResult,
            );
          }

          await refreshValidationSnapshot();

          if (
            !burdAgentDataRef.current.reportVerification?.signature_valid &&
            !burdAgentDataRef.current.signedReport?.signature_valid_locally
          ) {
            throw new ValidationStepError(
              "signedReport",
              "O relatório assinado ainda não ficou válido depois da verificação local.",
            );
          }
          console.info(`[provider-flow] report:signed success hash=${burdAgentDataRef.current.signedReport?.report_hash ?? "unknown"}`);
        },
      );

      await runValidationStep(
        "challenge",
        "Challenge local não foi concluído.",
        async () => {
          let challengeData = burdAgentDataRef.current.challengeRun ?? burdAgentDataRef.current.mockChallenge;

          if (!challengeData?.challenge) {
            console.info("[provider-flow] challenge:create calling create-mock");
            const createResult = await burdAgent.createMockChallenge();
            logProviderRequest({
              stepId: "challenge",
              method: "POST",
              path: "/api/v1/challenge/create-mock",
              result: createResult,
            });

            if (!createResult.ok) {
              throwValidationRequestError(
                "challenge",
                "Challenge local não foi concluído.",
                createResult,
              );
            }
            console.info("[provider-flow] challenge:create success");
            challengeData = createResult.data;
            await refreshValidationSnapshot();
          }

          // Executar o challenge
          let runResultData = burdAgentDataRef.current.challengeRun;
          if (!burdAgentDataRef.current.challengeVerification?.valid) {
            console.info("[provider-flow] challenge:run calling run");
            const runResult = await burdAgent.runChallenge(challengeData);
            logProviderRequest({
              stepId: "challenge",
              method: "POST",
              path: "/api/v1/challenge/run",
              result: runResult,
            });

            if (!runResult.ok) {
              throwValidationRequestError(
                "challenge",
                "Challenge local não foi concluído.",
                runResult,
              );
            }
            console.info("[provider-flow] challenge:run success");
            runResultData = runResult.data;
            await refreshValidationSnapshot();
          }

          // Verificar o challenge
          if (!burdAgentDataRef.current.challengeVerification?.valid) {
            console.info("[provider-flow] challenge:verify calling verify");
            const verifyResult = await burdAgent.verifyChallenge(runResultData);
            logProviderRequest({
              stepId: "challenge",
              method: "POST",
              path: "/api/v1/challenge/verify",
              result: verifyResult,
            });

            if (!verifyResult.ok) {
              throwValidationRequestError(
                "challenge",
                "Challenge local não foi concluído.",
                verifyResult,
              );
            }
            console.info("[provider-flow] challenge:verify success");
            await refreshValidationSnapshot();
          }

          if (!burdAgentDataRef.current.challengeVerification?.valid) {
            throw new ValidationStepError(
              "challenge",
              "Challenge local não foi concluído.",
            );
          }
          console.info(`[provider-flow] challenge:verify valid=true persisted=true`);
        },
      );

      await runValidationStep(
        "providerVerification",
        "Provider verification não foi concluído.",
        async () => {
          console.info("[provider-flow] provider:verify calling /api/v1/provider/verify");
          const result = await burdAgent.verifyProvider();
          logProviderRequest({
            stepId: "providerVerification",
            method: "POST",
            path: "/api/v1/provider/verify",
            result,
          });

          if (!result.ok) {
            throwValidationRequestError(
              "providerVerification",
              "Provider verification não foi concluído.",
              result,
            );
          }
          console.info("[provider-flow] provider:verify success");

          await Promise.all([
            burdAgent.refreshReadiness({ silent: true }),
            burdAgent.refreshRegistrationPayload({ silent: true }),
            burdAgent.refreshHistory({ silent: true }),
            burdAgent.refreshLogs({ silent: true }),
            burdAgent.refresh({ silent: true }),
          ]);
          await settleValidationSnapshot();
        },
      );

      await runValidationStep(
        "readiness",
        "Não foi possível atualizar o readiness final desta máquina.",
        async () => {
          await Promise.all([
            burdAgent.refreshReadiness({ silent: true }),
            burdAgent.refreshRegistrationPayload({ silent: true }),
            burdAgent.refreshHistory({ silent: true }),
            burdAgent.refreshLogs({ silent: true }),
          ]);
          await settleValidationSnapshot();

          const readinessData = burdAgentDataRef.current.readiness;
          const pendingChecks = (readinessData?.checks ?? [])
            .filter((c: any) => c.status !== "passed")
            .map((c: any) => c.label || c.id)
            .join(", ");
          console.info(`[provider-flow] readiness status=${readinessData?.status ?? "unknown"} score=${readinessData?.readiness_score ?? "unknown"} pending=[${pendingChecks}]`);

          if (!readinessData?.status) {
            throw new ValidationStepError(
              "readiness",
              "O readiness local não retornou um status final para esta máquina.",
            );
          }

          if (readinessData.status === "failed") {
            throw new ValidationStepError(
              "readiness",
              "A validação local terminou com falha em um dos checks obrigatórios.",
            );
          }
        },
      );

      setValidationCurrentStep(null);
      setValidationRunStatus(
        burdAgentDataRef.current.readiness?.status === "ready_locally"
          ? "success"
          : "partial",
      );
    } catch (error) {
      const stepError =
        error instanceof ValidationStepError
          ? error
          : new ValidationStepError(
              validationCurrentStep ?? "agent",
              normalizeErrorMessage(
                error,
                "Não foi possível concluir a validação automática desta máquina.",
              ),
            );

      await burdAgent.refreshLogs({ silent: true });
      await settleValidationSnapshot();
      setValidationCurrentStep(null);
      setValidationFailedStep(stepError.stepId);
      setValidationError(stepError.message);
      setValidationRunStatus("failed");
    }
  }

  async function handleCopy(key: string, value: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setCopiedKey(null);
    }
  }

  function handleDownloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(redactSensitiveJson(data), null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!online) {
    return (
      <div className="space-y-6">
        <HeaderBlock
          title="Validação local da máquina"
          subtitle="A Burd verifica sua máquina localmente, gera score, relatório assinado, challenge e readiness."
          right={<Badge variant={flowStateVariant(agentStepState)}>{buildAgentHeaderBadge(agentManagerStatus)}</Badge>}
        />

        <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <Card padding="lg">
            <div className="flex items-start justify-between gap-4 border-b border-burd-border pb-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                  Status principal
                </div>
                <div className="mt-2 text-[24px] text-burd-text">{primaryStatusTitle}</div>
              </div>
              <Badge variant={primaryStatusBadge}>{primaryStatusBadgeLabel}</Badge>
            </div>

            <p className="mt-5 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
              {primaryStatusMessage}
            </p>

            {primaryStatusDetail ? (
              <p className="mt-4 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
                {primaryStatusDetail}
              </p>
            ) : null}

            {agentManager.isMissing ? (
              <p className="mt-4 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
                O binário `burd-agent.exe` não foi encontrado no pacote do app. Rode `npm run sync:agent` antes de validar esta máquina.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="panel"
                size="md"
                disabled={primaryActionDisabled}
                icon={<RefreshCw className={validationRunStatus === "running" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
                onClick={() => void handleAutomatedValidation()}
              >
                {primaryActionLabel}
              </Button>
              <Button variant="ghost" size="md" onClick={() => void handleRefreshStatus()}>
                Atualizar status
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Agent" value={humanizeAgentManagerStatus(agentManagerStatus)} />
              <MetricCard label="Local API" value={agentManager.status?.healthUrl ?? BURD_AGENT_BASE_URL} />
              <MetricCard label="Status" value={buildAgentStatusCopy(agentManagerStatus, agentManager.status?.managedByApp ?? false)} />
              <MetricCard label="Binário" value={resolvedBinaryPath} />
            </div>
          </Card>

          <Card padding="lg" variant="deep">
            <div className="flex items-center justify-between gap-4 border-b border-burd-border pb-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                  Progresso automático
                </div>
                <div className="mt-2 text-[20px] text-burd-text">Verificar minha máquina</div>
              </div>
              <Badge variant={validationRunStatus === "failed" ? "danger" : validationRunStatus === "running" ? "brand" : "default"}>
                {validationRunStatus === "running" ? "Verificando" : validationRunStatus === "failed" ? "Atenção" : "Aguardando"}
              </Badge>
            </div>

            <div className="mt-5 space-y-3">
              {validationSteps.map((step, index) => (
                <ValidationStepRow
                  key={step.id}
                  number={index + 1}
                  label={step.label}
                  state={automatedStepStates[step.id]}
                />
              ))}
            </div>
          </Card>
        </div>

        <section className="space-y-4">
          <SectionHeader
            title="Modo avançado"
            subtitle="Ferramentas técnicas e comandos manuais continuam disponíveis para diagnóstico e operação local."
            action={
              <Button variant="ghost" size="sm" onClick={() => setShowAdvancedTools((current) => !current)}>
                {showAdvancedTools ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showAdvancedTools ? "Ocultar" : "Ferramentas técnicas"}
              </Button>
            }
          />

          {showAdvancedTools ? (
            <>
              <Card padding="lg">
                <div className="flex items-start justify-between gap-4 border-b border-burd-border pb-4">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                      Agent local
                    </div>
                    <div className="mt-2 text-[24px] text-burd-text">{buildAgentTitle(agentManagerStatus)}</div>
                  </div>
                  <Badge variant={flowStateVariant(agentStepState)}>{humanizeFlowStepState(agentStepState)}</Badge>
                </div>

                <p className="mt-5 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
                  O Burd Agent é o serviço local que detecta sua máquina, roda benchmarks, gera relatórios assinados e prepara sua GPU para validação na rede.
                </p>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <CodeCommandBlock label="Via cargo" command={BURD_AGENT_CARGO_COMMAND} />
                  <CodeCommandBlock label="Via binário" command={BURD_AGENT_BINARY_COMMAND} />
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="panel"
                    size="md"
                    disabled={agentManager.isStarting || agentManager.isMissing}
                    onClick={() => void handleStartAgent()}
                  >
                    {agentManager.isStarting ? "Iniciando Agent" : "Iniciar Agent"}
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => void handleRestartAgent()}>
                    Reiniciar
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={agentManager.isStopping}
                    onClick={() => void handleStopAgent()}
                  >
                    {agentManager.isStopping ? "Parando" : "Parar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => void handleCopy("agent-command", BURD_AGENT_CARGO_COMMAND)}
                  >
                    {copiedKey === "agent-command" ? "Copiado" : "Copiar comando"}
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => setShowAgentLogs((current) => !current)}>
                    {showAgentLogs ? "Ocultar logs" : "Ver logs"}
                  </Button>
                </div>

                {showAgentLogs ? (
                  <div className="mt-5 rounded-tile border border-burd-border bg-burd-panel-deep p-4">
                    <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
                      Logs do Agent Manager
                    </div>
                    {agentLogs.length > 0 ? (
                      <pre className="mt-3 max-h-[240px] overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-6 text-burd-text-secondary">
                        {agentLogs.join("\n")}
                      </pre>
                    ) : (
                      <p className="mt-3 text-[13px] leading-6 text-burd-text-secondary">
                        Nenhum log de processo capturado ainda.
                      </p>
                    )}
                  </div>
                ) : null}
              </Card>

              <StatusGrid
                items={[
                  ["Agent", humanizeAgentManagerStatus(agentManagerStatus)],
                  ["Local API", agentManager.status?.healthUrl ?? BURD_AGENT_BASE_URL],
                  ["Status", buildAgentStatusCopy(agentManagerStatus, agentManager.status?.managedByApp ?? false)],
                  ["Versão", formatVersion(health?.agent_version) ?? "v0.1.0"],
                  ["Binário", resolvedBinaryPath],
                ]}
              />
              <BinaryDiagnosticsPanel diagnostics={binaryDiagnostics} />
            </>
          ) : (
            <Card padding="lg">
              <p className="text-[14px] leading-7 text-burd-text-secondary">
                O fluxo principal agora tenta iniciar o agent, aguardar `/health` e seguir automaticamente. Abra o modo avançado apenas quando quiser operar manualmente ou investigar detalhes técnicos.
              </p>
            </Card>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderBlock
        title="Validação local da máquina"
        subtitle="A Burd verifica sua máquina localmente, gera score, relatório assinado, challenge e readiness."
        right={
          <div className="flex flex-wrap gap-3">
            <Badge variant={flowStateVariant(agentStepState)}>{buildAgentHeaderBadge(agentManagerStatus)}</Badge>
            <Badge variant={flowStateVariant(readinessStepState)}>
              {readiness?.readiness_level ?? "Readiness"}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card padding="lg">
          <div className="flex items-start justify-between gap-4 border-b border-burd-border pb-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Status principal
              </div>
              <div className="mt-2 text-[24px] text-burd-text">{primaryStatusTitle}</div>
            </div>
            <Badge variant={primaryStatusBadge}>{primaryStatusBadgeLabel}</Badge>
          </div>

          <p className="mt-5 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
            {primaryStatusMessage}
          </p>

          {primaryStatusDetail ? (
            <p className="mt-4 max-w-[820px] text-[14px] leading-7 text-burd-text-secondary">
              {primaryStatusDetail}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="panel"
              size="md"
              disabled={primaryActionDisabled}
              icon={<RefreshCw className={validationRunStatus === "running" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
              onClick={() => void handleAutomatedValidation()}
            >
              {primaryActionLabel}
            </Button>
            <Button variant="ghost" size="md" onClick={() => void handleRefreshStatus()}>
              Atualizar status
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Provider ID" value={identity?.provider_id ?? provider?.provider_id ?? "Pendente"} />
            <MetricCard label="GPU" value={system?.primary_gpu_name ?? "Indisponível"} />
            <MetricCard label="Score" value={formatScore(score?.burd_compute_score)} />
            <MetricCard label="Readiness" value={readinessScoreLabel} />
          </div>
        </Card>

        <Card padding="lg" variant="deep">
          <div className="flex items-center justify-between gap-4 border-b border-burd-border pb-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Progresso automático
              </div>
              <div className="mt-2 text-[20px] text-burd-text">Verificar minha máquina</div>
            </div>
            <Badge variant={validationRunStatus === "failed" ? "danger" : validationRunStatus === "running" ? "brand" : readinessReady ? "success" : "default"}>
              {validationRunStatus === "running"
                ? "Verificando"
                : validationRunStatus === "failed"
                  ? "Falhou"
                  : readinessReady
                    ? "Concluído"
                    : "Aguardando"}
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            {validationSteps.map((step, index) => (
              <ValidationStepRow
                key={step.id}
                number={index + 1}
                label={step.label}
                state={automatedStepStates[step.id]}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div className="flex items-start justify-between gap-4 border-b border-burd-border pb-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
              Resultado atual
            </div>
            <div className="mt-2 text-[20px] text-burd-text">{validationResultTitle}</div>
          </div>
          <Badge
            variant={
              validationRunStatus === "failed"
                ? "danger"
                : readinessReady
                  ? "success"
                  : readinessPartial || validationRunStatus === "partial"
                    ? "warning"
                    : "default"
            }
          >
            {readinessReady ? "Ready Locally" : humanizeValidationRunStatus(validationRunStatus)}
          </Badge>
        </div>

        {validationRunStatus === "failed" ? (
          <div className="mt-5 space-y-4">
            <StatusGrid
              items={[
                ["Etapa", failedValidationStepLabel ?? "Indisponível"],
                ["Status", "Falhou"],
                ["Score", formatScore(score?.burd_compute_score)],
                ["Readiness", readinessScoreLabel],
                ["Provider ID", identity?.provider_id ?? provider?.provider_id ?? "Pendente"],
              ]}
            />
            <p className="text-[14px] leading-7 text-burd-text-secondary">{validationError ?? "A validação automática não conseguiu concluir todos os checks locais."}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" size="md" onClick={() => setShowTechnicalLogs((current) => !current)}>
                {showTechnicalLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showTechnicalLogs ? "Ocultar logs técnicos" : "Mostrar logs técnicos"}
              </Button>
            </div>

            {showTechnicalLogs ? (
              <div className="grid gap-4 xl:grid-cols-[0.48fr_0.52fr]">
                <Card padding="lg" variant="deep">
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                    Últimas atividades
                  </div>
                  <div className="mt-4 space-y-3 text-[13px] leading-6 text-burd-text-secondary">
                    {activityEntries.slice(0, 6).map((entry) => (
                      <div key={entry.id} className="border-b border-burd-border/60 pb-3 last:border-b-0 last:pb-0">
                        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
                          {entry.type} • {humanizeStatus(entry.status)}
                        </div>
                        <div className="mt-2 text-burd-text">{entry.message}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card padding="lg">
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                    Payload técnico redigido
                  </div>
                  {validationErrorPayload ? (
                    <pre className="mt-4 max-h-[320px] overflow-auto rounded-tile border border-burd-border bg-burd-panel-deep p-4 font-mono text-[12px] leading-6 text-burd-text-secondary">
                      {validationErrorPayload}
                    </pre>
                  ) : (
                    <p className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
                      Nenhum payload técnico adicional foi capturado para esta falha.
                    </p>
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        ) : readinessReady ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Readiness" value={readinessScoreLabel} />
            <MetricCard label="Status" value="Ready Locally" />
            <MetricCard label="Score" value={formatScore(score?.burd_compute_score)} />
            <MetricCard label="Tier" value={score?.tier ?? "Indisponível"} />
            <MetricCard label="GPU" value={system?.primary_gpu_name ?? "Indisponível"} />
            <MetricCard label="VRAM" value={formatGigabytes(system?.vram_total_gb ?? system?.vram_per_gpu_gb)} />
            <MetricCard label="Provider ID" value={identity?.provider_id ?? provider?.provider_id ?? "Indisponível"} />
            <MetricCard label="Relatório" value={signedReportVerified ? "Válido" : "Pendente"} />
            <MetricCard label="Challenge" value={challengeReady ? "Validado" : "Pendente"} />
            <MetricCard label="Payload" value={registrationPayload ? "Disponível" : "Pendente"} />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.42fr_0.58fr]">
            <Card padding="lg" variant="deep">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Validação parcial
              </div>
              <div className="mt-4 text-[42px] leading-none text-burd-text">{formatScore(score?.burd_compute_score)}</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge variant="warning">{readinessScoreLabel}</Badge>
                <Badge>{score?.tier ?? "Sem tier"}</Badge>
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Checks pendentes e recomendações
              </div>
              <div className="mt-4 space-y-4 text-[14px] leading-7 text-burd-text-secondary">
                <div>
                  {partialExplanations.length > 0
                    ? partialExplanations.map((item) => (
                        <div key={item}>• {item}</div>
                      ))
                    : "Nenhum check pendente registrado no momento."}
                </div>
                <div>
                  {readiness?.recommendations && readiness.recommendations.length > 0
                    ? readiness.recommendations.map((recommendation) => (
                        <div key={recommendation}>• {recommendation}</div>
                      ))
                    : "Nenhuma recomendação adicional no momento."}
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>

      <section className="space-y-4">
        <SectionHeader
          title="Modo avançado"
          subtitle="Ferramentas técnicas e ações manuais continuam disponíveis, mas ficaram secundárias ao fluxo automático."
          action={
            <Button variant="ghost" size="sm" onClick={() => setShowAdvancedTools((current) => !current)}>
              {showAdvancedTools ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAdvancedTools ? "Ocultar" : "Ferramentas técnicas"}
            </Button>
          }
        />

        {showAdvancedTools ? (
          <>
            <div className="space-y-4">
        <StepCard
          number={1}
          title="Agent local"
          description="Conecte o Burd App ao burd-agent local para liberar o restante do fluxo de validação."
          summary={buildAgentStepSummary(agentManagerStatus, agentManager.status?.managedByApp ?? false)}
          state={agentStepState}
          actions={
            <div className="flex flex-wrap gap-3">
              <Button variant="panel" size="md" onClick={() => void handleRefreshStatus()}>
                Verificar novamente
              </Button>
              <Button variant="ghost" size="md" onClick={() => void handleRestartAgent()}>
                Reiniciar
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={agentManager.isStopping}
                onClick={() => void handleStopAgent()}
              >
                {agentManager.isStopping ? "Parando" : "Parar"}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setShowAgentLogs((current) => !current)}>
                {showAgentLogs ? "Ocultar logs" : "Ver logs"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <StatusGrid
              items={[
                ["Local API", agentManager.status?.healthUrl ?? provider?.host_uri ?? BURD_AGENT_BASE_URL],
                ["Health", (health?.status ?? "OK").toUpperCase()],
                ["Version", formatVersion(health?.agent_version) ?? "Indisponível"],
                ["Status", buildAgentStatusCopy(agentManagerStatus, agentManager.status?.managedByApp ?? false)],
                ["PID", agentManager.status?.pid ? String(agentManager.status.pid) : "Indisponível"],
              ]}
            />

            {showAgentLogs ? (
              <div className="rounded-tile border border-burd-border bg-burd-panel-deep p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
                  Logs do Agent Manager
                </div>
                {agentLogs.length > 0 ? (
                  <pre className="mt-3 max-h-[240px] overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-6 text-burd-text-secondary">
                    {agentLogs.join("\n")}
                  </pre>
                ) : (
                  <p className="mt-3 text-[13px] leading-6 text-burd-text-secondary">
                    Nenhum log de processo capturado ainda.
                  </p>
                )}
              </div>
            ) : null}

            <BinaryDiagnosticsPanel diagnostics={binaryDiagnostics} />
          </div>
        </StepCard>

        <StepCard
          number={2}
          title="Identidade"
          description="A identidade local assina relatórios desta máquina e permite comprovar a origem dos artefatos gerados aqui."
          summary={identity?.provider_id ? "Identidade local pronta" : "Criar identidade local"}
          state={identityStepState}
          actions={
            <div className="flex flex-wrap gap-3">
              {!identity?.provider_id ? (
                <Button
                  variant="panel"
                  size="md"
                  disabled={burdAgent.isInitializingIdentity}
                  onClick={() => void burdAgent.initIdentity()}
                >
                  {burdAgent.isInitializingIdentity ? "Criando identidade" : "Criar identidade"}
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => void handleCopy("provider-id", identity.provider_id ?? "")}
                  >
                    {copiedKey === "provider-id" ? "Copiado" : "Copiar Provider ID"}
                  </Button>
                  <Button
                    variant="panel"
                    size="md"
                    disabled={burdAgent.isRotatingIdentity}
                    onClick={() => setShowRotateConfirm((current) => !current)}
                  >
                    Rotacionar chave
                  </Button>
                  {showRotateConfirm ? (
                    <Button
                      variant="inverse"
                      size="md"
                      disabled={burdAgent.isRotatingIdentity}
                      onClick={() => void burdAgent.rotateIdentity()}
                    >
                      {burdAgent.isRotatingIdentity ? "Rotacionando" : "Confirmar rotação"}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          }
        >
          {identity?.provider_id ? (
            <>
              <StatusGrid
                items={[
                  ["Provider ID", identity.provider_id],
                  ["Public key", truncateMiddle(identity.public_key) ?? "Indisponível"],
                  ["Key algorithm", identity.key_algorithm ?? "Indisponível"],
                  ["Key status", identity.key_status ?? "Indisponível"],
                  ["Config path", identity.config_path ?? "Indisponível"],
                ]}
              />
              {showRotateConfirm ? (
                <MessageCard variant="danger">
                  Confirme a rotação apenas se quiser substituir a chave pública usada nos próximos relatórios assinados.
                </MessageCard>
              ) : null}
            </>
          ) : (
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              A identidade local ainda não existe. Ela é necessária para relatório assinado, challenge response e payload de registro futuro.
            </p>
          )}
        </StepCard>

        <StepCard
          number={3}
          title="Hardware"
          description="Detecte GPU, VRAM, CPU, RAM, disco, sistema operacional e runtimes locais."
          summary={system?.primary_gpu_name ? `Hardware detectado: ${system.primary_gpu_name}` : "Aguardando leitura de hardware"}
          state={hardwareStepState}
          actions={
            <Button variant="panel" size="md" onClick={() => void handleRefreshHardware()}>
              Atualizar hardware
            </Button>
          }
        >
          <StatusGrid
            items={[
              ["GPU", system?.primary_gpu_name ?? "Não detectado"],
              ["VRAM", formatGigabytes(system?.vram_total_gb ?? system?.vram_per_gpu_gb)],
              ["CPU", system?.cpu ?? "Não detectado"],
              ["RAM", formatGigabytes(system?.ram_total_gb)],
              ["Disk", formatGigabytes(provider?.hardware?.disk_free_gb)],
              ["OS", buildOsLabel(system?.os, system?.architecture)],
              ["Runtimes", buildRuntimeLabel(system)],
              ["Drivers", system?.nvidia_driver ?? system?.amd_driver ?? "Indisponível"],
            ]}
          />
        </StepCard>

        <StepCard
          number={4}
          title="Benchmark"
          description="Rode o benchmark completo para gerar fit, score, report e histórico local desta máquina."
          summary={buildBenchmarkSummary(benchmarkStatus?.status, latestHistory)}
          state={benchmarkStepState}
          actions={
            <Button
              variant="panel"
              size="md"
              disabled={benchmarkStatus?.status === "running"}
              onClick={() => void burdAgent.runBenchmark()}
            >
              <Play className="h-4 w-4" />
              {benchmarkStatus?.status === "running" ? "Benchmark em execução" : "Rodar benchmark completo"}
            </Button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {benchmarkStages.map((stage) => (
              <BenchmarkStage key={stage.label} label={stage.label} state={stage.state} />
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-6 text-burd-text-secondary">
            {benchmarkStatus?.status === "running"
              ? "Benchmark em execução. Isso pode levar alguns minutos."
              : "Se o agent ainda não expõe progresso granular, usamos o status geral do benchmark para comunicar o avanço do passo."}
          </p>
        </StepCard>

        <StepCard
          number={5}
          title="Score"
          description="Este score estima o quão pronta esta máquina está para workloads de IA na rede Burd."
          summary={typeof score?.burd_compute_score === "number" ? `Score ${score.burd_compute_score.toFixed(1)} • ${score.tier}` : "Score ainda não calculado"}
          state={scoreStepState}
          actions={
            <Button variant="ghost" size="md" onClick={() => void burdAgent.refreshProvider()}>
              Atualizar score
            </Button>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[0.42fr_0.58fr]">
            <Card padding="lg" variant="deep">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Burd Compute Score
              </div>
              <div className="mt-4 text-[42px] leading-none text-burd-text">
                {formatScore(score?.burd_compute_score)}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge variant={score?.eligible ? "success" : "warning"}>{score?.eligible ? "Elegível" : "Não elegível"}</Badge>
                <Badge>{score?.tier ?? "Sem tier"}</Badge>
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Breakdown
              </div>
              <div className="mt-4 grid gap-3">
                {renderScoreBreakdown(score?.components)}
              </div>
              {score?.warnings && score.warnings.length > 0 ? (
                <div className="mt-4 border-t border-burd-border pt-4 text-[13px] leading-6 text-burd-text-secondary">
                  {score.warnings.map((warning) => (
                    <div key={warning}>• {warning}</div>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        </StepCard>

        <StepCard
          number={6}
          title="Relatório assinado"
          description="Gere e verifique um relatório assinado para registrar localmente a identidade e o estado atual da máquina."
          summary={activeSignedReport?.report_hash ? `Relatório assinado pronto: ${truncateMiddle(activeSignedReport.report_hash, 12, 8)}` : "Relatório assinado ainda não gerado"}
          state={signedReportStepState}
          actions={
            <div className="flex flex-wrap gap-3">
              <Button
                variant="panel"
                size="md"
                disabled={burdAgent.isGeneratingReport || !identity?.provider_id}
                onClick={() => void burdAgent.generateSignedReport()}
              >
                {burdAgent.isGeneratingReport ? "Gerando relatório" : "Gerar relatório assinado"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={burdAgent.isVerifyingReport || !activeSignedReport?.report_hash}
                onClick={() => void burdAgent.verifySignedReport()}
              >
                {burdAgent.isVerifyingReport ? "Verificando" : "Verificar relatório"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={!activeSignedReport}
                onClick={() => void handleCopy("signed-report", JSON.stringify(redactSensitiveJson(activeSignedReport), null, 2))}
              >
                {copiedKey === "signed-report" ? "Copiado" : "Copiar JSON"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={!activeSignedReport}
                onClick={() => handleDownloadJson(`burd-signed-report-${Date.now()}.json`, activeSignedReport)}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Baixar relatório
              </Button>
            </div>
          }
        >
          <StatusGrid
            items={[
              ["Report hash", truncateMiddle(activeSignedReport?.report_hash, 12, 8) ?? "Indisponível"],
              ["Signature status", reportVerification?.signature_valid ? "Válida" : activeSignedReport?.signature_valid_locally ? "Válida localmente" : "Pendente"],
              ["Signing timestamp", formatDateTime(activeSignedReport?.signing_timestamp ?? activeSignedReport?.signed_at) ?? "Indisponível"],
              ["Public key", truncateMiddle(activeSignedReport?.public_key) ?? "Indisponível"],
              ["Verification result", reportVerification?.signature_valid ? "Verificado" : reportVerification ? "Inválido" : "Aguardando verificação"],
            ]}
          />
        </StepCard>

        <StepCard
          number={7}
          title="Challenge"
          description="O challenge simula o fluxo futuro em que a Burd confirmará identidade, nonce, expiração e o estado da máquina."
          summary={activeChallengeVerification?.valid ? "Challenge validado localmente" : activeChallenge ? "Challenge criado, aguardando execução" : "Challenge local ainda não criado"}
          state={challengeStepState}
          actions={
            <div className="flex flex-wrap gap-3">
              <Button
                variant="panel"
                size="md"
                disabled={burdAgent.isRunningChallenge}
                onClick={() => void burdAgent.createMockChallenge()}
              >
                Criar challenge mock
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={burdAgent.isRunningChallenge || !activeChallenge}
                onClick={() => void burdAgent.runChallenge(mockChallenge)}
              >
                {burdAgent.isRunningChallenge ? "Rodando challenge" : "Rodar challenge"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={burdAgent.isRunningChallenge || !challengeRun}
                onClick={() => void burdAgent.verifyChallenge(challengeRun)}
              >
                Verificar resposta
              </Button>
            </div>
          }
        >
          <StatusGrid
            items={[
              ["Nonce", truncateMiddle(activeChallenge?.nonce, 10, 8) ?? "Indisponível"],
              ["Challenge status", activeChallenge ? "Criado" : "Pendente"],
              ["Signed response status", challengeRun?.response?.status ?? "Pendente"],
              ["Verification result", activeChallengeVerification?.valid ? "Validado" : challengeRun ? "Aguardando validação" : "Pendente"],
              ["Expiry", formatDateTime(activeChallenge?.expires_at) ?? "Indisponível"],
            ]}
          />
        </StepCard>

        <StepCard
          number={8}
          title="Pronto para validação"
          description="A etapa final usa a readiness local para indicar o que já passou e o que ainda falta antes da futura validação backend."
          summary={buildReadinessSummary(readiness, providerVerification)}
          state={readinessStepState}
          actions={
            <Button
              variant="panel"
              size="md"
              disabled={burdAgent.isVerifyingProvider}
              onClick={() => void burdAgent.verifyProvider()}
            >
              {burdAgent.isVerifyingProvider ? "Verificando provider" : "Verificar provider"}
            </Button>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[0.4fr_0.6fr]">
            <Card padding="lg" variant="deep">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Readiness local
              </div>
              <div className="mt-4 text-[42px] leading-none text-burd-text">
                {typeof readiness?.readiness_score === "number" ? readiness.readiness_score : "--"}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge variant={flowStateVariant(readinessStepState)}>
                  {readiness?.readiness_level ?? "Sem nível"}
                </Badge>
                <Badge variant={readiness?.status === "ready_locally" ? "success" : "warning"}>
                  {readiness?.status ?? "Sem status"}
                </Badge>
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Interpretação
              </div>
              <p className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
                "Pronto localmente" não significa aprovação no marketplace. Significa que as verificações locais passaram e que a máquina está pronta para futura validação backend.
              </p>
              <p className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
                {readiness?.status === "ready_locally"
                  ? "Esta máquina passou nas verificações locais necessárias e está pronta para futura validação na Burd."
                  : "Esta máquina ainda não está pronta localmente. Complete as pendências abaixo para preparar a validação futura na Burd."}
              </p>
            </Card>
          </div>
        </StepCard>
      </div>

      <section className="space-y-4">
        <SectionHeader
          title="Readiness local"
          subtitle="Acompanhe checks, warnings, recommendations e pendências do readiness local."
          action={
            <Button variant="panel" size="sm" onClick={() => void burdAgent.refreshReadiness()}>
              Atualizar readiness
            </Button>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[0.65fr_0.35fr]">
          <Card padding="lg">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {readinessChecks.length > 0 ? (
                readinessChecks.map((check) => (
                  <ReadinessCheckCard key={check.id ?? check.label} check={check} />
                ))
              ) : (
                <EmptyStateCard text="Nenhum readiness check disponível ainda." />
              )}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card padding="lg" variant="deep">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Pendências atuais
              </div>
              <div className="mt-4 space-y-2 text-[14px] leading-7 text-burd-text-secondary">
                {partialExplanations.length > 0 ? (
                  partialExplanations.map((item) => (
                    <div key={item}>• {item}</div>
                  ))
                ) : (
                  <div>Nenhuma pendência local registrada.</div>
                )}
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Warnings
              </div>
              <div className="mt-4 space-y-2 text-[14px] leading-7 text-burd-text-secondary">
                {readiness?.warnings && readiness.warnings.length > 0 ? (
                  readiness.warnings.map((warning) => <div key={warning}>• {warning}</div>)
                ) : (
                  <div>Nenhum warning ativo.</div>
                )}
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Recommendations
              </div>
              <div className="mt-4 space-y-2 text-[14px] leading-7 text-burd-text-secondary">
                {readiness?.recommendations && readiness.recommendations.length > 0 ? (
                  readiness.recommendations.map((recommendation) => (
                    <div key={recommendation}>• {recommendation}</div>
                  ))
                ) : (
                  <div>Nenhuma recommendation ativa.</div>
                )}
              </div>
            </Card>

            <Card padding="lg">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Config local
              </div>
              <div className="mt-4 space-y-3">
                <FieldRow label="API auth" value={config?.api_auth_enabled ? "Habilitado" : "Desabilitado"} />
                <FieldRow
                  label="API token"
                  value={burdAgent.invalidToken
                    ? "Inválido"
                    : agentManager.hasApiToken
                      ? "Configurado"
                      : agentManager.tokenRequired
                        ? "Exigido"
                        : "Ausente"}
                />
                <FieldRow label="Preferred provider" value={config?.preferred_provider ?? "Indisponível"} />
                <FieldRow label="Benchmark profile" value={config?.benchmark_profile ?? "Indisponível"} />
                <FieldRow label="Telemetry" value={config?.telemetry_enabled ? "Ativado" : "Desativado"} />
                <FieldRow label="Bind" value={buildBindLabel(config)} />
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Payload de Registro"
          subtitle="Este payload será usado futuramente para enviar a máquina ao backend da Burd. Ele não contém chaves privadas nem segredos."
          action={
            <div className="flex flex-wrap gap-3">
              <Button variant="panel" size="sm" onClick={() => void burdAgent.refreshRegistrationPayload()}>
                Atualizar payload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!registrationPayload}
                onClick={() =>
                  void handleCopy(
                    "registration-payload",
                    JSON.stringify(redactSensitiveJson(registrationPayload), null, 2),
                  )
                }
              >
                {copiedKey === "registration-payload" ? "Copiado" : "Copiar payload"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!registrationPayload}
                onClick={() => handleDownloadJson(`burd-registration-payload-${Date.now()}.json`, registrationPayload)}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Baixar JSON
              </Button>
            </div>
          }
        />

        {registrationPayload ? (
          <Card padding="lg">
            <div className="grid gap-4 xl:grid-cols-2">
              <StatusGrid
                items={[
                  ["Provider ID", registrationPayload.provider_id ?? "Indisponível"],
                  ["Machine ID", registrationPayload.machine_id ?? "Indisponível"],
                  ["Public key", truncateMiddle(registrationPayload.public_key) ?? "Indisponível"],
                  ["Score", formatScore(registrationPayload.latest_score ?? undefined)],
                  ["Tier", registrationPayload.latest_tier ?? "Indisponível"],
                  ["secrets_included", registrationPayload.secrets_included === false ? "false" : "Indisponível"],
                ]}
              />
              <div className="space-y-4">
                <Card padding="sm" variant="deep">
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                    Capabilities
                  </div>
                  <div className="mt-3 space-y-2 text-[14px] leading-7 text-burd-text-secondary">
                    <div>Backend: {stringOrFallback(registrationPayload.capabilities?.backend)}</div>
                    <div>GPU count: {numberOrFallback(registrationPayload.capabilities?.gpu_count)}</div>
                    <div>
                      VRAM: {formatGigabytes(
                        typeof registrationPayload.capabilities?.vram_gb === "number"
                          ? registrationPayload.capabilities.vram_gb
                          : undefined,
                      )}
                    </div>
                    <div>Workloads: {joinList(registrationPayload.capabilities?.recommended_workloads)}</div>
                  </div>
                </Card>
                <Card padding="sm">
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                    Verification summary
                  </div>
                  <div className="mt-3 space-y-2 text-[14px] leading-7 text-burd-text-secondary">
                    <div>Audit status: {stringOrFallback(registrationPayload.verification?.audit_status)}</div>
                    <div>Hardware verified: {booleanText(registrationPayload.verification?.hardware_verified)}</div>
                    <div>Benchmark verified: {booleanText(registrationPayload.verification?.benchmark_verified)}</div>
                    <div>Challenge verified: {booleanText(registrationPayload.verification?.challenge_verified)}</div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="mt-5 border-t border-burd-border pt-4">
              <button
                type="button"
                className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary"
                onClick={() => setShowPayloadJson((current) => !current)}
              >
                {showPayloadJson ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Ver JSON técnico
              </button>

              {showPayloadJson ? (
                <pre className="mt-4 overflow-x-auto rounded-tile border border-burd-border bg-burd-panel-deep p-4 font-mono text-[12px] leading-6 text-burd-text-secondary">
                  {payloadJson}
                </pre>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card padding="lg">
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              Payload de registro ainda não disponível. Complete o fluxo de validação local para preparar esta máquina.
            </p>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Histórico de benchmarks"
          subtitle="Acompanhe benchmarks anteriores salvos localmente."
          action={
            <Button variant="panel" size="sm" onClick={() => void burdAgent.refreshHistory()}>
              Atualizar histórico
            </Button>
          }
        />

        <Card padding="lg">
          {history?.entries && history.entries.length > 0 && latestHistory ? (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-5">
                <MetricCard label="Registros" value={String(history.entries_total ?? history.entries.length)} />
                <MetricCard label="Último score" value={formatScore(latestHistory.score)} />
                <MetricCard label="Último tier" value={latestHistory.tier ?? "Indisponível"} />
                <MetricCard label="Data" value={formatDateTime(latestHistory.timestamp) ?? "Indisponível"} />
                <MetricCard label="Status" value={latestHistory.verification_status ?? "Indisponível"} />
              </div>

              <div className="overflow-x-auto rounded-tile border border-burd-border">
                <div className="grid min-w-[900px] grid-cols-[190px_120px_120px_150px_1fr] gap-3 border-b border-burd-border bg-burd-panel-deep px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
                  <span>Data</span>
                  <span>Score</span>
                  <span>Tier</span>
                  <span>Status</span>
                  <span>Hash</span>
                </div>
                <div className="divide-y divide-burd-border">
                  {history.entries.slice(-5).reverse().map((entry) => (
                    <div
                      key={entry.history_id ?? `${entry.timestamp}-${entry.report_hash}`}
                      className="grid min-w-[900px] grid-cols-[190px_120px_120px_150px_1fr] gap-3 px-4 py-4 text-[13px] text-burd-text-secondary"
                    >
                      <span>{formatDateTime(entry.timestamp) ?? "Indisponível"}</span>
                      <span className="text-burd-text">{formatScore(entry.score)}</span>
                      <span>{entry.tier ?? "Indisponível"}</span>
                      <span className={statusTextClass(entry.verification_status ?? "unknown")}>{humanizeStatus(entry.verification_status)}</span>
                      <span className="font-mono text-[12px] text-burd-text">{truncateMiddle(entry.report_hash, 12, 10) ?? "Indisponível"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              Nenhum benchmark salvo ainda.
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Pricing e Earnings demonstrativos"
          subtitle="Valores demonstrativos. A Burd ainda não implementou payouts, billing ou marketplace real nesta fase."
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card padding="lg">
            <div className="flex items-center gap-3 border-b border-burd-border pb-4">
              <Clipboard className="h-5 w-5 text-burd-text-secondary" />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                  Pricing
                </div>
                <div className="mt-1 text-[20px] text-burd-text">Precificação demonstrativa</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <FieldBlock label="Preço sugerido/h" value={formatCurrency(pricing?.final_suggested_price_brl_hour)} />
              <FieldBlock label="GPU/h" value={formatCurrency(pricing?.gpu_price_brl_hour)} />
              <FieldBlock label="CPU/h" value={formatCurrency(pricing?.cpu_price_brl_hour)} />
              <FieldBlock label="Memória GB/h" value={formatCurrency(pricing?.memory_price_brl_gb_hour)} />
              <FieldBlock label="Storage GB/h" value={formatCurrency(pricing?.storage_price_brl_gb_hour)} />
              <FieldBlock label="Demonstrativo" value={pricing?.prices_are_demonstrative ? "Sim" : "Não"} />
            </div>
          </Card>

          <Card padding="lg">
            <div className="flex items-center gap-3 border-b border-burd-border pb-4">
              <Database className="h-5 w-5 text-burd-text-secondary" />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
                  Earnings
                </div>
                <div className="mt-1 text-[20px] text-burd-text">Estimativa demonstrativa</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <FieldBlock label="Estimativa diária" value={formatCurrency(earnings?.daily_estimated_brl)} />
              <FieldBlock label="Estimativa mensal" value={formatCurrency(earnings?.monthly_estimated_brl)} />
              <FieldBlock label="Utilization" value={typeof earnings?.utilization_assumption_pct === "number" ? `${earnings.utilization_assumption_pct.toFixed(0)}%` : "Indisponível"} />
              <FieldBlock label="Active jobs future" value={numberOrFallback(earnings?.active_jobs_future)} />
              <FieldBlock label="Total earned future" value={formatCurrency(earnings?.total_earned_brl_future)} />
              <FieldBlock label="Daily earned future" value={formatCurrency(earnings?.daily_earned_brl_future)} />
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Logs e ações"
          subtitle="Acompanhe a atividade local do provider sem sair do app."
          action={
            <Button variant="panel" size="sm" onClick={() => void burdAgent.refreshLogs()}>
              Atualizar logs
            </Button>
          }
        />

        <Card padding="lg">
          {activityEntries.length > 0 ? (
            <div className="overflow-x-auto rounded-tile border border-burd-border">
              <div className="grid min-w-[900px] grid-cols-[190px_120px_120px_1fr] gap-3 border-b border-burd-border bg-burd-panel-deep px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
                <span>Horário</span>
                <span>Tipo</span>
                <span>Status</span>
                <span>Mensagem</span>
              </div>
              <div className="divide-y divide-burd-border">
                {activityEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid min-w-[900px] grid-cols-[190px_120px_120px_1fr] gap-3 px-4 py-4 text-[13px] text-burd-text-secondary"
                  >
                    <span>{formatDateTime(entry.timestamp) ?? "Sem horário"}</span>
                    <span>{entry.type}</span>
                    <span className={statusTextClass(entry.status)}>{humanizeStatus(entry.status)}</span>
                    <span className="text-burd-text">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              Nenhuma atividade registrada ainda.
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Raw Data"
          subtitle="Dados técnicos secundários, mantidos fora do fluxo principal."
          action={
            <div className="flex flex-wrap gap-3">
              <Button variant="panel" size="sm" onClick={() => void burdAgent.refreshRaw()}>
                Atualizar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!rawJson}
                onClick={() => void handleCopy("raw-json", rawJson)}
              >
                {copiedKey === "raw-json" ? "Copiado" : "Copiar JSON"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRawData((current) => !current)}
              >
                {showRawData ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showRawData ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
          }
        />

        <Card padding="lg">
          {showRawData ? (
            rawJson ? (
              <pre className="overflow-x-auto rounded-tile border border-burd-border bg-burd-panel-deep p-4 font-mono text-[12px] leading-6 text-burd-text-secondary">
                {rawJson}
              </pre>
            ) : (
              <p className="text-[14px] leading-7 text-burd-text-secondary">
                Nenhum JSON bruto disponível ainda.
              </p>
            )
          ) : (
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              O JSON bruto fica colapsado para que a tela continue parecendo produto, não um painel de endpoints.
            </p>
          )}
        </Card>
      </section>
          </>
        ) : (
          <Card padding="lg">
            <p className="text-[14px] leading-7 text-burd-text-secondary">
              O fluxo manual continua disponível para inspeção, mas a experiência principal agora tenta conduzir a validação completa com um único botão.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

function HeaderBlock({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
          Provider
        </div>
        <h1 className="mt-2 text-[32px] leading-tight text-burd-text sm:text-[36px]">
          {title}
        </h1>
        <p className="mt-3 max-w-[920px] text-[15px] leading-7 text-burd-text-secondary">
          {subtitle}
        </p>
      </div>
      {right}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
          Provider Console
        </div>
        <div className="mt-2 text-[24px] text-burd-text">{title}</div>
        <p className="mt-3 max-w-[920px] text-[14px] leading-7 text-burd-text-secondary">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

function StepCard({
  actions,
  children,
  description,
  number,
  state,
  summary,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  number: number;
  state: FlowStepState;
  summary: string;
  title: string;
}) {
  return (
    <Card padding="lg">
      <div className="flex flex-col gap-5 border-b border-burd-border pb-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 items-center justify-center border border-burd-border bg-burd-panel-deep font-mono text-[13px] text-burd-text-secondary">
            {number}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[22px] text-burd-text">{title}</div>
              <Badge variant={flowStateVariant(state)}>{humanizeFlowStepState(state)}</Badge>
            </div>
            <p className="mt-3 max-w-[920px] text-[14px] leading-7 text-burd-text-secondary">
              {description}
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
              {summary}
            </p>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </Card>
  );
}

function StepSummaryRow({
  label,
  number,
  state,
}: {
  label: string;
  number: number;
  state: FlowStepState;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-burd-border bg-burd-panel px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center border border-burd-border bg-burd-panel-deep font-mono text-[12px] text-burd-text-secondary">
          {number}
        </span>
        <span className="text-[15px] text-burd-text">{label}</span>
      </div>
      <Badge variant={flowStateVariant(state)}>{humanizeFlowStepState(state)}</Badge>
    </div>
  );
}

function ValidationStepRow({
  label,
  number,
  state,
}: {
  label: string;
  number: number;
  state: ValidationStepState;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-burd-border bg-burd-panel px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center border border-burd-border bg-burd-panel-deep font-mono text-[12px] text-burd-text-secondary">
          {number}
        </span>
        <span className="text-[15px] text-burd-text">{label}</span>
      </div>
      <Badge variant={validationStateVariant(state)}>{humanizeValidationState(state)}</Badge>
    </div>
  );
}

function StatusGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map(([label, value]) => (
        <FieldBlock key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-burd-border bg-burd-panel-deep p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
        {label}
      </div>
      <div className="mt-2 break-words text-[14px] leading-6 text-burd-text">{value}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-burd-border/60 pb-3 text-[13px] leading-6 text-burd-text-secondary last:border-b-0 last:pb-0">
      <span className="font-mono uppercase tracking-[0.08em]">{label}</span>
      <span className="max-w-[60%] text-right text-burd-text">{value}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm" variant="deep">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
        {label}
      </div>
      <div className="mt-2 text-[14px] leading-6 text-burd-text">{value}</div>
    </Card>
  );
}

function BinaryDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: AgentBinaryDiagnostics | null;
}) {
  if (!diagnostics) {
    return (
      <Card padding="lg">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
          Diagnóstico do binário
        </div>
        <p className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
          O app ainda não conseguiu coletar os metadados do `burd-agent.exe`.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-burd-text-secondary">
        Diagnóstico do binário
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <StatusGrid
          items={[
            ["Nome lógico", diagnostics.logicalBinaryName],
            ["Path resolvido", diagnostics.resolvedBinaryPath ?? "Indisponível"],
            ["Origem", humanizeBinarySource(diagnostics.source)],
            ["Existe", diagnostics.fileExists ? "Sim" : "Não"],
            ["Tamanho", formatFileSize(diagnostics.fileSize)],
            ["Modificado em", diagnostics.modifiedTime ?? "Indisponível"],
            ["SHA-256", truncateMiddle(diagnostics.sha256) ?? "Indisponível"],
            ["Command used", diagnostics.commandUsed ?? "Indisponível"],
            ["Health", diagnostics.healthStatus],
            ["Agent version", formatVersion(diagnostics.agentVersion ?? undefined) ?? "Indisponível"],
          ]}
        />
        <StatusGrid
          items={[
            ["App copy", diagnostics.syncCheck.appBinaryPath],
            ["Release", diagnostics.syncCheck.releaseBinaryPath],
            ["App size", formatFileSize(diagnostics.syncCheck.appBinarySize)],
            ["Release size", formatFileSize(diagnostics.syncCheck.releaseBinarySize)],
            ["App mtime", diagnostics.syncCheck.appBinaryModifiedTime ?? "Indisponível"],
            ["Release mtime", diagnostics.syncCheck.releaseBinaryModifiedTime ?? "Indisponível"],
            ["App SHA-256", truncateMiddle(diagnostics.syncCheck.appBinarySha256) ?? "Indisponível"],
            ["Release SHA-256", truncateMiddle(diagnostics.syncCheck.releaseBinarySha256) ?? "Indisponível"],
            ["Sync release", diagnostics.syncCheck.matchesRelease ? "Em dia" : "Divergente"],
            ["Resolved vs release", humanizeResolvedMatch(diagnostics.resolvedMatchesRelease)],
          ]}
        />
      </div>

      {diagnostics.syncCheck.warning ? (
        <div className="mt-4">
          <MessageCard variant="danger">{diagnostics.syncCheck.warning}</MessageCard>
        </div>
      ) : null}

      {diagnostics.message ? (
        <p className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
          {diagnostics.message}
        </p>
      ) : null}
    </Card>
  );
}

function BenchmarkStage({ label, state }: { label: string; state: FlowStepState }) {
  return (
    <div className="border border-burd-border bg-burd-panel-deep p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
        {label}
      </div>
      <div className="mt-2">
        <Badge variant={flowStateVariant(state)}>{humanizeFlowStepState(state)}</Badge>
      </div>
    </div>
  );
}

function ReadinessCheckCard({ check }: { check: ReadinessCheck }) {
  return (
    <div className="border border-burd-border bg-burd-panel-deep p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] text-burd-text">{check.label ?? check.id ?? "Check"}</div>
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
            {check.id ?? "check"}
          </div>
        </div>
        <Badge variant={readinessVariant(check.status)}>{check.status ?? "pending"}</Badge>
      </div>
      <div className="mt-4 text-[14px] leading-7 text-burd-text-secondary">
        {check.message ?? "Sem mensagem"}
      </div>
      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
        Score {typeof check.score === "number" ? check.score : 0}/{typeof check.max_score === "number" ? check.max_score : 0}
      </div>
    </div>
  );
}

function EmptyStateCard({ text }: { text: string }) {
  return (
    <div className="border border-burd-border bg-burd-panel-deep p-4 text-[14px] leading-7 text-burd-text-secondary">
      {text}
    </div>
  );
}

function CodeCommandBlock({ command, label }: { command: string; label: string }) {
  return (
    <div className="rounded-tile border border-burd-border bg-burd-panel-deep p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
        {label}
      </div>
      <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-6 text-burd-text">
        {command}
      </pre>
    </div>
  );
}

function MessageCard({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "success" | "danger" | "brand";
}) {
  const iconClass =
    variant === "success"
      ? "text-burd-success"
      : variant === "danger"
        ? "text-burd-danger"
        : "text-burd-blue";

  return (
    <Card
      className={
        variant === "success"
          ? "border-[#274a2d] bg-[rgba(63,128,71,0.08)]"
          : variant === "danger"
            ? "border-[#4a2626] bg-[rgba(179,71,71,0.08)]"
            : "border-[rgba(31,126,166,0.35)] bg-[rgba(31,126,166,0.08)]"
      }
      padding="sm"
    >
      <div className="flex items-start gap-3 text-[14px] leading-6 text-burd-text-secondary">
        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
        <span>{children}</span>
      </div>
    </Card>
  );
}

function resolveAgentStepState(
  agentManagerStatus: string | undefined,
  burdAgentStatus: UseBurdAgentResult["status"],
): FlowStepState {
  switch (agentManagerStatus) {
    case "online":
      return "ready";
    case "starting":
      return "running";
    case "failed":
      return "error";
    case "missing":
    case "stopped":
      return "pending";
    default:
      if (burdAgentStatus === "online") {
        return "ready";
      }
      if (burdAgentStatus === "checking") {
        return "running";
      }
      if (burdAgentStatus === "error") {
        return "error";
      }
      return "pending";
  }
}

function buildAgentTitle(status: string | undefined) {
  switch (status) {
    case "missing":
      return "Agent não encontrado";
    case "stopped":
      return "Agent parado";
    case "starting":
      return "Iniciando agent";
    case "failed":
      return "Agent falhou";
    case "online":
      return "Agent online";
    default:
      return "Burd Agent local";
  }
}

function buildAgentHeaderBadge(status: string | undefined) {
  switch (status) {
    case "starting":
      return "Iniciando agent";
    case "failed":
      return "Agent falhou";
    case "online":
      return "Agent online";
    case "missing":
      return "Agent não encontrado";
    case "stopped":
      return "Agent parado";
    default:
      return "Agent local";
  }
}

function humanizeAgentManagerStatus(status: string | undefined) {
  switch (status) {
    case "starting":
      return "Starting";
    case "failed":
      return "Falhou";
    case "online":
      return "Online";
    case "missing":
      return "Não encontrado";
    case "stopped":
      return "Parado";
    default:
      return "Indisponível";
  }
}

function buildAgentStatusCopy(status: string | undefined, managedByApp: boolean) {
  switch (status) {
    case "starting":
      return "Iniciando pelo app";
    case "failed":
      return "Falha ao iniciar ou manter o agent";
    case "online":
      return managedByApp ? "Gerenciado pelo app" : "Online fora do app";
    case "missing":
      return "Binário não encontrado";
    case "stopped":
      return "Não conectado";
    default:
      return "Não conectado";
  }
}

function buildAgentStepSummary(status: string | undefined, managedByApp: boolean) {
  switch (status) {
    case "online":
      return managedByApp ? "Agent conectado e gerenciado pelo app" : "Agent conectado externamente";
    case "starting":
      return "O app está iniciando o burd-agent local";
    case "failed":
      return "O agent falhou ou não respondeu ao health local";
    case "missing":
      return "O app não encontrou o binário `burd-agent.exe`";
    case "stopped":
      return "O agent está parado e pode ser iniciado pelo app";
    default:
      return "Estado do agent ainda não determinado";
  }
}

function humanizeBinarySource(source: string | null | undefined) {
  switch (source) {
    case "app-binaries":
      return "src-tauri/binaries";
    case "env":
      return "BURD_AGENT_PATH";
    case "benchmark-release":
      return "benchmark release";
    case "benchmark-debug":
      return "benchmark debug";
    case "bundled-resource":
      return "recurso empacotado";
    case "sidecar":
      return "sidecar";
    default:
      return "Indisponível";
  }
}

function humanizeResolvedMatch(value: boolean | null | undefined) {
  if (value === true) {
    return "Igual ao release";
  }
  if (value === false) {
    return "Diferente do release";
  }
  return "Indisponível";
}

function formatFileSize(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Indisponível";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function resolveFlowStepState({
  hasError = false,
  ready = false,
  running = false,
  warning = false,
}: {
  hasError?: boolean;
  ready?: boolean;
  running?: boolean;
  warning?: boolean;
}): FlowStepState {
  if (running) {
    return "running";
  }
  if (hasError) {
    return "error";
  }
  if (ready) {
    return "ready";
  }
  if (warning) {
    return "warning";
  }
  return "pending";
}

function resolveValidationStepState({
  failed = false,
  passed = false,
  running = false,
  warning = false,
}: {
  failed?: boolean;
  passed?: boolean;
  running?: boolean;
  warning?: boolean;
}): ValidationStepState {
  if (running) {
    return "running";
  }
  if (failed) {
    return "failed";
  }
  if (passed) {
    return "passed";
  }
  if (warning) {
    return "warning";
  }
  return "pending";
}

export function hasCompleteBenchmarkEvidence(
  report: any,
  score: any,
): "passed" | "warning" | "failed" | "pending" {
  if (!score || typeof score.burd_compute_score !== "number") {
    return "pending";
  }

  const warnings = score.warnings ?? [];
  const hasFallbacks = warnings.some((w: string) =>
    w.includes("unavailable") ||
    w.includes("estimate") ||
    w.includes("neutral") ||
    w.includes("fallback") ||
    w.includes("minimal")
  );

  const llmSkipped = isSkipped(report?.llm_benchmark);
  const stabilitySkipped = isSkipped(report?.stability);
  const networkSkipped = isSkipped(report?.network);
  const diskSkipped = isSkipped(report?.disk);

  if (hasFallbacks || llmSkipped || stabilitySkipped || networkSkipped || diskSkipped) {
    return "warning";
  }

  return "passed";
}

function isSkipped(value: any) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.status === "skipped"
  );
}

function buildBenchmarkStages(
  benchmarkStatus: string | undefined,
  lastReport: any,
  score: any,
) {
  const running = benchmarkStatus === "running";
  const failed = benchmarkStatus === "failed";
  const report = lastReport;

  const scoreWarnings = score?.warnings ?? [];
  const systemAvailable = report?.system && Object.keys(report.system).length > 0;
  const fitAvailable = report?.fit && Object.keys(report.fit).length > 0;
  const scoreAvailable = typeof score?.burd_compute_score === "number";
  const reportAvailable = report?.report_hash || report?.timestamp;

  const getStage = (key: string): { state: FlowStepState; statusLabel?: string } => {
    if (running) {
      return { state: "running" };
    }
    if (failed) {
      return { state: "error" };
    }

    if (key === "system") {
      return systemAvailable ? { state: "ready" } : { state: "pending" };
    }
    if (key === "fit") {
      return fitAvailable ? { state: "ready" } : { state: "pending" };
    }
    if (key === "score") {
      return scoreAvailable ? { state: "ready" } : { state: "pending" };
    }
    if (key === "report") {
      return reportAvailable ? { state: "ready" } : { state: "pending" };
    }

    const val = report?.[key];
    const isSkippedVal = isSkipped(val);

    if (key === "llm_benchmark") {
      if (scoreWarnings.some((w: string) => w.includes("LLM benchmark unavailable") || w.includes("llmfit TPS estimate"))) {
        return { state: "warning", statusLabel: "LLM fallback" };
      }
      if (isSkippedVal) {
        return { state: "warning", statusLabel: "LLM indisponível" };
      }
      if (val && !isSkippedVal) {
        return { state: "ready" };
      }
      return { state: "pending" };
    }

    if (key === "stability") {
      if (scoreWarnings.some((w: string) => w.includes("stability benchmark unavailable") || w.includes("neutral stability"))) {
        return { state: "warning", statusLabel: "Fallback neutro" };
      }
      if (isSkippedVal) {
        return { state: "warning", statusLabel: "Fallback" };
      }
      if (val && !isSkippedVal) {
        return { state: "ready" };
      }
      return { state: "pending" };
    }

    if (key === "network") {
      if (scoreWarnings.some((w: string) => w.includes("network benchmark unavailable") || w.includes("neutral network"))) {
        return { state: "warning", statusLabel: "Fallback neutro" };
      }
      if (isSkippedVal) {
        return { state: "warning", statusLabel: "Fallback" };
      }
      if (val && !isSkippedVal) {
        return { state: "ready" };
      }
      return { state: "pending" };
    }

    if (key === "disk") {
      if (scoreWarnings.some((w: string) => w.includes("disk benchmark unavailable") || w.includes("neutral disk"))) {
        return { state: "warning", statusLabel: "Fallback neutro" };
      }
      if (isSkippedVal) {
        return { state: "warning", statusLabel: "Fallback" };
      }
      if (val && !isSkippedVal) {
        return { state: "ready" };
      }
      return { state: "pending" };
    }

    return { state: "pending" };
  };

  return [
    { label: "Sistema", ...getStage("system") },
    { label: "Fit", ...getStage("fit") },
    { label: "LLM", ...getStage("llm_benchmark") },
    { label: "Estabilidade", ...getStage("stability") },
    { label: "Rede", ...getStage("network") },
    { label: "Disco", ...getStage("disk") },
    { label: "Score", ...getStage("score") },
    { label: "Report", ...getStage("report") },
  ];
}

function buildBenchmarkSummary(
  benchmarkStatus: string | undefined,
  latestHistory: BenchmarkHistoryItem | null,
) {
  if (benchmarkStatus === "running") {
    return "Benchmark em execução. Isso pode levar alguns minutos.";
  }
  if (benchmarkStatus === "completed") {
    return "Benchmark completo concluído.";
  }
  if (latestHistory) {
    return `Último benchmark salvo em ${formatDateTime(latestHistory.timestamp) ?? "data desconhecida"}.`;
  }
  return "Aguardando benchmark local.";
}

function buildReadinessSummary(
  readiness: UseBurdAgentResult["data"]["readiness"],
  providerVerification: ProviderVerificationResult | null,
) {
  if (readiness?.status === "ready_locally") {
    return "Esta máquina está pronta para futura validação no backend da Burd.";
  }
  if (providerVerification?.message) {
    return providerVerification.message;
  }
  return "Esta máquina ainda não está pronta localmente. Complete as pendências abaixo para preparar a validação futura na Burd.";
}

function flowStateVariant(state: FlowStepState) {
  switch (state) {
    case "ready":
      return "success" as const;
    case "running":
      return "brand" as const;
    case "error":
      return "danger" as const;
    case "warning":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function validationStateVariant(state: ValidationStepState) {
  switch (state) {
    case "passed":
      return "success" as const;
    case "running":
      return "brand" as const;
    case "failed":
      return "danger" as const;
    case "warning":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function readinessVariant(status: string | undefined) {
  switch ((status ?? "").toLowerCase()) {
    case "passed":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function humanizeFlowStepState(state: FlowStepState) {
  switch (state) {
    case "ready":
      return "Pronto";
    case "running":
      return "Rodando";
    case "error":
      return "Erro";
    case "warning":
      return "Warning";
    default:
      return "Pendente";
  }
}

function humanizeValidationState(state: ValidationStepState) {
  switch (state) {
    case "passed":
      return "Passou";
    case "running":
      return "Rodando";
    case "failed":
      return "Falhou";
    case "warning":
      return "Warning";
    default:
      return "Pendente";
  }
}

function humanizeValidationRunStatus(status: ValidationRunStatus) {
  switch (status) {
    case "running":
      return "Verificando";
    case "success":
      return "Concluído";
    case "partial":
      return "Parcial";
    case "failed":
      return "Falhou";
    default:
      return "Aguardando";
  }
}

function coerceChallengeVerification(value: unknown): ChallengeVerifyResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as ChallengeVerifyResult;
}

function buildActivityEntries(actions: AgentActionLog[], logs: AgentLogItem[]) {
  const taskIndex = new Map<
    string,
    { action: AgentActionLog; task?: AgentActionTask }
  >();

  actions.forEach((action) => {
    action.tasks?.forEach((task) => {
      if (task.id) {
        taskIndex.set(task.id, { action, task });
      }
    });
  });

  const actionEntries: ActivityEntry[] = actions.map((action) => ({
    id: action.id ?? `action-${action.start_time ?? action.name}`,
    timestamp: action.end_time ?? action.start_time ?? null,
    type: "Ação",
    status: action.status ?? "unknown",
    message:
      action.tasks?.[0]?.description ??
      action.tasks?.[0]?.title ??
      action.name ??
      "Ação registrada",
  }));

  const logEntries: ActivityEntry[] = logs.flatMap((entry, logIndex) => {
    const taskMeta = entry.task_id ? taskIndex.get(entry.task_id) : undefined;
    return (entry.logs ?? []).map((message, messageIndex) => ({
      id: `${entry.task_id ?? "log"}-${logIndex}-${messageIndex}`,
      timestamp:
        taskMeta?.task?.end_time ??
        taskMeta?.task?.start_time ??
        taskMeta?.action?.start_time ??
        null,
      type: "Log",
      status: taskMeta?.task?.status ?? taskMeta?.action?.status ?? "info",
      message,
    }));
  });

  return [...actionEntries, ...logEntries].sort((left, right) => {
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    return rightTime - leftTime;
  });
}

function buildOsLabel(os: string | undefined, architecture: string | undefined) {
  if (!os && !architecture) {
    return "Indisponível";
  }
  return [os, architecture].filter(Boolean).join(" / ");
}

function buildRuntimeLabel(system: Record<string, unknown> | null | undefined) {
  if (!system) {
    return "Indisponível";
  }

  const parts = [
    typeof system.backend_detected === "string" ? system.backend_detected : null,
    system.cuda_available ? "CUDA" : null,
    system.rocm_available ? "ROCm" : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "Indisponível";
}

function buildBindLabel(config: Record<string, unknown> | null | undefined) {
  const host = typeof config?.api_bind_host === "string" ? config.api_bind_host : null;
  const port = typeof config?.api_port === "number" ? config.api_port : null;

  if (!host && !port) {
    return "Indisponível";
  }

  return `${host ?? "127.0.0.1"}:${port ?? 8787}`;
}

function joinList(value: unknown) {
  return Array.isArray(value) && value.length > 0
    ? value.join(", ")
    : "Indisponível";
}

function stringOrFallback(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "Indisponível";
}

function numberOrFallback(value: unknown) {
  return typeof value === "number" ? String(value) : "Indisponível";
}

function booleanText(value: unknown) {
  if (value === true) {
    return "Sim";
  }
  if (value === false) {
    return "Não";
  }
  return "Indisponível";
}

function statusTextClass(value: string | undefined) {
  const normalized = (value ?? "").toLowerCase();
  if (
    normalized.includes("completed") ||
    normalized.includes("passed") ||
    normalized.includes("valid")
  ) {
    return "text-burd-success";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("invalid")
  ) {
    return "text-burd-danger";
  }
  if (normalized.includes("warning") || normalized.includes("partial")) {
    return "text-[#d1a652]";
  }
  if (normalized.includes("running")) {
    return "text-burd-blue";
  }
  return "text-burd-text-secondary";
}

function humanizeStatus(value: string | undefined) {
  switch ((value ?? "").toLowerCase()) {
    case "completed":
      return "Concluído";
    case "passed":
      return "Passou";
    case "failed":
      return "Falhou";
    case "warning":
      return "Warning";
    case "ready_locally":
      return "Pronto localmente";
    case "not_verified":
      return "Não verificado";
    case "running":
      return "Rodando";
    case "partial":
      return "Parcial";
    case "failed_local":
      return "Falhou localmente";
    default:
      return value ?? "Indisponível";
  }
}

function formatVersion(version: string | undefined) {
  if (!version) {
    return null;
  }
  return version.startsWith("v") ? version : `v${version}`;
}

function formatScore(value: number | undefined) {
  if (typeof value !== "number") {
    return "Indisponível";
  }
  return value.toFixed(1);
}

function formatGigabytes(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Indisponível";
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} GB`;
}

function formatCurrency(value: number | undefined) {
  if (typeof value !== "number") {
    return "Indisponível";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
}

function truncateMiddle(value: string | null | undefined, start = 12, end = 10) {
  if (!value) {
    return null;
  }
  if (value.length <= start + end + 3) {
    return value;
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function renderScoreBreakdown(components: Record<string, unknown> | undefined) {
  if (!components) {
    return <EmptyStateCard text="Nenhum breakdown de score disponível." />;
  }

  return Object.entries(components).map(([key, value]) => (
    <div
      key={key}
      className="flex items-center justify-between gap-4 border-b border-burd-border/60 pb-3 text-[13px] leading-6 text-burd-text-secondary last:border-b-0 last:pb-0"
    >
      <span>{key.replaceAll("_", " ")}</span>
      <span className="font-mono text-burd-text">
        {formatScore(typeof value === "number" ? value : undefined)}
      </span>
    </div>
  ));
}
