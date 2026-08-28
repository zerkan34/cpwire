#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# safe_fetch.py — garde-fou de sécurité pour les rendus WeasyPrint.
#
# Pourquoi : les routes /api/pdf/render et /api/export/pdf reçoivent du contenu
# venant du client. Sans restriction, WeasyPrint résout les URL absolues qu'il
# rencontre, y compris file:// (lecture d'un fichier du serveur, renvoyé dans le
# PDF) et http:// vers des adresses internes (SSRF). On n'autorise donc que les
# images embarquées en base64 (data:), ce qu'utilisent déjà tous nos exports.
#
# Usage : HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf(out)

from weasyprint import default_url_fetcher


class RessourceRefusee(Exception):
    """Levée quand un document tente de charger une ressource externe."""


def safe_url_fetcher(url, *args, **kwargs):
    u = (url or "").strip().lower()
    if u.startswith("data:"):
        return default_url_fetcher(url, *args, **kwargs)
    raise RessourceRefusee(
        "Ressource externe refusee dans un PDF : %s. "
        "Les images doivent etre embarquees en base64 (data:)." % url[:120]
    )
