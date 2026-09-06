import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Trash2, FileDown, Eye, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import { actions, useStore } from "@/data/store";
import { useCanWrite } from "@/lib/auth";
import { Badge, Button, Field, Input, Select } from "@/components/ui/kit";
import {
  ACCEPT_ATTR,
  ATTACHMENT_KINDS,
  attachmentKindLabel,
  completeness,
  formatBytes,
  isConfidentialKind,
  rejectReason,
  sha256Hex,
} from "@/lib/attachments";
import { deleteBinary, downloadBinary, localBinaryIds, openBinary, putBinary } from "@/lib/blob-store";
import { dateFr } from "@/lib/format";
import type { Attachment, AttachmentKind, Employee } from "@/data/types";

/**
 * Pièces justificatives du dossier d'un salarié : dépôt, consultation, retrait, et complétude
 * du dossier au regard de la situation réelle du salarié (contrat, RIB, sortie…).
 *
 * Le fichier lui-même reste sur le poste (IndexedDB) ; sa fiche — nature, empreinte, auteur,
 * horodatage — est enregistrée dans l'état applicatif et suit donc la synchronisation cloud.
 * La distinction est affichée, jamais masquée : un poste qui n'a pas le binaire le dit.
 */
export function AttachmentsPanel({ employee, asOf }: { employee: Employee; asOf: string }) {
  const s = useStore();
  const canEdit = useCanWrite();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<AttachmentKind>("cin");
  const [label, setLabel] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localIds, setLocalIds] = useState<Set<string>>(() => new Set());

  const items = useMemo(
    () => (s.attachments ?? []).filter((a) => a.employee_id === employee.id).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [s.attachments, employee.id],
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

  const status = useMemo(() => completeness(employee, items, asOf), [employee, items, asOf]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    const reason = rejectReason(file.type, file.size);
    if (reason) {
      setError(reason);
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const id = actions.addAttachment({
        firm_id: employee.firm_id,
        employee_id: employee.id,
        kind,
        label: label.trim() || undefined,
        filename: file.name,
        mime: file.type,
        size: file.size,
        sha256: await sha256Hex(bytes),
        issued_on: issuedOn || undefined,
        expires_on: expiresOn || undefined,
      });
      // Le binaire prend pour clé l'id de sa fiche : la correspondance ne peut pas dériver.
      await putBinary(id, file, file.name);
      setLocalIds((prev) => new Set(prev).add(id));
      setLabel("");
      setIssuedOn("");
      setExpiresOn("");
    } catch {
      setError("Le fichier n'a pas pu être enregistré sur ce poste (navigation privée ou espace insuffisant).");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(a: Attachment) {
    if (!confirm(`Retirer la pièce « ${attachmentKindLabel(a.kind)} — ${a.filename} » du dossier ?`)) return;
    await deleteBinary(a.id);
    actions.removeAttachment(a.id);
  }

  return (
    <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-medium">
          <Paperclip size={15} className="text-primary" /> Pièces justificatives
        </h3>
        <Badge tone={status.missing.length === 0 ? "success" : status.pct >= 50 ? "warning" : "destructive"}>
          Dossier {status.pct} % · {status.present.length}/{status.expected.length}
        </Badge>
      </div>

      {status.missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <AlertTriangle size={12} className="mr-1 inline text-warning" />
          Attendu pour ce salarié : {status.missing.map(attachmentKindLabel).join(", ")}.
        </p>
      )}

      {/* Dépôt */}
      {canEdit && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nature de la pièce" hint={ATTACHMENT_KINDS.find((k) => k.key === kind)?.hint}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
              {ATTACHMENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Précision (facultatif)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. recto-verso, avenant n° 2" />
          </Field>
          <Field label="Date de la pièce (facultatif)">
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </Field>
          <Field label="Expire le (facultatif)" hint="Aptitude médicale, titre de séjour, assurance.">
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button variant="sage" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
              Déposer un fichier (PDF ou image)
            </Button>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
        </div>
      )}

      {/* Liste */}
      <ul className="mt-4 space-y-2">
        {items.length === 0 && <li className="text-sm text-muted-foreground">Aucune pièce déposée pour ce salarié.</li>}
        {items.map((a) => {
          const here = localIds.has(a.id);
          const expired = !!a.expires_on && a.expires_on < asOf;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{attachmentKindLabel(a.kind)}</span>
                  {isConfidentialKind(a.kind) && <Badge tone="muted" title="Donnée sensible — minimisation loi 09-08.">confidentiel</Badge>}
                  {expired && <Badge tone="destructive">expirée le {dateFr(a.expires_on!)}</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground" title={`Empreinte SHA-256 : ${a.sha256}`}>
                  {a.filename} · {formatBytes(a.size)}
                  {a.label ? ` · ${a.label}` : ""}
                  {a.issued_on ? ` · pièce du ${dateFr(a.issued_on)}` : ""}
                  {` · déposée le ${dateFr(a.uploaded_at.slice(0, 10))}`}
                  {a.uploaded_by ? ` par ${a.uploaded_by}` : ""}
                </p>
              </div>
              {here ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" title="Ouvrir" onClick={() => void openBinary(a.id)}><Eye size={15} /></Button>
                  <Button variant="ghost" size="icon" title="Télécharger" onClick={() => void downloadBinary(a.id, a.filename)}><FileDown size={15} /></Button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Fichier déposé depuis un autre poste : sa fiche est partagée, pas son contenu.">
                  <CloudOff size={13} /> sur un autre poste
                </span>
              )}
              {canEdit && (
                <Button variant="ghost" size="icon" className="text-destructive" title="Retirer" onClick={() => void remove(a)}>
                  <Trash2 size={15} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Les fichiers sont conservés sur ce poste ; leur fiche (nature, empreinte, auteur, date) est partagée
        avec les autres postes. Empreinte SHA-256 calculée au dépôt.
      </p>
    </div>
  );
}
