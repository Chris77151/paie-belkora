/**
 * Pièces justificatives de paie d'une entité × période : dépôt, consultation,
 * retrait — et RAPPROCHEMENT réel (versé saisi vs mis à disposition constaté).
 *
 * Même discipline que le dossier salarié : le BINAIRE reste sur le poste
 * (IndexedDB, clé = id de la fiche), la FICHE (nature, montant, empreinte,
 * auteur, horodatage) vit dans l'état et suit le cloud. Un poste sans le
 * binaire le dit explicitement — jamais de fichier vide.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Paperclip, Trash2, FileDown, Eye, CloudOff,
} from "@/components/icons";
import {
  Loader2,
} from "lucide-react";
import { actions, useStore } from "@/data/store";
import { useCanWrite } from "@/lib/auth";
import { Badge, Button, Field, Input, Select } from "@/components/ui/kit";
import { ACCEPT_ATTR, formatBytes, rejectReason, sha256Hex } from "@/lib/attachments";
import { deleteBinary, downloadBinary, localBinaryIds, openBinary, putBinary } from "@/lib/blob-store";
import { dateFr, mad } from "@/lib/format";
import type { PayrollAttachment, PayrollAttachmentKind } from "@/data/types";
import {
  PAYROLL_ATTACHMENT_HINT, PAYROLL_ATTACHMENT_LABEL, payrollAttachmentsOf,
  rapprocherPaie,
} from "@/lib/payroll-attachments";

export function PayrollAttachmentsPanel({
  firmId, year, month, kinds, verseNet,
}: {
  firmId: string;
  year: number;
  month: number; // 0 = toute l'année (livre annuel)
  kinds: PayrollAttachmentKind[];
  /** Total NET versé saisi (DH) — affiche le rapprochement réel quand fourni. */
  verseNet?: number;
}) {
  const s = useStore();
  const canEdit = useCanWrite();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<PayrollAttachmentKind>(kinds[0]);
  const [label, setLabel] = useState("");
  const [montant, setMontant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localIds, setLocalIds] = useState<Set<string>>(() => new Set());

  const items = useMemo(
    () => payrollAttachmentsOf(s.payrollAttachments, firmId, year, month)
      .filter((a) => kinds.includes(a.kind)),
    [s.payrollAttachments, firmId, year, month, kinds],
  );

  useEffect(() => {
    let alive = true;
    void localBinaryIds().then((ids) => {
      if (alive) setLocalIds(ids);
    });
    return () => {
      alive = false;
    };
  }, [items.length]);

  const rap = useMemo(() => {
    if (verseNet == null) return null;
    const mises = items.filter((a) => a.kind === "mise_a_disposition")
      .reduce((t, a) => Math.round((t + (a.montant ?? 0) + Number.EPSILON) * 100) / 100, 0);
    return { ...rapprocherPaie(verseNet, mises), misesCount: items.filter((a) => a.kind === "mise_a_disposition").length };
  }, [items, verseNet]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    const reason = rejectReason(file.type, file.size);
    if (reason) {
      setError(reason);
      return;
    }
    if (kind === "mise_a_disposition" && !(montant > 0)) {
      setError("Indiquez le montant constaté de la mise à disposition (DH) — c'est lui qui sert le rapprochement.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const id = actions.addPayrollAttachment({
        firm_id: firmId, year, month, kind,
        label: label.trim() || undefined,
        filename: file.name, mime: file.type, size: file.size,
        sha256: await sha256Hex(bytes),
        montant: kind === "mise_a_disposition" ? Math.round(montant * 100) / 100 : undefined,
      });
      await putBinary(id, file, file.name);
      setLocalIds((prev) => new Set(prev).add(id));
      setLabel("");
      setMontant(0);
    } catch {
      setError("Le fichier n'a pas pu être enregistré sur ce poste (navigation privée ou espace insuffisant).");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(a: PayrollAttachment) {
    if (!confirm(`Retirer la pièce « ${PAYROLL_ATTACHMENT_LABEL[a.kind]} — ${a.filename} » ?`)) return;
    await deleteBinary(a.id);
    actions.removePayrollAttachment(a.id);
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-medium">
          <Paperclip size={15} className="text-primary" /> Preuves de paie — {month === 0 ? `année ${year}` : `${String(month).padStart(2, "0")}/${year}`}
        </h3>
        <Badge tone={items.length > 0 ? "success" : "muted"}>{items.length} pièce(s)</Badge>
      </div>

      {rap && rap.aMatiere && (
        <div className="mt-3 grid gap-2 rounded-md border border-border/60 bg-card p-3 text-sm sm:grid-cols-4">
          <div><div className="text-[11px] text-muted-foreground">Versé saisi</div><div className="num font-semibold">{mad(rap.verse)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Mis à disposition ({rap.misesCount})</div><div className="num font-semibold">{mad(rap.misADisposition)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Reliquat</div><div className="num font-semibold">{mad(rap.ecart)}</div></div>
          <div className="flex items-center">
            <Badge tone={rap.equilibre ? "success" : "warning"}>{rap.equilibre ? "Rapprochement équilibré" : "Écart à justifier"}</Badge>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nature" hint={PAYROLL_ATTACHMENT_HINT[kind]}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as PayrollAttachmentKind)}>
              {kinds.map((k) => (<option key={k} value={k}>{PAYROLL_ATTACHMENT_LABEL[k]}</option>))}
            </Select>
          </Field>
          <Field label="Précision (N° fiche, quinzaine…)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optionnel" /></Field>
          {kind === "mise_a_disposition" ? (
            <Field label="Montant constaté (DH)"><Input type="number" min={0} value={montant} onChange={(e) => setMontant(Number(e.target.value))} /></Field>
          ) : <span />}
          <Field label="Fichier (PDF/image)">
            <Input ref={fileRef} type="file" accept={ACCEPT_ATTR} disabled={busy}
              onChange={(e) => void onPick(e.target.files?.[0])} />
          </Field>
        </div>
      )}
      {busy && <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Enregistrement…</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <ul className="mt-3 space-y-2">
        {items.map((a) => {
          const local = localIds.has(a.id);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {PAYROLL_ATTACHMENT_LABEL[a.kind]} · {a.filename}
                  {a.kind === "mise_a_disposition" && a.montant != null && (
                    <span className="num"> — {mad(a.montant)}</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.label ? `${a.label} · ` : ""}{formatBytes(a.size)} · déposé le {dateFr(a.uploaded_at.slice(0, 10))}
                  {a.uploaded_by ? ` par ${a.uploaded_by}` : ""} · SHA-256 {a.sha256.slice(0, 12)}…
                  {!local && " · binaire sur un autre poste"}
                </p>
              </div>
              {local ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => void openBinary(a.id)}><Eye size={14} /> Voir</Button>
                  <Button size="sm" variant="outline" onClick={() => void downloadBinary(a.id, a.filename)}><FileDown size={14} /> PDF</Button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CloudOff size={13} /> Fiche visible, fichier ailleurs</span>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => void remove(a)} title="Retirer"><Trash2 size={14} /></Button>
              )}
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="py-3 text-center text-sm text-muted-foreground">Aucune pièce sur cette période — déposez la preuve scannée.</li>
        )}
      </ul>
    </div>
  );
}
