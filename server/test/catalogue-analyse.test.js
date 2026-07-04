import { test } from "node:test";
import assert from "node:assert";
import { analyseCatalogue, PORTFOLIO_CI } from "../catalogueAnalyse.js";

test("analyse du catalogue : couverture, orphelins, fraîcheur", () => {
  const docs = [
    { n: "a", ci: 2, k: "Contrats", x: "PDF", y: 2026, sp: "clients" },        // EDL récent
    { n: "b", ci: 2, k: "Factures", x: "Excel", y: 2019, sp: "clients" },       // EDL ancien
    { n: "c", ci: 2, k: "", x: "Word", y: "", sp: "clients" },                  // EDL à classer + sans année
    { n: "Fiche — EDL", ci: 2, k: "", x: "cp|WIRE", y: 2026, sp: "clients", src: "cpwire" }, // dérivé
    { n: "o1", ci: -1, k: "x", x: "PDF", y: 2020, sp: "archives" },             // orphelin
    { n: "o2", ci: -1, k: "y", x: "PDF", y: 2021, sp: "archives" },             // orphelin
    { n: "v", ci: 6, k: "Divers", x: "PDF", y: 2026, sp: "clients" },           // Vinci = hors périmètre
  ];
  const r = analyseCatalogue(docs, { year: 2026, recent: 2 });

  assert.equal(r.total, 7, "total docs");
  assert.equal(r.orphelins, 2, "orphelins ci<0");
  assert.equal(r.horsPerimetre, 1, "docs hors périmètre cp|WIRE (Vinci)");
  assert.equal(r.aClasser, 1, "docs à classer");
  assert.equal(r.sansAnnee, 1, "docs sans année");

  const edl = r.clients.find((c) => c.ci === 2);
  assert.ok(edl, "client EDL présent");
  assert.equal(edl.total, 4, "EDL total");
  assert.equal(edl.derives, 1, "EDL dérivés cp|WIRE");
  assert.equal(edl.dernAnnee, 2026, "EDL dernière année");
  assert.equal(edl.frais, true, "EDL frais (doc 2026)");
  assert.equal(edl.aClasser, 1, "EDL à classer");

  // périmètre : EDL couvert, un dossier non présent doit être marqué absent
  assert.ok(r.portfolio.every((p) => PORTFOLIO_CI.has(p.ci)), "portfolio = périmètre cp|WIRE");
  const tafanel = r.portfolio.find((p) => p.ci === 1);
  assert.equal(tafanel.absent, true, "Tafanel absent du catalogue de test");
});
