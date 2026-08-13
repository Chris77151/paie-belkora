import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button, Input } from "@/components/ui/kit";
import { verifyPin } from "@/lib/pin";
import type { Firm } from "@/data/types";

/**
 * Boîte de saisie du code de validation à 4 chiffres. Vérifie le code contre l'empreinte de la
 * société (`firm.validation_pin_hash`) et n'appelle `onSuccess` qu'en cas de correspondance.
 * L'appelant ne déclenche cette boîte QUE si un code est défini (sinon il valide directement).
 */
export function PinPrompt({
  firm,
  title,
  action,
  onSuccess,
  onClose,
}: {
  firm: Firm;
  /** Titre du dialogue (ex. « Valider la paie »). */
  title: string;
  /** Libellé du bouton d'action confirmée (ex. « Valider »). */
  action: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit() {
    setChecking(true);
    const ok = await verifyPin(pin.trim(), firm.id, firm.validation_pin_hash);
    setChecking(false);
    if (ok) {
      onSuccess();
      onClose();
    } else {
      setError("Code incorrect.");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-display">
            <KeyRound size={18} className="text-primary" />
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Saisissez le code de validation à 4 chiffres défini dans les Paramètres pour confirmer.
        </p>
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={4}
          value={pin}
          placeholder="••••"
          className="text-center text-2xl tracking-[0.5em]"
          onChange={(e) => {
            setError("");
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin.length === 4) void submit();
          }}
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={pin.length !== 4 || checking}>
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
