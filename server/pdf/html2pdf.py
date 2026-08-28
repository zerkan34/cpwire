#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# html2pdf.py — convertit un HTML autonome (reçu sur stdin) en PDF (argv[1]).
# Utilisé par le serveur pour transformer les exports (récaps, CR…) en vrai PDF
# téléchargeable, au lieu d'ouvrir la boîte d'impression du navigateur.
import sys
from weasyprint import HTML
from safe_fetch import safe_url_fetcher

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: html2pdf.py <out.pdf>\n"); sys.exit(2)
    html = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    # url_fetcher : interdit file:// et les URL distantes (lecture de fichiers, SSRF).
    HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf(sys.argv[1])

if __name__ == "__main__":
    main()
