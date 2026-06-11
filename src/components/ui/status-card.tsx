import type { ReactNode } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";

interface StatusCardProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusVariant?: "default" | "success" | "danger" | "brand";
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}

export function StatusCard({
  actionDisabled,
  actionLabel,
  description,
  eyebrow,
  icon,
  onAction,
  status,
  statusVariant = "default",
  title,
}: StatusCardProps) {
  return (
    <Card className="flex h-full flex-col gap-5" padding="lg">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <span className="inline-flex h-12 w-12 items-center justify-center border border-burd-border bg-burd-panel-deep text-burd-text-secondary">
            {icon}
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-burd-text-secondary">
            {eyebrow}
          </p>
        </div>

        <Badge variant={statusVariant}>{status}</Badge>
      </div>

      <div className="space-y-3">
        <h3 className="text-[24px] leading-tight text-burd-text">{title}</h3>
        <p className="text-[14px] leading-7 text-burd-text-secondary">
          {description}
        </p>
      </div>

      {actionLabel ? (
        <div className="mt-auto">
          <Button
            variant="panel"
            size="md"
            disabled={actionDisabled}
            icon={
              actionDisabled ? (
                <Lock className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )
            }
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
