#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# onenote.py — Extraction du texte d'une section OneNote (.one) côté serveur.
# Sortie : markdown (titres de pages + contenu) sur stdout, exploitable tel quel
# par le chatbot et l'import corpus (même esprit que pptx.js).
#
# Robustesse :
#  1) applique au besoin un correctif au parseur pyOneNote (type 0x10
#     ArrayOfPropertyValues non géré par défaut — bloque les grosses sections) ;
#  2) si le parseur échoue malgré tout, repli sur une extraction UTF-16.
#
# Usage : python3 onenote.py <fichier.one>
import sys, os, re

def ensure_patch():
    """Corrige pyOneNote/FileNode.py pour gérer ArrayOfPropertyValues (idempotent)."""
    try:
        import pyOneNote, os as _os
        fn = _os.path.join(_os.path.dirname(pyOneNote.__file__), "FileNode.py")
        s = open(fn, encoding="utf-8").read()
        if "arr.append(PropertySet(" in s:
            return  # déjà corrigé
        bad = "raise NotImplementedError('ArrayOfPropertyValues is not implement')"
        if bad in s:
            good = ("count, = struct.unpack('<I', file.read(4))\n"
                    "                prid = PropertyID(file)\n"
                    "                arr = []\n"
                    "                for _ in range(count):\n"
                    "                    arr.append(PropertySet(file, OIDs, OSIDs, ContextIDs, self.document))\n"
                    "                self.rgData.append(arr)")
            s = s.replace(bad, good)
            # le branchement 0x11 a la même signature à corriger
            s = s.replace("self.rgData.append(PropertySet(file))",
                          "self.rgData.append(PropertySet(file, OIDs, OSIDs, ContextIDs, self.document))")
            open(fn, "w", encoding="utf-8").write(s)
    except Exception:
        pass  # on tentera quand même, puis repli

def clean(s):
    if s is None: return ""
    s = str(s).replace("\\x00", "").replace("\u0000", "").replace("\x00", "")
    return re.sub(r"\s+", " ", s).strip()

def extract_pyonenote(path):
    from pyOneNote.OneDocument import OneDocment
    with open(path, "rb") as f:
        doc = OneDocment(f)
        props = doc.get_properties()
    titles, runs = [], []
    for p in props:
        v = p.get("val") if isinstance(p, dict) else None
        if not isinstance(v, dict): continue
        for k, val in v.items():
            if k == "CachedTitleString":
                t = clean(val)
                if t: titles.append(t)
            elif k == "RichEditTextUnicode":
                t = clean(val)
                if t and len(t) >= 2: runs.append(t)
    dedup = lambda L: list(dict.fromkeys(L))
    return dedup(titles), dedup(runs)

def extract_utf16(path):
    """Repli : récupère les chaînes UTF-16LE lisibles du binaire."""
    data = open(path, "rb").read()
    try: txt = data.decode("utf-16-le", errors="ignore")
    except Exception: txt = ""
    runs = re.findall(r"[\x20-\x7E\u00A0-\u024F\u2010-\u2030]{6,}", txt)
    seen, out = set(), []
    for r in runs:
        r = r.strip()
        if len(r) >= 6 and r not in seen:
            seen.add(r); out.append(r)
    return [], out[:4000]

def to_md(name, titles, runs):
    md = [f"# {name} — notes (OneNote)",
          f"_Pages : {len(titles)} · blocs de texte : {len(runs)}._", ""]
    if titles:
        md.append("## Pages")
        md += [f"- {t}" for t in titles]
        md.append("")
    md.append("## Contenu")
    md += [f"- {r}" for r in runs]
    return "\n".join(md)

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: onenote.py <file.one>\n"); sys.exit(2)
    path = sys.argv[1]
    name = os.path.basename(path).rsplit(".", 1)[0]
    ensure_patch()
    titles, runs = [], []
    try:
        titles, runs = extract_pyonenote(path)
    except Exception:
        titles, runs = extract_utf16(path)
    if not runs and not titles:
        titles, runs = extract_utf16(path)
    sys.stdout.write(to_md(name, titles, runs))

if __name__ == "__main__":
    main()
