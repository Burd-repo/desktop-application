use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    network: String,
    status: String,
    agent: String,
    version: String,
}

#[tauri::command]
pub fn get_runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        network: "Local".to_string(),
        status: "Offline".to_string(),
        agent: "Não conectado".to_string(),
        version: format!("v{}", env!("CARGO_PKG_VERSION")),
    }
}
