import type { ReactNode } from "react";
import { cx } from "../../lib/utils";
import { WindowTitlebar } from "./window-titlebar";

interface AppShellProps {
  bodyClassName?: string;
  children: ReactNode;
  contentClassName?: string;
  header?: ReactNode;
  sidebar?: ReactNode;
}

export function AppShell({
  bodyClassName,
  children,
  contentClassName,
  header,
  sidebar,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-burd-section-alt text-burd-text">
      <WindowTitlebar />

      <div className={cx("flex min-h-0 flex-1 overflow-hidden", bodyClassName)}>
        {sidebar ? <div className="shrink-0">{sidebar}</div> : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {header ? <div className="shrink-0">{header}</div> : null}

          <main className={cx("min-h-0 flex-1 overflow-hidden", contentClassName)}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
