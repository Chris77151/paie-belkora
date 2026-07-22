import { useState } from "react";
import { Sprout, LogIn, Loader2, AlertCircle, Lock } from "lucide-react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui/kit";
import { login } from "@/lib/auth";

/** Porte d'authentification : affichée tant qu'aucun utilisateur n'est connecté. */
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await login(username, password);
      if (!r.ok) setError(r.error ?? "Connexion impossible.");
      // En cas de succès, App bascule automatiquement (useSession).
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sprout size={26} />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold">Belkora Paie &amp; RH</h1>
          <p className="text-sm text-muted-foreground">Maroc · RH &amp; Paie — accès réservé</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <Field label="Identifiant">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="prenom.nom / e-mail"
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                />
              </Field>
              <Field label="Mot de passe">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Field>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                Se connecter
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <Lock size={12} />
          Les comptes sont créés par le super administrateur dans Paramètres.
        </p>
      </div>
    </div>
  );
}
