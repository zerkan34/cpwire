# ============ CPwire — configuration serveur ============

# ---- Authentification (page de login) ----
AUTH_EMAIL=nikkodurand@gmail.com
AUTH_PASSWORD=Petitpomelo!!!

# ---- Accès Jira Cloud (jeton côté serveur uniquement) ----
JIRA_BASE_URL=https://armonie.atlassian.net
JIRA_EMAIL=nikkodurand@gmail.com
JIRA_API_TOKEN=colle_ton_jeton_ici

# ---- Toi (surlignage de tes tickets) ----
ME=Nicolas Durand
TARGET_DONE=Terminé

# ---- Les 7 dossiers : mets ICI les clés exactes de tes projets Jira ----
# Vérifie chaque clé dans Jira (Projet > Paramètres). Balas n'a peut-être pas encore de projet.
PROJECTS=TEDL,TDSS,TIMA,TDIA,PTAF,ERP26
# Import EXHAUSTIF par défaut (tous les tickets). Pour restreindre, décommente :
# JQL=project in (TEDL,TDSS,TIMA,TDIA,PTAF,ERP26) ORDER BY created ASC

# ---- IA (rédaction des CR) — optionnel ----
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-4-6

# ---- Transcription audio (réunions) — optionnel ----
OPENAI_API_KEY=

# ---- Réglages ----
PORT=4000
CACHE_MINUTES=15
# Mettre 1 UNIQUEMENT pour tester sans Jira (données fictives). Laisser vide en réel.
ALLOW_DEMO=

# ---- Microsoft 365 (Outlook + SharePoint) — OPTIONNEL ----
# Nécessite une app Azure AD (Entra) avec permissions Graph Mail.Send & Sites.ReadWrite.All.
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_SENDER=
SP_SITE_ID=
SP_DRIVE_ID=
