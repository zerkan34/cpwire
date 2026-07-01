// ============================================================================
//  pptx.js — Extraction du texte d'un .pptx (PowerPoint) côté serveur.
//  Un .pptx est un ZIP de XML. On lit chaque diapositive ppt/slides/slideN.xml
//  dans l'ordre, on récolte les runs de texte <a:t>…</a:t>, et on restitue
//  un texte « ## Slide N » par diapositive — même forme que l'outil d'extraction
//  de référence, exploitable tel quel par le chatbot et l'import corpus.
//  Aucune dépendance native : jszip est en pur JS (déjà tiré par mammoth).
// ============================================================================

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

const slideNo = (path) => { const m = path.match(/slide(\d+)\.xml$/); return m ? parseInt(m[1], 10) : 0; };

export async function pptxToText(buffer) {
  const mod = await import("jszip");
  const JSZip = mod.default || mod;
  const zip = await JSZip.loadAsync(buffer);

  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const parts = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.files[slides[i]].async("string");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]).trim()).filter(Boolean);
    if (runs.length) parts.push(`## Slide ${i + 1}\n${runs.join("\n")}`);
  }
  return parts.join("\n\n");
}

// true si le nom de fichier est un PowerPoint pris en charge.
export const isPptx = (name) => /\.pptx$/i.test(String(name || ""));
