/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARISTON — Telegram Bot · D8.0 — single-sub mode switch · bank resurrection
 *             · admin panel phase 1 (pipeline + notifications) · UX pack
 *             (QR · filters · favorites ⭐ · light/dark · operator chips)
 *  Cloudflare Worker (single file, dashboard-deployable) · webhook + KV
 *
 *  Golden rules (from BOT-RESEARCH.md):
 *    1) NEVER deliver dead configs      → we only proxy files from the data
 *       branch (gold / silver / validated are already engine-tested).
 *    2) NEVER show a number that does   → /stats renders only values read
 *       not come from stats.json           from stats.json at runtime.
 *    3) Token never enters the repo     → BOT_TOKEN & WEBHOOK_SECRET live in
 *       Worker Secrets only.
 *
 *  Routes:
 *    POST /webhook/<WEBHOOK_SECRET>   Telegram updates (verified header)
 *    GET  /setup?key=<WEBHOOK_SECRET> one-click setWebhook + self test
 *         (&channel=@name&lang=fa → register the official channel)
 *    GET  /u/<token>                  personal subscription (auto-refresh)
 *    GET  /app                        Mini App (D2)
 *    GET  /api · /api/v1/stats · /api/v1/configs   public API v1 (D3)
 *    GET  /card.svg                   brand “card of the day” (D3)
 *    GET  /card.png                   same card rasterized → postable photo (D4)
 *    GET  /                           brand landing page
 *
 *  D3 features:
 *    · Inline mode — @bot irancell vless in ANY chat → live results
 *    · Public read-only API for developers (CORS + best-effort rate limit)
 *    · Daily channel card — one branded post per day (+ shareable SVG)
 *
 *  Required bindings:
 *    KV  (KV namespace)          — user profiles, sub tokens, data cache
 *  Secrets:
 *    BOT_TOKEN, WEBHOOK_SECRET
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = 'Edsel-Rahimi/Ariston';
const RAW = 'https://raw.githubusercontent.com/' + REPO + '/data/';
const CDN = 'https://cdn.jsdelivr.net/gh/' + REPO + '@data/';
const PAGES = 'https://edsel-rahimi.github.io/Ariston/';

const FILE_TTL_SEC = 600;   // data-branch file cache (KV)
const STATS_TTL_SEC = 120;  // stats.json cache (KV) — D10.1/B2: short, the run timestamp must track the live run
const SUB_MAX_LINES = 300;  // cap subscription size
const SUB_MIN_OP_LINES = 10; // operator file below this → fall back to gold+silver
const API_RATE_LIMIT = 120; // public API: best-effort requests / IP / minute
const INLINE_MAX = 20;      // inline query result count
const SUB_ALLOCATION = 10;  // D4: personalized picks per user per rotation period
const BRAND = 'Ariston';    // remark brand: <name>-Ariston-<ping>ms
const CHANNEL_USER = 'Ariston_CH'; // official public channel (forced join)
const REF_BASE = SUB_ALLOCATION; // starting personal quota
const REF_CAP = 20;         // hard quota cap, reached via referrals (plan B: escalating)

/* ─────────────────────────────── catalogs ─────────────────────────────────── */

const LANG_META = {
  fa: 'فارسی 🇮🇷', en: 'English 🇬🇧', ru: 'Русский 🇷🇺', tr: 'Türkçe 🇹🇷', zh: '中文 🇨🇳',
};

const ISP_META = {
  irancell: { fa: 'ایرانسل', en: 'Irancell' },
  mci:      { fa: 'همراه اول', en: 'MCI (Hamrah Aval)' },
  rightel:  { fa: 'رایتل', en: 'Rightel' },
  shatel:   { fa: 'شاتل', en: 'Shatel' },
  asiatech: { fa: 'آسیاتک', en: 'Asiatech' },
  tci:      { fa: 'مخابرات (TCI)', en: 'TCI' },
  other:    { fa: '🌍 سایر / همه', en: '🌍 Other / All' },
};

const CLIENT_META = {
  v2rayng:  { fa: 'v2rayNG', en: 'v2rayNG' },
  hiddify:  { fa: 'Hiddify', en: 'Hiddify' },
  streisand:{ fa: 'Streisand (iOS)', en: 'Streisand (iOS)' },
  singbox:  { fa: 'sing-box / NekoBox', en: 'sing-box / NekoBox' },
  other:    { fa: 'سایر', en: 'Other' },
};

const ISP_ORDER = ['irancell', 'mci', 'rightel', 'shatel', 'asiatech', 'tci', 'other'];
const CLIENT_ORDER = ['v2rayng', 'hiddify', 'streisand', 'singbox', 'other'];

/* how-to import the personal sub, per client × language */
const HOWTO = {
  v2rayng: {
    fa: 'توی v2rayNG برو به «اشتراک‌ها» ← + ← «وارد کردن از کلیپ‌بورد» (یا URL) ← لینک رو پیست کن ← ذخیره. آخرشم «به‌روزرسانی اشتراک» رو بزن.',
    en: 'v2rayNG → Subscriptions → + → Import from clipboard/URL → paste the link → Save → Update subscription.',
    ru: 'v2rayNG → Подписки → + → Импорт из буфера/URL → вставить ссылку → Сохранить → Обновить подписку.',
    tr: 'v2rayNG → Abonelikler → + → Panodan/URL\'den içe aktar → bağlantıyı yapıştır → Kaydet → Aboneliği güncelle.',
    zh: 'v2rayNG → 订阅分组 → + → 从剪贴板/URL 导入 → 粘贴链接 → 保存 → 更新订阅。',
  },
  hiddify: {
    fa: 'توی Hiddify روی «افزودن پروفایل» بزن ← از کلیپ‌بورد یا لینک ← لینک رو پیست کن ← ذخیره.',
    en: 'Hiddify → Add profile → From clipboard / URL → paste the link → Save.',
    ru: 'Hiddify → Добавить профиль → Из буфера / URL → вставить ссылку → Сохранить.',
    tr: 'Hiddify → Profil ekle → Panodan / URL\'den → bağlantıyı yapıştır → Kaydet.',
    zh: 'Hiddify → 添加配置 → 从剪贴板 / URL → 粘贴链接 → 保存。',
  },
  streisand: {
    fa: 'توی Streisand روی + بزن ← «افزودن اشتراک» ← لینک رو پیست کن ← ذخیره.',
    en: 'Streisand → + → Add subscription → paste the link → Save.',
    ru: 'Streisand → + → Добавить подписку → вставить ссылку → Сохранить.',
    tr: 'Streisand → + → Abonelik ekle → bağlantıyı yapıştır → Kaydet.',
    zh: 'Streisand → + → 添加订阅 → 粘贴链接 → 保存。',
  },
  singbox: {
    fa: 'sing-box خالص فقط فایل JSON قبول می‌کنه. ساده‌ترین راه اینه که از Hiddify یا NekoBox استفاده کنی (هر دو هستهٔ sing-box دارن) و همین لینک اشتراک رو توشون وارد کنی.',
    en: 'Plain sing-box only accepts JSON files; easiest path: Hiddify or NekoBox (both run the sing-box core) with this same subscription link.',
    ru: 'Чистый sing-box принимает только JSON; проще всего: Hiddify или NekoBox (ядро sing-box) с этой же ссылкой.',
    tr: 'Saf sing-box yalnızca JSON kabul eder; en kolay yol: Hiddify veya NekoBox (sing-box çekirdeği) ve aynı abonelik bağlantısı.',
    zh: '原生 sing-box 只接受 JSON；最简单的方式：使用 Hiddify 或 NekoBox（sing-box 内核）导入同一订阅链接。',
  },
  other: {
    fa: 'لینک رو توی بخش Subscription (اشتراک) یا Profile اپت پیست کن.',
    en: 'Paste the link into your client\'s Subscription / profile section.',
    ru: 'Вставьте ссылку в раздел «Подписка» вашего клиента.',
    tr: 'Bağlantıyı istemcinizin Abonelik / profil bölümüne yapıştırın.',
    zh: '将链接粘贴到客户端的「订阅 / 配置」区域。',
  },
};

/* ───────────────────────────────── i18n ───────────────────────────────────── */

const T = {
  fa: {
    start_new: '👑 سلام! به آریستون خوش اومدی\n\nآریستون هر نیم‌ساعت هزاران کانفیگ عمومی جمع می‌کنه، با دو موتور xray-core و sing-box امتحانشون می‌کنه و فقط اونایی که واقعاً کار می‌کنن رو بهت می‌ده.\n\n⬇️ قبل از شروع، چندتا سؤال کوتاه:',
    pick_lang: '🌐 زبانت رو انتخاب کن:',
    pick_isp: '📡 اینترنتت از کدوم اپراتوره؟\nاشتراکت رو بر همین اساس فیلتر می‌کنم.',
    pick_client: '📱 با کدوم اپ وصل می‌شی؟\nمی‌پرسم که بتونم دقیق بگم چطور واردش کنی.',
    setup_done: '✅ همه‌چی آماده‌ست! تنظیماتت ذخیره شد.\n\nاز منو یه سر به «🏆 طلایی‌ها» بزن.',
    menu_title: 'چی لازم داری؟ از منو انتخاب کن 👇',
    menu_fallback: 'متوجه نشدم 🙈 از منوی پایین انتخاب کن:',
    gold_page: '🏆 <b>طلایی‌ها {a}–{b}</b> از {n} — بهترین‌های آخرین دور تست',
    gold_empty: 'لیست طلایی الان خالیه ⏳\nدور جدید تست در جریانه؛ چند دقیقه دیگه دوباره سر بزن.',
    gold_hint: '💡 برای کپی: روی کانفیگ بزن و نگه دار، بعد «Copy» رو بزن',
    more: '🔄 سه‌تای بعدی',
    stats_fail: 'الان نتونستم آمار رو بگیرم ⏳ یه کم بعد دوباره امتحان کن.',
    stats_head: '📊 <b>وضعیت لحظه‌ای شبکه</b>',
    last_run: '🕐 آخرین تست: {t}',
    sources: '📡 منابع سالم: {ok} از {total}',
    unique_n: '📥 کانفیگ غیرتکراری: {n}',
    probed_n: '🧪 تست‌شده: {a} | ❤️ سالم: {b}',
    latency: '⚡ پینگ p50: {p50}ms | میانگین: {avg}ms',
    sub_title: '🔗 <b>اشتراک شخصی تو</b>',
    sub_note: 'این لینک فقط مال خودته، به کسی نده 🤫\nهر بار اپت رو آپدیت کنی، تازه‌ترین کانفیگ‌های سالمِ مخصوص اپراتورت می‌رسه.',
    sub_howto: '📥 طرز اضافه کردن به اپ:',
    sub_fallback_note: 'ℹ️ برای اپراتور تو هنوز کانفیگ مخصوصِ کافی نداریم؛ برای همین فعلاً کل لیستِ تست‌شده‌ها رو می‌گیری.',
    sub_open: '📥 باز کردن لینک',
    help_text: '❓ <b>راهنمای آریستون</b>\n\n/start — شروع و منوی اصلی\n/gold — بهترین کانفیگ‌های طلایی\n/best — سریع‌ترین کانفیگ سالم (بلیت طلایی)\n/stats — آمار زندهٔ آخرین دور تست\n/sub — لینک اشتراک شخصی\n/ref — دعوت از دوستان و گرفتن کانفیگ بیشتر (تا ۲۰ تا)\n/settings — عوض کردن اپراتور / اپ\n/lang — عوض کردن زبان\n\n👑 هر نیم‌ساعت یه دور کامل می‌زنم: جمع‌آوری ← تمیزکاری ← تست ← امتیازدهی ← انتشار.',
    set_pick: '⚙️ چی رو عوض کنم؟',
    saved: '✅ ذخیره شد',
    err_generic: 'ای وای، یه مشکلی پیش اومد ⚠️ چند لحظه دیگه دوباره امتحان کن.',
    rel_min: '{n} دقیقه پیش', rel_hour: '{n} ساعت پیش', rel_day: '{n} روز پیش',
    btn_gold: '🏆 طلایی‌ها', btn_stats: '📊 آمار', btn_sub: '🔗 اشتراک من',
    btn_settings: '⚙️ تنظیمات', btn_help: '❓ راهنما', btn_lang: '🌐 زبان',
    btn_isp: '📡 اپراتور', btn_client: '📱 اپ', btn_menu: '↩️ منو',
    btn_best: '⚡ بلیت طلایی', btn_app: '👑 داشبورد',
    best_title: '⚡ بلیت طلایی — سریع‌ترین کانفیگ سالمِ الان',
    watchtower: '🔔 <b>تست جدید تموم شد!</b>\n\n🥇 طلایی: {gold}\n❤️ سالم: {alive}\n⚡ پینگ p50: {p50}ms',
    fav_dead: '💔 <b>محبوبت از بانک افتاد</b>\n\n⭐ یکی از کانفیگ‌های ستاره‌دارِ تو توی تست‌های امروز زنده نبود.\n🔮 شبیه‌ترین جایگزین توی مینی‌اپ منتظرته — برو توی «طلایی‌ها» بردارش:',
    inline_foot: 'کانفیگ‌های تازه هر نیم‌ساعت → {bot}', inline_none: 'ربات رو باز کن',
    help_inline: '💡 توی هر چتی می‌تونی بنویسی: {bot} irancell vless',
    daily_title: '👑 <b>کارتِ امروز آریستون</b>', daily_best: '⚡ بهترینِ امروز:', daily_svg: '🛰 کارت امروز (SVG)',
    join_wall: '🔔 برای استفاده از آریستون، اول باید عضو کانال رسمیش بشی.\n\nبعدش دکمهٔ «✅ عضو شدم» رو بزن.',
    join_done: '✅ عضو شدم', join_ok: '✅ عضویتت تأیید شد، خوش اومدی!',
    join_still: 'هنوز عضو کانال نشدی 🙈 اول عضو شو، بعد دوباره امتحان کن',
    btn_ref: '👥 دعوت دوستان',
    ref_title: '👥 <b>دوستاتو دعوت کن، کانفیگ بیشتر بگیر</b>',
    ref_stat: '📈 دوستانِ تأییدشده: {n}\n🎁 سهمیه‌ات الان {q} از {cap} کانفیگه',
    ref_rule: 'هر دوستی که با لینک تو بیاد، عضو کانال بشه و تنظیماتش رو کامل کنه، به سهمیه‌ات اضافه می‌کنه:\n• دوست اول و دوم → هرکدوم ۱ کانفیگ\n• دوست سوم تا پنجم → هرکدوم ۲ کانفیگ\n• از دوست ششم به بعد → هرکدوم ۳ کانفیگ\n🎯 سقف: ۲۰ کانفیگ',
    ref_share: '📤 فرستادن لینک دعوت',
    ref_share_text: '⚡ کانفیگ سالم و تست‌شدهٔ رایگان، با آپدیت هر نیم‌ساعت — ربات آریستون:',
    ref_credited: '🎉 {name} با لینک تو اومد!\n🎁 سهمیه‌ات شد {q} از {cap} کانفیگ',
    pick_name: '✍️ اسمت رو بنویس تا روی کانفیگ‌های مخصوصت بیفته:\n(مثلاً Ali)',
    name_skip: '⏭ بدون اسم', name_saved: '✅ ممنون {name}! اسمت روی کانفیگ‌هات می‌افته.',
    set_name: '✍️ اسم', set_rot: '🔁 تعویض کانفیگ‌ها: {mode}', rot_day: 'روزانه', rot_run: 'هر دور تست',
    rot_hint: '🔁 تغییر کرد: {mode} — دفعهٔ بعد که اپت رو آپدیت کنی، دستهٔ تازه می‌گیری.',
    name_now: '✍️ اسم: {name}', name_hint: '✍️ اسم جدیدت رو بفرست (یا «بدون اسم» رو بزن):',
    sub_rot_line: '🔁 تعویض: {mode} · 📦 {n} کانفیگ مخصوص تو',
    sub_mode_line: '🎛 حالت این لینک: {mode} — از داخل اپ (کارت اشتراک) قابل تغییره',
    mode_mine: 'فقط مخصوص من', mode_gold: 'فقط برترین‌ها', mode_mix: 'ترکیبی (شخصی + برترین‌ها)',
    digest_title: '📊 <b>آریستون — وضعیت لحظه‌ای</b>',
    freq_now: '⏱ گزارش دوره‌ای کانال: هر {n} ساعت یه‌بار\nبرای تغییر: <code>/freq 4</code> (بین ۱ تا ۲۴ ساعت)',
    freq_set: '✅ انجام شد! از الان هر {n} ساعت یه گزارش زنده توی کانال می‌ذارم.',
    freq_bad: '⚠️ یه عدد بین ۱ تا ۲۴ بفرست، مثلاً: <code>/freq 4</code>',
    freq_denied: '⛔ این دستور فقط برای صاحب رباته.',
    btn_panel: '🛠 پنل مدیریت', panel_denied: '⛔ پنل مدیریت فقط برای مدیرهای ربات باز می‌شه.',
    bank_line: '🏦 بانک کانفیگ: {n} خوش‌سابقه · بازگشت {hit}٪ · سابقهٔ میانگین {streak} دور',
    bank_p2: '🛟 دور دوم: {r} نجات از {a} تلاش',
    bank_src: '🩺 منابع: سالم {h} · مشکوک {s} · قرنطینه {q}',
    /* D10/U3 — invite tiers + weekly summary + run-late */
    tier_bronze: '🥉 برنزی', tier_silver: '🥈 نقره‌ای', tier_gold: '🥇 طلایی',
    ref_tier: '🏅 سطح فعلی: {tier} — تا سطح {next} فقط {n} دعوت دیگر!',
    ref_tier_max: '🏅 سطح فعلی: {tier} — بالاترین سطح! آفرین',
    wk_title: '🗓 خلاصهٔ هفتگی تو از آریستون',
    wk_tried: '🧪 این هفته {n} کانفیگ امتحان کردی.',
    wk_quota: '🎯 سهمیهٔ فعلی: {q} · سطح: {tier}',
    wk_gold: '🥇 الان {gold} طلایی و {alive} سالم در بانک هست — بفرما تازه‌ها!',
    late_run: '⏰ «ران دیر شد» — از آخرین دورِ موفق {min} دقیقه گذشته (دور {run}). احتمالاً Actions خطا داده یا رد شده.',
  },
  en: {
    start_new: '👑 Welcome to Ariston!\n\nEvery 30 minutes Ariston collects thousands of public configs, tests them with the xray-core and sing-box engines, and delivers only the alive ones.\n\n⬇️ Quick setup first:',
    pick_lang: '🌐 Choose your language:',
    pick_isp: '📡 Which ISP do you use?\nYour personal subscription is filtered by it.',
    pick_client: '📱 Which client do you connect with?\nI ask to give you exact import steps.',
    setup_done: '✅ All set! Your preferences are saved.\n\nTry "🏆 Gold" from the menu.',
    menu_title: 'Pick something from the menu:',
    menu_fallback: 'I don\'t get that 🙈 Use the menu:',
    gold_page: '🏆 <b>Gold {a}–{b}</b> of {n} — best of the latest run',
    gold_empty: 'The gold list is empty right now ⏳\nTry again in a few minutes once the new run finishes.',
    gold_hint: '💡 To copy: tap & hold the text → Copy',
    more: '🔄 Next 3',
    stats_fail: 'Data is unavailable right now ⏳ Try again in a moment.',
    stats_head: '📊 <b>Live network status</b>',
    last_run: '🕐 Last run: {t}',
    sources: '📡 Healthy sources: {ok} of {total}',
    unique_n: '📥 Unique configs: {n}',
    probed_n: '🧪 Probed: {a} | ❤️ Alive: {b}',
    latency: '⚡ Latency p50: {p50}ms | avg: {avg}ms',
    sub_title: '🔗 <b>Your personal subscription</b>',
    sub_note: 'This link is yours alone — don\'t share it.\nEvery time your client refreshes it, you get the latest alive configs filtered for your ISP.',
    sub_howto: '📥 How to import:',
    sub_fallback_note: 'ℹ️ Not enough on-shore configs for this ISP yet; the full tested list is enabled for you instead.',
    sub_open: '📥 Open link',
    help_text: '❓ <b>Ariston guide</b>\n\n/start — start & main menu\n/gold — top 3 gold configs\n/best — gold ticket: lowest-latency alive\n/stats — live stats of the last run\n/sub — personal subscription link\n/ref — invite friends, quota up to 20 configs\n/settings — change ISP / client\n/lang — change language\n\n👑 Every 30 min: collect → normalize → validate → score → publish.',
    set_pick: '⚙️ What should I change?',
    saved: '✅ Saved',
    err_generic: 'Oops, something went wrong ⚠️ Please try again in a moment.',
    rel_min: '{n} min ago', rel_hour: '{n} h ago', rel_day: '{n} d ago',
    btn_gold: '🏆 Gold', btn_stats: '📊 Stats', btn_sub: '🔗 My sub',
    btn_settings: '⚙️ Settings', btn_help: '❓ Help', btn_lang: '🌐 Language',
    btn_isp: '📡 ISP', btn_client: '📱 Client', btn_menu: '↩️ Menu',
    btn_best: '⚡ Gold ticket', btn_app: '👑 Dashboard',
    best_title: 'Gold ticket — lowest-latency alive config',
    watchtower: '🔔 <b>New run finished!</b>\n\n🥇 Gold: {gold}\n❤️ Alive: {alive}\n⚡ p50: {p50}ms',
    fav_dead: '💔 <b>Your favorite dropped out</b>\n\n⭐ One of your starred configs did not survive today\'s tests.\n🔮 The closest look-alike is waiting in the mini-app — grab it from “Gold”:',
    inline_foot: 'fresh configs every 30 min → {bot}', inline_none: 'Open the bot',
    help_inline: 'inline in any chat: {bot} irancell vless',
    daily_title: '👑 <b>Ariston — card of the day</b>', daily_best: '⚡ Best of the day:', daily_svg: '🛰 Card of the day (SVG)',
    join_wall: '🔔 To use Ariston you must join the official channel first.\n\nAfter joining, tap “✅ I joined”.',
    join_done: '✅ I joined', join_ok: '✅ Membership confirmed — welcome!',
    join_still: 'You haven\'t joined the channel yet 🙈',
    btn_ref: '👥 Referrals',
    ref_title: '👥 <b>Invite friends = more configs</b>',
    ref_stat: '📈 Confirmed referrals: {n}\n🎁 Your quota: {q} of {cap} configs',
    ref_rule: 'For every friend who joins via your link, joins the channel and finishes setup:\n• referrals 1–2 → +1 each\n• referrals 3–5 → +2 each\n• from the 6th → +3 each\n🎯 Cap: 20 configs',
    ref_share: '📤 Share invite link',
    ref_share_text: '⚡ Engine-tested configs, free, refreshed every 30 minutes — Ariston bot:',
    ref_credited: '🎉 {name} joined via your link!\n🎁 Your quota: {q} of {cap} configs',
    pick_name: '✍️ Type your name — it will be stamped on your personal configs:\n(e.g. Ali)',
    name_skip: '⏭ Skip', name_saved: '✅ Thanks, {name}! Your configs will carry your name.',
    set_name: '✍️ Name', set_rot: '🔁 Rotation: {mode}', rot_day: 'daily', rot_run: 'per run',
    rot_hint: '🔁 Rotation changed: {mode} — your next client refresh delivers a fresh set.',
    name_now: '✍️ Name: {name}', name_hint: '✍️ Send the new name (or press skip):',
    sub_rot_line: '🔁 Rotation: {mode} · 📦 {n} personal picks',
    sub_mode_line: '🎛 This link\'s mode: {mode} — switchable inside the mini app (subscription card)',
    mode_mine: 'only mine', mode_gold: 'only best', mode_mix: 'mixed (personal + best)',
    digest_title: '📊 <b>Ariston — live status</b>',
    freq_now: '⏱ Channel digest interval: every {n} h\nTo change: <code>/freq 4</code> (1–24 hours)',
    freq_set: '✅ Done! A live digest will be posted to the channel every {n} h.',
    freq_bad: '⚠️ Send a number between 1 and 24, like: <code>/freq 4</code>',
    freq_denied: '⛔ This command is for the bot owner only.',
    btn_panel: '🛠 Admin panel', panel_denied: '⛔ The admin panel is open to bot admins only.',
    bank_line: '🏦 Config bank: {n} known-good · hit {hit}% · avg streak {streak}',
    bank_p2: '🛟 Pass-2: {r} rescued of {a} attempts',
    bank_src: '🩺 Sources: healthy {h} · suspect {s} · quarantined {q}',
    /* D10/U3 — invite tiers + weekly summary + run-late */
    tier_bronze: '🥉 Bronze', tier_silver: '🥈 Silver', tier_gold: '🥇 Gold',
    ref_tier: '🏅 Current tier: {tier} — only {n} more invites to {next}!',
    ref_tier_max: '🏅 Current tier: {tier} — the top tier, nice!',
    wk_title: '🗓 Your weekly Ariston recap',
    wk_tried: '🧪 You tried {n} configs this week.',
    wk_quota: '🎯 Current quota: {q} · tier: {tier}',
    wk_gold: '🥇 {gold} gold & {alive} alive configs are in the bank right now — come get the fresh ones!',
    late_run: '⏰ "Run is late" — {min} minutes since the last successful run ({run}). The Actions run likely failed or was skipped.',
  },
  ru: {
    start_new: '👑 Добро пожаловать в Ariston!\n\nКаждые 30 минут Ariston собирает тысячи публичных конфигов, проверяет их движками xray-core и sing-box и отдаёт только живые.\n\n⬇️ Сначала быстрая настройка:',
    pick_lang: '🌐 Выберите язык:',
    pick_isp: '📡 Какой у вас оператор?\nЛичная подписка фильтруется по нему.',
    pick_client: '📱 Какое приложение вы используете?\nСпрошу, чтобы дать точную инструкцию.',
    setup_done: '✅ Готово! Настройки сохранены.\n\nПопробуйте «🏆 Gold» в меню.',
    menu_title: 'Выберите в меню:',
    menu_fallback: 'Не понимаю 🙈 Воспользуйтесь меню:',
    gold_page: '🏆 <b>Gold {a}–{b}</b> из {n} — лучшие последнего прогона',
    gold_empty: 'Золотой список сейчас пуст ⏳\nПовторите через несколько минут, когда завершится новый прогон.',
    gold_hint: '💡 Копировать: удерживайте текст → Копировать',
    more: '🔄 Ещё 3',
    stats_fail: 'Данные сейчас недоступны ⏳ Попробуйте позже.',
    stats_head: '📊 <b>Живой статус сети</b>',
    last_run: '🕐 Последний прогон: {t}',
    sources: '📡 Рабочих источников: {ok} из {total}',
    unique_n: '📥 Уникальных конфигов: {n}',
    probed_n: '🧪 Проверено: {a} | ❤️ Живых: {b}',
    latency: '⚡ Задержка p50: {p50}ms | средняя: {avg}ms',
    sub_title: '🔗 <b>Ваша личная подписка</b>',
    sub_note: 'Эта ссылка только ваша — не делитесь ею.\nПри каждом обновлении клиент получает свежие живые конфиги, отфильтрованные по вашему оператору.',
    sub_howto: '📥 Как импортировать:',
    sub_fallback_note: 'ℹ️ Для этого оператора пока мало внутренних конфигов; включён полный проверенный список.',
    sub_open: '📥 Открыть ссылку',
    help_text: '❓ <b>Гид по Ariston</b>\n\n/start — старт и меню\n/gold — топ-3 золотых\n/best — золотой билет: самый быстрый\n/stats — живая статистика\n/sub — личная подписка\n/ref — пригласить друзей: квота до 20 конфигов\n/settings — сменить оператора / клиент\n/lang — сменить язык\n\n👑 Каждые 30 минут: сбор → нормализация → проверка → оценка → публикация.',
    set_pick: '⚙️ Что изменить?',
    saved: '✅ Сохранено',
    err_generic: 'Упс, что-то пошло не так ⚠️ Попробуйте ещё раз чуть позже.',
    rel_min: '{n} мин назад', rel_hour: '{n} ч назад', rel_day: '{n} дн назад',
    btn_gold: '🏆 Gold', btn_stats: '📊 Статистика', btn_sub: '🔗 Моя подписка',
    btn_settings: '⚙️ Настройки', btn_help: '❓ Помощь', btn_lang: '🌐 Язык',
    btn_isp: '📡 Оператор', btn_client: '📱 Клиент', btn_menu: '↩️ Меню',
    btn_best: '⚡ Золотой билет', btn_app: '👑 Панель',
    best_title: 'Золотой билет — самый быстрый живой конфиг',
    watchtower: '🔔 <b>Новый прогон завершён!</b>\n\n🥇 Gold: {gold}\n❤️ Живых: {alive}\n⚡ p50: {p50}ms',
    fav_dead: '💔 <b>Ваш избранный отпал</b>\n\n⭐ Одна из конфигураций со звездой не прошла сегодняшние тесты.\n🔮 Самая похожая замена ждёт в мини-приложении — заберите её в «Gold»:',
    inline_foot: 'свежие конфиги каждые 30 мин → {bot}', inline_none: 'Открыть бота',
    help_inline: 'инлайн в любом чате: {bot} irancell vless',
    daily_title: '👑 <b>Ariston — карточка дня</b>', daily_best: '⚡ Лучший за день:', daily_svg: '🛰 Карточка дня (SVG)',
    join_wall: '🔔 Чтобы пользоваться Ariston, сначала вступите в официальный канал.\n\nПосле вступления нажмите «✅ Я вступил».',
    join_done: '✅ Я вступил', join_ok: '✅ Вступление подтверждено — добро пожаловать!',
    join_still: 'Вы ещё не вступили в канал 🙈',
    btn_ref: '👥 Рефералы',
    ref_title: '👥 <b>Приглашайте друзей = больше конфигов</b>',
    ref_stat: '📈 Подтверждённые рефералы: {n}\n🎁 Ваша квота: {q} из {cap} конфигов',
    ref_rule: 'За каждого друга, пришедшего по вашей ссылке, вступившего в канал и завершившего настройку:\n• рефералы 1–2 → +1 каждый\n• рефералы 3–5 → +2 каждый\n• с 6-го → +3 каждый\n🎯 Лимит: 20 конфигов',
    ref_share: '📤 Поделиться ссылкой',
    ref_share_text: '⚡ Проверенные конфиги бесплатно, обновление каждые 30 минут — бот Ariston:',
    ref_credited: '🎉 {name} присоединился по вашей ссылке!\n🎁 Ваша квота: {q} из {cap} конфигов',
    pick_name: '✍️ Напишите имя — оно будет на ваших личных конфигах:\n(например: Ali)',
    name_skip: '⏭ Пропустить', name_saved: '✅ Спасибо, {name}! Имя будет на ваших конфигах.',
    set_name: '✍️ Имя', set_rot: '🔁 Ротация: {mode}', rot_day: 'ежедневно', rot_run: 'каждый прогон',
    rot_hint: '🔁 Ротация изменена: {mode} — следующее обновление клиента даст новый набор.',
    name_now: '✍️ Имя: {name}', name_hint: '✍️ Отправьте новое имя (или «Пропустить»):',
    sub_rot_line: '🔁 Ротация: {mode} · 📦 {n} личных конфигов',
    sub_mode_line: '🎛 Режим ссылки: {mode} — меняется в мини-аппе (карточка подписки)',
    mode_mine: 'только мои', mode_gold: 'только лучшие', mode_mix: 'смешанный (личные + лучшие)',
    digest_title: '📊 <b>Ariston — живой статус</b>',
    freq_now: '⏱ Интервал постов в канал: каждые {n} ч\nИзменить: <code>/freq 4</code> (1–24 часа)',
    freq_set: '✅ Готово! Живой отчёт будет в канале каждые {n} ч.',
    freq_bad: '⚠️ Пришлите число от 1 до 24, например: <code>/freq 4</code>',
    freq_denied: '⛔ Команда только для владельца бота.',
    btn_panel: '🛠 Панель админа', panel_denied: '⛔ Панель доступна только админам бота.',
    bank_line: '🏦 Банк конфигов: {n} надёжных · попаданий {hit}% · ср. серия {streak}',
    bank_p2: '🛟 Второй проход: {r} спасено из {a}',
    bank_src: '🩺 Источники: здоровых {h} · подозрительных {s} · карантин {q}',
    /* D10/U3 — invite tiers + weekly summary + run-late */
    tier_bronze: '🥉 Бронза', tier_silver: '🥈 Серебро', tier_gold: '🥇 Золото',
    ref_tier: '🏅 Уровень: {tier} — до {next} всего {n} приглашений!',
    ref_tier_max: '🏅 Уровень: {tier} — высший уровень, браво!',
    wk_title: '🗓 Ваш недельный отчёт Ariston',
    wk_tried: '🧪 На этой неделе вы попробовали {n} конфигов.',
    wk_quota: '🎯 Квота: {q} · уровень: {tier}',
    wk_gold: '🥇 В банке сейчас {gold} золотых и {alive} живых — забирайте свежие!',
    late_run: '⏰ «Запуск задерживается» — {min} минут с последнего успешного прогона ({run}). Вероятно, Actions упал или был пропущен.',
  },
  tr: {
    start_new: '👑 Ariston\'a hoş geldin!\n\nAriston her 30 dakikada binlerce genel yapılandırmayı toplar, xray-core ve sing-box motorlarıyla test eder ve yalnızca çalışanları teslim eder.\n\n⬇️ Önce hızlı kurulum:',
    pick_lang: '🌐 Dilini seç:',
    pick_isp: '📡 Hangi internet sağlayıcısını kullanıyorsun?\nKişisel aboneliğin ona göre filtrelenir.',
    pick_client: '📱 Hangi istemciyle bağlanıyorsun?\nDoğru içe aktarma adımları için soruyorum.',
    setup_done: '✅ Hazır! Tercihlerin kaydedildi.\n\nMenüden "🏆 Gold"u dene.',
    menu_title: 'Menüden bir şey seç:',
    menu_fallback: 'Bunu anlamadım 🙈 Menüyü kullan:',
    gold_page: '🏆 <b>Gold {a}–{b}</b> / {n} — son çalışmanın en iyileri',
    gold_empty: 'Altın liste şu an boş ⏳\nYeni çalışma bitince birkaç dakika içinde tekrar dene.',
    gold_hint: '💡 Kopyalamak için: metne basılı tut → Kopyala',
    more: '🔄 Sonraki 3',
    stats_fail: 'Veriler şu an erişilebilir değil ⏳ Birazdan tekrar dene.',
    stats_head: '📊 <b>Canlı ağ durumu</b>',
    last_run: '🕐 Son çalışma: {t}',
    sources: '📡 Sağlıklı kaynak: {total} içinde {ok}',
    unique_n: '📥 Benzersiz yapılandırma: {n}',
    probed_n: '🧪 Test edilen: {a} | ❤️ Çalışan: {b}',
    latency: '⚡ Gecikme p50: {p50}ms | ort: {avg}ms',
    sub_title: '🔗 <b>Kişisel aboneliğin</b>',
    sub_note: 'Bu bağlantı sadece senin — kimseyle paylaşma.\nİstemcin her yenilediğinde, sağlayıcına göre filtrelenmiş en güncel çalışan yapılandırmaları alırsın.',
    sub_howto: '📥 İçe aktarma:',
    sub_fallback_note: 'ℹ️ Bu sağlayıcı için henüz yeterli yerel yapılandırma yok; test edilmiş tam liste etkinleştirildi.',
    sub_open: '📥 Bağlantıyı aç',
    help_text: '❓ <b>Ariston rehberi</b>\n\n/start — başlangıç ve ana menü\n/gold — ilk 3 altın\n/best — altın bilet: en hızlı\n/stats — canlı istatistik\n/sub — kişisel abonelik\n/ref — arkadaş davet et, tavan 20\n/settings — sağlayıcı / istemci değiştir\n/lang — dil değiştir\n\n👑 Her 30 dakika: topla → normalize et → doğrula → puanla → yayınla.',
    set_pick: '⚙️ Neyi değiştireyim?',
    saved: '✅ Kaydedildi',
    err_generic: 'Hops, bir şeyler ters gitti ⚠️ Lütfen birazdan tekrar dene.',
    rel_min: '{n} dk önce', rel_hour: '{n} sa önce', rel_day: '{n} gün önce',
    btn_gold: '🏆 Gold', btn_stats: '📊 İstatistik', btn_sub: '🔗 Aboneliğim',
    btn_settings: '⚙️ Ayarlar', btn_help: '❓ Yardım', btn_lang: '🌐 Dil',
    btn_isp: '📡 Sağlayıcı', btn_client: '📱 İstemci', btn_menu: '↩️ Menü',
    btn_best: '⚡ Altın bilet', btn_app: '👑 Panel',
    best_title: 'Altın bilet — en düşük gecikmeli çalışan yapılandırma',
    watchtower: '🔔 <b>Yeni çalışma tamamlandı!</b>\n\n🥇 Gold: {gold}\n❤️ Çalışan: {alive}\n⚡ p50: {p50}ms',
    fav_dead: '💔 <b>Favorin düştü</b>\n\n⭐ Yıldızlı yapılandırmalarından biri bugünün testlerini geçemedi.\n🔮 En benzer alternatif mini uygulamada sizi bekliyor — “Gold” bölümünden alın:',
    inline_foot: 'güncel yapılandırmalar her 30 dakika → {bot}', inline_none: 'Botu aç',
    help_inline: 'herhangi bir sohbette inline: {bot} irancell vless',
    daily_title: '👑 <b>Ariston — günün kartı</b>', daily_best: "⚡ Günün en iyisi:", daily_svg: '🛰 Günün kartı (SVG)',
    join_wall: '🔔 Ariston\'u kullanmak için önce resmî kanala katılman gerekiyor.\n\nKatıldıktan sonra «✅ Katıldım» düğmesine bas.',
    join_done: '✅ Katıldım', join_ok: '✅ Üyeliğin onaylandı — hoş geldin!',
    join_still: 'Henüz kanala katılmadın 🙈',
    btn_ref: '👥 Davetler',
    ref_title: '👥 <b>Arkadaş davet et = daha fazla yapılandırma</b>',
    ref_stat: '📈 Onaylanan davetler: {n}\n🎁 Kotan: {cap} yapılandırmadan {q}',
    ref_rule: 'Linkinle gelen, kanala katılan ve kurulumu bitiren her arkadaş için:\n• 1–2. davet → her biri +1\n• 3–5. davet → her biri +2\n• 6\'dan itibaren → her biri +3\n🎯 Tavan: 20 yapılandırma',
    ref_share: '📤 Davet linkini paylaş',
    ref_share_text: '⚡ Test edilmiş sağlıklı yapılandırmalar, ücretsiz, 30 dakikada bir güncel — Ariston botu:',
    ref_credited: '🎉 {name} linkinle katıldı!\n🎁 Kotan: {cap} yapılandırmadan {q}',
    pick_name: '✍️ Adını yaz — kişisel yapılandırmalarında görünecek:\n(örn. Ali)',
    name_skip: '⏭ Atla', name_saved: '✅ Sağol, {name}! Yapılandırmalarında adın görünecek.',
    set_name: '✍️ İsim', set_rot: '🔁 Rotasyon: {mode}', rot_day: 'günlük', rot_run: 'her çalışma',
    rot_hint: '🔁 Rotasyon değişti: {mode} — bir sonraki istemci yenilemesi yeni set verir.',
    name_now: '✍️ İsim: {name}', name_hint: '✍️ Yeni ismi gönder (veya «Atla»):',
    sub_rot_line: '🔁 Rotasyon: {mode} · 📦 {n} kişisel seçki',
    sub_mode_line: '🎛 Bu bağlantının modu: {mode} — mini uygulamadan değiştirilir (abonelik kartı)',
    mode_mine: 'sadece benim', mode_gold: 'sadece en iyiler', mode_mix: 'karışık (kişisel + en iyiler)',
    digest_title: '📊 <b>Ariston — canlı durum</b>',
    freq_now: '⏱ Kanal özet aralığı: her {n} sa\nDeğiştirmek için: <code>/freq 4</code> (1–24 saat)',
    freq_set: '✅ Tamam! Kanala her {n} saatte bir canlı özet düşecek.',
    freq_bad: '⚠️ 1 ile 24 arasında bir sayı gönder, örn.: <code>/freq 4</code>',
    freq_denied: '⛔ Bu komut yalnızca bot sahibine ait.',
    btn_panel: '🛠 Yönetim paneli', panel_denied: '⛔ Yönetim paneli yalnızca bot yöneticilerine açık.',
    bank_line: '🏦 Yapılandırma bankası: {n} güvenilir · isabet {hit}% · ort. seri {streak}',
    bank_p2: '🛟 İkinci tur: {a} denemede {r} kurtarıldı',
    bank_src: '🩺 Kaynaklar: sağlıklı {h} · şüpheli {s} · karantina {q}',
    /* D10/U3 — invite tiers + weekly summary + run-late */
    tier_bronze: '🥉 Bronz', tier_silver: '🥈 Gümüş', tier_gold: '🥇 Altın',
    ref_tier: '🏅 Seviye: {tier} — {next} için sadece {n} davet kaldı!',
    ref_tier_max: '🏅 Seviye: {tier} — en üst seviye, harika!',
    wk_title: '🗓 Haftalık Ariston özetin',
    wk_tried: '🧪 Bu hafta {n} yapılandırma denedin.',
    wk_quota: '🎯 Kota: {q} · seviye: {tier}',
    wk_gold: '🥇 Bankada şu an {gold} altın ve {alive} çalışan var — yeniler seni bekliyor!',
    late_run: '⏰ "Çalışma gecikti" — son başarılı çalışmadan beri {min} dakika geçti ({run}). Actions muhtemelen başarısız oldu veya atlandı.',
  },
  zh: {
    start_new: '👑 欢迎使用 Ariston！\n\nAriston 每 30 分钟收集数千个公共配置，用 xray-core 与 sing-box 双引擎测试，只交付可用的。\n\n⬇️ 先做几个快速设置：',
    pick_lang: '🌐 选择语言：',
    pick_isp: '📡 你使用哪家运营商？\n个人订阅会按它过滤。',
    pick_client: '📱 你用哪个客户端连接？\n问你以便给出准确的导入步骤。',
    setup_done: '✅ 设置完成！\n\n去菜单里试试「🏆 金牌」。',
    menu_title: '从菜单中选择：',
    menu_fallback: '我没看懂 🙈 请使用菜单：',
    gold_page: '🏆 <b>金牌 {a}–{b}</b>／共 {n} — 最新一轮的最佳',
    gold_empty: '金牌列表暂时为空 ⏳\n等新一轮运行结束（几分钟）后再来。',
    gold_hint: '💡 复制：长按文本 → 复制',
    more: '🔄 再来 3 个',
    stats_fail: '数据暂时不可用 ⏳ 请稍后再试。',
    stats_head: '📊 <b>网络实时状态</b>',
    last_run: '🕐 最近一轮：{t}',
    sources: '📡 可用源：{ok} / {total}',
    unique_n: '📥 去重配置：{n}',
    probed_n: '🧪 已探测：{a} | ❤️ 可用：{b}',
    latency: '⚡ 延迟 p50：{p50}ms | 平均：{avg}ms',
    sub_title: '🔗 <b>你的个人订阅</b>',
    sub_note: '此链接仅属于你——请勿分享。\n客户端每次刷新都会拿到按你的运营商过滤的最新可用配置。',
    sub_howto: '📥 导入方法：',
    sub_fallback_note: 'ℹ️ 该运营商的本地配置还不够；已为你启用完整已测试列表。',
    sub_open: '📥 打开链接',
    help_text: '❓ <b>Ariston 指南</b>\n\n/start — 启动与主菜单\n/gold — 前三名金牌\n/best — 金牌票：延迟最低\n/stats — 最新一轮实时统计\n/sub — 个人订阅链接\n/ref — 邀请好友，配额最高 20\n/settings — 更换运营商 / 客户端\n/lang — 更换语言\n\n👑 每 30 分钟：收集 → 规范化 → 验证 → 评分 → 发布。',
    set_pick: '⚙️ 要更改什么？',
    saved: '✅ 已保存',
    err_generic: '哎呀，出错了 ⚠️ 请稍后再试。',
    rel_min: '{n} 分钟前', rel_hour: '{n} 小时前', rel_day: '{n} 天前',
    btn_gold: '🏆 金牌', btn_stats: '📊 统计', btn_sub: '🔗 我的订阅',
    btn_settings: '⚙️ 设置', btn_help: '❓ 帮助', btn_lang: '🌐 语言',
    btn_isp: '📡 运营商', btn_client: '📱 客户端', btn_menu: '↩️ 菜单',
    btn_best: '⚡ 金牌票', btn_app: '👑 仪表盘',
    best_title: '金牌票 — 延迟最低的可用配置',
    watchtower: '🔔 <b>新一轮运行完成！</b>\n\n🥇 金牌：{gold}\n❤️ 可用：{alive}\n⚡ p50：{p50}ms',
    fav_dead: '💔 <b>你的收藏掉队了</b>\n\n⭐ 你收藏的某个配置没能通过今天的测试。\n🔮 最相似的替代品已在小程序里等着——去「金牌」里领取：',
    inline_foot: '每 30 分钟更新可用配置 → {bot}', inline_none: '打开机器人',
    help_inline: '任意聊天内联使用：{bot} irancell vless',
    daily_title: '👑 <b>Ariston 每日卡片</b>', daily_best: '⚡ 今日最佳：', daily_svg: '🛰 今日卡片 (SVG)',
    join_wall: '🔔 使用 Ariston 前请先加入官方频道。\n\n加入后点击「✅ 已加入」。',
    join_done: '✅ 已加入', join_ok: '✅ 已确认加入——欢迎！',
    join_still: '你还没加入频道 🙈',
    btn_ref: '👥 邀请',
    ref_title: '👥 <b>邀请好友 = 更多配置</b>',
    ref_stat: '📈 已确认邀请：{n}\n🎁 你的配额：{q} / {cap} 个配置',
    ref_rule: '每位通过你的链接加入、进入频道并完成设置的好友：\n• 第 1–2 位 → 各 +1\n• 第 3–5 位 → 各 +2\n• 第 6 位起 → 各 +3\n🎯 上限：20 个配置',
    ref_share: '📤 分享邀请链接',
    ref_share_text: '⚡ 引擎实测的可用配置，免费，每 30 分钟更新——Ariston 机器人：',
    ref_credited: '🎉 {name} 通过你的链接加入了！\n🎁 你的配额：{q} / {cap} 个配置',
    pick_name: '✍️ 输入你的名字——会显示在你的专属配置上：\n（例如：Ali）',
    name_skip: '⏭ 跳过', name_saved: '✅ 谢谢，{name}！你的配置将带上你的名字。',
    set_name: '✍️ 名字', set_rot: '🔁 轮换：{mode}', rot_day: '每天', rot_run: '每轮运行',
    rot_hint: '🔁 轮换已更改：{mode}——下次客户端刷新会拿到新的一组。',
    name_now: '✍️ 名字：{name}', name_hint: '✍️ 发送新名字（或点「跳过」）：',
    sub_rot_line: '🔁 轮换：{mode} · 📦 {n} 个专属配置',
    sub_mode_line: '🎛 此链接模式：{mode} — 可在迷你应用（订阅卡片）中切换',
    mode_mine: '只看我的', mode_gold: '只看最佳', mode_mix: '混合（个人+最佳）',
    digest_title: '📊 <b>Ariston — 实时状态</b>',
    freq_now: '⏱ 频道定时播报间隔：每 {n} 小时\n修改：<code>/freq 4</code>（1–24 小时）',
    freq_set: '✅ 好了！以后每 {n} 小时向频道发送一次实时报告。',
    freq_bad: '⚠️ 请发送 1–24 之间的数字，例如：<code>/freq 4</code>',
    freq_denied: '⛔ 该命令仅限机器人所有者使用。',
    btn_panel: '🛠 管理面板', panel_denied: '⛔ 管理面板仅限机器人管理员使用。',
    bank_line: '🏦 配置银行：{n} 个优等 · 命中 {hit}% · 平均连击 {streak} 轮',
    bank_p2: '🛟 第二轮：{a} 次尝试救回 {r} 个',
    bank_src: '🩺 源：健康 {h} · 可疑 {s} · 隔离 {q}',
    /* D10/U3 — invite tiers + weekly summary + run-late */
    tier_bronze: '🥉 青铜', tier_silver: '🥈 白银', tier_gold: '🥇 黄金',
    ref_tier: '🏅 当前等级：{tier} — 再邀请 {n} 人即可升级到 {next}！',
    ref_tier_max: '🏅 当前等级：{tier} — 已是最高等级，厉害！',
    wk_title: '🗓 你的 Ariston 周报',
    wk_tried: '🧪 本周你尝试了 {n} 个配置。',
    wk_quota: '🎯 当前配额：{q} · 等级：{tier}',
    wk_gold: '🥇 银行现有 {gold} 个金牌和 {alive} 个可用配置 — 快来取新鲜的！',
    late_run: '⏰ 「运行延迟」— 距上次成功运行已 {min} 分钟（{run}）。Actions 可能失败或被跳过。',
  },
};

function t(lang, key, vars) {
  const d = T[lang] || T.en;
  let s = (key in d) ? d[key] : T.en[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}
const ispName = (slug, lang) => (ISP_META[slug] && (ISP_META[slug][lang] || ISP_META[slug].en)) || slug;
const clName = (slug, lang) => (CLIENT_META[slug] && (CLIENT_META[slug][lang] || CLIENT_META[slug].en)) || slug;

/* ─────────────────────────────── small utils ──────────────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (n ?? 0).toLocaleString('en-US');

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

const toLines = (txt) => (txt ? txt.split('\n').map((s) => s.trim()).filter(Boolean) : []);

function relTime(iso, lang) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '—';
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return t(lang, 'rel_min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t(lang, 'rel_hour', { n: h });
  return t(lang, 'rel_day', { n: Math.round(h / 24) });
}

async function kvGet(env, key, type = 'text') { try { return await env.KV.get(key, type); } catch (_) { return null; } }
async function kvPut(env, key, value, ttl) {
  try { await env.KV.put(key, value, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {}
}
async function kvDel(env, key) { try { await env.KV.delete(key); } catch (_) {} }

/* D4 — helpers for the personalized 10-pick allocation */
const tehranDate = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10); } }; // YYYY-MM-DD
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function getUser(env, chatId) { return kvGet(env, 'user:' + chatId, 'json'); }
async function saveUser(env, chatId, u) { await kvPut(env, 'user:' + chatId, JSON.stringify(u)); }

/* ─────────────────────────── data-branch access ───────────────────────────── */

/* D10.1/B2 — raw.githubusercontent/Fastly can hand back a branch object that is
   many minutes (sometimes tens of minutes) old, which is exactly how the panel
   ended up «70 minutes behind» while the bot had just announced the run.
   A quantized cache-buster forces the edge to revalidate while still letting
   Cloudflare collapse requests inside the same 2-minute bucket. */
const statsBust = () => '?t=' + Math.floor(Date.now() / 120e3);

/* D10.2/B2 — every user-facing «last run» clock measures from the moment the
   snapshot was finalized on the data branch (published_at), NOT from run
   start.  generated_at is the collector's start stamp: runs take 15-25 min
   and Actions slots get skipped (concurrency group), so the panel counted
   run duration + queue drift into «آخرین دور» — the bot had just announced
   «تموم شد» while the panel still said «57 دقیقه پیش».  Older snapshots
   without the field fall back to generated_at — zero-rollback. */
const runStamp = (s) => (s && (s.published_at || s.generated_at)) || '';

async function fetchTextCached(env, name, ttlSec, bust) {
  const key = 'file:' + name;
  const hit = await kvGet(env, key, 'json');
  if (hit && hit.ts && Date.now() - hit.ts < ttlSec * 1000 && typeof hit.text === 'string' && hit.text !== '') return hit.text;
  const suffix = bust ? statsBust() : '';
  for (const base of [RAW, CDN]) {
    try {
      const r = await fetch(base + name + suffix, {
        headers: { 'user-agent': 'ariston-bot/1.0 (+https://github.com/' + REPO + ')' },
        cf: { cacheTtl: bust ? 60 : 300, cacheEverything: true },
      });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || !text.trim()) continue; // empty file (e.g. some by-operator) → try next source
      await kvPut(env, key, JSON.stringify({ ts: Date.now(), text }), ttlSec * 2);
      return text;
    } catch (_) { /* try next */ }
  }
  return hit && typeof hit.text === 'string' ? hit.text : null; // stale cache as last resort
}

/* D4.2: ?fresh=1 bypasses the KV cache (CI calls /card.svg?fresh=1 right after
   publishing a new data snapshot so the committed PNG matches the fresh run) */
const getStats = async (env, fresh) => {
  /* D5.1: every good snapshot is kept in KV — a stale number beats a dead screen.
     lastKeptAt dedupes writes per isolate → at most one KV write per new run. */
  let lastKeptAt = null;
  const keep = (j) => {
    if (j && j.generated_at) {
      if (j.generated_at !== lastKeptAt) { lastKeptAt = j.generated_at; kvPut(env, 'stats:lastgood', JSON.stringify(j), 7 * 86400); }
      return j;
    }
    return null;
  };
  if (fresh) {
    try {
      const r = await fetch(RAW + 'stats.json' + statsBust(), { headers: { 'user-agent': 'ariston-bot/1.0 (+https://github.com/' + REPO + ')' }, cf: { cacheTtl: 60 } });
      if (r.ok) { const j = keep(await r.json()); if (j) return j; }
    } catch (_) { /* fall through to the KV cache */ }
  }
  return fetchTextCached(env, 'stats.json', STATS_TTL_SEC, true).then((s) => { try { return s ? keep(JSON.parse(s)) : null; } catch (_) { return null; } });
};

/* ─────────────── mini app: initdata auth, enrichment, feedback ─────────────── */

async function sha16(s) {
  /* D7 fix: published lines carry the brand remark (#Ariston-GOLD-65ms) since
     D6/B, while results.json keys hash the bare canonical URI — strip the
     fragment before hashing so telemetry (ema ✔/✘, ping) matches again.
     Also unifies every consumer (gold cards · personal alloc · latency map). */
  const base = String(s).split('#')[0];
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* HMAC-SHA256 verification of Telegram WebApp initData (standard algorithm) */
async function verifyInitData(env, initData) {
  try {
    const params = new URLSearchParams(initData || '');
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    params.delete('signature');
    const mkCheck = (p) => [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k2, v2]) => k2 + '=' + v2).join('\n');
    const enc = new TextEncoder();
    const midKey = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', midKey, enc.encode(env.BOT_TOKEN));
    const hmacKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const matches = async (p) => {
      const sig2 = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(mkCheck(p)));
      const hex2 = [...new Uint8Array(sig2)].map((b2) => b2.toString(16).padStart(2, '0')).join('');
      return hex2 === hash;
    };
    /* dual-check: (A) all fields except hash [official docs, incl. signature] · (B) signature excluded too [older clients] */
    const okA = await matches(params);
    let okB = false;
    if (!okA) {
      const p2 = new URLSearchParams(initData || '');
      p2.delete('hash');
      okB = await matches(p2);
    }
    if (!okA && !okB) return null;
    const user = JSON.parse(params.get('user') || '{}');
    return user && user.id ? user : null;
  } catch (_) { return null; }
}

/* gold list enriched with real engine telemetry from results.json (sha256[:16] map) */
async function getEnrichedGold(env) {
  const rich = await kvGet(env, 'rich:gold', 'json');
  if (rich && rich.ts && Date.now() - rich.ts < 30 * 60 * 1000 && Array.isArray(rich.items) && rich.items.length) return rich.items;
  const [goldRaw, resultsRaw] = await Promise.all([
    fetchTextCached(env, 'gold.txt', FILE_TTL_SEC),
    fetchTextCached(env, 'results.json', 1800),
  ]);
  const lines = toLines(goldRaw);
  if (!lines.length) return [];
  let res = {};
  try { res = resultsRaw ? JSON.parse(resultsRaw) : {}; } catch (_) {}
  const items = [];
  for (const uri of lines) {
    const hash = await sha16(uri);
    const r = res[hash] || {};
    items.push({
      uri, hash,
      ema: typeof r.ema === 'number' ? r.ema : null,
      ok: r.ok || 0, fail: r.fail || 0,
      latency_ms: typeof r.latency_ms === 'number' ? r.latency_ms : null,
      last_ok: r.last_ok || null,
    });
  }
  if (items.length) await kvPut(env, 'rich:gold', JSON.stringify({ ts: Date.now(), items }), 3600);
  return items;
}

async function feedbackGet(env, hash) { return (await kvGet(env, 'fb:' + hash, 'json')) || { up: 0, down: 0, users: {} }; }

async function feedbackSet(env, hash, chatId, vote) {
  const cur = await feedbackGet(env, hash);
  cur.users = cur.users || {};
  cur.users[String(chatId)] = vote; // 1 = up, 2 = down
  const vals = Object.values(cur.users);
  cur.up = vals.filter((v) => v === 1).length;
  cur.down = vals.filter((v) => v === 2).length;
  await kvPut(env, 'fb:' + hash, JSON.stringify(cur));
  return { up: cur.up, down: cur.down };
}

/* ─────── D6 — personal history: persistent, ≤20 items, shown before global gold ─────── */

const HIST_CAP = 20;

async function historyGet(env, uid) {
  const h = await kvGet(env, 'hist:' + uid, 'json');
  return Array.isArray(h) ? h : [];
}

async function historyAdd(env, uid, item) {
  const items = await historyGet(env, uid);
  const clean = items.filter((x) => x && x.h !== item.h); // dedupe — most recent first
  clean.unshift({
    h: item.h,
    u: String(item.u || '').slice(0, 600),
    p: String(item.p || '').slice(0, 16),
    l: isFinite(item.l) ? Math.round(Number(item.l)) : null,
    ts: Date.now(),
  });
  const next = clean.slice(0, HIST_CAP);
  await kvPut(env, 'hist:' + uid, JSON.stringify(next), 180 * 86400); // persistent, self-healing TTL
  return next;
}

/* ──────────── cfg:admin (runtime settings · editable from the panel) ─────── */

const CFG_DEFAULT = {
  force_join: true,          // gate the bot behind official-channel membership
  channel_user: CHANNEL_USER,
  card_enabled: true,        // daily photo card in the channel
  digest_enabled: true,      // periodic live digest in the channel (/freq)
  watchtower_enabled: true,  // per-run alerts to opted-in users
  ref_base: REF_BASE,
  ref_cap: REF_CAP,
  /* D8/P6 — notifications & quiet hours (admin panel, phase 1) */
  watchtower_cap: 20,        // max watchtower recipients per run (free-plan budget)
  quiet_enabled: false,      // «ساعات سکوت» — no automated messages in the window
  quiet_start: 2,            // Tehran local hour, inclusive
  quiet_end: 8,              // Tehran local hour, exclusive
  admin_ids: [],             // managed via /setup?admin=<id> and the panel
  /* D10/U3 — Friday personal weekly summary (quiet-hours + per-week guard) */
  weekly_enabled: true,
};

/* Tehran is UTC+3:30 year-round → local hour helper for quiet hours */
function tehranHour() {
  try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date()) * 1; }
  catch (_) { return ((new Date().getUTCHours() + 3) + Math.floor((new Date().getUTCMinutes() + 30) / 60)) % 24; }
}
function inQuietHours(cfg) {
  if (!cfg || cfg.quiet_enabled !== true) return false;
  const h = tehranHour(), a = ((cfg.quiet_start ?? 2) % 24 + 24) % 24, b = ((cfg.quiet_end ?? 8) % 24 + 24) % 24;
  return a === b ? true : (a < b ? (h >= a && h < b) : (h >= a || h < b));
}

async function getCfg(env) {
  const c = await kvGet(env, 'cfg:admin', 'json');
  return { ...CFG_DEFAULT, ...(c && typeof c === 'object' ? c : {}) };
}
const putCfg = (env, c) => kvPut(env, 'cfg:admin', JSON.stringify(c));

/* ───────── D8 — pipeline knobs (cfg:pipeline → /api/pipeline-cfg) ─────────
   The GitHub Action reads this every run (fail-safe on the pipeline side too).
   Values mirror pipeline/bank.py PCFG_SPEC — out-of-range junk is ignored. */
const PCFG_DEFAULT = {
  bank_ttl_hours: 28, pass2_enabled: true, pass2_factor: 2.0,
  suspect_after: 2, quarantine_after: 3, quarantine_days: 7,
  min_streak_priority: 1,
  rescue_enabled: true, rescue_min_streak: 5, rescue_max: 1500,
  skip_test: false, force_full_scan: false,
  /* D9/G2 — panel phase 2: remark template · sub caps · export selection · smart TTL */
  remark_tpl: 'Ariston{-GOLD}-{ping}ms',
  sub_max_lines: 300, sub_min_op_lines: 10,
  exports_mihomo: true, exports_singbox: true, exports_base64: true,
  smart_ttl: true,
  /* D10/G5 — panel phase 3: filters & strictness. Every list is a csv string,
     EMPTY = the feature is off (classic behavior — the fail-safe default). */
  gold_min: 80, silver_min: 55, strictness: 0,
  proto_allow: '', deny_kw: '', allow_kw: '', geo_allow: '', geo_deny: '',
};
const PCFG_RANGE = {
  bank_ttl_hours: [6, 72], pass2_factor: [1, 3], suspect_after: [1, 10],
  quarantine_after: [2, 20], quarantine_days: [1, 30], min_streak_priority: [1, 10],
  rescue_min_streak: [2, 20], rescue_max: [0, 5000],
  sub_max_lines: [50, 500], sub_min_op_lines: [3, 50],
  gold_min: [50, 95], silver_min: [25, 79], strictness: [0, 2],
};
const PCFG_BOOLS = ['pass2_enabled', 'rescue_enabled', 'skip_test', 'force_full_scan', 'exports_mihomo', 'exports_singbox', 'exports_base64', 'smart_ttl'];
const PCFG_STRINGS = ['remark_tpl'];
const PCFG_CSVS = ['proto_allow', 'deny_kw', 'allow_kw', 'geo_allow', 'geo_deny'];
const sanitizeTpl = (v) => String(v == null ? '' : v).replace(/[#\r\n\t]/g, ' ').trim().slice(0, 48);
/* D10/G5 — csv knob: lowercase word list, everything but [a-z0-9:._*-] is a
   separator, deduped, ≤400 chars. Junk/empty → '' (= feature off). */
const sanitizeCsv = (v) => {
  const words = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9:._*-]/g, ' ').split(/\s+/);
  const out = [];
  for (const w of words) if (w && !out.includes(w)) out.push(w);
  return out.join(',').slice(0, 400);
};
/* same truthy set as the pipeline's clamp (bank.py) → the two layers never disagree */
const boolish = (v) => v === true || v === 1 || (typeof v === 'string' && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

async function getPipelineCfg(env) {
  const out = { ...PCFG_DEFAULT };
  const c = await kvGet(env, 'cfg:pipeline', 'json');
  if (c && typeof c === 'object') {
    for (const k of Object.keys(PCFG_DEFAULT)) {
      if (!(k in c)) continue;
      if (PCFG_BOOLS.includes(k)) { out[k] = boolish(c[k]); continue; }
      if (PCFG_STRINGS.includes(k)) { const s = sanitizeTpl(c[k]); if (s.length >= 3 && /[A-Za-z\u0600-\u06FF]/.test(s)) out[k] = s; continue; }
      if (PCFG_CSVS.includes(k)) { out[k] = sanitizeCsv(c[k]); continue; }
      const n = Number(c[k]);
      const r = PCFG_RANGE[k];
      if (isFinite(n)) out[k] = r ? Math.min(r[1], Math.max(r[0], n)) : n;  // clamp, never pass junk
    }
  }
  return out;
}
const putPipelineCfg = (env, c) => kvPut(env, 'cfg:pipeline', JSON.stringify(c));

/* D8/P3 — panel-requested «full scan» is one-shot: once a run whose own
   stats.json echoes it (pipeline_cfg.requested) is live, reset + tell admins. */
async function consumePipelineRequest(env) {
  try {
    const pc = await getPipelineCfg(env);
    if (pc.force_full_scan !== true) return;
    const s = await getStats(env, true);
    const req = s && s.pipeline_cfg && s.pipeline_cfg.requested;
    if (!s || !s.generated_at || !req || req.force_full_scan !== true) return;
    await putPipelineCfg(env, { ...pc, force_full_scan: false });
    const last = await kvGet(env, 'pcfg:last_full_done');
    if (last === s.generated_at) return;
    await kvPut(env, 'pcfg:last_full_done', s.generated_at);
    const cfg = await getCfg(env);
    const owner = await kvGet(env, 'meta:owner');
    const ids = [...new Set([...(cfg.admin_ids || []).map(String), owner].filter(Boolean).map(String))];
    for (const id of ids) {
      const u = await getUser(env, id);
      await sendMessage(env, id, '🛠 ⚙️ اسکن کامل درخواستیِ پنل تمام شد و دور جدید منتشر شد.\n🕐 دور: ' + runStamp(s) + '\n✅ فلگ «اسکن کامل دستی» ریست شد.').catch(() => null);
    }
  } catch (_) { /* never break the cron over the request bookkeeping */ }
}

async function isAdmin(env, chatId, cfg) {
  const c = cfg || (await getCfg(env));
  if ((c.admin_ids || []).map(String).includes(String(chatId))) return true;
  const owner = await kvGet(env, 'meta:owner'); // D4: first /start claims ownership
  return owner !== null && owner === String(chatId);
}

/* ── D9/G4-3 — user blocking: KV `blocked:<id>` gates every bot interaction.
   Fail-safe: a KV hiccup = the user is NOT blocked (the bot keeps serving). ── */
async function isBlocked(env, chatId) {
  try { return Boolean(await kvGet(env, 'blocked:' + chatId)); } catch (_) { return false; }
}

/* ── D9/G4-5 — admin activity log (append-only, last 100, fail-safe) ── */
async function audit(env, tgUser, act, detail) {
  try {
    const log = (await kvGet(env, 'audit:log', 'json')) || [];
    if (!Array.isArray(log)) return;
    log.unshift({
      ts: new Date().toISOString(),
      id: tgUser && tgUser.id ? tgUser.id : null,
      name: tgUser ? (tgUser.first_name || tgUser.username || '') : '',
      act, d: String(detail == null ? '' : detail).slice(0, 120),
    });
    await kvPut(env, 'audit:log', JSON.stringify(log.slice(0, 100)));
  } catch (_) { /* audit must never break the admin action itself */ }
}

/* ── D9/G2-4 — editable automated-message templates (KV `cfg:templates`).
   Empty = the classic built-in text (fail-safe default). Vars: {gold} {alive}
   {p50} {sources_ok} {sources_total} {bank_size} {hit} {streak} {date} {last_run}. ── */
const TPL_DEFAULT = { watchtower: '', card: '', digest: '', weekly: '' };
async function getTemplates(env) {
  const t = await kvGet(env, 'cfg:templates', 'json');
  const out = { ...TPL_DEFAULT };
  if (t && typeof t === 'object') for (const k of Object.keys(TPL_DEFAULT)) {
    const s = String(t[k] == null ? '' : t[k]).slice(0, 900);
    if (s.trim()) out[k] = s;   // empty/whitespace = back to the default text
  }
  return out;
}
function renderTpl(tpl, vars) {
  if (!tpl || typeof tpl !== 'string' || !tpl.trim()) return null; // no template → caller's default
  try {
    const out = tpl.replace(/\{([a-z_0-9]+)\}/g, (_, k) => (vars && k in vars ? String(vars[k] ?? '') : '')).trim();
    return out || null;
  } catch (_) { return null; }
}

/* plan B (escalating): ref 1–2 → +1 each · ref 3–5 → +2 each · ref 6+ → +3 each */
function refQuota(refs, cfg) {
  const base = (cfg && cfg.ref_base) || REF_BASE;
  const cap = (cfg && cfg.ref_cap) || REF_CAP;
  const bonus = Math.min(refs, 2) + Math.min(Math.max(refs - 2, 0), 3) * 2 + Math.max(refs - 5, 0) * 3;
  return Math.min(cap, base + bonus);
}

/* D9/G4-4 — per-user quota override (admin panel): when set, it replaces the
   referral formula entirely (clamped 0..50). null/undefined = classic behavior. */
function resolveQuota(user, cfg) {
  const ovr = user && user.quota_ovr;
  if (ovr == null || !isFinite(Number(ovr))) return refQuota((user && user.ref_count) || 0, cfg);
  return Math.min(50, Math.max(0, Math.round(Number(ovr))));
}

/* ─────────────────── forced join (official channel gate) ────────────── */

async function resolveChannel(env, cfg) {
  const user = (cfg && cfg.channel_user) || CHANNEL_USER;
  let id = await kvGet(env, 'meta:channel');
  if (!id) {
    const g = await api(env, 'getChat', { chat_id: '@' + user });
    if (g && g.ok && g.result && g.result.id) {
      id = String(g.result.id);
      await kvPut(env, 'meta:channel', id);
    }
  }
  return id ? { id, user } : null;
}

async function isMember(env, chatId, chan) {
  const r = await api(env, 'getChatMember', { chat_id: chan.id, user_id: chatId });
  if (!r || !r.ok) return true; // fail-open: an API hiccup must never lock users out
  const st = r.result && r.result.status;
  return MEMBER_OK.has(st); // D10.1/B3 — 'restricted' users are joined too (muted ≠ left)
}

/* D10.1/B3 — membership verdict with a short KV cache so EVERY access path
   (bot commands · mini app · /u/ feeds · broadcasts · inline) can afford to
   ask on every hit without burning the getChatMember budget.
   positive 30 min · negative 3 min · API hiccups stay fail-open and uncached. */
const MEMBER_OK = new Set(['member', 'administrator', 'creator', 'restricted']);
async function membership(env, chatId, cfg) {
  const key = 'mem:' + chatId;
  const hit = await kvGet(env, key);
  if (hit === 'in') return true;
  if (hit === 'out') return false;
  const chan = await resolveChannel(env, cfg);
  if (!chan) return true; // channel unresolvable → never lock users out
  const r = await api(env, 'getChatMember', { chat_id: chan.id, user_id: chatId });
  if (!r || !r.ok) return true; // fail-open, never cached
  const ok = MEMBER_OK.has(r.result && r.result.status);
  await kvPut(env, key, ok ? 'in' : 'out', ok ? 1800 : 180);
  return ok;
}

/* pure check — sends nothing. Admins and force_join=off always pass. */
async function gateUser(env, chatId, cfg) {
  if (!cfg || cfg.force_join === false) return true;
  if (await isAdmin(env, chatId, cfg)) return true;
  return membership(env, chatId, cfg);
}

/* returns true when the user may proceed; otherwise sends the join wall */
async function gateJoin(env, chatId, cfg, lang) {
  if (!cfg.force_join) return true;
  if (await isAdmin(env, chatId, cfg)) return true;
  const chan = await resolveChannel(env, cfg);
  if (!chan) return true; // channel unresolvable → never lock users out
  if (await membership(env, chatId, cfg)) return true;
  await sendMessage(env, chatId, t(lang, 'join_wall'), {
    reply_markup: { inline_keyboard: [
      [{ text: '🔔 @' + chan.user, url: 'https://t.me/' + chan.user, style: 'primary' }],
      [{ text: t(lang, 'join_done'), callback_data: 'join:check', style: 'success' }],
    ] },
  });
  return false;
}

/* referral credit — runs once, when a referred user finishes onboarding */
async function creditReferral(env, chatId) {
  const user = await getUser(env, chatId);
  if (!user || !user.ref_by || user.ref_credited) return;
  const refId = String(user.ref_by);
  user.ref_credited = true;
  await saveUser(env, chatId, user);
  if (refId === String(chatId)) return;
  const cfg = await getCfg(env);
  const ru = await getUser(env, refId);
  if (!ru) return;
  ru.ref_count = (ru.ref_count || 0) + 1;
  await saveUser(env, refId, ru);
  const q = refQuota(ru.ref_count, cfg);
  const lang = ru.lang || 'fa';
  await sendMessage(env, refId, t(lang, 'ref_credited', { name: user.tg || user.name || '👤', q, cap: cfg.ref_cap || REF_CAP }));
}

/* ───────────── D4 — brand remarks + personalized allocation ───────── */

const cleanName = (s) => String(s || '').replace(/[#\r\n<>&|]/g, '').trim().slice(0, 24);

/* remark = <name>-Ariston-<ping>ms (bot/miniapp) or Ariston-<ping>ms (github) */
const brandRemark = (name, ping) =>
  [name ? cleanName(name) : null, BRAND, ping != null && isFinite(ping) ? Math.round(ping) + 'ms' : null]
    .filter(Boolean).join('-');

function remarkUri(uri, remark) {
  if (!remark || typeof uri !== 'string') return uri;
  const base = uri.split('#')[0];
  if (base.startsWith('vmess://')) {
    try { // vmess carries the label inside the base64 JSON (ps field)
      const raw = atob(base.slice(8).replace(/-/g, '+').replace(/_/g, '/'));
      const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
      json.ps = remark;
      const enc = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(json))));
      return 'vmess://' + enc;
    } catch (_) { return uri; }
  }
  return base + '#' + encodeURIComponent(remark);
}

/* results.json → { hash16: latency_ms } — cached 30 min */
async function getLatencyMap(env) {
  const cached = await kvGet(env, 'rich:latmap', 'json');
  if (cached && cached.ts && Date.now() - cached.ts < 30 * 60 * 1000 && cached.map) return cached.map;
  const raw = await fetchTextCached(env, 'results.json', 1800);
  let res = {}; try { res = raw ? JSON.parse(raw) : {}; } catch (_) {}
  const map = {};
  for (const [h, r] of Object.entries(res)) if (r && typeof r.latency_ms === 'number') map[h] = r.latency_ms;
  if (Object.keys(map).length) await kvPut(env, 'rich:latmap', JSON.stringify({ ts: Date.now(), map }), 3600);
  return map;
}

/* D8/U5 — operators.json (pipeline) → { hash16: iran-operator slug } — cached 30 min.
   Any absence = «no chip» on the card; the feature degrades to the old look. */
async function getOperatorMap(env) {
  const cached = await kvGet(env, 'rich:opmap', 'json');
  if (cached && cached.ts && Date.now() - cached.ts < 30 * 60 * 1000 && cached.map) return cached.map;
  const raw = await fetchTextCached(env, 'operators.json', 1800);
  let map = {};
  try { map = raw ? JSON.parse(raw) : {}; } catch (_) { map = {}; }
  if (map && typeof map === 'object' && Object.keys(map).length) {
    await kvPut(env, 'rich:opmap', JSON.stringify({ ts: Date.now(), map }), 3600);
  }
  return map && typeof map === 'object' ? map : {};
}

/* same golden-rule pool as the old subscription (operator → gold+silver → validated).
   D9/G2-2 — the «operator file too small» threshold is panel-tunable. */
async function buildPool(env, user, pcfg) {
  let lines = [], usedFallback = false;
  const minOp = Math.max(1, parseInt((pcfg && pcfg.sub_min_op_lines) || SUB_MIN_OP_LINES, 10) || SUB_MIN_OP_LINES);
  if (user.isp && user.isp !== 'other') {
    lines = toLines(await fetchTextCached(env, 'by-operator/' + user.isp + '.txt', FILE_TTL_SEC));
  }
  if (lines.length < minOp) {
    const gold = toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC));
    const silver = toLines(await fetchTextCached(env, 'silver.txt', FILE_TTL_SEC));
    lines = [...new Set([...gold, ...silver])];
    if (!lines.length) lines = toLines(await fetchTextCached(env, 'validated.txt', FILE_TTL_SEC));
    usedFallback = Boolean(user.isp && user.isp !== 'other');
  }
  return { lines, usedFallback };
}

/*
 * D4 — personal allocation: SUB_ALLOCATION picks per user, stable for the whole
 * rotation period (daily by Tehran date, or "per run" = latest generated_at).
 * Deterministic per (token, period) but diversified across users: everyone gets
 * a different slice of the quality-ordered pool (rank + seeded jitter window),
 * so load spreads over many configs instead of hammering the same top-10.
 */
async function allocateSub(env, user, chatId) {
  const rot = user.rotation === 'run' ? 'run' : 'day';
  const cfg = await getCfg(env);
  const pcfg = await getPipelineCfg(env);
  const quota = resolveQuota(user, cfg); // D9/G4-4: override wins, else referral formula
  let period;
  if (rot === 'run') { const s = await getStats(env); period = (s && s.generated_at) || tehranDate(); }
  else period = tehranDate();
  const prev = await kvGet(env, 'alloc:' + user.token, 'json');
  if (prev && prev.period === period && Array.isArray(prev.items) && prev.items.length === quota) {
    return { ...prev, rotation: rot };
  }
  const { lines, usedFallback } = await buildPool(env, user, pcfg);
  if (!lines.length) return null;
  const latmap = await getLatencyMap(env);
  const scored = [];
  for (const uri of lines) {
    const hash = await sha16(uri);
    const ping = latmap[hash] != null ? latmap[hash] : null;
    scored.push({ uri, hash, ping });
  }
  const order = scored.map((_, i) => i);
  order.sort((a, b) => (scored[a].ping ?? 9e9) - (scored[b].ping ?? 9e9)); // quality: latency asc, unknown last
  const spread = Math.min(50, scored.length);
  const rnd = mulberry32(fnv(String(user.token) + '|' + period));
  const keyed = order.map((idx, rank) => ({ idx, key: rank + Math.floor(rnd() * spread) }));
  keyed.sort((a, b) => a.key - b.key);
  /* D9/U2 — personalization: the user's own ✅/❌ marks re-weight the draw.
     ✅-marked configs float ~14 ranks up, ❌-marked sink ~14 ranks down (the
     seeded jitter window is ≤50). No marks at all → bit-identical to before. */
  if (chatId != null) {
    const marks = await marksGet(env, chatId);
    if (marks && Object.keys(marks).length) {
      let touched = false;
      for (const k of keyed) {
        const m = marks[scored[k.idx].hash];
        if (m === 1) { k.key -= 14; touched = true; }
        else if (m === 2) { k.key += 14; touched = true; }
      }
      if (touched) keyed.sort((a, b) => a.key - b.key);
    }
  }
  const items = keyed.slice(0, quota).map((k) => scored[k.idx]);
  const out = { period, rotation: rot, created: new Date().toISOString(), usedFallback, items };
  await kvPut(env, 'alloc:' + user.token, JSON.stringify(out), 172800);
  return out;
}

/* per-user connect marks (✅/❌ in the Mini App) — separate from crowd 👍/👎 */
async function marksGet(env, chatId) { return (await kvGet(env, 'fbu:' + chatId, 'json')) || {}; }
async function markSet(env, chatId, hash, mark) { // mark: 1 ok | 2 fail | 0 clear
  const cur = await marksGet(env, chatId);
  if (mark) cur[hash] = mark; else delete cur[hash];
  await kvPut(env, 'fbu:' + chatId, JSON.stringify(cur), 604800);
  return cur[hash] || 0;
}

/* ─────── D8/U3 — favorites ⭐: the configs the user starred (≤50, sticky) ─── */

const FAV_CAP = 50;
async function favsGet(env, uid) {
  const f = await kvGet(env, 'fav:' + uid, 'json');
  return Array.isArray(f) ? f : [];
}
async function favsSet(env, uid, items) {
  await kvPut(env, 'fav:' + uid, JSON.stringify(items), 365 * 86400);
  return items;
}

/* ─────────────────────── watchtower (new-run broadcast) ───────────────────── */

async function idxAdd(env, chatId) {
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  if (!Array.isArray(idx)) return;
  if (!idx.includes(chatId)) {
    idx.push(chatId);
    await kvPut(env, 'users:index', JSON.stringify(idx.slice(-5000)));
  }
}

async function broadcastNewRun(env) {
  const cfg = await getCfg(env);
  if (cfg.watchtower_enabled === false) return;
  if (inQuietHours(cfg)) return; // D8/P6 — quiet hours: no automated pings
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring || !s.generated_at) return;
  if (s.validation.skipped) return; // D8/H — a skip_test run has no honest numbers
  const last = await kvGet(env, 'watch:last_gen');
  if (last === s.generated_at) return;
  await kvPut(env, 'watch:last_gen', s.generated_at);
  if (!last) return; // first boot: record baseline, don't spam
  const origin = await kvGet(env, 'meta:origin');
  const cap = Math.min(100, Math.max(1, parseInt(cfg.watchtower_cap, 10) || 20));
  const idx = ((await kvGet(env, 'users:index', 'json')) || []).slice(-cap); // free-plan subrequest budget
  const v = s.validation, p = v.latency_ms || {};
  /* D9/G2-4 — panel template override (empty = the built-in text) */
  const tpl = (await getTemplates(env)).watchtower;
  const custom = renderTpl(tpl, { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0) });
  for (const chatId of idx) {
    try {
      if (!(await gateUser(env, chatId, cfg))) continue; // D10.1/B3 — no run pings for leavers
      const u = await getUser(env, chatId);
      const lang = (u && u.lang) || 'fa';
      /* D10.2/B2 — the ping carries the run's own clock, so a recipient can
         never read «تموم شد!» while the panel claims an older run */
      const body = (custom || t(lang, 'watchtower', { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0) }))
        + '\n🕐 ' + t(lang, 'last_run', { t: relTime(runStamp(s), lang) });
      const rows = [];
      if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
      rows.push([{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold' }]);
      await sendMessage(env, chatId, body, { reply_markup: { inline_keyboard: rows } });
    } catch (_) { /* keep broadcasting */ }
  }
}

/* ─────────────────── daily channel card (official channel) ────────────────── */

/* ─────── D9/U2 — «محبوبت مُرد»: a starred config died → tell its fan.
   Detection: the fav's hash is neither in gold nor alive in results.json.
   Suggestion: the closest gold config (same protocol first, then best ping).
   Budget: 12 users per cron tick (cursor loops the user index), one message
   per dead fav per week (KV guard, 7d TTL), quiet hours respected. ─────── */
const FAVSCAN_CHUNK = 12;
async function favDeathScan(env) {
  const cfg = await getCfg(env);
  if (inQuietHours(cfg)) return;
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring || s.validation.skipped) return;
  const origin = await kvGet(env, 'meta:origin');
  if (!origin) return;
  /* the gold shelf + results.json = the «is it really gone» evidence */
  const gold = await getEnrichedGold(env);
  if (!gold.length) return;
  const goldHashes = new Set(gold.map((g) => g.hash));
  let res = {};
  try { res = JSON.parse((await fetchTextCached(env, 'results.json', 1800)) || '{}') || {}; } catch (_) {}
  const isDead = (h) => !goldHashes.has(h) && (!res[h] || !res[h].last_ok
    || (Date.now() - Date.parse(res[h].last_ok)) > 12 * 3600e3);
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const total = idx.length;
  if (!total) return;
  let cursor = parseInt((await kvGet(env, 'favscan:cursor')) || '0', 10) || 0;
  if (cursor >= total) cursor = 0; // wrapped around — start a fresh lap
  let sent = 0;
  const end = Math.min(total, cursor + FAVSCAN_CHUNK);
  for (; cursor < end && sent < FAVSCAN_CHUNK; cursor++) {
    const chatId = idx[total - 1 - cursor]; // newest users first
    if (chatId == null) continue;
    try {
      if (await isBlocked(env, chatId)) continue;
      if (!(await gateUser(env, chatId, cfg))) continue; // D10.1/B3 — leavers get no fav-death pings
      const favs = await favsGet(env, chatId);
      if (!favs.length) continue;
      const dead = favs.find((f) => f && f.h && isDead(f.h));
      if (!dead) continue;
      const guard = 'favdead:' + chatId + ':' + dead.h;
      if (await kvGet(env, guard)) continue; // already mourned this one
      /* closest look-alike: same protocol first, then the lowest ping */
      const pool = dead.p ? gold.filter((g) => String(g.uri).startsWith(dead.p + '://')) : [];
      const cand = (pool.length ? pool : gold)
        .filter((g) => g.hash !== dead.h)
        .sort((a, b) => (a.latency_ms ?? 9e9) - (b.latency_ms ?? 9e9))[0];
      if (!cand) continue;
      const u = await getUser(env, chatId);
      const lang = (u && u.lang) || 'fa';
      const rows = [];
      if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
      rows.push([{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold' }]);
      const lat = cand.latency_ms != null ? Math.round(cand.latency_ms) + 'ms' : '—';
      await sendMessage(env, chatId,
        t(lang, 'fav_dead') + '\n⚡ ' + t(lang, 'btn_best') + ': ~' + lat,
        { reply_markup: { inline_keyboard: rows } });
      await kvPut(env, guard, '1', 7 * 86400); // one eulogy per fav per week
      sent++;
    } catch (_) { /* keep scanning */ }
  }
  await kvPut(env, 'favscan:cursor', String(cursor >= total ? 0 : cursor), 172800);
}

/* ─── D10/G7 — error ring buffer: the last 10 worker-side errors in KV `err:log`.
   fail-safe by construction: logging must never throw, never break the caller. ─── */
async function logErr(env, where, message) {
  try {
    const log = (await kvGet(env, 'err:log', 'json')) || [];
    if (!Array.isArray(log)) return;
    log.unshift({ ts: new Date().toISOString(), w: String(where || '').slice(0, 40), m: String(message || '').slice(0, 220) });
    await kvPut(env, 'err:log', JSON.stringify(log.slice(0, 10)), 30 * 86400);
  } catch (_) { /* never */ }
}

/* ─── D10/U3-4 — invite tiering: naming the escalation ladder (bronze → gold).
   Pure display + progress — resolveQuota stays bit-identical (the plan-B
   formula already pays more quota; tiers make it visible and explainable). ─── */
const REF_TIERS = [
  { key: 'gold', min: 6 },
  { key: 'silver', min: 3 },
  { key: 'bronze', min: 0 },
];
function userLevel(refs) {
  const r = Math.max(0, parseInt(refs, 10) || 0);
  const tier = REF_TIERS.find((x) => r >= x.min) || REF_TIERS[2];
  const next = REF_TIERS[REF_TIERS.indexOf(tier) - 1] || null; // undefined at gold
  return { key: tier.key, refs: r, next: next ? next.key : null, need: next ? Math.max(0, next.min - r) : 0 };
}

/* Tehran weekday ('Fri' on Fridays) + ISO-week key for the weekly guards */
function tehranWeekday() {
  try { return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Tehran' }).format(new Date()); }
  catch (_) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getUTCDay()]; }
}
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - y0) / 86400e3) + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}

/* ─── D10/U3-1 — personal weekly summary, Fridays Tehran, from the user's own
   history + connect marks (no global data, nothing to leak).  Chunked cursor
   like favDeathScan (10 users/tick), one message per user per ISO-week,
   quiet hours respected, weekly_enabled is the panel switch. ─── */
const WK_CHUNK = 10;
async function weeklyDigest(env) {
  const cfg = await getCfg(env);
  if (cfg.weekly_enabled === false) return;
  if (inQuietHours(cfg)) return;
  if (tehranWeekday() !== 'Fri') return;
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const total = Array.isArray(idx) ? idx.length : 0;
  if (!total) return;
  const wk = isoWeekKey(new Date());
  if ((await kvGet(env, 'wk:done:' + wk)) === '1') return; // lap complete
  let cursor = parseInt((await kvGet(env, 'wk:cursor')) || '0', 10) || 0;
  if (cursor >= total) cursor = 0;
  const origin = await kvGet(env, 'meta:origin');
  const s = await getStats(env);
  const gold = s && s.scoring ? s.scoring.gold : null;
  const alive = s && s.validation ? s.validation.alive : null;
  let sent = 0;
  const end = Math.min(total, cursor + WK_CHUNK);
  for (; cursor < end && sent < WK_CHUNK; cursor++) {
    const chatId = idx[total - 1 - cursor]; // newest users first
    if (chatId == null) continue;
    try {
      if (await isBlocked(env, chatId)) continue;
      if (!(await gateUser(env, chatId, cfg))) continue; // D10.1/B3 — leavers get no weekly summary
      const guard = 'wk:sent:' + chatId + ':' + wk;
      if (await kvGet(env, guard)) continue;
      const u = await getUser(env, chatId);
      const lang = (u && u.lang) || 'fa';
      const hist = await historyGet(env, chatId); // newest-first, ≤20
      const marks = await marksGet(env, chatId);
      const cutoff = Date.now() - 7 * 86400e3;
      const week = hist.filter((x) => x && x.ts && x.ts >= cutoff);
      const ok = week.filter((x) => marks[x.h] === 1).length;
      const fail = week.filter((x) => marks[x.h] === 2).length;
      const lvl = userLevel(u ? u.ref_count : 0);
      const rows = [];
      if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
      rows.push([{ text: t(lang, 'btn_sub'), callback_data: 'menu:sub' }]);
      const custom = renderTpl((await getTemplates(env)).weekly, {
        tried: fmt(week.length), ok: fmt(ok), fail: fmt(fail),
        quota: fmt(resolveQuota(u, cfg)), tier: t(lang, 'tier_' + lvl.key),
        gold: gold != null ? fmt(gold) : '—', alive: alive != null ? fmt(alive) : '—',
      });
      const msg = custom || [
        t(lang, 'wk_title'),
        '',
        t(lang, 'wk_tried', { n: fmt(week.length) }),
        '✅ ' + fmt(ok) + '  ·  ❌ ' + fmt(fail),
        t(lang, 'wk_quota', { q: fmt(resolveQuota(u, cfg)), tier: t(lang, 'tier_' + lvl.key) }),
        t(lang, 'wk_gold', { gold: gold != null ? fmt(gold) : '—', alive: alive != null ? fmt(alive) : '—' }),
      ].join('\n');
      await sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: rows } });
      await kvPut(env, guard, '1', 9 * 86400); // one summary per user per week
      sent++;
    } catch (_) { /* keep scanning */ }
  }
  await kvPut(env, 'wk:cursor', String(cursor >= total ? 0 : cursor), 172800);
  if (cursor >= total) await kvPut(env, 'wk:done:' + wk, '1', 9 * 86400);
}

/* ─── D10/U3-3 — «ران دیر شد»: the Actions cron fires every 30 min, so a
   stats.json older than 45 min means a run failed or was skipped.  The alert
   goes to the admins (ops channel — quiet hours do NOT apply to it), at most
   once per stale generation + a hourly nudge while it stays stale. ─── */
async function lateRunCheck(env) {
  const s = await getStats(env);
  const stamp = runStamp(s); // D10.2/B2 — «late» is measured from publish, not run start
  if (!stamp) return; // no data yet → nothing to compare
  const ageMin = (Date.now() - Date.parse(stamp)) / 60000;
  if (!isFinite(ageMin) || ageMin <= 45) {
    await kvDel(env, 'late:alert'); // fresh again → reset the nudges
    return;
  }
  const gen = String(stamp);
  const perGen = 'late:' + gen;
  const hourly = (await kvGet(env, 'late:alert')) || '';
  const firstForThisGen = (await kvGet(env, 'late:gen')) !== gen;
  if (!firstForThisGen && hourly && (Date.now() - Date.parse(hourly)) < 3600e3) return;
  const ids = new Set([
    ...(((await getCfg(env)).admin_ids) || []).map(String),
    String(await kvGet(env, 'meta:owner') || ''),
  ].filter(Boolean));
  for (const id of ids) {
    const u = await getUser(env, id);
    const lang = (u && u.lang) || 'fa';
    await sendMessage(env, id, t(lang, 'late_run', { min: Math.round(ageMin), run: gen.slice(0, 16).replace('T', ' ') })
      + '\n🔗 github.com/Edsel-Rahimi/Ariston/actions').catch(() => null);
  }
  await kvPut(env, 'late:gen', gen, 172800);
  await kvPut(env, 'late:alert', new Date().toISOString(), 172800);
  if (firstForThisGen) await kvPut(env, perGen, '1', 86400); // marker (diagnostics)
  await logErr(env, 'late-run', 'stats age ' + Math.round(ageMin) + 'min (gen ' + gen + ')');
}

async function dailyChannelCard(env, force = false) {
  const cfg = await getCfg(env);
  if (cfg.card_enabled === false) return;
  if (inQuietHours(cfg)) return; // D8/P6 — quiet hours
  const chan = env.CHANNEL_ID || (await kvGet(env, 'meta:channel'));
  if (!chan) return; // not configured → silent no-op
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (!force) {
    if ((await kvGet(env, 'card:last')) === today) return;    // already posted today
    if (now.getUTCHours() < 9) return;                       // first cron after 09:00 UTC (≈12:30 Tehran)
  }

  const s = await getStats(env, true); // D10.1/B1 — caption must quote the run the card shows
  if (!s || !s.validation || !s.scoring) return;
  if (s.validation.skipped) return; // D8/H — no honest numbers in a skip_test run
  const lang = (await kvGet(env, 'meta:channel_lang')) || 'fa';
  const v = s.validation, p = v.latency_ms || {};
  const dateStr = (() => { try { return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(now); } catch (_) { return today; } })();

  let bestLine = '';
  try {
    const items = await getEnrichedGold(env);
    const scored = items.filter((x) => x.ema !== null);
    const pool = scored.length ? scored : items;
    if (pool.length) {
      const best = [...pool].sort((a, b) =>
        ((b.ema || 0) - (a.ema || 0)) || ((a.latency_ms === null ? 9e9 : a.latency_ms) - (b.latency_ms === null ? 9e9 : b.latency_ms))
      )[0];
      const lat = best.latency_ms !== null ? Math.round(best.latency_ms) + 'ms' : '—';
      /* D5: stats only in the caption — the config link itself never goes to the channel */
      bestLine = '\n\n' + t(lang, 'daily_best') + '\n✅ ' + (best.ema !== null ? Math.round(best.ema * 100) + '%' : '—') + ' · ⚡ ' + lat + '\n👑 ' + t(lang, 'btn_app');
    }
  } catch (_) { /* card without best-of-day still ships */ }

  const origin = await kvGet(env, 'meta:origin');
  const bot = (await kvGet(env, 'meta:bot_username')) || null;
  const tplV = { date: dateStr, gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0),
    last_run: relTime(runStamp(s), lang),
    sources_ok: fmt(s.sources_ok), sources_total: fmt(s.sources_total),
    bank_size: s.bank && s.bank.size != null ? fmt(s.bank.size) : '—',
    hit: s.bank && s.bank.hit_rate != null ? s.bank.hit_rate : '—',
    streak: s.bank && s.bank.avg_streak != null ? s.bank.avg_streak : '—' };
  const tplMsg = renderTpl((await getTemplates(env)).card, tplV);
  const msg = tplMsg || [
    t(lang, 'daily_title'),
    '🗓 ' + dateStr, '',
    '🥇 ' + fmt(s.scoring.gold) + '  ·  ❤️ ' + fmt(v.alive) + '  ·  ⚡ ' + Math.round(p.p50 || 0) + 'ms',
    '🕐 ' + t(lang, 'last_run', { t: relTime(runStamp(s), lang) }),
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    '📈 ' + (Object.entries(v.by_protocol_alive || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => esc(k) + ' ' + fmt(n)).join(' · ') || '—'),
    /* D7 — config bank line (matches the bank-card artwork on GitHub) */
    ...(s.bank && s.bank.size != null ? [
      t(lang, 'bank_line', { n: fmt(s.bank.size), hit: s.bank.hit_rate != null ? s.bank.hit_rate : '—', streak: s.bank.avg_streak != null ? s.bank.avg_streak : '—' }),
    ] : []),
    bestLine,
  ].join('\n');

  /* D4.2 approved buttons — deep links open the bot on the right screen */
  const rows = [];
  if (bot) rows.push([
    { text: '⚡ ' + t(lang, 'btn_best'), url: 'https://t.me/' + bot + '?start=best', style: 'primary' },
    { text: '🔗 ' + t(lang, 'btn_sub'), url: 'https://t.me/' + bot + '?start=sub', style: 'success' },
  ]);
  const row2 = [];
  if (origin) row2.push({ text: '👑 ' + t(lang, 'btn_app'), url: origin + '/app' });
  if (bot) row2.push({ text: '🚀 @' + bot, url: 'https://t.me/' + bot });
  if (row2.length) rows.push(row2);

  /* D4.2: the brand PNG committed by CI beats the in-worker raster; text is the last resort */
  let sent = null;
  try {
    const png = (await fetchCardPng(env, s)) || (await renderCardPNG(s));
    sent = await sendPhotoFile(env, chan, png, 'ariston-card.png', msg.slice(0, 1024), { reply_markup: { inline_keyboard: rows }, disable_notification: false });
  } catch (e) { console.error('card png error', e && e.message); }
  if (!sent || !sent.ok) sent = await sendMessage(env, chan, msg, { reply_markup: { inline_keyboard: rows }, disable_notification: false });
  if (sent && sent.ok) await kvPut(env, 'card:last', today, 172800);
}

/* ───────── periodic channel digest — every N hours (/freq) ───────────────── */

async function channelDigest(env) {
  const cfg = await getCfg(env);
  if (cfg.digest_enabled === false) return;
  if (inQuietHours(cfg)) return; // D8/P6 — quiet hours
  const chan = env.CHANNEL_ID || (await kvGet(env, 'meta:channel'));
  if (!chan) return; // not configured → silent no-op
  const hours = Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6));
  const last = await kvGet(env, 'ch:last_post');
  if (last) {
    const lastMs = Date.parse(last);
    if (isFinite(lastMs) && Date.now() - lastMs < hours * 3600e3) return; // not due yet
  }
  const s = await getStats(env, true); // D10.1/B1 — caption must quote the run the card shows
  if (!s || !s.validation || !s.scoring) return; // golden rule: no stats → no post
  if (s.validation.skipped) return; // D8/H — no honest numbers in a skip_test run
  const lang = (await kvGet(env, 'meta:channel_lang')) || 'fa';
  const v = s.validation, p = v.latency_ms || {};
  const tplV = { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0),
    sources_ok: fmt(s.sources_ok), sources_total: fmt(s.sources_total),
    last_run: relTime(runStamp(s), lang),
    bank_size: s.bank && s.bank.size != null ? fmt(s.bank.size) : '—',
    hit: s.bank && s.bank.hit_rate != null ? s.bank.hit_rate : '—',
    streak: s.bank && s.bank.avg_streak != null ? s.bank.avg_streak : '—' };
  const tplMsg = renderTpl((await getTemplates(env)).digest, tplV);
  const msg = tplMsg || [
    t(lang, 'digest_title'),
    '🥇 ' + fmt(s.scoring.gold) + '  ·  ❤️ ' + fmt(v.alive) + '  ·  ⚡ ' + Math.round(p.p50 || 0) + 'ms',
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    t(lang, 'last_run', { t: relTime(runStamp(s), lang) }),
    /* D7 — config bank line */
    ...(s.bank && s.bank.size != null ? [
      t(lang, 'bank_line', { n: fmt(s.bank.size), hit: s.bank.hit_rate != null ? s.bank.hit_rate : '—', streak: s.bank.avg_streak != null ? s.bank.avg_streak : '—' }),
      t(lang, 'bank_src', { h: fmt((s.bank.sources && s.bank.sources.healthy) || 0), s: fmt((s.bank.sources && s.bank.sources.suspect) || 0), q: fmt((s.bank.sources && s.bank.sources.quarantined) || 0) }),
    ] : []),
  ].join('\n');
  const origin = await kvGet(env, 'meta:origin');
  const bot = (await kvGet(env, 'meta:bot_username')) || null;
  const rows = [];
  if (bot) rows.push([
    { text: '⚡ ' + t(lang, 'btn_best'), url: 'https://t.me/' + bot + '?start=best', style: 'primary' },
    { text: '🔗 ' + t(lang, 'btn_sub'), url: 'https://t.me/' + bot + '?start=sub', style: 'success' },
  ]);
  const row2 = [];
  if (origin) row2.push({ text: '👑 ' + t(lang, 'btn_app'), url: origin + '/app' });
  if (bot) row2.push({ text: '🚀 @' + bot, url: 'https://t.me/' + bot });
  if (row2.length) rows.push(row2);
  const markup = { reply_markup: { inline_keyboard: rows } };

  /* D4.2: digest goes out as a photo post too (the user-facing card image) */
  let sent = null;
  try {
    const png = (await fetchCardPng(env, s)) || (await renderCardPNG(s));
    sent = await sendPhotoFile(env, chan, png, 'ariston-card.png', msg.slice(0, 1024), markup);
  } catch (e) { console.error('digest png error', e && e.message); }
  if (!sent || !sent.ok) sent = await sendMessage(env, chan, msg, markup);
  if (!sent || !sent.ok) return; // marker only on success → auto-retry next tick
  await kvPut(env, 'ch:last_post', new Date().toISOString(), 172800);
}

/* ─────────────────── inline mode: @bot <query> in ANY chat ────────────────── */

const guessLang = (code) => {
  const lc = String(code || '').toLowerCase();
  return lc.startsWith('fa') ? 'fa' : lc.startsWith('ru') ? 'ru' : lc.startsWith('tr') ? 'tr' : lc.startsWith('zh') ? 'zh' : 'en';
};

const INLINE_OP_WORDS = {
  irancell: ['irancell', 'ایرانسل'],
  mci: ['mci', 'همراه اول', 'hamrah'],
  rightel: ['rightel', 'رایتل'],
  shatel: ['shatel', 'شاتل'],
  asiatech: ['asiatech', 'آسیاتک'],
  tci: ['tci', 'مخابرات'],
};
/* ordered: longer prefixes first so 'vless' never matches as 'ss' etc. */
const INLINE_PROTOS = { hysteria2: 'hysteria2', vless: 'vless', trojan: 'trojan', vmess: 'vmess', tuic: 'tuic', hy2: 'hysteria2' };

const hostOf = (uri) => {
  const h = String(uri).split('://')[1] || '';
  return h.split(/[/?#]/)[0] || h.slice(0, 28) || 'config';
};

async function handleInline(env, iq) {
  const q = String(iq.query || '').trim().toLowerCase();
  const lang = guessLang(iq.from && iq.from.language_code);
  /* D10.1/B3 — inline mode is part of the bot too: leavers get silence */
  if (!(await gateUser(env, iq.from && iq.from.id, await getCfg(env)))) {
    return api(env, 'answerInlineQuery', { inline_query_id: iq.id, results: [], cache_time: 30 });
  }
  const proto = Object.keys(INLINE_PROTOS).find((p) => q.includes(p)) || null;
  const scheme = proto ? INLINE_PROTOS[proto] : null;
  let op = null;
  for (const [slug, words] of Object.entries(INLINE_OP_WORDS)) {
    if (words.some((w) => q.includes(w))) { op = slug; break; }
  }

  /* pool: operator file if requested (never thin feeds), else gold+silver */
  let lines = [];
  if (op) {
    lines = toLines(await fetchTextCached(env, 'by-operator/' + op + '.txt', FILE_TTL_SEC));
    if (lines.length < SUB_MIN_OP_LINES) lines = []; // golden rule: no dead feeds
  }
  if (!lines.length) {
    const gold = toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC));
    const silver = toLines(await fetchTextCached(env, 'silver.txt', FILE_TTL_SEC));
    lines = [...new Set([...gold, ...silver])];
  }
  if (scheme) lines = lines.filter((l) => l.toLowerCase().startsWith(scheme + '://'));
  lines = lines.slice(0, INLINE_MAX);

  const bot = (await kvGet(env, 'meta:bot_username')) || 'Ariston_vbot';
  const foot = '\n\n⚡ ' + t(lang, 'inline_foot', { bot: '@' + bot });

  const results = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const uri = lines[i];
    if (seen.has(uri)) continue;
    seen.add(uri);
    const p = (uri.split('://')[0] || 'config').toLowerCase();
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔗';
    const title = medal + ' ' + p.toUpperCase() + (op ? ' · ' + ispName(op, lang) : '') + (scheme && scheme !== proto ? ' (hy2)' : '');
    results.push({
      type: 'article',
      id: (await sha16(uri)) + String(i).padStart(2, '0'), // unique even for dup lines
      title,
      description: hostOf(uri),
      input_message_content: {
        message_text: medal + ' <b>ARISTON</b> · ' + esc(p.toUpperCase()) + (op ? ' · ' + esc(ispName(op, lang)) : '') + '\n<code>' + esc(uri) + '</code>' + foot,
        parse_mode: 'HTML',
      },
    });
  }

  return api(env, 'answerInlineQuery', {
    inline_query_id: iq.id,
    results,
    cache_time: 60,
    is_personal: true,
    ...(results.length ? {} : { switch_pm_text: t(lang, 'inline_none'), switch_pm_parameter: 'start' }),
  });
}

/* ─────────────────────────────── telegram api ─────────────────────────────── */

async function api(env, method, payload) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return await r.json().catch(() => null);
  } catch (_) { return null; }
}

function sendMessage(env, chatId, text, extra = {}) {
  return api(env, 'sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }, ...extra,
  });
}

/* D4 — multipart photo upload (Workers FormData/File), JSON API can't take binary */
async function sendPhotoFile(env, chatId, pngBytes, filename, caption, extra = {}) {
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('photo', new File([pngBytes], filename, { type: 'image/png' }));
    fd.append('caption', caption || '');
    fd.append('parse_mode', 'HTML');
    if (extra.reply_markup) fd.append('reply_markup', JSON.stringify(extra.reply_markup));
    if (extra.disable_notification) fd.append('disable_notification', 'true');
    const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendPhoto', { method: 'POST', body: fd });
    return await r.json().catch(() => null);
  } catch (_) { return null; }
}

/* D4.2 — brand PNG committed to main by CI (resvg, Cinzel fonts) — beats the
   in-worker raster; cached on GitHub's CDN, bust-quantized to 5 minutes */
const CARD_PNG_BASES = [
  'https://raw.githubusercontent.com/' + REPO + '/main/assets/card/',
  'https://cdn.jsdelivr.net/gh/' + REPO + '@main/assets/card/',
];
/* D10.1/B1 — when was the brand card.png last committed to main?  The
   unauthenticated atom feed answers it without burning API rate limits
   (KV-cached 10 min).  Feed trouble → null → the caller keeps the CI card. */
async function cardPngCommitAt(env) {
  const hit = await kvGet(env, 'card:commit_at');
  if (hit) return hit;
  try {
    const r = await fetch('https://github.com/' + REPO + '/commits/main/assets/card/card.png.atom',
      { headers: { 'user-agent': 'ariston-bot/1.0' }, cf: { cacheTtl: 600, cacheEverything: true } });
    if (r.ok) {
      const m = (await r.text()).match(/<updated>([^<]+)<\/updated>/);
      if (m && Date.parse(m[1])) { await kvPut(env, 'card:commit_at', m[1], 600); return m[1]; }
    }
  } catch (_) { /* fail-safe below */ }
  return null;
}

async function fetchCardPng(env, s) {
  /* D10.1/B1 — a card committed for an OLDER run must never ride a post whose
     caption quotes the fresh run: that is the «card and caption don't agree»
     bug.  If the PNG lags the stats by more than one run cycle, skip it — the
     caller then renders the in-worker raster from the very same stats. */
  if (env && s && runStamp(s)) {
    const commitAt = await cardPngCommitAt(env);
    if (commitAt) {
      const lagMin = (Date.parse(runStamp(s)) - Date.parse(commitAt)) / 60000;
      if (isFinite(lagMin) && lagMin > 20) return null;
    }
  }
  const bust = Math.floor(Date.now() / 300e3);
  for (const base of CARD_PNG_BASES) {
    try {
      const r = await fetch(base + 'card.png?v=' + bust, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if (buf && buf.byteLength > 2048) return buf; // sanity: a real image, not an error page
    } catch (_) { /* next source */ }
  }
  return null;
}

/* ──────────────────────────────── keyboards ───────────────────────────────── */

const langKb = () => {
  const names = Object.entries(LANG_META).map(([code, label]) => [{ text: label, callback_data: 'lang:' + code, style: 'primary' }]);
  return { inline_keyboard: [names[0], names[1], names[2]] };
};

function ispKb(lang) {
  const rows = [];
  for (let i = 0; i < ISP_ORDER.length - 1; i += 2) {
    rows.push(ISP_ORDER.slice(i, i + 2).map((s) => ({ text: ispName(s, lang), callback_data: 'op:' + s, style: 'primary' })));
  }
  rows.push([{ text: ispName('other', lang), callback_data: 'op:other', style: 'primary' }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

function clientKb(lang) {
  const rows = [];
  for (let i = 0; i < CLIENT_ORDER.length - 1; i += 2) {
    rows.push(CLIENT_ORDER.slice(i, i + 2).map((s) => ({ text: clName(s, lang), callback_data: 'cl:' + s, style: 'primary' })));
  }
  rows.push([{ text: clName('other', lang), callback_data: 'cl:other', style: 'primary' }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

const menuKb = (lang, origin, chatId) => {
  const rows = [
    [{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold', style: 'primary' }, { text: t(lang, 'btn_best'), callback_data: 'menu:best', style: 'primary' }],
    [{ text: t(lang, 'btn_stats'), callback_data: 'menu:stats' }, { text: t(lang, 'btn_sub'), callback_data: 'menu:sub', style: 'success' }],
    [{ text: t(lang, 'btn_ref'), callback_data: 'menu:ref', style: 'success' }, { text: t(lang, 'btn_settings'), callback_data: 'menu:settings' }],
    [{ text: t(lang, 'btn_help'), callback_data: 'menu:help' }, { text: t(lang, 'btn_lang'), callback_data: 'menu:lang' }],
  ];
  if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
  /* D7: the admin-panel button is rendered ONLY for registered admins —
     never for regular users (chatId → async isAdmin check by the caller). */
  if (chatId === true || (chatId != null && chatId !== false && chatId._adm)) {
    rows.push([{ text: '🛠 ' + t(lang, 'btn_panel'), callback_data: 'menu:panel', style: 'primary' }]);
  }
  return { inline_keyboard: rows };
};

/* resolves admin status once and builds the menu with the admin row included */
async function menuKbFor(env, chatId, lang, origin) {
  const adm = await isAdmin(env, chatId);
  const kb = menuKb(lang, origin, { _adm: adm });
  return kb.inline_keyboard;
}

const settingsKb = (lang, user) => {
  const rotMode = t(lang, (user && user.rotation === 'run' ? 'rot_run' : 'rot_day'));
  const nameRow = [{ text: t(lang, 'name_now', { name: (user && user.name) || '—' }), callback_data: 'set:name' }];
  return {
    inline_keyboard: [
      [{ text: t(lang, 'btn_isp'), callback_data: 'set:isp', style: 'primary' }, { text: t(lang, 'btn_client'), callback_data: 'set:client', style: 'primary' }],
      nameRow,
      [{ text: t(lang, 'set_rot', { mode: rotMode }), callback_data: 'set:rot' }],
      [{ text: t(lang, 'btn_lang'), callback_data: 'menu:lang' }],
      [{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }],
    ],
  };
};

const nameKb = (lang) => ({
  inline_keyboard: [[{ text: t(lang, 'name_skip'), callback_data: 'name:skip' }]],
});

/* D4 — ask the personal name (stamped onto config remarks) */
async function askName(env, chatId, lang, hint) {
  return sendMessage(env, chatId, hint || t(lang, 'pick_name'), { reply_markup: nameKb(lang) });
}

/* ─────────────────────────────── bot actions ──────────────────────────────── */

async function sendMenu(env, chatId, lang, text, origin) {
  const kb = await menuKbFor(env, chatId, lang, origin);
  return sendMessage(env, chatId, text || t(lang, 'menu_title'), { reply_markup: { inline_keyboard: kb } });
}

async function askLang(env, chatId) {
  return sendMessage(env, chatId, t('en', 'pick_lang'), { reply_markup: langKb() });
}

async function askIsp(env, chatId, lang) {
  return sendMessage(env, chatId, t(lang, 'pick_isp'), { reply_markup: ispKb(lang) });
}

async function askClient(env, chatId, lang) {
  return sendMessage(env, chatId, t(lang, 'pick_client'), { reply_markup: clientKb(lang) });
}

async function askSettings(env, chatId, lang) {
  const user = await getUser(env, chatId);
  const kb = settingsKb(lang, user);
  if (await isAdmin(env, chatId)) { // D5: admins get the settings panel shortcut
    kb.inline_keyboard.splice(kb.inline_keyboard.length - 1, 0, [{ text: t(lang, 'btn_panel'), callback_data: 'menu:panel' }]);
  }
  return sendMessage(env, chatId, t(lang, 'set_pick'), { reply_markup: kb });
}

async function cmdStart(env, chatId, msg, origin) {
  let user = await getUser(env, chatId);
  if (!(await kvGet(env, 'meta:owner'))) await kvPut(env, 'meta:owner', String(chatId)); // first /start claims ownership
  if (user && user.lang && user.isp && user.client) {
    await idxAdd(env, chatId);
    if (user.name === undefined) { // D4: one-time name ask for pre-D4 users (skip = never asks again)
      user.await = 'name'; await saveUser(env, chatId, user);
      return askName(env, chatId, user.lang);
    }
    /* D5: deep links from the channel post buttons → open the right screen */
    const pl = String(msg.text || '').trim().split(/\s+/)[1] || '';
    if (pl === 'best') return cmdBest(env, chatId, user.lang, origin);
    if (pl === 'sub') return cmdSub(env, chatId, user.lang, origin || '');
    if (pl === 'gold') return cmdGold(env, chatId, user.lang, 0);
    return sendMenu(env, chatId, user.lang, null, origin);
  }
  const lc = String((msg.from && msg.from.language_code) || '').toLowerCase();
  const guess = lc.startsWith('fa') ? 'fa' : lc.startsWith('ru') ? 'ru' : lc.startsWith('tr') ? 'tr' : lc.startsWith('zh') ? 'zh' : lc.startsWith('en') ? 'en' : null;
  if (!user) user = { created: new Date().toISOString().slice(0, 10) };
  if (msg.from && msg.from.first_name && !user.tg) user.tg = String(msg.from.first_name).slice(0, 64); // display name (referrer toasts)
  /* D4.2 referral capture — only for brand-new accounts (anti-abuse) */
  const refPayload = String(msg.text || '').trim().split(/\s+/)[1] || '';
  const refm = refPayload.match(/^ref(\d{3,20})$/i);
  if (refm && refm[1] !== String(chatId) && !user.ref_by && !user.ref_credited) user.ref_by = refm[1];
  if (guess && !user.lang) user.lang = guess; // smart start: skip lang step when Telegram already knows
  await saveUser(env, chatId, user);
  if (!user.lang) return askLang(env, chatId);
  if (!user.isp) return askIsp(env, chatId, user.lang);
  return askClient(env, chatId, user.lang);
}

async function cmdGold(env, chatId, lang, offset) {
  const raw = await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC);
  const lines = toLines(raw);
  if (!lines.length) return sendMessage(env, chatId, t(lang, 'gold_empty'));
  const total = lines.length;
  const lastPage = Math.floor((total - 1) / 3) * 3;
  const off = Math.max(0, Math.min(offset || 0, lastPage));
  const page = lines.slice(off, off + 3);
  let msg = t(lang, 'gold_page', { a: off + 1, b: off + page.length, n: total }) + '\n\n';
  page.forEach((cfg, i) => { msg += '<b>#' + (off + i + 1) + '</b>\n<code>' + esc(cfg) + '</code>\n\n'; });
  msg += t(lang, 'gold_hint');
  const rows = [];
  if (off + 3 < total) rows.push([{ text: t(lang, 'more'), callback_data: 'gold:' + (off + 3), style: 'primary' }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: rows } });
}

async function cmdStats(env, chatId, lang, origin) {
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return sendMessage(env, chatId, t(lang, 'stats_fail'));
  const v = s.validation, sc = s.scoring, p = v.latency_ms || {};
  const proto = Object.entries(v.by_protocol_alive || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, n]) => esc(k) + ' ' + fmt(n)).join(' · ');
  const msg = [
    t(lang, 'stats_head'), '',
    t(lang, 'last_run', { t: relTime(runStamp(s), lang) }),
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    t(lang, 'unique_n', { n: fmt(s.unique) }),
    t(lang, 'probed_n', { a: fmt(v.probed), b: fmt(v.alive) }),
    t(lang, 'latency', { p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0) }),
    '📈 ' + (proto || '—'), '',
    '🥇 ' + fmt(sc.gold) + '   🥈 ' + fmt(sc.silver) + '   🥉 ' + fmt(sc.bronze), '',
    /* D7 — config bank telemetry (engine-tested memory between runs) */
    ...(s.bank && s.bank.size != null ? [
      '—',
      t(lang, 'bank_line', { n: fmt(s.bank.size), hit: s.bank.hit_rate != null ? s.bank.hit_rate : '—', streak: s.bank.avg_streak != null ? s.bank.avg_streak : '—' }),
      t(lang, 'bank_p2', { r: fmt((s.bank.pass2 && s.bank.pass2.rescued) || 0), a: fmt((s.bank.pass2 && s.bank.pass2.attempted) || 0) }),
      t(lang, 'bank_src', { h: fmt((s.bank.sources && s.bank.sources.healthy) || 0), s: fmt((s.bank.sources && s.bank.sources.suspect) || 0), q: fmt((s.bank.sources && s.bank.sources.quarantined) || 0) }),
      '',
    ] : []),
    '🌐 ' + PAGES,
  ].join('\n');
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: await menuKbFor(env, chatId, lang, origin) } });
}

async function cmdSub(env, chatId, lang, origin) {
  let user = await getUser(env, chatId);
  if (!user || !user.isp) return askIsp(env, chatId, lang);
  if (!user.token) {
    user.token = crypto.randomUUID();
    await saveUser(env, chatId, user);
    await kvPut(env, 'sub:' + user.token, JSON.stringify({ chat_id: chatId }));
  }
  const url = origin + '/u/' + user.token;
  let note = '';
  if (user.isp !== 'other') {
    const opText = await fetchTextCached(env, 'by-operator/' + user.isp + '.txt', FILE_TTL_SEC);
    const n = toLines(opText).length;
    if (n < SUB_MIN_OP_LINES) note = '\n\n' + t(lang, 'sub_fallback_note');
  }
  const how = HOWTO[user.client] ? (HOWTO[user.client][lang] || HOWTO[user.client].en) : HOWTO.other[lang] || HOWTO.other.en;
  const clientLine = user.client ? clName(user.client, lang) : '—';
  const rotMode = t(lang, user.rotation === 'run' ? 'rot_run' : 'rot_day');
  const quota = refQuota(user.ref_count || 0, await getCfg(env)); // D4.2: referral-aware
  const subMode = SUB_MODES.includes(user.sub_mode) ? user.sub_mode : 'mix'; // D8/S
  const msg = [
    t(lang, 'sub_title'), '',
    '<code>' + esc(url) + '</code>', '',
    t(lang, 'sub_note'), '',
    t(lang, 'sub_mode_line', { mode: t(lang, 'mode_' + subMode) }),
    t(lang, 'sub_rot_line', { mode: rotMode, n: quota }),
    '📡 ' + ispName(user.isp, lang) + ' · 📱 ' + clientLine + (user.name ? ' · ✍️ ' + esc(cleanName(user.name)) : ''), note, '',
    t(lang, 'ref_stat', { n: user.ref_count || 0, q: quota, cap: (await getCfg(env)).ref_cap || REF_CAP }), '',
    t(lang, 'sub_howto'), how, '',
    '⚙️ ' + t(lang, 'set_rot', { mode: rotMode }) + ' · ' + t(lang, 'set_name'),
  ].join('\n');
  return sendMessage(env, chatId, msg, {
    reply_markup: { inline_keyboard: [[{ text: t(lang, 'sub_open'), url, style: 'success' }], [{ text: t(lang, 'btn_ref'), callback_data: 'menu:ref', style: 'success' }], [{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]] },
  });
}

/* D4.2 — /ref: personal invite link · plan B escalating quota up to REF_CAP */
async function cmdRef(env, chatId, lang, origin) {
  const cfg = await getCfg(env);
  const user = (await getUser(env, chatId)) || {};
  const bot = (await kvGet(env, 'meta:bot_username')) || 'Ariston_vbot';
  const link = 'https://t.me/' + bot + '?start=ref' + chatId;
  const refs = user.ref_count || 0;
  /* D10/U3-4 — invite tiering: bronze → silver → gold, with progress to next */
  const lvl = userLevel(refs);
  const tierLine = lvl.next
    ? '\n' + t(lang, 'ref_tier', { tier: t(lang, 'tier_' + lvl.key), next: t(lang, 'tier_' + lvl.next), n: fmt(lvl.need) })
    : '\n' + t(lang, 'ref_tier_max', { tier: t(lang, 'tier_gold') });
  const msg = [
    t(lang, 'ref_title'), '',
    '<code>' + esc(link) + '</code>', '',
    t(lang, 'ref_stat', { n: refs, q: refQuota(refs, cfg), cap: cfg.ref_cap || REF_CAP }),
    tierLine, '',
    t(lang, 'ref_rule'),
  ].join('\n');
  const share = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(t(lang, 'ref_share_text'));
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: [
    [{ text: t(lang, 'ref_share'), url: share, style: 'primary' }],
    [{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }],
  ] } });
}

async function cmdHelp(env, chatId, lang, origin) {
  const bot = await kvGet(env, 'meta:bot_username');
  let msg = t(lang, 'help_text');
  if (bot) msg += '\n\n🔎 ' + t(lang, 'help_inline', { bot: '@' + bot });
  if (origin) msg += '\n🛠 API: ' + origin + '/api';
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: await menuKbFor(env, chatId, lang, origin) } });
}

/* D4 — /freq [hours]: owner-only knob for the periodic channel digest */
async function cmdFreq(env, chatId, lang, argText) {
  const owner = await kvGet(env, 'meta:owner');
  if (!owner) {
    const idx = (await kvGet(env, 'users:index', 'json')) || [];
    if (idx.includes(chatId)) await kvPut(env, 'meta:owner', String(chatId)); // first-comer claims
  } else if (owner !== String(chatId)) {
    return sendMessage(env, chatId, t(lang, 'freq_denied'));
  }
  const n = parseInt(String(argText || '').trim(), 10);
  if (!n) { // no / bad number → show current interval
    const cur = Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6));
    return sendMessage(env, chatId, t(lang, 'freq_now', { n: cur }));
  }
  if (n < 1 || n > 24) return sendMessage(env, chatId, t(lang, 'freq_bad'));
  await kvPut(env, 'ch:every_hours', String(n));
  await kvDel(env, 'ch:last_post'); // make the new interval effective immediately
  return sendMessage(env, chatId, t(lang, 'freq_set', { n }));
}

/* D5 — /panel: open the admin settings Mini App (admins only) */
async function cmdPanel(env, chatId, lang, origin) {
  if (!(await isAdmin(env, chatId))) return sendMessage(env, chatId, t(lang, 'panel_denied') + '\n\n\u{1FAAA} ID: ' + chatId);
  if (!origin) return sendMessage(env, chatId, t(lang, 'err_generic'));
  return sendMessage(env, chatId, t(lang, 'btn_panel') + '\n\n' + t(lang, 'menu_title'), {
    reply_markup: { inline_keyboard: [[{ text: '🛠 ' + t(lang, 'btn_panel'), web_app: { url: origin + '/panel' } }]] },
  });
}

async function cmdBest(env, chatId, lang, origin) {
  const items = await getEnrichedGold(env);
  if (!items.length) return sendMessage(env, chatId, t(lang, 'gold_empty'));
  const scored = items.filter((x) => x.ema !== null);
  const pool = scored.length ? scored : items;
  const best = [...pool].sort((a, b) =>
    ((b.ema || 0) - (a.ema || 0)) || ((a.latency_ms === null ? 9e9 : a.latency_ms) - (b.latency_ms === null ? 9e9 : b.latency_ms))
  )[0];
  const ema = best.ema !== null ? Math.round(best.ema * 100) + '%' : '—';
  const lat = best.latency_ms !== null ? Math.round(best.latency_ms) + 'ms' : '—';
  const msg = [
    '<b>' + esc(t(lang, 'best_title')) + '</b>', '',
    '<code>' + esc(best.uri) + '</code>', '',
    '✅ ' + ema + '  ·  ⚡ ' + lat + '  ·  ✔ ' + (best.ok || 0) + ' / ✘ ' + (best.fail || 0),
  ].join('\n');
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: await menuKbFor(env, chatId, lang, origin) } });
}

/* ─────────────────────────── update router (webhook) ──────────────────────── */

async function handleUpdate(env, update, origin) {
  /* D9/G4-3 — blocked users are silently ignored (message · callback · inline).
     Fail-safe: a KV error above already treats them as not-blocked. */
  const blkId = (update.message && update.message.chat && update.message.chat.id)
    || (update.callback_query && update.callback_query.message && update.callback_query.message.chat && update.callback_query.message.chat.id)
    || (update.inline_query && update.inline_query.from && update.inline_query.from.id);
  if (blkId != null && await isBlocked(env, blkId)) return;

  const iq = update.inline_query;
  if (iq) {
    try { return await handleInline(env, iq); }
    catch (e) { console.error('inline error', e && e.message); return api(env, 'answerInlineQuery', { inline_query_id: iq.id, results: [], cache_time: 5 }); }
  }

  const msg = update.message;
  if (msg && msg.text && msg.chat) {
    const chatId = msg.chat.id;
    const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
    const user = await getUser(env, chatId);
    const lang = (user && user.lang) || 'fa';
    try {
      /* D4.2 forced join: nothing is served before official-channel membership */
      if (msg.chat.type === 'private' && !(await gateJoin(env, chatId, await getCfg(env), lang))) return;
      /* D4 — free-text name capture (awaited after onboarding or from settings) */
      if (user && user.await === 'name' && !msg.text.startsWith('/')) {
        const name = cleanName(msg.text.trim());
        delete user.await;
        if (name) { user.name = name; await saveUser(env, chatId, user); await creditReferral(env, chatId); return sendMenu(env, chatId, lang, t(lang, 'name_saved', { name: esc(name) }), origin || ''); }
        await saveUser(env, chatId, user);
        return askName(env, chatId, lang);
      }
      switch (cmd) {
        case '/start': return await cmdStart(env, chatId, msg, origin);
        case '/gold': return await cmdGold(env, chatId, lang, 0);
        case '/best': return await cmdBest(env, chatId, lang, origin);
        case '/stats': return await cmdStats(env, chatId, lang, origin);
        case '/sub': return await cmdSub(env, chatId, lang, origin || '');
        case '/ref': return await cmdRef(env, chatId, lang, origin);
        case '/help': return await cmdHelp(env, chatId, lang, origin);
        case '/lang': return await askLang(env, chatId);
        case '/settings': return await askSettings(env, chatId, lang);
        case '/panel': return await cmdPanel(env, chatId, lang, origin);
        case '/freq': return await cmdFreq(env, chatId, lang, msg.text.trim().split(/\s+/).slice(1).join(' '));
        default: return await sendMenu(env, chatId, lang, t(lang, 'menu_fallback'), origin);
      }
    } catch (e) {
      console.error('command failed', cmd, e && e.message);
      return sendMessage(env, chatId, t(lang, 'err_generic'));
    }
  }

  const cb = update.callback_query;
  if (cb && cb.data) {
    const chatId = cb.message && cb.message.chat && cb.message.chat.id;
    if (!chatId) { await api(env, 'answerCallbackQuery', { callback_query_id: cb.id }); return; }
    const [head, arg] = String(cb.data).split(':');
    const cbUser = await getUser(env, chatId);
    const lang = (cbUser && cbUser.lang) || 'fa';
    try {
      if (head === 'join') { // D4.2 forced-join re-check → stop the spinner with a spoken answer
        const cfg = await getCfg(env);
        const chan = await resolveChannel(env, cfg);
        const ok = Boolean(chan) && (await isMember(env, chatId, chan));
        await api(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, ok ? 'join_ok' : 'join_still') });
        if (ok) await kvDel(env, 'mem:' + chatId); // D10.1/B3 — fresh membership beats the stale negative cache
        if (ok) {
          if (cbUser && cbUser.lang && cbUser.isp && cbUser.client) {
            if (cbUser.name === undefined) { cbUser.await = 'name'; await saveUser(env, chatId, cbUser); return askName(env, chatId, lang); }
            await sendMenu(env, chatId, lang, null, origin);
          }
          else if (!cbUser || !cbUser.lang) await askLang(env, chatId);
          else if (!cbUser.isp) await askIsp(env, chatId, cbUser.lang);
          else await askClient(env, chatId, cbUser.lang);
        }
        return;
      }
      await api(env, 'answerCallbackQuery', { callback_query_id: cb.id }); // always answer → stops the spinner
      /* D4.2 forced join gate */
      if (cb.message.chat.type === 'private' && !(await gateJoin(env, chatId, await getCfg(env), lang))) return;
      switch (head) {
        case 'lang': {
          let user = (await getUser(env, chatId)) || { created: new Date().toISOString().slice(0, 10) };
          user.lang = arg; await saveUser(env, chatId, user);
          if (user.isp) return sendMenu(env, chatId, arg, t(arg, 'saved'), origin);
          return askIsp(env, chatId, arg);
        }
        case 'op': {
          const user = await getUser(env, chatId);
          if (!user) return;
          const ispChanged = user.isp !== arg;
          user.isp = arg; await saveUser(env, chatId, user);
          if (ispChanged && user.token) await kvDel(env, 'alloc:' + user.token); // D4: new pool → re-allocate
          if (user.client) return sendMenu(env, chatId, user.lang || 'fa', t(user.lang || 'fa', 'saved'), origin);
          return askClient(env, chatId, user.lang || 'fa');
        }
        case 'cl': {
          const user = await getUser(env, chatId);
          if (!user) return;
          user.client = arg; await saveUser(env, chatId, user);
          await idxAdd(env, chatId);
          if (!user.name) return askName(env, chatId, user.lang || 'fa'); // D4: stamp name → remarks
          await creditReferral(env, chatId); // D4.2: onboarding complete → count the referral
          return sendMenu(env, chatId, user.lang || 'fa', t(user.lang || 'fa', 'setup_done'), origin);
        }
        case 'name': { // D4 — «skip» pressed on the name prompt
          const user = await getUser(env, chatId);
          if (!user) return;
          delete user.await;
          user.name = user.name || '';
          await saveUser(env, chatId, user);
          await creditReferral(env, chatId); // D4.2: onboarding complete → count the referral
          const lg = user.lang || 'fa';
          if (user.isp && user.client) return sendMenu(env, chatId, lg, t(lg, 'setup_done'), origin);
          if (!user.isp) return askIsp(env, chatId, lg);
          return askClient(env, chatId, lg);
        }
        case 'menu': {
          const user = await getUser(env, chatId);
          const lang = (user && user.lang) || 'fa';
          switch (arg) {
            case 'gold': return cmdGold(env, chatId, lang, 0);
            case 'best': return cmdBest(env, chatId, lang, origin);
            case 'stats': return cmdStats(env, chatId, lang, origin);
            case 'sub': return cmdSub(env, chatId, lang, origin || '');
            case 'ref': return cmdRef(env, chatId, lang, origin);
            case 'settings': return askSettings(env, chatId, lang);
            case 'panel': return cmdPanel(env, chatId, lang, origin);
            case 'help': return cmdHelp(env, chatId, lang, origin);
            case 'lang': return askLang(env, chatId);
            default: return sendMenu(env, chatId, lang, null, origin);
          }
        }
        case 'gold': return cmdGold(env, chatId, (await getUser(env, chatId) || {}).lang || 'fa', parseInt(arg, 10) || 0);
        case 'set': {
          const user = await getUser(env, chatId);
          const lang = (user && user.lang) || 'fa';
          if (arg === 'isp') return askIsp(env, chatId, lang);
          if (arg === 'client') return askClient(env, chatId, lang);
          if (arg === 'name') { // D4 — await a fresh name in the next plain message
            if (user) { user.await = 'name'; await saveUser(env, chatId, user); }
            return askName(env, chatId, lang, t(lang, 'name_hint'));
          }
          if (arg === 'rot') { // D4 — toggle rotation day ↔ run, drop the current allocation
            if (!user) return;
            user.rotation = user.rotation === 'run' ? 'day' : 'run';
            await saveUser(env, chatId, user);
            if (user.token) await kvDel(env, 'alloc:' + user.token);
            const mode = t(lang, user.rotation === 'run' ? 'rot_run' : 'rot_day');
            return sendMenu(env, chatId, lang, t(lang, 'rot_hint', { mode }), origin);
          }
          return;
        }
        default: return;
      }
    } catch (e) {
      console.error('callback failed', cb.data, e && e.message);
      return sendMessage(env, chatId, t('fa', 'err_generic'));
    }
  }
}

/* ─────────────────────── personal subscription (/u/<token>) ─────────────────
 * D8/S — one link, three modes (PDF ch.3 option 3):
 *   mine  → the classic personal picks (pre-D8 behavior, preserved)
 *   gold  → the public best-of-run list (gold.txt)
 *   mix   → personal picks first + the gold list, deduped, capped (DEFAULT)
 * The link itself NEVER changes — the mode lives in the user profile and can
 * be overridden per request with ?m=mine|gold|mix (PDF option 4, advanced). */
const SUB_MODES = ['mine', 'gold', 'mix'];

async function buildSubscription(env, token, modeParam) {
  const rec = await kvGet(env, 'sub:' + token, 'json');
  if (!rec || !rec.chat_id) return null;
  const user = await getUser(env, rec.chat_id);
  if (!user) return null;
  /* D10.1/B3 — a leaver's personal feed dies with the rest of the service */
  if (!(await gateUser(env, rec.chat_id, await getCfg(env)))) return null;
  const lang = user.lang || 'fa';
  const pcfg = await getPipelineCfg(env); // D9/G2-2 — panel-tunable caps
  const maxLines = Math.max(10, parseInt(pcfg.sub_max_lines, 10) || SUB_MAX_LINES);
  const mode = SUB_MODES.includes(modeParam) ? modeParam
    : (SUB_MODES.includes(user.sub_mode) ? user.sub_mode : 'mix');
  const name = cleanName(user.name);
  const mkHeader = (title) => [
    '#profile-title: ' + title,
    '#profile-update-interval: 12',
    '#profile-web-page-url: ' + PAGES,
  ].join('\n');

  const goldOnly = async () => {
    const gold = toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC)).slice(0, maxLines);
    if (!gold.length) return null;
    const title = 'ARISTON ⭐ GOLD';
    return { body: b64(mkHeader(title) + '\n' + gold.join('\n')), title, count: gold.length, mode };
  };

  if (mode === 'gold') return goldOnly();

  /* D4: personalized picks (stable per rotation period) with brand remarks */
  const alloc = await allocateSub(env, user, rec.chat_id);
  if (!alloc || !alloc.items || !alloc.items.length) {
    if (mode === 'mine') return null;      // classic behavior preserved
    return goldOnly();                     // mix with an empty personal shelf → gold
  }
  const title = 'ARISTON ' + (alloc.usedFallback ? '⭐' : '⚡') + ' ' + ispName(user.isp || 'other', lang);
  const lines = alloc.items.map((it) => remarkUri(it.uri, brandRemark(name, it.ping)));
  let count = lines.length;
  if (mode === 'mix') {
    const seen = new Set(lines.map((l) => l.split('#')[0]));
    for (const g of toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC))) {
      if (count >= maxLines) break;
      const base = g.split('#')[0];
      if (!base || seen.has(base)) continue;
      seen.add(base);
      lines.push(g);
      count++;
    }
  }
  return { body: b64(mkHeader(title) + '\n' + lines.join('\n')), title, count, mode };
}

/* ──────────────────────────────── landing page ────────────────────────────── */

const EMBLEM_SVG = `<svg viewBox="0 0 1254 1254" width="330" height="330" xmlns="http://www.w3.org/2000/svg" aria-label="ARISTON">
  <rect width="1254" height="1254" fill="#14110C"/>
  <g>
    <path fill="#E8C872" d="M627 253 L608 362 L513 455 L537 519 L341 735 Z"/>
    <path fill="#E8C872" d="M627 253 L646 362 L741 455 L717 519 L913 735 Z"/>
    <path fill="#B87333" d="M513 455 L627 396 L741 455 L710 486 L627 444 L549 486 Z"/>
    <path fill="#C0C6CC" d="M554 508 L627 472 L700 508 L678 540 L627 513 L576 540 Z"/>
    <path fill="#C9A24A" d="M582 559 L627 541 L672 559 L627 644 Z"/>
    <path fill="#E8C872" d="M624 644 H630 V675 H624 Z"/>
    <circle cx="627" cy="693" r="19" fill="#E8C872"/>
  </g>
  <g fill="#F3ECDD" font-family="Cinzel, 'Times New Roman', Georgia, serif" font-size="86" letter-spacing="26" text-anchor="middle">
    <text x="646" y="864">ARISTON</text>
  </g>
  <g>
    <path fill="#E8C872" d="M397 940 L567 936 L567 944 Z"/>
    <path fill="#E8C872" d="M857 940 L687 936 L687 944 Z"/>
    <path d="M590 916 H659 V965 H590 V940 H636 V951 H612 V929 H647 V941 H624" fill="none" stroke="#E8C872" stroke-width="6"/>
  </g>
</svg>`;

function landingPage(botUsername) {
  const btn = botUsername
    ? '<a class="btn" href="https://t.me/' + botUsername + '">OPEN BOT →</a>'
    : '<span class="soon">BOT COMING SOON</span>';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>ARISTON ⚡ Bot</title><style>'
    + 'body{margin:0;min-height:100svh;display:grid;place-items:center;background:#14110C;color:#F3ECDD;text-align:center;font-family:Cinzel,Georgia,"Times New Roman",serif}'
    + '.m{letter-spacing:.42em;text-indent:.42em;font-size:clamp(18px,4.5vw,26px);margin:6px 0 2px}'
    + '.s{font-family:ui-monospace,Menlo,Consolas,monospace;color:#8d8262;font-size:11px;letter-spacing:.14em}'
    + 'a.btn,span.soon{display:inline-block;margin-top:24px;padding:12px 26px;border:1px solid rgba(232,200,114,.45);border-radius:999px;color:#E8C872;text-decoration:none;letter-spacing:.16em;font-size:13px}'
    + 'span.soon{color:#8d8262;border-style:dashed}'
    + 'a.btn:hover{background:rgba(232,200,114,.08)}'
    + '.links{margin-top:26px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.18em}'
    + '.links a{color:#8d8262;text-decoration:none;margin:0 10px}'
    + '.links a:hover{color:#E8C872}'
    + '</style></head><body><div>'
    + EMBLEM_SVG
    + '<div class="m">ARISTON</div>'
    + '<div class="s">COLLECT · VALIDATE · SCORE · PUBLISH</div>'
    + btn
    + '<div class="links"><a href="/api">API</a><a href="/card.svg">CARD</a><a href="/app">DASHBOARD</a></div>'
    + '</div></body></html>';
}

/* ───────────────────────────── mini app JSON api ──────────────────────────── */

async function appStats(env) {
  let s = await getStats(env);
  let stale = false;
  if (!s || !s.validation || !s.scoring) { /* D5.1: upstream hiccup → serve the last good snapshot instead of a dead screen */
    s = await kvGet(env, 'stats:lastgood', 'json');
    stale = !!(s && s.validation && s.scoring);
  }
  if (!s || !s.validation || !s.scoring) return Response.json({ error: 'no_data' }, { status: 503 });
  const v = s.validation, p = v.latency_ms || {};
  return Response.json({
    generated_at: s.generated_at,
    published_at: s.published_at || null, // D10.2/B2 — snapshot finalization stamp
    sources_ok: s.sources_ok || 0, sources_total: s.sources_total || 0,
    unique: s.unique || 0, probed: v.probed || 0, alive: v.alive || 0,
    p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0),
    gold: s.scoring.gold || 0, silver: s.scoring.silver || 0, bronze: s.scoring.bronze || 0,
    /* D7 — config bank telemetry for the mini-app bank strip */
    bank: s.bank && s.bank.size != null ? {
      size: s.bank.size || 0,
      hit_rate: s.bank.hit_rate != null ? s.bank.hit_rate : null,
      avg_streak: s.bank.avg_streak != null ? s.bank.avg_streak : null,
      pass2: s.bank.pass2 || null,
      sources: s.bank.sources || null,
      full_scan: Boolean(s.bank.full_scan),
    } : null,
    /* D9/U2 — 7-day health log for the mini-app sparkline (absent → hidden) */
    health_7d: Array.isArray(s.health_7d) ? s.health_7d.slice(-8) : null,
    bot: (await kvGet(env, 'meta:bot_username')) || null,
    stale,
  });
}

async function appGold(env, url, request) {
  const q = url.searchParams;
  let limit = Math.min(Math.max(parseInt(q.get('limit') || '8', 10) || 8, 1), 32);
  let offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
  let remarkName = null;
  let favs = [];
  /* D5: POST + initData → the caller is a known user → stamp their personal name on the copies */
  if (request && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const tgUser = await verifyInitData(env, body.initData);
    if (tgUser && !(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3
    if (tgUser) {
      const u = await getUser(env, tgUser.id);
      if (u && u.name) remarkName = cleanName(u.name);
      if (body.offset != null && isFinite(parseInt(body.offset, 10))) offset = Math.max(parseInt(body.offset, 10), 0);
      if (body.limit != null && isFinite(parseInt(body.limit, 10))) limit = Math.min(Math.max(parseInt(body.limit, 10), 1), 32);
      favs = (await favsGet(env, tgUser.id)).map((f) => f.h); // D8/U3 — star states travel with the list
    }
  }
  const all = await getEnrichedGold(env);
  const slice = all.slice(offset, offset + limit);
  const opmap = await getOperatorMap(env); // D8/U5 — Iranian operator chips
  const items = [];
  for (const it of slice) {
    const fb = await feedbackGet(env, it.hash);
    items.push({
      ...it, up: fb.up || 0, down: fb.down || 0,
      fav: favs.includes(it.hash),
      op: opmap[it.hash] || null,
      uri: remarkName ? remarkUri(it.uri, brandRemark(remarkName, it.latency_ms)) : it.uri,
    });
  }
  return Response.json({ total: all.length, offset, items });
}

async function appSub(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const chatId = tgUser.id;
  let user = await getUser(env, chatId);
  if (!user) { // smoothest path: auto-profile from Telegram identity, isp=other → full tested list
    const lc = String(tgUser.language_code || '').toLowerCase();
    const lang = lc.startsWith('fa') ? 'fa' : lc.startsWith('ru') ? 'ru' : lc.startsWith('tr') ? 'tr' : lc.startsWith('zh') ? 'zh' : 'en';
    user = { created: new Date().toISOString().slice(0, 10), lang, isp: 'other', client: 'other' };
    await saveUser(env, chatId, user);
    await idxAdd(env, chatId);
  }
  if (!user.isp) { user.isp = 'other'; await saveUser(env, chatId, user); }
  if (!user.token) {
    user.token = crypto.randomUUID();
    await saveUser(env, chatId, user);
    await kvPut(env, 'sub:' + user.token, JSON.stringify({ chat_id: chatId }));
  }
  if (!user.name && tgUser.first_name) { user.name = cleanName(tgUser.first_name); await saveUser(env, chatId, user); } // D4
  const origin = new URL(request.url).origin;
  const rotMode = user.rotation === 'run' ? 'run' : 'day';
  const subMode = SUB_MODES.includes(user.sub_mode) ? user.sub_mode : 'mix'; // D8/S
  const uname = cleanName(user.name); // D5: the name saved in the bot travels onto every copy
  let items = [];
  try { // D4: the personalized picks + the user's own connect marks
    const alloc = await allocateSub(env, user, chatId);
    if (alloc && Array.isArray(alloc.items)) {
      const marks = await marksGet(env, chatId);
      items = alloc.items.map((it) => ({
        uri: remarkUri(it.uri, brandRemark(uname, it.ping)), // personal brand remark on tap-to-copy
        hash: it.hash, ping: it.ping, mark: marks[it.hash] || 0,
      }));
    }
  } catch (_) { /* sub link still works without picks */ }
  return Response.json({
    url: origin + '/u/' + user.token, isp: user.isp, client: user.client || 'other', lang: user.lang || 'fa',
    name: user.name || null, rotation: rotMode, sub_mode: subMode, n: items.length,
    items, // [{uri, hash, ping, mark: 0|1|2}] — 1 = connected ✅, 2 = failed ❌
  });
}

/* D8/S — the mode switch behind the single subscription link (mine/gold/mix) */
async function appSubMode(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const mode = String(body.mode || '');
  if (!SUB_MODES.includes(mode)) return Response.json({ error: 'bad_mode' }, { status: 400 });
  const user = await getUser(env, tgUser.id);
  if (!user) return Response.json({ error: 'no_user' }, { status: 404 });
  user.sub_mode = mode;
  await saveUser(env, tgUser.id, user);
  return Response.json({ ok: true, sub_mode: mode });
}

/* D8/U4 — light/dark theme preference (profile-stored, survives devices) */
async function appPref(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const user = await getUser(env, tgUser.id);
  if (!user) return Response.json({ error: 'no_user' }, { status: 404 });
  /* D11/U4-4 — boot sends {initData} only (read); the theme toggle sends
     {initData, theme} (write). The response carries the bot-side /lang
     choice so the mini app follows the bot's language. */
  if (body.theme === 'light' || body.theme === 'dark') { user.theme = body.theme; await saveUser(env, tgUser.id, user); }
  return Response.json({ ok: true, theme: user.theme === 'light' ? 'light' : 'dark', lang: (user.lang && APP_LANGS[user.lang]) ? user.lang : null });
}
const APP_LANGS = { fa: 1, en: 1, ru: 1, tr: 1, zh: 1 }; // D11/U4-4 — languages the mini app speaks

/* D8/U3 — favorites ⭐ (add / del / clear / list) */
async function appFavs(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const op = body.op === 'add' ? 'add' : body.op === 'del' ? 'del' : body.op === 'clear' ? 'clear' : 'list';
  const items = await favsGet(env, tgUser.id);
  if (op === 'clear') return Response.json({ ok: true, items: await favsSet(env, tgUser.id, []) });
  if (op === 'del') {
    const hash = String(body.hash || '');
    if (!/^[a-f0-9]{16}$/.test(hash)) return Response.json({ error: 'bad_item' }, { status: 400 });
    return Response.json({ ok: true, items: await favsSet(env, tgUser.id, items.filter((x) => x && x.h !== hash)) });
  }
  if (op === 'add') {
    const hash = String(body.hash || '');
    if (!/^[a-f0-9]{16}$/.test(hash) || !body.uri) return Response.json({ error: 'bad_item' }, { status: 400 });
    const clean = items.filter((x) => x && x.h !== hash);
    clean.unshift({
      h: hash,
      u: String(body.uri).slice(0, 600),
      p: String(body.proto || '').slice(0, 16),
      l: isFinite(body.lat) ? Math.round(Number(body.lat)) : null,
      ts: Date.now(),
    });
    return Response.json({ ok: true, items: await favsSet(env, tgUser.id, clean.slice(0, FAV_CAP)) });
  }
  return Response.json({ ok: true, items });
}

async function appMark(env, request) { // D4 — ✅/❌ "did it connect for me"
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const hash = String(body.hash || '');
  if (!/^[a-f0-9]{16}$/.test(hash)) return Response.json({ error: 'bad_hash' }, { status: 400 });
  const mark = body.mark === 'ok' ? 1 : body.mark === 'fail' ? 2 : 0;
  const cur = await markSet(env, tgUser.id, hash, mark);
  return Response.json({ ok: true, mark: cur });
}

async function appFeedback(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const hash = String(body.hash || '');
  if (!/^[a-f0-9]{16}$/.test(hash)) return Response.json({ error: 'bad_hash' }, { status: 400 });
  const vote = body.vote === 'up' ? 1 : body.vote === 'down' ? 2 : 0;
  if (!vote) return Response.json({ error: 'bad_vote' }, { status: 400 });
  const out = await feedbackSet(env, hash, tgUser.id, vote);
  return Response.json({ ok: true, ...out });
}

/* D6 — /app/api/history: the user's persistent copy-history (initData-gated) */
async function appHistory(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const op = body.op === 'add' ? 'add' : body.op === 'clear' ? 'clear' : 'list';
  if (op === 'clear') {
    await kvDel(env, 'hist:' + tgUser.id);
    return Response.json({ ok: true, items: [] });
  }
  if (op === 'add') {
    const hash = String(body.hash || '');
    if (!/^[a-f0-9]{16}$/.test(hash) || !body.uri) return Response.json({ error: 'bad_item' }, { status: 400 });
    const items = await historyAdd(env, tgUser.id, { h: hash, u: String(body.uri), p: body.proto, l: Number(body.lat) });
    return Response.json({ ok: true, items });
  }
  return Response.json({ ok: true, items: await historyGet(env, tgUser.id) });
}

/* D6 — /app/api/me: identity inside the mini app (admin chip + history badge) */
async function appMe(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  const u = await getUser(env, tgUser.id);
  return Response.json({
    ok: true,
    is_admin: await isAdmin(env, tgUser.id),
    hist: (await historyGet(env, tgUser.id)).length,
    favs: (await favsGet(env, tgUser.id)).length,          // D8/U3
    theme: (u && u.theme) === 'light' ? 'light' : 'dark',  // D8/U4
  });
}

/* ─────────────── D5 — admin panel api (initData + isAdmin) ───────────────── */

/* runs fn(env, body, tgUser) only when the initData belongs to a registered admin */
async function guardAdmin(env, request, fn) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await gateUser(env, tgUser.id, await getCfg(env)))) return Response.json({ error: 'join_required' }, { status: 403 }); // D10.1/B3 — the mini app is members-only too
  if (!(await isAdmin(env, tgUser.id))) return Response.json({ error: 'forbidden' }, { status: 403 });
  return fn(env, body, tgUser);
}

async function adminState(env) {
  const cfg = await getCfg(env);
  const s = await getStats(env);
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const owner = await kvGet(env, 'meta:owner');
  const admins = [];
  if (owner) admins.push({ id: Number(owner), owner: true });
  for (const a of (cfg.admin_ids || []).map(String)) if (a !== String(owner)) admins.push({ id: Number(a), owner: false });
  const bc = {
    total: parseInt((await kvGet(env, 'bc:total')) || '0', 10),
    cursor: parseInt((await kvGet(env, 'bc:cursor')) || '0', 10),
    fails: parseInt((await kvGet(env, 'bc:fails')) || '0', 10),
    active: (await kvGet(env, 'bc:active')) === '1',
  };
  return Response.json({
    cfg,
    every_hours: Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6)),
    channel: await resolveChannel(env, cfg),
    users_total: Array.isArray(idx) ? idx.length : 0,
    owner: owner || null,
    admins,
    bc,
    /* D9/G2-4 — the editable message templates + the audit log size */
    tpl: await getTemplates(env),
    audit_n: ((await kvGet(env, 'audit:log', 'json')) || []).length || 0,
    /* D10/G7 — error ring size + last cron tick (health card) */
    err_n: (((await kvGet(env, 'err:log', 'json')) || []).length || 0),
    cron_last_tick: (await kvGet(env, 'cron:last_tick')) || null,
    /* D8/P1 — the pipeline knobs, exactly what /api/pipeline-cfg serves */
    pcfg: await getPipelineCfg(env),
    now: new Date().toISOString(), // client computes run-lag from this
    /* D7 — the config bank, straight from the latest stats.json */
    bank: s && s.bank ? {
      size: s.bank.size || 0,
      hit_rate: s.bank.hit_rate != null ? s.bank.hit_rate : null,
      avg_streak: s.bank.avg_streak != null ? s.bank.avg_streak : null,
      best_streak: s.bank.best_streak != null ? s.bank.best_streak : null,
      avg_ms: s.bank.avg_ms != null ? s.bank.avg_ms : null,
      alive_delta: s.bank.alive_delta != null ? s.bank.alive_delta : null,
      pass2: s.bank.pass2 || null,
      rescue: s.bank.rescue || null,
      sources: s.bank.sources || null,
      full_scan: Boolean(s.bank.full_scan),
    } : null,
    stats: s && s.validation && s.scoring ? {
      generated_at: s.generated_at,
      published_at: s.published_at || null, // D10.2/B2 — admin panel clock anchor
      gold: s.scoring.gold || 0, alive: s.validation.alive || 0,
      p50: Math.round((s.validation.latency_ms || {}).p50 || 0),
      sources_ok: s.sources_ok || 0, sources_total: s.sources_total || 0, unique: s.unique || 0,
    } : null,
  });
}

/* D8/P — panel-editable keys. cfg:admin keeps the bot/notify knobs (existing
   behavior preserved); cfg:pipeline holds the pipeline knobs the Actions run
   reads every 30 min. Specs: bool · int:lo-hi · num:lo-hi · handle. */
const ADMIN_SET_KEYS = {
  force_join: 'bool', card_enabled: 'bool', digest_enabled: 'bool', watchtower_enabled: 'bool',
  ref_base: 'int:5-50', ref_cap: 'int:10-100', every_hours: 'int:1-24', channel_user: 'handle',
  /* D8/P6 — notifications & quiet hours */
  watchtower_cap: 'int:5-100', quiet_enabled: 'bool', quiet_start: 'int:0-23', quiet_end: 'int:0-23',
  /* D10/U3 — Friday personal weekly summary */
  weekly_enabled: 'bool',
  /* D11/U4-2 — «new run» webhook URL ('' = off). api_key/webhook_secret are
     NOT settable here — they rotate only via /app/api/admin/gen_api */
  webhook_url: 'url',
};
const PCFG_SET_KEYS = {
  bank_ttl_hours: 'num:6-72', pass2_enabled: 'bool', pass2_factor: 'num:1-3',
  suspect_after: 'int:1-10', quarantine_after: 'int:2-20', quarantine_days: 'num:1-30',
  min_streak_priority: 'int:1-10', rescue_enabled: 'bool',
  rescue_min_streak: 'int:2-20', rescue_max: 'int:0-5000',
  skip_test: 'bool', force_full_scan: 'bool',
  /* D9/G2 — panel phase 2 */
  remark_tpl: 'tpl', sub_max_lines: 'int:50-500', sub_min_op_lines: 'int:3-50',
  exports_mihomo: 'bool', exports_singbox: 'bool', exports_base64: 'bool', smart_ttl: 'bool',
  /* D10/G5 — panel phase 3: filters & strictness */
  gold_min: 'int:50-95', silver_min: 'int:25-79', strictness: 'int:0-2',
  proto_allow: 'csv', deny_kw: 'csv', allow_kw: 'csv', geo_allow: 'csv', geo_deny: 'csv',
};

async function adminSet(env, body, tgUser) {
  const key = String(body.key || '');
  const spec = ADMIN_SET_KEYS[key] || PCFG_SET_KEYS[key];
  if (!spec) return Response.json({ error: 'bad_key' }, { status: 400 });
  let v = body.value;
  if (spec === 'bool') v = Boolean(v);
  else if (spec === 'handle') {
    v = String(v || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
    if (v.length < 4) return Response.json({ error: 'bad_value' }, { status: 400 });
  } else if (spec === 'tpl') { // D9/G2-1 — remark template: no '#', 3..48 chars, must contain a letter
    v = sanitizeTpl(v);
    if (v.length < 3 || !/[A-Za-z\u0600-\u06FF]/.test(v)) return Response.json({ error: 'bad_value' }, { status: 400 });
  } else if (spec === 'csv') { // D10/G5 — csv knob: '' is valid (= feature off)
    v = sanitizeCsv(v);
  } else if (spec === 'url') { // D11/U4-2 — webhook URL: '' = off; else http(s), ≤300 chars
    v = String(v || '').trim();
    if (v && (!/^https?:\/\/.+/i.test(v) || v.length > 300)) return Response.json({ error: 'bad_value' }, { status: 400 });
  } else {
    const m = spec.match(/^(?:int|num):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    v = Number(v);
    if (!m || !isFinite(v)) return Response.json({ error: 'bad_value' }, { status: 400 });
    v = Math.min(parseFloat(m[2]), Math.max(parseFloat(m[1]), v));
    if (spec.startsWith('int:')) v = Math.round(v);
  }
  if (key === 'every_hours') { // lives outside cfg — /freq reads the same knob
    await kvPut(env, 'ch:every_hours', String(v));
    await kvDel(env, 'ch:last_post'); // new interval takes effect on the next tick
    return Response.json({ ok: true, key, value: v });
  }
  if (key in PCFG_SET_KEYS) {
    const pc = await getPipelineCfg(env);
    pc[key] = v;
    await putPipelineCfg(env, pc);
    await audit(env, tgUser, 'set:' + key, v); // D9/G4-5
    return Response.json({ ok: true, key, value: v });
  }
  const cfg = await getCfg(env);
  cfg[key] = v;
  await putCfg(env, cfg);
  if (key === 'channel_user') await kvDel(env, 'meta:channel'); // force re-resolve
  await audit(env, tgUser, 'set:' + key, v); // D9/G4-5
  return Response.json({ ok: true, key, value: v });
}

async function adminPostNow(env, body, tgUser) {
  const kind = body.kind === 'digest' ? 'digest' : 'card';
  if (kind === 'card') await dailyChannelCard(env, true);
  else { await kvDel(env, 'ch:last_post'); await channelDigest(env); }
  await audit(env, tgUser, 'post_now', kind); // D9/G4-5
  return Response.json({ ok: true, kind });
}

/* D8/P6 — «ارسال تستی به من»: preview any automated message in the admin's own chat.
   Same builders as the real paths → the sample is the truth, no fake text. */
async function adminTestNotify(env, body, tgUser) {
  const chatId = tgUser.id;
  const kind = body.kind === 'card' ? 'card' : body.kind === 'digest' ? 'digest' : 'watchtower';
  const s = await getStats(env, true); // D10.1/B1 — the preview must quote the same run it shows
  if (!s || !s.validation || !s.scoring) return Response.json({ error: 'no_data' }, { status: 503 });
  await audit(env, tgUser, 'test_notify', kind); // D9/G4-5
  const u = await getUser(env, chatId);
  const lang = (u && u.lang) || 'fa';
  const v = s.validation, p = v.latency_ms || {};
  if (kind === 'watchtower') {
    const origin = await kvGet(env, 'meta:origin');
    const rows = [];
    if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
    rows.push([{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold' }]);
    /* D9/G2-4 — the template (when set) IS the preview; 🧪 marks the sample */
    const custom = renderTpl((await getTemplates(env)).watchtower, { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0) });
    await sendMessage(env, chatId, '🧪 ' + (custom || t(lang, 'watchtower', { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0) })), { reply_markup: { inline_keyboard: rows } });
    return Response.json({ ok: true, kind });
  }
  const bankLines = s.bank && s.bank.size != null ? [
    t(lang, 'bank_line', { n: fmt(s.bank.size), hit: s.bank.hit_rate != null ? s.bank.hit_rate : '—', streak: s.bank.avg_streak != null ? s.bank.avg_streak : '—' }),
    t(lang, 'bank_src', { h: fmt((s.bank.sources && s.bank.sources.healthy) || 0), s: fmt((s.bank.sources && s.bank.sources.suspect) || 0), q: fmt((s.bank.sources && s.bank.sources.quarantined) || 0) }),
  ] : [];
  const head = kind === 'card' ? [t(lang, 'daily_title'), '🧪 ' + (u && u.lang === 'fa' ? 'نمونهٔ تستی' : 'test preview'), '']
                              : [t(lang, 'digest_title'), '🧪 ' + (u && u.lang === 'fa' ? 'نمونهٔ تستی' : 'test preview'), ''];
  /* D9/G2-4 — preview the saved template when there is one, else the classic text */
  const tpls = await getTemplates(env);
  const custom = renderTpl(kind === 'card' ? tpls.card : tpls.digest, {
    date: (() => { try { return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()); } catch (_) { return ''; } })(),
    gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0),
    sources_ok: fmt(s.sources_ok), sources_total: fmt(s.sources_total),
    bank_size: s.bank && s.bank.size != null ? fmt(s.bank.size) : '—',
    hit: s.bank && s.bank.hit_rate != null ? s.bank.hit_rate : '—',
    streak: s.bank && s.bank.avg_streak != null ? s.bank.avg_streak : '—',
    last_run: relTime(runStamp(s), lang),
  });
  const msg = custom ? '🧪 ' + custom : [...head,
    '🥇 ' + fmt(s.scoring.gold) + '  ·  ❤️ ' + fmt(v.alive) + '  ·  ⚡ ' + Math.round(p.p50 || 0) + 'ms',
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    ...bankLines,
  ].join('\n');
  try {
    const png = (await fetchCardPng(env, s)) || (await renderCardPNG(s));
    const sent = await sendPhotoFile(env, chatId, png, 'ariston-card.png', msg.slice(0, 1024));
    if (sent && sent.ok) return Response.json({ ok: true, kind });
  } catch (_) { /* fall through to the text sample */ }
  await sendMessage(env, chatId, msg);
  return Response.json({ ok: true, kind });
}

/* ─── D11/U4-2 — keyed API + «new run» webhook ──────────────────────────────
   Both ship OFF: /api/v1/intel answers 403 api_disabled until the panel
   generates api_key, and the webhook stays silent until webhook_url is
   saved. Receivers verify authenticity via x-ariston-sign =
   sha256=HMAC-SHA256(webhook_secret, body). A webhook or API failure never
   breaks the cron. Quiet hours do NOT apply to the webhook (machine-to-machine). */

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function postWebhook(env, url, payload) {
  const secret = String((await getCfg(env)).webhook_secret || '');
  const sig = secret ? { 'x-ariston-sign': 'sha256=' + (await hmacSha256Hex(secret, payload)) } : {};
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...sig }, body: payload, signal: AbortSignal.timeout(8000) });
}

/* cron-side dispatcher: one POST per fresh publish, dedupe keyed on the
   publish stamp; first boot records the baseline and does not fire */
async function newRunWebhook(env) {
  const cfg = await getCfg(env);
  const url = String(cfg.webhook_url || '');
  if (!url || !/^https?:\/\//i.test(url)) return; // default: off
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring || !s.generated_at) return;
  if (s.validation.skipped) return; // a skip_test run has no honest numbers
  const stamp = runStamp(s);
  const last = await kvGet(env, 'hook:last_stamp');
  if (last === stamp) return;
  await kvPut(env, 'hook:last_stamp', stamp, 7 * 86400);
  if (!last) return; // baseline, don't fire
  const payload = JSON.stringify({
    event: 'new_run',
    bot: '@' + ((await kvGet(env, 'meta:bot_username')) || ''),
    generated_at: s.generated_at,
    published_at: s.published_at || null,
    gold: s.scoring.gold || 0,
    alive: s.validation.alive || 0,
    probed: s.validation.probed || 0,
    p50: Math.round((s.validation.latency_ms || {}).p50 || 0),
    bank: { size: (s.bank && s.bank.size) || 0, hit_rate: (s.bank && s.bank.hit_rate) != null ? s.bank.hit_rate : null },
    ts: new Date().toISOString(),
  });
  try {
    const r = await postWebhook(env, url, payload);
    if (!r.ok) await logErr(env, 'webhook', 'POST → HTTP ' + r.status);
  } catch (e) {
    await logErr(env, 'webhook', (e && e.message) || 'fetch failed');
  }
}

async function adminGenApi(env, body, tgUser) {
  const cfg = await getCfg(env);
  cfg.api_key = crypto.randomUUID();
  cfg.webhook_secret = crypto.randomUUID().replace(/-/g, '');
  await putCfg(env, cfg);
  await audit(env, tgUser, 'gen_api', 'api_key + webhook_secret rotated');
  return Response.json({ ok: true, api_key: cfg.api_key, webhook_secret: cfg.webhook_secret });
}

async function adminTestWebhook(env, body, tgUser) {
  const cfg = await getCfg(env);
  const url = String(cfg.webhook_url || '');
  if (!url) return Response.json({ error: 'no_webhook' }, { status: 400 });
  const payload = JSON.stringify({ event: 'test', ts: new Date().toISOString() });
  try {
    const r = await postWebhook(env, url, payload);
    await audit(env, tgUser, 'test_webhook', 'HTTP ' + r.status);
    return Response.json({ ok: r.ok, status: r.status });
  } catch (e) {
    await audit(env, tgUser, 'test_webhook', 'ERR ' + ((e && e.message) || 'fetch'));
    return Response.json({ ok: false, error: (e && e.message) || 'fetch_failed' });
  }
}

/* D9/G4-1 — the user list, now with search. Numeric q = chat-id match (cheap,
   index-only). Text q = newest-first scan, 30 records per call (free-plan
   subrequest budget) with a server-side cursor the panel keeps pulling. */
async function adminUsers(env, body) {
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const total = Array.isArray(idx) ? idx.length : 0;
  const q = String(body.q || '').trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 100);
  const mk = (id, u) => ({
    chat_id: String(id), name: (u && u.name) || null, tg: (u && u.tg) || null,
    lang: (u && u.lang) || '—', isp: (u && u.isp) || '—', client: (u && u.client) || '—',
    refs: (u && u.ref_count) || 0, since: (u && u.created) || null,
    blocked: Boolean(u && u.blocked), quota_ovr: (u && u.quota_ovr != null) ? u.quota_ovr : null,
  });
  if (q && /^\d+$/.test(q)) { // id search — pure index scan, no extra KV reads
    const hits = idx.filter((id) => String(id).includes(q));
    const off = Math.max(parseInt(body.offset, 10) || 0, 0);
    const slice = hits.slice(off, off + limit);
    const items = [];
    for (const id of slice) items.push(mk(id, await getUser(env, id)));
    return Response.json({ total: hits.length, offset: off, items, q });
  }
  if (q) { // name / username search — cursor scan, 30 records max per call
    const from = Math.min(Math.max(parseInt(body.scan_from, 10) || total, 0), total); // start at the newest
    const scanN = Math.min(30, from);
    const items = [];
    let i = from - 1;
    for (; i >= from - scanN && i >= 0; i--) {
      const id = idx[i];
      const u = await getUser(env, id);
      const name = String((u && (u.name || u.tg)) || '').toLowerCase();
      if (name.includes(q)) items.push(mk(id, u));
      if (items.length >= limit) break;
    }
    return Response.json({ total, offset: 0, items, q, scanned_to: i + 1, next: i + 1 > 0 && items.length < limit });
  }
  const off = Math.max(parseInt(body.offset, 10) || 0, 0);
  const slice = idx.slice(Math.max(0, total - off - limit), Math.max(0, total - off)).reverse(); // newest first
  const items = [];
  for (const id of slice) {
    items.push(mk(id, await getUser(env, id)));
  }
  return Response.json({ total, offset: off, items });
}

/* ─────── D9/G4 — user management: profile · block · quota · group reset ────── */

/* G4-2 — full profile: identity · prefs · quota · history/votes/favs counters */
async function adminUserProfile(env, body) {
  const id = String(body.id || '').replace(/\D/g, '');
  if (!id) return Response.json({ error: 'bad_id' }, { status: 400 });
  const u = await getUser(env, id);
  if (!u) return Response.json({ error: 'no_user' }, { status: 404 });
  const cfg = await getCfg(env);
  const [marks, favs, hist, blocked] = await Promise.all([
    marksGet(env, id), favsGet(env, id), historyGet(env, id), kvGet(env, 'blocked:' + id, 'json'),
  ]);
  const mvals = Object.values(marks || {});
  return Response.json({
    chat_id: id, name: u.name || null, tg: u.tg || null,
    lang: u.lang || 'fa', isp: u.isp || '—', client: u.client || '—',
    ref_count: u.ref_count || 0, quota: resolveQuota(u, cfg), quota_ovr: u.quota_ovr != null ? u.quota_ovr : null,
    tier: userLevel(u.ref_count || 0).key,
    rotation: u.rotation === 'run' ? 'run' : 'day', sub_mode: u.sub_mode || 'mix',
    theme: u.theme || null, created: u.created || null, token: u.token || null,
    marks_ok: mvals.filter((v) => v === 1).length, marks_fail: mvals.filter((v) => v === 2).length,
    favs: Array.isArray(favs) ? favs.length : 0, hist: Array.isArray(hist) ? hist.length : 0,
    blocked: blocked ? { ts: blocked.ts || null, reason: blocked.reason || '' } : null,
    last_alloc: (u.token ? (await kvGet(env, 'alloc:' + u.token, 'json')) || null : null)?.created || null,
  });
}

/* G4-3 — block / unblock. Admins and the owner can never be blocked. */
async function adminUserBlock(env, body, tgUser) {
  const id = String(body.id || '').replace(/\D/g, '');
  if (!id) return Response.json({ error: 'bad_id' }, { status: 400 });
  if (await isAdmin(env, id)) return Response.json({ error: 'is_admin' }, { status: 400 });
  const on = body.on !== false;
  if (on) {
    await kvPut(env, 'blocked:' + id, JSON.stringify({ ts: new Date().toISOString(), by: tgUser ? tgUser.id : null, reason: String(body.reason || '').slice(0, 140) }));
  } else {
    await kvDel(env, 'blocked:' + id);
  }
  const u = await getUser(env, id); // display flag only — the KV key above is the gate
  if (u) { u.blocked = on; await saveUser(env, id, u); }
  await audit(env, tgUser, on ? 'block' : 'unblock', id);
  return Response.json({ ok: true, id, blocked: on });
}

/* G4-4 — personal quota override (value = null → back to the referral formula) */
async function adminUserQuota(env, body, tgUser) {
  const id = String(body.id || '').replace(/\D/g, '');
  if (!id) return Response.json({ error: 'bad_id' }, { status: 400 });
  const u = await getUser(env, id);
  if (!u) return Response.json({ error: 'no_user' }, { status: 404 });
  if (body.value == null || body.value === '') delete u.quota_ovr;
  else {
    const n = Math.round(Number(body.value));
    if (!isFinite(n)) return Response.json({ error: 'bad_value' }, { status: 400 });
    u.quota_ovr = Math.min(50, Math.max(0, n));
  }
  await saveUser(env, id, u);
  if (u.token) await kvDel(env, 'alloc:' + u.token); // new quota applies on the next pull
  await audit(env, tgUser, 'quota', id + ' → ' + (u.quota_ovr != null ? u.quota_ovr : 'auto'));
  return Response.json({ ok: true, id, quota_ovr: u.quota_ovr != null ? u.quota_ovr : null });
}

/* G4-4 — group reset: clear EVERY user's quota override (chunked cursor job —
   free-plan subrequest budget, same pattern as the broadcast sender). */
async function adminQuotaReset(env, body, tgUser) {
  const op = String(body.op || 'step');
  if (op === 'cancel') { await kvDel(env, 'qr:cursor'); await kvPut(env, 'qr:active', '0'); return Response.json({ ok: true, active: false }); }
  if (op === 'status') return Response.json({ ok: true, active: (await kvGet(env, 'qr:active')) === '1', cursor: parseInt((await kvGet(env, 'qr:cursor')) || '0', 10) });
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const total = Array.isArray(idx) ? idx.length : 0;
  if (op === 'start') { await kvPut(env, 'qr:cursor', '0'); await kvPut(env, 'qr:active', '1'); await audit(env, tgUser, 'quota_reset', 'start · ' + total + ' users'); }
  if ((await kvGet(env, 'qr:active')) !== '1') return Response.json({ ok: true, active: false, cursor: 0, total });
  let cursor = Math.max(parseInt((await kvGet(env, 'qr:cursor')) || '0', 10), 0);
  let cleared = 0, examined = 0;
  const CH = 30;
  while (cursor < total && examined < CH) {
    const id = idx[total - 1 - cursor]; // newest first
    if (id != null) {
      const u = await getUser(env, id);
      if (u && u.quota_ovr != null) { delete u.quota_ovr; await saveUser(env, id, u); cleared++; }
    }
    cursor++; examined++;
  }
  await kvPut(env, 'qr:cursor', String(cursor));
  if (cursor >= total) { await kvPut(env, 'qr:active', '0'); await audit(env, tgUser, 'quota_reset', 'done · ' + total + ' users'); }
  return Response.json({ ok: true, active: cursor < total, cursor, total, cleared, examined });
}

/* G4-5 — read the audit log (newest first) */
async function adminAudit(env, body) {
  const log = (await kvGet(env, 'audit:log', 'json')) || [];
  const n = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 100);
  return Response.json({ ok: true, total: Array.isArray(log) ? log.length : 0, items: (Array.isArray(log) ? log : []).slice(0, n) });
}

/* G2-4 — save the editable message templates (empty string = built-in text) */
async function adminTemplates(env, body, tgUser) {
  const cur = await getTemplates(env);
  const next = { ...cur };
  for (const k of Object.keys(TPL_DEFAULT)) {
    if (k in body) {
      const s = String(body[k] == null ? '' : body[k]).slice(0, 900);
      next[k] = s.trim() ? s : '';   // empty = back to the built-in text
    }
  }
  await kvPut(env, 'cfg:templates', JSON.stringify(next));
  await audit(env, tgUser, 'templates', Object.keys(body).filter((k) => k in TPL_DEFAULT).join(','));
  return Response.json({ ok: true, tpl: await getTemplates(env) });
}

/* ─── D10/G6 — settings backup: export / restore the three config keys + the
   /freq interval as one JSON.  Restore re-clamps EVERY value through the same
   specs adminSet uses; unknown keys are skipped. No secrets ever leave KV. ─── */
async function adminSettingsExport(env) {
  const pc = await getPipelineCfg(env);
  return Response.json({
    ariston_settings_version: 1,
    exported_at: new Date().toISOString(),
    cfg_admin: await getCfg(env),
    cfg_pipeline: { ...pc, force_full_scan: false, skip_test: false }, // one-shots never ride a backup
    cfg_templates: await getTemplates(env),
    every_hours: Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6)),
  }, { headers: { 'content-disposition': 'attachment; filename="ariston-settings.json"' } });
}

/* spec-driven clamp shared with adminSet (same regex, same ranges) */
function clampBySpec(spec, v) {
  if (spec === 'bool') return Boolean(v);
  if (spec === 'handle') {
    const s = String(v || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
    return s.length >= 4 ? s : null;
  }
  if (spec === 'tpl') {
    const s = sanitizeTpl(v);
    return (s.length >= 3 && /[A-Za-z\u0600-\u06FF]/.test(s)) ? s : null;
  }
  if (spec === 'csv') return sanitizeCsv(v);
  const m = String(spec).match(/^(?:int|num):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  const c = Math.min(parseFloat(m[2]), Math.max(parseFloat(m[1]), n));
  return String(spec).startsWith('int:') ? Math.round(c) : c;
}

async function adminSettingsImport(env, body, tgUser) {
  const inc = body && body.settings;
  if (!inc || typeof inc !== 'object') return Response.json({ error: 'bad_json' }, { status: 400 });
  let applied = 0, skipped = 0;
  /* cfg:admin — known keys only, clamped, admin_ids never touched here */
  if (inc.cfg_admin && typeof inc.cfg_admin === 'object') {
    const cfg = await getCfg(env);
    for (const [k, spec] of Object.entries(ADMIN_SET_KEYS)) {
      if (!(k in inc.cfg_admin) || k === 'every_hours') { continue; }
      const v = clampBySpec(spec, inc.cfg_admin[k]);
      if (v == null) { skipped++; continue; }
      cfg[k] = v; applied++;
    }
    await putCfg(env, cfg);
  }
  /* cfg:pipeline */
  if (inc.cfg_pipeline && typeof inc.cfg_pipeline === 'object') {
    const pc = await getPipelineCfg(env);
    for (const [k, spec] of Object.entries(PCFG_SET_KEYS)) {
      if (!(k in inc.cfg_pipeline) || k === 'force_full_scan' || k === 'skip_test') { continue; } // one-shots never ride a backup
      const v = clampBySpec(spec, inc.cfg_pipeline[k]);
      if (v == null) { skipped++; continue; }
      pc[k] = v; applied++;
    }
    await putPipelineCfg(env, pc);
  }
  /* cfg:templates */
  if (inc.cfg_templates && typeof inc.cfg_templates === 'object') {
    const cur = await getTemplates(env);
    const next = { ...cur };
    for (const k of Object.keys(TPL_DEFAULT)) {
      if (!(k in inc.cfg_templates)) continue;
      next[k] = String(inc.cfg_templates[k] == null ? '' : inc.cfg_templates[k]).slice(0, 900).trim() || '';
      applied++;
    }
    await kvPut(env, 'cfg:templates', JSON.stringify(next));
  }
  /* /freq interval */
  if (inc.every_hours != null) {
    const n = Math.round(Number(inc.every_hours));
    if (isFinite(n) && n >= 1 && n <= 24) { await kvPut(env, 'ch:every_hours', String(n)); await kvDel(env, 'ch:last_post'); applied++; }
    else skipped++;
  }
  await audit(env, tgUser, 'settings_import', 'applied ' + applied + ' · skipped ' + skipped);
  return Response.json({ ok: true, applied, skipped });
}

/* ─── D10/G6 — read-only KV browser.  Safe prefixes show name + size + value
   (truncated); user-data prefixes are metadata-only (name + TTL), values are
   NEVER returned.  Read-only by design: no write, no delete here. ─── */
const KV_OPEN_PREFIXES = ['cfg:', 'meta:', 'ch:', 'audit:', 'err:', 'stats:', 'watch:', 'favscan:', 'pcfg:', 'cron:', 'late:', 'wk:', 'card:', 'bc:', 'health:'];
const KV_META_PREFIXES = ['blocked:', 'fb:', 'fbu:', 'fav:', 'hist:', 'sub:', 'user:', 'qr:', 'alloc:', 'rich:', 'rl:', 'sess:', 'wb:'];
function kvPolicy(key) {
  const k = String(key || '');
  if (KV_OPEN_PREFIXES.some((p) => k.startsWith(p))) return 'open';
  if (KV_META_PREFIXES.some((p) => k.startsWith(p))) return 'meta';
  return 'meta'; // unknown prefix → conservative: metadata only
}
async function adminKvBrowser(env, body) {
  const prefix = String(body.prefix || '').slice(0, 40);
  if (!/^[\w:.-]{0,40}$/.test(prefix)) return Response.json({ error: 'bad_prefix' }, { status: 400 });
  const cursor = String(body.cursor || '');
  let page;
  try { page = await env.KV.list({ prefix, cursor: cursor || undefined, limit: 20 }); }
  catch (e) { return Response.json({ error: 'kv_list_failed' }, { status: 503 }); }
  const items = [];
  let valueBudget = 6; // free-plan subrequest budget: at most 6 value reads per call
  for (const it of (page.keys || [])) {
    const pol = kvPolicy(it.name);
    const item = { key: it.name, pol, exp: it.expiration || null };
    if (pol === 'open' && valueBudget > 0) {
      valueBudget--;
      const v = await kvGet(env, it.name, 'text');
      item.size = v != null ? v.length : null;
      item.value = v != null ? v.slice(0, 400) : null;
    }
    items.push(item);
  }
  return Response.json({ ok: true, items, cursor: page.list_complete ? null : (page.cursor || ''), done: Boolean(page.list_complete) });
}

/* ─── D10/G6 — selective cleanup.  Fixed categories only (never user data
   unless explicitly listed), ≤50 deletes per call with a resumable cursor,
   every step audited. ─── */
const CLEANUP_KINDS = {
  errlog: { label: 'err ring', single: 'err:log' },
  audit: { label: 'audit log', single: 'audit:log' },
  favdead: { label: 'fav-death guards', prefix: 'favdead:' },
  wkguards: { label: 'weekly guards', prefix: 'wk:sent:' },
  cursors: { label: 'scan cursors', keys: ['favscan:cursor', 'wk:cursor', 'qr:cursor', 'clean:cursor'] },
  oneshots: { label: 'one-shot flags', keys: ['watch:last_gen', 'card:last', 'pcfg:last_full_done', 'late:gen', 'late:alert', 'ch:last_post'] },
};
async function adminCleanup(env, body, tgUser) {
  const kind = String(body.kind || '');
  const spec = CLEANUP_KINDS[kind];
  if (!spec) return Response.json({ error: 'bad_kind' }, { status: 400 });
  const ck = 'clean:cursor:' + kind;
  let deleted = 0;
  if (spec.single) { await kvDel(env, spec.single); deleted = 1; }
  else if (spec.keys) { for (const k of spec.keys) { await kvDel(env, k); deleted++; } }
  else if (spec.prefix) {
    let cursor = String(body.cursor || (await kvGet(env, ck)) || '');
    let page = null;
    try { page = await env.KV.list({ prefix: spec.prefix, cursor: cursor || undefined, limit: 50 }); }
    catch (_) { return Response.json({ error: 'kv_list_failed' }, { status: 503 }); }
    for (const it of (page.keys || [])) { await kvDel(env, it.name); deleted++; }
    if (!page.list_complete) { await kvPut(env, ck, page.cursor || '', 86400); return Response.json({ ok: true, kind, deleted, done: false, cursor: page.cursor || '' }); }
    await kvDel(env, ck);
  }
  await audit(env, tgUser, 'cleanup', kind + ' · ' + deleted);
  return Response.json({ ok: true, kind, deleted, done: true });
}

/* ─── D10/G7 — one-click health test: KV write/read/delete · Telegram getMe ·
   channel visibility · webhook info · data-branch freshness · cron tick age.
   Every check is individually fail-safe; the answer is always a full report. ─── */
async function adminHealth(env) {
  const checks = [];
  const run = async (k, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      checks.push({ k, ok: true, ms: Date.now() - t0, detail: detail || '' });
    } catch (e) {
      checks.push({ k, ok: false, ms: Date.now() - t0, detail: String(e && e.message || e).slice(0, 120) });
    }
  };
  const withTimeout = (ms) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, done: () => clearTimeout(t) };
  };
  await run('kv', async () => {
    await kvPut(env, 'health:probe', String(Date.now()), 120);
    const v = await kvGet(env, 'health:probe');
    await kvDel(env, 'health:probe');
    if (!v) throw new Error('read-back failed');
    return 'write/read/delete ok';
  });
  await run('telegram', async () => {
    const r = await api(env, 'getMe');
    if (!r || !r.ok) throw new Error((r && r.description) || 'getMe failed');
    return '@' + (r.result.username || '?');
  });
  await run('channel', async () => {
    const cfg = await getCfg(env);
    const chan = env.CHANNEL_ID || (await kvGet(env, 'meta:channel'));
    if (!chan) return 'not configured (skip)';
    const r = await api(env, 'getChat', { chat_id: chan });
    if (!r || !r.ok) throw new Error((r && r.description) || 'getChat failed');
    return '@' + (r.result.username || r.result.id || '?');
  });
  await run('webhook', async () => {
    const r = await api(env, 'getWebhookInfo');
    if (!r || !r.ok) throw new Error('getWebhookInfo failed');
    const w = r.result || {};
    const pending = w.pending_update_count || 0;
    if (w.last_error_message) throw new Error('last_error: ' + w.last_error_message);
    if (pending > 50) throw new Error(pending + ' pending updates');
    return (w.url || 'no url') + ' · pending ' + pending;
  });
  let statsAge = null;
  await run('data', async () => {
    const t2 = withTimeout(8000);
    try {
      const r = await fetch(RAW + 'stats.json?t=' + Date.now(), { signal: t2.signal, headers: { 'user-agent': 'ariston-bot/1.0' }, cf: { cacheTtl: 0 } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !(j.published_at || j.generated_at)) throw new Error('no generated_at');
      statsAge = Math.round((Date.now() - Date.parse(j.published_at || j.generated_at)) / 60000); // D10.2/B2
      return 'run ' + statsAge + ' min ago · ' + ((j.validation || {}).alive ?? '?') + ' alive';
    } finally { t2.done(); }
  });
  await run('cron', async () => {
    const tick = await kvGet(env, 'cron:last_tick');
    if (!tick) return 'no tick recorded yet';
    const age = Math.round((Date.now() - Date.parse(tick)) / 60000);
    if (!isFinite(age)) return 'tick unparsable';
    if (age > 45) throw new Error('last tick ' + age + ' min ago (>45)');
    return 'last tick ' + age + ' min ago';
  });
  const errors = (await kvGet(env, 'err:log', 'json')) || [];
  await audit(env, null, 'health', checks.filter((c) => !c.ok).map((c) => c.k).join(',') || 'all ok');
  return Response.json({ ok: true, checks, stats_age_min: statsAge, cron_last_tick: (await kvGet(env, 'cron:last_tick')) || null, errors: Array.isArray(errors) ? errors : [] });
}

/* ─── D7 — admin ops: admins · broadcast · purge · scoped commands ───────── */

/* D7 — scoped command lists: /panel and /freq are registered ONLY inside the
   admin chats' scope, so the regular user's bot menu never shows them. */
const USER_COMMANDS = [
  { command: 'start', description: 'Start / main menu' },
  { command: 'gold', description: 'Top gold configs' },
  { command: 'best', description: 'Gold ticket — fastest alive' },
  { command: 'stats', description: 'Live run stats' },
  { command: 'sub', description: 'Personal subscription link' },
  { command: 'ref', description: 'Invite friends — quota up to 20' },
  { command: 'settings', description: 'ISP / client / name / rotation' },
  { command: 'lang', description: 'Change language' },
];
const ADMIN_COMMANDS = [
  ...USER_COMMANDS,
  { command: 'panel', description: 'Admin settings panel' },
  { command: 'freq', description: 'Channel digest interval (owner)' },
];
async function syncAdminCommands(env) {
  const cfg = await getCfg(env);
  const owner = await kvGet(env, 'meta:owner');
  const ids = [...new Set([...(cfg.admin_ids || []).map(String), owner].filter(Boolean).map(String))];
  const glob = await api(env, 'setMyCommands', { commands: USER_COMMANDS }); // default scope — no /panel
  let scopes = 0;
  for (const id of ids) {
    const r = await api(env, 'setMyCommands', { commands: ADMIN_COMMANDS, scope: { type: 'chat', chat_id: Number(id) } });
    if (r && r.ok) scopes++;
  }
  return { global: Boolean(glob && glob.ok), admins: scopes };
}

async function adminAdmins(env, body, tgUser) {
  const cfg = await getCfg(env);
  const owner = await kvGet(env, 'meta:owner');
  const id = String(body.id || '').trim();
  if (body.op === 'remove') {
    if (id === String(owner)) return Response.json({ error: 'owner' }, { status: 400 });
    cfg.admin_ids = (cfg.admin_ids || []).filter((x) => String(x) !== id);
    await putCfg(env, cfg);
    await audit(env, tgUser, 'admin_remove', id); // D9/G4-5
  } else {
    if (!/^\d{3,20}$/.test(id)) return Response.json({ error: 'bad_id' }, { status: 400 });
    cfg.admin_ids = cfg.admin_ids || [];
    if (!cfg.admin_ids.map(String).includes(id)) { cfg.admin_ids.push(Number(id)); await putCfg(env, cfg); await audit(env, tgUser, 'admin_add', id); }
  }
  await syncAdminCommands(env); // the menu updates right away
  const admins = [];
  if (owner) admins.push({ id: Number(owner), owner: true });
  for (const a of (cfg.admin_ids || []).map(String)) if (a !== String(owner)) admins.push({ id: Number(a), owner: false });
  return Response.json({ ok: true, admins });
}

/* D7 — chunked broadcast: sends BC_CHUNK messages per call, the panel loops
   until remaining === 0.  Progress lives in KV, so it survives reloads. */
const BC_CHUNK = 25;
async function adminBroadcast(env, body, tgUser) {
  const op = body.op === 'start' ? 'start' : body.op === 'cancel' ? 'cancel' : body.op === 'status' ? 'status' : 'step';
  if (op === 'cancel') {
    await kvDel(env, 'bc:active');
    await kvDel(env, 'bc:text');
    await audit(env, tgUser, 'broadcast', 'cancel');
    const total = parseInt((await kvGet(env, 'bc:total')) || '0', 10);
    const cursor = parseInt((await kvGet(env, 'bc:cursor')) || '0', 10);
    const fails = parseInt((await kvGet(env, 'bc:fails')) || '0', 10);
    return Response.json({ ok: true, total, cursor, fails, remaining: Math.max(0, total - cursor), active: false });
  }
  if (op === 'start') {
    const text = String(body.text || '').trim();
    if (!text) return Response.json({ error: 'empty' }, { status: 400 });
    if (text.length > 2000) return Response.json({ error: 'big' }, { status: 400 });
    const idx = (await kvGet(env, 'users:index', 'json')) || [];
    await kvPut(env, 'bc:text', text);
    await kvPut(env, 'bc:total', String(idx.length), 86400);
    await kvPut(env, 'bc:cursor', '0', 86400);
    await kvPut(env, 'bc:fails', '0', 86400);
    await kvPut(env, 'bc:active', '1', 86400);
    await audit(env, tgUser, 'broadcast', 'start · ' + text.length + ' chars');
  }
  if (op === 'status') {
    const total = parseInt((await kvGet(env, 'bc:total')) || '0', 10);
    const cursor = parseInt((await kvGet(env, 'bc:cursor')) || '0', 10);
    const fails = parseInt((await kvGet(env, 'bc:fails')) || '0', 10);
    return Response.json({ ok: true, total, cursor, fails, remaining: Math.max(0, total - cursor), active: (await kvGet(env, 'bc:active')) === '1' });
  }
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const text = await kvGet(env, 'bc:text');
  let cursor = parseInt((await kvGet(env, 'bc:cursor')) || '0', 10);
  let fails = parseInt((await kvGet(env, 'bc:fails')) || '0', 10);
  if (!text || cursor >= idx.length) {
    await kvDel(env, 'bc:active');
    return Response.json({ ok: true, total: idx.length, cursor, fails, remaining: Math.max(0, idx.length - cursor), active: false });
  }
  const end = Math.min(idx.length, cursor + BC_CHUNK);
  for (let i = cursor; i < end; i++) {
    const r = await sendMessage(env, idx[i], text).catch(() => null);
    if (!r || !r.ok) fails++;
  }
  cursor = end;
  await kvPut(env, 'bc:cursor', String(cursor), 86400);
  await kvPut(env, 'bc:fails', String(fails), 86400);
  const active = cursor < idx.length;
  if (!active) await kvDel(env, 'bc:active');
  return Response.json({ ok: true, total: idx.length, cursor, fails, remaining: Math.max(0, idx.length - cursor), active });
}

/* D7 — drop the data-branch caches so everything re-fetches fresh */
async function adminPurge(env, body, tgUser) {
  let purged = 0;
  try {
    for (const prefix of ['file:', 'rich:']) {
      let cursor;
      do {
        const page = await env.KV.list({ prefix, cursor, limit: 100 });
        for (const k of (page.keys || [])) { await kvDel(env, k.name); purged++; }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor && purged < 500);
    }
  } catch (_) { /* KV hiccup → whatever we collected */ }
  await audit(env, tgUser, 'purge', purged + ' keys'); // D9/G4-5
  return Response.json({ ok: true, purged });
}

async function adminSyncCmds(env, body, tgUser) {
  const r = await syncAdminCommands(env);
  await audit(env, tgUser, 'sync_cmds', r && r.admins != null ? r.admins + ' scopes' : ''); // D9/G4-5
  return Response.json({ ok: true, ...r });
}

/* D6 — aggregated crowd votes (👍/👎), ranked by (up − down); raw → full list for export */
async function adminFeedback(env, body) {
  const out = [];
  try {
    let cursor;
    do {
      const page = await env.KV.list({ prefix: 'fb:', cursor, limit: 100 });
      for (const k of (page.keys || [])) {
        const v = await kvGet(env, k.name, 'json');
        if (v && (v.up || v.down)) out.push({ hash: k.name.slice(3), up: v.up || 0, down: v.down || 0 });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && out.length < 500);
  } catch (_) { /* KV hiccup → whatever we collected */ }
  out.sort((a, b) => (b.up - b.down) - (a.up - a.down));
  return Response.json({ ok: true, total: out.length, items: body.raw ? out : out.slice(0, 30) });
}

/* ───────────────────── public API v1 (developers) ─────────────────────────── */

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const jsonRes = (obj, status = 200, extra = {}) =>
  Response.json(obj, { status, headers: { ...CORS_HEADERS, 'cache-control': 'public, max-age=120', ...extra } });

/* best-effort per-IP-per-minute budget (KV is eventually consistent — a soft cap) */
async function rateLimit(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  const win = Math.floor(Date.now() / 60000);
  const key = 'rl:' + ip + ':' + win;
  const n = parseInt((await kvGet(env, key)) || '0', 10) + 1;
  await kvPut(env, key, String(n), 120);
  return n <= API_RATE_LIMIT;
}

/* D11/U4-2 — keyed intel endpoint: everything non-PII in one machine-readable
   call. 403 api_disabled until the panel generates a key; the key comes via
   ?key= or Authorization: Bearer. Same best-effort per-IP budget as the open API. */
async function apiV1Intel(env, url, request) {
  const cfg = await getCfg(env);
  if (!cfg.api_key) return jsonRes({ error: 'api_disabled' }, 403);
  const key = String(url.searchParams.get('key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')).trim();
  if (!key || key !== cfg.api_key) return jsonRes({ error: 'unauthorized' }, 401);
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return jsonRes({ error: 'no_data' }, 503);
  const v = s.validation, p = v.latency_ms || {};
  return jsonRes({
    generated_at: s.generated_at || null,
    published_at: s.published_at || null,
    bot: ((await kvGet(env, 'meta:bot_username')) || '') || null,
    channel_user: cfg.channel_user || null,
    sources: { ok: s.sources_ok || 0, total: s.sources_total || 0, failed: s.sources_failed || {} },
    unique: s.unique || 0,
    validation: {
      probed: v.probed || 0, alive: v.alive || 0, dead: v.dead || 0, unsupported: v.unsupported || 0,
      skipped: Boolean(v.skipped),
      latency_ms: { p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0) },
      by_protocol_alive: v.by_protocol_alive || {},
    },
    scoring: s.scoring || {},
    bank: {
      size: (s.bank && s.bank.size) || 0,
      hit_rate: (s.bank && s.bank.hit_rate) != null ? s.bank.hit_rate : null,
      avg_streak: (s.bank && s.bank.avg_streak) != null ? s.bank.avg_streak : null,
      best_streak: (s.bank && s.bank.best_streak) != null ? s.bank.best_streak : null,
      avg_ms: (s.bank && s.bank.avg_ms) != null ? s.bank.avg_ms : null,
      rescue: (s.bank && s.bank.rescue) || null,
    },
    operators: s.operators || {},
    health_7d: s.health_7d || [],
    pipeline_cfg: (await getPipelineCfg(env)) || {},
    cron_last_tick: (await kvGet(env, 'cron:last_tick')) || null,
    watch_last_run: (await kvGet(env, 'watch:last_gen')) || null,
  });
}

async function apiV1Stats(env) {
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return jsonRes({ error: 'no_data' }, 503);
  const v = s.validation, p = v.latency_ms || {};
  return jsonRes({
    generated_at: s.generated_at || null,
    published_at: s.published_at || null, // D10.2/B2
    sources: { ok: s.sources_ok || 0, total: s.sources_total || 0 },
    unique: s.unique || 0,
    validation: {
      probed: v.probed || 0, alive: v.alive || 0,
      latency_ms: { p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0) },
      by_protocol_alive: v.by_protocol_alive || {},
    },
    scoring: { gold: s.scoring.gold || 0, silver: s.scoring.silver || 0, bronze: s.scoring.bronze || 0 },
  });
}

const API_TIERS = { gold: 'gold.txt', silver: 'silver.txt', all: null, validated: 'validated.txt' };

async function apiConfigs(env, url) {
  const q = url.searchParams;
  const tier = q.get('tier') in API_TIERS ? q.get('tier') : 'gold';
  const format = q.get('format') === 'txt' ? 'txt' : 'json';
  const protoIn = (q.get('protocol') || '').toLowerCase().trim();
  const scheme = INLINE_PROTOS[protoIn] || protoIn; // hy2 → hysteria2
  const op = (q.get('operator') || '').toLowerCase().trim();
  const limit = Math.min(Math.max(parseInt(q.get('limit') || '100', 10) || 100, 1), SUB_MAX_LINES);

  let lines = [], operatorFallback = false;
  if (op && op !== 'other') {
    lines = toLines(await fetchTextCached(env, 'by-operator/' + op + '.txt', FILE_TTL_SEC));
    if (lines.length < SUB_MIN_OP_LINES) { lines = []; operatorFallback = true; } // golden rule
  }
  if (!lines.length) {
    if (tier === 'all') {
      const g = toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC));
      const sv = toLines(await fetchTextCached(env, 'silver.txt', FILE_TTL_SEC));
      lines = [...new Set([...g, ...sv])];
    } else {
      lines = toLines(await fetchTextCached(env, API_TIERS[tier], FILE_TTL_SEC));
    }
  }
  if (scheme) lines = lines.filter((l) => l.toLowerCase().startsWith(scheme + '://'));
  lines = lines.slice(0, limit);

  if (format === 'txt') {
    return new Response(lines.join('\n') + '\n', {
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  }
  return jsonRes({
    tier, protocol: protoIn || null, operator: op || null, operator_fallback: operatorFallback,
    count: lines.length, limit,
    items: lines.map((uri) => ({ uri, protocol: uri.split('://')[0] || null })),
  });
}

const API_DOCS_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ARISTON · API v1</title><style>
body{margin:0;background:#14110C;color:#F3ECDD;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.7}
main{max-width:860px;margin:0 auto;padding:48px 22px 80px}
h1{font-family:Cinzel,Georgia,serif;font-weight:700;letter-spacing:.34em;font-size:24px;color:#E8C872;margin:0 0 4px}
h2{font-family:Cinzel,Georgia,serif;color:#E8C872;letter-spacing:.12em;font-size:15px;margin:44px 0 12px;border-bottom:1px solid rgba(232,200,114,.18);padding-bottom:8px}
.sub{color:#8d8262;font-size:12px;letter-spacing:.18em;margin-bottom:36px}
code,p{word-break:break-word}
pre{background:rgba(232,200,114,.06);border:1px solid rgba(232,200,114,.16);border-radius:12px;padding:14px 16px;overflow-x:auto;font-size:12.5px;color:#F3ECDD}
b.k{color:#E8C872}
table{border-collapse:collapse;width:100%;font-size:12.5px}
td,th{border:1px solid rgba(232,200,114,.16);padding:8px 12px;text-align:left;vertical-align:top}
th{color:#E8C872;font-weight:600;letter-spacing:.08em}
a{color:#C9A24A;text-decoration:none}a:hover{text-decoration:underline}
.note{color:#8d8262;font-size:12px}
</style></head><body><main>
<h1>ARISTON</h1><div class="sub">PUBLIC API · V1 · READ-ONLY</div>
<p>Live access to the Ariston pipeline: every 30 minutes thousands of public proxy
configs are collected, normalized, validated by the xray-core &amp; sing-box engines,
then scored. <b class="k">Only engine-tested configs are served — never dead ones.</b></p>

<h2>GET /api/v1/stats</h2>
<p>Latest run summary — sources, validation latency, scoring tiers.</p>
<pre>curl https://ariston-bot.ariston-vbot.workers.dev/api/v1/stats</pre>

    <h2>GET /api/v1/configs</h2>
<table>
<tr><th>param</th><th>values</th><th>default</th></tr>
<tr><td><b class="k">tier</b></td><td>gold · silver · all · validated</td><td>gold</td></tr>
<tr><td><b class="k">protocol</b></td><td>vless · trojan · vmess · hysteria2/hy2 · tuic</td><td>—</td></tr>
<tr><td><b class="k">operator</b></td><td>irancell · mci · rightel · shatel · asiatech · tci</td><td>—</td></tr>
<tr><td><b class="k">format</b></td><td>json · txt (txt = one URI per line → usable as a subscription URL)</td><td>json</td></tr>
<tr><td><b class="k">limit</b></td><td>1–300</td><td>100</td></tr>
</table>
<pre>curl '.../api/v1/configs?tier=gold&amp;protocol=vless&amp;limit=5'
curl '.../api/v1/configs?operator=irancell&amp;format=txt'   # paste into any client</pre>
<p class="note">If the operator pool is too thin (&lt;10 alive), the response falls back to the
tier pool and says so with <code>operator_fallback: true</code>.</p>

<h2>GET /api/v1/intel <span class="k">keyed · off by default</span></h2>
<p>Full non-PII snapshot (run stamps, bank telemetry, health 7d, pipeline knobs, cron tick)
for your own automation. Enabled from the admin panel (Generate key); key via
<code>?key=…</code> or <code>Authorization: Bearer …</code>.</p>
<pre>curl '.../api/v1/intel?key=…'</pre>
<p class="note">Webhook: after every publish the worker POSTs <code>{event:\'new_run\',…}</code> to the
panel-configured URL, signed with <code>x-ariston-sign: sha256=HMAC(secret, body)</code>.</p>

<h2>GET /card.svg</h2>
<p>Brand “card of the day” (1200×630 SVG) — embed it anywhere.</p>

<h2>Etiquette</h2>
<p class="note">CORS: <code>*</code> · Cache-friendly · Best-effort limit ${API_RATE_LIMIT} req/IP/min
(exceed → HTTP 429). Data © Ariston pipeline — attribution appreciated:
<a href="https://github.com/Edsel-Rahimi/Ariston">github.com/Edsel-Rahimi/Ariston</a></p>
</main></body></html>`;

/* ─────────── D4 — brand card as REAL PNG (Telegram rejects SVG photos) ───────
 * Pure-JS rasterizer: flat fills + the funnel-A emblem as polygons + a classic
 * 5×7 bitmap font, deflated through CompressionStream into a valid PNG.
 * Same 1200×630 layout and palette as cardSVG. */

const PNG_W = 1200, PNG_H = 630;

/* classic 5×7 font — bytes = columns, LSB = top row */
const FONT57 = {
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x00, 0x42, 0x7f, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46],
  3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39],
  6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
  9: [0x06, 0x49, 0x49, 0x29, 0x1e],
  ' ': [0, 0, 0, 0, 0], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  ',': [0x00, 0x50, 0x30, 0x00, 0x00], ':': [0x00, 0x36, 0x36, 0x00, 0x00], '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '·': [0x00, 0x00, 0x18, 0x18, 0x00], '%': [0x23, 0x13, 0x08, 0x64, 0x62],
};

/* funnel-A emblem polygons (EMBLEM_SVG coords) + the same translate/scale */
const EMBLEM_POLYS = [
  { c: [0xe8, 0xc8, 0x72], pts: [[627, 253], [608, 362], [513, 455], [537, 519], [341, 735]] },
  { c: [0xe8, 0xc8, 0x72], pts: [[627, 253], [646, 362], [741, 455], [717, 519], [913, 735]] },
  { c: [0xb8, 0x73, 0x33], pts: [[513, 455], [627, 396], [741, 455], [710, 486], [627, 444], [549, 486]] },
  { c: [0xc0, 0xc6, 0xcc], pts: [[554, 508], [627, 472], [700, 508], [678, 540], [627, 513], [576, 540]] },
  { c: [0xc9, 0xa2, 0x4a], pts: [[582, 559], [627, 541], [672, 559], [627, 644]] },
  { c: [0xe8, 0xc8, 0x72], pts: [[624, 644], [630, 644], [630, 675], [624, 675]] },
];
const EMBLEM_CIRCLE = { x: 627, y: 693, r: 19, c: [0xe8, 0xc8, 0x72] };

function makeCanvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
  const hex = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const rect = (x, y, ww, hh, c) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) set(x + i, y + j, c); };
  const circle = (cx, cy, r, c) => { for (let j = -r; j <= r; j++) { const half = Math.floor(Math.sqrt(r * r - j * j)); for (let i = -half; i <= half; i++) set(cx + i, cy + j, c); } };
  const poly = (pts, c) => { // scanline even-odd fill
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.round(xs[k]), b = Math.round(xs[k + 1]); for (let x = a; x <= b; x++) set(x, y, c); }
    }
  };
  const textW = (str, sc, ls) => str.length * (5 * sc + (ls || 0)) - (ls || 0);
  const text = (str, x, y, sc, c, ls, align) => {
    str = String(str).toUpperCase();
    if (align === 'right') x -= textW(str, sc, ls);
    if (align === 'center') x -= Math.floor(textW(str, sc, ls) / 2);
    for (let n = 0; n < str.length; n++) {
      const g = FONT57[str[n]] || FONT57[' '];
      for (let col = 0; col < 5; col++) for (let row = 0; row < 7; row++) {
        if (g[col] & (1 << row)) rect(x + n * (5 * sc + (ls || 0)) + col * sc, y + row * sc, sc, sc, c);
      }
    }
    return textW(str, sc, ls);
  };
  return { px, set, hex, rect, circle, poly, text, textW };
}

async function encodePNG(cv) {
  const w = PNG_W, h = PNG_H;
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    raw.set(cv.px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  })();
  const be32 = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    out.set(be32(data.length), 0);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcBuf = out.subarray(4, 8 + data.length);
    out.set(be32(CRC(crcBuf)), 8 + data.length);
    return out;
  };
  const ihdr = new Uint8Array(13);
  ihdr.set(be32(w), 0); ihdr.set(be32(h), 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const parts = [chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 8);
  const png = new Uint8Array(total);
  png.set(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 0);
  let off = 8; for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

async function renderCardPNG(s) {
  const cv = makeCanvas(PNG_W, PNG_H);
  const bg = cv.hex('#14110C'), gold = cv.hex('#E8C872'), deep = cv.hex('#C9A24A'),
    silver = cv.hex('#C0C6CC'), cream = cv.hex('#F3ECDD'), dim = cv.hex('#8d8262');
  cv.rect(0, 0, PNG_W, PNG_H, bg);
  cv.rect(24, 24, PNG_W - 48, PNG_H - 48, gold); cv.rect(26, 26, PNG_W - 52, PNG_H - 52, bg); // outer border
  cv.rect(34, 34, PNG_W - 68, PNG_H - 68, deep); cv.rect(35, 35, PNG_W - 70, PNG_H - 70, bg); // inner hairline
  /* emblem — same transform as cardSVG: translate(70,150) scale(.52) translate(-327,-239) */
  const ex = (x) => Math.round(70 + (x - 327) * 0.52), ey = (y) => Math.round(150 + (y - 239) * 0.52);
  for (const sh of EMBLEM_POLYS) cv.poly(sh.pts.map(([x, y]) => [ex(x), ey(y)]), sh.c);
  cv.circle(ex(EMBLEM_CIRCLE.x), ey(EMBLEM_CIRCLE.y), Math.round(EMBLEM_CIRCLE.r * 0.52), EMBLEM_CIRCLE.c);
  const goldN = s && s.scoring ? s.scoring.gold : null;
  const alive = s && s.validation ? s.validation.alive : null;
  const p50 = s && s.validation && s.validation.latency_ms ? Math.round(s.validation.latency_ms.p50 || 0) : null;
  const srcOk = s ? s.sources_ok : null, srcAll = s ? s.sources_total : null;
  const nf = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US'));
  const date = (() => { try { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()); } catch (_) { return tehranDate(); } })();
  cv.text('ARISTON', 70, 508, 8, gold, 14);
  cv.text('COLLECT · VALIDATE · SCORE · PUBLISH', 72, 576, 2, dim, 4);
  cv.text('CONFIGS OF THE DAY', 1120, 74, 3, deep, 6, 'right');
  cv.text(nf(goldN), 1120, 128, 22, gold, 10, 'right');
  cv.text('GOLD-TIER · ENGINE-TESTED', 1120, 300, 2, dim, 5, 'right');
  const row = (label, value, y, lc) => {
    const vw = cv.text(value, 1120, y, 3, cream, 4, 'right');
    cv.text(label, 1120 - vw - 26, y, 3, lc, 4, 'right');
  };
  row('ALIVE', nf(alive), 372, silver);
  row('P50 LATENCY', p50 === null ? '—' : nf(p50) + ' MS', 424, deep);
  row('SOURCES', (srcOk === null ? '—' : nf(srcOk)) + '/' + (srcAll === null ? '—' : nf(srcAll)), 476, silver);
  cv.text(date + ' · TEHRAN', 1120, 560, 2, dim, 4, 'right');
  return encodePNG(cv);
}

/* brand “card of the day” — shareable 1200×630 SVG built from live stats */
function cardSVG(s) {
  const gold = s && s.scoring ? s.scoring.gold : null;
  const alive = s && s.validation ? s.validation.alive : null;
  const p50 = s && s.validation && s.validation.latency_ms ? Math.round(s.validation.latency_ms.p50 || 0) : null;
  const srcOk = s ? s.sources_ok : null, srcAll = s ? s.sources_total : null;
  const nf = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US'));
  const date = (() => { try { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10); } })();
  /* two independent <text> nodes → identical layout in every renderer (no tspan anchoring quirks) */
  const MONO_W = 19; // ≈px per char, font-size 30 mono + spacing 1
  const row = (label, value, y, color) => {
    const labelX = 1120 - String(value).length * MONO_W - 26;
    return '<text x="' + labelX + '" y="' + y + '" text-anchor="end" font-family="Cinzel, Georgia, serif" font-size="30" letter-spacing="6" fill="' + (color || '#C0C6CC') + '">' + label + '</text>'
      + '<text x="1120" y="' + y + '" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="30" letter-spacing="1" fill="#F3ECDD">' + value + '</text>';
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="ARISTON card of the day">
<rect width="1200" height="630" fill="#14110C"/>
<rect x="24" y="24" width="1152" height="582" fill="none" stroke="rgba(232,200,114,.28)" stroke-width="1.5"/>
<rect x="34" y="34" width="1132" height="562" fill="none" stroke="rgba(232,200,114,.12)" stroke-width="1"/>
<g transform="translate(70,150) scale(0.52) translate(-327,-239)">
  <path fill="#E8C872" d="M627 253 L608 362 L513 455 L537 519 L341 735 Z"/>
  <path fill="#E8C872" d="M627 253 L646 362 L741 455 L717 519 L913 735 Z"/>
  <path fill="#B87333" d="M513 455 L627 396 L741 455 L710 486 L627 444 L549 486 Z"/>
  <path fill="#C0C6CC" d="M554 508 L627 472 L700 508 L678 540 L627 513 L576 540 Z"/>
  <path fill="#C9A24A" d="M582 559 L627 541 L672 559 L627 644 Z"/>
  <path fill="#E8C872" d="M624 644 H630 V675 H624 Z"/>
  <circle cx="627" cy="693" r="19" fill="#E8C872"/>
</g>
<text x="70" y="560" font-family="Cinzel, Georgia, serif" font-size="34" letter-spacing="22" fill="#E8C872">ARISTON</text>
<text x="72" y="590" font-family="ui-monospace, Menlo, monospace" font-size="13" letter-spacing="4" fill="#8d8262">COLLECT · VALIDATE · SCORE · PUBLISH</text>
<text x="1120" y="96" text-anchor="end" font-family="Cinzel, Georgia, serif" font-size="22" letter-spacing="10" fill="#C9A24A">CONFIGS OF THE DAY</text>
<text x="1118" y="238" text-anchor="end" font-family="Cinzel, Georgia, serif" font-size="150" fill="#E8C872">${nf(gold)}</text>
<text x="1120" y="278" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="15" letter-spacing="6" fill="#8d8262">GOLD-TIER · ENGINE-TESTED</text>
${row('ALIVE', nf(alive), 350)}
${row('P50 LATENCY', p50 === null ? '—' : nf(p50) + ' ms', 400, '#C9A24A')}
${row('SOURCES', (srcOk === null ? '—' : nf(srcOk)) + ' / ' + (srcAll === null ? '—' : nf(srcAll)), 450)}
<text x="1120" y="560" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="16" letter-spacing="4" fill="#8d8262">${esc(date)} · TEHRAN</text>
</svg>`;
}

/* ───────────────────────────── mini app page (/app) ───────────────────────── */

const MINI_APP_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>ARISTON ⚡</title>
<!-- app build: D10.1 — single-sub mode switch · QR · filters · favorites · light/dark · operator chips -->
<script src="https://telegram.org/js/telegram-web-app.js" async><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Vazirmatn:wght@400;500;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Vazirmatn:wght@400;500;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
<style>
:root{--bg:#0C0A07;--bg2:#14110C;--card:rgba(232,200,114,.055);--card2:rgba(232,200,114,.12);
--line:rgba(232,200,114,.16);--line2:rgba(232,200,114,.38);
--gold:#E8C872;--gold2:#F5DFA0;--deep:#C9A24A;--silver:#C0C6CC;--bronze:#B87333;
--ok:#7ec97e;--bad:#e06c5a;--txt:#F3ECDD;--dim:#8d8262;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;
--cin:'Cinzel',serif}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--txt);font-family:'Vazirmatn',system-ui,sans-serif;font-size:15px;line-height:1.65}
body{min-height:100vh;background:
radial-gradient(700px 340px at 50% -90px,rgba(232,200,114,.17),transparent 70%),
radial-gradient(420px 260px at 8% 22%,rgba(201,162,74,.05),transparent 70%),
radial-gradient(420px 260px at 92% 60%,rgba(201,162,74,.045),transparent 70%);overflow-x:hidden}
.wrap{max-width:540px;margin:0 auto;padding:12px 16px calc(34px + env(safe-area-inset-bottom))}
/* ───── header ───── */
header{display:flex;align-items:center;gap:10px;padding:10px 2px 16px;animation:up .55s ease both}
.emblem{width:40px;height:34px;flex:0 0 auto;filter:drop-shadow(0 0 10px rgba(232,200,114,.35))}
.brandbox{display:flex;flex-direction:column;gap:1px}
.brand{font-family:var(--cin);font-weight:900;letter-spacing:.3em;font-size:16.5px;text-indent:.3em;
background:linear-gradient(180deg,#F7E5AF,#E8C872 55%,#B98F3E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.brandsub{font-family:var(--mono);font-size:8.5px;letter-spacing:.3em;color:var(--dim);direction:ltr;text-align:left}
.hlive{margin-inline-start:auto;display:flex;align-items:center;gap:9px}
.livewrap{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9.5px;color:var(--gold);letter-spacing:.2em;
border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:rgba(232,200,114,.05)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:pulse 2.2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(232,200,114,.55)}70%{box-shadow:0 0 0 7px rgba(232,200,114,0)}100%{box-shadow:0 0 0 0 rgba(232,200,114,0)}}
.admchip{display:none;align-items:center;background:rgba(232,200,114,.1);border:1px solid var(--line2);color:var(--gold);
border-radius:999px;font-size:12px;padding:4px 10px;cursor:pointer;font-family:inherit;font-weight:700}
.admchip:active{transform:scale(.93)}
.refresh{background:rgba(232,200,114,.05);border:1px solid var(--line);color:var(--gold);width:32px;height:32px;border-radius:50%;font-size:14px;cursor:pointer;line-height:1;transition:transform .5s ease}
.refresh:active{transform:rotate(180deg)}
/* ───── hero ───── */
.hero{position:relative;border:1px solid var(--line2);border-radius:24px;padding:24px 20px 16px;overflow:hidden;text-align:center;
background:linear-gradient(168deg,rgba(232,200,114,.16),rgba(232,200,114,.035) 46%,rgba(232,200,114,.08));
box-shadow:0 18px 50px -22px rgba(232,200,114,.28);animation:up .55s .05s ease both}
.hero::before{content:'';position:absolute;inset:-40% -30% auto;height:200%;
background:conic-gradient(from 0deg,transparent 0 84%,rgba(232,200,114,.10) 91%,transparent 97%);
animation:orbit 9s linear infinite;pointer-events:none}
@keyframes orbit{to{transform:rotate(360deg)}}
.hero .kbar{position:absolute;top:0;inset-inline:0;height:2px;overflow:hidden}
.hero .kbar::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--gold),transparent);
animation:kbar 2.8s ease-in-out infinite}
@keyframes kbar{0%{transform:translateX(-100%)}55%{transform:translateX(100%)}100%{transform:translateX(100%)}}
.hbadge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);color:var(--gold);border-radius:999px;
padding:4px 14px;font-size:11.5px;font-weight:700;background:rgba(20,17,12,.55);animation:up .5s .12s ease both}
.hnum{font-family:var(--cin);font-weight:900;font-size:74px;line-height:1.02;margin-top:10px;color:var(--gold);direction:ltr;
text-shadow:0 0 34px rgba(232,200,114,.4);animation:up .5s .18s ease both}
.hlbl{font-weight:800;font-size:16px;margin-top:2px;animation:up .5s .24s ease both}
.hlbl .fire{display:inline-block;animation:flick 1.6s ease-in-out infinite}
@keyframes flick{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.14) rotate(4deg)}}
.hpill{display:flex;align-items:center;gap:0;margin:15px auto 4px;border:1px dashed var(--line2);border-radius:14px;overflow:hidden;
background:rgba(20,17,12,.5);max-width:420px;animation:up .5s .3s ease both}
.hpill>div{flex:1;padding:8px 10px;font-size:11px;color:var(--txt);min-width:0}
.hpill b{color:var(--gold);font-family:var(--mono);font-weight:700;direction:ltr;unicode-bidi:embed}
.hpill .sep{flex:0 0 1px;background:var(--line2);padding:0}
.heroerr{width:100%;margin-top:12px;background:rgba(232,200,114,.06);border:1px dashed rgba(232,200,114,.35);color:var(--dim);border-radius:12px;padding:9px 12px;font-size:12px;cursor:pointer;font-family:inherit}
.retrybtn{margin-top:10px;background:none;border:1px solid var(--line);color:var(--gold);border-radius:10px;padding:6px 16px;cursor:pointer;font-family:inherit;font-size:13px}
/* ───── stat grid ───── */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.stat{position:relative;border:1px solid var(--line);border-radius:18px;background:linear-gradient(160deg,rgba(232,200,114,.07),rgba(232,200,114,.02));
padding:13px 14px 11px;overflow:hidden;animation:up .5s ease both;transition:transform .15s ease,border-color .25s ease}
.stat:nth-child(1){animation-delay:.36s}.stat:nth-child(2){animation-delay:.42s}
.stat:nth-child(3){animation-delay:.48s}.stat:nth-child(4){animation-delay:.54s}
.stat:active{transform:scale(.97);border-color:var(--line2)}
.stat .ic{position:absolute;top:11px;inset-inline-end:11px;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;
font-size:15px;background:rgba(232,200,114,.09);border:1px solid var(--line)}
.stat .badge{position:absolute;top:12px;inset-inline-start:12px;font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;color:var(--bg);
background:var(--gold);border-radius:6px;padding:2.5px 7px;font-weight:700}
.stat .badge.alt{background:var(--silver)}.stat .badge.warm{background:var(--bronze);color:#14110C}
.stat .v{margin-top:34px;font-family:var(--mono);font-weight:700;font-size:22px;direction:ltr;text-align:start;color:var(--txt)}
.stat .v small{font-size:11px;color:var(--dim);font-weight:400}
.stat .k{font-size:11.5px;color:var(--dim);margin-top:1px;font-weight:500}
/* ───── bank strip ───── */
.bank{display:none;align-items:center;gap:10px;margin-top:10px;border:1px solid var(--line);border-radius:16px;
background:linear-gradient(120deg,rgba(232,200,114,.09),rgba(201,162,74,.03));padding:11px 14px;animation:up .5s .6s ease both}
.bank .bic{width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;font-size:16px;border-radius:11px;background:rgba(232,200,114,.1);border:1px solid var(--line)}
.bank .bt{flex:1;min-width:0}
.bank .bt .b1{font-size:12.5px;font-weight:700}
.bank .bt .b2{font-size:10.5px;color:var(--dim);font-family:var(--mono);direction:ltr;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bank .bdots{display:flex;gap:5px;flex:0 0 auto}
.bdot{width:9px;height:9px;border-radius:50%}
.bdot.h{background:var(--ok);box-shadow:0 0 7px rgba(126,201,126,.7);animation:pulse2 2.6s infinite}
.bdot.s{background:var(--bronze)}
.bdot.q{background:var(--bad)}
/* D9/U2 — 7-day health sparkline */
.hstrip{margin:10px 2px 0;padding:10px 12px;border:1px solid rgba(232,200,114,.14);border-radius:14px;background:rgba(0,0,0,.22);animation:up .5s ease both}
.hstrip .ht{font-size:11.5px;color:var(--dim);margin-bottom:8px}
.hbars{display:flex;gap:6px;align-items:flex-end;height:56px}
.hbar{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}
.hbar i{display:block;width:100%;max-width:26px;background:linear-gradient(180deg,#F5DFA0,#C9A24A);border-radius:4px 4px 2px 2px;min-height:5px}
.hbar i.na{background:rgba(232,200,114,.15)}
.hbar span{font-size:8.5px;color:var(--dim);font-family:var(--mono)}
@keyframes pulse2{0%,100%{opacity:1}50%{opacity:.45}}
/* ───── sections ───── */
.sec{display:flex;align-items:center;gap:10px;margin:26px 2px 4px;animation:up .5s .14s ease both}
.sec h2{font-size:14px;font-weight:800;margin:0;color:var(--gold);white-space:nowrap}
.sec .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.sec .stitle{font-size:10.5px;color:var(--dim);font-weight:400;white-space:nowrap}
.hint{font-size:11px;color:var(--dim);margin:5px 2px 10px}
/* ───── sort chips ───── */
.chips{display:flex;gap:7px;margin:10px 0 12px;animation:up .5s .1s ease both}
.schip{flex:1;border:1px solid var(--line);background:rgba(232,200,114,.04);color:var(--dim);border-radius:999px;
padding:7px 6px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;transition:all .22s ease;white-space:nowrap}
.schip.on{background:var(--gold);color:#14110C;border-color:var(--gold);box-shadow:0 4px 18px -6px rgba(232,200,114,.55)}
.schip:active{transform:scale(.95)}
/* ───── gold cards ───── */
.gcard{border:1px solid var(--line);border-radius:16px;background:linear-gradient(150deg,rgba(232,200,114,.07),rgba(232,200,114,.025));
padding:12px 14px;margin-bottom:9px;cursor:pointer;position:relative;transition:transform .13s ease,border-color .2s ease}
.gcard:active{transform:scale(.975);border-color:var(--line2)}
.gtop{display:flex;align-items:center;gap:9px}
.rank{font-size:16px;width:28px;text-align:center;flex:0 0 auto}
.rank.num{font-family:var(--mono);font-size:12px;color:var(--dim);font-weight:700}
.chip{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;border:1px solid;border-radius:7px;padding:2.5px 8px;flex:0 0 auto;font-weight:700}
.chip.vless{color:var(--gold);border-color:rgba(232,200,114,.45);background:rgba(232,200,114,.06)}
.chip.trojan{color:var(--silver);border-color:rgba(192,198,204,.45)}
.chip.hysteria2,.chip.hy2,.chip.tuic{color:var(--bronze);border-color:rgba(184,115,51,.5)}
.chip.vmess,.chip.ss,.chip.other{color:var(--txt);border-color:rgba(243,236,221,.35)}
.host{font-family:var(--mono);font-size:11.5px;color:var(--txt);opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;flex:1;text-align:left}
.livedot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:0 0 auto;box-shadow:0 0 8px rgba(126,201,126,.75);animation:pulse2 2.4s infinite}
.metrics{display:flex;gap:6px;align-items:center;flex:0 0 auto;margin-inline-start:auto}
.ema{font-family:var(--mono);font-size:11.5px;font-weight:700}
.ema.g{color:var(--gold)}.ema.s{color:var(--silver)}.ema.b{color:var(--bronze)}
.lat{font-family:var(--mono);font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:7px;padding:1.5px 7px}
.gfoot{display:flex;align-items:center;gap:12px;margin-top:9px;padding-top:9px;border-top:1px dashed rgba(232,200,114,.13)}
.fb{background:none;border:none;color:var(--dim);font-size:12.5px;cursor:pointer;padding:0 2px;font-family:inherit;display:inline-flex;align-items:center;gap:4px;transition:color .2s}
.fb.on{color:var(--gold)}
.fb:disabled{opacity:.45;cursor:default}
.fb.pop{animation:pop .35s ease}
@keyframes pop{0%{transform:scale(1)}45%{transform:scale(1.35)}100%{transform:scale(1)}}
.gfoot .ok{font-family:var(--mono);font-size:10px;color:var(--dim);margin-inline-start:auto;direction:ltr}
/* ───── history + sub cards ───── */
.scard{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:14px;background:rgba(232,200,114,.04);
padding:10px 12px;margin-top:8px;cursor:pointer;transition:transform .13s ease,border-color .2s ease;animation:up .4s ease both}
.scard:active{transform:scale(.98);border-color:var(--line2)}
.scard .host{font-family:var(--mono);font-size:11px;opacity:.85}
.scard .ping{font-family:var(--mono);font-size:10px;color:var(--dim);border:1px solid var(--line);border-radius:7px;padding:1.5px 7px;flex:0 0 auto}
.mk{background:none;border:1px solid var(--line);border-radius:9px;font-size:12px;width:31px;height:27px;cursor:pointer;line-height:1;flex:0 0 auto;padding:0;transition:all .2s}
.mk.ok.on{border-color:rgba(232,200,114,.6);background:rgba(232,200,114,.16)}
.mk.bad.on{border-color:rgba(224,108,90,.55);background:rgba(224,108,90,.16)}
.rot{font-family:var(--mono);font-size:10px;color:var(--gold);border:1px dashed var(--line2);border-radius:8px;padding:2px 8px;flex:0 0 auto;font-weight:700}
.hclear{display:none;background:none;border:1px solid var(--line);border-radius:9px;color:var(--dim);font-size:11px;padding:3px 9px;cursor:pointer;font-family:inherit}
.hclear:active{transform:scale(.94)}
/* ───── subscription CTA ───── */
.sub{border:1px solid var(--line2);border-radius:20px;padding:18px 16px;overflow:hidden;position:relative;
background:linear-gradient(165deg,rgba(232,200,114,.2),rgba(232,200,114,.05) 55%,rgba(232,200,114,.1));
animation:up .5s .2s ease both;box-shadow:0 16px 44px -22px rgba(232,200,114,.35)}
.sub .t{font-weight:800;font-size:15px;color:var(--gold2)}
.sub .url{font-family:var(--mono);font-size:10.5px;color:var(--dim);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:10px 0 12px;border:1px dashed var(--line2);border-radius:11px;padding:10px 12px;background:rgba(12,10,7,.5)}
.sub .meta{font-size:11.5px;color:var(--dim);margin-top:9px}
.btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--gold);color:#14110C;background:linear-gradient(180deg,#F5DFA0,#E8C872);
border-radius:999px;padding:9px 20px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:800;
box-shadow:0 8px 22px -8px rgba(232,200,114,.6);transition:transform .15s ease}
.btn:active{transform:scale(.96)}
.more{width:100%;border:1px dashed var(--line2);background:none;color:var(--gold);border-radius:13px;padding:11px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:700}
footer{margin-top:30px;display:flex;justify-content:center;gap:16px;font-family:var(--mono);font-size:9.5px;color:var(--dim);letter-spacing:.12em;animation:up .5s ease both}
footer a{color:var(--dim);text-decoration:none}
footer a:hover{color:var(--gold)}
/* ───── fx ───── */
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(18px);opacity:0;transition:.25s ease;
background:rgba(30,26,19,.95);border:1px solid var(--line2);color:var(--txt);border-radius:999px;padding:9px 18px;font-size:12.5px;pointer-events:none;z-index:9}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.sk{height:58px;border-radius:16px;border:1px solid var(--line);margin-bottom:9px;background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%;animation:sh 1.3s infinite}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.err{border:1px dashed rgba(224,108,90,.5);color:#d8a18c;border-radius:14px;padding:14px;font-size:12.5px;text-align:center}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}}
/* ───── D8/U4 — light theme (same golden palette on cream) ───── */
body.light{--bg:#F4EEDF;--bg2:#FBF7EC;--card:rgba(184,115,51,.07);--card2:rgba(184,115,51,.14);
--line:rgba(146,102,42,.22);--line2:rgba(146,102,42,.45);
--gold:#B8860B;--gold2:#8a6a14;--deep:#9A6B1F;--txt:#2A2113;--dim:#7d6f52}
body.light{background:
radial-gradient(700px 340px at 50% -90px,rgba(184,134,11,.14),transparent 70%),
radial-gradient(420px 260px at 8% 22%,rgba(154,107,31,.06),transparent 70%),
radial-gradient(420px 260px at 92% 60%,rgba(154,107,31,.05),transparent 70%)}
body.light .stat,body.light .gcard,body.light .scard{background:linear-gradient(160deg,rgba(184,115,51,.08),rgba(184,115,51,.03))}
body.light .toast{background:rgba(251,247,236,.97);color:#2A2113;border-color:var(--line2)}
body.light .sub .url,body.light .hpill{background:rgba(255,253,246,.7)}
body.light .hbadge,body.light .livewrap{background:rgba(251,247,236,.75)}
body.light .brand{background:linear-gradient(180deg,#8a6a14,#B8860B 55%,#6e520a);-webkit-background-clip:text;background-clip:text}
body.light .hnum{color:#B8860B;text-shadow:0 0 24px rgba(184,134,11,.25)}
body.light .chip.vless{background:rgba(184,134,11,.07)}
body.light .sk{background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%}
/* ───── D8/S — sub mode switch + advanced links ───── */
.msw{display:flex;gap:0;margin:12px 0 4px;border:1px solid var(--line2);border-radius:13px;overflow:hidden;background:rgba(12,10,7,.45)}
body.light .msw{background:rgba(255,253,246,.7)}
.msw button{flex:1;border:none;background:none;color:var(--dim);font-family:inherit;font-size:11.5px;font-weight:700;padding:9px 4px;cursor:pointer;transition:all .2s}
.msw button+button{border-inline-start:1px solid var(--line)}
.msw button.on{background:var(--gold);color:#14110C}
.msw button:active{transform:scale(.95)}
.mswnote{font-size:10.5px;color:var(--dim);margin-top:7px}
.adv{margin-top:12px;border:1px dashed var(--line);border-radius:13px;overflow:hidden}
.adv>summary{cursor:pointer;list-style:none;padding:9px 13px;font-size:11.5px;color:var(--dim);font-weight:700;user-select:none}
.adv>summary::-webkit-details-marker{display:none}
.adv>summary::after{content:' ⌄';float:left}
.adv[open]>summary::after{content:' ⌃'}
.adv .arow{display:flex;align-items:center;gap:8px;padding:8px 13px;border-top:1px solid var(--line)}
.adv .arow .url{flex:1;min-width:0;font-family:var(--mono);font-size:9.5px;color:var(--dim);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adv .arow .tag{font-size:10px;color:var(--gold);flex:0 0 auto;font-weight:700}
.mini2{background:none;border:1px solid var(--line);color:var(--gold);border-radius:8px;font-size:10.5px;padding:4px 10px;cursor:pointer;font-family:inherit;font-weight:700;flex:0 0 auto}
.mini2:active{transform:scale(.94)}
/* ───── D8/U1 — QR modal ───── */
.qmodal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99;background:rgba(8,6,3,.78);backdrop-filter:blur(3px)}
.qmodal.show{display:flex}
.qbox{background:var(--bg2);border:1px solid var(--line2);border-radius:22px;padding:20px 18px 16px;text-align:center;max-width:86vw;animation:up .3s ease both}
.qbox .qt{font-weight:800;font-size:14px;color:var(--gold);margin-bottom:4px}
.qbox .qh{font-size:10.5px;color:var(--dim);margin-top:9px;max-width:250px}
.qbox canvas{border-radius:14px;width:232px;height:232px;display:block;margin:10px auto 0;background:#FFFDF6;padding:10px;box-sizing:content-box}
.qbox .qclose{margin-top:13px;background:none;border:1px solid var(--line2);color:var(--txt);border-radius:999px;padding:7px 22px;font-family:inherit;font-size:12px;cursor:pointer}
/* ───── D8/U2 — gold filters ───── */
.frow{display:flex;gap:6px;margin:9px 0 0;flex-wrap:wrap;align-items:center}
.fchip{border:1px solid var(--line);background:rgba(232,200,114,.04);color:var(--dim);border-radius:999px;padding:5px 11px;font-size:10.5px;cursor:pointer;font-family:var(--mono);font-weight:600;transition:all .18s}
.fchip.on{background:var(--gold);color:#14110C;border-color:var(--gold)}
.fchip:active{transform:scale(.94)}
.fsearch{flex:1;min-width:120px;background:rgba(12,10,7,.4);border:1px solid var(--line);color:var(--txt);border-radius:999px;padding:6px 12px;font-family:var(--mono);font-size:11px;direction:ltr}
body.light .fsearch{background:rgba(255,253,246,.8)}
.fsearch::placeholder{color:var(--dim)}
.fmeta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 2px 0}
.fcount{font-family:var(--mono);font-size:10px;color:var(--dim);direction:ltr}
.copyall{background:none;border:1px solid var(--line2);color:var(--gold);border-radius:9px;font-size:10.5px;padding:4px 11px;cursor:pointer;font-family:inherit;font-weight:700}
.copyall:active{transform:scale(.94)}
/* ───── D8/U3 — favorites star ───── */
.star{background:none;border:none;color:var(--dim);font-size:14px;cursor:pointer;padding:0 1px;line-height:1;transition:color .2s,transform .15s}
.star.on{color:var(--gold);text-shadow:0 0 9px rgba(232,200,114,.55)}
.star.pop{animation:pop .35s ease}
.favclear{display:none;background:none;border:1px solid var(--line);border-radius:9px;color:var(--dim);font-size:11px;padding:3px 9px;cursor:pointer;font-family:inherit}
.opchip{font-family:var(--mono);font-size:9px;border:1px solid rgba(126,201,126,.4);color:var(--ok);border-radius:6px;padding:1.5px 6px;flex:0 0 auto;font-weight:700;white-space:nowrap}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <svg class="emblem" viewBox="327 239 600 510" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#E8C872" d="M627 253 L608 362 L513 455 L537 519 L341 735 Z"/>
      <path fill="#E8C872" d="M627 253 L646 362 L741 455 L717 519 L913 735 Z"/>
      <path fill="#B87333" d="M513 455 L627 396 L741 455 L710 486 L627 444 L549 486 Z"/>
      <path fill="#C0C6CC" d="M554 508 L627 472 L700 508 L678 540 L627 513 L576 540 Z"/>
      <path fill="#C9A24A" d="M582 559 L627 541 L672 559 L627 644 Z"/>
      <path fill="#E8C872" d="M624 644 H630 V675 H624 Z"/>
      <circle cx="627" cy="693" r="19" fill="#E8C872"/>
    </svg>
    <div class="brandbox">
      <div class="brand">ARISTON</div>
      <div class="brandsub">TELEGRAM PROTOCOL · v4.2</div>
    </div>
    <div class="hlive">
      <button class="admchip" id="admChip" style="display:none" aria-label="admin">🛠 پنل</button>
      <div class="livewrap"><span class="dot"></span><span>LIVE</span></div>
      <button class="refresh" id="themeBtn" aria-label="theme" style="font-size:13px">🌙</button>
      <button class="refresh" id="refresh" aria-label="refresh">⟳</button>
    </div>
  </header>

  <section class="hero">
    <div class="kbar"></div>
    <div class="hbadge">✨ <span id="heroBadge">…</span></div>
    <div class="hnum" id="heroNum">—</div>
    <div class="hlbl"><span id="heroLbl">…</span> <span class="fire">🔥</span></div>
    <div class="hpill">
      <div><span id="heroSubA">…</span></div>
      <div class="sep"></div>
      <div><b id="heroSubB">…</b></div>
    </div>
    <button class="heroerr" id="heroErr" style="display:none">⚠ <span id="heroErrTx"></span></button>
  </section>

  <div class="grid">
    <div class="stat"><span class="badge" id="stAliveB">ONLINE</span><div class="ic">✔️</div><div class="v" id="stAlive">—</div><div class="k" id="stAliveK">…</div></div>
    <div class="stat"><span class="badge alt" id="stP50B">FAST</span><div class="ic">⚡</div><div class="v" id="stP50">—</div><div class="k" id="stP50K">…</div></div>
    <div class="stat"><span class="badge warm" id="stSrcB">—</span><div class="ic">📡</div><div class="v" id="stSrc">—</div><div class="k" id="stSrcK">…</div></div>
    <div class="stat"><span class="badge" id="stRunB">—</span><div class="ic">⏱️</div><div class="v" id="stRun">—</div><div class="k" id="stRunK">…</div></div>
  </div>

  <div class="bank" id="bankStrip">
    <div class="bic">🏦</div>
    <div class="bt">
      <div class="b1" id="bankT1">…</div>
      <div class="b2" id="bankT2">—</div>
    </div>
    <div class="bdots"><span class="bdot h"></span><span class="bdot s"></span><span class="bdot q"></span></div>
  </div>

  <div class="hstrip" id="healthStrip" style="display:none">
    <div class="ht" id="healthTitle">…</div>
    <div class="hbars" id="healthBars"></div>
  </div>

  <div class="sec" id="histSec" style="display:none"><h2 id="histTitle">…</h2><div class="rule"></div><button class="hclear" id="histClear">🗑</button></div>
  <div class="hint" id="histHint" style="display:none"></div>
  <div id="histList"></div>

  <div class="sec" id="favSec" style="display:none"><h2 id="favTitle">…</h2><div class="rule"></div><button class="favclear" id="favClear">🗑</button></div>
  <div class="hint" id="favHint" style="display:none"></div>
  <div id="favList"></div>

  <div class="sec"><h2 id="goldTitle">…</h2><div class="rule"></div></div>
  <div class="hint" id="goldHint">…</div>
  <div class="chips" id="sortChips">
    <button class="schip on" data-sort="ping" id="chipPing">…</button>
    <button class="schip" data-sort="ok" id="chipOk">…</button>
    <button class="schip" data-sort="vote" id="chipVote">…</button>
  </div>
  <div class="frow" id="protoRow">
    <button class="fchip on" data-f="">ALL</button>
    <button class="fchip" data-f="vless">vless</button>
    <button class="fchip" data-f="trojan">trojan</button>
    <button class="fchip" data-f="vmess">vmess</button>
    <button class="fchip" data-f="hysteria2">hy2</button>
    <button class="fchip" data-f="tuic">tuic</button>
    <input class="fsearch" id="goldQ" placeholder="search host…">
  </div>
  <div class="frow" id="pingRow">
    <button class="fchip on" data-p="0">∞</button>
    <button class="fchip" data-p="500">&lt;500ms</button>
    <button class="fchip" data-p="1000">&lt;1000ms</button>
    <button class="fchip" data-p="2000">&lt;2000ms</button>
    <button class="fchip" data-fav="1" id="favOnlyChip">⭐</button>
  </div>
  <div class="fmeta"><span class="fcount" id="fCount"></span><button class="copyall" id="copyAllBtn" style="display:none">⧉</button></div>
  <div id="goldList">
    <div class="sk"></div><div class="sk"></div><div class="sk"></div>
  </div>
  <button class="more" id="moreBtn" style="display:none">…</button>

  <div class="sec"><h2 id="subTitle">…</h2><div class="rule"></div></div>
  <div class="sub" id="subCard">…</div>

  <footer>
    <a href="https://edsel-rahimi.github.io/Ariston/" target="_blank" id="ftSite">PAGES</a>
    <a href="https://github.com/Edsel-Rahimi/Ariston" target="_blank">GITHUB</a>
    <span>D10.1 · V4.3</span>
  </footer>
</div>
<div class="toast" id="toast"></div>
<div class="qmodal" id="qmodal"><div class="qbox"><div class="qt" id="qTitle">QR</div><canvas id="qCanvas" width="264" height="264"></canvas><div class="qh" id="qHint"></div><button class="qclose" id="qClose">✕</button></div></div>

<script>
var I18N = {
  fa: {hero_badge:'انتخاب هوشمند لحظه‌ای', hero_lbl:'کانفیگ طلایی',
    hero_a:'برگزیده از بین {alive} کانفیگ سالم', hero_b:'دور {run}',
    st_online:'ONLINE', st_fast:'FAST', st_alive:'کانفیگ سالم تایید شده', st_p50:'میانگین پینگ شبکه',
    st_src:'منابع فعال و اسکن‌شده', st_run:'آخرین پایش و تست',
    bank_t1:'بانک کانفیگ: {n} خوش‌سابقه', bank_t2:'HIT {hit}% · PASS2 +{p2} · سابقه {streak}x',
    health_t:'📈 سلامت ۷ روز اخیر — نرخ بازگشت بانک',
    sort_fast:'⚡ سریع‌ترین پینگ', sort_ok:'✅ بهترین نرخ', sort_vote:'👍 محبوب‌ترین',
    rel_min:'{n} دقیقه پیش', rel_hour:'{n} ساعت پیش', rel_day:'{n} روز پیش',
    gold_t:'کانفیگ‌های طلایی', gold_st:'برترین‌ها بر اساس پینگ و تست‌ها', gold_hint:'روی کارت بزن تا کپی بشه · 👍 یعنی برات کار کرد',
    more:'نمایش بیشتر', copied:'کپی شد ✅', voted:'ممنون! ثبت شد 🙏',
    hist_t:'تاریخچه من', hist_hint:'آخرین کانفیگ‌هایی که کپی کردی — تا ۲۰ مورد، همیشه همین‌جان', hist_empty:'هنوز چیزی کپی نکردی — از «کانفیگ‌های طلایی» شروع کن', hist_cleared:'تاریخچه پاک شد',
    sub_t:'اشتراک شخصی و اختصاصی', sub_note:'هر بار اپت رو آپدیت کنی، کانفیگ‌های مخصوص خودت می‌رسه (تعویض روزانه یا هر دور تست)', sub_copy:'کپی لینک',
    sub_meta:'اپراتور: {o} · اپ: {c}', sub_need:'اول توی ربات /start رو بزن', open_tg:'جهت دریافت اشتراک شخصی، این صفحه رو داخل تلگرام باز کن',
    mk_ok:'وصل شد', mk_fail:'وصل نشد', my10:'کانفیگ‌های مخصوص من', rot_day:'تعویض: روزانه', rot_run:'تعویض: هر دور تست',
    marked:'ثبت شد', fail:'نتونستم اطلاعات رو بگیرم — دوباره امتحان کن', isp_other:'همه', cl_other:'سایر',
    qr_t:'اشتراک من · QR', qr_hint:'توی اپ دوم (یا دسکتاپ) از حالت «اسکن QR» استفاده کن — لینک بدون کپی‌پیست وارد می‌شه',
    fav_t:'پسندیده‌های من', fav_hint:'کانفیگ‌هایی که ستاره‌زدی — تا ۵۰ مورد، همیشه همین‌جان', fav_empty:'هنوز چیزی ستاره نزدی — روی ⭐ کارت‌ها بزن',
    fav_saved:'⭐ ستاره خورد', fav_gone:'از پسندیده‌ها حذف شد', fav_only:'⭐ فقط ستاره‌دارها',
    search_ph:'جستجوی هاست…', copy_all:'کپی همه ({n})', copied_n:'{n} کانفیگ کپی شد ✅',
    msw_mine:'فقط مخصوص من', msw_gold:'فقط برترین‌ها', msw_mix:'ترکیبی',
    msw_note:'این لینک هیچ‌وقت عوض نمی‌شه؛ فقط محتواش با همین سوییچ عوض می‌شه. بعد از تغییر، «به‌روزرسانی اشتراک» اپت رو بزن.',
    msw_saved:'حالت ذخیره شد ✅', adv_t:'لینک‌های پیشرفته (برای حرفه‌ای‌ها)',
    tag_mine:'شخصی', tag_gold:'برترین‌ها', tag_mix:'ترکیبی', qr_btn:'QR', copy_btn:'کپی'},
  en: {hero_badge:'Smart live selection', hero_lbl:'gold configs',
    hero_a:'refined from {alive} alive configs', hero_b:'run {run}',
    st_online:'ONLINE', st_fast:'FAST', st_alive:'Alive configs verified', st_p50:'Network avg ping',
    st_src:'Active scanned sources', st_run:'Last scan & test',
    bank_t1:'Config bank: {n} known-good', bank_t2:'HIT {hit}% · PASS2 +{p2} · streak {streak}x',
    health_t:'📈 Last 7 days — bank hit rate',
    sort_fast:'⚡ Fastest ping', sort_ok:'✅ Best rate', sort_vote:'👍 Most voted',
    rel_min:'{n} min ago', rel_hour:'{n} h ago', rel_day:'{n} d ago',
    gold_t:'Gold configs', gold_st:'ranked by ping & test results', gold_hint:'tap a card to copy · 👍 = it worked for you',
    more:'Show more', copied:'Copied ✅', voted:'Recorded 🙏',
    hist_t:'My history', hist_hint:'the configs you copied — last 20, always here', hist_empty:'nothing copied yet — start from the gold list', hist_cleared:'history cleared',
    sub_t:'My personal subscription', sub_note:'every client refresh delivers your personal picks (daily or per-run rotation)', sub_copy:'Copy link',
    sub_meta:'ISP: {o} · Client: {c}', sub_need:'press /start in the bot first', open_tg:'open this page inside Telegram for your personal sub',
    mk_ok:'connected', mk_fail:'failed', my10:'My personal picks', rot_day:'rotation: daily', rot_run:'rotation: per run',
    marked:'Recorded', fail:'failed to load — try again', isp_other:'All', cl_other:'Other',
    qr_t:'My subscription · QR', qr_hint:'use “Scan QR” in a second device / desktop client — imports the link without copy-paste',
    fav_t:'My favorites', fav_hint:'the configs you starred — up to 50, always here', fav_empty:'nothing starred yet — tap ⭐ on any card',
    fav_saved:'⭐ starred', fav_gone:'removed from favorites', fav_only:'⭐ starred only',
    search_ph:'search host…', copy_all:'Copy all ({n})', copied_n:'{n} configs copied ✅',
    msw_mine:'Only mine', msw_gold:'Only best', msw_mix:'Mixed',
    msw_note:'this link never changes — only its content does. After switching, hit “update subscription” in your client.',
    msw_saved:'Mode saved ✅', adv_t:'Advanced links (for power users)',
    tag_mine:'personal', tag_gold:'best', tag_mix:'mixed', qr_btn:'QR', copy_btn:'Copy'},
  ru: {hero_badge:'Умный выбор в реальном времени', hero_lbl:'золотых конфигов',
    hero_a:'отобрано из {alive} живых конфигов', hero_b:'прогон {run}',
    st_online:'ONLINE', st_fast:'FAST', st_alive:'Проверенных конфигов', st_p50:'Средний пинг сети',
    st_src:'Активных источников', st_run:'Последняя проверка',
    bank_t1:'Банк конфигов: {n} надёжных', bank_t2:'HIT {hit}% · PASS2 +{p2} · серия {streak}x',
    health_t:'📈 Последние 7 дней — попадания банка',
    sort_fast:'⚡ Быстрейший пинг', sort_ok:'✅ Лучший рейтинг', sort_vote:'👍 Популярные',
    rel_min:'{n} мин назад', rel_hour:'{n} ч назад', rel_day:'{n} дн назад',
    gold_t:'Золотые конфиги', gold_st:'рейтинг по пингу и тестам', gold_hint:'нажми на карточку — копировать · 👍 = работает',
    more:'Показать ещё', copied:'Скопировано ✅', voted:'Записано 🙏',
    hist_t:'Моя история', hist_hint:'конфиги, которые ты копировал — последние 20, всегда здесь', hist_empty:'пока ничего — начни с золотого списка', hist_cleared:'история очищена',
    sub_t:'Моя личная подписка', sub_note:'при каждом обновлении — твоя персональная подборка (день или прогон)', sub_copy:'Копировать ссылку',
    sub_meta:'Оператор: {o} · Клиент: {c}', sub_need:'сначала /start в боте', open_tg:'открой эту страницу в Telegram для личной подписки',
    mk_ok:'подключилось', mk_fail:'не вышло', my10:'Мои личные конфиги', rot_day:'ротация: день', rot_run:'ротация: прогон',
    marked:'Записано', fail:'ошибка загрузки — попробуй снова', isp_other:'Все', cl_other:'Другое',
    qr_t:'Моя подписка · QR', qr_hint:'используй «Сканировать QR» на втором устройстве / в десктоп-клиенте — ссылка без копипаста',
    fav_t:'Мои избранные', fav_hint:'конфиги со звездой — до 50, всегда здесь', fav_empty:'пока ничего — нажми ⭐ на карточке',
    fav_saved:'⭐ в избранном', fav_gone:'удалено из избранного', fav_only:'⭐ только избранные',
    search_ph:'поиск хоста…', copy_all:'Копировать все ({n})', copied_n:'{n} конфигов скопировано ✅',
    msw_mine:'Только мои', msw_gold:'Только лучшие', msw_mix:'Смешанный',
    msw_note:'ссылка никогда не меняется — меняется только содержимое. После смены нажми «обновить подписку».',
    msw_saved:'Режим сохранён ✅', adv_t:'Продвинутые ссылки (для профи)',
    tag_mine:'личные', tag_gold:'лучшие', tag_mix:'микс', qr_btn:'QR', copy_btn:'Копировать'},
  tr: {hero_badge:'Akıllı anlık seçki', hero_lbl:'altın yapılandırma',
    hero_a:'{alive} çalışan içinden seçildi', hero_b:'tur {run}',
    st_online:'ONLINE', st_fast:'FAST', st_alive:'Onaylanan çalışan yapılandırma', st_p50:'Ağ ortalama ping',
    st_src:'Aktif taranan kaynak', st_run:'Son tarama ve test',
    bank_t1:'Yapılandırma bankası: {n} güvenilir', bank_t2:'HIT {hit}% · PASS2 +{p2} · seri {streak}x',
    health_t:'📈 Son 7 gün — banka isabet oranı',
    sort_fast:'⚡ En hızlı ping', sort_ok:'✅ En iyi oran', sort_vote:'👍 En popüler',
    rel_min:'{n} dk önce', rel_hour:'{n} sa önce', rel_day:'{n} gün önce',
    gold_t:'Altın yapılandırmalar', gold_st:'ping ve test sonuçlarına göre', gold_hint:'kopyalamak için karta dokun · 👍 = işime yaradı',
    more:'Daha fazla', copied:'Kopyalandı ✅', voted:'Kaydedildi 🙏',
    hist_t:'Geçmişim', hist_hint:'kopyaladığın yapılandırmalar — son 20, hep burada', hist_empty:'henüz bir şey kopyalanmadı — altın listeden başla', hist_cleared:'geçmiş temizlendi',
    sub_t:'Kişisel aboneliğim', sub_note:'her yenilemede kişisel seçkinlerin gelir (günlük veya her tur)', sub_copy:'Bağlantıyı kopyala',
    sub_meta:'Sağlayıcı: {o} · İstemci: {c}', sub_need:'önce botta /start gönder', open_tg:'kişisel abonelik için bu sayfayı Telegram içinde aç',
    mk_ok:'bağlandı', mk_fail:'olmadı', my10:'Kişisel seçkilerim', rot_day:'rotasyon: günlük', rot_run:'rotasyon: her tur',
    marked:'Kaydedildi', fail:'yükleme hatası — tekrar dene', isp_other:'Tümü', cl_other:'Diğer',
    qr_t:'Aboneliğim · QR', qr_hint:'ikinci cihazda / masaüstü istemcide “QR Tara” kullan — kopyala-yapıştır olmadan içe girer',
    fav_t:'Favorilerim', fav_hint:'yıldızladığın yapılandırmalar — 50’e kadar, hep burada', fav_empty:'henüz yok — bir kartta ⭐’ya dokun',
    fav_saved:'⭐ favorilere eklendi', fav_gone:'favorilerden çıkarıldı', fav_only:'⭐ sadece favoriler',
    search_ph:'host ara…', copy_all:'Tümünü kopyala ({n})', copied_n:'{n} yapılandırma kopyalandı ✅',
    msw_mine:'Sadece benim', msw_gold:'Sadece en iyiler', msw_mix:'Karışık',
    msw_note:'bu bağlantı hiç değişmez — sadece içeriği değişir. Sonra istemcide “aboneliği güncelle”ye bas.',
    msw_saved:'Mod kaydedildi ✅', adv_t:'Gelişmiş bağlantılar (profesyoneller için)',
    tag_mine:'kişisel', tag_gold:'en iyiler', tag_mix:'karışık', qr_btn:'QR', copy_btn:'Kopyala'},
  zh: {hero_badge:'实时智能精选', hero_lbl:'金牌配置',
    hero_a:'从 {alive} 个可用配置中精选', hero_b:'第 {run} 轮',
    st_online:'ONLINE', st_fast:'FAST', st_alive:'已验证可用配置', st_p50:'网络平均延迟',
    st_src:'活跃扫描源', st_run:'最近扫描测试',
    bank_t1:'配置银行：{n} 个优等', bank_t2:'HIT {hit}% · PASS2 +{p2} · 连击 {streak}x',
    health_t:'📈 近7天 — 银行命中率',
    sort_fast:'⚡ 最快延迟', sort_ok:'✅ 最佳成功率', sort_vote:'👍 最多好评',
    rel_min:'{n} 分钟前', rel_hour:'{n} 小时前', rel_day:'{n} 天前',
    gold_t:'金牌配置', gold_st:'按延迟与测试结果排名', gold_hint:'点卡片即复制 · 👍 = 对我有用',
    more:'显示更多', copied:'已复制 ✅', voted:'已记录 🙏',
    hist_t:'我的历史', hist_hint:'你复制过的配置 — 最近 20 条，一直都在', hist_empty:'还没有复制过 — 从金牌列表开始', hist_cleared:'历史已清除',
    sub_t:'我的个人订阅', sub_note:'客户端每次刷新拿到你的专属配置（按天或每轮轮换）', sub_copy:'复制链接',
    sub_meta:'运营商：{o} · 客户端：{c}', sub_need:'请先在机器人里 /start', open_tg:'在 Telegram 内打开此页面以获取个人订阅',
    mk_ok:'连上了', mk_fail:'连不上', my10:'我的专属配置', rot_day:'轮换：每天', rot_run:'轮换：每轮',
    marked:'已记录', fail:'加载失败 — 请重试', isp_other:'全部', cl_other:'其他',
    qr_t:'我的订阅 · QR', qr_hint:'在第二台设备或桌面客户端用“扫描二维码” — 无需复制粘贴',
    fav_t:'我的收藏', fav_hint:'你加星标的配置 — 最多 50 条，一直都在', fav_empty:'还没有收藏 — 点卡片上的 ⭐',
    fav_saved:'⭐ 已收藏', fav_gone:'已取消收藏', fav_only:'⭐ 只看收藏',
    search_ph:'搜索主机…', copy_all:'复制全部 ({n})', copied_n:'已复制 {n} 个配置 ✅',
    msw_mine:'只看我的', msw_gold:'只看最佳', msw_mix:'混合',
    msw_note:'链接永不改变 — 只变内容。切换后在客户端点“更新订阅”。',
    msw_saved:'模式已保存 ✅', adv_t:'高级链接（进阶用户）',
    tag_mine:'个人', tag_gold:'最佳', tag_mix:'混合', qr_btn:'QR', copy_btn:'复制'}
};
var MEDALS = ['🥇', '🥈', '🥉'];
var ISPN = {irancell:'Irancell', mci:'MCI', rightel:'Rightel', shatel:'Shatel', asiatech:'Asiatech', tci:'TCI'};
var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
var initData = tg ? (tg.initData || '') : '';
var tgu = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;
var lang = 'fa';
var lcx = ((tgu && tgu.language_code) || 'fa').toLowerCase();
if (lcx.indexOf('en') === 0) lang = 'en'; else if (lcx.indexOf('ru') === 0) lang = 'ru';
else if (lcx.indexOf('tr') === 0) lang = 'tr'; else if (lcx.indexOf('zh') === 0) lang = 'zh';
document.documentElement.lang = lang;
document.documentElement.dir = (lang === 'fa') ? 'rtl' : 'ltr';
var dict = I18N[lang] || I18N.fa;
function T(k, vars){ var s = dict[k] || I18N.fa[k] || k;
  if (vars){ for (var key in vars){ s = s.split('{' + key + '}').join(vars[key]); } } return s; }
function fmtN(n){ return (n || 0).toLocaleString('en-US'); }
function haptic(m){ if (tg && tg.HapticFeedback){ try { tg.HapticFeedback.impactOccurred(m || 'light'); } catch (e){} } }
var toastEl = document.getElementById('toast'), toastT = null;
function toast(m){ toastEl.textContent = m; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function(){ toastEl.classList.remove('show'); }, 1900); }
function copyText(s){
  var done = function(){ haptic('light'); toast(T('copied')); };
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s).then(done, function(){ legacy(s); done(); });
  } else { legacy(s); done(); }
}
function legacy(s){ var ta = document.createElement('textarea'); ta.value = s;
  ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
  ta.select(); try { document.execCommand('copy'); } catch (e){} document.body.removeChild(ta); }
function rel(iso){ var ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '—';
  var m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return T('rel_min', {n:m});
  var h = Math.round(m / 60);
  if (h < 24) return T('rel_hour', {n:h});
  return T('rel_day', {n: Math.round(h / 24)}); }
function countUp(el, to, dur){ dur = dur || 1100; var t0 = null;
  function step(ts){ if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / dur); k = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtN(Math.round(to * k)); if (k < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hostOf(uri){
  var hp = String(uri).split('://')[1] || '';
  return hp.split(/[\\/?#]/)[0] || String(uri).replace(/^[a-z0-9+.-]+:\\/\\//i, '').slice(0, 26) || '—';
}
function applyTexts(){
  document.getElementById('heroBadge').textContent = T('hero_badge');
  document.getElementById('heroLbl').textContent = T('hero_lbl');
  document.getElementById('heroErrTx').textContent = T('fail');
  document.getElementById('stAliveK').textContent = T('st_alive');
  document.getElementById('stP50K').textContent = T('st_p50');
  document.getElementById('stSrcK').textContent = T('st_src');
  document.getElementById('stRunK').textContent = T('st_run');
  document.getElementById('goldTitle').textContent = '🏆 ' + T('gold_t');
  document.getElementById('goldHint').textContent = T('gold_st') + ' · ' + T('gold_hint');
  document.getElementById('histTitle').textContent = '🕘 ' + T('hist_t');
  document.getElementById('subTitle').textContent = '🔗 ' + T('sub_t');
  document.getElementById('chipPing').textContent = T('sort_fast');
  document.getElementById('chipOk').textContent = T('sort_ok');
  document.getElementById('chipVote').textContent = T('sort_vote');
  document.getElementById('favTitle').textContent = '⭐ ' + T('fav_t');
  document.getElementById('goldQ').placeholder = T('search_ph');
  var mb = document.getElementById('moreBtn'); mb.textContent = T('more');
}
var lastStats = null, goldOffset = 0, statRetry = 0, goldItems = [], goldSort = 'ping';
/* D8 — UX state: filters · favorites · theme · sub mode */
var goldFProto = '', goldFPing = 0, goldQ = '', goldFavOnly = false;
var favSet = {}, favItems = [], subModeCur = 'mix', subUrlCur = '';

/* ── D8/U4 theme ── */
function applyTheme(mode){
  var light = mode === 'light';
  document.body.classList.toggle('light', light);
  var btn = document.getElementById('themeBtn'); if (btn) btn.textContent = light ? '☀️' : '🌙';
  try { if (tg) { tg.setHeaderColor(light ? '#F4EEDF' : '#0C0A07'); tg.setBackgroundColor(light ? '#F4EEDF' : '#0C0A07'); } } catch (e){}
}
function initTheme(){
  var saved = null;
  try { saved = localStorage.getItem('ariston_theme'); } catch (e){}
  applyTheme(saved === 'light' ? 'light' : 'dark');
}
function saveThemePref(mode){
  try { localStorage.setItem('ariston_theme', mode); } catch (e){}
  if (initData) fetch('/app/api/pref', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, theme: mode }) }).catch(function(){});
}

/* ── D8/U3 favorites ── */
function favRender(items){
  favItems = Array.isArray(items) ? items : [];
  favSet = {};
  for (var i = 0; i < favItems.length; i++) favSet[favItems[i].h] = true;
  var sec = document.getElementById('favSec'), hint = document.getElementById('favHint'),
      list = document.getElementById('favList'), clr = document.getElementById('favClear');
  if (!sec) return;
  if (!initData){ sec.style.display = 'none'; hint.style.display = 'none'; return; }
  sec.style.display = 'flex';
  hint.style.display = 'block';
  var has = favItems.length > 0;
  hint.textContent = has ? T('fav_hint') : T('fav_empty');
  clr.style.display = has ? 'inline-flex' : 'none';
  var html = '';
  for (var j = 0; j < favItems.length; j++){
    var it = favItems[j], uri = it.u || '';
    var proto = (uri.split('://')[0] || 'other').toLowerCase();
    var latTx = (it.l != null && isFinite(it.l)) ? Math.round(it.l) + 'ms' : '—';
    html += '<div class="scard" data-uri="' + esc(uri) + '" data-hash="' + esc(it.h || '') + '">' +
      '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
      '<div class="host">' + esc(hostOf(uri)) + '</div>' +
      '<span class="ping">' + esc(latTx) + '</span>' +
      '<button class="star on" data-hash="' + esc(it.h || '') + '" data-uri="' + esc(uri) + '" data-p="' + esc(it.p || '') + '" data-l="' + (it.l == null ? '' : it.l) + '">⭐</button>' +
      '</div>';
  }
  list.innerHTML = html;
  Array.prototype.forEach.call(list.querySelectorAll('.scard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(ev){
      if (ev.target.closest && ev.target.closest('.star')) return;
      copyText(card.getAttribute('data-uri'));
    });
  });
  Array.prototype.forEach.call(list.querySelectorAll('.star'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      favToggle(btn.getAttribute('data-hash'), btn.getAttribute('data-uri'), btn.getAttribute('data-p'), btn.getAttribute('data-l'));
    });
  });
  if (goldItems.length) renderGold(); // star badges on gold cards may change
}
function favToggle(hash, uri, proto, lat){
  if (!initData || !hash) return;
  var wasOn = !!favSet[hash];
  haptic('medium');
  var op = wasOn ? 'del' : 'add';
  fetch('/app/api/fav', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: op, hash: hash, uri: uri, proto: proto, lat: lat === '' ? null : Number(lat) }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok){ toast(T(wasOn ? 'fav_gone' : 'fav_saved')); favRender(d.items); } })
    .catch(function(){ toast(T('fail')); });
}
function loadFavs(){
  if (!initData){ favRender([]); return; }
  fetch('/app/api/fav', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: 'list' }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok) favRender(d.items); }).catch(function(){});
}

/* ── D8/U2 gold filters ── */
function goldFiltered(){
  var a = sortItems(goldItems);
  var q = goldQ.toLowerCase();
  return a.filter(function(it){
    var proto = (it.uri.split('://')[0] || '').toLowerCase();
    if (goldFProto && proto !== goldFProto) return false;
    if (goldFPing > 0 && !(it.latency_ms != null && it.latency_ms <= goldFPing)) return false;
    if (goldFavOnly && !favSet[it.hash]) return false;
    if (q && hostOf(it.uri).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

/* ── D8/U1 QR (self-contained encoder — the sub link never leaves the device) ──
   Byte-mode QR, versions 1–10, ECC M then L, spec-faithful mask penalty. */
var QR = (function(){
  var ECC_FMT = { L: 1, M: 0 };
  /* [ecc][version-1] → [codewords-per-block, blocks] (versions 1..10) */
  var ECC_TAB = {
    L: { cw: [7,10,15,20,26,18,20,24,30,18],  bl: [1,1,1,1,1,2,2,2,2,4] },
    M: { cw: [10,16,26,18,24,16,18,22,22,26], bl: [1,1,1,2,2,4,4,4,5,5] },
  };
  function rawDataModules(v){
    var r = (16*v + 128)*v + 64;
    if (v >= 2){ var n = Math.floor(v/7) + 2; r -= (25*n - 10)*n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v, e){ return Math.floor(rawDataModules(v)/8) - ECC_TAB[e].cw[v-1]*ECC_TAB[e].bl[v-1]; }
  function alignPos(v){
    if (v === 1) return [];
    var n = Math.floor(v/7) + 2, st = Math.ceil((v*4 + 4)/(n*2 - 2))*2, r = [6];
    for (var p = v*4 + 10; r.length < n; p -= st) r.splice(1, 0, p);
    return r;
  }
  function formatBits(e, mask){
    var d = (ECC_FMT[e] << 3) | mask, rem = d;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((d << 10) | rem) ^ 0x5412;
  }
  function versionBits(v){
    var rem = v;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (v << 12) | rem;
  }
  function gmul(x, y){
    var z = 0;
    for (var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function rsDivisor(deg){
    var res = []; for (var i = 0; i < deg - 1; i++) res.push(0); res.push(1);
    var root = 1;
    for (var i2 = 0; i2 < deg; i2++){
      for (var j = 0; j < res.length; j++){
        res[j] = gmul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gmul(root, 2);
    }
    return res;
  }
  function rsRemainder(data, div){
    var res = div.map(function(){ return 0; });
    for (var k = 0; k < data.length; k++){
      var factor = data[k] ^ res.shift(); res.push(0);
      for (var i = 0; i < div.length; i++) res[i] ^= gmul(div[i], factor);
    }
    return res;
  }
  function make(text){
    var bytes;
    try { bytes = Array.prototype.slice.call(new TextEncoder().encode(String(text))); }
    catch (e){ bytes = []; for (var q = 0; q < String(text).length; q++) bytes.push(String(text).charCodeAt(q) & 0xFF); }
    var ver = 0, ecc = null;
    outer:
    for (var ei = 0; ei < 2; ei++){
      var e = ei === 0 ? 'M' : 'L';
      for (var v = 1; v <= 10; v++){
        var cap = dataCodewords(v, e)*8 - 4 - (v < 10 ? 8 : 16);
        if (bytes.length*8 <= cap){ ver = v; ecc = e; break outer; }
      }
    }
    if (!ver) return null;
    var total = dataCodewords(ver, ecc), bits = [];
    function push(val, n){ for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4); push(bytes.length, ver < 10 ? 8 : 16);
    for (var b = 0; b < bytes.length; b++) push(bytes[b], 8);
    push(0, Math.min(4, total*8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    var data = [];
    for (var d = 0; d < bits.length; d += 8){ var by = 0; for (var b2 = 0; b2 < 8; b2++) by = (by << 1) | bits[d + b2]; data.push(by); }
    var flip = false;
    for (var pd = data.length; pd < total; pd++){ data.push(flip ? 0x11 : 0xEC); flip = !flip; }  // pads alternate EC,11,… starting EC
    var nb = ECC_TAB[ecc].bl[ver - 1], deg = ECC_TAB[ecc].cw[ver - 1];
    var div = rsDivisor(deg);
    /* block layout: rawCount = data + all ecc codewords; blocks split rawCount
       into shortLen / shortLen+1 DATA bytes (+ deg ecc each), short blocks first */
    var rawCount = total + deg * nb;
    var numShort = nb - (rawCount % nb);
    var shortLen = Math.floor(rawCount / nb);
    var blocks = [], eccs = [], off = 0;
    for (var bi = 0; bi < nb; bi++){
      var len = shortLen - deg + (bi < numShort ? 0 : 1);
      blocks.push(data.slice(off, off + len)); off += len;
      eccs.push(rsRemainder(blocks[bi], div));
    }
    var cw = [];
    var maxData = blocks[nb - 1].length;
    for (var i3 = 0; i3 < maxData; i3++) for (var b3 = 0; b3 < nb; b3++) if (i3 < blocks[b3].length) cw.push(blocks[b3][i3]);
    for (var i4 = 0; i4 < deg; i4++) for (var b4 = 0; b4 < nb; b4++) cw.push(eccs[b4][i4]);
    return draw(ver, ecc, cw);
  }
  function draw(ver, ecc, cw){
    var size = ver*4 + 17, mod = [], fn = [];
    for (var i = 0; i < size; i++){ mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, dark){ fn[y][x] = true; mod[y][x] = dark; }
    function finder(cx, cy){
      for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++){
        var x = cx + dx, y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        var dark = (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6) &&
          (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setF(x, y, dark);
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (var t = 8; t < size - 8; t++){ setF(t, 6, t % 2 === 0); setF(6, t, t % 2 === 0); }
    var ap = alignPos(ver);
    for (var ai = 0; ai < ap.length; ai++) for (var aj = 0; aj < ap.length; aj++){
      /* spec: skip ONLY the three finder corners — patterns that cross the
         timing lines are drawn too (they replace that timing segment) */
      if ((ai === 0 && aj === 0) || (ai === 0 && aj === ap.length - 1) ||
          (ai === ap.length - 1 && aj === 0)) continue;
      var ax = ap[ai], ay = ap[aj];
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        setF(ax + dx2, ay + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }
    function drawFormat(mask){
      var fb = formatBits(ecc, mask);
      for (var i = 0; i <= 5; i++) setF(8, i, ((fb >> i) & 1) === 1);
      setF(8, 7, ((fb >> 6) & 1) === 1);
      setF(8, 8, ((fb >> 7) & 1) === 1);
      setF(7, 8, ((fb >> 8) & 1) === 1);
      for (var i2 = 9; i2 < 15; i2++) setF(14 - i2, 8, ((fb >> i2) & 1) === 1);
      for (var i3 = 0; i3 < 8; i3++) setF(size - 1 - i3, 8, ((fb >> i3) & 1) === 1);
      for (var i4 = 8; i4 < 15; i4++) setF(8, size - 15 + i4, ((fb >> i4) & 1) === 1);
      setF(8, size - 8, true); /* the ever-dark module (x=8, y=size-8) */
    }
    drawFormat(0);
    if (ver >= 7){
      var vb = versionBits(ver);
      for (var i5 = 0; i5 < 18; i5++){
        var bit = ((vb >> i5) & 1) === 1, a = size - 11 + (i5 % 3), b = Math.floor(i5/3);
        setF(a, b, bit); setF(b, a, bit);
      }
    }
    /* zig-zag data placement */
    var di = 0, len = cw.length;
    for (var right = size - 1; right >= 1; right -= 2){
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++){
        for (var j = 0; j < 2; j++){
          var x = right - j, upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && di < len*8){
            mod[y][x] = ((cw[di >>> 3] >>> (7 - (di & 7))) & 1) === 1;
            di++;
          }
        }
      }
    }
    /* mask selection (spec penalty rules) */
    function maskBit(m, x, y){
      switch (m){
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x/3) + Math.floor(y/2)) % 2 === 0;
        case 5: return ((x*y) % 2 + (x*y) % 3) === 0;
        case 6: return (((x*y) % 2 + (x*y) % 3) % 2) === 0;
        default: return (((x + y) % 2 + (x*y) % 3) % 2) === 0;
      }
    }
    function penaltyOf(mask){
      var res = [], pen = 0;
      for (var y = 0; y < size; y++){
        res.push(new Array(size));
        for (var x = 0; x < size; x++){
          var v = fn[y][x] ? mod[y][x] : (mod[y][x] !== maskBit(mask, x, y));
          res[y][x] = v;
        }
      }
      var PAT = [true,false,true,true,true,false,true,false,false,false,false];
      for (var a = 0; a < 2; a++){
        for (var i = 0; i < size; i++){
          var run = 1;
          for (var j = 1; j < size; j++){
            var c1 = a === 0 ? res[i][j] : res[j][i];
            var c0 = a === 0 ? res[i][j-1] : res[j-1][i];
            if (c1 === c0){ run++; if (j === size - 1 && run >= 5) pen += 3 + (run - 5); }
            else { if (run >= 5) pen += 3 + (run - 5); run = 1; }
          }
        }
        for (var i2 = 0; i2 < size; i2++){
          for (var j2 = 0; j2 <= size - 11; j2++){
            var ok1 = true, ok2 = true;
            for (var k = 0; k < 11; k++){
              var c = a === 0 ? res[i2][j2 + k] : res[j2 + k][i2];
              if (c !== PAT[k]) ok1 = false;
              if (c !== PAT[10 - k]) ok2 = false;
            }
            if (ok1 || ok2) pen += 40;
          }
        }
      }
      for (var y2 = 0; y2 < size - 1; y2++) for (var x2 = 0; x2 < size - 1; x2++)
        if (res[y2][x2] === res[y2][x2+1] && res[y2][x2] === res[y2+1][x2] && res[y2][x2] === res[y2+1][x2+1]) pen += 3;
      var dark = 0;
      for (var y3 = 0; y3 < size; y3++) for (var x3 = 0; x3 < size; x3++) if (res[y3][x3]) dark++;
      var k4 = Math.ceil(Math.abs(dark*20 - size*size*10) / (size*size)) - 1;
      pen += Math.max(0, k4) * 10;
      return pen;
    }
    var bestMask = 0, bestPen = Infinity;
    for (var m = 0; m < 8; m++){ var p = penaltyOf(m); if (p < bestPen){ bestPen = p; bestMask = m; } }
    for (var y4 = 0; y4 < size; y4++) for (var x4 = 0; x4 < size; x4++)
      if (!fn[y4][x4]) mod[y4][x4] = mod[y4][x4] !== maskBit(bestMask, x4, y4);
    drawFormat(bestMask);
    return { size: size, get: function(x, y){ return mod[y][x]; } };
  }
  return { make: make };
})();
function showQR(url){
  var q = QR.make(url);
  if (!q){ toast(T('fail')); return; }
  var cv = document.getElementById('qCanvas'), ctx = cv.getContext('2d');
  var quiet = 2, cells = q.size + quiet*2, scale = Math.floor(264/cells) || 1, off = Math.floor((264 - cells*scale)/2);
  ctx.fillStyle = '#FFFDF6'; ctx.fillRect(0,0,264,264);
  ctx.fillStyle = '#1A150C';
  for (var y=0;y<q.size;y++) for (var x=0;x<q.size;x++)
    if (q.get(x,y)) ctx.fillRect(off+(x+quiet)*scale, off+(y+quiet)*scale, scale, scale);
  document.getElementById('qTitle').textContent = T('qr_t');
  document.getElementById('qHint').textContent = T('qr_hint');
  document.getElementById('qmodal').classList.add('show');
  haptic('light');
}
function loadStats(){
  fetch('/app/api/stats').then(function(r){ return r.json(); }).then(function(s){
    /* D5.1: every failure is visible and retried — never a silent «—» */
    if (s.error || (!s.generated_at && !s.published_at)){ throw new Error('no_data'); }
    statRetry = 0;
    var he = document.getElementById('heroErr'); if (he) he.style.display = 'none';
    lastStats = s;
    countUp(document.getElementById('heroNum'), s.gold);
    document.getElementById('heroSubA').textContent = T('hero_a', {alive: fmtN(s.alive)});
    document.getElementById('heroSubB').textContent = T('hero_b', {run: rel(s.published_at || s.generated_at)}); // D10.2/B2
    document.getElementById('stAlive').textContent = fmtN(s.alive);
    document.getElementById('stP50').innerHTML = fmtN(s.p50) + '<small> ms</small>';
    document.getElementById('stSrc').innerHTML = fmtN(s.sources_ok) + '<small> / ' + fmtN(s.sources_total) + '</small>';
    document.getElementById('stRun').textContent = rel(s.published_at || s.generated_at); // D10.2/B2
    var pct = s.sources_total ? Math.round(100 * s.sources_ok / s.sources_total * 10) / 10 : 0;
    document.getElementById('stSrcB').textContent = pct + '%';
    document.getElementById('stRunB').textContent = rel(s.published_at || s.generated_at); // D10.2/B2
    var bank = document.getElementById('bankStrip');
    if (s.bank && s.bank.size != null){
      bank.style.display = 'flex';
      document.getElementById('bankT1').textContent = T('bank_t1', {n: fmtN(s.bank.size)});
      var p2 = (s.bank.pass2 && s.bank.pass2.rescued) || 0;
      document.getElementById('bankT2').textContent = T('bank_t2', {
        hit: (s.bank.hit_rate != null ? s.bank.hit_rate : '—'),
        p2: fmtN(p2), streak: (s.bank.avg_streak != null ? s.bank.avg_streak : '—')});
    } else { bank.style.display = 'none'; }
    /* D9/U2 — 7-day health sparkline (absent data → section stays hidden) */
    var hs = document.getElementById('healthStrip');
    if (hs && Array.isArray(s.health_7d) && s.health_7d.length){
      hs.style.display = 'block';
      document.getElementById('healthTitle').textContent = T('health_t');
      var data = s.health_7d.slice(-7), bars = '';
      for (var hi = 0; hi < data.length; hi++){
        var d = data[hi];
        var hit = (d.hit == null) ? null : Math.max(0, Math.min(100, Number(d.hit)));
        var hgt = hit == null ? 7 : Math.max(7, Math.round(hit * 0.42));
        bars += '<div class="hbar"><i style="height:' + hgt + 'px"' + (hit == null ? ' class="na"' : '') +
          '></i><span>' + esc(String(d.d || '').slice(8)) + '</span></div>';
      }
      document.getElementById('healthBars').innerHTML = bars;
    } else if (hs){ hs.style.display = 'none'; }
  }).catch(function(){
    var he = document.getElementById('heroErr'); if (he) he.style.display = 'block';
    toast(T('fail'));
    statRetry = Math.min(statRetry + 1, 6);
    setTimeout(loadStats, [5000, 15000, 40000, 90000, 180000, 300000][statRetry - 1]);
  });
}
function sortItems(items){
  var a = items.slice();
  if (goldSort === 'ok'){
    a.sort(function(x, y){ var ex = x.ema === null ? -1 : x.ema, ey = y.ema === null ? -1 : y.ema;
      return (ey - ex) || ((x.latency_ms === null ? 9e9 : x.latency_ms) - (y.latency_ms === null ? 9e9 : y.latency_ms)); });
  } else if (goldSort === 'vote'){
    a.sort(function(x, y){ return ((y.up || 0) - (y.down || 0)) - ((x.up || 0) - (x.down || 0)); });
  } else {
    a.sort(function(x, y){ return (x.latency_ms === null ? 9e9 : x.latency_ms) - (y.latency_ms === null ? 9e9 : y.latency_ms); });
  }
  return a;
}
function renderGold(){
  var list = document.getElementById('goldList');
  if (!goldItems.length){ list.innerHTML = '<div class="err">⏳</div>'; return; }
  var filtered = goldFiltered();
  var anyFilter = goldFProto || goldFPing > 0 || goldQ || goldFavOnly;
  var shown = anyFilter ? filtered : filtered.slice(0, 10); /* D6 look: 10 cards by default */
  var html = '';
  for (var i = 0; i < shown.length; i++){ html += goldCard(shown[i], i); }
  list.innerHTML = html;
  document.getElementById('fCount').textContent = shown.length + ' / ' + goldItems.length;
  var cab = document.getElementById('copyAllBtn');
  cab.style.display = anyFilter && shown.length ? 'inline-flex' : 'none';
  cab.textContent = T('copy_all', {n: shown.length});
  bindCards();
}
function goldCard(it, idx){
  var proto = (it.uri.split('://')[0] || 'other').toLowerCase();
  var rank = (idx < 3) ? MEDALS[idx] : '<span class="num">#' + (idx + 1) + '</span>';
  var emaCls = it.ema !== null ? (it.ema >= 0.99 ? 'g' : it.ema >= 0.8 ? 's' : 'b') : 'b';
  var emaTx = it.ema !== null ? Math.round(it.ema * 100) + '%' : '—';
  var latTx = it.latency_ms !== null ? Math.round(it.latency_ms) + 'ms' : '—';
  var starred = favSet[it.hash] ? ' on' : '';
  var opTx = it.op ? '<span class="opchip">' + esc(ISPN[it.op] || it.op) + '</span>' : '';
  return '<div class="gcard" data-uri="' + esc(it.uri) + '" data-hash="' + esc(it.hash || '') + '" style="animation:up .4s ' + (idx * 0.05) + 's ease both">' +
    '<div class="gtop"><div class="rank">' + rank + '</div>' +
    '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
    '<div class="host">' + esc(hostOf(it.uri)) + '</div>' +
    opTx +
    '<span class="livedot"></span>' +
    '<div class="metrics"><span class="ema ' + emaCls + '">' + emaTx + '</span>' +
    '<span class="lat">' + latTx + '</span></div></div>' +
    '<div class="gfoot">' +
    '<button class="fb"' + (initData ? '' : ' disabled') + ' data-hash="' + esc(it.hash) + '" data-v="up">👍 <span>' + (it.up || 0) + '</span></button>' +
    '<button class="fb"' + (initData ? '' : ' disabled') + ' data-hash="' + esc(it.hash) + '" data-v="down">👎 <span>' + (it.down || 0) + '</span></button>' +
    '<button class="star' + starred + '"' + (initData ? '' : ' disabled') + ' data-hash="' + esc(it.hash || '') + '" data-uri="' + esc(it.uri) + '" data-p="' + esc(proto) + '" data-l="' + (it.latency_ms == null ? '' : Math.round(it.latency_ms)) + '">⭐</button>' +
    '<span class="ok">✔ ' + (it.ok || 0) + ' / ✘ ' + (it.fail || 0) + '</span></div></div>';
}
function bindCards(){
  var list = document.getElementById('goldList');
  Array.prototype.forEach.call(list.querySelectorAll('.gcard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(ev){
      if (ev.target.closest && (ev.target.closest('.fb') || ev.target.closest('.star'))) return;
      copyText(card.getAttribute('data-uri'));
      histAdd(card.getAttribute('data-uri'), card.getAttribute('data-hash'));
    });
  });
  Array.prototype.forEach.call(list.querySelectorAll('.star'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData) return;
      favToggle(btn.getAttribute('data-hash'), btn.getAttribute('data-uri'), btn.getAttribute('data-p'), btn.getAttribute('data-l'));
      btn.classList.toggle('on', !btn.classList.contains('on'));
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    });
  });
  Array.prototype.forEach.call(list.querySelectorAll('.fb'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData) return; /* anonymous visitors see counts only */
      var vote = btn.getAttribute('data-v'), hash = btn.getAttribute('data-hash');
      haptic('medium');
      fetch('/app/api/feedback', {method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({initData: initData, hash: hash, vote: vote})})
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (res.ok){ toast(T('voted'));
            btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
            var card = btn.closest('.gcard');
            Array.prototype.forEach.call(card.querySelectorAll('.fb'), function(b){ b.classList.remove('on'); });
            btn.classList.add('on');
            var cnt = btn.querySelector('span'); if (cnt) cnt.textContent = (vote === 'up') ? res.up : res.down;
            for (var i = 0; i < goldItems.length; i++){
              if (goldItems[i].hash === hash){
                if (vote === 'up'){ goldItems[i].up = res.up; } else { goldItems[i].down = res.down; }
              }
            }
          } /* server refused (expired session) — stay silent */
        }).catch(function(){ toast(T('fail')); });
    });
  });
}
Array.prototype.forEach.call(document.querySelectorAll('.schip'), function(chip){
  chip.addEventListener('click', function(){
    if (chip.classList.contains('on')) return;
    haptic('light');
    Array.prototype.forEach.call(document.querySelectorAll('.schip'), function(c){ c.classList.remove('on'); });
    chip.classList.add('on');
    goldSort = chip.getAttribute('data-sort');
    renderGold();
  });
});
  /* D8/U2 — filter chips + search + copy-all */
  Array.prototype.forEach.call(document.querySelectorAll('#protoRow .fchip'), function(chip){
    chip.addEventListener('click', function(){
      haptic('light');
      Array.prototype.forEach.call(document.querySelectorAll('#protoRow .fchip'), function(c){ c.classList.remove('on'); });
      chip.classList.add('on');
      goldFProto = chip.getAttribute('data-f') || '';
      renderGold();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#pingRow .fchip[data-p]'), function(chip){
    chip.addEventListener('click', function(){
      haptic('light');
      Array.prototype.forEach.call(document.querySelectorAll('#pingRow .fchip[data-p]'), function(c){ c.classList.remove('on'); });
      chip.classList.add('on');
      goldFPing = parseInt(chip.getAttribute('data-p'), 10) || 0;
      renderGold();
    });
  });
  var foc = document.getElementById('favOnlyChip');
  if (foc) foc.addEventListener('click', function(){
    if (!initData){ toast(T('open_tg')); return; }
    haptic('light');
    goldFavOnly = !goldFavOnly;
    foc.classList.toggle('on', goldFavOnly);
    renderGold();
  });
  var qin = document.getElementById('goldQ');
  if (qin){ var qT = null; qin.addEventListener('input', function(){
    clearTimeout(qT); qT = setTimeout(function(){ goldQ = qin.value.trim(); renderGold(); }, 220);
  }); }
  document.getElementById('copyAllBtn').addEventListener('click', function(){
    var shown = goldFiltered();
    if (!shown.length) return;
    copyText(shown.map(function(it){ return it.uri; }).join('\\n'));
    toast(T('copied_n', {n: shown.length}));
  });
  var goldAutoRetried = false;
function showGoldFail(list){
  list.innerHTML = '<div class="err">' + T('fail') + '</div>';
  var b = document.createElement('button');
  b.className = 'retrybtn'; b.textContent = '⟳';
  b.addEventListener('click', function(){ loadGold(false); });
  list.appendChild(b);
}
function goldAutoRetry(){
  if (goldAutoRetried) return;
  goldAutoRetried = true;
  setTimeout(function(){ loadGold(false); }, 6000);
}
function loadGold(append){
  var list = document.getElementById('goldList');
  if (!append){ list.innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; goldOffset = 0; }
  /* POST + initData → the server stamps the user's own name on the copied configs */
  var req = initData
    ? fetch('/app/api/gold', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: initData, offset: goldOffset, limit: 24 }) })
    : fetch('/app/api/gold?offset=' + goldOffset + '&limit=24');
  req.then(function(r){ return r.json(); }).then(function(d){
    if (d.error || !d.items){ showGoldFail(list); goldAutoRetry(); return; }
    if (!d.items.length && !append){ list.innerHTML = '<div class="err">⏳</div>'; return; }
    goldAutoRetried = false;
    goldItems = append ? goldItems.concat(d.items) : d.items;
    goldOffset += d.items.length;
    renderGold();
    /* D8/U2: filters live client-side — no pager button needed any more */
    document.getElementById('moreBtn').style.display = 'none';
  }).catch(function(){ showGoldFail(list); goldAutoRetry(); });
}
function subRow(it, idx){
  var proto = (it.uri.split('://')[0] || 'other').toLowerCase();
  var pingTx = it.ping != null ? Math.round(it.ping) + 'ms' : '—';
  var okOn = it.mark === 1 ? ' on' : '', badOn = it.mark === 2 ? ' on' : '';
  var starred = favSet[it.hash] ? ' on' : '';
  return '<div class="scard" data-uri="' + esc(it.uri) + '" data-hash="' + esc(it.hash || '') + '" style="animation-delay:' + (idx * 0.04) + 's">' +
    '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
    '<div class="host">' + esc(hostOf(it.uri)) + '</div>' +
    '<span class="ping">' + esc(pingTx) + '</span>' +
    '<button class="star' + starred + '" data-hash="' + esc(it.hash || '') + '" data-uri="' + esc(it.uri) + '" data-p="' + esc(proto) + '" data-l="' + (it.ping == null ? '' : Math.round(it.ping)) + '">⭐</button>' +
    '<button class="mk ok' + okOn + '" data-hash="' + esc(it.hash) + '" data-v="ok" title="' + T('mk_ok') + '">✅</button>' +
    '<button class="mk bad' + badOn + '" data-hash="' + esc(it.hash) + '" data-v="fail" title="' + T('mk_fail') + '">❌</button>' +
    '</div>';
}
function bindSubMarks(){
  Array.prototype.forEach.call(document.querySelectorAll('#subCard .scard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(ev){
      if (ev.target.closest && (ev.target.closest('.mk') || ev.target.closest('.star'))) return;
      copyText(card.getAttribute('data-uri'));
      histAdd(card.getAttribute('data-uri'), card.getAttribute('data-hash'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#subCard .star'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData) return;
      favToggle(btn.getAttribute('data-hash'), btn.getAttribute('data-uri'), btn.getAttribute('data-p'), btn.getAttribute('data-l'));
      btn.classList.toggle('on', !btn.classList.contains('on'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#subCard .mk'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData) return; /* silent for anonymous users */
      var v = btn.getAttribute('data-v'), hash = btn.getAttribute('data-hash');
      var wasOn = btn.classList.contains('on');
      var mark = wasOn ? 'clear' : v;
      haptic('medium');
      fetch('/app/api/mark', {method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({initData: initData, hash: hash, mark: mark})})
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (res.ok){ toast(T('marked'));
            var card = btn.closest('.scard');
            Array.prototype.forEach.call(card.querySelectorAll('.mk'), function(b){ b.classList.remove('on'); });
            if (!wasOn) btn.classList.add('on');
          } /* server refused — stay silent */
        }).catch(function(){ toast(T('fail')); });
    });
  });
}
function loadSub(){
  var card = document.getElementById('subCard');
  if (!initData){
    card.innerHTML = '<div class="t">' + T('sub_t') + '</div><div class="meta">' + T('open_tg') + '</div>';
    return;
  }
  fetch('/app/api/sub', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({initData: initData})})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.error){ card.innerHTML = '<div class="t">' + T('sub_t') + '</div><div class="meta">' + T('sub_need') + '</div>'; return; }
      var isp = ISPN[d.isp] || T('isp_other');
      var cl = d.client === 'other' ? T('cl_other') : d.client;
      var rotChip = '<span class="rot">' + T(d.rotation === 'run' ? 'rot_run' : 'rot_day') + '</span>';
      var nameTag = d.name ? ' · ✍️ ' + esc(d.name) : '';
      subModeCur = d.sub_mode || 'mix'; subUrlCur = d.url;
      var modeBtn = function(m, key){ return '<button data-m="' + m + '"' + (subModeCur === m ? ' class="on"' : '') + '>' + T(key) + '</button>'; };
      var html = '<div class="t">' + T('sub_t') + ' ' + rotChip + '</div>' +
        '<div class="url">' + esc(d.url) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn" id="copySub">📋 ' + T('sub_copy') + '</button>' +
        '<button class="btn" id="qrSub" style="background:none;color:var(--gold)">🔲 ' + T('qr_btn') + '</button>' +
        '</div>' +
        '<div class="msw" id="msw">' +
        modeBtn('mine', 'msw_mine') + modeBtn('gold', 'msw_gold') + modeBtn('mix', 'msw_mix') +
        '</div>' +
        '<div class="mswnote">' + T('msw_note') + '</div>' +
        '<details class="adv"><summary>' + T('adv_t') + '</summary>' +
        '<div class="arow"><span class="tag">' + T('tag_mine') + '</span><div class="url">' + esc(d.url + '?m=mine') + '</div><button class="mini2" data-copy="' + esc(d.url + '?m=mine') + '">' + T('copy_btn') + '</button></div>' +
        '<div class="arow"><span class="tag">' + T('tag_gold') + '</span><div class="url">' + esc(d.url + '?m=gold') + '</div><button class="mini2" data-copy="' + esc(d.url + '?m=gold') + '">' + T('copy_btn') + '</button></div>' +
        '<div class="arow"><span class="tag">' + T('tag_mix') + '</span><div class="url">' + esc(d.url + '?m=mix') + '</div><button class="mini2" data-copy="' + esc(d.url + '?m=mix') + '">' + T('copy_btn') + '</button></div>' +
        '</details>' +
        '<div class="meta">' + T('sub_meta', {o: isp, c: cl}) + nameTag + '</div>';
      if (d.items && d.items.length){
        html += '<div class="meta" style="margin-top:14px;font-weight:800;color:var(--gold)">📦 ' + T('my10') + ' · ' + d.items.length + '</div>';
        for (var i = 0; i < d.items.length; i++){ html += subRow(d.items[i], i); }
        html += '<div class="meta" style="margin-top:8px">✅ ' + T('mk_ok') + ' · ❌ ' + T('mk_fail') + '</div>';
      }
      card.innerHTML = html;
      document.getElementById('copySub').addEventListener('click', function(){ copyText(d.url); });
      document.getElementById('qrSub').addEventListener('click', function(){ showQR(d.url); });
      Array.prototype.forEach.call(document.querySelectorAll('#msw button'), function(btn){
        btn.addEventListener('click', function(){
          var m = btn.getAttribute('data-m');
          if (m === subModeCur) return;
          haptic('medium');
          fetch('/app/api/submode', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ initData: initData, mode: m }) })
            .then(function(r){ return r.json(); })
            .then(function(res){
              if (res && res.ok){ subModeCur = m; toast(T('msw_saved'));
                Array.prototype.forEach.call(document.querySelectorAll('#msw button'), function(b){ b.classList.toggle('on', b.getAttribute('data-m') === m); });
              } else toast(T('fail'));
            }).catch(function(){ toast(T('fail')); });
        });
      });
      Array.prototype.forEach.call(card.querySelectorAll('.mini2[data-copy]'), function(btn){
        btn.addEventListener('click', function(ev){ ev.stopPropagation(); copyText(btn.getAttribute('data-copy')); });
      });
      bindSubMarks();
    }).catch(function(){ card.innerHTML = '<div class="err">' + T('fail') + '</div>'; });
}
/* D6 — personal history: persistent ≤20, rendered BEFORE the global gold list */
var histLoaded = false;
function histCard(it, idx){
  var uri = it.u || '';
  var proto = (uri.split('://')[0] || 'other').toLowerCase();
  var latTx = (it.l != null && isFinite(it.l)) ? Math.round(it.l) + 'ms' : '—';
  var ago = '—';
  try { ago = rel(new Date(it.ts || Date.now()).toISOString()); } catch (e){}
  return '<div class="scard" data-uri="' + esc(uri) + '" style="animation-delay:' + (idx * 0.04) + 's">' +
    '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
    '<div class="host">' + esc(hostOf(uri)) + '</div>' +
    '<span class="ping">' + esc(latTx) + '</span>' +
    '<span class="ping">' + esc(ago) + '</span></div>';
}
function histRender(items){
  var sec = document.getElementById('histSec'), hint = document.getElementById('histHint'),
      list = document.getElementById('histList'), clr = document.getElementById('histClear');
  if (!sec) return;
  if (!initData){ sec.style.display = 'none'; hint.style.display = 'none'; return; }
  sec.style.display = 'flex';
  hint.style.display = 'block';
  var has = items && items.length;
  hint.textContent = has ? T('hist_hint') : T('hist_empty');
  clr.style.display = has ? 'inline-flex' : 'none';
  var html = '';
  for (var i = 0; i < (items || []).length; i++) html += histCard(items[i], i);
  list.innerHTML = html;
  Array.prototype.forEach.call(list.querySelectorAll('.scard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(){ copyText(card.getAttribute('data-uri')); });
  });
}
function histAdd(uri, hash){
  if (!initData || !hash) return; /* anonymous copies are not tracked — by design */
  var proto = (String(uri).split('://')[0] || '').toLowerCase();
  fetch('/app/api/history', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: 'add', hash: hash, uri: uri, proto: proto }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok) histRender(d.items); }).catch(function(){});
}
function loadHist(){
  if (!initData){ histRender(null); return; }
  if (histLoaded) return;
  fetch('/app/api/history', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: 'list' }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok){ histLoaded = true; histRender(d.items); } })
    .catch(function(){});
}
function loadMe(){
  if (!initData) return;
  fetch('/app/api/me', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.ok && d.theme) applyTheme(d.theme); // D8/U4 — profile theme wins
      if (!(d && d.ok && d.is_admin)) return;
      var c = document.getElementById('admChip');
      if (!c) return;
      c.style.display = 'inline-flex';
      if (!c._bound){ c._bound = true;
        c.addEventListener('click', function(){
          var u = location.origin + '/panel';
          if (tg && tg.openLink) tg.openLink(u); else location.href = u;
        });
      }
    }).catch(function(){});
}
document.getElementById('histClear').addEventListener('click', function(ev){
  ev.stopPropagation();
  if (!initData) return;
  haptic('light');
  fetch('/app/api/history', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: 'clear' }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok){ toast(T('hist_cleared')); histRender([]); } }).catch(function(){});
});
applyTexts();
initTheme();
/* D11/U4-4 — the bot's /lang choice (server user.lang) drives the mini app:
   one boot pref read returns {theme, lang}; the server choice wins over the
   Telegram client guess, and data loads wait for it so nothing renders in
   two languages. Fail-open: any error boots exactly like before. */
var booted = false;
function finishBoot(){ if (booted) return; booted = true;
  loadStats(); loadGold(false); loadSub(); loadMe(); loadHist(); loadFavs(); }
if (initData){
  fetch('/app/api/pref', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData }) })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(p){
      if (p && p.ok){
        if (p.theme === 'light' || p.theme === 'dark'){ try { localStorage.setItem('ariston_theme', p.theme); } catch (e2){} applyTheme(p.theme); }
        if (p.lang && I18N[p.lang] && p.lang !== lang){
          lang = p.lang; dict = I18N[p.lang];
          document.documentElement.lang = p.lang;
          document.documentElement.dir = (p.lang === 'fa') ? 'rtl' : 'ltr';
          applyTexts();
        }
      }
    })
    .catch(function(){})
    .then(finishBoot);
} else finishBoot();
setTimeout(finishBoot, 2500); // hard fail-open: the app never hangs on the pref read
document.getElementById('moreBtn').addEventListener('click', function(){ haptic('light'); loadGold(true); });
document.getElementById('refresh').addEventListener('click', function(){ haptic('light'); loadStats(); loadGold(false); });
document.getElementById('heroErr').addEventListener('click', loadStats);
document.getElementById('themeBtn').addEventListener('click', function(){
  haptic('light');
  var next = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next); saveThemePref(next);
});
document.getElementById('favClear').addEventListener('click', function(ev){
  ev.stopPropagation();
  if (!initData) return;
  haptic('light');
  fetch('/app/api/fav', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData, op: 'clear' }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d && d.ok){ toast(T('fav_gone')); favRender([]); } }).catch(function(){});
});
document.getElementById('qClose').addEventListener('click', function(){ document.getElementById('qmodal').classList.remove('show'); });
document.getElementById('qmodal').addEventListener('click', function(ev){ if (ev.target.id === 'qmodal') document.getElementById('qmodal').classList.remove('show'); });
setInterval(loadStats, 5 * 60 * 1000);
/* D10.1/B3 — members-only wall: the first 403 «join_required» covers the app.
   The bot, the feeds and the mini app all stop for leavers — server-side. */
var JOIN_WALL_SHOWN = false;
function showJoinWall(){
  if (JOIN_WALL_SHOWN) return; JOIN_WALL_SHOWN = true;
  var d = document.createElement('div');
  d.id = 'joinWall';
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(10,8,4,.96);backdrop-filter:blur(8px);text-align:center;padding:24px';
  d.innerHTML = '<div style="font-size:44px">🔒</div>'
    + '<div style="font-size:17px;font-weight:700;color:#E8C872">عضویت در کانال لازم است</div>'
    + '<div style="font-size:13px;color:#b8ad93">برای استفاده از آریستون باید عضو کانال رسمی باشی. عضو شو و دکمهٔ بررسی رو بزن.</div>'
    + '<a href="https://t.me/Ariston_CH" style="display:block;padding:12px 22px;border-radius:12px;background:#E8C872;color:#14110C;font-weight:700;text-decoration:none">🔔 عضویت در @Ariston_CH</a>'
    + '<button onclick="location.reload()" style="padding:10px 18px;border-radius:12px;border:1px solid #E8C872;background:transparent;color:#E8C872;font-weight:600">✅ عضو شدم — بررسی کن</button>';
  document.body.appendChild(d);
}
(function(){
  var _f = window.fetch;
  if (!_f) return;
  window.fetch = function(){
    var args = arguments;
    return _f.apply(this, args).then(function(r){
      if (r && r.status === 403){
        try { r.clone().json().then(function(j){ if (j && j.error === 'join_required') showJoinWall(); }).catch(function(){}); } catch (e){}
      }
      return r;
    });
  };
})();
/* D5.2 hotfix — the Telegram script is async now: first paint never waits for
   telegram.org. Attach TG features whenever it arrives (poll ≤ 4s), then refresh personal parts. */
function tgAttach(){
  tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (!tg) return false;
  initData = tg.initData || '';
  try { tg.ready(); tg.expand(); tg.setHeaderColor(document.body.classList.contains('light') ? '#F4EEDF' : '#0C0A07'); tg.setBackgroundColor(document.body.classList.contains('light') ? '#F4EEDF' : '#0C0A07'); } catch (e){}
  if (initData){ loadSub(); loadGold(false); loadHist(); loadMe(); loadFavs(); }
  return true;
}
if (!tgAttach()){
  var tgN = 0;
  var tgIv = setInterval(function(){ if (tgAttach() || ++tgN > 40) clearInterval(tgIv); }, 100);
}
<\/script>
</body>
</html>`;

/* ─────────────────────── D5 — admin settings panel (/panel) ─────────────────
 * Telegram Mini App, opened via /panel (admins only — initData is verified on
 * every api call; the UI is a thin client over /app/api/admin/*). */

const ADMIN_PANEL_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>ARISTON · پنل مدیریت</title>
<!-- panel build: D10.1 — phase 3: pipeline filters (tier/protocol/blackwhite/geo/strictness) · settings export-restore · read-only KV browser · selective cleanup · health test · error ring · weekly summary · run-late alert · invite tiers -->
<script src="https://telegram.org/js/telegram-web-app.js" async><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Vazirmatn:wght@400;500;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Vazirmatn:wght@400;500;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
<style>
:root{--bg:#0C0A07;--card:rgba(232,200,114,.06);--line:rgba(232,200,114,.18);
--gold:#E8C872;--gold2:#F5DFA0;--deep:#C9A24A;--txt:#F3ECDD;--dim:#8d8262;--bad:#e06c5a;--ok:#7ec97e;
--mono:'JetBrains Mono',ui-monospace,Menlo,monospace;--cin:'Cinzel',serif}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--txt);font-family:'Vazirmatn',system-ui,sans-serif;font-size:15px;line-height:1.7}
body{min-height:100vh;background:
radial-gradient(700px 340px at 50% -90px,rgba(232,200,114,.15),transparent 70%),
radial-gradient(420px 240px at 90% 30%,rgba(201,162,74,.05),transparent 70%)}
.wrap{max-width:540px;margin:0 auto;padding:14px 16px calc(34px + env(safe-area-inset-bottom))}
header{display:flex;align-items:center;gap:10px;padding:8px 2px 14px;animation:up .5s ease both}
.brand{font-family:var(--cin);font-weight:900;letter-spacing:.3em;font-size:15px;text-indent:.3em;
background:linear-gradient(180deg,#F7E5AF,#E8C872 55%,#B98F3E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:var(--dim);font-size:12px}
.h2{font-size:13.5px;color:var(--deep);margin:24px 2px 8px;letter-spacing:.04em;display:flex;align-items:center;gap:8px;font-weight:800;animation:up .5s ease both}
.h2::after{content:'';flex:1;height:1px;background:var(--line)}
.h2 .n{font-family:var(--mono);font-size:10.5px;color:var(--dim);font-weight:400}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:6px 14px;margin-bottom:10px;animation:up .5s ease both}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px dashed rgba(232,200,114,.1)}
.row:last-child{border-bottom:none}
.k{font-size:13.5px;font-weight:600}
.hint{color:var(--dim);font-size:11.5px;margin-top:2px}
.tg{font-family:var(--mono);direction:ltr}
.chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
.chip{border:1px solid var(--line);background:none;color:var(--txt);border-radius:999px;padding:6px 13px;font-family:var(--mono);font-size:12.5px;cursor:pointer;transition:all .2s ease}
.chip.on{background:var(--gold);color:#14110C;border-color:var(--gold);font-weight:700}
.chip:active{transform:scale(.94)}
.tgl{border:1px solid var(--line);background:none;color:var(--txt);border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;flex:0 0 auto;transition:all .2s ease}
.tgl.on{background:rgba(126,201,126,.14);color:var(--ok);border-color:rgba(126,201,126,.5)}
.tgl.off{background:rgba(224,108,90,.1);color:var(--bad);border-color:rgba(224,108,90,.45)}
.tgl:active{transform:scale(.94)}
.btn{flex:1;border:1px solid var(--gold);background:linear-gradient(180deg,#F5DFA0,#E8C872);color:#14110C;font-weight:800;font-family:inherit;font-size:13px;border-radius:12px;padding:11px;cursor:pointer;transition:transform .15s ease}
.btn:active{transform:scale(.96)}
.btn.ghost{background:none;color:var(--gold)}
.btn.warn{background:rgba(224,108,90,.12);color:var(--bad);border-color:rgba(224,108,90,.45)}
input,textarea{background:rgba(0,0,0,.25);border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:8px 10px;font-family:var(--mono);font-size:13px;direction:ltr;text-align:center}
input{width:92px}
textarea{width:100%;min-height:84px;direction:rtl;text-align:right;font-family:'Vazirmatn',sans-serif;resize:vertical;line-height:1.6}
.stat{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 0}
.stat div{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:12px;padding:9px 4px;text-align:center;transition:border-color .2s}
.stat div:hover{border-color:rgba(232,200,114,.4)}
.stat b{display:block;font-family:var(--mono);font-size:15px;color:var(--gold);direction:ltr}
.stat span{font-size:10px;color:var(--dim)}
.bgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 0}
.bgrid div{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:12px;padding:9px 4px;text-align:center}
.bgrid b{display:block;font-family:var(--mono);font-size:14px;color:var(--gold2);direction:ltr}
.bgrid span{font-size:9.5px;color:var(--dim)}
.srcdots{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 10px}
.sdot{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-family:var(--mono);font-size:11px;direction:ltr}
.sdot i{width:7px;height:7px;border-radius:50%}
.sdot.h i{background:var(--ok);box-shadow:0 0 7px rgba(126,201,126,.7)}
.sdot.s i{background:var(--deep)}
.sdot.q i{background:var(--bad)}
#users .u,#votes .u,#admins .u{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:7px 0;border-bottom:1px dashed rgba(232,200,114,.08)}
#users .u:last-child,#votes .u:last-child,#admins .u:last-child{border-bottom:none}
.pager{display:flex;gap:8px;padding:10px 0 8px}
.mono{font-family:var(--mono);direction:ltr}
.mini{border:1px solid var(--line);background:none;color:var(--gold);border-radius:9px;font-size:11px;padding:3px 10px;cursor:pointer;font-family:inherit}
.mini:active{transform:scale(.94)}
.toast{position:fixed;inset-inline:0;bottom:18px;margin:auto;width:max-content;max-width:88vw;background:var(--gold);color:#14110C;font-weight:800;font-size:13px;border-radius:999px;padding:9px 18px;opacity:0;pointer-events:none;transition:.25s;z-index:9;box-shadow:0 10px 30px -10px rgba(232,200,114,.5)}
.toast.show{opacity:1}
.lock{text-align:center;padding:60px 10px;color:var(--dim)}
.bar{height:7px;border-radius:999px;background:rgba(0,0,0,.3);overflow:hidden;margin:8px 0 4px}
.bar>i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#C9A24A,#F5DFA0);border-radius:999px;transition:width .4s ease}
.foot{margin-top:26px;text-align:center;font-family:var(--mono);font-size:9.5px;color:var(--dim);letter-spacing:.12em}
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important;transition-duration:.01ms !important}}
</style>
</head>
<body><div class="wrap">
<header>
  <span class="brand">ARISTON</span><span class="sub">🛠 پنل مدیریت · D10.1</span>
</header>
<div id="lock" class="lock" hidden>⛔ این پنل فقط برای مدیرهای ربات باز می‌شه.</div>
<div id="panel" hidden>
  <div class="h2">وضعیت لحظه‌ای</div>
  <div class="card"><div class="stat" id="stat"></div><div class="hint" id="statTime" style="padding:0 2px 2px"></div><div class="hint" id="runStatus" style="padding:0 2px 8px;font-weight:700">—</div></div>

  <div class="h2">بانک کانفیگ <span class="n" id="bankFlag"></span></div>
  <div class="card">
    <div class="bgrid" id="bankGrid"></div>
    <div class="srcdots" id="bankSrc"></div>
    <div class="hint" id="bankPass2" style="padding-bottom:10px"></div>
    <div class="hint" id="bankRescue" style="padding:0 0 10px;display:none"></div>
  </div>

  <div class="h2">بانک و پایپ‌لاین — فاز ۱ <span class="n">تنظیمات زندهٔ دور بعد</span></div>
  <div class="card">
    <div class="row"><div><div class="k">TTL بانک (ساعت)</div><div class="hint">مدخل بدون پاس بعد از این مدت حذف می‌شود (۶ تا ۷۲)</div></div><input id="pTtl" type="number" min="6" max="72"></div>
    <div class="row"><div><div class="k">دور دوم نجات (Pass-2)</div><div class="hint">تست دوبارهٔ ردشدگان مرزی با تایم‌اوت بیشتر</div></div><button class="tgl" id="tglPass2"></button></div>
    <div class="row"><div><div class="k">ضریب تایم‌اوت دور دوم</div><div class="hint">۴٫۵ ثانیه × این ضریب</div></div><div class="chips" id="p2Chips"></div></div>
    <div class="row"><div><div class="k">آستانهٔ «مشکوک»</div><div class="hint">تعداد خطای پشت‌سرهم منبع</div></div><input id="pSuspect" type="number" min="1" max="10"></div>
    <div class="row"><div><div class="k">آستانهٔ «قرنطینه»</div><div class="hint">بعد از این تعداد، منبع کنار می‌رود</div></div><input id="pQuar" type="number" min="2" max="20"></div>
    <div class="row"><div><div class="k">مدت قرنطینه (روز)</div><div class="hint">اسکن کامل شنبه راه بازگشت است</div></div><input id="pQdays" type="number" min="1" max="30"></div>
    <div class="row"><div><div class="k">حداقل سابقهٔ «خوش‌سابقه»</div><div class="hint">برای اول صف تست شدن (۱ تا ۱۰)</div></div><input id="pMinStreak" type="number" min="1" max="10"></div>
    <div class="row"><div><div class="k">احیای بانک (Rescue)</div><div class="hint">کانفیگ‌های سابقه‌دار بی‌منبع، دوباره تست می‌شوند</div></div><button class="tgl" id="tglRescue"></button></div>
    <div class="row"><div><div class="k">حداقل سابقهٔ احیا</div><div class="hint">از این streak به بعد URI ذخیره می‌شود (۲ تا ۲۰)</div></div><input id="pRmin" type="number" min="2" max="20"></div>
    <div class="row"><div><div class="k">سقف احیا در هر دور</div><div class="hint">بودجهٔ تست کاندیدهای احیا (۰ تا ۵۰۰۰)</div></div><input id="pRmax" type="number" min="0" max="5000"></div>
    <div style="padding:10px 0 8px"><button class="btn" id="savePipe">ذخیرهٔ تنظیمات پایپ‌لاین</button></div>
  </div>
  <div class="card">
    <div class="row"><div><div class="k">🛠 اسکن کامل دستی</div><div class="hint">معادل دور شنبه‌شب — فلگ برای رانِ بعدی؛ بعد از اجرا خودکار ریست می‌شود</div></div><button class="btn warn" id="fullScanBtn" style="flex:0 0 auto;padding:9px 14px">🚀 اجرا</button></div>
    <div class="row"><div><div class="k">⚠ فقط جمع‌آوری، بدون تست</div><div class="hint">کلید اضطراری: خروجی‌ها منجمد می‌مانند، بانک دست‌نخورده</div></div><button class="tgl" id="tglSkip"></button></div>
  </div>

  <div class="h2">خروجی‌ها و ساب — فاز ۲ <span class="n">دور بعد اعمال می‌شود</span></div>
  <div class="card">
    <div class="row"><div><div class="k">قالب ریمارک</div><div class="hint">{ping} = پینگ · {-GOLD} = فقط طلایی — مثال: <span class="mono">Ariston{-GOLD}-{ping}ms</span></div></div>
      <input id="pRemark" style="width:150px;text-align:left" maxlength="48" placeholder="Ariston{-GOLD}-{ping}ms"></div>
    <div class="row"><div><div class="k">سقف خطوط ساب</div><div class="hint">حداکثر خط هر لینک ساب (۵۰ تا ۵۰۰)</div></div><input id="pSubMax" type="number" min="50" max="500"></div>
    <div class="row"><div><div class="k">حداقل خط فایل اپراتور</div><div class="hint">کمتر از این → برگشت به طلایی+نقره‌ای (۳ تا ۵۰)</div></div><input id="pSubMin" type="number" min="3" max="50"></div>
    <div class="row"><div><div class="k">خروجی mihomo.yaml</div><div class="hint">اگه خاموش بشه لینکش ۴۰۴ می‌شه</div></div><button class="tgl" id="tglExpMih"></button></div>
    <div class="row"><div><div class="k">خروجی singbox.json</div><div class="hint">اگه خاموش بشه لینکش ۴۰۴ می‌شه</div></div><button class="tgl" id="tglExpSb"></button></div>
    <div class="row"><div><div class="k">نسخه‌های Base64</div><div class="hint">فایل‌های .b64 کنار .txt هر لیست</div></div><button class="tgl" id="tglExpB64"></button></div>
    <div class="row"><div><div class="k">TTL هوشمند بانک</div><div class="hint">سابقهٔ بالا → عمر طولانی‌تر (تا سقف ۷۲ ساعت)</div></div><button class="tgl" id="tglSmartTtl"></button></div>
    <div style="padding:10px 0 8px"><button class="btn" id="savePipe2">ذخیرهٔ فاز ۲</button></div>
  </div>

  <div class="h2">فیلترها و سخت‌گیری — فاز ۳ <span class="n">دور بعد اعمال می‌شود</span></div>
  <div class="card">
    <div class="row"><div><div class="k">آستانهٔ طلایی</div><div class="hint">حداقل امتیاز برای تیر طلایی (۵۰ تا ۹۵ · پیش‌فرض ۸۰)</div></div><input id="pGold" type="number" min="50" max="95"></div>
    <div class="row"><div><div class="k">آستانهٔ نقره‌ای</div><div class="hint">حداقل امتیاز برای نقره‌ای (۲۵ تا ۷۹ · پیش‌فرض ۵۵)</div></div><input id="pSilver" type="number" min="25" max="79"></div>
    <div class="row"><div><div class="k">پروتکل‌های مجاز</div><div class="hint">خالی = همه · مثال: <span class="mono">vless,vmess,hysteria2</span></div></div><input id="pProto" style="width:150px;text-align:left" placeholder="خالی = همه"></div>
    <div class="row"><div><div class="k">لیست سیاه کلمات</div><div class="hint">هر URI که این کلمه‌ها را داشته باشد حذف می‌شود</div></div><input id="pDeny" style="width:150px;text-align:left" placeholder="خالی = خاموش"></div>
    <div class="row"><div><div class="k">لیست سفید کلمات</div><div class="hint">فقط URIهایی که این کلمه‌ها را دارند می‌مانند</div></div><input id="pAllow" style="width:150px;text-align:left" placeholder="خالی = خاموش"></div>
    <div class="row"><div><div class="k">فیلتر جغرافیایی</div><div class="hint">حذف بر اساس کشورِ IP · مثال: <span class="mono">deny: cn,ru</span> یا <span class="mono">allow: ir,de</span></div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="pGeoA" placeholder="allow" style="width:74px"><input id="pGeoD" placeholder="deny" style="width:74px"></div></div>
    <div class="row"><div><div class="k">سختی‌گیری تست</div><div class="hint">۰ عادی · ۱ دور دوم فقط برای تایم‌اوت · ۲ بدون دور دوم</div></div>
      <div class="chips" id="strictChips"></div></div>
    <div style="padding:10px 0 8px"><button class="btn" id="savePipe3">ذخیرهٔ فاز ۳</button></div>
    <div class="hint" style="padding:0 2px 6px">فیلترها فقط لیست امروز را کوچک می‌کنند — هر خطا یعنی برگشت به رفتار عادی.</div>
  </div>

  <div class="h2">سلامت سیستم — فاز ۳ <span class="n" id="cronAge"></span></div>
  <div class="card">
    <div class="row"><div><div class="k">تست سلامت یک‌کلیکی</div><div class="hint">KV · تلگرام · کانال · وب‌هوک · دیتا · کرون</div></div>
      <button class="btn" id="healthBtn" style="flex:0 0 auto;padding:9px 14px">🩺 اجرا</button></div>
    <div id="healthOut" style="display:none;padding:8px 0 2px"></div>
    <div class="row" style="border-top:1px dashed rgba(232,200,114,.1)"><div><div class="k">۱۰ خطای اخیر ورکر</div><div class="hint" id="errN">حلقهٔ خطاها در KV</div></div>
      <button class="mini" id="errBtn">دیدن</button></div>
    <div id="errOut" style="display:none;padding:4px 0 8px"></div>
  </div>

  <div class="h2">پشتیبان و مرورگر — فاز ۳ <span class="n">G6</span></div>
  <div class="card">
    <div style="display:flex;gap:8px;padding:10px 0 6px">
      <button class="btn ghost" id="expBtn">⬇ خروجی تنظیمات</button>
      <button class="btn ghost" id="impBtn">⬆ بازگردانی</button>
    </div>
    <input type="file" id="impFile" accept="application/json,.json" style="display:none">
    <div class="hint" style="padding:0 0 8px">هر سه کلید cfg + فاصلهٔ گزارش دوره‌ای · بازگردانی همه را دوباره clamp می‌کند · کلیدهای یک‌بارمصرف منتقل نمی‌شوند.</div>
    <div class="row" style="border-top:1px dashed rgba(232,200,114,.1)"><div><div class="k">مرورگر KV (فقط‌خواندنی)</div><div class="hint">مقادیر کلیدهای کاربری هرگز نشان داده نمی‌شوند</div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="kvPrefix" placeholder="پیشوند مثل cfg:" style="width:110px"><button class="mini" id="kvGo">دیدن</button></div></div>
    <div id="kvOut" style="display:none;padding:4px 0 8px"></div>
  </div>

  <div class="h2">پاک‌سازی انتخابی <span class="n">G6 · با تایید دومرحله‌ای</span></div>
  <div class="card">
    <div class="chips" id="cleanChips" style="justify-content:flex-start;padding:10px 0"></div>
    <div class="hint" style="padding:0 0 8px">هیچ‌کدام دادهٔ کاربر را پاک نمی‌کنند — فقط لاگ‌ها، گاردها، نشانگرهای اسکن و فلگ‌های یک‌بارمصرف.</div>
  </div>

  <div class="h2">کانال</div>
  <div class="card">
    <div class="row"><div><div class="k">کانال رسمی</div><div class="hint tg" id="chName">—</div></div></div>
    <div class="row"><div><div class="k">فاصلهٔ گزارش دوره‌ای</div><div class="hint">هر چند ساعت یه پست زنده توی کانال</div></div>
      <div class="chips" id="freqChips"></div></div>
    <div class="row"><div class="k">کارت روزانه (عکس برند)</div><button class="tgl" id="tglCard"></button></div>
    <div class="row"><div class="k">گزارش دوره‌ای</div><button class="tgl" id="tglDigest"></button></div>
    <div class="row"><div class="k">هشدار «تست جدید» به کاربرها</div><button class="tgl" id="tglWatch"></button></div>
    <div style="display:flex;gap:8px;padding:10px 0 8px">
      <button class="btn ghost" id="postCard">🖼 پست فوری: کارت</button>
      <button class="btn ghost" id="postDigest">📊 پست فوری: گزارش</button>
    </div>
  </div>

  <div class="h2">اعلان‌ها و سکوت</div>
  <div class="card">
    <div class="row"><div><div class="k">سقف گیرندگان «تست جدید»</div><div class="hint">در هر دور به آخرین N کاربر (۵ تا ۱۰۰)</div></div><input id="wtCap" type="number" min="5" max="100"></div>
    <div class="row"><div><div class="k">ساعات سکوت</div><div class="hint">در این بازهٔ تهران هیچ پیام خودکاری نمی‌رود</div></div><button class="tgl" id="tglQuiet"></button></div>
    <div class="row"><div><div class="k">خلاصهٔ هفتگی جمعه</div><div class="hint">هر جمعه یه گزارش شخصی از تست‌ها و مارک‌های هفته (D10/U3)</div></div><button class="tgl" id="tglWeekly"></button></div>
    <div class="row"><div><div class="k">از ساعت / تا ساعت</div><div class="hint">ساعت تهران — شروعinclusive، پایان exclusive</div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="qStart" type="number" min="0" max="23" style="width:64px"><span style="color:var(--dim)">تا</span><input id="qEnd" type="number" min="0" max="23" style="width:64px"></div></div>
    <div style="padding:10px 0 4px"><button class="btn" id="saveNotify">ذخیرهٔ اعلان‌ها</button></div>
    <div class="hint" style="padding:2px 2px 6px">🧪 نمونهٔ زندهٔ هر پیام خودکار، فقط برای خودت فرستاده می‌شود:</div>
    <div style="display:flex;gap:8px;padding:0 0 10px">
      <button class="btn ghost" id="testWatch">🔔 واچ‌تاور</button>
      <button class="btn ghost" id="testCard">🖼 کارت</button>
      <button class="btn ghost" id="testDigest">📊 گزارش</button>
    </div>
  </div>

  <div class="h2">API کلیددار و وب‌هوک — U4 <span class="n">پیش‌فرض خاموش</span></div>
  <div class="card">
    <div class="row"><div><div class="k">کلید API</div><div class="hint mono" id="apiKeyView" style="direction:ltr;text-align:left;word-break:break-all">—</div></div>
      <div style="display:flex;gap:6px"><button class="mini" id="genApiBtn">تولید</button><button class="mini" id="copyApiBtn">کپی</button></div></div>
    <div class="row"><div><div class="k">وب‌هوک «ران جدید»</div><div class="hint">بعد از هر انتشار POST با امضای HMAC به این URL — خالی = خاموش</div></div>
      <input id="hookUrl" style="width:180px;text-align:left;direction:ltr" placeholder="https://example.com/hook"></div>
    <div style="display:flex;gap:8px;padding:10px 0 2px">
      <button class="btn" id="saveHook">ذخیرهٔ وب‌هوک</button>
      <button class="btn ghost" id="testHook">ارسال تست</button>
    </div>
    <div class="hint" style="padding:4px 2px 0">امضا: هدر <span class="mono">x-ariston-sign: sha256=HMAC(secret, body)</span> · «تولید» کلید و رمز را باهم عوض می‌کند · ساعات سکوت روی وب‌هوک اعمال نمی‌شود. کلیددار: <span class="mono">/api/v1/intel?key=…</span></div>
  </div>

  <div class="h2">قالب پیام‌های خودکار <span class="n">G2-4</span></div>
  <div class="card">
    <div class="hint" style="padding:8px 0 2px">خالی = متنِ داخلی پیش‌فرض. متغیرها: <span class="mono">{gold} {alive} {p50} {sources_ok} {sources_total} {bank_size} {hit} {streak} {date} {last_run}</span> — HTML مجازه.</div>
    <div class="k" style="padding:8px 0 2px">🔔 واچ‌تاور (پیام «تست جدید»)</div>
    <textarea id="tplWatch" style="min-height:64px" maxlength="900" placeholder="خالی = پیش‌فرض"></textarea>
    <div class="k" style="padding:8px 0 2px">🖼 کپشن کارت روزانه</div>
    <textarea id="tplCard" style="min-height:64px" maxlength="900" placeholder="خالی = پیش‌فرض"></textarea>
    <div class="k" style="padding:8px 0 2px">📊 گزارش دوره‌ای کانال</div>
    <textarea id="tplDigest" style="min-height:64px" maxlength="900" placeholder="خالی = پیش‌فرض"></textarea>
    <div class="k" style="padding:8px 0 2px">🗓 خلاصهٔ هفتگی شخصی <span class="n">متغیرها: {tried} {ok} {fail} {quota} {tier} {gold} {alive}</span></div>
    <textarea id="tplWeekly" style="min-height:64px" maxlength="900" placeholder="خالی = پیش‌فرض"></textarea>
    <div style="display:flex;gap:8px;padding:10px 0 10px">
      <button class="btn" id="saveTpl">💾 ذخیرهٔ قالب‌ها</button>
      <button class="btn ghost" id="resetTpl">↺ پاک‌کردن همه</button>
    </div>
    <div class="hint" style="padding:0 0 8px">بعد از ذخیره، «ارسال تستی» بالا نمونهٔ واقعیِ همین قالب‌ها را برای خودت می‌فرستد.</div>
  </div>

  <div class="h2">رفتار ربات</div>
  <div class="card">
    <div class="row"><div><div class="k">عضویت اجباری در کانال</div><div class="hint">بدون عضویت، ربات به کسی چیزی نمی‌ده</div></div><button class="tgl" id="tglJoin"></button></div>
    <div class="row"><div><div class="k">کانال اجباری</div><div class="hint tg" id="chUser">@Ariston_CH</div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="chUserIn" placeholder="@name" style="width:120px"><button class="tgl" id="saveCh">ثبت</button></div></div>
  </div>

  <div class="h2">دعوت دوستان</div>
  <div class="card">
    <div class="row"><div><div class="k">سطح‌بندی دعوت‌ها</div><div class="hint">🥉 برنزی ۰-۲ دعوت · 🥈 نقره‌ای ۳-۵ · 🥇 طلایی ۶+ — سهمیه با فرمول پله‌ای تا سقف بالا می‌رود (D10/U3)</div></div></div>
    <div class="row"><div><div class="k">سهمیهٔ پایه</div><div class="hint">هر کاربر تازه با /start</div></div><input id="refBase" type="number" min="5" max="50"></div>
    <div class="row"><div><div class="k">سقف سهمیه</div><div class="hint">با دعوت دوستان تا این عدد</div></div><input id="refCap" type="number" min="10" max="100"></div>
    <div style="padding:10px 0 8px"><button class="btn" id="saveRef">ذخیره</button></div>
  </div>

  <div class="h2">مدیرها <span class="n" id="admTotal"></span></div>
  <div class="card">
    <div id="admins"><div class="hint">—</div></div>
    <div class="row" style="border-bottom:none"><input id="admIn" placeholder="chat id" style="flex:1;text-align:left">
      <button class="tgl" id="admAdd">➕ افزودن</button></div>
    <div class="hint" style="padding-bottom:10px">دستورهای /panel و /freq فقط برای همین لیست توی منوی ربات نمایش داده می‌شه (دکمهٔ «همگام‌سازی منو» پایین صفحه).</div>
  </div>

  <div class="h2">پیام همگانی <span class="n" id="bcTotal"></span></div>
  <div class="card">
    <div style="padding:10px 0 4px"><textarea id="bcText" placeholder="متن پیام برای همهٔ کاربرها… (HTML مجازه، مثلاً <b>بولد</b>)"></textarea></div>
    <div class="bar" id="bcBarWrap" style="display:none"><i id="bcBar"></i></div>
    <div class="hint" id="bcStat" style="padding-bottom:6px"></div>
    <div style="display:flex;gap:8px;padding:4px 0 10px">
      <button class="btn" id="bcSend">📣 ارسال</button>
      <button class="btn warn" id="bcStop" style="flex:0 0 auto">⏹ توقف</button>
    </div>
  </div>

  <div class="h2">کاربرها <span class="n" id="uTotal"></span></div>
  <div class="card">
    <div class="row" style="border-bottom:none">
      <input id="uSearch" placeholder="جستجو: id یا اسم…" style="flex:1;text-align:left;direction:ltr">
      <button class="tgl" id="uFind">🔍 جستجو</button>
    </div>
    <div class="hint" id="uSearchStat" style="padding:0 2px 8px;display:none"></div>
  </div>
  <div class="card" id="users"><div class="hint">—</div></div>
  <div class="pager">
    <button class="btn ghost" id="uPrev">→ قبلی</button>
    <button class="btn ghost" id="uNext">بعدی ←</button>
  </div>

  <div class="card" id="uprof" style="display:none">
    <div class="row" style="border-bottom:none"><div class="k mono" id="upTitle">—</div><button class="mini" id="upClose">✕ بستن</button></div>
    <div class="hint" id="upBody" style="line-height:2;padding-bottom:6px">—</div>
    <div class="row"><div><div class="k">سهمیهٔ دستی</div><div class="hint">خالی = فرمول دعوت‌ها · ۰ تا ۵۰</div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="upQuota" type="number" min="0" max="50" style="width:70px"><button class="tgl" id="upQuotaSet">ثبت</button><button class="mini" id="upQuotaClear">پاک</button></div></div>
    <div style="display:flex;gap:8px;padding:10px 0 6px">
      <button class="btn warn" id="upBlock">🚫 مسدودسازی</button>
      <button class="btn ghost" id="upUnblock">♻️ رفع مسدودی</button>
    </div>
  </div>

  <div class="h2">بازنشانی گروهی <span class="n">G4-4</span></div>
  <div class="card">
    <div class="row"><div><div class="k">حذف همهٔ سهمیه‌های دستی</div><div class="hint">همه برگردند به فرمول دعوت — ترتیبی و بی‌وقفه</div></div>
      <button class="btn warn" id="qrBtn" style="flex:0 0 auto;padding:9px 14px">🧹 اجرا</button></div>
    <div class="bar" id="qrBarWrap" style="display:none"><i id="qrBar"></i></div>
    <div class="hint" id="qrStat" style="padding-bottom:4px"></div>
  </div>

  <div class="h2">گزارش فعالیت <span class="n" id="auTotal"></span></div>
  <div class="card">
    <div id="audit"><div class="hint">برای دیدن، دکمه را بزن</div></div>
    <div style="display:flex;gap:8px;padding:10px 0 8px">
      <button class="btn ghost" id="loadAudit">📜 بارگذاری</button>
    </div>
  </div>

  <div class="h2">رأی کاربرها <span class="n" id="fbTotal"></span></div>
  <div class="card">
    <div id="votes"><div class="hint">برای دیدن، دکمه را بزن</div></div>
    <div style="display:flex;gap:8px;padding:10px 0 8px">
      <button class="btn ghost" id="loadVotes">📊 بارگذاری</button>
      <button class="btn ghost" id="dlVotes">⬇ JSON</button>
    </div>
  </div>

  <div class="h2">نگهداری</div>
  <div class="card">
    <div class="row"><div><div class="k">پاک کردن کش داده‌ها</div><div class="hint">فایل‌های data برند و آمار از نو خونده می‌شن</div></div><button class="tgl" id="purgeBtn">🧹 پاک‌سازی</button></div>
    <div class="row"><div><div class="k">همگام‌سازی منوی ربات</div><div class="hint">دکمهٔ /panel فقط برای مدیرها ست می‌شه</div></div><button class="tgl" id="cmdsBtn">🔄 همگام</button></div>
    <div class="row"><div><div class="k">کانال فعلی</div><div class="hint tg" id="chId">—</div></div><div class="hint tg" id="bcStatus">—</div></div>
  </div>

  <div class="foot">ARISTON WORKER · D10.1 · V4.3</div>
</div>
<div class="toast" id="toast"></div>
<script>
var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
var initData = tg ? (tg.initData || '') : '';
function $(id){ return document.getElementById(id); }
var toastT = null;
function toast(m){ var el = $('toast'); el.textContent = m; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function(){ el.classList.remove('show'); }, 1800); }
function post(path, body){
  return fetch('/app/api/admin/' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ initData: initData }, body || {})) }).then(function(r){ return r.json(); }); }
function fmt(n){ return (n || 0).toLocaleString('en-US'); }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function drawTgl(el, on){ el.textContent = on ? '✅ روشن' : '⛔ خاموش';
  el.classList.toggle('on', !!on); el.classList.toggle('off', !on); }
function countUp(el, to){ var t0 = null, dur = 800;
  function step(ts){ if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / dur); k = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(to * k)); if (k < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step); }
var FREQS = [1, 2, 3, 6, 12, 24], S = null, uOffset = 0;
var P2_FACTORS = [1.5, 2, 3];
function draw(){
  drawTgl($('tglCard'), S.cfg.card_enabled !== false);
  drawTgl($('tglDigest'), S.cfg.digest_enabled !== false);
  drawTgl($('tglWatch'), S.cfg.watchtower_enabled !== false);
  drawTgl($('tglJoin'), S.cfg.force_join !== false);
  /* D11/U4-2 — keyed API + webhook */
  $('apiKeyView').textContent = S.cfg.api_key || 'تولید نشده';
  $('hookUrl').value = S.cfg.webhook_url || '';
  $('refBase').value = S.cfg.ref_base || 10; $('refCap').value = S.cfg.ref_cap || 20;
  $('chName').textContent = S.channel ? ('@' + S.channel.user + ' · id ' + S.channel.id) : '— هنوز ثبت نشده —';
  $('chUserIn').value = '@' + (S.cfg.channel_user || 'Ariston_CH');
  $('chId').textContent = S.channel ? ('id ' + S.channel.id) : '—';
  var ch = '';
  for (var i = 0; i < FREQS.length; i++){ var h = FREQS[i];
    ch += '<button class="chip' + (h === S.every_hours ? ' on' : '') + '" data-h="' + h + '">' + h + 'h</button>'; }
  $('freqChips').innerHTML = ch;
  Array.prototype.forEach.call($('freqChips').querySelectorAll('.chip'), function(b){
    b.onclick = function(){ set('every_hours', parseInt(b.getAttribute('data-h'), 10)); }; });
  drawStats();
  drawBank();
  drawAdmins();
  drawBc();
  drawPipe();
  drawPipe2();
  drawPipe3();
  drawNotify();
  drawTpl();
  drawCronAge();
}
/* D10.1/B2 — the status block owns its own draw so an open panel can refresh
   it silently every 2 minutes (the old panel stayed frozen on «70 minutes
   ago» while the bot had already announced the new run). No inputs touched. */
function drawStats(){
  if (S.stats){ var st = S.stats;
    $('stat').innerHTML = '<div><b data-n="' + st.gold + '">0</b><span>طلایی</span></div>' +
      '<div><b data-n="' + st.alive + '">0</b><span>سالم</span></div>' +
      '<div><b data-n="' + st.p50 + '">0</b><span>p50 ms</span></div>' +
      '<div><b data-n="' + st.sources_ok + '" data-suf="/' + fmt(st.sources_total) + '">0</b><span>منابع</span></div>';
    Array.prototype.forEach.call($('stat').querySelectorAll('b'), function(b){
      countUp(b, parseInt(b.getAttribute('data-n'), 10) || 0);
      var suf = b.getAttribute('data-suf'); if (suf) setTimeout(function(){ b.textContent += suf; }, 820);
    });
    /* D10.2/B2 — «آخرین تست» = when the snapshot was finalized (published_at),
       not when the run started; right after the bot's «تموم شد» the panel now
       reads minutes, not «run duration + queue drift» */
    try { $('statTime').textContent = 'آخرین تست: ' + new Date(runStamp(st)).toLocaleString('fa-IR'); }
    catch (e){ $('statTime').textContent = runStamp(st) || ''; }
    /* D8/P5 + D10.1/B2 — run-lag thresholds sized for the half-hour Actions cadence
       (30 min cron + ~15 min run + jitter → 50 min before «check Actions»);
       D10.2/B2: the lag counts from PUBLISH, so a normal cycle stays < 40 min */
    var lagMin = 0;
    try { lagMin = Math.max(0, (Date.now() - new Date(runStamp(st)).getTime()) / 60000); } catch (e2){}
    var rs = $('runStatus');
    if (lagMin < 12){ rs.textContent = '🟢 دور اخیراً تمام شد — همه‌چیز سر جاش'; rs.style.color = 'var(--ok)'; }
    else if (lagMin < 50){ rs.textContent = '🔵 دور بعدی احتمالاً در حال اجراست'; rs.style.color = 'var(--gold)'; }
    else { rs.textContent = '🔴 از آخرین دور ' + Math.round(lagMin) + ' دقیقه گذشته — Actions را چک کن'; rs.style.color = 'var(--bad)'; }
  } else { $('stat').innerHTML = '<div style="grid-column:1/-1;color:var(--dim);text-align:center;padding:6px 0">آمار در دسترس نیست</div>'; $('statTime').textContent = ''; $('runStatus').textContent = '—'; }
}
setInterval(function(){
  if (!S) return;
  post('state', {}).then(function(r){
    if (r && r.stats){ S.stats = r.stats; drawStats(); }
  }).catch(function(){});
}, 120000);
/* D8/P2 — pipeline knobs (cfg:pipeline) */
function drawPipe(){
  var p = S.pcfg || {};
  $('pTtl').value = p.bank_ttl_hours != null ? p.bank_ttl_hours : 28;
  $('pSuspect').value = p.suspect_after != null ? p.suspect_after : 2;
  $('pQuar').value = p.quarantine_after != null ? p.quarantine_after : 3;
  $('pQdays').value = p.quarantine_days != null ? p.quarantine_days : 7;
  $('pMinStreak').value = p.min_streak_priority != null ? p.min_streak_priority : 1;
  $('pRmin').value = p.rescue_min_streak != null ? p.rescue_min_streak : 5;
  $('pRmax').value = p.rescue_max != null ? p.rescue_max : 1500;
  drawTgl($('tglPass2'), p.pass2_enabled !== false);
  drawTgl($('tglRescue'), p.rescue_enabled !== false);
  drawTgl($('tglSkip'), p.skip_test === true);
  var chips = '';
  for (var i = 0; i < P2_FACTORS.length; i++){
    var f = P2_FACTORS[i];
    chips += '<button class="chip' + (Number(p.pass2_factor) === f ? ' on' : '') + '" data-f="' + f + '">' + f + '×</button>';
  }
  $('p2Chips').innerHTML = chips;
  Array.prototype.forEach.call($('p2Chips').querySelectorAll('.chip'), function(b){
    b.onclick = function(){ set('pass2_factor', parseFloat(b.getAttribute('data-f'))); }; });
  $('fullScanBtn').textContent = (p.force_full_scan === true) ? '⏳ در صف اجرا…' : '🚀 اجرا';
}
/* D8/P6 — notifications & quiet hours (cfg:admin) */
function drawNotify(){
  $('wtCap').value = S.cfg.watchtower_cap != null ? S.cfg.watchtower_cap : 20;
  $('qStart').value = S.cfg.quiet_start != null ? S.cfg.quiet_start : 2;
  $('qEnd').value = S.cfg.quiet_end != null ? S.cfg.quiet_end : 8;
  drawTgl($('tglQuiet'), S.cfg.quiet_enabled === true);
}
/* D9/G2 — phase 2: remark template · sub caps · export selection · smart TTL (cfg:pipeline) */
function drawPipe2(){
  var p = S.pcfg || {};
  $('pRemark').value = p.remark_tpl || 'Ariston{-GOLD}-{ping}ms';
  $('pSubMax').value = p.sub_max_lines != null ? p.sub_max_lines : 300;
  $('pSubMin').value = p.sub_min_op_lines != null ? p.sub_min_op_lines : 10;
  drawTgl($('tglExpMih'), p.exports_mihomo !== false);
  drawTgl($('tglExpSb'), p.exports_singbox !== false);
  drawTgl($('tglExpB64'), p.exports_base64 !== false);
  drawTgl($('tglSmartTtl'), p.smart_ttl !== false);
}
/* D9/G2-4 — editable message templates (cfg:templates) */
function drawTpl(){
  var t = S.tpl || {};
  $('tplWatch').value = t.watchtower || '';
  $('tplCard').value = t.card || '';
  $('tplDigest').value = t.digest || '';
  $('tplWeekly').value = t.weekly || '';
}
/* D10/G5 — phase 3: filters & strictness (cfg:pipeline) */
var STRICT_LEVELS = [0, 1, 2], STRICT_LABELS = ['۰ عادی', '۱ سخت‌گیر', '۲ خیلی سخت'];
function drawPipe3(){
  var p = S.pcfg || {};
  $('pGold').value = p.gold_min != null ? p.gold_min : 80;
  $('pSilver').value = p.silver_min != null ? p.silver_min : 55;
  $('pProto').value = p.proto_allow || '';
  $('pDeny').value = p.deny_kw || '';
  $('pAllow').value = p.allow_kw || '';
  $('pGeoA').value = p.geo_allow || '';
  $('pGeoD').value = p.geo_deny || '';
  var st = parseInt(p.strictness, 10) || 0;
  var chips = '';
  for (var i = 0; i < STRICT_LEVELS.length; i++){
    var lv = STRICT_LEVELS[i];
    chips += '<button class="chip' + (st === lv ? ' on' : '') + '" data-s="' + lv + '">' + STRICT_LABELS[i] + '</button>';
  }
  $('strictChips').innerHTML = chips;
  Array.prototype.forEach.call($('strictChips').querySelectorAll('.chip'), function(b){
    b.onclick = function(){ set('strictness', parseInt(b.getAttribute('data-s'), 10)); }; });
}
/* D10/G7 — last cron tick age next to the health heading */
function drawCronAge(){
  var el = $('cronAge');
  if (!S.cron_last_tick){ el.textContent = '· کرون هنوز تیک ثبت نکرده'; return; }
  var age = Math.round((Date.now() - new Date(S.cron_last_tick).getTime()) / 60000);
  el.textContent = '· آخرین تیک کرون ' + (isFinite(age) ? age : '؟') + ' دقیقه پیش';
  el.style.color = (isFinite(age) && age > 45) ? 'var(--bad)' : '';
}
function drawBank(){
  var b = S.bank, g = $('bankGrid'), src = $('bankSrc'), p2 = $('bankPass2'), fl = $('bankFlag');
  if (!b || b.size == null){ g.innerHTML = '<div style="grid-column:1/-1;color:var(--dim);text-align:center;padding:8px 0">بانک هنوز شکل نگرفته — بعد از دور بعدی پایپ‌لاین پر می‌شه</div>';
    src.innerHTML = ''; p2.textContent = ''; fl.textContent = ''; return; }
  fl.textContent = b.full_scan ? '· اسکن کامل شنبه' : '';
  var tiles = [
    [fmt(b.size), 'خوش‌سابقه'],
    [b.hit_rate != null ? b.hit_rate + '%' : '—', 'نرخ بازگشت'],
    [(b.avg_streak != null ? b.avg_streak : '—') + 'x', 'میانگین سابقه'],
    [(b.best_streak != null ? b.best_streak : '—') + 'x', 'بهترین سابقه'],
    [b.avg_ms != null ? fmt(b.avg_ms) + 'ms' : '—', 'میانگین پینگ بانک'],
    [(b.alive_delta != null ? (b.alive_delta > 0 ? '+' : '') + fmt(b.alive_delta) : '—'), 'دلتای سالم‌ها'],
  ];
  g.innerHTML = tiles.map(function(t){
    return '<div><b>' + t[0] + '</b><span>' + t[1] + '</span></div>'; }).join('');
  var bs = b.sources || {};
  src.innerHTML =
    '<span class="sdot h"><i></i>' + fmt(bs.healthy || 0) + ' سالم</span>' +
    '<span class="sdot s"><i></i>' + fmt(bs.suspect || 0) + ' مشکوک</span>' +
    '<span class="sdot q"><i></i>' + fmt(bs.quarantined || 0) + ' قرنطینه</span>' +
    (bs.skipped_this_run ? '<span class="sdot"><i></i>' + fmt(bs.skipped_this_run) + ' کنارگذاشته</span>' : '');
  var pp = b.pass2 || {};
  p2.textContent = 'دور دوم: ' + fmt(pp.attempted || 0) + ' تلاش · ' + fmt(pp.rescued || 0) + ' نجات' +
    (pp.timeout_s ? ' · تایم‌اوت ' + pp.timeout_s + 's' : '');
  /* D8/E — resurrection telemetry */
  var rc = b.rescue;
  var rEl = $('bankRescue');
  if (rc){
    rEl.style.display = 'block';
    rEl.textContent = '🛟 احیای بانک: ' + fmt(rc.picked || 0) + ' از ' + fmt(rc.candidates || 0) + ' کاندید تست شد' +
      (rc.alive != null ? ' · ' + fmt(rc.alive) + ' زنده برگشت' : '');
  } else rEl.style.display = 'none';
}
function drawAdmins(){
  var list = S.admins || [];
  $('admTotal').textContent = '· ' + list.length + ' نفر';
  var h = '';
  for (var i = 0; i < list.length; i++){ var a = list[i];
    h += '<div class="u"><span class="mono">' + a.id + (a.owner ? ' 👑 <span style="color:var(--dim);font-family:inherit">مالک</span>' : '') + '</span>' +
      (a.owner ? '<span></span>' : '<button class="mini" data-id="' + a.id + '">حذف</button>') + '</div>'; }
  $('admins').innerHTML = h || '<div class="hint">مدیری ثبت نشده</div>';
  Array.prototype.forEach.call($('admins').querySelectorAll('button.mini'), function(b){
    b.onclick = function(){ adminOp('remove', b.getAttribute('data-id')); }; });
}
function drawBc(){
  var bc = S.bc || {};
  var total = bc.total || 0, cur = bc.cursor || 0;
  $('bcTotal').textContent = total ? '· ' + fmt(total) + ' کاربر' : '';
  if (total){
    $('bcBarWrap').style.display = 'block';
    $('bcBar').style.width = Math.round(100 * cur / total) + '%';
    $('bcStat').textContent = (bc.active ? 'در حال ارسال… ' : '') + fmt(cur) + ' از ' + fmt(total) +
      (bc.fails ? ' · ' + fmt(bc.fails) + ' خطا' : '');
  } else {
    $('bcBarWrap').style.display = 'none';
    $('bcStat').textContent = '';
  }
}
function set(key, value){
  post('set', { key: key, value: value }).then(function(r){
    if (r && r.ok){ toast('ذخیره شد ✓');
      if (key === 'every_hours') S.every_hours = r.value;
      else if (key in S.cfg) S.cfg[key] = r.value;
      else if (S.pcfg) S.pcfg[key] = r.value;
      draw(); } else toast('خطا — دوباره بزن');
  }).catch(function(){ toast('خطا'); });
}
/* D8/P7 — two-step confirm: first tap arms the button for 3s, second tap fires */
function confirm2(btn, fn){
  if (btn._armed){ btn._armed = false; clearTimeout(btn._t); btn.textContent = btn._label; fn(); return; }
  btn._armed = true; btn._label = btn.textContent; btn.textContent = '⚠️ مطمئنی؟ دوباره بزن';
  btn._t = setTimeout(function(){ btn._armed = false; btn.textContent = btn._label; }, 3000);
}
function loadUsers(){
  post('users', { offset: uOffset, limit: 30 }).then(function(d){
    if (!d || d.error) return;
    $('uTotal').textContent = '· ' + fmt(d.total) + ' نفر';
    if (!d.items.length){ $('users').innerHTML = '<div class="hint">هنوز کاربری ثبت نشده</div>'; return; }
    var h = '';
    for (var i = 0; i < d.items.length; i++){ var u = d.items[i];
      h += '<div class="u" data-id="' + u.chat_id + '" style="cursor:pointer" onclick="openProfile(\\'' + u.chat_id + '\\')"><span>' +
        (u.blocked ? '🚫 ' : '') + (u.quota_ovr != null ? '🎯 ' : '') + (u.name ? '✍️ ' + u.name : (u.tg || '👤')) +
        ' <span style="color:var(--dim);font-family:var(--mono);font-size:10.5px">' + u.lang + '</span></span>' +
        '<span style="color:var(--dim);font-family:var(--mono);font-size:10.5px;direction:ltr">' + u.chat_id + ' · ' + u.isp + ' · 👥' + u.refs +
        (u.quota_ovr != null ? ' · ⚡' + u.quota_ovr : '') + '</span></div>'; }
    $('users').innerHTML = h;
  }).catch(function(){});
}
/* ─── D9/G4 — user search · profile · block · quota · group reset · audit ─── */
var upId = null;
function openProfile(id){
  post('user', { id: id }).then(function(p){
    if (!p || p.error){ toast(p && p.error === 'no_user' ? 'کاربر پیدا نشد' : 'خطا'); return; }
    upId = String(p.chat_id);
    $('upTitle').textContent = '👤 ' + upId;
    $('upBody').innerHTML =
      'نام: ' + (p.name ? esc(p.name) : '—') + ' · یوزرنیم: ' + (p.tg ? '@' + esc(p.tg) : '—') + ' · زبان: ' + p.lang +
      '<br>اپراتور: ' + esc(p.isp) + ' · اپ: ' + esc(p.client) + ' · از: ' + esc(p.created || '—') +
      '<br>سهمیه: <b>' + p.quota + '</b>' + (p.quota_ovr != null ? ' (دستی ' + p.quota_ovr + ')' : ' (فرمول دعوت)') +
      ' · دعوت‌ها: ' + p.ref_count + ' · چرخش: ' + (p.rotation === 'run' ? 'هر ران' : 'روزانه') + ' · حالت ساب: ' + p.sub_mode +
      '<br>✅ ' + p.marks_ok + ' · ❌ ' + p.marks_fail + ' · ⭐ ' + p.favs + ' · 🕘 ' + p.hist +
      (p.token ? '<br><span class="mono" style="font-size:10px">sub: ' + p.token.slice(0, 8) + '…</span>' : '') +
      (p.blocked ? '<br><span style="color:var(--bad)">🚫 مسدود' + (p.blocked.ts ? ' · ' + esc(p.blocked.ts).slice(0, 10) : '') + '</span>' : '');
    $('upQuota').value = p.quota_ovr != null ? p.quota_ovr : '';
    $('upBlock').style.display = p.blocked ? 'none' : '';
    $('upUnblock').style.display = p.blocked ? '' : 'none';
    $('uprof').style.display = 'block';
    try { $('uprof').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2){}
  }).catch(function(){ toast('خطا'); });
}
$('upClose').onclick = function(){ $('uprof').style.display = 'none'; upId = null; };
$('upBlock').onclick = function(){
  if (!upId) return;
  confirm2($('upBlock'), function(){
    post('user_block', { id: upId, on: true }).then(function(r){
      if (r && r.ok){ toast('مسدود شد 🚫'); openProfile(upId); loadUsers(); } else toast((r && r.error === 'is_admin') ? 'مدیر مسدود نمی‌شه' : 'خطا');
    }).catch(function(){ toast('خطا'); });
  });
};
$('upUnblock').onclick = function(){
  if (!upId) return;
  post('user_block', { id: upId, on: false }).then(function(r){
    if (r && r.ok){ toast('رفع مسدودی ✓'); openProfile(upId); loadUsers(); } else toast('خطا');
  }).catch(function(){ toast('خطا'); });
};
$('upQuotaSet').onclick = function(){
  if (!upId) return;
  var v = parseInt($('upQuota').value, 10);
  if (!isFinite(v)){ toast('یه عدد بین ۰ تا ۵۰ بده'); return; }
  post('user_quota', { id: upId, value: v }).then(function(r){
    if (r && r.ok){ toast('ثبت شد ✓'); openProfile(upId); loadUsers(); } else toast('خطا');
  }).catch(function(){ toast('خطا'); });
};
$('upQuotaClear').onclick = function(){
  if (!upId) return;
  post('user_quota', { id: upId, value: null }).then(function(r){
    if (r && r.ok){ toast('برگشت به فرمول دعوت ✓'); openProfile(upId); loadUsers(); } else toast('خطا');
  }).catch(function(){ toast('خطا'); });
};
/* G4-1 — search: numeric = id match, text = cursor scan (auto-continues) */
var uSearchTimer = null;
function uSearchRun(q, scanFrom, found, scanned){
  post('users', { q: q, scan_from: scanFrom, limit: 30 }).then(function(d){
    if (!d || d.error){ toast('خطا'); return; }
    found = (found || []).concat(d.items || []);
    scanned = scanned || 0;
    if (d.scanned_to != null) scanned = Math.max(scanned, d.total - (d.scanned_to || 0));
    $('uTotal').textContent = '· ' + fmt(found.length) + ' نتیجه';
    $('uSearchStat').style.display = 'block';
    $('uSearchStat').textContent = 'جستجو… ' + fmt(scanned) + ' بررسی‌شده';
    renderUserHits(found);
    if (d.next && found.length < 50){
      uSearchTimer = setTimeout(function(){ uSearchRun(q, d.scanned_to, found, scanned); }, 250);
    } else {
      $('uSearchStat').textContent = 'تمام — ' + fmt(found.length) + ' نتیجه از ' + fmt(scanned) + ' بررسی';
      if (!found.length) $('users').innerHTML = '<div class="hint">چیزی پیدا نشد</div>';
    }
  }).catch(function(){ toast('خطا'); });
}
function renderUserHits(items){
  if (!items.length) return;
  var h = '';
  for (var i = 0; i < items.length; i++){ var u = items[i];
    h += '<div class="u" style="cursor:pointer" onclick="openProfile(\\'' + u.chat_id + '\\')"><span>' +
      (u.blocked ? '🚫 ' : '') + (u.name ? '✍️ ' + u.name : (u.tg || '👤')) +
      '</span><span style="color:var(--dim);font-family:var(--mono);font-size:10.5px;direction:ltr">' + u.chat_id + ' · ' + u.isp + '</span></div>'; }
  $('users').innerHTML = h;
}
$('uFind').onclick = function(){
  clearTimeout(uSearchTimer);
  var q = ($('uSearch').value || '').trim().toLowerCase();
  if (!q){ $('uSearchStat').style.display = 'none'; uOffset = 0; loadUsers(); return; }
  toast('دارم می‌گردم…');
  uSearchRun(q, null, [], 0);
};
/* G4-4 — group quota reset (chunked like the broadcast) */
var qrTimer = null;
function qrStep(op){
  return post('quota_reset', { op: op || 'step' }).then(function(r){
    if (!r || !r.ok){ toast('خطا'); return; }
    if (r.total){
      $('qrBarWrap').style.display = 'block';
      $('qrBar').style.width = Math.round(100 * (r.cursor || 0) / r.total) + '%';
      $('qrStat').textContent = (r.active ? 'در حال اجرا… ' : 'تمام — ') + fmt(r.cursor) + ' از ' + fmt(r.total) +
        (r.cleared ? ' · ' + fmt(r.cleared) + ' سهمیهٔ دستی پاک شد' : '');
    }
    if (r.active){ qrTimer = setTimeout(function(){ qrStep('step'); }, 350); }
    else if (op !== 'status' && op !== 'cancel'){ toast('بازنشانی گروهی تمام شد ✓'); loadUsers(); }
  }).catch(function(){ toast('خطا'); });
}
$('qrBtn').onclick = function(){
  clearTimeout(qrTimer);
  confirm2($('qrBtn'), function(){ toast('شروع…'); qrStep('start'); });
};
/* G4-5 — audit log */
$('loadAudit').onclick = function(){ toast('دارم میارم…');
  post('audit', { limit: 30 }).then(function(d){
    if (!d || !d.ok){ toast('خطا'); return; }
    $('auTotal').textContent = '· ' + fmt(d.total) + ' رویداد';
    var h = '';
    for (var i = 0; i < d.items.length; i++){ var a = d.items[i];
      h += '<div class="u"><span style="font-family:var(--mono);direction:ltr;font-size:10.5px">' + esc((a.ts || '').slice(5, 16).replace('T', ' ')) + ' · ' + esc(a.act) + '</span>' +
        '<span style="color:var(--dim);font-family:var(--mono);font-size:10.5px;direction:ltr">' + (a.id || '—') + (a.d ? ' · ' + esc(String(a.d).slice(0, 24)) : '') + '</span></div>'; }
    $('audit').innerHTML = h || '<div class="hint">هنوز رویدادی ثبت نشده</div>';
    toast('آماده ✓');
  }).catch(function(){ toast('خطا'); });
};
/* G2-4 — template save / reset */
$('saveTpl').onclick = function(){
  toast('دارم ذخیره می‌کنم…');
  post('templates', { watchtower: $('tplWatch').value, card: $('tplCard').value, digest: $('tplDigest').value, weekly: $('tplWeekly').value }).then(function(r){
    if (r && r.ok){ S.tpl = r.tpl; drawTpl(); toast('قالب‌ها ذخیره شد ✓ — حالا «ارسال تستی» بزن'); } else toast('خطا');
  }).catch(function(){ toast('خطا'); });
};
$('resetTpl').onclick = function(){
  $('tplWatch').value = ''; $('tplCard').value = ''; $('tplDigest').value = ''; $('tplWeekly').value = '';
  post('templates', { watchtower: '', card: '', digest: '', weekly: '' }).then(function(r){
    if (r && r.ok){ S.tpl = r.tpl; toast('برگشت به متن پیش‌فرض ✓'); } else toast('خطا');
  }).catch(function(){ toast('خطا'); });
};
/* D7 — crowd votes: ranked view + raw JSON export */
function drawVotes(items){
  var el = $('votes');
  if (!items || !items.length){ el.innerHTML = '<div class="hint">هنوز رأیی ثبت نشده</div>'; return; }
  var h = '';
  for (var i = 0; i < items.length; i++){ var v = items[i];
    h += '<div class="u"><span style="font-family:var(--mono);direction:ltr;font-size:11px">' + v.hash + '</span>' +
      '<span style="font-family:var(--mono);direction:ltr">👍 ' + v.up + ' · 👎 ' + v.down + '</span></div>'; }
  el.innerHTML = h;
}
$('loadVotes').onclick = function(){ toast('دارم میارم…');
  post('feedback', {}).then(function(d){ if (d && d.ok){
    $('fbTotal').textContent = '· ' + fmt(d.total) + ' کانفیگ';
    drawVotes(d.items); toast('آماده ✓'); } else toast('خطا'); }).catch(function(){ toast('خطا'); }); };
$('dlVotes').onclick = function(){
  post('feedback', { raw: true }).then(function(d){ if (d && d.ok){
    try {
      var blob = new Blob([JSON.stringify(d.items || [], null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'ariston-feedback.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('دانلود شد ✓');
    } catch (e){ toast('خطا'); }
  } else toast('خطا'); }).catch(function(){ toast('خطا'); }); };
/* D7 — admins management (two-step confirm on remove) */
function adminOp(op, id){
  if (op === 'add'){
    id = String($('admIn').value || '').trim();
    if (!/^\d{3,20}$/.test(id)){ toast('یه chat id عددی بفرست'); return; }
  }
  var run = function(){
    post('admins', { op: op, id: id }).then(function(r){
      if (r && r.ok){ toast(op === 'add' ? 'اضافه شد ✓' : 'حذف شد ✓');
        if (op === 'add') $('admIn').value = '';
        S.admins = r.admins || S.admins; drawAdmins(); }
      else toast((r && r.error === 'owner') ? 'مالک حذف نمی‌شه' : 'خطا');
    }).catch(function(){ toast('خطا'); });
  };
  if (op === 'remove'){
    var btns = $('admins').querySelectorAll('button.mini');
    var btn = null;
    for (var i = 0; i < btns.length; i++) if (btns[i].getAttribute('data-id') === String(id)) btn = btns[i];
    if (btn) confirm2(btn, run); else run();
  } else run();
}
$('admAdd').onclick = function(){ adminOp('add'); };
/* D7 — broadcast: chunked sender with live progress */
var bcTimer = null;
function bcStep(op){
  return post('broadcast', { op: op || 'step', text: op === 'start' ? $('bcText').value : undefined })
    .then(function(r){
      if (!r || !r.ok){ toast((r && r.error === 'big') ? 'متن طولانیه (حداکثر ۲۰۰۰ حرف)' : 'خطا'); return; }
      S.bc = r; drawBc();
      if (r.remaining > 0){ bcTimer = setTimeout(function(){ bcStep('step'); }, 400); }
      else if (op !== 'status' && op !== 'cancel'){ toast('پیام همگانی تمام شد ✓'); $('bcText').value = ''; }
    }).catch(function(){ toast('خطا'); });
}
$('bcSend').onclick = function(){
  if (!($('bcText').value || '').trim()){ toast('متن پیام رو بنویس'); return; }
  if (!confirm('پیام برای همهٔ کاربرها فرستاده بشه؟')) return;
  clearTimeout(bcTimer);
  toast('شروع ارسال…');
  bcStep('start');
};
$('bcStop').onclick = function(){
  clearTimeout(bcTimer);
  post('broadcast', { op: 'cancel' }).then(function(r){
    if (r && r.ok){ S.bc = r; drawBc(); toast('متوقف شد'); } else toast('خطا'); }).catch(function(){ toast('خطا'); });
};
/* D7 — maintenance */
$('purgeBtn').onclick = function(){
  confirm2($('purgeBtn'), function(){
    toast('دارم پاک می‌کنم…');
    post('purge', {}).then(function(r){
      toast(r && r.ok ? fmt(r.purged) + ' کلید کش پاک شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); });
  });
};
$('cmdsBtn').onclick = function(){
  toast('دارم همگام می‌کنم…');
  post('sync_cmds', {}).then(function(r){
    toast(r && r.ok ? 'منوی ربات برای مدیرها ست شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); });
};
$('uPrev').onclick = function(){ uOffset = Math.max(0, uOffset - 30); loadUsers(); };
$('uNext').onclick = function(){ uOffset += 30; loadUsers(); };
$('tglCard').onclick = function(){ if (S) set('card_enabled', S.cfg.card_enabled === false); };
$('tglDigest').onclick = function(){ if (S) set('digest_enabled', S.cfg.digest_enabled === false); };
$('tglWatch').onclick = function(){ if (S) set('watchtower_enabled', S.cfg.watchtower_enabled === false); };
$('tglJoin').onclick = function(){ if (S) set('force_join', S.cfg.force_join === false); };
/* D11/U4-2 — keyed API + «new run» webhook */
$('genApiBtn').onclick = function(){ post('gen_api', {}).then(function(r){
  if (r && r.ok){ S.cfg.api_key = r.api_key; S.cfg.webhook_secret = r.webhook_secret; draw(); toast('کلید و رمز وب‌هوک ساخته شد ✓'); }
  else toast('خطا در تولید کلید'); }).catch(function(){ toast('خطا در تولید کلید'); }); };
$('copyApiBtn').onclick = function(){ var k = S && S.cfg && S.cfg.api_key; if (!k) return toast('اول کلید بساز');
  try { navigator.clipboard.writeText(k).then(function(){ toast('کلید کپی شد ✓'); }, function(){ toast('کپی نشد'); }); } catch (e){ toast('کپی نشد'); } };
$('saveHook').onclick = function(){ if (!S) return; var u = $('hookUrl').value.trim();
  set('webhook_url', u); toast(u ? 'وب‌هوک ذخیره شد — از ران بعد فعال می‌شود' : 'وب‌هوک خاموش شد'); };
$('testHook').onclick = function(){ post('test_webhook', {}).then(function(r){
  if (r && r.ok && r.status) toast('وب‌هوک پاسخ داد: HTTP ' + r.status + ' ✓');
  else if (r && r.status) toast('پاسخ HTTP ' + r.status + ' — مقصد را چک کن');
  else if (r && r.error === 'no_webhook') toast('اول URL وب‌هوک را ذخیره کن');
  else toast('وب‌هوک جواب نداد — URL را چک کن'); }).catch(function(){ toast('وب‌هوک جواب نداد'); }); };
$('saveRef').onclick = function(){ if (!S) return;
  set('ref_base', parseInt($('refBase').value, 10));
  setTimeout(function(){ set('ref_cap', parseInt($('refCap').value, 10)); }, 350); };
$('saveCh').onclick = function(){ if (S) set('channel_user', $('chUserIn').value); };
$('postCard').onclick = function(){ toast('دارم می‌فرستم…');
  post('post_now', { kind: 'card' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
$('postDigest').onclick = function(){ toast('دارم می‌فرستم…');
  post('post_now', { kind: 'digest' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
/* ─── D8/P — phase 1 bindings: pipeline · notifications · test-send · confirm2 ─── */
$('savePipe').onclick = function(){ if (!S) return;
  var keys = [['bank_ttl_hours','pTtl'], ['suspect_after','pSuspect'], ['quarantine_after','pQuar'],
              ['quarantine_days','pQdays'], ['min_streak_priority','pMinStreak'],
              ['rescue_min_streak','pRmin'], ['rescue_max','pRmax']];
  toast('دارم ذخیره می‌کنم…');
  keys.forEach(function(k, idx){
    setTimeout(function(){ set(k[0], parseFloat($(k[1]).value)); }, idx * 350);
  });
};
/* ─── D9/G2 — phase 2 bindings ─── */
$('savePipe2').onclick = function(){ if (!S) return;
  var tpl = ($('pRemark').value || '').trim();
  if (tpl && tpl.length < 3){ toast('قالب ریمارک خیلی کوتاهه'); return; }
  toast('دارم ذخیره می‌کنم…');
  var keys = [['sub_max_lines','pSubMax'], ['sub_min_op_lines','pSubMin']];
  keys.forEach(function(k, idx){
    setTimeout(function(){ set(k[0], parseFloat($(k[1]).value)); }, idx * 350);
  });
  setTimeout(function(){ set('remark_tpl', tpl || 'Ariston{-GOLD}-{ping}ms'); }, 700);
};
$('tglExpMih').onclick = function(){ if (S) set('exports_mihomo', S.pcfg.exports_mihomo === false); };
$('tglExpSb').onclick = function(){ if (S) set('exports_singbox', S.pcfg.exports_singbox === false); };
/* ─── D10 — phase 3 bindings: filters · health · backup · KV browser · cleanup ─── */
$('savePipe3').onclick = function(){ if (!S) return;
  var g = parseInt($('pGold').value, 10), sv = parseInt($('pSilver').value, 10);
  if (isFinite(g) && isFinite(sv) && sv >= g){ toast('آستانهٔ نقره‌ای باید کمتر از طلایی باشد'); return; }
  toast('دارم ذخیره می‌کنم…');
  [['gold_min','pGold'], ['silver_min','pSilver']].forEach(function(k, idx){
    setTimeout(function(){ set(k[0], parseInt($(k[1]).value, 10)); }, idx * 350);
  });
  setTimeout(function(){ set('proto_allow', $('pProto').value); }, 700);
  setTimeout(function(){ set('deny_kw', $('pDeny').value); }, 1050);
  setTimeout(function(){ set('allow_kw', $('pAllow').value); }, 1400);
  setTimeout(function(){ set('geo_allow', $('pGeoA').value); }, 1750);
  setTimeout(function(){ set('geo_deny', $('pGeoD').value); }, 2100);
};
$('tglWeekly').onclick = function(){ if (S) set('weekly_enabled', S.cfg.weekly_enabled === false); };
/* G7 — one-click health test */
$('healthBtn').onclick = function(){
  toast('دارم سلامت را می‌سنجم…');
  post('health', {}).then(function(r){
    if (!r || !r.ok){ toast('خطا'); return; }
    var out = $('healthOut');
    var icons = { kv: '🗃', telegram: '✈️', channel: '📢', webhook: '🪝', data: '📦', cron: '⏰' };
    var h = '';
    for (var i = 0; i < r.checks.length; i++){ var c = r.checks[i];
      h += '<div class="u"><span>' + (icons[c.k] || '·') + ' ' + c.k + (c.ok ? ' <span style="color:var(--ok)">سبز</span>' : ' <span style="color:var(--bad)">قرمز</span>') + '</span>' +
        '<span style="font-family:var(--mono);direction:ltr;font-size:10px;color:var(--dim)">' + c.ms + 'ms · ' + esc(String(c.detail).slice(0, 60)) + '</span></div>'; }
    out.innerHTML = h;
    out.style.display = 'block';
    $('errN').textContent = r.errors.length ? '۱۰ خطای اخیر · ' + fmt(r.errors.length) + ' ثبت‌شده' : 'حلقهٔ خطاها خالی است';
    toast(r.checks.every(function(c){ return c.ok; }) ? 'همه‌چیز سبز ✓' : 'بعضی چک‌ها قرمزند ⚠');
  }).catch(function(){ toast('خطا'); });
};
$('errBtn').onclick = function(){
  post('health', {}).then(function(r){
    if (!r || !r.ok){ toast('خطا'); return; }
    var out = $('errOut');
    if (!r.errors.length){ out.innerHTML = '<div class="hint">هیچ خطایی ثبت نشده — عالی</div>'; }
    else { var h = '';
      for (var i = 0; i < r.errors.length; i++){ var e = r.errors[i];
        h += '<div class="u"><span style="font-family:var(--mono);direction:ltr;font-size:10.5px">' + esc((e.ts || '').slice(5, 16).replace('T', ' ')) + ' · ' + esc(e.w || '') + '</span>' +
          '<span style="color:var(--dim);font-size:10.5px;direction:ltr;font-family:var(--mono)">' + esc(String(e.m || '').slice(0, 48)) + '</span></div>'; }
      out.innerHTML = h; }
    out.style.display = 'block';
  }).catch(function(){ toast('خطا'); });
};
/* G6 — settings export / restore */
$('expBtn').onclick = function(){
  post('settings_export', {}).then(function(d){
    try {
      var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'ariston-settings.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('دانلود شد ✓');
    } catch (e){ toast('خطا'); }
  }).catch(function(){ toast('خطا'); });
};
$('impBtn').onclick = function(){ $('impFile').click(); };
$('impFile').onchange = function(){
  var f = $('impFile').files && $('impFile').files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    var obj = null;
    try { obj = JSON.parse(String(rd.result || '{}')); } catch (e){ toast('فایل JSON نیست'); return; }
    confirm2($('impBtn'), function(){
      toast('دارم بازگردانی می‌کنم…');
      post('settings_import', { settings: obj }).then(function(r){
        if (r && r.ok){ toast('اعمال شد: ' + fmt(r.applied) + ' کلید · ' + fmt(r.skipped) + ' ردشد'); bootPanel(); }
        else toast('خطا');
      }).catch(function(){ toast('خطا'); });
    });
  };
  rd.readAsText(f);
  $('impFile').value = '';
};
/* G6 — read-only KV browser (click again = next page when the prefix is unchanged) */
var kvCursor = null, kvLastPrefix = null;
function kvShow(prefix, cur){
  post('kv', { prefix: prefix, cursor: cur || '' }).then(function(r){
    if (!r || !r.ok){ toast((r && r.error === 'bad_prefix') ? 'پیشوند نامعتبر' : 'خطا'); return; }
    var out = $('kvOut');
    var h = out.style.display === 'block' ? (cur ? out.innerHTML : '') : '';
    for (var i = 0; i < r.items.length; i++){ var it = r.items[i];
      h += '<div class="u"><span style="font-family:var(--mono);direction:ltr;font-size:10.5px">' + esc(it.key) + (it.pol === 'meta' ? ' <span style="color:var(--dim)">(محافظت‌شده)</span>' : '') + '</span>' +
        '<span style="color:var(--dim);font-family:var(--mono);font-size:10px;direction:ltr">' + (it.value != null ? esc(String(it.value).slice(0, 44)) : (it.size != null ? fmt(it.size) + 'B' : '—')) + '</span></div>'; }
    if (!r.items.length && !cur) h += '<div class="hint">چیزی با این پیشوند پیدا نشد</div>';
    out.innerHTML = h;
    out.style.display = 'block';
    kvCursor = r.cursor;
    if (r.cursor) toast('ادامه دارد — دوباره بزن');
    else toast('تمام ✓');
  }).catch(function(){ toast('خطا'); });
}
$('kvGo').onclick = function(){
  var pfx = ($('kvPrefix').value || '').trim();
  if (pfx !== kvLastPrefix){ kvCursor = null; kvLastPrefix = pfx; }
  kvShow(pfx, kvCursor);
};
/* G6 — selective cleanup (fixed categories, two-step confirm) */
var CLEANUP_LABELS = [['errlog', '🧯 حلقهٔ خطاها'], ['audit', '📜 گزارش فعالیت'], ['favdead', '🪦 گاردهای مرگ فاو'], ['wkguards', '🗓 گاردهای هفتگی'], ['cursors', '📍 نشانگرهای اسکن'], ['oneshots', '🎯 فلگ‌های یک‌بارمصرف']];
function drawCleanup(){
  var h = '';
  for (var i = 0; i < CLEANUP_LABELS.length; i++){
    h += '<button class="mini" data-k="' + CLEANUP_LABELS[i][0] + '">' + CLEANUP_LABELS[i][1] + '</button>';
  }
  $('cleanChips').innerHTML = h;
  Array.prototype.forEach.call($('cleanChips').querySelectorAll('button.mini'), function(b){
    b.onclick = function(){
      confirm2(b, function(){
        post('cleanup', { kind: b.getAttribute('data-k') }).then(function(r){
          if (r && r.ok){ toast(r.done ? fmt(r.deleted) + ' کلید پاک شد ✓' : fmt(r.deleted) + ' پاک شد — ادامه دارد، دوباره بزن'); }
          else toast((r && r.error === 'bad_kind') ? 'نوع نامعتبر' : 'خطا');
        }).catch(function(){ toast('خطا'); });
      });
    };
  });
}
drawCleanup();
$('tglExpB64').onclick = function(){ if (S) set('exports_base64', S.pcfg.exports_base64 === false); };
$('tglSmartTtl').onclick = function(){ if (S) set('smart_ttl', S.pcfg.smart_ttl === false); };
$('tglPass2').onclick = function(){ if (S) set('pass2_enabled', S.pcfg.pass2_enabled === false); };
$('tglRescue').onclick = function(){ if (S) set('rescue_enabled', S.pcfg.rescue_enabled === false); };
$('tglSkip').onclick = function(){
  if (!S) return;
  var enabling = S.pcfg.skip_test !== true;
  var apply = function(){ set('skip_test', enabling); };
  if (enabling) confirm2($('tglSkip'), apply); else apply();
};
$('fullScanBtn').onclick = function(){
  if (!S) return;
  if (S.pcfg.force_full_scan === true){ toast('قبلاً در صف اجراست — بعد از دور بعد ریست می‌شود'); return; }
  confirm2($('fullScanBtn'), function(){ set('force_full_scan', true); toast('فلگ ثبت شد — ران بعدی (تا ۳۰ دقیقه دیگر) کامل اسکن می‌کند'); });
};
$('saveNotify').onclick = function(){ if (!S) return;
  toast('دارم ذخیره می‌کنم…');
  [['watchtower_cap','wtCap'], ['quiet_start','qStart'], ['quiet_end','qEnd']].forEach(function(k, idx){
    setTimeout(function(){ set(k[0], parseInt($(k[1]).value, 10)); }, idx * 350);
  });
};
$('tglQuiet').onclick = function(){ if (S) set('quiet_enabled', S.cfg.quiet_enabled !== true); };
$('testWatch').onclick = function(){ toast('نمونه می‌آورم…');
  post('test_notify', { kind: 'watchtower' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : (r && r.error === 'no_data') ? 'آمار در دسترس نیست' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
$('testCard').onclick = function(){ toast('نمونه می‌آورم…');
  post('test_notify', { kind: 'card' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : (r && r.error === 'no_data') ? 'آمار در دسترس نیست' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
$('testDigest').onclick = function(){ toast('نمونه می‌آورم…');
  post('test_notify', { kind: 'digest' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : (r && r.error === 'no_data') ? 'آمار در دسترس نیست' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
/* D5.2 hotfix — boot after Telegram attaches (async script), not before */
function bootPanel(){
  if (!initData){ $('lock').hidden = false; $('lock').textContent = 'برای باز کردن پنل، این صفحه رو داخل تلگرام باز کن.'; return false; }
  post('state').then(function(d){
    if (!d || d.error){ $('lock').hidden = false; return; }
    S = d; $('panel').hidden = false; draw(); loadUsers();
    if (S.bc && S.bc.total && S.bc.active) bcStep('status');
  }).catch(function(){ $('lock').hidden = false; });
  return true;
}
function tgAttach(){
  tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (!tg) return false;
  initData = tg.initData || '';
  try { tg.ready(); tg.expand(); tg.setHeaderColor('#0C0A07'); tg.setBackgroundColor('#0C0A07'); } catch (e){}
  $('lock').hidden = true;
  bootPanel();
  return true;
}
if (!tgAttach()){
  var tgN = 0;
  var tgIv = setInterval(function(){ if (tgAttach() || ++tgN > 40) clearInterval(tgIv); }, 100);
}
<\/script>
</div></body>
</html>`;

/* ────────────────────────────── router ────────────────────────────── */

const ROUTES = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    /* POST — telegram webhook (other POST paths fall through to /app/api below) */
    if (request.method === 'POST' && url.pathname.startsWith('/webhook/')) {
      const m = url.pathname.match(/^\/webhook\/(.+)$/);
      if (!m || m[1] !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      if (request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      const known = await kvGet(env, 'meta:origin');
      if (known !== origin) await kvPut(env, 'meta:origin', origin);
      let update = null;
      try { update = await request.json(); } catch (_) { return new Response('bad request', { status: 400 }); }
      ctx.waitUntil(handleUpdate(env, update, origin).catch((e) => { console.error('update error', e && e.message); return logErr(env, 'update', e && e.message); }));
      return new Response('ok');
    }

    /* GET /setup?key=… — one-click webhook registration + self-test */
    if (url.pathname === '/setup') {
      if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const set = await api(env, 'setWebhook', {
        url: origin + '/webhook/' + env.WEBHOOK_SECRET,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
        drop_pending_updates: false,
      });
      const me = await api(env, 'getMe');
      if (me && me.ok) await kvPut(env, 'meta:bot_username', me.result.username, 604800);

      /* D4: menu button (Mini App one tap away) + the command list.
         D7: the public list never contains /panel or /freq — those are
         registered per-admin via chat scopes (syncAdminCommands). */
      const menuBtn = await api(env, 'setChatMenuButton', {
        menu_button: { type: 'web_app', text: '👑 ARISTON', web_app: { url: origin + '/app' } },
      });
      const cmds = await api(env, 'setMyCommands', { commands: USER_COMMANDS });
      const cmdScopes = await syncAdminCommands(env);

      /* optional: register the official channel — /setup?key=…&channel=@name&lang=fa */
      let channel = null;
      const ch = url.searchParams.get('channel');
      if (ch) {
        const g = await api(env, 'getChat', { chat_id: ch });
        if (g && g.ok) {
          await kvPut(env, 'meta:channel', String(g.result.id)); // numeric id survives renames
          channel = { ok: true, id: g.result.id, title: g.result.title || null, type: g.result.type || null };
        } else {
          channel = { ok: false, error: (g && g.description) || 'getChat failed — is the bot an admin there?' };
        }
      }
      const cl = url.searchParams.get('lang');
      if (cl && ['fa', 'en', 'ru', 'tr', 'zh'].includes(cl)) await kvPut(env, 'meta:channel_lang', cl);

      /* D4.2: register an admin id — /setup?key=…&admin=<chat_id> */
      const adm = url.searchParams.get('admin');
      if (adm && /^\d{3,20}$/.test(adm)) {
        const cfg = await getCfg(env);
        if (!(cfg.admin_ids || []).map(String).includes(adm)) {
          cfg.admin_ids = [...(cfg.admin_ids || []), Number(adm)];
          await putCfg(env, cfg);
        }
      }

      /* D4.2: force-send one channel post right now — ?…&test_card=1 card · 2 digest */
      let test_card = null;
      if (url.searchParams.get('test_card') === '1') {
        try { await dailyChannelCard(env, true); test_card = { card: 'sent' }; }
        catch (e) { test_card = { card: 'failed', error: String(e && e.message) }; }
      }
      if (url.searchParams.get('test_card') === '2') {
        try { await kvDel(env, 'ch:last_post'); await channelDigest(env); test_card = { digest: 'sent' }; }
        catch (e) { test_card = { digest: 'failed', error: String(e && e.message) }; }
      }

      const info = await api(env, 'getWebhookInfo');
      return new Response(JSON.stringify({
        webhook_registered: Boolean(set && set.ok),
        bot: me && me.ok ? '@' + me.result.username : null,
        inline_hint: 'enable inline mode once via @BotFather → /setinline',
        menu_button: Boolean(menuBtn && menuBtn.ok),
        commands: Boolean(cmds && cmds.ok),
        admin_command_scopes: cmdScopes.admins,
        channel,
        test_card,
        webhook_info: info && info.ok ? info.result : null,
      }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    /* GET /u/<token> — personal subscription feed (?m=mine|gold|mix overrides the profile mode) */
    const um = url.pathname.match(/^\/u\/([A-Za-z0-9-]{8,})\/?$/);
    if (um) {
      let sub = null;
      try { sub = await buildSubscription(env, um[1], url.searchParams.get('m')); } catch (e) { console.error('sub error', e && e.message); }
      if (!sub) return new Response('not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(sub.body, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          // percent-encoded: header values must stay ASCII (title can be فارسی)
          'x-ariston-profile': encodeURIComponent(sub.title),
          'x-ariston-count': String(sub.count),
        },
      });
    }

    /* GET /app — Telegram Mini App + its JSON api */
    if (url.pathname === '/app' || url.pathname === '/app/') {
      const knownOrigin = await kvGet(env, 'meta:origin');
      if (knownOrigin !== origin) await kvPut(env, 'meta:origin', origin);
      return new Response(MINI_APP_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/app/api/stats') return appStats(env);
    if (url.pathname === '/app/api/gold') return appGold(env, url, request);
    if (url.pathname === '/app/api/sub' && request.method === 'POST') return appSub(env, request);
    if (url.pathname === '/app/api/submode' && request.method === 'POST') return appSubMode(env, request);
    if (url.pathname === '/app/api/pref' && request.method === 'POST') return appPref(env, request);
    if (url.pathname === '/app/api/fav' && request.method === 'POST') return appFavs(env, request);
    if (url.pathname === '/app/api/mark' && request.method === 'POST') return appMark(env, request);
    if (url.pathname === '/app/api/feedback' && request.method === 'POST') return appFeedback(env, request);
    if (url.pathname === '/app/api/history' && request.method === 'POST') return appHistory(env, request);
    if (url.pathname === '/app/api/me' && request.method === 'POST') return appMe(env, request);

    /* ── D5 admin panel: page + api ── */
    if (url.pathname === '/panel' || url.pathname === '/panel/') {
      return new Response(ADMIN_PANEL_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/app/api/admin/state' && request.method === 'POST') return guardAdmin(env, request, adminState);
    if (url.pathname === '/app/api/admin/set' && request.method === 'POST') return guardAdmin(env, request, adminSet);
    if (url.pathname === '/app/api/admin/post_now' && request.method === 'POST') return guardAdmin(env, request, adminPostNow);
    if (url.pathname === '/app/api/admin/gen_api' && request.method === 'POST') return guardAdmin(env, request, adminGenApi); // D11/U4-2
    if (url.pathname === '/app/api/admin/test_webhook' && request.method === 'POST') return guardAdmin(env, request, adminTestWebhook); // D11/U4-2
    if (url.pathname === '/app/api/admin/users' && request.method === 'POST') return guardAdmin(env, request, adminUsers);
    if (url.pathname === '/app/api/admin/feedback' && request.method === 'POST') return guardAdmin(env, request, adminFeedback);
    /* ── D7 admin ops ── */
    if (url.pathname === '/app/api/admin/admins' && request.method === 'POST') return guardAdmin(env, request, adminAdmins);
    if (url.pathname === '/app/api/admin/broadcast' && request.method === 'POST') return guardAdmin(env, request, adminBroadcast);
    if (url.pathname === '/app/api/admin/purge' && request.method === 'POST') return guardAdmin(env, request, adminPurge);
    if (url.pathname === '/app/api/admin/sync_cmds' && request.method === 'POST') return guardAdmin(env, request, adminSyncCmds);
    if (url.pathname === '/app/api/admin/test_notify' && request.method === 'POST') return guardAdmin(env, request, adminTestNotify);
    /* ── D9/G4 — user management + audit + templates ── */
    if (url.pathname === '/app/api/admin/user' && request.method === 'POST') return guardAdmin(env, request, adminUserProfile);
    if (url.pathname === '/app/api/admin/user_block' && request.method === 'POST') return guardAdmin(env, request, adminUserBlock);
    if (url.pathname === '/app/api/admin/user_quota' && request.method === 'POST') return guardAdmin(env, request, adminUserQuota);
    if (url.pathname === '/app/api/admin/quota_reset' && request.method === 'POST') return guardAdmin(env, request, adminQuotaReset);
    if (url.pathname === '/app/api/admin/audit' && request.method === 'POST') return guardAdmin(env, request, adminAudit);
    if (url.pathname === '/app/api/admin/templates' && request.method === 'POST') return guardAdmin(env, request, adminTemplates);
    /* ── D10/G6+G7 — settings backup · KV browser · cleanup · health ── */
    if (url.pathname === '/app/api/admin/settings_export' && request.method === 'POST') return guardAdmin(env, request, (env2, b, u) => adminSettingsExport(env2));
    if (url.pathname === '/app/api/admin/settings_import' && request.method === 'POST') return guardAdmin(env, request, adminSettingsImport);
    if (url.pathname === '/app/api/admin/kv' && request.method === 'POST') return guardAdmin(env, request, adminKvBrowser);
    if (url.pathname === '/app/api/admin/cleanup' && request.method === 'POST') return guardAdmin(env, request, adminCleanup);
    if (url.pathname === '/app/api/admin/health' && request.method === 'POST') return guardAdmin(env, request, (env2) => adminHealth(env2));

    /* D8/H — pipeline knobs for the GitHub Action (public, read-only, no
       secrets; the pipeline clamps everything again on its side). */
    if (url.pathname === '/api/pipeline-cfg') {
      const pc = await getPipelineCfg(env);
      return new Response(JSON.stringify({ pipeline: pc, updated_at: new Date().toISOString() }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', ...CORS_HEADERS },
      });
    }

    /* CORS preflight for the public API */
    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname === '/card.svg' || url.pathname === '/card.png')) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    /* ── public API v1 (D3) ── */
    if (url.pathname === '/api' || url.pathname === '/api/') {
      return new Response(API_DOCS_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' },
      });
    }
    if (url.pathname === '/api/v1/stats') {
      if (!(await rateLimit(env, request))) return jsonRes({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
      return apiV1Stats(env);
    }
    if (url.pathname === '/api/v1/configs') {
      if (!(await rateLimit(env, request))) return jsonRes({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
      return apiConfigs(env, url);
    }
    if (url.pathname === '/api/v1/intel') { // D11/U4-2 — keyed machine API (default off)
      if (!(await rateLimit(env, request))) return jsonRes({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
      return apiV1Intel(env, url, request);
    }

    /* ── brand “card of the day” (D3/D4) ── */
    if (url.pathname === '/card.svg') {
      const s = await getStats(env, url.searchParams.has('fresh'));
      return new Response(cardSVG(s), {
        headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=600', ...CORS_HEADERS },
      });
    }
    if (url.pathname === '/card.png') { // D4 — same card rasterized; usable as a Telegram photo
      const s = await getStats(env);
      try {
        const png = await renderCardPNG(s);
        return new Response(png, {
          headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=600', ...CORS_HEADERS },
        });
      } catch (e) {
        console.error('card png render error', e && e.message);
        return new Response('render failed', { status: 500 });
      }
    }

    /* GET / — brand landing */
    if (url.pathname === '/' || url.pathname === '') {
      const username = await kvGet(env, 'meta:bot_username');
      return new Response(landingPage(username), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
      });
    }

    return new Response('not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },

  /* cron — Watchtower + daily card + periodic digest (D4) — D4.2 adds cfg toggles */
  async scheduled(event, env, ctx) {
    const cfg = await getCfg(env);
    ctx.waitUntil((async () => { try { await kvPut(env, 'cron:last_tick', new Date().toISOString(), 172800); } catch (_) {} })()); // D10/G7
    if (cfg.watchtower_enabled !== false) ctx.waitUntil(broadcastNewRun(env).catch((e) => { console.error('cron error', e && e.message); return logErr(env, 'cron:watch', e && e.message); }));
    ctx.waitUntil(newRunWebhook(env).catch((e) => { console.error('hook error', e && e.message); return logErr(env, 'cron:hook', e && e.message); })); // D11/U4-2 — independent of the watchtower toggle
    ctx.waitUntil(dailyChannelCard(env).catch((e) => { console.error('card error', e && e.message); return logErr(env, 'cron:card', e && e.message); }));
    ctx.waitUntil(channelDigest(env).catch((e) => { console.error('digest error', e && e.message); return logErr(env, 'cron:digest', e && e.message); }));
    /* D8/P3 — one-shot «اسکن کامل دستی» from the panel: consumed once a run
       that actually read the flag is live; then the admins get a receipt. */
    ctx.waitUntil(consumePipelineRequest(env).catch((e) => { console.error('pcfg error', e && e.message); return logErr(env, 'cron:pcfg', e && e.message); }));
    /* D9/U2 — «محبوبت مُرد»: starred-config death notices (chunked, quiet hours) */
    ctx.waitUntil(favDeathScan(env).catch((e) => { console.error('favscan error', e && e.message); return logErr(env, 'cron:favscan', e && e.message); }));
    /* D10/U3 — run-late alert (>45 min without a fresh run → admins) +
       Friday personal weekly summary (chunked, per-week guard) */
    ctx.waitUntil(lateRunCheck(env).catch((e) => { console.error('late error', e && e.message); return logErr(env, 'cron:late', e && e.message); }));
    ctx.waitUntil(weeklyDigest(env).catch((e) => { console.error('weekly error', e && e.message); return logErr(env, 'cron:weekly', e && e.message); }));
    /* D7 — one-time self-heal: re-register scoped commands so /panel & /freq
       live only in the admins' own menus, never in the public command list. */
    ctx.waitUntil((async () => {
      try {
        if ((await kvGet(env, 'meta:cmds_synced')) !== '2') {
          const r = await syncAdminCommands(env);
          if (r.global) await kvPut(env, 'meta:cmds_synced', '2');
        }
      } catch (e) { console.error('cmds sync error', e && e.message); }
    })());
  },
};

/* D10/G7 — the public entry wraps every fetch: an unexpected throw is logged
   into the error ring (err:log, last 10) and answered with a clean 500 —
   the worker never dies silently, and the panel can see what happened. */
export default {
  async fetch(request, env, ctx) {
    try {
      return await ROUTES.fetch(request, env, ctx);
    } catch (e) {
      console.error('fetch error', e && e.message);
      let path = '';
      try { path = new URL(request.url).pathname; } catch (_) {}
      await logErr(env, 'fetch', path + ' · ' + (e && e.message));
      return new Response('internal error\n', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  },
  async scheduled(event, env, ctx) {
    return ROUTES.scheduled(event, env, ctx);
  },
};

/* test hooks — named exports are ignored by the Workers runtime */
export { renderCardPNG, remarkUri, brandRemark, cleanName, allocateSub, buildSubscription, getPipelineCfg, inQuietHours, resolveQuota, renderTpl, getTemplates, isBlocked, favDeathScan, buildPool, refQuota, userLevel, sanitizeCsv, weeklyDigest, lateRunCheck, logErr, isoWeekKey, tehranWeekday, clampBySpec, kvPolicy };
