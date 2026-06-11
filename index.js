// stt.js — transcription audio. Utilise un service Whisper si OPENAI_API_KEY est défini.
// Sans clé, renvoie une erreur claire invitant à coller la transcription manuellement.
const KEY = process.env.OPENAI_API_KEY || "";
const STT_URL = process.env.STT_URL || "https://api.openai.com/v1/audio/transcriptions";
const STT_MODEL = process.env.STT_MODEL || "whisper-1";

export function sttAvailable() { return Boolean(KEY); }

export async function transcribe(buffer, filename = "audio.webm", mime = "audio/webm") {
  if (!KEY) {
    throw new Error("Transcription non configurée (OPENAI_API_KEY absent). Colle la transcription manuellement, ou ajoute une clé.");
  }
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), filename);
  form.append("model", STT_MODEL);
  form.append("language", "fr");
  const res = await fetch(STT_URL, { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (!res.ok) throw new Error(`Transcription échouée (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.text || "";
}
