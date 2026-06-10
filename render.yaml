# Blueprint Render — déploiement en quelques clics.
# Sur https://render.com : New + > Blueprint > connecte ton dépôt > Render lit ce fichier.
# Renseigne ensuite les variables marquées "sync: false" dans le tableau de bord (elles
# restent privées et ne sont jamais committées).
services:
  - type: web
    name: cpwire
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    plan: free
    healthCheckPath: /api/health
    envVars:
      - key: AUTH_EMAIL
        sync: false
      - key: AUTH_PASSWORD
        sync: false
      - key: JIRA_BASE_URL
        sync: false
      - key: JIRA_EMAIL
        sync: false
      - key: JIRA_API_TOKEN
        sync: false
      - key: ME
        value: Nicolas Durand
      - key: TARGET_DONE
        value: Terminé
      - key: PROJECTS
        value: TEDL,PEM,TDSS,PDFP,TMT,PTAF,TBEL,TBAL,PBAL,TIMA,PIMA,PIMA2,TDIA
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: CACHE_MINUTES
        value: "15"
