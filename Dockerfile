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
RUN mkdir -p /usr/share/fonts/truetype/cpwire \
 && cp server/pdf/fonts/*.ttf /usr/share/fonts/truetype/cpwire/ \
 && fc-cache -f

# Build du front puis dépendances serveur.
RUN cd web && npm ci && npm run build
RUN cd server && npm ci --omit=dev

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
# Render fournit PORT ; le serveur l'écoute déjà (process.env.PORT).
CMD ["node", "server/index.js"]
