import React, { useCallback, useEffect, useRef, useState } from 'react';
import { demarrerCapture, captureSupportee } from '../lib/captureAudio';
import './Reunion.css';

/**
 * Réunion — prise de notes automatique à partir du son de l'ordinateur.
 *
 * Le son sortant (Teams, Meet, Zoom) est capté, découpé en segments courts,
 * transcrit au fil de l'eau, puis synthétisé en compte rendu structuré.
 */

const CLE_BROUILLON = 'cpwire.reunion.brouillon';

function mmss(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

async function poster(url, corps) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(corps),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erreur || 'Erreur ' + r.status);
  return data;
}

export default function Reunion() {
  const [titre, setTitre] = useState('');
  const [client, setClient] = useState('');
  const [avecMicro, setAvecMicro] = useState(true);

  const [etat, setEtat] = useState('pret'); // pret | enregistre | pause
  const [debutLe, setDebutLe] = useState(null);
  const [chrono, setChrono] = useState(0);
  const [niveau, setNiveau] = useState(0);
  const [enAttente, setEnAttente] = useState(0); // segments en cours de transcription
  const [message, setMessage] = useState('');

  const [segments, setSegments] = useState([]); // {index, debutMs, texte}
  const [reperes, setReperes] = useState([]); // {t, type, texte}
  const [saisieRepere, setSaisieRepere] = useState('');

  const [cr, setCr] = useState(null);
  const [crEnCours, setCrEnCours] = useState(false);
  const [sante, setSante] = useState(null);

  const controleur = useRef(null);
  const file = useRef(Promise.resolve());
  const contexte = useRef('');
  const supporte = captureSupportee();

  /* -------- état du moteur et du stockage -------- */
  useEffect(() => {
    fetch('/api/reunion/health', { credentials: 'include' })
      .then((r) => r.json())
      .then(setSante)
      .catch(() => setSante(null));
  }, []);

  /* -------- chrono -------- */
  useEffect(() => {
    if (etat !== 'enregistre' || !debutLe) return undefined;
    const id = setInterval(() => setChrono(Date.now() - debutLe), 1000);
    return () => clearInterval(id);
  }, [etat, debutLe]);

  /* -------- brouillon local, pour ne rien perdre en cas de rafraîchissement -------- */
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || 'null');
      if (b && Array.isArray(b.segments) && b.segments.length) {
        setSegments(b.segments);
        setReperes(b.reperes || []);
        setTitre(b.titre || '');
        setClient(b.client || '');
        setMessage('Brouillon de la dernière séance restauré.');
      }
    } catch (e) {
      /* brouillon illisible : on repart à vide */
    }
  }, []);

  useEffect(() => {
    if (!segments.length && !reperes.length) return;
    try {
      localStorage.setItem(
        CLE_BROUILLON,
        JSON.stringify({ segments, reperes, titre, client })
      );
    } catch (e) {
      /* quota atteint : le brouillon local est simplement ignoré */
    }
  }, [segments, reperes, titre, client]);

  /* -------- transcription d'un segment, en file pour garder l'ordre -------- */
  const traiterSegment = useCallback((seg) => {
    setEnAttente((n) => n + 1);
    file.current = file.current
      .then(async () => {
        try {
          const { texte } = await poster('/api/reunion/transcribe', {
            audio: seg.base64,
            mime: seg.mime,
            contexte: contexte.current,
          });
          if (texte && texte.trim()) {
            contexte.current = (contexte.current + ' ' + texte).slice(-1200);
            setSegments((s) => [...s, { index: seg.index, debutMs: seg.debutMs, texte: texte.trim() }]);
          }
        } catch (e) {
          setMessage('Segment non transcrit : ' + e.message);
        }
      })
      .finally(() => setEnAttente((n) => Math.max(0, n - 1)));
  }, []);

  /* -------- commandes -------- */
  async function demarrer() {
    setMessage('');
    setCr(null);
    try {
      const ctl = await demarrerCapture({
        avecMicro,
        segmentMs: 25000,
        onSegment: traiterSegment,
        onNiveau: setNiveau,
        onErreur: (e) => setMessage(e.message),
        onArretExterne: () => {
          controleur.current = null;
          setEtat('pret');
          setNiveau(0);
          setMessage('Partage du son interrompu. La transcription déjà faite est conservée.');
        },
      });
      controleur.current = ctl;
      setDebutLe(Date.now());
      setChrono(0);
      setEtat('enregistre');
      if (!ctl.aLeMicro) {
        setMessage('Micro non actif : ta propre voix ne sera pas transcrite.');
      }
    } catch (e) {
      setMessage(e.message);
    }
  }

  function basculerPause() {
    const ctl = controleur.current;
    if (!ctl) return;
    if (ctl.enPause()) {
      ctl.reprendre();
      setEtat('enregistre');
    } else {
      ctl.pause();
      setEtat('pause');
    }
  }

  function arreter() {
    if (controleur.current) controleur.current.stop();
    controleur.current = null;
    setEtat('pret');
    setNiveau(0);
  }

  useEffect(() => () => { if (controleur.current) controleur.current.stop(); }, []);

  function poserRepere(type) {
    const texte = saisieRepere.trim();
    if (!texte) return;
    setReperes((r) => [...r, { t: chrono, type, texte }]);
    setSaisieRepere('');
  }

  const transcriptComplet = segments
    .map((s) => `[${mmss(s.debutMs)}] ${s.texte}`)
    .join('\n');

  async function genererCr() {
    if (transcriptComplet.length < 40) {
      setMessage('Transcription encore trop courte.');
      return;
    }
    setCrEnCours(true);
    setMessage('');
    try {
      const data = await poster('/api/reunion/cr', {
        transcript: transcriptComplet,
        titre,
        client,
        date: new Date().toISOString().slice(0, 10),
        reperes,
      });
      setCr(data.cr);
    } catch (e) {
      setMessage('Compte rendu : ' + e.message);
    } finally {
      setCrEnCours(false);
    }
  }

  async function enregistrer() {
    try {
      const rep = await poster('/api/reunion/sessions', {
        titre: titre || 'Réunion sans titre',
        client,
        date: new Date().toISOString().slice(0, 10),
        dureeMs: chrono,
        transcript: transcriptComplet,
        cr,
        reperes,
      });
      setMessage(
        rep.durable
          ? 'Réunion enregistrée dans cp|WIRE.'
          : "Réunion enregistrée, mais le stockage n'est pas durable : télécharge le compte rendu."
      );
    } catch (e) {
      setMessage('Enregistrement : ' + e.message);
    }
  }

  function crEnMarkdown() {
    if (!cr) return transcriptComplet;
    const l = [];
    l.push('# ' + (cr.titre || titre || 'Compte rendu de réunion'));
    if (client) l.push('Dossier : ' + client);
    l.push('Date : ' + new Date().toLocaleDateString('fr-FR'));
    if (Array.isArray(cr.participants) && cr.participants.length)
      l.push('Participants : ' + cr.participants.join(', '));
    if (cr.resume) l.push('\n## Résumé\n' + cr.resume);
    if (Array.isArray(cr.sujets) && cr.sujets.length) {
      l.push('\n## Sujets abordés');
      cr.sujets.forEach((s) => {
        l.push('\n### ' + (s.titre || 'Sujet'));
        (s.points || []).forEach((p) => l.push('- ' + p));
      });
    }
    if (Array.isArray(cr.decisions) && cr.decisions.length) {
      l.push('\n## Décisions');
      cr.decisions.forEach((d) => l.push('- ' + d));
    }
    if (Array.isArray(cr.actions) && cr.actions.length) {
      l.push('\n## Actions');
      cr.actions.forEach((a) =>
        l.push('- ' + a.quoi + (a.qui ? ' — ' + a.qui : '') + (a.quand ? ' — ' + a.quand : ''))
      );
    }
    if (Array.isArray(cr.points_ouverts) && cr.points_ouverts.length) {
      l.push('\n## Points ouverts');
      cr.points_ouverts.forEach((p) => l.push('- ' + p));
    }
    if (Array.isArray(cr.risques) && cr.risques.length) {
      l.push('\n## Risques');
      cr.risques.forEach((p) => l.push('- ' + p));
    }
    return l.join('\n');
  }

  function telecharger() {
    const contenu = crEnMarkdown() + '\n\n---\n\n## Transcription\n\n' + transcriptComplet;
    const blob = new Blob([contenu], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      'CR-' +
      (client ? client.replace(/\s+/g, '-') + '-' : '') +
      new Date().toISOString().slice(0, 10) +
      '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function copier() {
    navigator.clipboard
      .writeText(crEnMarkdown())
      .then(() => setMessage('Compte rendu copié.'))
      .catch(() => setMessage('Copie impossible.'));
  }

  function vider() {
    if (!window.confirm('Effacer la transcription et les repères en cours ?')) return;
    setSegments([]);
    setReperes([]);
    setCr(null);
    contexte.current = '';
    try {
      localStorage.removeItem(CLE_BROUILLON);
    } catch (e) {
      /* rien à nettoyer */
    }
  }

  /* ------------------------------------------------------------------ */

  return (
    <div className="reu">
      <header className="reu-head">
        <div>
          <div className="reu-kick">cp|WIRE · Réunion</div>
          <h1>Prise de notes automatique</h1>
          <p className="reu-sub">
            Capte le son qui sort de ton ordinateur (Teams, Meet, Zoom), le transcrit au fil de
            l&apos;eau et en tire un compte rendu structuré.
          </p>
        </div>
        <div className="reu-head-droite">
        {sante && sante.stockage && (
          <span
            className={'reu-badge ' + (sante.stockage.durable ? 'ok' : 'ko')}
            title={sante.stockage.detail}
          >
            {sante.stockage.durable ? 'Stockage durable' : 'Stockage éphémère'}
          </span>
        )}
        <div className={'reu-etat ' + etat}>
          {etat === 'enregistre' ? 'En cours' : etat === 'pause' ? 'En pause' : 'Prêt'}
        </div>
        </div>
      </header>

      {!supporte && (
        <div className="reu-alerte">
          Ce navigateur ne sait pas capturer le son du système. Ouvre cp|WIRE dans Chrome ou Edge.
        </div>
      )}

      {sante && sante.moteur === false && (
        <div className="reu-alerte">
          Le moteur de transcription n&apos;est pas configuré sur le serveur (clé absente). La
          capture fonctionnera mais aucun texte ne sera produit.
        </div>
      )}

      {sante && sante.stockage && !sante.stockage.durable && (
        <div className="reu-alerte doux">
          Stockage non durable ({sante.stockage.detail}) : les réunions enregistrées seront perdues
          au prochain redéploiement. Pense à télécharger le compte rendu.
        </div>
      )}

      <div className="reu-consigne">
        Préviens les participants avant de lancer l&apos;enregistrement. Une transcription de
        réunion reste une donnée sensible.
      </div>

      <section className="reu-carte">
        <div className="reu-champs">
          <label>
            <span>Intitulé</span>
            <input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="COPROJ Belmet ERP26"
            />
          </label>
          <label>
            <span>Dossier / client</span>
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Belmet"
            />
          </label>
          <label className="reu-check">
            <input
              type="checkbox"
              checked={avecMicro}
              disabled={etat !== 'pret'}
              onChange={(e) => setAvecMicro(e.target.checked)}
            />
            <span>Inclure mon micro</span>
          </label>
        </div>

        <div className="reu-barre">
          {etat === 'pret' ? (
            <button className="reu-btn primaire" onClick={demarrer} disabled={!supporte}>
              Démarrer la capture
            </button>
          ) : (
            <>
              <button className="reu-btn" onClick={basculerPause}>
                {etat === 'pause' ? 'Reprendre' : 'Pause'}
              </button>
              <button className="reu-btn stop" onClick={arreter}>
                Arrêter
              </button>
            </>
          )}

          <div className="reu-vu" aria-hidden="true">
            <div className="reu-vu-jauge" style={{ width: Math.round(niveau * 100) + '%' }} />
          </div>
          <div className="reu-chrono">{mmss(chrono)}</div>
          {enAttente > 0 && (
            <div className="reu-attente">
              {enAttente} segment{enAttente > 1 ? 's' : ''} en transcription
            </div>
          )}
        </div>

        {etat === 'pret' && supporte && (
          <p className="reu-aide">
            Au clic, le navigateur demande quoi partager. Sous Windows, choisis
            <strong> l&apos;écran entier</strong> et coche
            <strong> « Partager aussi l&apos;audio du système »</strong>. Sous macOS, ouvre Teams
            dans un onglet et partage <strong>cet onglet</strong> avec son audio.
          </p>
        )}

        {message && <div className="reu-msg">{message}</div>}
      </section>

      <section className="reu-carte">
        <h2>Repères en séance</h2>
        <div className="reu-repere-saisie">
          <input
            value={saisieRepere}
            onChange={(e) => setSaisieRepere(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') poserRepere('note');
            }}
            placeholder="Noter un point, une décision, une action…"
          />
          <button className="reu-btn mini" onClick={() => poserRepere('décision')}>
            Décision
          </button>
          <button className="reu-btn mini" onClick={() => poserRepere('action')}>
            Action
          </button>
          <button className="reu-btn mini" onClick={() => poserRepere('note')}>
            Note
          </button>
        </div>
        {reperes.length === 0 ? (
          <p className="reu-vide">Aucun repère posé. Ils seront pris en compte dans le CR.</p>
        ) : (
          <ul className="reu-reperes">
            {reperes.map((r, i) => (
              <li key={i}>
                <span className={'reu-tag ' + r.type}>{r.type}</span>
                <span className="reu-t">{mmss(r.t)}</span>
                <span>{r.texte}</span>
                <button
                  className="reu-x"
                  onClick={() => setReperes((l) => l.filter((_, j) => j !== i))}
                  aria-label="Supprimer"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="reu-carte">
        <div className="reu-carte-head">
          <h2>Transcription</h2>
          <span className="reu-compteur">{segments.length} segment{segments.length > 1 ? 's' : ''}</span>
        </div>
        {segments.length === 0 ? (
          <p className="reu-vide">
            Le texte apparaîtra ici, environ trente secondes après le début de la capture.
          </p>
        ) : (
          <div className="reu-transcript">
            {segments.map((s) => (
              <p key={s.index}>
                <span className="reu-t">{mmss(s.debutMs)}</span>
                {s.texte}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="reu-carte">
        <div className="reu-carte-head">
          <h2>Compte rendu</h2>
          <div className="reu-actions">
            <button className="reu-btn primaire" onClick={genererCr} disabled={crEnCours}>
              {crEnCours ? 'Génération…' : 'Générer le compte rendu'}
            </button>
            <button className="reu-btn" onClick={enregistrer} disabled={!segments.length}>
              Enregistrer
            </button>
            <button className="reu-btn" onClick={copier} disabled={!segments.length}>
              Copier
            </button>
            <button className="reu-btn" onClick={telecharger} disabled={!segments.length}>
              Télécharger
            </button>
            <button className="reu-btn discret" onClick={vider} disabled={!segments.length}>
              Vider
            </button>
          </div>
        </div>

        {!cr ? (
          <p className="reu-vide">
            Le compte rendu est produit à partir de la transcription, sans rien y ajouter.
          </p>
        ) : (
          <div className="reu-cr">
            {cr.titre && <h3>{cr.titre}</h3>}
            {cr.resume && <p className="reu-resume">{cr.resume}</p>}

            {Array.isArray(cr.participants) && cr.participants.length > 0 && (
              <p className="reu-part">Participants : {cr.participants.join(', ')}</p>
            )}

            {Array.isArray(cr.sujets) &&
              cr.sujets.map((s, i) => (
                <div key={i} className="reu-bloc">
                  <h4>{s.titre}</h4>
                  <ul>{(s.points || []).map((p, j) => <li key={j}>{p}</li>)}</ul>
                </div>
              ))}

            {Array.isArray(cr.decisions) && cr.decisions.length > 0 && (
              <div className="reu-bloc">
                <h4>Décisions</h4>
                <ul>{cr.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}

            {Array.isArray(cr.actions) && cr.actions.length > 0 && (
              <div className="reu-bloc">
                <h4>Actions</h4>
                <table className="reu-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Porteur</th>
                      <th>Échéance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cr.actions.map((a, i) => (
                      <tr key={i}>
                        <td>{a.quoi}</td>
                        <td>{a.qui || '—'}</td>
                        <td>{a.quand || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {Array.isArray(cr.points_ouverts) && cr.points_ouverts.length > 0 && (
              <div className="reu-bloc">
                <h4>Points ouverts</h4>
                <ul>{cr.points_ouverts.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}

            {Array.isArray(cr.risques) && cr.risques.length > 0 && (
              <div className="reu-bloc">
                <h4>Risques</h4>
                <ul>{cr.risques.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
