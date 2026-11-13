# VeriLogs

Naira shop for SMS numbers, data, airtime and bills. Domain: https://veri-logs.com

## Render

- Build: `npm install && NITRO_PRESET=node-server npm run build`
- Start: `node .output/server/index.mjs`
- Set `DATABASE_URL`, `APP_URL=https://veri-logs.com`, `NODE_VERSION=22`, `NITRO_PRESET=node-server`
- Optional: `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Paystack webhook: `https://veri-logs.com/api/paystack/webhook`  
Google redirect: `https://veri-logs.com/api/google/callback`

Do not commit API keys. Add them only in the Render dashboard.
