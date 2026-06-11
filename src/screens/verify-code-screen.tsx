import { AuthLayout } from "../components/layout/auth-layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

interface VerifyCodeScreenProps {
  code: string;
  email: string;
  onCodeChange: (value: string) => void;
  onResend: () => void;
  onVerify: () => void;
}

export function VerifyCodeScreen({
  code,
  email,
  onCodeChange,
  onResend,
  onVerify,
}: VerifyCodeScreenProps) {
  return (
    <AuthLayout
      currentStep="verify"
      title="Verifique seu email"
      subtitle={`Enviamos um código de 6 dígitos para ${email || "o email informado"}.`}
    >
      <div className="space-y-6">
        <Input
          label="Código de 6 dígitos"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) =>
            onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputClassName="pl-[1.25em] text-center text-[22px] tracking-[0.55em]"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Button
            variant="inverse"
            size="lg"
            fullWidth
            className="font-sans normal-case tracking-normal"
            disabled={code.length !== 6}
            onClick={onVerify}
          >
            Verificar código
          </Button>

          <Button
            variant="panel"
            size="lg"
            fullWidth
            className="font-sans normal-case tracking-normal"
            onClick={onResend}
          >
            Reenviar código
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
