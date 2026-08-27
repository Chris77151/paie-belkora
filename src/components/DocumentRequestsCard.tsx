import { useMemo, useState } from "react";
import { FileText, Send, Clock, Check, X, Loader2, Trash2 } from "lucide-react";
import { actions } from "@/data/store";
import { useCanWrite } from "@/lib/auth";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";
import {
  DOC_REQUEST_STATUS_LABEL, DOC_REQUEST_TYPE_LABEL, isRequestOverdue,
} from "@/lib/document-requests";
import type {
  DocumentRequest, DocumentRequestStatus, DocumentRequestType, Employee, Firm,
} from "@/data/types";

const TYPE_ENTRIES = Object.entries(DOC_REQUEST_TYPE_LABEL) as [DocumentRequestType, string][];

const STATUS_TONE: Record<DocumentRequestStatus, "muted" | "warning" | "primary" | "success" | "destructive"> = {
  en_attente: "warning",
  en_cours: "primary",
  traite: "success",
  refuse: "destructive",
};

/** Date du jour au format « AAAA-MM-JJ » (UI — `new Date()` autorisé côté composant). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Carte « Demandes de documents » de l'accueil :
 * - tout le monde (y compris lecture seule) peut DÉPOSER une demande pour un salarié ;
 * - les demandes sont VISIBLES par tous les utilisateurs du cabinet ;
 * - seuls les rôles habilités (non lecture seule) peuvent les TRAITER (48 h ouvrables).
 */
export default function DocumentRequestsCard({
  firm,
  employees,
  requests,
}: {
  firm: Firm;
  employees: Employee[];
  requests: DocumentRequest[];
}) {
  const canProcess = useCanWrite();
  const today = todayIso();

  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<DocumentRequestType>("attestation_travail");
  const [message, setMessage] = useState("");

  const firmRequests = useMemo(
    () =>
      requests
        .filter((r) => r.firm_id === firm.id)
        .slice()
        .sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1)),
    [requests, firm.id],
  );

  const pending = firmRequests.filter((r) => r.status === "en_attente" || r.status === "en_cours").length;
  const overdue = firmRequests.filter((r) => isRequestOverdue(r.deadline, today, r.status)).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const emp = employees.find((x) => x.id === employeeId);
    if (!emp) return;
    actions.addDocumentRequest({
      firm_id: firm.id,
      employee_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`.trim(),
      type,
      message,
    });
    setMessage("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText size={17} className="text-primary" /> Demandes de documents
          {pending > 0 && <Badge tone="warning">{pending} en cours</Badge>}
          {overdue > 0 && <Badge tone="destructive">{overdue} en retard</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Formulaire de dépôt — accessible à tous (self-service salarié) */}
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border/70 bg-muted/40 p-3 sm:grid-cols-2">
          <Field label="Salarié concerné">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">— Sélectionner —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type de document">
            <Select value={type} onChange={(e) => setType(e.target.value as DocumentRequestType)}>
              {TYPE_ENTRIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Précision (facultatif)">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Motif, destinataire, mentions particulières…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Traitement garanti sous <span className="font-medium text-foreground">48 h ouvrables</span>.
            </p>
            <Button type="submit" disabled={!employeeId} size="sm">
              <Send size={15} /> Envoyer la demande
            </Button>
          </div>
        </form>

        {/* Liste des demandes — visible par tous les utilisateurs du cabinet */}
        {firmRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande de document pour l'instant.</p>
        ) : (
          <ul className="space-y-2">
            {firmRequests.slice(0, 8).map((r) => {
              const late = isRequestOverdue(r.deadline, today, r.status);
              return (
                <li key={r.id} className="rounded-md border border-border/70 px-3 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.employee_name}</p>
                      <p className="text-muted-foreground">{DOC_REQUEST_TYPE_LABEL[r.type]}</p>
                      {r.message && <p className="mt-0.5 text-xs text-muted-foreground italic">« {r.message} »</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={STATUS_TONE[r.status]}>{DOC_REQUEST_STATUS_LABEL[r.status]}</Badge>
                      <span className={`flex items-center gap-1 text-xs ${late ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        <Clock size={12} /> échéance {dateFr(r.deadline)}{late ? " · en retard" : ""}
                      </span>
                    </div>
                  </div>
                  {/* Traitement — réservé aux rôles habilités (masqué en lecture seule) */}
                  {canProcess && (
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-border/60 pt-2">
                      {r.status !== "en_cours" && r.status !== "traite" && (
                        <Button variant="outline" size="sm" onClick={() => actions.setDocumentRequestStatus(r.id, "en_cours")}>
                          <Loader2 size={14} /> Prendre en charge
                        </Button>
                      )}
                      {r.status !== "traite" && (
                        <Button variant="sage" size="sm" onClick={() => actions.setDocumentRequestStatus(r.id, "traite")}>
                          <Check size={14} /> Marquer traité
                        </Button>
                      )}
                      {r.status !== "refuse" && (
                        <Button variant="outline" size="sm" onClick={() => actions.setDocumentRequestStatus(r.id, "refuse")}>
                          <X size={14} /> Refuser
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto text-destructive"
                        title="Supprimer la demande"
                        onClick={() => actions.removeDocumentRequest(r.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
