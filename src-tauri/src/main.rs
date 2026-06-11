#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_manager;
mod runtime_status;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(agent_manager::AgentManagerState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_status::get_runtime_status,
            agent_manager::agent_manager_status,
            agent_manager::agent_manager_start,
            agent_manager::agent_manager_stop,
            agent_manager::agent_manager_restart,
            agent_manager::agent_manager_logs,
            agent_manager::agent_manager_resolve_binary,
            agent_manager::agent_manager_binary_diagnostics,
            agent_manager::agent_api_token_status,
            agent_manager::agent_api_token_create,
            agent_manager::agent_api_token_rotate
        ])
        .run(tauri::generate_context!())
        .expect("error while running Burd App");
}
