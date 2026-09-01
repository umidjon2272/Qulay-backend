# Qulay AI yangilanishi — 2026-09-01

## Kiritilgan o‘zgarishlar

- Agent foydalanuvchining haqiqiy vaqt zonasi va bugungi sanani oladi. `500 min`, `500ming`, `500k`, `yarim mln`, `bugun`, `kecha`, `01.09.2026` kabi ajratilgan moliya maydonlari backendda normalizatsiya qilinadi; boshqa xatoli yozuv va nutqni tushunish model zimmasida.
- Agent oxirgi suhbat xabarlari va oldingi tool natijalarini oladi. Umumiy savollar, maslahat, tarjima va biznes tahliliga javob berishi ko‘rsatildi. Moliya tahlilida haqiqiy yozuvlardan foydalanadi.
- Muhim write tool avval tayyorlanadi. Tasdiqlash kartasi bir marta ko‘rsatiladi; tugma yoki alohida `ha` / `xo‘p` tasdiqlaydi. `ha, lekin ...` tuzatish sifatida modelga beriladi. Tuzatilgan taklif oldingisini bekor qiladi. Sana va summa tasdiqlashgacha o‘zgarmaydigan payloadga saqlanadi.
- Bir vaqtning o‘zidagi tasdiqlar atomik holat almashuvi bilan himoyalangan. Bajarilgan amal takroran bajarilmaydi. Paketdagi ayrim qadamlar bajarilib, keyingisi xato qilsa, natija qisman bajarilgan deb qaytadi va paket avtomatik takrorlanmaydi.
- Xotira yoqilgan bo‘lsa, foydalanuvchi aniq aytgan barqaror faktlar (masalan Akmal — sherigi, Sardor — marketologi) alohida kalitlarda saqlanadi. Xotirani qidirish, tuzatish va tasdiq bilan unutish mavjud. Bu foydalanuvchi doirasidagi xotira; kompaniyalararo umumiy xotira yoki yangi jamoa ruxsatlari qo‘shilmadi.
- `/api/ai/voice/transcribe` ovozni matnga, `/api/ai/voice/speak` matnni ovozga aylantiradi. JWT va tarif tekshiruvi bor. Ovoz transkripti oddiy chat bilan bir agentga yuboriladi. Transkripsiya davomiyligi klient yuborgan chegaralangan qiymatga, TTS sarfi esa taxminiy davomiylikka asoslanadi; tarif hisobi audioning serverda aniq davomiyligini o‘lchamaydi.
- Telegram telefon kodi oqimi mavjud pending sessiyani qayta ishlatadi; AUTH_RESTART bir marta qayta uriniladi. Frontend kodning Telegram/app, SMS, email yoki boshqa kanalini, keyingi kanalni va kutish vaqtini ko‘rsatadi. Mos kelmagan email/Firebase jarayonida QR orqali ulanishga yo‘l ko‘rsatadi.
- Frontendda backend yaratgan conversationId saqlanadi, takroriy USER yozuvlari yo‘qotildi, local chat keshining egasi tekshiriladi. API so‘rovini bekor qilish va audio multipart yuborish tuzatildi.
- AI sahifasida asosiy menyu ingichka ikonka paneliga yig‘iladi. Tezkor amallar va tarix alohida yopiladigan bitta panelda. Chat kengligi, matn o‘qilishi va composer yangilandi; Markdown va jadvallar to‘g‘ri ko‘rsatiladi. Mobil scroll qoidalari saqlandi.

## Ishga tushirish

Backend va frontendni birga yangilang. Har biri alohida git repo bo‘lib qolgan; `.git` fayllari original arxivdagidek saqlangan. Hech narsa commit yoki push qilinmadi. `node_modules` ZIPga kiritilmagan; asl arxivlarda bo‘lgan `dist` yangi build bilan almashtirilgan.

Yuborilgan ZIPlarda haqiqiy `.env` yo‘q edi, faqat `.env.example` bor. Serveringizdagi amaldagi maxfiy sozlamalarni saqlang.

Backend (package.json Node 22.x talab qiladi):

```sh
npm ci
npm run prisma:generate
npm run build
npm start
```

Mavjud DATABASE_URL, JWT, FRONTEND_URL, OPENAI_API_KEY va kerak bo‘lsa Telegram sozlamalari ishlatiladi. Ovoz uchun shu OPENAI_API_KEY ishlatiladi. Yangi ixtiyoriy sozlamalar:

```dotenv
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
```

Yangi Prisma schema/migratsiya qo‘shilmadi; mavjud migratsiyalar saqlangan. Mavjud `npm start` odatdagidek `prisma migrate deploy` bajaradi.

Frontend:

```sh
npm ci
npm run build
```

Amaldagi VITE_API_URL backendning `/api` manziliga qarasin. Mikrofon uchun brauzer ruxsati va HTTPS (lokalda localhost) kerak. Ovozli javob sifati tanlangan model va tilga bog‘liq.

## Tekshiruv va cheklovlar

Unit/regression testlar va ikkala production build tekshirildi. Natija: backend — 33 suite, 223 test; frontend — 13 suite, 65 test. Ikkalasida ham build va lint muvaffaqiyatli. Mavjud frontend lint ogohlantirishlari Fast Refresh eksportlari va TopBar useMemo dependency bilan bog‘liq; lint xatosi yo‘q. Frontend asosiy build chunki 500 kBdan katta ekani haqida ogohlantirish bor.

Real PostgreSQL, OpenAI yoki Telegram akkaunti bilan end-to-end sinov bajarilmadi: haqiqiy ulanish sozlamalari yuklamada yo‘q. Tool, audio va Telegram testlari mock adapterlar bilan bajarildi. Brauzer preview muhitida lokal sahifa ochilishi bloklandi; shu sabab yangi dizayn real brauzer screenshot bilan tasdiqlanmadi. Testlar barcha erkin iboralarni model har doim to‘g‘ri tushunishini kafolatlamaydi.

Telegram kod kanalini Telegram tanlaydi. Kod doim SMS bo‘lib kelishini ushbu o‘zgarish kafolatlamaydi: https://core.telegram.org/api/auth

## Serverda tekshirish uchun qisqa ssenariylar

1. `bugunga 500 min som daromad qush` → bitta summa/sana ko‘rsatilgan karta → tasdiqlash → Moliyada aynan bitta yozuv. Yana o‘sha tasdiqni yuborish yozuvni ko‘paytirmasin.
2. `600 ming bo‘lsin` deb taklifni tuzating: yangi karta chiqqach eskisi bajarilmasin. `ha, lekin Sardorga yuborma` tasdiq sifatida olinmasin.
3. `Sherigim Akmal, marketologim Sardor` → xotira yoqilgan holda saqlansin; boshqa suhbatda kimligini so‘rang; `Sardor endi marketolog emas` bilan tuzating. Boshqa akkauntda bu xotira ko‘rinmasin.
4. Ovozli rejimda moliya yoki xabar buyrug‘i ayting, kartani ko‘ring, tasdiqlang, ovozli natijani eshiting. Mikrofonni yopganda yozish to‘xtasin.
5. Telegram telefon oqimida ko‘rsatilgan kanalni tekshiring. Kutish muddati tugamasdan resend bosilmasin; modalni qayta ochganda pending holat davom etsin. QR oqimini ham tekshiring.
6. Desktopda asosiy menyu va AI panelini yig‘ing/oching; mobil ekranda klaviatura bilan yozish, tarix va scrollni tekshiring. Sahifani yangilab o‘sha suhbat davom etishini sinang.
