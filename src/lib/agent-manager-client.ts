import { invoke } from "@tauri-apps/api/core";

export type AgentManagerStatusKind =
  | "missing"
  | "stopped"
  | "starting"
  | "online"
  | "failed";

export interface AgentManagerStatus {
  status: AgentManagerStatusKind;
  binaryPath: string | null;
  managedByApp: boolean;
  pid: number | null;
  port: number;
  healthUrl: string;
  lastError: string | null;
  lastStartedAt: string | null;
  message: string | null;
}

export interface AgentManagerLogsResult {
  logs: string[];
}

export interface AgentManagerBinaryResolution {
  status: "resolved" | "missing";
  binaryPath: string | null;
  source: string | null;
  message: string | null;
}

export interface AgentBinarySyncDiagnostics {
  appBinaryPath: string;
  appBinaryExists: boolean;
  appBinarySize: number | null;
  appBinaryModifiedTime: string | null;
  appBinarySha256: string | null;
  releaseBinaryPath: string;
  releaseBinaryExists: boolean;
  releaseBinarySize: number | null;
  releaseBinaryModifiedTime: string | null;
  releaseBinarySha256: string | null;
  matchesRelease: boolean;
  warning: string | null;
}

export interface AgentBinaryDiagnostics {
  logicalBinaryName: string;
  resolvedBinaryPath: string | null;
  fileExists: boolean;
  fileSize: number | null;
  modifiedTime: string | null;
  sha256: string | null;
  source: string | null;
  commandUsed: string | null;
  healthStatus: string;
  agentVersion: string | null;
  resolvedMatchesRelease: boolean | null;
  syncCheck: AgentBinarySyncDiagnostics;
  message: string | null;
}

export interface AgentApiTokenStatus {
  configPath: string;
  apiAuthEnabled: boolean;
  tokenConfigured: boolean;
  tokenHashPreview: string | null;
  warning: string | null;
}

export interface AgentApiTokenMutationResult extends AgentApiTokenStatus {
  token?: string | null;
}

export async function agentManagerStatus() {
  return invoke<AgentManagerStatus>("agent_manager_status");
}

export async function agentManagerStart() {
  return invoke<AgentManagerStatus>("agent_manager_start");
}

export async function agentManagerStop() {
  return invoke<AgentManagerStatus>("agent_manager_stop");
}

export async function agentManagerRestart() {
  return invoke<AgentManagerStatus>("agent_manager_restart");
}

export async function agentManagerLogs() {
  return invoke<AgentManagerLogsResult>("agent_manager_logs");
}

export async function agentManagerResolveBinary() {
  return invoke<AgentManagerBinaryResolution>("agent_manager_resolve_binary");
}

export async function agentManagerBinaryDiagnostics() {
  return invoke<AgentBinaryDiagnostics>("agent_manager_binary_diagnostics");
}

export async function agentApiTokenStatus() {
  return invoke<AgentApiTokenStatus>("agent_api_token_status");
}

export async function agentApiTokenCreate() {
  return invoke<AgentApiTokenMutationResult>("agent_api_token_create");
}

export async function agentApiTokenRotate() {
  return invoke<AgentApiTokenMutationResult>("agent_api_token_rotate");
}
