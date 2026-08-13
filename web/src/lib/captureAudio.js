/**
 * captureAudio.js — capture du son qui SORT de l'ordinateur (Teams, Meet, Zoom…)
 * et, en option, du micro, pour transcription en continu.
 *
 * Principe
 *  1. getDisplayMedia({ audio:true }) : le navigateur demande le partage d'écran
 *     ET propose de partager le son du système. C'est ce son-là qui contient la
 *     voix des autres participants.
 *  2. Le micro est mixé par-dessus (sinon la voix de l'utilisateur est absente :
 *     elle ne passe pas par les haut-parleurs).
 *  3. On enregistre par segments COURTS et AUTONOMES : au lieu d'utiliser le
 *     découpage natif de MediaRecorder (qui ne met l'en-tête que dans le premier
 *     morceau, rendant les suivants illisibles seuls), on arrête et relance
 *     l'enregistreur toutes les N secondes. Chaque segment est alors un fichier
 *     audio complet, envoyable tel quel à la transcription.
 *
 * Limites navigateur (à connaître) :
 *  - Chrome / Edge sous Windows : partage de l'écran entier → case
 *    « Partager aussi l'audio du système ». C'est le cas qui marche avec
 *    l'application Teams installée.
 *  - Chrome sous macOS : seul l'audio d'un ONGLET est capturable. Il faut donc
 *    ouvrir Teams dans le navigateur et partager cet onglet.
 *  - Firefox / Safari : pas de capture du son système à ce jour.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (e) {
      /* isTypeSupported absent sur certains navigateurs anciens */
    }
  }
  return '';
}

export function captureSupportee() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia &&
    typeof MediaRecorder !== 'undefined' &&
    pickMime()
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Lecture du segment audio impossible'));
    r.readAsDataURL(blob);
  });
}

/**
 * Démarre la capture.
 *
 * @param {object} opts
 * @param {boolean} opts.avecMicro    mixer le micro (défaut : true)
 * @param {number}  opts.segmentMs    durée d'un segment (défaut : 25000)
 * @param {(seg:{index:number, base64:string, mime:string, debutMs:number, dureeMs:number})=>void} opts.onSegment
 * @param {(niveau:number)=>void} opts.onNiveau   niveau sonore 0→1 (VU-mètre)
 * @param {(err:Error)=>void} opts.onErreur
 * @param {()=>void} opts.onArretExterne  l'utilisateur a coupé le partage depuis la barre du navigateur
 * @returns {Promise<{stop:Function, pause:Function, reprendre:Function, enPause:()=>boolean, aLeMicro:boolean}>}
 */
export async function demarrerCapture(opts = {}) {
  const {
    avecMicro = true,
    segmentMs = 25000,
    onSegment = () => {},
    onNiveau = () => {},
    onErreur = () => {},
    onArretExterne = () => {},
  } = opts;

  const mime = pickMime();
  if (!captureSupportee()) {
    throw new Error(
      "Ce navigateur ne sait pas capturer le son du système. Utilise Chrome ou Edge."
    );
  }

  // 1. Son du système. La vidéo est obligatoire pour que Chrome propose l'audio ;
  //    on la garde active mais on ne l'affiche ni ne l'enregistre.
  const fluxEcran = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  if (fluxEcran.getAudioTracks().length === 0) {
    fluxEcran.getTracks().forEach((t) => t.stop());
    throw new Error(
      "Aucun son partagé. Relance et coche « Partager aussi l'audio du système » (Windows : choisis l'écran entier ; macOS : partage l'onglet Teams)."
    );
  }

  // 2. Micro (voix de l'utilisateur, absente du son système)
  let fluxMicro = null;
  if (avecMicro) {
    try {
      fluxMicro = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      // Micro refusé : on continue avec le seul son système, sans bloquer.
      fluxMicro = null;
      onErreur(
        new Error(
          'Micro indisponible : seule la voix des autres participants sera transcrite.'
        )
      );
    }
  }

  // 3. Mixage
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      /* ignoré : le contexte reprendra au premier geste utilisateur */
    }
  }
  const destination = ctx.createMediaStreamDestination();

  const gainEcran = ctx.createGain();
  gainEcran.gain.value = 1;
  ctx.createMediaStreamSource(fluxEcran).connect(gainEcran).connect(destination);

  if (fluxMicro) {
    const gainMicro = ctx.createGain();
    gainMicro.gain.value = 0.9;
    ctx.createMediaStreamSource(fluxMicro).connect(gainMicro).connect(destination);
  }

  // 4. VU-mètre
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(destination.stream).connect(analyser);
  const tampon = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  let vivant = true;
  const boucleNiveau = () => {
    if (!vivant) return;
    analyser.getByteTimeDomainData(tampon);
    let somme = 0;
    for (let i = 0; i < tampon.length; i++) {
      const v = (tampon[i] - 128) / 128;
      somme += v * v;
    }
    onNiveau(Math.min(1, Math.sqrt(somme / tampon.length) * 3));
    rafId = requestAnimationFrame(boucleNiveau);
  };
  rafId = requestAnimationFrame(boucleNiveau);

  // 5. Boucle de segments autonomes
  const t0 = Date.now();
  let index = 0;
  let enPause = false;
  let arrete = false;
  let recorder = null;
  let minuteur = 0;

  const lancerSegment = () => {
    if (arrete || enPause) return;
    let morceaux = [];
    const debutMs = Date.now() - t0;
    try {
      recorder = new MediaRecorder(
        destination.stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined
      );
    } catch (e) {
      onErreur(new Error("Enregistrement impossible : " + e.message));
      return;
    }
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) morceaux.push(ev.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(morceaux, { type: mime || 'audio/webm' });
      morceaux = [];
      // Un segment quasi vide (silence total, coupure) n'est pas envoyé.
      if (blob.size > 3000) {
        try {
          const base64 = await blobToBase64(blob);
          onSegment({
            index: index++,
            base64,
            mime: mime || 'audio/webm',
            debutMs,
            dureeMs: Date.now() - t0 - debutMs,
          });
        } catch (e) {
          onErreur(e);
        }
      }
      if (!arrete && !enPause) lancerSegment();
    };
    recorder.onerror = (ev) => onErreur(new Error('Enregistreur : ' + (ev.error && ev.error.name)));
    recorder.start();
    minuteur = setTimeout(() => {
      if (recorder && recorder.state === 'recording') recorder.stop();
    }, segmentMs);
  };

  // L'utilisateur peut couper le partage depuis la barre du navigateur.
  fluxEcran.getVideoTracks().forEach((t) => {
    t.onended = () => {
      if (!arrete) {
        arrete = true;
        finaliser();
        onArretExterne();
      }
    };
  });

  function finaliser() {
    vivant = false;
    clearTimeout(minuteur);
    cancelAnimationFrame(rafId);
    try {
      if (recorder && recorder.state === 'recording') recorder.stop();
    } catch (e) {
      /* déjà arrêté */
    }
    fluxEcran.getTracks().forEach((t) => t.stop());
    if (fluxMicro) fluxMicro.getTracks().forEach((t) => t.stop());
    setTimeout(() => {
      try {
        ctx.close();
      } catch (e) {
        /* déjà fermé */
      }
    }, 500);
  }

  lancerSegment();

  return {
    aLeMicro: !!fluxMicro,
    enPause: () => enPause,
    pause() {
      if (arrete || enPause) return;
      enPause = true;
      clearTimeout(minuteur);
      // Le segment en cours est arrêté proprement : il sera transcrit.
      if (recorder && recorder.state === 'recording') recorder.stop();
    },
    reprendre() {
      if (arrete || !enPause) return;
      enPause = false;
      lancerSegment();
    },
    stop() {
      if (arrete) return;
      arrete = true;
      finaliser();
    },
  };
}
