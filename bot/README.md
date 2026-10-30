# 🤖 ربات تلگرام آریستون — فاز D1 (نسخهٔ MVP)

ربات رسمی آریستون روی **Cloudflare Worker** — بدون سرور، بدون هزینه، بدون توکن در مخزن.

## ⚜️ قوانین طلایی (پیاده‌سازی شده در کد)

| قانون | پیاده‌سازی |
|---|---|
| هرگز کانفیگ مرده تحویل نشود | فقط از فایل‌های شاخهٔ `data` سرو می‌شود (gold / silver / validated = تست‌شده با دو موتور) |
| هرگز عددی خارج از stats.json نمایش داده نشود | `/stats` فقط مقادیر زندهٔ `stats.json` را می‌خواند |
| توکن هرگز وارد مخزن نشود | `BOT_TOKEN` و `WEBHOOK_SECRET` فقط در Worker Secret |

## ✨ قابلیت‌های D1

- **`/start` هوشمند** — زبان از تلگرام حدس زده می‌شود؛ برای کاربر جدید: زبان ← اپراتور ← کلاینت (ذخیره در KV)
- **`/gold`** — ۳ کانفیگ طلایی برتر با صفحه‌بندی (دکمهٔ «سه‌تای بعدی») و کپی یک‌ضربه‌ای
- **`/stats`** — کارت آمار زنده: منابع، کانفیگ یکتا، تست‌شده/سالم، تأخیر p50/میانگین، مدال‌های 🥇🥈🥉
- **`/sub`** — اشتراک شخصی: لینک یکتا (`/u/<token>`) که با هر رفرشِ کلاینت، تازه‌ترین کانفیگ‌های سالمِ فیلترشده بر اساس اپراتور را می‌دهد
- **i18n کامل ۵ زبانه** — فارسی / English / Русский / Türkçe / 中文
- **صفحهٔ برند** — ریشهٔ ورکر با لوگوی قیف-A و دکمهٔ ورود به ربات

### منطق فیلتر اپراتور در اشتراک شخصی

1. اگر برای اپراتور انتخابی فایل `by-operator/<slug>.txt` حداقل ۱۰ کانفیگ داشته باشد → همان سرو می‌شود
2. وگرنه (قانون طلایی!) → **طلایی + نقره** ادغام و بدون تکرار سرو می‌شود
3. اگر آن هم خالی بود → `validated.txt`
4. کاربر با نکتهٔ شفاف «لیست کامل تست‌شده فعال شد» در پیام `/sub` مطلع می‌شود

## 🗂 فایل‌ها

| فایل | نقش |
|---|---|
| `worker.js` | کل ربات — یک فایل، برای پیست در داشبورد Cloudflare |
| `wrangler.toml` | فقط برای دیپلوی CLI |
| `README.md` | همین راهنما |

## 🚀 دیپلوی مسیر A — داشبورد (بدون ترمینال، ~۱۰ دقیقه)

### گام ۱ — ساخت ربات در تلگرام
1. در تلگرام به [@BotFather](https://t.me/BotFather) پیام بده
2. `/newbot` ← اسم (مثلاً `Ariston Proxy`) ← یوزرنیم (مثلاً `AristonProxyBot`)
3. توکن شکل `123456:AAH...` را کپی کن — فقط یک‌بار نمایش داده می‌شود

### گام ۲ — ساخت Worker
1. وارد [dash.cloudflare.com](https://dash.cloudflare.com) شو (حساب رایگان کافی است)
2. **Workers & Pages ← Create ← Create Worker** ← نام `ariston-bot` ← **Deploy**
3. **Edit code** ← همهٔ کد پیش‌فرض را پاک کن ← محتوای `bot/worker.js` را پیست کن ← **Deploy**

### گام ۳ — ساخت KV
1. منوی چپ: **Storage & Databases ← KV ← Create namespace** ← نام `ariston-kv`
2. برگرد به `ariston-bot` ← **Settings ← Bindings ← Add**
3. نوع **KV Namespace** ← Variable name: `KV` ← namespace: `ariston-kv` ← **Deploy**

### گام ۴ — سِکرِت‌ها
در **Settings ← Variables & Secrets ← Add** دو ردیف اضافه کن:

| Type | Name | Value |
|---|---|---|
| Secret | `BOT_TOKEN` | توکن BotFather از گام ۱ |
| Secret | `WEBHOOK_SECRET` | یک رشتهٔ تصادفی طولانی (مثلاً از password generator) |

بعد از هر تغییر: **Deploy**.

### گام ۵ — ثبت وب‌هوک (یک کلیک)
در مرورگر باز کن:

```
https://ariston-bot.<your-subdomain>.workers.dev/setup?key=<WEBHOOK_SECRET>
```

اگر `"webhook_registered": true` دیدی، تمام است ✅ (این مسیر خودش `setWebhook` با `secret_token` را ثبت می‌کند و یوزرنیم ربات را برای صفحهٔ برند ذخیره می‌کند)

### گام ۶ — تست
در تلگرام ربات را استارت کن و این چک‌لیست را رد کن:
- [ ] `/start` ← زبان/اپراتور/کلاینت پرسیده شد؟
- [ ] `/gold` ← سه کانفیگ با دکمهٔ «سه‌تای بعدی»؟
- [ ] `/stats` ← اعداد با آخرین اجرای stats.json یکی است؟
- [ ] `/sub` ← لینک ساخته شد؟ در کلاینت کار می‌کند؟
- [ ] `⚙️ تنظیمات` ← تغییر اپراتور بدون پرسیدن دوبارهٔ کلاینت؟

## 🛠 دیپلوی مسیر B — wrangler CLI

```bash
npm i -g wrangler
wrangler login
wrangler kv namespace create ariston-kv     # id را در wrangler.toml بگذار
wrangler secret put BOT_TOKEN
wrangler secret put WEBHOOK_SECRET
wrangler deploy
curl "https://ariston-bot.<subdomain>.workers.dev/setup?key=<WEBHOOK_SECRET>"
```

## 🔐 امنیت

- توکن فقط در Secret است — هرگز در کد، URL یا لاگ نمی‌آید
- مسیر وب‌هوک شامل `WEBHOOK_SECRET` است **و** هدر `X-Telegram-Bot-Api-Secret-Token` بررسی می‌شود
- `/setup` بدون `key` درست، ۴۰۳ می‌دهد
- در KV فقط `chat_id` و ترجیحات ذخیره می‌شود — نام، شماره یا پیام کاربر هرگز

## 🗺 جادهٔ ادامه (از BOT-RESEARCH.md)

- **D2**: 🏆 Mini App (داشبورد Pages داخل تلگرام) · Watchtower (هشدار اجرای جدید) · 👍/👎 اعتبارسنجی جمعی · `/best` بلیت طلایی کم‌تأخیرترین
- **D3**: حالت inline (`@aristonbot irancell vless`) · API عمومی · کانال رسمی با کارت روزانه
