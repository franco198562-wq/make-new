# PMB Discord Login

Replace worker.js, app.js, styles.css and schema.sql in your GitHub project.

Cloudflare Worker secrets/variables:
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET (secret)
- DISCORD_BOT_TOKEN (secret)
- DISCORD_REDIRECT_URI = https://YOUR-DOMAIN/api/auth/callback

Discord Developer Portal:
OAuth2 Redirects must contain the exact redirect URI above. Enable the bot and invite it to your server with View Server and View Roles permissions.

Run schema.sql against D1, then deploy the Worker. Owner Discord ID is 1334272703347294210 and automatically has every permission.
