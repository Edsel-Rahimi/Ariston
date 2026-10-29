# راهنمای فعال‌سازی اعلان و آینه (فاز ۳ — اختیاری)

هر دو قابلیتِ این راهنما به‌صورت پیش‌فرض **خاموش** هستند و تا وقتی Secret های مربوطه را نسازی، هیچ اثری در اجرای خودکار ندارند. هر وقت بخواهی، با ۵ دقیقه تنظیم روشنشان می‌کنی — یا خودت این صفحه را دنبال کن.

---

## ۱. اعلان تلگرام

بعد از هر اجرای ساعتی، یک پیام کوتاه با خلاصه‌ی آمار (تعداد سالم‌ها، طلاها، میانه تأخیر) برایت می‌آید.

### قدم‌به‌قدم

1. در تلگرام به [@BotFather](https://t.me/BotFather) پیام بده و `/newbot` بزن؛ یک نام ساده بده (مثلاً `AristonNotifyBot` — از کلمات حساس استفاده نکن).
2. توکنی که BotFather می‌دهد (شکل `123456:AA...`) را کپی کن.
3. برای پیدا کردن `chat_id`: به [@userinfobot](https://t.me/userinfobot) پیام «hi» بده؛ عدد `Id` همان chat_id توست.
4. در گیت‌هاب برو به: **repo → Settings → Secrets and variables → Actions → New repository secret** و دو Secret بساز:
   - `TG_BOT_TOKEN` ← توکن BotFather
   - `TG_CHAT_ID` ← عددی که از userinfobot گرفتی
5. تمام — از اجرای بعدی (حداکثر ۱ ساعت بعد) پیام می‌گیری.

> ⚠️ اگر روزی خواستی متوقفش کنی، فقط دو Secret را پاک کن؛ هیچ کد دیگری لازم نیست تغییر کند.

---

## ۲. آینه (Mirror) روی GitLab یا Codeberg

شاخه‌ی `data` بعد از هر اجرا به یک remote اضافه‌ی دلخواه هم force-push می‌شود — نسخه‌ی پشتیبان خارج از گیت‌هاب و در دسترس‌تر برای کاربران.

### گزینه‌ی الف: Codeberg (ساده‌ترین)

1. در codeberg.org حساب بساز و یک مخزن خالی (مثلاً `ariston`) ایجاد کن.
2. از **Settings → Applications → Generate New Token** با فقط مجوز `write:repository` یک توکن بساز.
3. در گیت‌هاب: repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `MIRROR_URL` ← این مقدار:
     ```
     https://USERNAME:TOKEN@codeberg.org/USERNAME/ariston.git
     ```

### گزینه‌ی ب: GitLab

1. در gitlab.com مخزن خالی بساز.
2. از **Settings → Access Tokens** توکنی با مجوز `write_repository` بساز.
3. همان Secret بالا با این شکل:
   ```
   https://oauth2:TOKEN@gitlab.com/USERNAME/ariston.git
   ```

> 💡 جایگزین بدون Secret: هر دو سرویس «Pull Mirror» هم دارند — مخزن عمومی گیت‌هاب را با آدرس `https://github.com/Edsel-Rahimi/Ariston.git` به‌عنوان مبدأ ایمپورت کن و mirroring را فعال بگذار؛ آن‌ها خودشان هر چند دقیقه می‌کشند و به Secret روی گیت‌هاب نیازی نیست.

> 🔐 امنیت: توکن آینه فقط مجوز نوشتنِ همان مخزن را داشته باشد و تاریخ انقضای کوتاه بزن — همان قانون توکن‌های گیت‌هاب.

---

## چه چیزی push می‌شود؟

فقط شاخه‌ی `data` (فایل‌های داده: `nodes.txt`، `gold.txt`، کانفیگ‌های کلاینت، `by-operator/` و…) — نه شاخه‌ی `main`. تاریخچه در مقصد هم تک‌کامیت می‌ماند.
