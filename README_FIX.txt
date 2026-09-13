QULAY backend WhatsApp runtime fix

Bu patch 2 ta muammoni tuzatadi:
1) NestJS circular dependency:
   AiAgentModule -> AIToolsModule -> BriefingModule -> IntegrationsHealthModule -> WhatsAppModule -> AiAgentModule
   IntegrationsHealth endi WhatsAppModule'ni import qilmaydi; WhatsApp statusini Prisma orqali o'qiydi.
2) WhatsApp voice upload type mismatch:
   media.mimeType -> VoiceUpload.mimetype adapter qo'shildi.

Qo'llash:
- ZIP ichidagi src papkani mavjud backend papkangiz ustiga ko'chiring.
- .git papkangizga tegmang.
- Keyin:
  npm run prisma:generate
  npm run build
  git add .
  git commit -m "fix whatsapp runtime circular dependency"
  git push origin main
