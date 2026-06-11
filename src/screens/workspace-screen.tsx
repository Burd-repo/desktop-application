import { ChevronDown } from "lucide-react";
import { AuthLayout } from "../components/layout/auth-layout";
import { Button } from "../components/ui/button";
import { Input, inputClasses } from "../components/ui/input";
import { primaryUseOptions } from "../lib/app-state";

interface WorkspaceScreenProps {
  country: string;
  primaryUse: string;
  workspaceName: string;
  onCountryChange: (value: string) => void;
  onCreate: () => void;
  onPrimaryUseChange: (value: string) => void;
  onWorkspaceNameChange: (value: string) => void;
}

export function WorkspaceScreen({
  country,
  onCountryChange,
  onCreate,
  onPrimaryUseChange,
  onWorkspaceNameChange,
  primaryUse,
  workspaceName,
}: WorkspaceScreenProps) {
  return (
    <AuthLayout
      currentStep="workspace"
      title="Crie seu espaço de trabalho"
      subtitle="Seu workspace organiza máquinas, deploys, saldo, uso e configurações dentro da Burd."
    >
      <div className="space-y-5">
        <Input
          label="Nome do workspace"
          placeholder="Burd Studio"
          value={workspaceName}
          onChange={(event) => onWorkspaceNameChange(event.target.value)}
        />

        <Input
          label="País"
          placeholder="Brasil"
          value={country}
          onChange={(event) => onCountryChange(event.target.value)}
        />

        <label className="block space-y-2">
          <span className="font-mono text-[13px] uppercase tracking-[0.04em] text-burd-text">
            Uso principal
          </span>

          <div className="relative">
            <select
              className={`${inputClasses} pr-12`}
              value={primaryUse}
              onChange={(event) => onPrimaryUseChange(event.target.value)}
            >
              {primaryUseOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-burd-text-secondary" />
          </div>
        </label>

        <Button
          variant="inverse"
          size="lg"
          fullWidth
          className="font-sans normal-case tracking-normal"
          disabled={!workspaceName.trim() || !country.trim()}
          onClick={onCreate}
        >
          Criar workspace
        </Button>
      </div>
    </AuthLayout>
  );
}
