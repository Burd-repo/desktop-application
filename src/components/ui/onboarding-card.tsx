import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "./card";
import { Badge } from "./badge";
import { Button } from "./button";

interface OnboardingCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  status?: string;
  statusVariant?: "default" | "success" | "danger" | "brand";
  onAction: () => void;
}

export function OnboardingCard({
  actionLabel,
  description,
  icon,
  onAction,
  status,
  statusVariant = "default",
  title,
}: OnboardingCardProps) {
  return (
    <Card className="flex h-full min-h-[210px] flex-col gap-4" padding="md">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-burd-border bg-burd-panel-deep text-burd-text-secondary">
          {icon}
        </span>
        {status ? <Badge variant={statusVariant}>{status}</Badge> : null}
      </div>

      <div className="space-y-2.5">
        <h3 className="text-[20px] leading-tight text-burd-text">{title}</h3>
        <p className="text-[14px] leading-6 text-burd-text-secondary">
          {description}
        </p>
      </div>

      <div className="mt-auto pt-1">
        <Button
          variant="panel"
          size="md"
          className="font-sans normal-case tracking-normal"
          icon={<ArrowRight className="h-4 w-4" />}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </Card>
  );
}
