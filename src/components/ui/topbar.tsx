import type { PathChoice } from "../../lib/app-state";
import { Badge } from "./badge";

interface TopbarProps {
  pathChoice: PathChoice;
  sectionTitle: string;
  sectionSubtitle: string;
  workspaceName: string;
}

const pathLabels: Record<Exclude<PathChoice, null>, string> = {
  compute: "Compute",
  provider: "Provider",
  explore: "Exploração",
};

export function Topbar({
  pathChoice,
  sectionSubtitle,
  sectionTitle,
  workspaceName,
}: TopbarProps) {
  return (
    <header className="border-b border-burd-border bg-[rgba(9,9,9,0.9)] px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-medium text-burd-text">
            {sectionTitle}
          </h1>
          <p className="mt-1 text-[13px] leading-6 text-burd-text-secondary">
            {sectionSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">Console</Badge>
          {pathChoice ? <Badge>{pathLabels[pathChoice]}</Badge> : null}
          <Badge>{workspaceName}</Badge>
        </div>
      </div>
    </header>
  );
}
