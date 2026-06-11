import { Chrome, Github } from "lucide-react";
import { AuthLayout } from "../components/layout/auth-layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

interface LoginScreenProps {
  email: string;
  onEmailChange: (value: string) => void;
  onContinueEmail: () => void;
  onSocial: (provider: "google" | "github") => void;
}

export function LoginScreen({
  email,
  onContinueEmail,
  onEmailChange,
  onSocial,
}: LoginScreenProps) {
  return (
    <AuthLayout
      currentStep="login"
      title="Entrar na Burd"
      subtitle="Acesse sua conta para continuar."
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <Button
            variant="social"
            size="lg"
            fullWidth
            icon={<Chrome className="h-5 w-5" />}
            className="justify-start px-5 font-sans normal-case tracking-normal"
            onClick={() => onSocial("google")}
          >
            Continuar com Google
          </Button>

          <Button
            variant="social"
            size="lg"
            fullWidth
            icon={<Github className="h-5 w-5" />}
            className="justify-start px-5 font-sans normal-case tracking-normal"
            onClick={() => onSocial("github")}
          >
            Continuar com GitHub
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-burd-border" />
          <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-burd-text-secondary">
            ou
          </span>
          <div className="h-px flex-1 bg-burd-border" />
        </div>

        <div className="space-y-4">
          <Input
            label="Email"
            placeholder="seu@email.com"
            type="email"
            autoComplete="email"
            value={email}
            className="font-sans text-[15px]"
            description="Enviaremos um código de 6 dígitos."
            onChange={(event) => onEmailChange(event.target.value)}
          />

          <Button
            variant="inverse"
            size="lg"
            fullWidth
            className="font-sans normal-case tracking-normal"
            disabled={!email.trim()}
            onClick={onContinueEmail}
          >
            Continuar com email
          </Button>
        </div>

        <p className="text-[12px] leading-6 text-burd-text-tertiary">
          Ao continuar, você concorda com os Termos e a Política de Privacidade.
        </p>
      </div>
    </AuthLayout>
  );
}
