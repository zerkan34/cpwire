{
  "_note": "Couche d'accès SANS SECRET. Aucun mot de passe / token / lien de partage ici : ils restent dans le coffre (gestionnaire de mots de passe). On ne stocke que la structure : où se connecter, comment (en mots), les environnements et les contacts.",
  "IMA": {
    "contexte": "Inter Mutuelles Assistance — TMA des périmètres Dataware / MCS sur IBM i. Accès distant via VPN puis intranet de maintenance. Réf. Dolibarr : INTER MUTUELLES ASSISTANCE G.I.E (code 9GIEMU), entité iD INFO · 79000 Niort · tél 05 49 75 75 75.",
    "portail": {
      "nom": "Intranet de maintenance IMA",
      "url": ""
    },
    "connexion": [
      "Ouvrir le VPN (Pulse / Host Checker)",
      "S'authentifier — identifiant + MFA (identifiants dans le coffre)",
      "Accéder à l'intranet de maintenance IMA"
    ],
    "sharepoint": {
      "nom": "SharePoint TMA (NOTOS)",
      "url": ""
    },
    "environnements": [
      "Production",
      "Recette"
    ],
    "contacts": [
      {
        "nom": "Frédérique Crouau",
        "role": "Référente",
        "cote": "Client"
      },
      {
        "nom": "Adrien Quillère",
        "role": "Contact",
        "cote": "Client"
      },
      {
        "nom": "Geoffrey Bourmond",
        "role": "Développeur",
        "cote": "Armonie"
      },
      {
        "nom": "Océane Aimes",
        "role": "Développeuse",
        "cote": "Armonie"
      },
      {
        "nom": "Léo Charrier",
        "role": "Développeur",
        "cote": "Armonie"
      }
    ],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  },
  "EDL": {
    "contexte": "L'école des loisirs — TMA de l'application MAX (abonnements « l'école des max ») sur IBM i, et projet MINIKILI+ (offre enrichie : clubs Minimax+ / Kilimax+ à 11 livres + évolutions du modèle de données). Les commerciaux d'EDL sont les animateurs / animatrices. Développements sur la partition DEV du client. Réf. Dolibarr : L'ECOLE DES LOISIRS (code 9ECOL0), entité iD INFO · 75006 Paris.",
    "portail": {
      "nom": "",
      "url": ""
    },
    "connexion": [],
    "sharepoint": {
      "nom": "SharePoint Armonie — espace projet MINIKILI+ (partagé avec EDL)",
      "url": ""
    },
    "environnements": [
      "Développement — partition DEV du client (172.22.0.44, IBM i V7.3), bibliothèques suffixées « _D » (MAX_D, GENERAL_D…)",
      "Tests fonctionnels — profil TEST_EDL",
      "Tests de chaîne (applicatifs externes GECKO / INTRAMAX) — profil GECO_T",
      "Production",
      "Recette"
    ],
    "contacts": [
      { "nom": "Aline Giron", "role": "Cheffe de projet IT — sponsor / validation des CR", "cote": "Client" },
      { "nom": "Jennifer Salaun", "role": "Cheffe de projet métier", "cote": "Client" },
      { "nom": "Jean-Luc Cardinot", "role": "Analyste-développeur AS/400 (interface Sage) — rattachement à confirmer", "cote": "Client" },
      { "nom": "Hugues Quénioux", "role": "Membre comité de projet", "cote": "Client" },
      { "nom": "Thierry Capot", "role": "Membre comité de projet", "cote": "Client" },
      { "nom": "Laetitia", "role": "Utilisatrice clé — écrans lots & chaîne", "cote": "Client" },
      { "nom": "Guy Routier", "role": "Président de comité de projet", "cote": "Armonie" },
      { "nom": "Mélanie Senebier", "role": "Pilotage projet & comptes rendus", "cote": "Armonie" },
      { "nom": "Lionel Kieffer", "role": "Responsable développement", "cote": "Armonie" },
      { "nom": "Geoffrey Bourmond", "role": "Développeur principal", "cote": "Armonie" },
      { "nom": "Franck Vigier", "role": "Directeur LiteSoft — tiers (webservice)", "cote": "Client" }
    ],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  },
  "TAFANEL": {
    "contexte": "Tafanel — refonte applicative RPG (mode projet). Périmètre piloté via le référentiel + Jira. Réf. Dolibarr : TAFANEL gestion (code 9TAFAN), entité iD INFO · 75018 Paris.",
    "portail": {
      "nom": "",
      "url": ""
    },
    "connexion": [],
    "sharepoint": {
      "nom": "SharePoint TMA (NOTOS)",
      "url": ""
    },
    "environnements": [
      "Production",
      "Recette"
    ],
    "contacts": [
      { "nom": "Fabrice Blain", "role": "Commercial / account manager (réf. Dolibarr)", "cote": "Armonie" }
    ],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  },
  "SEGUREL": {
    "contexte": "Segurel — réécriture / réimplémentation de l'applicatif GLOG sur AS/400 (mode projet) ; inclut un projet Paie / Primes / Gestion des employés. Réf. Dolibarr : ETS SEGUREL & FILS (code 9SEGUR), entité iD INFO · 28500 · tél 02 34 65 01 00.",
    "portail": {
      "nom": "",
      "url": ""
    },
    "connexion": [],
    "sharepoint": {
      "nom": "SharePoint TMA (NOTOS)",
      "url": ""
    },
    "environnements": [
      "Production",
      "Recette"
    ],
    "contacts": [],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  },
  "BELLION": {
    "contexte": "Belmet (groupe Bellion) — refonte du SI de gestion commerciale (projet ERP26). Armonie en MOE + AMOA. Réf. Dolibarr : BELMET (code Belmet) + BELLION Groupe (code Bellion), entité iD INFO · 29480 / 29000 · tél 02 98 28 62 13.",
    "portail": {
      "nom": "",
      "url": ""
    },
    "connexion": [],
    "sharepoint": {
      "nom": "SharePoint TMA (NOTOS)",
      "url": ""
    },
    "environnements": [
      "Production",
      "Recette"
    ],
    "contacts": [
      { "nom": "Guy Routier", "role": "Commercial / account manager (réf. Dolibarr)", "cote": "Armonie" }
    ],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  },
  "DIAPAR": {
    "contexte": "DIAPAR — TMA de la gestion commerciale spécifique (RPG) & finance Anaël sur IBM i. Réf. Dolibarr : DIAPAR (code DIAPAR), entité iD INFO · 91380 Chilly-Mazarin · tél 01 64 54 23 00.",
    "portail": {
      "nom": "",
      "url": ""
    },
    "connexion": [],
    "sharepoint": {
      "nom": "SharePoint TMA (NOTOS)",
      "url": ""
    },
    "environnements": [
      "Production",
      "Recette"
    ],
    "contacts": [],
    "coffre": "Identifiants & mots de passe : gestionnaire de mots de passe.",
    "domaines": []
  }
}