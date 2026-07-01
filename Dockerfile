# cp|WIRE — image de production avec moteur PDF serveur (WeasyPrint).
# Permet à l'app de générer les PDF à la charte exacte (couverture pleine,
# pied de page numéroté), au lieu de l'impression navigateur.
FROM node:20-slim

# Dépendances système : Python + WeasyPrint (Pango/Cairo/GDK-Pixbuf) + polices.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf2.0-0 libffi-dev \
      fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/*

# WeasyPrint + pyOneNote (extraction OneNote) — pip ; --break-system-packages requis.
RUN pip3 install --no-cache-dir --break-system-packages weasyprint pyOneNote

WORKDIR /app
COPY . .

# Polices Poppins de la charte → disponibles pour WeasyPrint.
# Tolérant : si les .ttf sont absents du contexte, on n'échoue PAS le build (repli DejaVu déjà installé).
RUN mkdir -p /usr/share/fonts/truetype/cpwire \
 && ( cp server/pdf/fonts/*.ttf /usr/share/fonts/truetype/cpwire/ 2>/dev/null \
      && echo "[fonts] Poppins de la charte installées." \
      || echo "[fonts] Poppins absentes de server/pdf/fonts/ — repli DejaVu (PDF hors charte exacte jusqu'à commit des polices)." ) \
 && fc-cache -f

# Build du front puis dépendances serveur.
RUN cd web && npm ci && npm run build
# npm install (pas npm ci) côté serveur : le xlsx corrigé (cf. server/package.json,
# CVE prototype pollution + ReDoS non patchées sur le registre npm) vient du CDN officiel
# SheetJS, donc package-lock.json doit pouvoir se régénérer à ce moment — npm ci refuserait
# un lockfile qui n'a pas encore cette résolution.
RUN cd server && npm install --omit=dev

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
# Render fournit PORT ; le serveur l'écoute déjà (process.env.PORT).
CMD ["node", "server/index.js"]
