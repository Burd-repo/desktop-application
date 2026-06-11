import { useCallback, useEffect, useState } from "react";
import {
  agentManagerBinaryDiagnostics,
  agentApiTokenCreate,
  agentApiTokenRotate,
  agentApiTokenStatus,
  agentManagerLogs,
  agentManagerResolveBinary,
  agentManagerRestart,
  agentManagerStart,
  agentManagerStatus,
  agentManagerStop,
  type AgentApiTokenMutationResult,
  type AgentApiTokenStatus,
  type AgentBinaryDiagnostics,
  type AgentManagerBinaryResolution,
  type AgentManagerStatus,
} from "../lib/agent-manager-client";
import {
  clearAgentApiToken,
  getAgentApiToken,
  setAgentApiToken,
} from "../lib/burd-agent-client";

interface UseAgentManagerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
}

export interface UseAgentManagerResult {
  apiTokenStatus: AgentApiTokenStatus | null;
  binaryDiagnostics: AgentBinaryDiagnostics | null;
  status: AgentManagerStatus | null;
  resolution: AgentManagerBinaryResolution | null;
  logs: string[];
  error: string | null;
  hasApiToken: boolean;
  tokenRequired: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isUpdatingApiToken: boolean;
  isOnline: boolean;
  isMissing: boolean;
  createApiToken: () => Promise<AgentApiTokenStatus | null>;
  rotateApiToken: () => Promise<AgentApiTokenStatus | null>;
  refreshApiTokenStatus: () => Promise<AgentApiTokenStatus | null>;
  startAgent: () => Promise<AgentManagerStatus | null>;
  stopAgent: () => Promise<AgentManagerStatus | null>;
  restartAgent: () => Promise<AgentManagerStatus | null>;
  refreshStatus: () => Promise<AgentManagerStatus | null>;
  refreshBinaryDiagnostics: () => Promise<AgentBinaryDiagnostics | null>;
  refreshLogs: () => Promise<void>;
  clearError: () => void;
  setRuntimeApiToken: (token: string | null) => void;
}

function resolveAgentManagerError(
  status: AgentManagerStatus | null,
  resolution: AgentManagerBinaryResolution | null,
) {
  switch (status?.status) {
    case "missing":
      return status.message ?? resolution?.message ?? status.lastError ?? null;
    case "failed":
      return status.lastError ?? status.message ?? resolution?.message ?? null;
    default:
      return null;
  }
}

function stripApiTokenValue(
  status: AgentApiTokenStatus | AgentApiTokenMutationResult | null,
): AgentApiTokenStatus | null {
  if (!status) {
    return null;
  }

  const { token: _token, ...sanitized } = status as AgentApiTokenMutationResult;
  return sanitized;
}

export function useAgentManager({
  enabled = true,
  pollIntervalMs = 5000,
}: UseAgentManagerOptions = {}): UseAgentManagerResult {
  const [apiTokenStatus, setApiTokenStatus] = useState<AgentApiTokenStatus | null>(null);
  const [binaryDiagnostics, setBinaryDiagnostics] =
    useState<AgentBinaryDiagnostics | null>(null);
  const [status, setStatus] = useState<AgentManagerStatus | null>(null);
  const [resolution, setResolution] = useState<AgentManagerBinaryResolution | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasApiToken, setHasApiToken] = useState(() => Boolean(getAgentApiToken()));
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUpdatingApiToken, setIsUpdatingApiToken] = useState(false);

  const setRuntimeApiToken = useCallback((token: string | null) => {
    if (token && token.trim()) {
      setAgentApiToken(token);
    } else {
      clearAgentApiToken();
    }

    setHasApiToken(Boolean(getAgentApiToken()));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshApiTokenStatus = useCallback(async () => {
    if (!enabled) {
      return null;
    }

    try {
      const nextStatus = stripApiTokenValue(await agentApiTokenStatus());
      setApiTokenStatus(nextStatus);
      return nextStatus;
    } catch {
      setApiTokenStatus(null);
      return null;
    }
  }, [enabled]);

  const refreshBinaryDiagnostics = useCallback(async () => {
    if (!enabled) {
      return null;
    }

    try {
      const nextDiagnostics = await agentManagerBinaryDiagnostics();
      setBinaryDiagnostics(nextDiagnostics);
      return nextDiagnostics;
    } catch {
      setBinaryDiagnostics(null);
      return null;
    }
  }, [enabled]);

  const updateTokenFromMutation = useCallback(
    (result: AgentApiTokenMutationResult) => {
      setRuntimeApiToken(result.token ?? null);
      const sanitized = stripApiTokenValue(result);
      setApiTokenStatus(sanitized);
      return sanitized;
    },
    [setRuntimeApiToken],
  );

  const createApiToken = useCallback(async () => {
    setIsUpdatingApiToken(true);
    setError(null);

    try {
      const result = await agentApiTokenCreate();
      return updateTokenFromMutation(result);
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Não foi possível configurar o token local.";
      setError(message);
      return null;
    } finally {
      setIsUpdatingApiToken(false);
    }
  }, [updateTokenFromMutation]);

  const rotateApiToken = useCallback(async () => {
    setIsUpdatingApiToken(true);
    setError(null);

    try {
      const result = await agentApiTokenRotate();
      return updateTokenFromMutation(result);
    } catch (rotateError) {
      const message =
        rotateError instanceof Error
          ? rotateError.message
          : "Não foi possível rotacionar o token local.";
      setError(message);
      return null;
    } finally {
      setIsUpdatingApiToken(false);
    }
  }, [updateTokenFromMutation]);

  const refreshStatus = useCallback(async () => {
    if (!enabled) {
      return null;
    }

    try {
      const [nextStatus, nextResolution, nextApiTokenStatus] = await Promise.all([
        agentManagerStatus(),
        agentManagerResolveBinary(),
        refreshApiTokenStatus(),
      ]);
      setStatus(nextStatus);
      setResolution(nextResolution);
      setApiTokenStatus(nextApiTokenStatus);
      setError(resolveAgentManagerError(nextStatus, nextResolution));
      return nextStatus;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível consultar o Agent Manager.";
      setError(message);
      return null;
    }
  }, [enabled, refreshApiTokenStatus]);

  const refreshLogs = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const result = await agentManagerLogs();
      setLogs(result.logs ?? []);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível carregar os logs do Agent Manager.";
      setError(message);
    }
  }, [enabled]);

  const startAgent = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await agentManagerStart();
      setStatus(result);
      setError(result.lastError ?? result.message ?? null);
      await Promise.all([refreshLogs(), refreshStatus(), refreshBinaryDiagnostics()]);
      return result;
    } catch (startError) {
      const message =
        startError instanceof Error
          ? startError.message
          : "Não foi possível iniciar o Burd Agent.";
      setError(message);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [refreshBinaryDiagnostics, refreshLogs, refreshStatus]);

  const stopAgent = useCallback(async () => {
    setIsStopping(true);
    setError(null);

    try {
      const result = await agentManagerStop();
      setStatus(result);
      setError(result.lastError ?? result.message ?? null);
      await Promise.all([refreshLogs(), refreshStatus(), refreshBinaryDiagnostics()]);
      return result;
    } catch (stopError) {
      const message =
        stopError instanceof Error
          ? stopError.message
          : "Não foi possível parar o Burd Agent.";
      setError(message);
      return null;
    } finally {
      setIsStopping(false);
    }
  }, [refreshBinaryDiagnostics, refreshLogs, refreshStatus]);

  const restartAgent = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await agentManagerRestart();
      setStatus(result);
      setError(result.lastError ?? result.message ?? null);
      await Promise.all([refreshLogs(), refreshStatus(), refreshBinaryDiagnostics()]);
      return result;
    } catch (restartError) {
      const message =
        restartError instanceof Error
          ? restartError.message
          : "Não foi possível reiniciar o Burd Agent.";
      setError(message);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [refreshBinaryDiagnostics, refreshLogs, refreshStatus]);

  useEffect(() => {
    void refreshStatus();
    void refreshBinaryDiagnostics();
    void refreshLogs();
  }, [refreshBinaryDiagnostics, refreshLogs, refreshStatus]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, pollIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, pollIntervalMs, refreshStatus]);

  useEffect(() => {
    if (!enabled || !(status?.status === "starting" || status?.status === "failed")) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshLogs();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [enabled, refreshLogs, status?.status]);

  return {
    apiTokenStatus,
    binaryDiagnostics,
    status,
    resolution,
    logs,
    error,
    hasApiToken,
    tokenRequired: Boolean(apiTokenStatus?.apiAuthEnabled && apiTokenStatus?.tokenConfigured),
    isStarting,
    isStopping,
    isUpdatingApiToken,
    isOnline: status?.status === "online",
    isMissing: status?.status === "missing",
    createApiToken,
    rotateApiToken,
    refreshApiTokenStatus,
    startAgent,
    stopAgent,
    restartAgent,
    refreshStatus,
    refreshBinaryDiagnostics,
    refreshLogs,
    clearError,
    setRuntimeApiToken,
  };
}
