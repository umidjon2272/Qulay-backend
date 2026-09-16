# QULAY AI — Instagram setup

QULAY AI Instagram integration is built for an Instagram Professional account connected through Meta Graph API.

## Render environment

Instagram can reuse the same Meta App security values already used by WhatsApp. If you want separate values, set:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY` — 64 hex characters / 32 bytes
- `INSTAGRAM_GRAPH_API_VERSION` — defaults to `v24.0`

If the dedicated Instagram secret / verify token / encryption key are not set, the backend falls back to the existing `WHATSAPP_*` equivalents.

## Webhook

Configure the Meta webhook callback to:

`https://<BACKEND_HOST>/api/integrations/instagram/webhook`

The verify token must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (or the reused WhatsApp verify token).

The app/account must be allowed to receive Instagram messaging and comment webhook events. QULAY subscribes the connected professional account to supported `messages` / `comments` fields when possible.

## Connect in QULAY AI

Open **Sozlamalar → Integratsiyalar → Instagram** and provide:

1. Instagram Professional User ID
2. A valid Meta access token that can read that Instagram account and use the enabled messaging/comment capabilities

The token is encrypted on the backend and is never returned to the frontend after connection.

## Features

- Instagram Direct AI Sales Agent
- Sales replies to comments
- Product-image understanding in Direct
- Comment → private reply/DM automation per real post/reel media ID
- Optional public comment reply such as `Directga yubordim ✅`
- Duplicate comment/message protection
- Shared Telegram / WhatsApp / Instagram Sales Brain
- Bito live product truth + owner-taught Product Knowledge fallback

## Owner AI chat examples

Teach a product that is not in Bito:

`Bizda iPhone 13 Pro 128GB qora bor, narxi 4 800 000 so'm. Mijoz so'rasa ayt, saqlab qo'y.`

Create an automation conversationally:

`Oxirgi Instagram postimga "promt" deb yozganlarga directga mana bu matnni yubor: ... Commentga ham "Directga yubordim ✅" deb yoz.`

QULAY first loads real Instagram posts; it does not invent a media ID. Future automatic external messaging is prepared through the normal confirmation flow.
