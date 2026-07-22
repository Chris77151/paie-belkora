import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Send, Wrench, KeyRound, AlertTriangle, Trash2, ChevronDown, Loader2,
  CheckCircle2, Wifi,
} from "lucide-react";
import {
  Button, Card, CardContent, Field, Input, PageHeader, Select, Textarea, Badge,
} from "@/components/ui/kit";
import { currentFirm, useStore } from "@/data/store";
import { useT } from "@/lib/i18n";
import {
  DEFAULT_MODEL, getAiConfig, humanizeError, runTurn, setAiConfig, testConnection,
  type ApiMessage,
} from "@/lib/ai-agent";
import { cn } from "@/lib/cn";

type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; output?: unknown; refused?: boolean; done: boolean }
  | { kind: "error"; id: string; text: string };

const CUSTOM = "__custom__";
const MODELS = [
  { id: "claude-fable-5", label: "Claude Fable 5 — la plus performante (premium)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — très performante (recommandé)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — équilibrée (rapide, économique)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — la plus rapide (économique)" },
];

let seq = 0;
const nid = () => `e${(seq += 1)}`;

const SUGGESTIONS = [
  "Liste les salariés de la société active.",
  "Calcule le bulletin de paie de [nom] pour ce mois.",
  "Quelles sont les alertes de conformité en cours ?",
  "Augmente le taux horaire de [nom] à 25 DH.",
];

export default function Assistant() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);

  const [cfg, setCfg] = useState(() => getAiConfig());
  const [showConfig, setShowConfig] = useState(() => !getAiConfig().apiKey);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [customMode, setCustomMode] = useState(() => {
    const m = getAiConfig().model;
    return !!m && !MODELS.some((x) => x.id === m);
  });

  const apiMessages = useRef<ApiMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  const hasKey = useMemo(() => cfg.apiKey.trim().length > 0, [cfg.apiKey]);

  function push(e: Entry) {
    setEntries((prev) => [...prev, e]);
  }
  function patchTool(id: string, patch: Partial<Extract<Entry, { kind: "tool" }>>) {
    setEntries((prev) =>
      prev.map((e) => (e.kind === "tool" && e.id === id ? { ...e, ...patch } : e)),
    );
  }

  function saveConfig() {
    setAiConfig({ apiKey: cfg.apiKey.trim(), model: cfg.model });
    setCfg(getAiConfig());
    setTestResult(null);
    setShowConfig(false);
  }

  async function runTest() {
    setAiConfig({ apiKey: cfg.apiKey.trim(), model: cfg.model }); // teste la valeur saisie
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection());
    } catch (e) {
      setTestResult({ ok: false, message: humanizeError(e) });
    } finally {
      setTesting(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!hasKey) {
      setShowConfig(true);
      push({
        kind: "error",
        id: nid(),
        text: "Aucune clé API Anthropic n'est configurée. Ouvrez « Configuration », collez votre clé (sk-ant-…), puis « Tester la connexion ».",
      });
      return;
    }

    setInput("");
    push({ kind: "user", id: nid(), text });
    apiMessages.current.push({ role: "user", content: text });
    setBusy(true);

    try {
      await runTurn(apiMessages.current, {
        onText: (t) => push({ kind: "assistant", id: nid(), text: t }),
        onToolUse: ({ id, name, input }) =>
          push({ kind: "tool", id, name, input, done: false }),
        onToolResult: ({ id, output, refused }) =>
          patchTool(id, { output, refused, done: true }),
        confirmDestructive: async (name, inp) =>
          window.confirm(
            `L'assistant demande une opération sensible : ${name}\n\n${JSON.stringify(inp, null, 2)}\n\nConfirmer ?`,
          ),
      });
    } catch (e) {
      push({ kind: "error", id: nid(), text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    apiMessages.current = [];
    setEntries([]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader
        title={t("page.assistant.title")}
        subtitle={`${t("page.assistant.sub")} : ${firm.name}`}
      >
        <Button variant="outline" size="sm" onClick={() => setShowConfig((v) => !v)}>
          <KeyRound size={15} /> Configuration
        </Button>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <Trash2 size={15} /> Nouvelle conversation
          </Button>
        )}
      </PageHeader>

      {showConfig && (
        <Card className="mb-4">
          <CardContent className="pt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Clé API Anthropic" hint="Stockée uniquement dans ce navigateur (localStorage). Jamais envoyée ailleurs qu'à api.anthropic.com.">
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={cfg.apiKey}
                  onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                />
              </Field>
              <Field label="Modèle (IA)" hint="Les modèles haut de gamme dépendent de votre offre API — validez avec « Tester la connexion ».">
                <Select
                  value={customMode ? CUSTOM : cfg.model || DEFAULT_MODEL}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === CUSTOM) setCustomMode(true);
                    else { setCustomMode(false); setCfg((c) => ({ ...c, model: v })); }
                  }}
                  className="w-full sm:w-80"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  <option value={CUSTOM}>Personnalisé (identifiant libre)…</option>
                </Select>
              </Field>
            </div>

            {customMode && (
              <Field label="Identifiant du modèle" hint="Ex. claude-opus-4-7, claude-sonnet-4-5, claude-fable-5…">
                <Input
                  placeholder="claude-…"
                  value={MODELS.some((m) => m.id === cfg.model) ? "" : cfg.model}
                  onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value.trim() }))}
                />
              </Field>
            )}
            <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>
                Cette application n'a pas de serveur : la clé est utilisée directement depuis le
                navigateur. C'est adapté à un usage <strong>local et personnel</strong>, mais la clé
                est alors visible côté client — ne publiez pas cette app en ligne avec une clé
                partagée, et révoquez la clé en cas de doute.
              </p>
            </div>
            {testResult && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md p-3 text-xs",
                  testResult.ok ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {testResult.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={runTest} disabled={testing || !cfg.apiKey.trim()}>
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
                Tester la connexion
              </Button>
              <Button size="sm" onClick={saveConfig}>Enregistrer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fil de conversation */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {entries.length === 0 && (
            <div className="h-full grid place-items-center text-center">
              <div className="max-w-md">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-primary mb-3">
                  <Bot size={24} />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Demandez à Claude de lire, créer, modifier ou supprimer des données de l'application.
                </p>
                <div className="grid gap-2 text-left">
                  {SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      onClick={() => setInput(sug)}
                      className="rounded-md border border-input px-3 py-2 text-xs text-left hover:bg-accent"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
              <Loader2 size={15} className="animate-spin" /> Claude réfléchit…
            </div>
          )}
        </div>

        {/* Saisie */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={hasKey ? "Écrivez votre demande… (Entrée pour envoyer)" : "Configurez d'abord votre clé API Anthropic."}
              className="min-h-[44px] max-h-40"
              disabled={busy}
            />
            <Button onClick={send} disabled={busy || !input.trim()} className="h-11 px-4">
              <Send size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="flex gap-2.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <Bot size={15} />
        </div>
        <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>{entry.text}</span>
      </div>
    );
  }

  // tool
  return (
    <details className="ml-9 rounded-md border border-border/70 bg-card/50 text-xs open:pb-2">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none">
        {entry.done
          ? <Wrench size={13} className="text-sage" />
          : <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        <span className="font-medium">{entry.name}</span>
        {entry.refused
          ? <Badge tone="destructive">refusé</Badge>
          : entry.done
            ? <Badge tone="sage">exécuté</Badge>
            : <span className="text-muted-foreground">en cours…</span>}
        <ChevronDown size={13} className="ml-auto text-muted-foreground" />
      </summary>
      <div className="px-3 space-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Paramètres</div>
          <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px]">{JSON.stringify(entry.input, null, 2)}</pre>
        </div>
        {entry.done && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Résultat</div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px] max-h-56">{JSON.stringify(entry.output, null, 2)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}
