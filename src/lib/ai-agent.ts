/**
 * Boucle d'agent Claude pour l'assistant in-app (tool-use).
 *
 * Topologie : l'app n'a pas de backend. On appelle donc directement l'API Anthropic
 * depuis le navigateur (SDK officiel `@anthropic-ai/sdk`, `dangerouslyAllowBrowser`).
 * La clé API est saisie par l'utilisateur et stockée en localStorage — ACCEPTABLE en
 * usage local mono-utilisateur, mais la clé est alors visible côté client : ne jamais
 * déployer cette app en ligne avec une clé partagée. (Le vrai MCP suppose un serveur
 * hôte ; ici on livre l'équivalent fonctionnel : Claude pilote l'app via des outils.)
 */
import Anthropic from "@anthropic-ai/sdk";
import { currentFirm, getState } from "@/data/store";
import { AI_TOOLS, TOOLS_BY_NAME } from "@/lib/ai-tools";

const KEY_STORE = "gca-ai-key";
const MODEL_STORE = "gca-ai-model";
export const DEFAULT_MODEL = "claude-opus-4-8";

export interface AiConfig {
  apiKey: string;
  model: string;
}

export function getAiConfig(): AiConfig {
  return {
    apiKey: localStorage.getItem(KEY_STORE) ?? "",
    model: localStorage.getItem(MODEL_STORE) ?? DEFAULT_MODEL,
  };
}

export function setAiConfig(cfg: Partial<AiConfig>): void {
  if (cfg.apiKey != null) localStorage.setItem(KEY_STORE, cfg.apiKey);
  if (cfg.model != null) localStorage.setItem(MODEL_STORE, cfg.model || DEFAULT_MODEL);
}

/** Crée un client Anthropic (accès navigateur direct : ajoute l'en-tête CORS requis). */
function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** Extrait le message lisible d'une erreur SDK (le corps `error.message`), sans le JSON brut. */
function apiMessage(e: unknown): string {
  const body = (e as { error?: unknown }).error;
  const inner = (body as { message?: unknown } | undefined)?.message;
  if (typeof inner === "string" && inner.trim()) return inner;
  return e instanceof Error ? e.message : String(e);
}

/** Traduit une erreur SDK/réseau en message clair pour l'utilisateur (FR). */
export function humanizeError(e: unknown): string {
  // Cas facturation : le message peut arriver en 400 (invalid_request_error) ou 403 (billing_error).
  const msg = apiMessage(e);
  if (/credit balance|purchase credits|plans\s*&\s*billing|insufficient|quota|billing/i.test(msg))
    return "Crédits Anthropic insuffisants : votre compte n'a plus de solde pour appeler l'API. Rechargez sur console.anthropic.com → Plans & Billing (achat de crédits), puis relancez. La clé et le code sont corrects ; c'est un problème de compte.";

  if (e instanceof Anthropic.AuthenticationError)
    return "Clé API refusée (401) : la clé est invalide, révoquée ou mal copiée. Vérifiez-la dans Configuration.";
  if (e instanceof Anthropic.PermissionDeniedError)
    return "Accès refusé (403) : cette clé n'a pas accès à ce modèle, ou la facturation/crédits de l'organisation ne le permettent pas.";
  if (e instanceof Anthropic.NotFoundError)
    return "Modèle introuvable (404) : votre clé n'a probablement pas accès à ce modèle. Choisissez un autre modèle (Sonnet ou Haiku) dans Configuration.";
  if (e instanceof Anthropic.RateLimitError)
    return "Limite de débit atteinte (429) : patientez quelques secondes puis réessayez.";
  if (e instanceof Anthropic.APIConnectionError)
    return "Connexion impossible à l'API Anthropic : problème réseau, coupure, ou requête bloquée par le navigateur (CORS/extension). Vérifiez votre connexion.";
  if (e instanceof Anthropic.APIError)
    return `Erreur API ${e.status ?? ""} : ${msg}`.trim();
  return msg;
}

/** Test de connexion : appel minimal pour valider clé + modèle. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = getAiConfig();
  if (!cfg.apiKey) return { ok: false, message: "Aucune clé API saisie." };
  try {
    const client = makeClient(cfg.apiKey);
    const r = await client.messages.create({
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, message: `Connexion OK — modèle ${r.model}.` };
  } catch (e) {
    return { ok: false, message: humanizeError(e) };
  }
}

/* ---- types de messages (format API Anthropic) ---- */
export type ApiMessage = Anthropic.MessageParam;

/** Événements émis pendant un tour, pour que l'UI affiche le fil en direct. */
export interface TurnHandlers {
  /** Texte produit par l'assistant (un bloc de texte terminé). */
  onText?: (text: string) => void;
  /** Claude demande un appel d'outil. */
  onToolUse?: (call: { id: string; name: string; input: unknown }) => void;
  /** Résultat renvoyé à Claude après exécution locale. */
  onToolResult?: (res: { id: string; name: string; output: unknown; refused?: boolean }) => void;
  /** Demande de confirmation avant une opération destructive. Retourne true pour exécuter. */
  confirmDestructive?: (name: string, input: unknown) => Promise<boolean>;
}

function systemPrompt(): string {
  const s = getState();
  const firm = currentFirm(s);
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Tu es l'assistant IA intégré à l'application « Belkora Paie & RH » (Groupe Belkora, Maroc).",
    "Tu PILOTES l'application : tu peux lire, créer, modifier et supprimer les données via les outils fournis (sociétés, salariés, calculs de paie, alertes de conformité).",
    "",
    `Date du jour : ${today}. Société active : « ${firm.name} » (régime ${firm.regime}, id ${firm.id}).`,
    "",
    "Règles :",
    "- Réponds en français, de façon concise et professionnelle (contexte RH/paie marocain).",
    "- Pour tout chiffre de paie (brut, net, cotisations, IR, coût employeur), utilise TOUJOURS l'outil compute_payslip : n'invente jamais un montant.",
    "- N'invente jamais une CIN, un numéro CNSS, un RIB : laisse le champ vide si l'information est inconnue et signale-le.",
    "- Avant une suppression, explique ce qui va être supprimé ; l'application demandera une confirmation à l'utilisateur.",
    "- Les opérations portent sur la société active. Si l'utilisateur vise une autre société, utilise set_current_firm d'abord.",
    "- Après avoir modifié des données, confirme brièvement ce qui a été fait (l'interface se met à jour automatiquement).",
    "- Si une demande est ambiguë ou qu'il manque un champ obligatoire, pose une question courte plutôt que de deviner.",
  ].join("\n");
}

function toolDefs(): Anthropic.Tool[] {
  return AI_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Exécute un tour complet : envoie l'historique, exécute les outils demandés en boucle
 * jusqu'à ce que Claude termine (`end_turn`). Mute `messages` en place (ajoute les tours
 * assistant et les résultats d'outils) et le renvoie.
 */
export async function runTurn(
  messages: ApiMessage[],
  handlers: TurnHandlers = {},
): Promise<ApiMessage[]> {
  const cfg = getAiConfig();
  if (!cfg.apiKey) throw new Error("Clé API Anthropic manquante (Configuration).");

  const client = makeClient(cfg.apiKey);
  const system = systemPrompt();
  const tools = toolDefs();

  // Garde-fou anti-boucle infinie.
  for (let step = 0; step < 12; step += 1) {
    const response = await client.messages.create({
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 8000,
      system,
      tools,
      messages,
    });

    // Ajoute la réponse de l'assistant à l'historique (blocs texte + tool_use).
    messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) handlers.onText?.(block.text);
    }

    if (response.stop_reason !== "tool_use") break;

    // Exécute chaque outil demandé, renvoie tous les résultats dans UN message user.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const tool = TOOLS_BY_NAME[block.name];
      handlers.onToolUse?.({ id: block.id, name: block.name, input: block.input });

      if (!tool) {
        const output = { ok: false, error: `Outil inconnu: ${block.name}` };
        handlers.onToolResult?.({ id: block.id, name: block.name, output, refused: false });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
          is_error: true,
        });
        continue;
      }

      // Confirmation obligatoire pour les opérations destructives.
      if (tool.destructive && handlers.confirmDestructive) {
        const ok = await handlers.confirmDestructive(block.name, block.input);
        if (!ok) {
          const output = { ok: false, refused: true, message: "Opération refusée par l'utilisateur." };
          handlers.onToolResult?.({ id: block.id, name: block.name, output, refused: true });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(output),
          });
          continue;
        }
      }

      let output: unknown;
      let isError = false;
      try {
        output = tool.run((block.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
        isError = true;
      }
      handlers.onToolResult?.({ id: block.id, name: block.name, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(output),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return messages;
}
