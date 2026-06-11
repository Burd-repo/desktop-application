import type { RuntimeStatus, SidebarItem, SidebarItemKey } from "../../lib/app-state";
import { cx } from "../../lib/utils";
import { BurdLogo } from "./burd-logo";
import { Badge } from "./badge";

interface SidebarProps {
  activeItem: SidebarItemKey;
  items: SidebarItem[];
  runtimeStatus: RuntimeStatus;
  workspaceName: string;
  onSelect: (item: SidebarItemKey) => void;
}

export function Sidebar({
  activeItem,
  items,
  onSelect,
  runtimeStatus,
  workspaceName,
}: SidebarProps) {
  return (
    <aside className="w-full shrink-0 border-b border-burd-border bg-[#0b0b0c] lg:h-full lg:w-[268px] lg:border-b-0 lg:border-r">
      <div className="flex h-full min-h-0 flex-col gap-4 p-4">
        <div className="rounded-[14px] border border-burd-border bg-[#101010] p-4">
          <div className="space-y-4">
            <BurdLogo imageClassName="h-6 w-auto opacity-90" />

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
                Workspace
              </div>
              <div className="mt-1 text-[17px] text-burd-text">{workspaceName}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[13px] text-burd-text-secondary">
            <span
              className={cx(
                "h-2 w-2 rounded-full",
                runtimeStatus.status === "Online" && "bg-burd-blue",
                runtimeStatus.status === "Erro" && "bg-burd-danger",
                (runtimeStatus.status === "Starting" ||
                  runtimeStatus.status === "Verificando") && "bg-[#d1a652]",
                runtimeStatus.status !== "Online" &&
                  runtimeStatus.status !== "Erro" &&
                  runtimeStatus.status !== "Starting" &&
                  runtimeStatus.status !== "Verificando" &&
                  "bg-burd-border-soft",
              )}
            />
            <span>{runtimeStatus.status}</span>
          </div>
        </div>

        <nav className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeItem;

            return (
              <button
                key={item.key}
                type="button"
                disabled={!item.available}
                onClick={() => item.available && onSelect(item.key)}
                className={cx(
                  "flex items-center justify-between gap-3 rounded-[10px] border px-3 py-3 text-left transition",
                  isActive
                    ? "border-burd-blue bg-[rgba(31,126,166,0.10)]"
                    : "border-burd-border bg-transparent hover:border-burd-border-soft hover:bg-burd-panel",
                  !item.available && "cursor-not-allowed opacity-60 hover:border-burd-border hover:bg-transparent",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-burd-text-secondary" />
                  <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-burd-text">
                    {item.label}
                  </span>
                </span>

                {!item.available ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-burd-text-tertiary">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[14px] border border-burd-border bg-[#101010] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-burd-text-secondary">
              Ambiente local
            </div>
            <Badge variant="brand">{runtimeStatus.network}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
              <div>Status: {runtimeStatus.status}</div>
              <div>Agent: {runtimeStatus.agent}</div>
            </div>
            <div className="space-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-burd-text-secondary">
              <div>Versão: {runtimeStatus.version}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
