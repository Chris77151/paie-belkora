/**
 * Aperçu WYSIWYG d'un document juridique (LegalDoc) — même structure de blocs que le rendu
 * PDF/HTML de rh-legal.ts, pour un contrôle visuel avant export. Les couleurs dérivent de la
 * société émettrice (spectre de firm.brand_color), à l'identique de l'export ; vert Miya par défaut.
 */
import type { Firm } from "@/data/types";
import type { LegalDoc } from "@/lib/rh-legal";
import { firmDescriptor, firmLegalLine } from "@/lib/firm-legal";
import { paletteForFirm } from "@/lib/brand-color";

export function LegalDocPreview({ firm, doc, lang = "fr" }: { firm: Firm; doc: LegalDoc; lang?: "fr" | "ar" }) {
  const ar = lang === "ar" && doc.ar ? doc.ar : null;
  const c = ar ?? doc;
  const rtl = !!ar;
  const pal = paletteForFirm(firm.brand_color); // couleurs dérivées de la société (défaut = vert Miya)
  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{ color: pal.inkHex }}
      className={`mx-auto max-w-[720px] rounded-md border bg-white shadow-sm px-9 py-8 text-[12.5px] leading-[1.7] ${rtl ? "text-right [font-family:'Amiri','Arabic_Typesetting',Tahoma,Arial,sans-serif]" : ""}`}
    >
      {/* En-tête */}
      <div className="flex items-center gap-4 border-b-[1.5px] pb-3" style={{ borderColor: pal.oliveHex }}>
        <img src={firm.logo_path || "/logo-miya.png"} alt="logo" className="h-11 w-auto object-contain" />
        <div>
          <div className="font-bold text-[14px]">
            {firm.name.toUpperCase()}
            {firmDescriptor(firm) && <span className="font-normal text-neutral-500"> — {firmDescriptor(firm)}</span>}
          </div>
          <div className="text-[10px] text-neutral-500">
            {firmLegalLine(firm, { includeAddress: true, sep: " · " })}
          </div>
        </div>
      </div>

      {!rtl && doc.rightHeader && <div className="mt-3 text-right text-[12px]">{doc.rightHeader}</div>}

      {c.meta && c.meta.length > 0 && (
        <div className="mt-2.5 space-y-0.5 text-[12px]">
          {c.meta.map((m, i) => (
            <div key={i}>
              <span className="font-semibold">{m.label} :</span> {m.value}
            </div>
          ))}
        </div>
      )}

      {/* Titre */}
      <div className="mt-6 text-center">
        <div className="text-[19px] font-bold" style={{ color: pal.deepHex }}>{c.heading}</div>
        {c.subheading && <div className="mt-1 text-[11.5px] text-neutral-500">{c.subheading}</div>}
        <div className="mx-auto mt-2.5 h-[2.5px] w-16 rounded" style={{ backgroundColor: pal.limeHex }} />
      </div>

      {/* Corps */}
      <div className={`mt-5 space-y-2.5 ${rtl ? "" : "text-justify"}`}>
        {c.blocks.map((b, i) => {
          switch (b.k) {
            case "h":
              return (
                <div key={i} className="pt-2 font-bold text-[13px]" style={{ color: pal.deepHex }}>
                  {b.t}
                </div>
              );
            case "p":
              return (
                <p key={i} className="whitespace-pre-line">
                  {b.t}
                </p>
              );
            case "ul":
              return (
                <ul key={i} className={`list-disc space-y-0.5 ${rtl ? "pr-6" : "pl-6"}`}>
                  {b.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              );
            case "check":
              return (
                <ul key={i} className="pl-1 space-y-0.5">
                  {b.items.map((it, j) => (
                    <li key={j}>☐&nbsp;&nbsp;{it}</li>
                  ))}
                </ul>
              );
            case "center":
              return (
                <p key={i} className={`text-center ${b.strong ? "font-bold" : ""}`}>
                  {b.t}
                </p>
              );
            case "sp":
              return <div key={i} style={{ height: b.h ?? 8 }} />;
            case "table":
              return (
                <div key={i} className="overflow-x-auto">
                  <table className="my-2 w-full border-collapse text-[11.5px]">
                    {b.head && (
                      <thead>
                        <tr>
                          {b.head.map((h, j) => (
                            <th
                              key={j}
                              className="border px-1.5 py-1 font-semibold"
                              style={{ backgroundColor: pal.deepHex, color: "#fff", textAlign: b.align?.[j] ?? "left", borderColor: pal.oliveHex }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {b.rows.map((r, ri) => (
                        <tr key={ri}>
                          {r.map((cell, ci) => (
                            <td key={ci} className="border border-neutral-300 px-1.5 py-1" style={{ textAlign: b.align?.[ci] ?? "left" }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>

      {c.faitA && <div className="mt-7 text-center font-bold text-[13px]">{c.faitA}</div>}
      {c.legalNote && <div className="mt-1 text-center text-[11px] italic text-neutral-500">{c.legalNote}</div>}

      {c.signatures && c.signatures.length > 0 && (
        <div className={`mt-8 flex gap-8 ${c.signatures.length >= 2 ? "" : "justify-start"}`}>
          {c.signatures.map((col, i) => (
            <div key={i} className={c.signatures!.length >= 2 ? "flex-1" : "w-3/5"}>
              <div className="font-bold text-[12.5px]" style={{ color: pal.deepHex }}>{col.title}</div>
              <div className="mt-1 mb-2 h-[2px] w-6" style={{ backgroundColor: pal.limeHex }} />
              {col.lines.map((l, j) => (
                <div key={j} className="text-[12px]">
                  {l}
                </div>
              ))}
              <div className="mt-11 border-t border-neutral-400 w-[90%]" />
              {col.caption && <div className="mt-1 text-[10px] text-neutral-500">{col.caption}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-neutral-200 pt-2 text-center text-[9px] italic text-neutral-400">
        {firmLegalLine(firm)}
        <div className="not-italic mt-0.5" style={{ color: pal.limeHex }}>Document généré par Belkora Paie & RH — référentiel Maroc.</div>
      </div>
    </div>
  );
}
