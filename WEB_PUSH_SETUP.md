# Web Push — sozlash va tekshirish

Kod qo‘shildi; bu hujjat haqiqiy brauzerda push yetkazilishi sinovdan o‘tdi degani emas.

## Backend / Render

1. Avval yangi Prisma migratsiyalarini alohida staging bazada tekshiring. Production uchun backup tayyorlang. `start:prod` migratsiyani avtomatik bajarishini hisobga oling.
2. O‘zingizning kompyuteringizda backend papkasida **bir marta** `npx web-push generate-vapid-keys --json` bajaring. Natijani chatga/GitHubga yubormang.
3. Render Environment’da quyidagilarni uchalasini birga qo‘shing:

| Nomi | Qiymati |
| --- | --- |
| `WEB_PUSH_SUBJECT` | O‘zingizga tegishli haqiqiy `mailto:` aloqa manzili |
| `WEB_PUSH_PUBLIC_KEY` | Generatsiyadagi `publicKey` |
| `WEB_PUSH_PRIVATE_KEY` | Generatsiyadagi `privateKey`, faqat backendda |

Mavjud Telegram/OpenAI/Google kalitlari va shifrlash sozlamalarini o‘zgartirmang. Yangi VAPID qiymatlarini har deployda qayta generatsiya qilmang. Uchala qiymat yo‘q bo‘lsa push sozlanmagan deb ko‘rsatiladi; qisman sozlash startup validatsiyasidan o‘tmaydi.

## Brauzer

- HTTPS sayt → Sozlamalar → Bildirishnomalar → Web push. Tugma brauzerning haqiqiy ruxsatini so‘raydi.
- Bu switch **joriy qurilma** uchun. Boshqa qurilmada alohida yoqing. Bir akkauntga ko‘pi bilan 10 ta obuna.
- iPhone’da mos iOS versiyasida saytni bosh ekranga o‘rnatib, shu yerdan ochish talab etiladi. Ruxsat va tizimning bildirishnoma/Focus sozlamalarini tekshiring.
- Brauzer yoki OS butunlay to‘xtatilsa, offline yoki Focus cheklovlari bo‘lsa yetkazilish kafolatlanmaydi. Faqat brauzer tabini yopish bilan qurilma o‘chishi bir xil emas.
- Qo‘llab-quvvatlangan push endpointlar: FCM, Mozilla va Apple. Boshqa endpointlar serverning ichki tarmog‘iga so‘rov yuborilishidan himoya uchun rad etiladi.

## Scheduler va Free hosting

Backend ishlab turganda navbat har 15 soniyada tekshiriladi. Hosting uxlaganda Node timer ishlamaydi. Vaqtida eslatish uchun doim ishlaydigan service yoki tashqi scheduler kerak. Tashqi scheduler mavjud `POST /api/internal/notifications/process-due` manzilini backenddagi `NOTIFICATION_CRON_SECRET` qiymati bilan `x-cron-secret` header orqali chaqirishi mumkin. Bu integratsiya ushbu auditda yaratilmagan va productionga so‘rov yuborilmagan.

## Qabul sinovi

1. Pushni yoqing; refreshdan keyin shu qurilmada ON qolishini tekshiring.
2. 2–3 daqiqadan keyinga eslatma yarating. Tabni yoping. Backend faol ekanini tekshiring.
3. Bildirishnoma kelganda bosing — eslatmalar sahifasi ochilsin.
4. Kelajakdagi boshqa eslatmani bekor qiling — push kelmasin.
5. Ikkinchi qurilmada obuna bo‘ling; birinchi qurilmada o‘chirish ikkinchisiga ta’sir qilmasin.
6. Logout qiling — qurilma obunasi uzilsin. Boshqa akkaunt obunani o‘zlashtira olmasin.
7. Ruxsatni rad qilish/server xatosida UI yolg‘ondan ON bo‘lmasin.

Lock-screen matni maxfiy eslatma nomi/summasini oshkor qilmaydi; faqat umumiy bildirishnoma ko‘rinadi. Tarmoq uzilishida yetkazishni mutlaq exactly-once qilish mumkin emas: server qurilma receipt’i, provider topic’i va brauzerdagi so‘nggi 500 ta bildirishnoma ID si takror ko‘rsatishni cheklaydi.

Rasmiy manbalar: [web-push kutubxonasi](https://github.com/web-push-libs/web-push), [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
