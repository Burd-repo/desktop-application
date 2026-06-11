import type { ReactNode } from "react";
import type { AuthView } from "../../lib/app-state";
import { cx } from "../../lib/utils";
import { AppShell } from "./app-shell";
import { Stepper } from "../ui/stepper";

interface AuthLayoutProps {
  children: ReactNode;
  childrenClassName?: string;
  contentWidthClassName?: string;
  currentStep: AuthView;
  title: string;
  subtitle?: string;
}

export function AuthLayout({
  children,
  childrenClassName,
  contentWidthClassName = "max-w-[420px]",
  currentStep,
  subtitle,
  title,
}: AuthLayoutProps) {
  return (
    <AppShell contentClassName="bg-burd-page">
      <div className="flex h-full min-h-0">
        <div className="hidden min-h-0 flex-1 overflow-hidden border-r border-burd-border bg-[#09090a] md:flex md:max-w-[40%] md:min-w-[300px] lg:max-w-[46%]">
          <img
            src="/login-for-app.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-full w-full select-none object-cover object-center"
          />
        </div>

        <section className="flex min-w-0 flex-1 items-center justify-center overflow-hidden px-4 py-3 sm:px-6 lg:px-8 xl:px-10">
          <div
            className={cx(
              "scrollbar-subtle max-h-full w-full overflow-y-auto pr-1 sm:pr-0",
              contentWidthClassName,
            )}
          >
            <div className="space-y-5">
              <Stepper currentStep={currentStep} />

              <div className="space-y-2.5">
                <h1 className="text-[30px] leading-[1.08] text-burd-text sm:text-[34px]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="text-[14px] leading-6 text-burd-text-secondary">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className={childrenClassName}>{children}</div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
