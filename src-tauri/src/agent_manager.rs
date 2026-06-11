use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, path::BaseDirectory};

const AGENT_PORT: u16 = 8787;
const HEALTH_URL: &str = "http://127.0.0.1:8787/health";
const MAX_LOG_LINES: usize = 300;
const HEALTH_POLL_ATTEMPTS: usize = 40;
const HEALTH_POLL_INTERVAL_MS: u64 = 500;
const BINARY_NAME: &str = "burd-agent.exe";

const SENSITIVE_LOG_KEYWORDS: &[&str] = &[
    "private_key",
    "private_key_path",
    "secret_key_base64",
    "api_token",
    "api_token_hash",
    "\"token\"",
    "credentials",
    "password",
    "bearer ",
    "authorization:",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AgentManagerKind {
    Missing,
    Stopped,
    Starting,
    Online,
    Failed,
}

impl AgentManagerKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Online => "online",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug)]
struct ManagedAgentProcess {
    child: Child,
    pid: u32,
}

#[derive(Debug)]
struct AgentManagerInner {
    managed_process: Option<ManagedAgentProcess>,
    status: AgentManagerKind,
    binary_path: Option<PathBuf>,
    managed_by_app: bool,
    pid: Option<u32>,
    last_error: Option<String>,
    last_started_at: Option<String>,
    logs: Arc<Mutex<VecDeque<String>>>,
}

impl Default for AgentManagerInner {
    fn default() -> Self {
        Self {
            managed_process: None,
            status: AgentManagerKind::Stopped,
            binary_path: None,
            managed_by_app: false,
            pid: None,
            last_error: None,
            last_started_at: None,
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_LINES))),
        }
    }
}

pub struct AgentManagerState {
    inner: Mutex<AgentManagerInner>,
}

impl Default for AgentManagerState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(AgentManagerInner::default()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentManagerStatusPayload {
    status: String,
    binary_path: Option<String>,
    managed_by_app: bool,
    pid: Option<u32>,
    port: u16,
    health_url: String,
    last_error: Option<String>,
    last_started_at: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentManagerLogsPayload {
    logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinaryResolutionPayload {
    status: String,
    binary_path: Option<String>,
    source: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinarySyncDiagnosticsPayload {
    app_binary_path: String,
    app_binary_exists: bool,
    app_binary_size: Option<u64>,
    app_binary_modified_time: Option<String>,
    app_binary_sha256: Option<String>,
    release_binary_path: String,
    release_binary_exists: bool,
    release_binary_size: Option<u64>,
    release_binary_modified_time: Option<String>,
    release_binary_sha256: Option<String>,
    matches_release: bool,
    warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinaryDiagnosticsPayload {
    logical_binary_name: String,
    resolved_binary_path: Option<String>,
    file_exists: bool,
    file_size: Option<u64>,
    modified_time: Option<String>,
    sha256: Option<String>,
    source: Option<String>,
    command_used: Option<String>,
    health_status: String,
    agent_version: Option<String>,
    resolved_matches_release: Option<bool>,
    sync_check: AgentBinarySyncDiagnosticsPayload,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiTokenPayload {
    #[serde(alias = "config_path")]
    config_path: String,
    #[serde(alias = "api_auth_enabled")]
    api_auth_enabled: bool,
    #[serde(alias = "token_configured")]
    token_configured: bool,
    #[serde(alias = "token_hash_preview")]
    token_hash_preview: Option<String>,
    token: Option<String>,
    warning: Option<String>,
}

#[derive(Debug, Clone)]
struct AgentBinaryResolution {
    path: Option<PathBuf>,
    source: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone)]
struct BinaryFileDetails {
    path: PathBuf,
    exists: bool,
    size: Option<u64>,
    modified_time: Option<String>,
    sha256: Option<String>,
}

#[derive(Debug, Clone)]
struct HealthSnapshot {
    status: String,
    agent_version: Option<String>,
}

#[tauri::command]
pub fn agent_manager_status(
    app_handle: AppHandle,
    state: State<'_, AgentManagerState>,
) -> Result<AgentManagerStatusPayload, String> {
    let mut manager = state
        .inner
        .lock()
        .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
    Ok(sync_status(&app_handle, &mut manager, None))
}

#[tauri::command]
pub fn agent_manager_start(
    app_handle: AppHandle,
    state: State<'_, AgentManagerState>,
) -> Result<AgentManagerStatusPayload, String> {
    {
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
        let current = sync_status(&app_handle, &mut manager, None);

        if manager.status == AgentManagerKind::Online {
            return Ok(with_message(current, "O Burd Agent já está online."));
        }

        if manager.status == AgentManagerKind::Starting && manager.managed_by_app {
            return Ok(with_message(current, "O Burd Agent já está iniciando."));
        }
    }

    let resolution = resolve_binary_path(&app_handle);
    let Some(binary_path) = resolution.path.clone() else {
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
        manager.status = AgentManagerKind::Missing;
        manager.binary_path = None;
        manager.managed_by_app = false;
        manager.pid = None;
        manager.last_error = resolution.message.clone();
        return Ok(status_payload(
            &manager,
            resolution.message.clone(),
        ));
    };

    if !is_port_available(AGENT_PORT) && !health_responds() {
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
        manager.status = AgentManagerKind::Failed;
        manager.binary_path = Some(binary_path);
        manager.last_error = Some(
            "A porta 8787 já está ocupada, mas o endpoint /health não respondeu. Libere a porta antes de iniciar o agent pelo app."
                .to_string(),
        );
        return Ok(status_payload(&manager, manager.last_error.clone()));
    }

    let mut command = Command::new(&binary_path);
    command
        .arg("serve")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(AGENT_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        format!(
            "Não foi possível iniciar {}: {error}",
            binary_path.display()
        )
    })?;
    let pid = child.id();

    let logs = {
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
        manager.status = AgentManagerKind::Starting;
        manager.binary_path = Some(binary_path.clone());
        manager.managed_by_app = true;
        manager.pid = Some(pid);
        manager.last_error = None;
        manager.last_started_at = Some(Utc::now().to_rfc3339());

        let logs = manager.logs.clone();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        spawn_log_reader(stdout, "stdout", logs.clone());
        spawn_log_reader(stderr, "stderr", logs.clone());

        manager.managed_process = Some(ManagedAgentProcess { child, pid });
        logs
    };

    push_log(
        &logs,
        format!("[manager] Starting burd-agent on {HEALTH_URL}"),
    );

    for _ in 0..HEALTH_POLL_ATTEMPTS {
        std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;

        if health_responds() {
            manager.status = AgentManagerKind::Online;
            manager.last_error = None;
            return Ok(with_message(
                status_payload(&manager, None),
                "Burd Agent iniciado com sucesso.",
            ));
        }

        if let Some(process) = manager.managed_process.as_mut() {
            match process.child.try_wait() {
                Ok(Some(exit_status)) => {
                    manager.managed_process = None;
                    manager.managed_by_app = false;
                    manager.pid = None;
                    manager.status = AgentManagerKind::Failed;
                    manager.last_error = Some(format!(
                        "O Burd Agent encerrou durante a inicialização com código {:?}.",
                        exit_status.code()
                    ));
                    return Ok(status_payload(&manager, manager.last_error.clone()));
                }
                Ok(None) => {}
                Err(error) => {
                    manager.status = AgentManagerKind::Failed;
                    manager.last_error = Some(format!(
                        "Não foi possível monitorar o processo do Burd Agent: {error}"
                    ));
                    return Ok(status_payload(&manager, manager.last_error.clone()));
                }
            }
        }
    }

    let mut manager = state
        .inner
        .lock()
        .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
    manager.status = AgentManagerKind::Failed;
    manager.last_error = Some(
        "O Burd Agent foi iniciado, mas o endpoint /health não respondeu a tempo.".to_string(),
    );
    Ok(status_payload(&manager, manager.last_error.clone()))
}

#[tauri::command]
pub fn agent_manager_stop(
    app_handle: AppHandle,
    state: State<'_, AgentManagerState>,
) -> Result<AgentManagerStatusPayload, String> {
    let mut manager = state
        .inner
        .lock()
        .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
    let current = sync_status(&app_handle, &mut manager, None);

    if let Some(process) = manager.managed_process.as_mut() {
        let _ = process.child.kill();
        let _ = process.child.wait();
        manager.managed_process = None;
        manager.status = AgentManagerKind::Stopped;
        manager.managed_by_app = false;
        manager.pid = None;
        manager.last_error = None;
        return Ok(with_message(
            status_payload(&manager, None),
            "Burd Agent parado pelo app.",
        ));
    }

    if current.status == AgentManagerKind::Online.as_str() && !current.managed_by_app {
        return Ok(with_message(
            current,
            "O Burd Agent está online, mas foi iniciado fora do app. Pare manualmente ou reinicie pelo terminal.",
        ));
    }

    Ok(with_message(current, "O Burd Agent já está parado."))
}

#[tauri::command]
pub fn agent_manager_restart(
    app_handle: AppHandle,
    state: State<'_, AgentManagerState>,
) -> Result<AgentManagerStatusPayload, String> {
    {
        let mut manager = state
            .inner
            .lock()
            .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
        let current = sync_status(&app_handle, &mut manager, None);

        if current.status == AgentManagerKind::Online.as_str() && !current.managed_by_app {
            return Ok(with_message(
                current,
                "O Burd Agent está online, mas foi iniciado fora do app. Pare manualmente ou use o terminal para reiniciar.",
            ));
        }

        if let Some(process) = manager.managed_process.as_mut() {
            let _ = process.child.kill();
            let _ = process.child.wait();
            manager.managed_process = None;
            manager.status = AgentManagerKind::Stopped;
            manager.managed_by_app = false;
            manager.pid = None;
        }
    }

    agent_manager_start(app_handle, state)
}

#[tauri::command]
pub fn agent_manager_logs(
    state: State<'_, AgentManagerState>,
) -> Result<AgentManagerLogsPayload, String> {
    let manager = state
        .inner
        .lock()
        .map_err(|_| "Não foi possível acessar o Agent Manager.".to_string())?;
    let logs = manager
        .logs
        .lock()
        .map_err(|_| "Não foi possível acessar os logs do Agent Manager.".to_string())?;

    Ok(AgentManagerLogsPayload {
        logs: logs.iter().cloned().collect(),
    })
}

#[tauri::command]
pub fn agent_manager_resolve_binary(
    app_handle: AppHandle,
) -> Result<AgentBinaryResolutionPayload, String> {
    let resolution = resolve_binary_path(&app_handle);
    Ok(AgentBinaryResolutionPayload {
        status: if resolution.path.is_some() {
            "resolved".to_string()
        } else {
            "missing".to_string()
        },
        binary_path: resolution.path.as_deref().map(path_to_string),
        source: resolution.source,
        message: resolution.message,
    })
}

#[tauri::command]
pub fn agent_manager_binary_diagnostics(
    app_handle: AppHandle,
) -> Result<AgentBinaryDiagnosticsPayload, String> {
    Ok(build_binary_diagnostics(&app_handle))
}

#[tauri::command]
pub fn agent_api_token_status(app_handle: AppHandle) -> Result<AgentApiTokenPayload, String> {
    run_agent_api_token_command(&app_handle, &["api-token", "show", "--json"], "consultar o token local")
}

#[tauri::command]
pub fn agent_api_token_create(app_handle: AppHandle) -> Result<AgentApiTokenPayload, String> {
    run_agent_api_token_command(&app_handle, &["api-token", "create", "--json"], "configurar o token local")
}

#[tauri::command]
pub fn agent_api_token_rotate(app_handle: AppHandle) -> Result<AgentApiTokenPayload, String> {
    run_agent_api_token_command(&app_handle, &["api-token", "rotate", "--json"], "rotacionar o token local")
}

fn sync_status(
    app_handle: &AppHandle,
    manager: &mut AgentManagerInner,
    message: Option<String>,
) -> AgentManagerStatusPayload {
    let resolution = resolve_binary_path(app_handle);
    manager.binary_path = resolution.path.clone();

    if let Some(process) = manager.managed_process.as_mut() {
        match process.child.try_wait() {
            Ok(Some(exit_status)) => {
                manager.managed_process = None;
                manager.managed_by_app = false;
                manager.pid = None;
                manager.status = if exit_status.success() {
                    AgentManagerKind::Stopped
                } else {
                    AgentManagerKind::Failed
                };
                if !exit_status.success() {
                    manager.last_error = Some(format!(
                        "O Burd Agent encerrou com código {:?}.",
                        exit_status.code()
                    ));
                }
            }
            Ok(None) => {
                manager.managed_by_app = true;
                manager.pid = Some(process.pid);
            }
            Err(error) => {
                manager.status = AgentManagerKind::Failed;
                manager.last_error = Some(format!(
                    "Não foi possível consultar o processo do Burd Agent: {error}"
                ));
            }
        }
    }

    if health_responds() {
        manager.status = AgentManagerKind::Online;
        if manager.managed_process.is_none() {
            manager.managed_by_app = false;
            manager.pid = None;
        }
    } else if manager.managed_process.is_some() {
        if manager.status != AgentManagerKind::Starting {
            manager.status = AgentManagerKind::Failed;
        }
    } else {
        manager.managed_by_app = false;
        manager.pid = None;
        manager.status = if manager.binary_path.is_some() {
            AgentManagerKind::Stopped
        } else {
            AgentManagerKind::Missing
        };

        if manager.status == AgentManagerKind::Missing {
            manager.last_error = resolution.message.clone();
        }
    }

    status_payload(
        manager,
        message.or_else(|| default_status_message(manager, &resolution)),
    )
}

fn default_status_message(
    manager: &AgentManagerInner,
    resolution: &AgentBinaryResolution,
) -> Option<String> {
    match manager.status {
        AgentManagerKind::Missing => resolution.message.clone(),
        AgentManagerKind::Failed => manager
            .last_error
            .clone()
            .or_else(|| resolution.message.clone()),
        AgentManagerKind::Starting | AgentManagerKind::Online | AgentManagerKind::Stopped => None,
    }
}

fn status_payload(
    manager: &AgentManagerInner,
    message: Option<String>,
) -> AgentManagerStatusPayload {
    AgentManagerStatusPayload {
        status: manager.status.as_str().to_string(),
        binary_path: manager.binary_path.as_deref().map(path_to_string),
        managed_by_app: manager.managed_by_app,
        pid: manager.pid,
        port: AGENT_PORT,
        health_url: HEALTH_URL.to_string(),
        last_error: manager.last_error.clone(),
        last_started_at: manager.last_started_at.clone(),
        message,
    }
}

fn with_message(
    mut payload: AgentManagerStatusPayload,
    message: impl Into<String>,
) -> AgentManagerStatusPayload {
    payload.message = Some(message.into());
    payload
}

fn app_binaries_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(BINARY_NAME)
}

fn benchmark_root_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("benchmark")
        .join("target")
}

fn benchmark_release_binary_path() -> PathBuf {
    benchmark_root_path().join("release").join(BINARY_NAME)
}

fn benchmark_debug_binary_path() -> PathBuf {
    benchmark_root_path().join("debug").join(BINARY_NAME)
}

fn resource_binary_path(app_handle: &AppHandle) -> Option<PathBuf> {
    app_handle
        .path()
        .resolve(format!("binaries/{BINARY_NAME}"), BaseDirectory::Resource)
        .ok()
}

fn existing_resolution(path: PathBuf, source: &str) -> Option<AgentBinaryResolution> {
    if path.exists() {
        Some(AgentBinaryResolution {
            path: Some(path),
            source: Some(source.to_string()),
            message: None,
        })
    } else {
        None
    }
}

fn resolve_binary_path(app_handle: &AppHandle) -> AgentBinaryResolution {
    #[cfg(debug_assertions)]
    {
        if let Some(resolution) = existing_resolution(app_binaries_path(), "app-binaries") {
            return resolution;
        }

        if let Ok(path) = std::env::var("BURD_AGENT_PATH") {
            if let Some(resolution) = existing_resolution(PathBuf::from(path), "env") {
                return resolution;
            }
        }

        if let Some(resolution) = existing_resolution(benchmark_release_binary_path(), "benchmark-release") {
            return resolution;
        }

        if let Some(resolution) = existing_resolution(benchmark_debug_binary_path(), "benchmark-debug") {
            return resolution;
        }

        if let Some(path) = resource_binary_path(app_handle) {
            if let Some(resolution) = existing_resolution(path, "bundled-resource") {
                return resolution;
            }
        }
    }

    #[cfg(not(debug_assertions))]
    {
        if let Some(path) = resource_binary_path(app_handle) {
            if let Some(resolution) = existing_resolution(path, "bundled-resource") {
                return resolution;
            }
        }

        if let Ok(path) = std::env::var("BURD_AGENT_PATH") {
            if let Some(resolution) = existing_resolution(PathBuf::from(path), "env") {
                return resolution;
            }
        }

        if let Some(resolution) = existing_resolution(app_binaries_path(), "app-binaries") {
            return resolution;
        }
    }

    AgentBinaryResolution {
        path: None,
        source: None,
        message: Some(
            "O binário `burd-agent.exe` não foi encontrado no pacote do app. Rode `npm run sync:agent` antes de gerar o build ou configure `BURD_AGENT_PATH` em desenvolvimento."
                .to_string(),
        ),
    }
}

fn run_agent_api_token_command(
    app_handle: &AppHandle,
    args: &[&str],
    action_label: &str,
) -> Result<AgentApiTokenPayload, String> {
    let resolution = resolve_binary_path(app_handle);
    let Some(binary_path) = resolution.path else {
        return Err(
            resolution
                .message
                .unwrap_or_else(|| "O binário burd-agent.exe não foi encontrado.".to_string()),
        );
    };

    let output = Command::new(&binary_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            format!(
                "Não foi possível {action_label} com {}: {error}",
                binary_path.display()
            )
        })?;

    if !output.status.success() {
        let stderr = sanitize_command_output(&String::from_utf8_lossy(&output.stderr));
        let stdout = sanitize_command_output(&String::from_utf8_lossy(&output.stdout));
        let detail = if !stderr.trim().is_empty() {
            stderr
        } else if !stdout.trim().is_empty() {
            stdout
        } else {
            format!("processo finalizado com código {:?}", output.status.code())
        };

        return Err(format!("Não foi possível {action_label}: {detail}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<AgentApiTokenPayload>(&stdout).map_err(|error| {
        format!(
            "O burd-agent retornou uma resposta inválida ao {action_label}: {} ({error})",
            sanitize_command_output(&stdout)
        )
    })
}

fn build_binary_diagnostics(app_handle: &AppHandle) -> AgentBinaryDiagnosticsPayload {
    let resolution = resolve_binary_path(app_handle);
    let resolved_file = resolution
        .path
        .as_ref()
        .map(|path| file_details_for_path(path.as_path()))
        .unwrap_or_else(|| BinaryFileDetails {
            path: app_binaries_path(),
            exists: false,
            size: None,
            modified_time: None,
            sha256: None,
        });
    let app_binary = file_details_for_path(&app_binaries_path());
    let release_binary = file_details_for_path(&benchmark_release_binary_path());
    let sync_warning = if !app_binary.exists || !release_binary.exists {
        Some(
            "O app não está usando o burd-agent release mais recente. Rode npm run sync:agent."
                .to_string(),
        )
    } else if app_binary.sha256 != release_binary.sha256 {
        Some(
            "O app não está usando o burd-agent release mais recente. Rode npm run sync:agent."
                .to_string(),
        )
    } else {
        None
    };
    let sync_check = AgentBinarySyncDiagnosticsPayload {
        app_binary_path: path_to_string(&app_binary.path),
        app_binary_exists: app_binary.exists,
        app_binary_size: app_binary.size,
        app_binary_modified_time: app_binary.modified_time.clone(),
        app_binary_sha256: app_binary.sha256.clone(),
        release_binary_path: path_to_string(&release_binary.path),
        release_binary_exists: release_binary.exists,
        release_binary_size: release_binary.size,
        release_binary_modified_time: release_binary.modified_time.clone(),
        release_binary_sha256: release_binary.sha256.clone(),
        matches_release: app_binary.exists
            && release_binary.exists
            && app_binary.sha256.is_some()
            && app_binary.sha256 == release_binary.sha256,
        warning: sync_warning,
    };
    let health = fetch_health_snapshot().unwrap_or(HealthSnapshot {
        status: "offline".to_string(),
        agent_version: None,
    });

    AgentBinaryDiagnosticsPayload {
        logical_binary_name: BINARY_NAME.to_string(),
        resolved_binary_path: resolution.path.as_deref().map(path_to_string),
        file_exists: resolved_file.exists,
        file_size: resolved_file.size,
        modified_time: resolved_file.modified_time,
        sha256: resolved_file.sha256.clone(),
        source: resolution.source.clone(),
        command_used: resolution.path.as_deref().map(agent_command_line),
        health_status: health.status,
        agent_version: health.agent_version,
        resolved_matches_release: match (&resolved_file.sha256, &release_binary.sha256) {
            (Some(resolved_hash), Some(release_hash)) => Some(resolved_hash == release_hash),
            _ => None,
        },
        sync_check,
        message: resolution.message,
    }
}

fn file_details_for_path(path: &Path) -> BinaryFileDetails {
    let metadata = path.metadata().ok();
    let exists = metadata.is_some();
    let size = metadata.as_ref().map(|value| value.len());
    let modified_time = metadata
        .as_ref()
        .and_then(|value| value.modified().ok())
        .map(|value| chrono::DateTime::<Utc>::from(value).to_rfc3339());
    let sha256 = if exists {
        sha256_hex_for_path(path).ok()
    } else {
        None
    };

    BinaryFileDetails {
        path: path.to_path_buf(),
        exists,
        size,
        modified_time,
        sha256,
    }
}

fn sha256_hex_for_path(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Não foi possível abrir {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Não foi possível ler {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let digest = hasher.finalize();
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn agent_command_line(path: &Path) -> String {
    format!(
        "{} serve --host 127.0.0.1 --port {}",
        path_to_string(path),
        AGENT_PORT
    )
}

fn fetch_health_snapshot() -> Option<HealthSnapshot> {
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), AGENT_PORT);
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(800)) else {
        return None;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return Some(HealthSnapshot {
            status: "error".to_string(),
            agent_version: None,
        });
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return Some(HealthSnapshot {
            status: "error".to_string(),
            agent_version: None,
        });
    }

    let body = response.split_once("\r\n\r\n").map(|(_, body)| body).unwrap_or("");
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    let status = parsed
        .as_ref()
        .and_then(|value| value.get("status"))
        .and_then(|value| value.as_str())
        .unwrap_or(if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
            "ok"
        } else {
            "error"
        })
        .to_string();
    let agent_version = parsed
        .as_ref()
        .and_then(|value| value.get("agent_version"))
        .and_then(|value| value.as_str())
        .map(str::to_string);

    Some(HealthSnapshot {
        status,
        agent_version,
    })
}

fn health_responds() -> bool {
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), AGENT_PORT);
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(800)) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn is_port_available(port: u16) -> bool {
    TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)).is_ok()
}

fn spawn_log_reader<T: Read + Send + 'static>(
    stream: Option<T>,
    label: &'static str,
    logs: Arc<Mutex<VecDeque<String>>>,
) {
    if let Some(stream) = stream {
        std::thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                push_log(&logs, format!("[{label}] {}", sanitize_log_line(&line)));
            }
        });
    }
}

fn push_log(logs: &Arc<Mutex<VecDeque<String>>>, line: String) {
    if let Ok(mut logs) = logs.lock() {
        if logs.len() >= MAX_LOG_LINES {
            logs.pop_front();
        }
        logs.push_back(line);
    }
}

fn sanitize_log_line(line: &str) -> String {
    let lowercase = line.to_lowercase();
    if SENSITIVE_LOG_KEYWORDS
        .iter()
        .any(|keyword| lowercase.contains(keyword))
    {
        "<redacted log line>".to_string()
    } else {
        line.to_string()
    }
}

fn sanitize_command_output(output: &str) -> String {
    let sanitized_lines = output
        .lines()
        .map(sanitize_log_line)
        .collect::<Vec<_>>();
    let sanitized = sanitized_lines.join("\n").trim().to_string();

    if sanitized.is_empty() {
        "<sem detalhes>".to_string()
    } else {
        sanitized
    }
}

fn path_to_string(path: &Path) -> String {
    let rendered = path.display().to_string();
    rendered
        .strip_prefix("\\\\?\\")
        .unwrap_or(&rendered)
        .to_string()
}
