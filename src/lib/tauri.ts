import { defaultRuntimeStatus, type RuntimeStatus } from "./app-state";

export function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getCurrentAppWindow() {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  if (!hasTauriRuntime()) {
    return defaultRuntimeStatus;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<RuntimeStatus>("get_runtime_status");
  } catch {
    return defaultRuntimeStatus;
  }
}

export async function minimizeWindow() {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return;
  }

  await appWindow.minimize();
}

export async function toggleMaximizeWindow() {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return;
  }

  await appWindow.toggleMaximize();
}

export async function closeWindow() {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return;
  }

  await appWindow.close();
}

export async function startWindowDragging() {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return;
  }

  await appWindow.startDragging();
}

export async function isWindowMaximized() {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return false;
  }

  return appWindow.isMaximized();
}

export async function onWindowResized(handler: () => void): Promise<() => void> {
  const appWindow = await getCurrentAppWindow();

  if (!appWindow) {
    return () => {};
  }

  return appWindow.onResized(() => {
    handler();
  });
}
