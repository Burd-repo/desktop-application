export interface HealthInfo {
  status?: string;
  agent_version?: string;
  benchmark_version?: string;
  api_auth_warning?: string | null;
  [key: string]: unknown;
}

export type AgentHealth = HealthInfo;

export interface SystemGpuInfo {
  name?: string;
  vram_gb?: number | null;
  backend?: string;
  count?: number;
  unified_memory?: boolean;
  [key: string]: unknown;
}

export interface SystemInfo {
  os?: string;
  architecture?: string;
  cpu?: string;
  cpu_cores?: number;
  ram_total_gb?: number;
  ram_available_gb?: number;
  gpus?: SystemGpuInfo[];
  gpu_count?: number;
  primary_gpu_name?: string | null;
  vram_per_gpu_gb?: number | null;
  vram_total_gb?: number | null;
  backend_detected?: string;
  cuda_available?: boolean;
  rocm_available?: boolean;
  nvidia_driver?: string | null;
  amd_driver?: string | null;
  container_detected?: boolean;
  vm_detected?: boolean;
  timestamp?: string;
  agent_version?: string;
  benchmark_version?: string;
  [key: string]: unknown;
}

export interface FitInfo {
  source?: string;
  total_models_analyzed?: number;
  runnable_models?: number;
  recommended_workloads?: string[];
  not_recommended_workloads?: string[];
  provider_capability_summary?: string;
  models?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ScoreBreakdown {
  llm_benchmark?: number;
  vram_capacity?: number;
  stability?: number;
  network?: number;
  disk?: number;
  verification?: number;
  [key: string]: unknown;
}

export interface ScoreInfo {
  burd_compute_score?: number;
  tier?: string;
  eligible?: boolean;
  recommended_workloads?: string[];
  not_recommended_workloads?: string[];
  suggested_price_brl_hour?: number;
  price_basis?: string;
  prices_are_demonstrative?: boolean;
  components?: ScoreBreakdown;
  warnings?: string[];
  notes?: string[];
  [key: string]: unknown;
}

export interface PricingInfo {
  cpu_price_brl_hour?: number;
  memory_price_brl_gb_hour?: number;
  storage_price_brl_gb_hour?: number;
  gpu_price_brl_hour?: number;
  endpoint_price_brl_hour_future?: number;
  ip_price_brl_hour_future?: number;
  final_suggested_price_brl_hour?: number;
  prices_are_demonstrative?: boolean;
  warnings?: string[];
  [key: string]: unknown;
}

export interface EarningsInfo {
  daily_estimated_brl?: number;
  monthly_estimated_brl?: number;
  total_earned_brl_future?: number;
  daily_earned_brl_future?: number;
  active_jobs_future?: number;
  total_jobs_future?: number;
  utilization_assumption_pct?: number;
  note?: string;
  warning?: string;
  [key: string]: unknown;
}

export interface VerificationInfo {
  hardware_verified?: boolean;
  benchmark_verified?: boolean;
  signature_verified?: boolean;
  challenge_verified?: boolean;
  uptime_verified?: boolean;
  network_verified?: boolean;
  disk_verified?: boolean;
  llm_runtime_verified?: boolean;
  fraud_risk_level?: string;
  audit_status?: string;
  warnings?: string[];
  failed_checks?: string[];
  [key: string]: unknown;
}

export interface ProviderIdentity {
  exists?: boolean;
  status?: string;
  provider_id?: string | null;
  providerId?: string;
  machine_id?: string | null;
  machineId?: string;
  public_key?: string | null;
  publicKey?: string;
  key_algorithm?: string | null;
  key_status?: string;
  created_at?: string | null;
  config_path?: string;
  message?: string | null;
  [key: string]: unknown;
}

export interface IdentityInitResult {
  status?: string;
  created?: boolean;
  config_path?: string;
  identity?: ProviderIdentity | Record<string, unknown>;
  provider_id?: string | null;
  machine_id?: string | null;
  public_key?: string | null;
  key_algorithm?: string | null;
  created_at?: string | null;
  error?: string;
  [key: string]: unknown;
}

export interface IdentityRotateResult {
  status?: string;
  provider_id?: string | null;
  machine_id?: string | null;
  public_key?: string | null;
  key_algorithm?: string | null;
  config_path?: string;
  key_status?: string;
  created_at?: string | null;
  error?: string;
  [key: string]: unknown;
}

export interface ProviderHardwareInfo {
  cpu?: string;
  architecture?: string;
  memory_gb?: number;
  disk_free_gb?: number | null;
  backend?: string;
  gpu_count?: number;
  vram_gb?: number | null;
  [key: string]: unknown;
}

export interface ProviderLocationInfo {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
}

export interface ProviderInfo {
  provider_id?: string;
  machine_id?: string;
  public_key?: string | null;
  host_uri?: string;
  created_at?: string | null;
  last_check_date?: string;
  is_online?: boolean;
  is_verified?: boolean;
  is_audited?: boolean;
  audit_status?: string;
  location?: ProviderLocationInfo;
  hardware?: ProviderHardwareInfo;
  gpu_models?: Array<{
    vendor?: string;
    model?: string;
    vram_gb?: number | null;
    count?: number;
    [key: string]: unknown;
  }>;
  uptime_1d?: number;
  uptime_7d?: number;
  uptime_30d?: number;
  uptime?: UptimeInfo;
  pricing?: PricingInfo;
  score?: ScoreInfo;
  tier?: string;
  estimated_earnings?: EarningsInfo;
  attributes?: Array<{ key?: string; value?: string; [key: string]: unknown }>;
  stats?: Record<string, unknown>;
  logs_summary?: {
    actions_total?: number;
    logs_total?: number;
    latest_action?: AgentActionLog | null;
    [key: string]: unknown;
  };
  raw_report?: ReportInfo | Record<string, unknown>;
  verification?: VerificationInfo;
  backend_verification_status_future?: string;
  [key: string]: unknown;
}

export interface ChallengeRequiredTest {
  name?: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface ChallengePolicy {
  require_signed_report?: boolean;
  require_llm_benchmark?: boolean;
  require_stability?: boolean;
  require_network?: boolean;
  require_disk?: boolean;
  [key: string]: unknown;
}

export interface ChallengeInfo {
  challenge_id?: string;
  nonce?: string;
  benchmark_profile?: string;
  required_tests?: ChallengeRequiredTest[];
  issued_at?: string;
  expires_at?: string;
  backend_url?: string | null;
  min_agent_version?: string;
  min_benchmark_version?: string;
  policy?: ChallengePolicy;
  [key: string]: unknown;
}

export interface ChallengeResponseInfo {
  challenge_id?: string;
  nonce?: string;
  provider_id?: string;
  machine_id?: string;
  report_hash?: string;
  signed_report?: SignedReportResult | Record<string, unknown> | null;
  signature?: string;
  public_key?: string;
  completed_at?: string;
  status?: string;
  failed_requirements?: string[];
  verification_result?: unknown;
  [key: string]: unknown;
}

export interface ReportInfo {
  identity?: {
    provider_id?: string | null;
    machine_id?: string;
    benchmark_profile?: string;
    public_key?: string | null;
    key_algorithm?: string | null;
    created_at?: string;
    country?: string | null;
    city?: string | null;
    region?: string | null;
    [key: string]: unknown;
  };
  system?: Record<string, unknown>;
  fit?: unknown;
  llm_benchmark?: unknown;
  stability?: unknown;
  network?: unknown;
  disk?: unknown;
  score?: {
    burd_compute_score?: number;
    tier?: string;
    eligible?: boolean;
    prices_are_demonstrative?: boolean;
    [key: string]: unknown;
  };
  timestamp?: string;
  agent_version?: string;
  benchmark_version?: string;
  benchmark_profile?: string;
  challenge?: ChallengeInfo | null;
  signature?: {
    algorithm?: string;
    value?: string;
    status?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ReportVerificationResult {
  status?: string;
  report_hash?: string | null;
  signature_valid?: boolean;
  key_algorithm?: string | null;
  provider_id?: string | null;
  machine_id?: string | null;
  checked_at?: string;
  warnings?: string[];
  errors?: string[];
  verification_result?: ReportVerificationResult;
  signed_report?: SignedReportResult | Record<string, unknown>;
  [key: string]: unknown;
}

export interface SignedReportResult {
  status?: string;
  report_hash?: string;
  signature?: string;
  public_key?: string;
  key_algorithm?: string;
  signed_at?: string;
  signing_timestamp?: string;
  signature_valid_locally?: boolean;
  verification_result?: ReportVerificationResult;
  report?: ReportInfo | Record<string, unknown>;
  signed_report?: Record<string, unknown> | null;
  provider_id?: string;
  machine_id?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ChallengeCreateResult {
  status?: string;
  challenge?: ChallengeInfo;
  nonce?: string;
  expires_at?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ChallengeVerifyResult {
  status?: string;
  challenge_id?: string;
  valid?: boolean;
  signature_valid?: boolean;
  expired?: boolean;
  checked_at?: string;
  warnings?: string[];
  errors?: string[];
  verification?: ChallengeVerifyResult | Record<string, unknown>;
  challenge?: ChallengeInfo;
  response?: ChallengeResponseInfo;
  error?: string;
  [key: string]: unknown;
}

export interface ChallengeRunResult {
  status?: string;
  challenge?: ChallengeInfo;
  signed_report?: SignedReportResult | Record<string, unknown>;
  response?: ChallengeResponseInfo;
  verification?: ChallengeVerifyResult | Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export interface ReadinessCheck {
  id?: string;
  label?: string;
  status?: "passed" | "warning" | "failed" | string;
  score?: number;
  max_score?: number;
  message?: string;
  [key: string]: unknown;
}

export interface ReadinessInfo {
  status?: string;
  readiness_score?: number;
  readiness_level?: string;
  checks?: ReadinessCheck[];
  warnings?: string[];
  recommendations?: string[];
  [key: string]: unknown;
}

export interface ProviderVerificationResult {
  status?: string;
  identity_created?: boolean;
  hardware_detected?: boolean;
  benchmark_completed?: boolean;
  signed_report_valid?: boolean;
  challenge_valid?: boolean;
  eligible?: boolean;
  score?: number;
  tier?: string;
  pending_steps?: string[];
  warnings?: string[];
  recommendations?: string[];
  checks?: ReadinessCheck[];
  readiness_score?: number;
  readiness_level?: string;
  readiness_status?: string;
  message?: string;
  verification?: VerificationInfo | Record<string, unknown>;
  signed_report_verification?: ReportVerificationResult | null;
  challenge_verification?: ChallengeVerifyResult | null;
  error?: string;
  [key: string]: unknown;
}

export interface UptimeInfo {
  uptime_1d?: number;
  uptime_7d?: number;
  uptime_30d?: number;
  last_online_at?: string | null;
  last_failed_check_at?: string | null;
  checks_total?: number;
  checks_failed?: number;
  current_status?: string;
  [key: string]: unknown;
}

export interface BenchmarkHistoryItem {
  history_id?: string;
  timestamp?: string;
  agent_version?: string;
  benchmark_version?: string;
  provider_id?: string | null;
  machine_id?: string | null;
  benchmark_profile?: string;
  score?: number;
  tier?: string;
  signed?: boolean;
  challenge_id?: string | null;
  verification_status?: string;
  warnings?: string[];
  system_summary?: {
    os?: string | null;
    architecture?: string | null;
    cpu?: string | null;
    cpu_cores?: number | null;
    ram_total_gb?: number | null;
    backend_detected?: string | null;
    [key: string]: unknown;
  };
  gpu_summary?: Array<{
    name?: string;
    vram_gb?: number | null;
    backend?: string;
    count?: number;
    [key: string]: unknown;
  }>;
  llm_benchmark_summary?: Record<string, unknown>;
  stability_summary?: Record<string, unknown>;
  network_summary?: Record<string, unknown>;
  disk_summary?: Record<string, unknown>;
  report_hash?: string;
  [key: string]: unknown;
}

export interface BenchmarkHistoryInfo {
  path?: string;
  entries_total?: number;
  entries?: BenchmarkHistoryItem[];
  latest?: BenchmarkHistoryItem | null;
  [key: string]: unknown;
}

export interface RegistrationPayloadCapabilities {
  backend?: string;
  gpu_count?: number;
  vram_gb?: number | null;
  recommended_workloads?: string[];
  container_orchestration_future?: boolean;
  marketplace_jobs_future?: boolean;
  [key: string]: unknown;
}

export interface RegistrationPayloadVerification {
  audit_status?: string;
  hardware_verified?: boolean;
  benchmark_verified?: boolean;
  signature_verified?: boolean;
  challenge_verified?: boolean;
  warnings?: string[];
  failed_checks?: string[];
  [key: string]: unknown;
}

export interface RegistrationPayloadPricing {
  cpu_price_brl_hour?: number;
  memory_price_brl_gb_hour?: number;
  storage_price_brl_gb_hour?: number;
  gpu_price_brl_hour?: number;
  final_suggested_price_brl_hour?: number;
  prices_are_demonstrative?: boolean;
  warnings?: string[];
  [key: string]: unknown;
}

export interface RegistrationPayload {
  provider_id?: string;
  machine_id?: string;
  public_key?: string | null;
  agent_version?: string;
  benchmark_version?: string;
  provider_details?: Record<string, unknown>;
  latest_signed_report_hash?: string | null;
  latest_score?: number | null;
  latest_tier?: string | null;
  location?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  capabilities?: RegistrationPayloadCapabilities | Record<string, unknown>;
  pricing?: RegistrationPayloadPricing | Record<string, unknown>;
  verification?: RegistrationPayloadVerification | Record<string, unknown>;
  created_at?: string;
  secrets_included?: boolean;
  [key: string]: unknown;
}

export interface AgentConfigInfo {
  api_auth_enabled?: boolean;
  api_bind_host?: string;
  api_port?: number;
  api_token_hash?: string | null;
  api_url?: string;
  benchmark_profile?: string;
  city?: string | null;
  country?: string | null;
  created_at?: string;
  default_network_endpoint?: string;
  email?: string | null;
  key_algorithm?: string;
  machine_id?: string;
  preferred_provider?: string;
  private_key_path?: string | null;
  provider_id?: string;
  public_key?: string | null;
  region?: string | null;
  telemetry_enabled?: boolean;
  website?: string | null;
  [key: string]: unknown;
}

export interface AgentActionTask {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  start_time?: string;
  end_time?: string | null;
  [key: string]: unknown;
}

export interface AgentActionLog {
  id?: string;
  name?: string;
  status?: string;
  start_time?: string;
  end_time?: string | null;
  tasks?: AgentActionTask[];
  [key: string]: unknown;
}

export type ActionLogItem = AgentActionLog;

export interface AgentLogItem {
  task_id?: string;
  logs?: string[];
  [key: string]: unknown;
}

export interface AgentRawData {
  redacted?: boolean;
  redacted_fields?: string[];
  latest_report?: ReportInfo | Record<string, unknown>;
  latest_signed_report_summary?: Record<string, unknown> | null;
  provider_details?: ProviderInfo | Record<string, unknown>;
  identity_redacted?: AgentConfigInfo | Record<string, unknown> | null;
  config_redacted?: AgentConfigInfo | Record<string, unknown> | null;
  history_summary?: BenchmarkHistoryInfo | Record<string, unknown>;
  actions?: {
    items?: AgentActionLog[];
    logs?: AgentLogItem[];
    [key: string]: unknown;
  };
  logs_summary?: {
    actions_total?: number;
    logs_total?: number;
    latest_action?: AgentActionLog | null;
    [key: string]: unknown;
  };
  verification?: VerificationInfo | Record<string, unknown>;
  pricing?: PricingInfo | Record<string, unknown>;
  earnings_mock?: EarningsInfo | Record<string, unknown>;
  uptime?: UptimeInfo | Record<string, unknown>;
  [key: string]: unknown;
}

export type RawAgentData = AgentRawData;

export interface BenchmarkStatus {
  status?: string;
  last_report?: unknown;
  [key: string]: unknown;
}

export interface BenchmarkRunResult {
  status?: string;
  report?: ReportInfo | Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export interface BurdAgentSnapshot {
  health: HealthInfo | null;
  system: SystemInfo | null;
  fit: FitInfo | null;
  provider: ProviderInfo | null;
  identity: ProviderIdentity | null;
  verification: VerificationInfo | null;
  readiness: ReadinessInfo | null;
  score: ScoreInfo | null;
  report: ReportInfo | null;
  signedReport: SignedReportResult | null;
  reportVerification: ReportVerificationResult | null;
  mockChallenge: ChallengeCreateResult | null;
  challengeRun: ChallengeRunResult | null;
  challengeVerification: ChallengeVerifyResult | null;
  providerVerification: ProviderVerificationResult | null;
  history: BenchmarkHistoryInfo | null;
  registrationPayload: RegistrationPayload | null;
  config: AgentConfigInfo | null;
  uptime: UptimeInfo | null;
  pricing: PricingInfo | null;
  earnings: EarningsInfo | null;
  actions: AgentActionLog[];
  logs: AgentLogItem[];
  raw: AgentRawData | null;
  benchmarkStatus: BenchmarkStatus | null;
}
