/**
 * Lecture comptable Odoo (JSON-RPC, LECTURE SEULE) pour l'audit par assertions.
 *
 * Récupère, pour une société et un exercice : les journaux, les comptes (account.account),
 * les soldes par compte des lignes POSTÉES (read_group sur account.move.line) et l'état des
 * écritures (brouillon vs postées). Aucune écriture n'est effectuée (search_read / read_group).
 *
 * CORS : même contrainte que odoo.ts — passer par le proxy « /odoo » en dev.
 */
import type { OdooConfig } from "@/data/types";

/* ---- transport (mêmes conventions que odoo.ts) ---- */
function endpoint(config: OdooConfig): string {
  return `${config.url.replace(/\/+$/, "")}/jsonrpc`;
}
async function jsonRpc(config: OdooConfig, service: string, method: string, args: unknown[]): Promise<any> {
  const res = await fetch(endpoint(config), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Math.floor(Math.random() * 1e9) }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error?.data?.message || data.error?.message || "Erreur Odoo");
  return data.result;
}
async function authenticate(config: OdooConfig): Promise<number> {
  const uid = await jsonRpc(config, "common", "authenticate", [config.db, config.username, config.apiKey, {}]);
  if (!uid) throw new Error("Authentification Odoo refusée (db / identifiant / clé API).");
  return uid as number;
}

/* ---- types ---- */
export interface AccountBalance {
  id: number;
  code: string;
  name: string;
  account_type?: string;
  debit: number;
  credit: number;
  balance: number; // debit - credit
}
export interface OdooAccountingData {
  companyId: number;
  year: number;
  journals: { id: number; name: string; code: string; type: string }[];
  balances: AccountBalance[];
  postedMoves: number;
  draftMoves: number;
  cancelledMoves: number;
  journalsWithPosted: Set<number>;
  totalDebit: number;
  totalCredit: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lit la comptabilité postée d'une société pour un exercice (lecture seule). */
export async function fetchOdooAccounting(
  config: OdooConfig,
  companyId: number,
  year: number,
): Promise<OdooAccountingData> {
  const uid = await authenticate(config);
  const call = (model: string, method: string, args: unknown[], kwargs: object = {}) =>
    jsonRpc(config, "object", "execute_kw", [config.db, uid, config.apiKey, model, method, args, kwargs]);

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const companyDomain = ["company_id", "=", companyId];

  // 1) Journaux de la société.
  const journalsRaw: { id: number; name: string; code?: string | false; type?: string | false }[] =
    await call("account.journal", "search_read", [[companyDomain]], { fields: ["id", "name", "code", "type"], limit: 300 });

  // 2) Comptes (référentiel) — code / libellé / type. Chart partagé : pas de filtre société.
  const accountsRaw: { id: number; code?: string | false; name?: string | false; account_type?: string | false }[] =
    await call("account.account", "search_read", [[]], { fields: ["id", "code", "name", "account_type"], limit: 8000 });
  const accById = new Map(accountsRaw.map((a) => [a.id, a]));

  // 3) Soldes par compte, lignes POSTÉES de l'exercice (read_group = agrégat, lecture seule).
  const grp: any[] = await call(
    "account.move.line",
    "read_group",
    [
      [["parent_state", "=", "posted"], companyDomain, ["date", ">=", start], ["date", "<=", end]],
      ["debit", "credit", "balance"],
      ["account_id"],
    ],
    { lazy: false },
  );

  const balances: AccountBalance[] = grp
    .filter((g) => Array.isArray(g.account_id))
    .map((g) => {
      const id = g.account_id[0] as number;
      const meta = accById.get(id);
      const debit = round2(Number(g.debit) || 0);
      const credit = round2(Number(g.credit) || 0);
      return {
        id,
        code: String(meta?.code ?? "").trim(),
        name: String(meta?.name ?? g.account_id[1] ?? "").trim(),
        account_type: typeof meta?.account_type === "string" ? meta.account_type : undefined,
        debit,
        credit,
        balance: round2(debit - credit),
      };
    });

  // 4) État des écritures (comptage par état) + journaux ayant des écritures postées.
  const stateGrp: any[] = await call(
    "account.move",
    "read_group",
    [[companyDomain, ["date", ">=", start], ["date", "<=", end]], ["id"], ["state"]],
    { lazy: false },
  );
  const stateCount = (st: string) =>
    stateGrp.filter((g) => g.state === st).reduce((s, g) => s + (Number(g.__count) || 0), 0);

  const journalGrp: any[] = await call(
    "account.move",
    "read_group",
    [[companyDomain, ["date", ">=", start], ["date", "<=", end], ["state", "=", "posted"]], ["id"], ["journal_id"]],
    { lazy: false },
  );
  const journalsWithPosted = new Set<number>(
    journalGrp.filter((g) => Array.isArray(g.journal_id)).map((g) => g.journal_id[0] as number),
  );

  return {
    companyId,
    year,
    journals: journalsRaw.map((j) => ({ id: j.id, name: String(j.name), code: String(j.code || ""), type: String(j.type || "") })),
    balances,
    postedMoves: stateCount("posted"),
    draftMoves: stateCount("draft"),
    cancelledMoves: stateCount("cancel"),
    journalsWithPosted,
    totalDebit: round2(balances.reduce((s, b) => s + b.debit, 0)),
    totalCredit: round2(balances.reduce((s, b) => s + b.credit, 0)),
  };
}
