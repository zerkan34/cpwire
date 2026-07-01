#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# html2pdf.py — convertit un HTML autonome (reçu sur stdin) en PDF (argv[1]).
# Utilisé par le serveur pour transformer les exports (récaps, CR…) en vrai PDF
# téléchargeable, au lieu d'ouvrir la boîte d'impression du navigateur.
import sys
from weasyprint import HTML

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: html2pdf.py <out.pdf>\n"); sys.exit(2)
    html = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    HTML(string=html).write_pdf(sys.argv[1])

if __name__ == "__main__":
    main()
