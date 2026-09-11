# QULAY AI — WhatsApp Cloud API setup

QULAY uses Meta's official WhatsApp Cloud API. The integration is intentionally limited to **individual WhatsApp conversations** because the official Cloud API currently addresses recipients as `individual`; unofficial WhatsApp Web group bots are not used.

## 1. Render environment variables

Set these on the backend service:

```env
WHATSAPP_APP_SECRET=<Meta App Secret>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<your own random secret, 16+ chars>
WHATSAPP_TOKEN_ENCRYPTION_KEY=<64 hex chars>
WHATSAPP_GRAPH_API_VERSION=v24.0
```

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate the webhook verify token (example):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Do not paste production secrets into source control.

## 2. Meta webhook

Production callback URL:

```text
https://qulay-backend-y98j.onrender.com/api/integrations/whatsapp/webhook
```

Use the exact value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` as the Meta webhook verification token.
Subscribe the WhatsApp Business Account to the `messages` webhook field.

POST webhook requests are verified with Meta's `X-Hub-Signature-256` HMAC using `WHATSAPP_APP_SECRET`.

## 3. QULAY Integrations screen

Open **Sozlamalar → Integratsiyalar → WhatsApp** and provide:

- Phone Number ID
- WhatsApp Business Account ID (WABA ID) — recommended
- Access Token with the required WhatsApp permissions

The access token is encrypted with AES-256-GCM before it is stored. It is never returned to the frontend after connection.

If the token also has WhatsApp Business Management permission, QULAY attempts to subscribe the WABA automatically. Otherwise configure the webhook subscription once in Meta.

## 4. Sales agent behavior

- Individual inbound sales chats: supported.
- Incoming text: sales-relevance gate prevents replies to clearly unrelated new topics.
- Follow-ups: a sales conversation remains active for one hour so short replies like “20 ta”, “qora rang”, “ha” continue naturally.
- Voice notes: supported up to 60 seconds; QULAY transcribes them, queries customer-safe Bito data if needed, and replies with text.
- Bito exposure: only customer-safe READ data such as catalog, price, stock, discounts/promos, and delivery-related information.
- Internal employees, profit, debt, supplier, internal finance/reporting and write actions are not exposed to external customers.
- Any order/write action remains operator-controlled; customer chat does not silently mutate ERP data.

## 5. WhatsApp messaging window

The sales agent replies to a message the customer has just sent, so free-form replies occur inside the customer service conversation window. Proactive business-initiated messaging outside that window should use approved WhatsApp templates; that is a separate future workflow.
