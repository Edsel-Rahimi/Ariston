# 🤖 ربات تلگرام آریستون — فاز D3 (inline · API عمومی · کارت روزانه)

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

## 👑 فاز D3 — اینلاین · API عمومی · کارت روزانهٔ کانال

- **حالت Inline** — در «هر» چتی تایپ کن: `@Ariston_vbot irancell vless` → نتایج زنده درجا؛
  تشخیص خودکار اپراتور (انگلیسی + فارسی: «ایرانسل»، «همراه اول»، …) و پروتکل (vless/trojan/vmess/hy2/tuic)؛
  هر نتیجه با یک لمس، کانفیگ + امضای برند را در چت می‌فرستد (تا ۲۰ نتیجه، کش ۶۰ ثانیه‌ای)
  > ⚠️ یک‌بار برای همیشه: در @BotFather با `/setinline` حالت inline را فعال کن (placeholder مثلاً: `operator protocol…`)
- **API عمومی v1** — فقط-خواندنی، CORS باز، محدودسازی نرم ۱۲۰ درخواست/IP/دقیقه:
  - `GET /api` — مستندات برند
  - `GET /api/v1/stats` — خلاصهٔ آخرین اجرا (منابع، تأخیر، مدال‌ها)
  - `GET /api/v1/configs?tier=gold|silver|all|validated&protocol=vless&operator=irancell&format=json|txt&limit=1..300`
    — `format=txt` یک URI در هر خط = قابل‌استفاده به‌عنوان URL اشتراک در هر کلاینت
  - قانون طلایی سر جایش است: استخرِ اپراتورِ نازک (<۱۰ زنده) → fallback به tier با پرچم صادقانهٔ `operator_fallback: true`
- **کارت روزانهٔ کانال رسمی** — کرون موجود، روزی «یک» پست برند زمان‌بندی‌شده (~۱۳:۰۰ تهران):
  تاریخ شمسی، مدال‌ها، بهترین کانفیگ روز، دکمهٔ Mini App + لینک کارت SVG
  - فعال‌سازی: ربات را ادمین کانال کن، بعد: `GET /setup?key=…&channel=@channelname&lang=fa`
- **`/card.svg`** — کارت ۱۲۰۰×۶۳۰ برند (قیف-A + عدد طلایی + آمار زنده + تاریخ تهران)؛
  قابل امبد در README/شبکه‌های اجتماعی + لینکش در پست روزانه و لندینگ

### مسیرهای ورکر (کامل)

| مسیر | نقش | فاز |
|---|---|---|
| `GET /` | لندینگ برند + لینک‌های API / CARD / DASHBOARD | D1 |
| `GET /setup?key=…` | ثبت وب‌هوک (+ `&channel=@name&lang=fa` برای کانال) | D1/D3 |
| `GET /u/<token>` | اشتراک شخصی | D1 |
| `GET /app` + `/app/api/*` | Mini App و JSON API آن | D2 |
| `GET /api` · `/api/v1/stats` · `/api/v1/configs` | **API عمومی v1** | D3 |
| `GET /card.svg` | **کارت روز برند** | D3 |
| `POST /webhook/<secret>` | آپدیت‌های تلگرام: message · callback_query · **inline_query** | D1–D3 |
| کرون `*/30` | Watchtower + کارت روزانه | D2/D3 |

## 👑 فاز D2 — Mini App + Watchtower

- **Mini App** (`/app`) — داشبورد داخل تلگرام با طراحی برند (تم تاریک + طلای Cinzel):
  - هیرو: شمارندهٔ انیمیشنی کانفیگ‌های طلایی + وضعیت زنده
  - شبکهٔ آمار ۲×۲: سالم · p50 · منابع · آخرین اجرا
  - کارت‌های طلایی با **تلمتری واقعی موتور** از `results.json` (EMA نرخ موفقیت + تأخیر) — لمس = کپی
  - 👍/👎 اعتبارسنجی جمعی (ذخیره در KV، احراز هویت با HMAC-SHA256 روی `initData` تلگرام)
  - اشتراک شخصی داخل اپ (ساخت خودکار پروفایل از هویت تلگرام)
  - i18n ۵ زبانه + RTL خودکار + HapticFeedback + رفرش خودکار هر ۵ دقیقه
- **`/best`** — بلیت طلایی: کم‌تأخیرترین کانفیگ سالم (EMA بالا، تأخیر کم)
- **دکمهٔ منوی تلگرام** — دکمهٔ ≡ ربات مستقیم Mini App را باز می‌کند (`setChatMenuButton`)
- **Watchtower** — کرون هر ۳۰ دقیقه: اگر `generated_at` جدیدی در stats.json بود، به همهٔ کاربران (فهرست `users:index`) اعلان اجرای جدید با دکمهٔ Mini App می‌رود

### مسیرهای ورکر

| مسیر | نقش |
|---|---|
| `GET /app` | Mini App (تک‌فایل HTML، بدون وابستگی) |
| `GET /app/api/stats` | آمار زنده (کش ۵ دقیقه‌ای) |
| `GET /app/api/gold?offset=&limit=` | فهرست طلایی غنی‌شده با EMA/تأخیر |
| `POST /app/api/sub` | لینک اشتراک شخصی (initData-محور) |
| `POST /app/api/feedback` | ثبت 👍/👎 (initData-محور) |

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

## 🗺 جادهٔ ادامه

- ~~**D2**: 🏆 Mini App · Watchtower · 👍/👎 · `/best`~~ ✅
- ~~**D3**: حالت inline · API عمومی · کانال رسمی با کارت روزانه~~ ✅
- **D4 (ایده)**: رأی کاربران ← بازخورد به scoring (بستن حلقهٔ کراود-ولیدیشن) · دامنهٔ سفارشی برای فرار از فیلترینگ workers.dev · پنل ادمین
