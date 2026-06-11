import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/app-shell";
import { Sidebar } from "./components/ui/sidebar";
import { Topbar } from "./components/ui/topbar";
import { useAgentManager } from "./hooks/use-agent-manager";
import { useBurdAgent } from "./hooks/use-burd-agent";
import {
  defaultRuntimeStatus,
  defaultSessionState,
  type PathChoice,
  type Screen,
  type SidebarItemKey,
  sidebarItems,
} from "./lib/app-state";
import { getRuntimeStatus } from "./lib/tauri";
import { DashboardScreen } from "./screens/dashboard-screen";
import { LoginScreen } from "./screens/login-screen";
import { PathChoiceScreen } from "./screens/path-choice-screen";
import { ProviderScreen } from "./screens/provider-screen";
import { VerifyCodeScreen } from "./screens/verify-code-screen";
import { WorkspaceScreen } from "./screens/workspace-screen";

function withVersionPrefix(version: string | undefined) {
  if (!version) {
    return undefined;
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function getInitialScreen(): Screen {
  if (typeof window === "undefined") {
    return "login";
  }

  const queryScreen = new URLSearchParams(window.location.search).get("screen");
  if (
    queryScreen === "login" ||
    queryScreen === "verify" ||
    queryScreen === "workspace" ||
    queryScreen === "path" ||
    queryScreen === "dashboard" ||
    queryScreen === "provider"
  ) {
    return queryScreen;
  }

  return "login";
}

export default function App() {
  const initialScreen = getInitialScreen();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [baseRuntimeStatus, setBaseRuntimeStatus] = useState(defaultRuntimeStatus);
  const [session, setSession] = useState(() => ({
    ...defaultSessionState,
    workspaceName:
      initialScreen === "dashboard" || initialScreen === "provider"
        ? "Workspace Burd"
        : defaultSessionState.workspaceName,
  }));
  const agentManager = useAgentManager({
    enabled: screen === "dashboard" || screen === "provider",
    pollIntervalMs: screen === "provider" ? 3000 : 6000,
  });
  const burdAgent = useBurdAgent({
    enabled: screen === "dashboard" || screen === "provider",
    includeDetails: screen === "provider",
    pollIntervalMs: screen === "provider" ? 12000 : 30000,
  });
  const refreshBurdAgent = burdAgent.refresh;

  useEffect(() => {
    let cancelled = false;

    void getRuntimeStatus().then((status) => {
      if (!cancelled) {
        setBaseRuntimeStatus(status);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agentManager.isOnline) {
      void refreshBurdAgent({ silent: true });
    }
  }, [agentManager.isOnline, refreshBurdAgent]);

  const workspaceName = session.workspaceName.trim() || "Workspace Burd";
  const runtimeStatus = {
    network: "Local",
    status:
      agentManager.status?.status === "starting"
        ? "Starting"
        : agentManager.isOnline || burdAgent.status === "online"
        ? "Online"
        : burdAgent.status === "checking"
          ? "Verificando"
          : burdAgent.status === "error"
            ? "Erro"
            : "Offline",
    agent:
      agentManager.status?.status === "starting"
        ? "Iniciando"
        : agentManager.isOnline || burdAgent.status === "online"
        ? "Conectado"
        : burdAgent.status === "checking"
          ? "Verificando"
          : "Não conectado",
    version:
      withVersionPrefix(burdAgent.data.health?.agent_version) ?? baseRuntimeStatus.version,
  };

  function updateField<Key extends keyof typeof session>(
    key: Key,
    value: (typeof session)[Key],
  ) {
    setSession((current) => ({ ...current, [key]: value }));
  }

  function handleMockSocial(provider: "google" | "github") {
    const fallbackEmail =
      provider === "google" ? "google@burd.app" : "github@burd.app";

    setSession((current) => ({
      ...current,
      email: current.email.trim() || fallbackEmail,
      code: "",
    }));
    setScreen("verify");
  }

  function handleContinueEmail() {
    if (!session.email.trim()) {
      return;
    }

    setScreen("verify");
  }

  function handleVerifyCode() {
    if (session.code.length !== 6) {
      return;
    }

    setScreen("workspace");
  }

  function handleCreateWorkspace() {
    if (!session.workspaceName.trim() || !session.country.trim()) {
      return;
    }

    setScreen("path");
  }

  function handleSelectPath(path: PathChoice) {
    setSession((current) => ({ ...current, selectedPath: path }));
    setScreen("dashboard");
  }

  function handleSidebarSelect(item: SidebarItemKey) {
    if (item === "provider") {
      setScreen("provider");
      return;
    }

    setScreen("dashboard");
  }

  if (screen === "login") {
    return (
      <LoginScreen
        email={session.email}
        onContinueEmail={handleContinueEmail}
        onEmailChange={(value) => updateField("email", value)}
        onSocial={handleMockSocial}
      />
    );
  }

  if (screen === "verify") {
    return (
      <VerifyCodeScreen
        code={session.code}
        email={session.email}
        onCodeChange={(value) => updateField("code", value)}
        onResend={() => updateField("code", "")}
        onVerify={handleVerifyCode}
      />
    );
  }

  if (screen === "workspace") {
    return (
      <WorkspaceScreen
        country={session.country}
        primaryUse={session.primaryUse}
        workspaceName={session.workspaceName}
        onCountryChange={(value) => updateField("country", value)}
        onCreate={handleCreateWorkspace}
        onPrimaryUseChange={(value) => updateField("primaryUse", value)}
        onWorkspaceNameChange={(value) => updateField("workspaceName", value)}
      />
    );
  }

  if (screen === "path") {
    return <PathChoiceScreen onSelect={handleSelectPath} />;
  }

  return (
    <AppShell
      bodyClassName="flex-col lg:flex-row"
      sidebar={
        <Sidebar
          activeItem={screen === "provider" ? "provider" : "home"}
          items={sidebarItems}
          onSelect={handleSidebarSelect}
          runtimeStatus={runtimeStatus}
          workspaceName={workspaceName}
        />
      }
      header={
        <Topbar
          pathChoice={session.selectedPath}
          sectionTitle={screen === "provider" ? "Provider" : "Workspace"}
          sectionSubtitle={
            screen === "provider"
              ? "Agent local, benchmark e readiness desta máquina."
              : "Resumo do workspace, ambiente local e próximos módulos."
          }
          workspaceName={workspaceName}
        />
      }
      contentClassName="scrollbar-subtle overflow-y-auto bg-burd-page px-4 py-4 sm:px-6 sm:py-6"
    >
      {screen === "provider" ? (
        <ProviderScreen agentManager={agentManager} burdAgent={burdAgent} />
      ) : (
        <DashboardScreen
          onOpenProvider={() => setScreen("provider")}
          pathChoice={session.selectedPath}
          runtimeStatus={runtimeStatus}
          workspaceName={workspaceName}
        />
      )}
    </AppShell>
  );
}
