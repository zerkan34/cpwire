# CPwire — image unique : construit l'interface puis la sert via le serveur Node.
# Contexte de build attendu : le dossier pmo-cockpit/

# 1) Build de l'interface React
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# 2) Serveur Node + interface statique
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./web-dist
ENV WEB_DIST=/app/web-dist
ENV PORT=4000
EXPOSE 4000
CMD ["node", "index.js"]
