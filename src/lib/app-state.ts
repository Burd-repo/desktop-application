import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Cpu,
  Gauge,
  Home,
  Logs,
  ReceiptText,
  ServerCog,
  Settings,
  WalletCards,
} from "lucide-react";

export type AuthView = "login" | "verify" | "workspace" | "path";
export type Screen = AuthView | "dashboard" | "provider";
export type PathChoice = "compute" | "provider" | "explore" | null;
export type SidebarItemKey =
  | "home"
  | "compute"
  | "deploys"
  | "provider"
  | "benchmark"
  | "earnings"
  | "billing"
  | "logs"
  | "settings";

export interface SessionState {
  email: string;
  code: string;
  workspaceName: string;
  country: string;
  primaryUse: string;
  selectedPath: PathChoice;
}

export interface RuntimeStatus {
  network: string;
  status: string;
  agent: string;
  version: string;
}

export interface SidebarItem {
  key: SidebarItemKey;
  label: string;
  icon: LucideIcon;
  available: boolean;
}

export const authSteps: Array<{ key: AuthView; label: string }> = [
  { key: "login", label: "Conta" },
  { key: "verify", label: "Código" },
  { key: "workspace", label: "Workspace" },
  { key: "path", label: "Modo" },
];

export const primaryUseOptions = [
  "Inteligência artificial",
  "Desenvolvimento",
  "Pesquisa",
  "Renderização",
  "Infraestrutura",
  "Ainda estou explorando",
];

export const sidebarItems: SidebarItem[] = [
  { key: "home", label: "Início", icon: Home, available: true },
  { key: "compute", label: "Compute", icon: Cpu, available: false },
  { key: "deploys", label: "Deploys", icon: Boxes, available: false },
  { key: "provider", label: "Provider", icon: ServerCog, available: true },
  { key: "benchmark", label: "Benchmark", icon: Gauge, available: false },
  { key: "earnings", label: "Ganhos", icon: WalletCards, available: false },
  { key: "billing", label: "Billing", icon: ReceiptText, available: false },
  { key: "logs", label: "Logs", icon: Logs, available: false },
  { key: "settings", label: "Configurações", icon: Settings, available: false },
];

export const providerChecklist = [
  "Identidade local",
  "Detecção de hardware",
  "Benchmark",
  "Score",
  "Relatório assinado",
  "Pronto para validação",
];

export const defaultSessionState: SessionState = {
  email: "",
  code: "",
  workspaceName: "",
  country: "Brasil",
  primaryUse: "Ainda estou explorando",
  selectedPath: null,
};

export const defaultRuntimeStatus: RuntimeStatus = {
  network: "Local",
  status: "Offline",
  agent: "Não conectado",
  version: "v0.1.0",
};
