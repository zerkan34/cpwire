import React, { useMemo, useState } from "react";
import Morning from "./Morning.jsx";
import History from "./History.jsx";
import PointDuSoir from "./PointDuSoir.jsx";
import { computeFacts } from "../facts.js";

// « Récap » — un seul écran qui réunit :
//   • Le brief  : ce qui est en mouvement aujourd'hui, par client (ancien « Brief du matin »).
//   • Historique & totaux : les récaps passés et les totaux, par client et par période.
// Remplace les deux anciens onglets (Brief du matin + Historique).
const VIEWS = [
  { id: "brief", label: "Aujourd'hui", sub: "Ce qui est en mouvement aujourd'hui, par client." },
  { id: "histo", label: "Historique & totaux", sub: "Les récaps passés et les totaux, par client et par période." },
];

export default function Recap({ issues = [], canCR = true, onTicket, onDev, deletedDevs = [], inactiveDevs = [] }) {
  const [view, setView] = useState("brief");
  const cur = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const facts = useMemo(() => computeFacts(issues), [issues]);
  const [pdsD, setPdsD] = useState("Tafanel");
  const PDS_DOSSIERS = useMemo(() => {
    const present = Object.keys(facts.byDossier).filter((d) => d && d !== "—");
    const ordered = ["Tafanel", "EDL", "DS Smith", "IMA", "DIAPAR", "Balas", "Bellion"].filter((d) => present.includes(d));
    const extra = present.filter((d) => !ordered.includes(d));
    return [...ordered, ...extra, "Tous dossiers"];
  }, [facts]);
  const pdsBlock = pdsD === "Tous dossiers" ? facts.global : facts.get(pdsD);
  const pdsItems = pdsD === "Tous dossiers" ? issues : issues.filter((i) => i.dossier === pdsD);
  return (
    <>
      <div className="page-hero">
        <span className="page-hero-k">Récap</span>
        <h2>Récap</h2>
        <p>{cur.sub}</p>
      </div>
      <div className="recap-switch" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
            className={`recap-switch-b ${view === v.id ? "on" : ""}`} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      {view === "brief"
        ? <>
            <div className="recap-pds">
              <div className="recap-pds-pick">
                <span>Périmètre suivi</span>
                <select value={pdsD} onChange={(e) => setPdsD(e.target.value)} aria-label="Périmètre du point du soir">
                  {PDS_DOSSIERS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <PointDuSoir dossier={pdsD} cats={pdsBlock.cats} items={pdsItems} onTicket={onTicket} />
            </div>
            <Morning issues={issues} onTicket={onTicket} embedded />
          </>
        : <History issues={issues} canCR={canCR} onTicket={onTicket} onDev={onDev} deletedDevs={deletedDevs} inactiveDevs={inactiveDevs} />}
    </>
  );
}
