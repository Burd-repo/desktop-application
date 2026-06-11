import { Cpu, ServerCog } from "lucide-react";
import { AuthLayout } from "../components/layout/auth-layout";
import { OnboardingCard } from "../components/ui/onboarding-card";
import type { PathChoice } from "../lib/app-state";

interface PathChoiceScreenProps {
  onSelect: (path: PathChoice) => void;
}

export function PathChoiceScreen({ onSelect }: PathChoiceScreenProps) {
  return (
    <AuthLayout
      childrenClassName="w-full"
      contentWidthClassName="max-w-[760px]"
      currentStep="path"
      title="O que você quer fazer primeiro?"
      subtitle="Escolha um caminho para continuar."
    >
      <div className="grid gap-4 md:grid-cols-2">
          <OnboardingCard
            icon={<Cpu className="h-5 w-5" />}
            title="Usar GPUs"
            description="Encontre GPUs verificadas para workloads de IA."
            actionLabel="Explorar GPUs"
            status="Em breve"
            onAction={() => onSelect("compute")}
          />

          <OnboardingCard
            icon={<ServerCog className="h-5 w-5" />}
            title="Oferecer minha máquina"
            description="Valide sua GPU localmente e prepare sua máquina para a rede."
            actionLabel="Verificar máquina"
            status="Disponível"
            statusVariant="success"
            onAction={() => onSelect("provider")}
          />
      </div>
    </AuthLayout>
  );
}
