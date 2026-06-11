import {
  Boxes,
  Cpu,
  ReceiptText,
  ServerCog,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { StatusCard } from "../components/ui/status-card";
import type { PathChoice, RuntimeStatus } from "../lib/app-state";

interface DashboardScreenProps {
  pathChoice: PathChoice;
  runtimeStatus: RuntimeStatus;
  workspaceName: string;
  onOpenProvider: () => void;
}

const pathLabels: Record<Exclude<PathChoice, null>, string> = {
  compute: "Usar GPUs",
  provider: "Oferecer máquina",
  explore: "Explorar a Burd",
};

export function DashboardScreen({
  onOpenProvider,
  pathChoice,
  runtimeStatus,
  workspaceName,
}: DashboardScreenProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="brand">Console</Badge>
            {pathChoice ? <Badge>{pathLabels[pathChoice]}</Badge> : null}
          </div>

          <div>
            <h1 className="text-[28px] leading-tight text-burd-text sm:text-[32px]">
              Seu workspace Burd
            </h1>
            <p className="mt-2 max-w-[720px] text-[14px] leading-6 text-burd-text-secondary">
              Use GPUs, ofereça compute e acompanhe tudo em um só lugar.
            </p>
          </div>
        </div>

        <Card className="grid gap-3 sm:grid-cols-3 xl:min-w-[480px]" padding="sm" variant="deep">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
              Workspace
            </div>
            <div className="mt-2 text-[15px] text-burd-text">{workspaceName}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
              Rede
            </div>
            <div className="mt-2 text-[15px] text-burd-text">{runtimeStatus.network}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
              Agent
            </div>
            <div className="mt-2 text-[15px] text-burd-text">{runtimeStatus.agent}</div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatusCard
          icon={<Cpu className="h-5 w-5" />}
          eyebrow="Compute"
          title="Usar GPUs"
          description="Explore GPUs verificadas e prepare deploys de IA."
          status="Em breve"
          actionLabel="Abrir roadmap"
          actionDisabled
        />

        <StatusCard
          icon={<ServerCog className="h-5 w-5" />}
          eyebrow="Provider"
          title="Oferecer esta máquina"
          description="Crie identidade local, rode benchmark e gere um relatório assinado."
          status="Preparando integração"
          actionLabel="Abrir provider"
          onAction={onOpenProvider}
        />

        <StatusCard
          icon={<Boxes className="h-5 w-5" />}
          eyebrow="Deploys"
          title="Deploys"
          description="Acompanhe workloads, logs, status e custo."
          status="Nenhum deploy ativo"
          actionLabel="Em breve"
          actionDisabled
        />

        <StatusCard
          icon={<ReceiptText className="h-5 w-5" />}
          eyebrow="Billing"
          title="Billing"
          description="Gerencie saldo, uso e ganhos futuros."
          status="Não configurado"
          actionLabel="Configurar depois"
          actionDisabled
        />
      </div>
    </div>
  );
}
