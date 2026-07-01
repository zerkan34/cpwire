{
  "name": "pmo-cockpit-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "API du cockpit de pilotage — passerelle sécurisée vers Jira.",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "exceljs": "^4.4.0",
    "express": "^4.19.2",
    "jszip": "^3.10.1",
    "mammoth": "^1.12.0",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^2.4.5",
    "pg": "^8.21.0",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  }
}
