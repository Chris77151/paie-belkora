import { useMemo, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { useStore, actions } from "@/data/store";
import { useT } from "@/lib/i18n";
import { buildSelectableYears } from "@/lib/params";
import { Input, Select } from "@/components/ui/kit";

/**
 * Sélecteur d'année COMMUN aux volets (Paie, Livre de paie, Écritures, Déclarations, Audit).
 *
 * La liste = plage standard (2000→année+1) ∪ années ajoutées manuellement (persistées) ∪
 * années présentes dans les données (`dataYears`, ex. périodes du Livre de paie). Un bouton « + »
 * ouvre une petite saisie pour ajouter n'importe quelle année (futures incluses), aussitôt
 * mémorisée pour tous les volets et sélectionnée. Corrige les listes « à trous » et remplace les
 * `SELECTABLE_YEARS.map(...)` dupliqués d'une page à l'autre.
 */
export function YearSelect({
  value,
  onChange,
  dataYears,
  className = "w-28",
}: {
  value: number;
  onChange: (year: number) => void;
  /** Années issues des données du volet (fusionnées à la plage standard). */
  dataYears?: number[];
  className?: string;
}) {
  const s = useStore();
  const t = useT();
  const years = useMemo(
    () => buildSelectableYears(s.extraYears ?? [], dataYears ?? []),
    [s.extraYears, dataYears],
  );

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function confirmAdd() {
    const y = parseInt(draft, 10);
    if (Number.isFinite(y) && y >= 1900 && y <= 2200) {
      actions.addSelectableYear(y);
      onChange(y);
    }
    setDraft("");
    setAdding(false);
  }
  function cancelAdd() {
    setDraft("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          autoFocus
          value={draft}
          placeholder={t("year.placeholder")}
          className={className}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmAdd();
            if (e.key === "Escape") cancelAdd();
          }}
        />
        <button
          type="button"
          title={t("year.confirm")}
          className="grid h-9 w-8 shrink-0 place-items-center rounded-md border border-input text-primary hover:bg-accent"
          onClick={confirmAdd}
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          title={t("btn.cancel")}
          className="grid h-9 w-8 shrink-0 place-items-center rounded-md border border-input text-muted-foreground hover:bg-accent"
          onClick={cancelAdd}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={value} onChange={(e) => onChange(+e.target.value)} className={className}>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
      <button
        type="button"
        title={t("year.add")}
        className="grid h-9 w-8 shrink-0 place-items-center rounded-md border border-input text-muted-foreground hover:bg-accent hover:text-primary"
        onClick={() => setAdding(true)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
