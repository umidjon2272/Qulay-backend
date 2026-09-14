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

For the future one-click **Meta Embedded Signup** flow (after Meta business/app verification), also set:

```env
WHATSAPP_APP_ID=<Meta App ID>
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=<Embedded Signup configuration ID>
```

Manual Cloud API connection does **not** require either value. Embedded Signup is shown as ready only when both are configured. A partially entered App ID/config ID must not block backend startup or manual connection.

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

### Current flow: manual Cloud API connection

Until Meta business/app verification for Embedded Signup is complete, QULAY presents a simple **WhatsAppni qanday ulash?** guide and a visible manual form:

1. Open **Sozlamalar → Integratsiyalar → WhatsApp**.
2. Open the guide if needed; it points to Meta Developers → WhatsApp API setup.
3. Copy **Phone Number ID** and **WhatsApp Business Account ID (WABA ID)**.
4. Generate/copy an **Access Token** with the required WhatsApp permissions.
5. Paste the three values into QULAY and click **WhatsAppni ulash**.

The access token is verified against Meta Graph API, encrypted with AES-256-GCM before storage, and never returned to the frontend after connection. A temporary Meta test token can expire; reconnect with a valid token when needed.

### Future flow: Meta Embedded Signup

When both `WHATSAPP_APP_ID` and `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` are configured and Meta verification is complete, QULAY automatically exposes **Meta orqali WhatsAppni ulash**. The user signs in to Meta, selects the business/number, and QULAY exchanges the code server-side. If Embedded Signup is not ready, the non-working button is hidden rather than shown as a dead action.

## 4. Subscription requirement

WhatsApp AI Sales Agent belongs to the **Sales AI** tariff. Connection/test/settings and automatic customer replies require an active Sales AI subscription. If the subscription expires or is downgraded, the saved connection is not deleted, but the sales agent stops replying until the required tariff is active again.

## 5. Sales agent behavior

- Individual inbound sales chats: supported.
- Incoming text: sales-relevance gate prevents replies to clearly unrelated new topics.
- Follow-ups: a sales conversation remains active for one hour so short replies like “20 ta”, “qora rang”, “ha” continue naturally.
- Voice notes: supported up to 60 seconds; QULAY transcribes them, queries customer-safe Bito data if needed, and replies with text.
- Bito exposure: only customer-safe READ data such as catalog, price, stock, discounts/promos, and delivery-related information.
- Internal employees, profit, debt, supplier, internal finance/reporting and write actions are not exposed to external customers.
- Any order/write action remains operator-controlled; customer chat does not silently mutate ERP data.

## 6. WhatsApp messaging window

The sales agent replies to a message the customer has just sent, so free-form replies occur inside the customer service conversation window. Proactive business-initiated messaging outside that window should use approved WhatsApp templates; that is a separate future workflow.
