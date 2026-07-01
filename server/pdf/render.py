# -*- coding: utf-8 -*-
# render.py — Générateur PDF SERVEUR des points bloquants cp|WIRE, à la charte
# exacte du document de référence (couverture pleine page, sur-titres espacés,
# bandeau KPI, légende, sections par dossier, PIED DE PAGE NUMÉROTÉ n/total).
# Entrée : JSON sur stdin {meta:{...}, clients:[{name,count,intro,rows:[...]}]}.
# Sortie : PDF écrit au chemin passé en argv[1].
#
# Lancé par le serveur Node via child_process : python3 render.py out.pdf < data.json
import sys, json, html as H
from weasyprint import HTML

def e(s): return H.escape("" if s is None else str(s))

NAVY="#2E2A5D"; INDIGO="#4B3F8F"; GOLD="#A8884E"; LAV="#F5F2FC"; INK="#1F1B33"
MUTED="#6E6A86"; LINE="#E7E5F1"; RED="#C0392B"; AMBER="#C2691A"

def css(meta):
    foot_l = str(meta.get("footerLeft","armonie · Points bloquants — Portefeuille TMA & Projets")).replace('"', '\\"')
    foot_r = str(meta.get("footerRight","Points bloquants · Confidentiel")).replace('"', '\\"')
    return f"""
@page {{ size:A4; margin:16mm 14mm 18mm;
  @bottom-left {{ content:"{foot_l}"; font-family:Poppins; font-size:7pt; letter-spacing:.14em; text-transform:uppercase; color:{MUTED}; }}
  @bottom-right {{ content:"{foot_r} · " counter(page) " / " counter(pages); font-family:Poppins; font-size:7pt; letter-spacing:.14em; text-transform:uppercase; color:{MUTED}; }}
}}
@page cover {{ margin:0; @bottom-left{{content:none}} @bottom-right{{content:none}} }}
*{{box-sizing:border-box}}
body{{font-family:"Inter","DejaVu Sans",sans-serif; color:{INK}; font-size:10.5pt; line-height:1.5;}}
h1,h2,h3,.disp,.logo .m{{font-family:"Poppins",sans-serif;}}
.eyebrow{{font-size:8pt; letter-spacing:.28em; text-transform:uppercase; color:{GOLD}; font-weight:700; margin-bottom:5px;}}

/* COUVERTURE PLEINE PAGE */
.cover{{page:cover; position:relative; height:297mm; background:linear-gradient(150deg,{NAVY} 0%,{INDIGO} 60%,#3a3470 100%); color:#fff; padding:22mm 22mm;}}
.cover .top{{display:flex; justify-content:space-between; align-items:flex-start;}}
.logo .m{{font-weight:800; font-size:20pt; letter-spacing:.5px; line-height:1;}}
.logo .s{{font-size:7pt; letter-spacing:.2em; text-transform:uppercase; opacity:.7; margin-top:3px;}}
.kick{{font-size:8pt; letter-spacing:.24em; text-transform:uppercase; color:#d8cda0; font-weight:700; text-align:right; max-width:55mm;}}
.cover h1{{font-size:46pt; font-weight:800; margin:6mm 0 0; line-height:1.0;}}
.cover .sub{{font-size:13pt; opacity:.92; margin-top:14px;}}
.cover .meta{{font-size:10.5pt; opacity:.8; margin-top:6px;}}
.rule{{width:92px; height:4px; background:{GOLD}; border-radius:3px; margin:20px 0;}}
.pill{{display:inline-block; border:1px solid rgba(216,205,160,.6); color:#e9e0bf; font-size:8pt; letter-spacing:.2em; text-transform:uppercase; font-weight:700; padding:6px 13px; border-radius:20px;}}
.cols{{display:flex; gap:20px; margin-top:24px; align-items:stretch;}}
.enbref{{flex:1; background:rgba(255,255,255,.08); border-left:3px solid {GOLD}; border-radius:0 8px 8px 0; padding:15px 19px;}}
.enbref .l{{font-size:8pt; letter-spacing:.2em; text-transform:uppercase; color:#d8cda0; font-weight:700;}}
.enbref p{{margin:7px 0 0; font-size:10pt; line-height:1.6; opacity:.95;}}
.callout{{width:50mm; background:rgba(192,57,43,.18); border:1px solid rgba(216,205,160,.35); border-radius:10px; padding:15px 17px; display:flex; flex-direction:column; justify-content:center;}}
.callout b{{font-family:Poppins; font-size:40pt; font-weight:800; line-height:.92;}}
.callout .cl{{font-size:8pt; letter-spacing:.18em; text-transform:uppercase; color:#f0d6cf; font-weight:700; margin-top:5px;}}
.callout .ch{{font-size:9pt; opacity:.82; margin-top:6px; line-height:1.35;}}
.cover .foot{{position:absolute; left:22mm; right:22mm; bottom:18mm;}}
.estab .l{{font-size:7.5pt; letter-spacing:.2em; text-transform:uppercase; color:#d8cda0; font-weight:700;}}
.estab{{font-size:10pt; opacity:.9; line-height:1.5;}}
.legal{{display:flex; justify-content:space-between; margin-top:16px; font-size:7.5pt; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.55);}}

/* CHAPITRE / SYNTHÈSE */
.chap-t{{font-size:18pt; color:{NAVY}; margin:0 0 2px; font-weight:700;}}
.lead{{color:{MUTED}; font-size:10.5pt; margin:2px 0 14px;}}
.kpi{{display:flex; flex-wrap:wrap; gap:28px; padding:14px 2px; border-top:2px solid {GOLD}; border-bottom:1px solid {LINE}; margin:6px 0 16px;}}
.kpi .i{{font-size:8pt; color:{MUTED}; text-transform:uppercase; letter-spacing:.07em; font-weight:600;}}
.kpi .i b{{display:block; font-family:Poppins; font-size:25pt; font-weight:800; line-height:1; color:{NAVY}; margin-bottom:3px;}}
.kpi .i.cri b{{color:{RED};}} .kpi .i.maj b{{color:{AMBER};}} .kpi .i.idg b{{color:{INDIGO};}}
.legend{{background:{LAV}; border:1px solid {LINE}; border-radius:9px; padding:12px 16px; margin:0 0 18px;}}
.legend .lt{{font-size:8pt; letter-spacing:.2em; text-transform:uppercase; color:{INDIGO}; font-weight:700; margin-bottom:7px;}}
.legend .row{{display:flex; gap:9px; align-items:baseline; font-size:9.5pt; margin:4px 0;}}
.legend .k{{display:inline-block; min-width:62px; font-weight:800; font-size:7pt; letter-spacing:.5px; color:#fff; padding:3px 7px; border-radius:5px; text-align:center;}}
.legend .k.c{{background:{RED};}} .legend .k.m{{background:{AMBER};}} .legend .k.d{{background:{INDIGO};}}

/* SECTIONS PAR DOSSIER */
.sec{{margin:0 0 20px; break-inside:avoid;}}
.sec-name{{font-size:20pt; color:{NAVY}; margin:0; font-weight:700;}}
.sec-intro{{margin:6px 0 9px; color:{MUTED}; font-size:9.5pt;}}
table{{width:100%; border-collapse:separate; border-spacing:0;}}
thead{{display:table-header-group;}}
th{{text-align:left; font-size:7.5pt; text-transform:uppercase; letter-spacing:.06em; color:{MUTED}; padding:6px 8px; border-bottom:1.5px solid {GOLD};}}
td{{padding:8px; border-bottom:1px solid #ece9f3; vertical-align:top; font-size:9pt;}}
tr{{break-inside:avoid;}}
td.sev{{width:78px;}} td.cle{{width:74px; font-family:Poppins; font-weight:700; color:{GOLD}; white-space:nowrap;}}
td.dev{{width:108px; font-weight:600;}} td.since{{width:104px; color:{MUTED}; font-size:8.5pt; line-height:1.3;}}
td.since b{{color:{INK}; font-size:9.5pt;}} td.since .d{{display:block; font-size:8pt; margin-top:1px;}}
.badge{{display:inline-block; color:#fff; font-size:7pt; font-weight:800; letter-spacing:.5px; padding:3px 7px; border-radius:5px;}}
.eng{{display:inline-block; margin-top:5px; font-size:6.5pt; font-weight:800; letter-spacing:.5px; padding:2px 6px; border-radius:5px;}}
.eng-p{{background:#fff2e7; color:#b4560b; border:1px solid #f0d2b0;}}
.eng-t{{background:#e2f3ea; color:#1f8a5f; border:1px solid #bfe3d0;}}
.res .t{{font-weight:600; line-height:1.3;}} .res .why{{font-size:8.5pt; font-weight:600; margin-top:3px;}}
.filt{{font-size:9pt; color:{INDIGO}; font-weight:600; margin:0 0 8px;}}
.note{{font-size:9pt; color:{MUTED}; font-style:italic; margin:0 0 12px;}}
"""

def eng_tag(eng):
    if eng == "Projet": return '<span class="eng eng-p">PROJET</span>'
    if eng == "TMA": return '<span class="eng eng-t">TMA</span>'
    return ""

def render(data, out):
    meta = data.get("meta", {})
    clients = data.get("clients", [])
    crit = meta.get("crit", 0); total = meta.get("total", 0)
    nclients = len(clients); surv = total - crit
    clients_label = meta.get("clientsLabel", ", ".join(c.get("name","") for c in clients))
    date = meta.get("date", "")
    etabli = meta.get("etabli", "Nicolas Durand")

    secs = ""
    for c in clients:
        rows = ""
        for r in c.get("rows", []):
            sev = r.get("severity", "majeur")
            col = RED if sev == "critique" else AMBER
            tag = "CRITIQUE" if sev == "critique" else "MAJEUR"
            rows += (f'<tr><td class="sev"><span class="badge" style="background:{col}">{tag}</span>{eng_tag(r.get("engagement"))}</td>'
                     f'<td class="cle">{e(r.get("ticket"))}</td>'
                     f'<td class="res"><div class="t">{e(r.get("subject"))}</div><div class="why" style="color:{col}">{e(r.get("reason"))}</div></td>'
                     f'<td class="dev">{e(r.get("dev") or "Non assigné")}</td>'
                     f'<td class="since">{e(r.get("sinceLabel"))}<br><b>{e(r.get("sinceDate"))}</b><span class="d">{e(r.get("days"))} j ouvrés</span></td></tr>')
        secs += (f'<section class="sec"><div class="eyebrow">Dossier · {e(c.get("count"))} point{"s" if (c.get("count",0)>1) else ""}</div>'
                 f'<h2 class="sec-name">{e(c.get("name"))}</h2>'
                 f'<p class="sec-intro">{e(c.get("intro"))}</p>'
                 f'<table><thead><tr><th>Gravité</th><th>Ticket</th><th>Sujet &amp; raison</th><th>Développeur</th><th>Depuis</th></tr></thead><tbody>{rows}</tbody></table></section>')

    callout = ""
    if crit:
        callout = f'<div class="callout"><b>{crit}</b><span class="cl">dont critiques</span><span class="ch">échéance dépassée — à traiter en priorité</span></div>'

    doc = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>{css(meta)}</style></head><body>
<section class="cover">
  <div class="top">
    <div class="logo"><div class="m">armonie</div><div class="s">notos · PHL Soft</div></div>
    <div class="kick">Armonie Group · Points bloquants</div>
  </div>
  <h1>Points<br>bloquants</h1>
  <div class="sub">Portefeuille TMA &amp; Projets — suivi multi-clients</div>
  <div class="meta">{nclients} client{"s" if nclients>1 else ""} · {e(date)}</div>
  <div class="rule"></div>
  <span class="pill">Document de travail interne</span>
  <div class="cols">
    <div class="enbref"><div class="l">En bref</div>
      <p>{total} point{"s" if total>1 else ""} bloquant{"s" if total>1 else ""} recensé{"s" if total>1 else ""} sur l'ensemble du portefeuille. {nclients} client{"s" if nclients>1 else ""} concerné{"s" if nclients>1 else ""} : {e(clients_label)}. {crit} critique{"s" if crit>1 else ""} (échéance dépassée) · {surv} à surveiller (statut figé). Données issues de Jira : statuts, drapeaux et historique.</p>
    </div>
    {callout}
  </div>
  <div class="foot">
    <div class="estab"><span class="l">Établi par</span><br>{e(etabli)} — Chef de projet (MOE), Armonie Group</div>
    <div class="legal"><span>Armonie Group · Confidentiel</span><span>armonie.group</span></div>
  </div>
</section>

<div class="eyebrow">Synthèse</div>
<h1 class="chap-t">Vue d'ensemble</h1>
<p class="lead">Au {e(date)}, le portefeuille compte {total} point{"s" if total>1 else ""} bloquant{"s" if total>1 else ""} sur {nclients} client{"s" if nclients>1 else ""}. On distingue les critiques (échéance dépassée) des points à surveiller (statut figé). Le détail par client suit.</p>
<div class="kpi">
  <div class="i"><b>{total}</b>points bloquants</div>
  <div class="i cri"><b>{crit}</b>critiques</div>
  <div class="i maj"><b>{surv}</b>à surveiller</div>
  <div class="i idg"><b>{nclients}</b>clients</div>
</div>
<div class="legend"><div class="lt">Comment lire ce document</div>
  <div class="row"><span class="k c">Critique</span><span>Échéance dépassée.</span></div>
  <div class="row"><span class="k m">Majeur</span><span>Assigné mais resté en « À faire » (statut non transitionné), recette rejetée, ou signalé bloquant.</span></div>
  <div class="row"><span class="k d">Depuis</span><span>Date d'entrée réelle dans l'état bloquant, et ancienneté en jours ouvrés.</span></div>
</div>
{('<p class="filt">Filtres appliqués : ' + e(meta.get("caption")) + '</p>') if meta.get("caption") else ''}
{('<p class="note">' + e(meta.get("dormantNote")) + '</p>') if meta.get("dormantNote") else ''}
{secs}
</body></html>"""
    HTML(string=doc).write_pdf(out)

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/out.pdf"
    data = json.load(sys.stdin)
    render(data, out)
    print("OK")
