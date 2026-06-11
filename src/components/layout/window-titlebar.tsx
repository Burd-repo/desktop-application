import { Copy, Minus, Square, X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { BurdLogo } from "../ui/burd-logo";
import {
  closeWindow,
  hasTauriRuntime,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  startWindowDragging,
  toggleMaximizeWindow,
} from "../../lib/tauri";
import { cx } from "../../lib/utils";

interface WindowControlButtonProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
}

function WindowControlButton({
  ariaLabel,
  children,
  className,
  onClick,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      data-window-control="true"
      className={cx(
        "inline-flex h-10 w-11 items-center justify-center text-burd-text-secondary transition",
        "hover:bg-white/5 hover:text-burd-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function WindowTitlebar() {
  const [maximized, setMaximized] = useState(false);
  const showWindowControls = hasTauriRuntime();

  useEffect(() => {
    if (!showWindowControls) {
      return;
    }

    let disposed = false;
    let unlisten = () => {};

    async function syncWindowState() {
      const nextState = await isWindowMaximized();

      if (!disposed) {
        setMaximized(nextState);
      }
    }

    void syncWindowState();

    void onWindowResized(syncWindowState).then((stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }

      unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten();
    };
  }, [showWindowControls]);

  async function handleToggleMaximize() {
    await toggleMaximizeWindow();
    setMaximized(await isWindowMaximized());
  }

  function handleDragRegionMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!showWindowControls || event.button !== 0 || event.detail > 1) {
      return;
    }

    if ((event.target as HTMLElement).closest('[data-window-control="true"]')) {
      return;
    }

    void startWindowDragging();
  }

  return (
    <header className="flex h-10 shrink-0 items-stretch border-b border-burd-border bg-[rgba(8,8,9,0.96)] backdrop-blur-xl">
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-stretch"
        onMouseDown={handleDragRegionMouseDown}
        onDoubleClick={() => void handleToggleMaximize()}
      >
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center px-3.5 select-none"
        >
          <BurdLogo
            className="pointer-events-none"
            imageClassName="h-5 w-auto opacity-90"
            fallbackClassName="text-[13px] text-burd-text"
          />
        </div>

        <div data-tauri-drag-region className="hidden flex-1 md:block" />
      </div>

      {showWindowControls ? (
        <div className="flex shrink-0 items-stretch border-l border-white/5">
          <WindowControlButton
            ariaLabel="Minimizar janela"
            onClick={() => void minimizeWindow()}
          >
            <Minus className="h-4 w-4" />
          </WindowControlButton>

          <WindowControlButton
            ariaLabel={maximized ? "Restaurar janela" : "Maximizar janela"}
            onClick={() => void handleToggleMaximize()}
          >
            {maximized ? (
              <Copy className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </WindowControlButton>

          <WindowControlButton
            ariaLabel="Fechar janela"
            className="w-12 hover:bg-[#9f2938] hover:text-white"
            onClick={() => void closeWindow()}
          >
            <X className="h-4 w-4" />
          </WindowControlButton>
        </div>
      ) : null}
    </header>
  );
}
