# QULAY AI — Instagram one-click setup

QULAY AI supports Instagram Professional accounts (Business or Creator) through Meta's Instagram API with Instagram Login.

## User experience

Normal users do **not** enter Instagram User ID or Access Token.

They open **Sozlamalar → Integratsiyalar → Instagram → Instagram bilan ulash**, sign in to Instagram/Meta, approve the requested permissions, and return to QULAY AI. The backend resolves the professional account ID, exchanges the authorization code for an access token, attempts to exchange it for a long-lived token, encrypts it, and stores the connection.

Manual `Instagram User ID + Access Token` remains available only under **Qo‘lda ulash / Advanced** as a fallback.

## Meta App configuration

Use a Meta Business app with the Instagram API product enabled. For Instagram Login, configure the OAuth redirect URL exactly as:

`https://<BACKEND_HOST>/api/integrations/instagram/callback`

The app must be allowed to request:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`

Development/test accounts must have the appropriate app/account roles. Production use for external businesses may require Meta App Review / Advanced Access for the requested permissions.

## Render environment

Required for one-click Instagram Business Login:

- `INSTAGRAM_APP_ID` — the Instagram App ID shown in **Instagram → API setup with Instagram login**
- `INSTAGRAM_APP_SECRET` — the matching Instagram App Secret from the same section
- `INSTAGRAM_OAUTH_REDIRECT_URI=https://<BACKEND_HOST>/api/integrations/instagram/callback`
- an effective webhook verify token: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` **or** the already configured `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- an effective 64-hex token encryption key: `INSTAGRAM_TOKEN_ENCRYPTION_KEY` **or** the already configured `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `INSTAGRAM_GRAPH_API_VERSION=v24.0`

Optional endpoint overrides normally remain unset:

- `INSTAGRAM_GRAPH_BASE_URL=https://graph.facebook.com` — legacy/manual Facebook Login flow
- `INSTAGRAM_LOGIN_GRAPH_BASE_URL=https://graph.instagram.com` — one-click Instagram Login flow
- `INSTAGRAM_OAUTH_AUTHORIZATION_URL=https://www.instagram.com/oauth/authorize`
- `INSTAGRAM_OAUTH_TOKEN_URL=https://api.instagram.com/oauth/access_token`
- `INSTAGRAM_OAUTH_LONG_LIVED_TOKEN_URL=https://graph.instagram.com/access_token`

The one-click OAuth flow does **not** fall back to the WhatsApp App ID/Secret because Meta issues a dedicated Instagram App ID/Secret for Business Login. The webhook verify token and encryption key may intentionally reuse the existing WhatsApp values. `INSTAGRAM_OAUTH_REDIRECT_URI` can be derived from the configured Google/Bito backend callback when its URL shape is compatible, but an explicit production value is preferred.

## Webhook

Configure the Meta webhook callback to:

`https://<BACKEND_HOST>/api/integrations/instagram/webhook`

The verify token must equal `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (or the WhatsApp verify token when intentionally shared). QULAY subscribes the connected Instagram professional account to supported message/comment fields when possible.

## Features after connection

- Instagram Direct AI Sales Agent
- Sales replies to comments
- Customer product-image understanding in Direct
- Real post/reel selection by media ID
- Comment → private reply/DM automation
- Optional public comment reply such as `Directga yubordim ✅`
- Duplicate message/comment protection
- Shared Telegram / WhatsApp / Instagram Sales Brain
- Bito live product truth + owner-taught Product Knowledge fallback

## Unpublished Meta app: development comment bridge

Meta may withhold real webhook notifications while the app is not Published. For tester-only development, QULAY can poll recent real comments and route them through the **same** Instagram Sales Brain and duplicate-receipt pipeline:

- `INSTAGRAM_DEV_COMMENT_POLL_ENABLED=true`
- `INSTAGRAM_DEV_COMMENT_POLL_INTERVAL_MS=60000`

Keep this bridge **false** in normal production once Meta webhooks are live. The bridge never stores or logs access tokens/comment text, skips historical comments, and uses the same comment IDs as webhook ingestion so a later webhook delivery is deduplicated.

## AI Chat management

The integration panel intentionally stays compact. The owner can manage Instagram behavior from QULAY AI Chat, for example:

- `Instagram sotuv agentini yoq.`
- `Instagram commentlarni o‘chir.`
- `Oxirgi postimga "promt" deb yozganlarga directga mana bu matnni yubor.`
- `Shu Instagram automationni to‘xtat.`
- `Shu automationni davom ettir.`

QULAY lists real posts/automations first and never invents a media ID or automation ID.
