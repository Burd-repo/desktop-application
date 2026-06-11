import { authSteps, type AuthView } from "../../lib/app-state";

interface StepperProps {
  currentStep: AuthView;
}

export function Stepper({ currentStep }: StepperProps) {
  const currentIndex = authSteps.findIndex((step) => step.key === currentStep);

  return (
    <div className="font-mono text-[11px] tracking-[0.1em] text-burd-text-tertiary">
      {currentIndex + 1} / {authSteps.length}
    </div>
  );
}
