/**
 * Export WYSIWYG d'un aperçu de document : capture le DOM RÉEL de l'aperçu affiché (html2canvas)
 * puis le place dans un PDF A4 (jsPDF), avec pagination si l'aperçu dépasse une page.
 *
 * « Ce qui est vu est ce qui est exporté » : couleurs de la société, mise en page ET pointillés
 * auto-renseignés depuis le volet « Paramètres du document » (l'aperçu est réactif, on le capture
 * tel quel). Complète — sans remplacer — les exports vectoriels PDF/HTML/LaTeX existants.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const A4_W = 210; // mm
const A4_H = 297; // mm

/** Capture l'élément `el` et l'enregistre en PDF A4 fidèle sous `filename`. */
export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2, // netteté (retina)
    backgroundColor: "#ffffff", // fond blanc garanti
    useCORS: true, // logos / images distantes
    logging: false,
    windowWidth: el.scrollWidth,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const imgW = A4_W;
  const imgH = (canvas.height * imgW) / canvas.width; // conserve le ratio
  const img = canvas.toDataURL("image/png");

  // Une page si ça tient, sinon on « déroule » l'image sur plusieurs pages A4.
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(img, "PNG", 0, position, imgW, imgH);
  heightLeft -= A4_H;
  while (heightLeft > 0.5) {
    position -= A4_H;
    pdf.addPage();
    pdf.addImage(img, "PNG", 0, position, imgW, imgH);
    heightLeft -= A4_H;
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/** Nom de fichier normalisé (ASCII, sans espace parasite) : <titre>_<sujet>.pdf */
export function previewFileName(title: string, subject: string): string {
  const clean = (s: string) =>
    s.normalize("NFD").replace(/[^\x00-\x7F]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${clean(title) || "document"}_${clean(subject) || "apercu"}.pdf`;
}
