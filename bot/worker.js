/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARISTON — Telegram Bot · Phase D4 — inline · API · photo card · 10-pick subs
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
const STATS_TTL_SEC = 300;  // stats.json cache (KV)
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
    digest_title: '📊 <b>آریستون — وضعیت لحظه‌ای</b>',
    freq_now: '⏱ گزارش دوره‌ای کانال: هر {n} ساعت یه‌بار\nبرای تغییر: <code>/freq 4</code> (بین ۱ تا ۲۴ ساعت)',
    freq_set: '✅ انجام شد! از الان هر {n} ساعت یه گزارش زنده توی کانال می‌ذارم.',
    freq_bad: '⚠️ یه عدد بین ۱ تا ۲۴ بفرست، مثلاً: <code>/freq 4</code>',
    freq_denied: '⛔ این دستور فقط برای صاحب رباته.',
    btn_panel: '🛠 پنل مدیریت', panel_denied: '⛔ پنل مدیریت فقط برای مدیرهای ربات باز می‌شه.',
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
    digest_title: '📊 <b>Ariston — live status</b>',
    freq_now: '⏱ Channel digest interval: every {n} h\nTo change: <code>/freq 4</code> (1–24 hours)',
    freq_set: '✅ Done! A live digest will be posted to the channel every {n} h.',
    freq_bad: '⚠️ Send a number between 1 and 24, like: <code>/freq 4</code>',
    freq_denied: '⛔ This command is for the bot owner only.',
    btn_panel: '🛠 Admin panel', panel_denied: '⛔ The admin panel is open to bot admins only.',
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
    digest_title: '📊 <b>Ariston — живой статус</b>',
    freq_now: '⏱ Интервал постов в канал: каждые {n} ч\nИзменить: <code>/freq 4</code> (1–24 часа)',
    freq_set: '✅ Готово! Живой отчёт будет в канале каждые {n} ч.',
    freq_bad: '⚠️ Пришлите число от 1 до 24, например: <code>/freq 4</code>',
    freq_denied: '⛔ Команда только для владельца бота.',
    btn_panel: '🛠 Панель админа', panel_denied: '⛔ Панель доступна только админам бота.',
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
    digest_title: '📊 <b>Ariston — canlı durum</b>',
    freq_now: '⏱ Kanal özet aralığı: her {n} sa\nDeğiştirmek için: <code>/freq 4</code> (1–24 saat)',
    freq_set: '✅ Tamam! Kanala her {n} saatte bir canlı özet düşecek.',
    freq_bad: '⚠️ 1 ile 24 arasında bir sayı gönder, örn.: <code>/freq 4</code>',
    freq_denied: '⛔ Bu komut yalnızca bot sahibine ait.',
    btn_panel: '🛠 Yönetim paneli', panel_denied: '⛔ Yönetim paneli yalnızca bot yöneticilerine açık.',
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
    digest_title: '📊 <b>Ariston — 实时状态</b>',
    freq_now: '⏱ 频道定时播报间隔：每 {n} 小时\n修改：<code>/freq 4</code>（1–24 小时）',
    freq_set: '✅ 好了！以后每 {n} 小时向频道发送一次实时报告。',
    freq_bad: '⚠️ 请发送 1–24 之间的数字，例如：<code>/freq 4</code>',
    freq_denied: '⛔ 该命令仅限机器人所有者使用。',
    btn_panel: '🛠 管理面板', panel_denied: '⛔ 管理面板仅限机器人管理员使用。',
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

async function fetchTextCached(env, name, ttlSec) {
  const key = 'file:' + name;
  const hit = await kvGet(env, key, 'json');
  if (hit && hit.ts && Date.now() - hit.ts < ttlSec * 1000 && typeof hit.text === 'string' && hit.text !== '') return hit.text;
  for (const base of [RAW, CDN]) {
    try {
      const r = await fetch(base + name, {
        headers: { 'user-agent': 'ariston-bot/1.0 (+https://github.com/' + REPO + ')' },
        cf: { cacheTtl: 300, cacheEverything: true },
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
  if (fresh) {
    try {
      const r = await fetch(RAW + 'stats.json', { headers: { 'user-agent': 'ariston-bot/1.0 (+https://github.com/' + REPO + ')' }, cf: { cacheTtl: 60 } });
      if (r.ok) { const j = await r.json(); if (j && j.generated_at) return j; }
    } catch (_) { /* fall through to the KV cache */ }
  }
  return fetchTextCached(env, 'stats.json', STATS_TTL_SEC).then((s) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } });
};

/* ─────────────── mini app: initdata auth, enrichment, feedback ─────────────── */

async function sha16(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
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
    const dataCheck = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join('\n');
    const enc = new TextEncoder();
    const midKey = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', midKey, enc.encode(env.BOT_TOKEN));
    const hmacKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheck));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== hash) return null;
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

/* ──────────── cfg:admin (runtime settings · editable from the panel) ─────── */

const CFG_DEFAULT = {
  force_join: true,          // gate the bot behind official-channel membership
  channel_user: CHANNEL_USER,
  card_enabled: true,        // daily photo card in the channel
  digest_enabled: true,      // periodic live digest in the channel (/freq)
  watchtower_enabled: true,  // per-run alerts to opted-in users
  ref_base: REF_BASE,
  ref_cap: REF_CAP,
  admin_ids: [],             // managed via /setup?admin=<id> and the panel
};

async function getCfg(env) {
  const c = await kvGet(env, 'cfg:admin', 'json');
  return { ...CFG_DEFAULT, ...(c && typeof c === 'object' ? c : {}) };
}
const putCfg = (env, c) => kvPut(env, 'cfg:admin', JSON.stringify(c));

async function isAdmin(env, chatId, cfg) {
  const c = cfg || (await getCfg(env));
  if ((c.admin_ids || []).map(String).includes(String(chatId))) return true;
  const owner = await kvGet(env, 'meta:owner'); // D4: first /start claims ownership
  return owner !== null && owner === String(chatId);
}

/* plan B (escalating): ref 1–2 → +1 each · ref 3–5 → +2 each · ref 6+ → +3 each */
function refQuota(refs, cfg) {
  const base = (cfg && cfg.ref_base) || REF_BASE;
  const cap = (cfg && cfg.ref_cap) || REF_CAP;
  const bonus = Math.min(refs, 2) + Math.min(Math.max(refs - 2, 0), 3) * 2 + Math.max(refs - 5, 0) * 3;
  return Math.min(cap, base + bonus);
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
  return st === 'member' || st === 'administrator' || st === 'creator';
}

/* returns true when the user may proceed; otherwise sends the join wall */
async function gateJoin(env, chatId, cfg, lang) {
  if (!cfg.force_join) return true;
  if (await isAdmin(env, chatId, cfg)) return true;
  const chan = await resolveChannel(env, cfg);
  if (!chan) return true; // channel unresolvable → never lock users out
  if (await isMember(env, chatId, chan)) return true;
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

/* same golden-rule pool as the old subscription (operator → gold+silver → validated) */
async function buildPool(env, user) {
  let lines = [], usedFallback = false;
  if (user.isp && user.isp !== 'other') {
    lines = toLines(await fetchTextCached(env, 'by-operator/' + user.isp + '.txt', FILE_TTL_SEC));
  }
  if (lines.length < SUB_MIN_OP_LINES) {
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
async function allocateSub(env, user) {
  const rot = user.rotation === 'run' ? 'run' : 'day';
  const cfg = await getCfg(env);
  const quota = refQuota(user.ref_count || 0, cfg); // 10 base → up to 20 via referrals
  let period;
  if (rot === 'run') { const s = await getStats(env); period = (s && s.generated_at) || tehranDate(); }
  else period = tehranDate();
  const prev = await kvGet(env, 'alloc:' + user.token, 'json');
  if (prev && prev.period === period && Array.isArray(prev.items) && prev.items.length === quota) {
    return { ...prev, rotation: rot };
  }
  const { lines, usedFallback } = await buildPool(env, user);
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
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring || !s.generated_at) return;
  const last = await kvGet(env, 'watch:last_gen');
  if (last === s.generated_at) return;
  await kvPut(env, 'watch:last_gen', s.generated_at);
  if (!last) return; // first boot: record baseline, don't spam
  const origin = await kvGet(env, 'meta:origin');
  const idx = ((await kvGet(env, 'users:index', 'json')) || []).slice(-20); // free-plan subrequest budget
  const v = s.validation, p = v.latency_ms || {};
  for (const chatId of idx) {
    try {
      const u = await getUser(env, chatId);
      const lang = (u && u.lang) || 'fa';
      const rows = [];
      if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
      rows.push([{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold' }]);
      await sendMessage(env, chatId, t(lang, 'watchtower', { gold: fmt(s.scoring.gold), alive: fmt(v.alive), p50: Math.round(p.p50 || 0) }), { reply_markup: { inline_keyboard: rows } });
    } catch (_) { /* keep broadcasting */ }
  }
}

/* ─────────────────── daily channel card (official channel) ────────────────── */

async function dailyChannelCard(env, force = false) {
  const cfg = await getCfg(env);
  if (cfg.card_enabled === false) return;
  const chan = env.CHANNEL_ID || (await kvGet(env, 'meta:channel'));
  if (!chan) return; // not configured → silent no-op
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (!force) {
    if ((await kvGet(env, 'card:last')) === today) return;    // already posted today
    if (now.getUTCHours() < 9) return;                       // first cron after 09:00 UTC (≈12:30 Tehran)
  }

  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return;
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
  const msg = [
    t(lang, 'daily_title'),
    '🗓 ' + dateStr, '',
    '🥇 ' + fmt(s.scoring.gold) + '  ·  ❤️ ' + fmt(v.alive) + '  ·  ⚡ ' + Math.round(p.p50 || 0) + 'ms',
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    '📈 ' + (Object.entries(v.by_protocol_alive || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => esc(k) + ' ' + fmt(n)).join(' · ') || '—'),
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
    const png = (await fetchCardPng()) || (await renderCardPNG(s));
    sent = await sendPhotoFile(env, chan, png, 'ariston-card.png', msg.slice(0, 1024), { reply_markup: { inline_keyboard: rows }, disable_notification: false });
  } catch (e) { console.error('card png error', e && e.message); }
  if (!sent || !sent.ok) sent = await sendMessage(env, chan, msg, { reply_markup: { inline_keyboard: rows }, disable_notification: false });
  if (sent && sent.ok) await kvPut(env, 'card:last', today, 172800);
}

/* ───────── periodic channel digest — every N hours (/freq) ───────────────── */

async function channelDigest(env) {
  const cfg = await getCfg(env);
  if (cfg.digest_enabled === false) return;
  const chan = env.CHANNEL_ID || (await kvGet(env, 'meta:channel'));
  if (!chan) return; // not configured → silent no-op
  const hours = Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6));
  const last = await kvGet(env, 'ch:last_post');
  if (last) {
    const lastMs = Date.parse(last);
    if (isFinite(lastMs) && Date.now() - lastMs < hours * 3600e3) return; // not due yet
  }
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return; // golden rule: no stats → no post
  const lang = (await kvGet(env, 'meta:channel_lang')) || 'fa';
  const v = s.validation, p = v.latency_ms || {};
  const msg = [
    t(lang, 'digest_title'),
    '🥇 ' + fmt(s.scoring.gold) + '  ·  ❤️ ' + fmt(v.alive) + '  ·  ⚡ ' + Math.round(p.p50 || 0) + 'ms',
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    t(lang, 'last_run', { t: relTime(s.generated_at, lang) }),
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
    const png = (await fetchCardPng()) || (await renderCardPNG(s));
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
async function fetchCardPng() {
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

const menuKb = (lang, origin) => {
  const rows = [
    [{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold', style: 'primary' }, { text: t(lang, 'btn_best'), callback_data: 'menu:best', style: 'primary' }],
    [{ text: t(lang, 'btn_stats'), callback_data: 'menu:stats' }, { text: t(lang, 'btn_sub'), callback_data: 'menu:sub', style: 'success' }],
    [{ text: t(lang, 'btn_ref'), callback_data: 'menu:ref', style: 'success' }, { text: t(lang, 'btn_settings'), callback_data: 'menu:settings' }],
    [{ text: t(lang, 'btn_help'), callback_data: 'menu:help' }, { text: t(lang, 'btn_lang'), callback_data: 'menu:lang' }],
  ];
  if (origin) rows.push([{ text: '👑 ' + t(lang, 'btn_app'), web_app: { url: origin + '/app' } }]);
  return { inline_keyboard: rows };
};

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
  return sendMessage(env, chatId, text || t(lang, 'menu_title'), { reply_markup: menuKb(lang, origin) });
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
    t(lang, 'last_run', { t: relTime(s.generated_at, lang) }),
    t(lang, 'sources', { ok: fmt(s.sources_ok), total: fmt(s.sources_total) }),
    t(lang, 'unique_n', { n: fmt(s.unique) }),
    t(lang, 'probed_n', { a: fmt(v.probed), b: fmt(v.alive) }),
    t(lang, 'latency', { p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0) }),
    '📈 ' + (proto || '—'), '',
    '🥇 ' + fmt(sc.gold) + '   🥈 ' + fmt(sc.silver) + '   🥉 ' + fmt(sc.bronze), '',
    '🌐 ' + PAGES,
  ].join('\n');
  return sendMessage(env, chatId, msg, { reply_markup: menuKb(lang, origin) });
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
  const msg = [
    t(lang, 'sub_title'), '',
    '<code>' + esc(url) + '</code>', '',
    t(lang, 'sub_note'), '',
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
  const msg = [
    t(lang, 'ref_title'), '',
    '<code>' + esc(link) + '</code>', '',
    t(lang, 'ref_stat', { n: refs, q: refQuota(refs, cfg), cap: cfg.ref_cap || REF_CAP }), '',
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
  return sendMessage(env, chatId, msg, { reply_markup: menuKb(lang, origin) });
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
  if (!(await isAdmin(env, chatId))) return sendMessage(env, chatId, t(lang, 'panel_denied'));
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
  return sendMessage(env, chatId, msg, { reply_markup: menuKb(lang, origin) });
}

/* ─────────────────────────── update router (webhook) ──────────────────────── */

async function handleUpdate(env, update, origin) {
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

/* ─────────────────────── personal subscription (/u/<token>) ───────────────── */

async function buildSubscription(env, token) {
  const rec = await kvGet(env, 'sub:' + token, 'json');
  if (!rec || !rec.chat_id) return null;
  const user = await getUser(env, rec.chat_id);
  if (!user) return null;
  const lang = user.lang || 'fa';

  /* D4: 10 personalized picks (stable per rotation period) with brand remarks */
  const alloc = await allocateSub(env, user);
  if (!alloc || !alloc.items || !alloc.items.length) return null;
  const name = cleanName(user.name);
  const title = 'ARISTON ' + (alloc.usedFallback ? '⭐' : '⚡') + ' ' + ispName(user.isp || 'other', lang);
  const header = [
    '#profile-title: ' + title,
    '#profile-update-interval: 12',
    '#profile-web-page-url: ' + PAGES,
  ].join('\n');
  const body = header + '\n' + alloc.items.map((it) => remarkUri(it.uri, brandRemark(name, it.ping))).join('\n');
  return { body: b64(body), title, count: alloc.items.length };
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
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return Response.json({ error: 'no_data' }, { status: 503 });
  const v = s.validation, p = v.latency_ms || {};
  return Response.json({
    generated_at: s.generated_at,
    sources_ok: s.sources_ok || 0, sources_total: s.sources_total || 0,
    unique: s.unique || 0, probed: v.probed || 0, alive: v.alive || 0,
    p50: Math.round(p.p50 || 0), avg: Math.round(p.avg || 0),
    gold: s.scoring.gold || 0, silver: s.scoring.silver || 0, bronze: s.scoring.bronze || 0,
    bot: (await kvGet(env, 'meta:bot_username')) || null,
  });
}

async function appGold(env, url, request) {
  const q = url.searchParams;
  let limit = Math.min(Math.max(parseInt(q.get('limit') || '8', 10) || 8, 1), 24);
  let offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
  /* D5: POST + initData → the caller is a known user → stamp their personal name on the copies */
  let remarkName = null;
  if (request && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const tgUser = await verifyInitData(env, body.initData);
    if (tgUser) {
      const u = await getUser(env, tgUser.id);
      if (u && u.name) remarkName = cleanName(u.name);
      if (body.offset != null && isFinite(parseInt(body.offset, 10))) offset = Math.max(parseInt(body.offset, 10), 0);
      if (body.limit != null && isFinite(parseInt(body.limit, 10))) limit = Math.min(Math.max(parseInt(body.limit, 10), 1), 24);
    }
  }
  const all = await getEnrichedGold(env);
  const slice = all.slice(offset, offset + limit);
  const items = [];
  for (const it of slice) {
    const fb = await feedbackGet(env, it.hash);
    items.push({
      ...it, up: fb.up || 0, down: fb.down || 0,
      uri: remarkName ? remarkUri(it.uri, brandRemark(remarkName, it.latency_ms)) : it.uri,
    });
  }
  return Response.json({ total: all.length, offset, items });
}

async function appSub(env, request) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
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
  const uname = cleanName(user.name); // D5: the name saved in the bot travels onto every copy
  let items = [];
  try { // D4: the personalized picks + the user's own connect marks
    const alloc = await allocateSub(env, user);
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
    name: user.name || null, rotation: rotMode, n: items.length,
    items, // [{uri, hash, ping, mark: 0|1|2}] — 1 = connected ✅, 2 = failed ❌
  });
}

async function appMark(env, request) { // D4 — ✅/❌ "did it connect for me"
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
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
  const hash = String(body.hash || '');
  if (!/^[a-f0-9]{16}$/.test(hash)) return Response.json({ error: 'bad_hash' }, { status: 400 });
  const vote = body.vote === 'up' ? 1 : body.vote === 'down' ? 2 : 0;
  if (!vote) return Response.json({ error: 'bad_vote' }, { status: 400 });
  const out = await feedbackSet(env, hash, tgUser.id, vote);
  return Response.json({ ok: true, ...out });
}

/* ─────────────── D5 — admin panel api (initData + isAdmin) ───────────────── */

/* runs fn(env, body) only when the initData belongs to a registered admin */
async function guardAdmin(env, request, fn) {
  const body = await request.json().catch(() => ({}));
  const tgUser = await verifyInitData(env, body.initData);
  if (!tgUser) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(env, tgUser.id))) return Response.json({ error: 'forbidden' }, { status: 403 });
  return fn(env, body);
}

async function adminState(env) {
  const cfg = await getCfg(env);
  const s = await getStats(env);
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  return Response.json({
    cfg,
    every_hours: Math.min(24, Math.max(1, parseInt((await kvGet(env, 'ch:every_hours')) || '6', 10) || 6)),
    channel: await resolveChannel(env, cfg),
    users_total: Array.isArray(idx) ? idx.length : 0,
    stats: s && s.validation && s.scoring ? {
      generated_at: s.generated_at,
      gold: s.scoring.gold || 0, alive: s.validation.alive || 0,
      p50: Math.round((s.validation.latency_ms || {}).p50 || 0),
      sources_ok: s.sources_ok || 0, sources_total: s.sources_total || 0, unique: s.unique || 0,
    } : null,
  });
}

const ADMIN_SET_KEYS = {
  force_join: 'bool', card_enabled: 'bool', digest_enabled: 'bool', watchtower_enabled: 'bool',
  ref_base: 'int:5-50', ref_cap: 'int:10-100', every_hours: 'int:1-24', channel_user: 'handle',
};

async function adminSet(env, body) {
  const key = String(body.key || ''), spec = ADMIN_SET_KEYS[key];
  if (!spec) return Response.json({ error: 'bad_key' }, { status: 400 });
  let v = body.value;
  if (spec === 'bool') v = Boolean(v);
  else if (spec === 'handle') {
    v = String(v || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
    if (v.length < 4) return Response.json({ error: 'bad_value' }, { status: 400 });
  } else {
    const m = spec.match(/^int:(\d+)-(\d+)$/);
    v = parseInt(v, 10);
    if (!m || !isFinite(v)) return Response.json({ error: 'bad_value' }, { status: 400 });
    v = Math.min(parseInt(m[2], 10), Math.max(parseInt(m[1], 10), v));
  }
  if (key === 'every_hours') { // lives outside cfg — /freq reads the same knob
    await kvPut(env, 'ch:every_hours', String(v));
    await kvDel(env, 'ch:last_post'); // new interval takes effect on the next tick
    return Response.json({ ok: true, key, value: v });
  }
  const cfg = await getCfg(env);
  cfg[key] = v;
  await putCfg(env, cfg);
  if (key === 'channel_user') await kvDel(env, 'meta:channel'); // force re-resolve
  return Response.json({ ok: true, key, value: v });
}

async function adminPostNow(env, body) {
  const kind = body.kind === 'digest' ? 'digest' : 'card';
  if (kind === 'card') await dailyChannelCard(env, true);
  else { await kvDel(env, 'ch:last_post'); await channelDigest(env); }
  return Response.json({ ok: true, kind });
}

async function adminUsers(env, body) {
  const idx = (await kvGet(env, 'users:index', 'json')) || [];
  const total = Array.isArray(idx) ? idx.length : 0;
  const off = Math.max(parseInt(body.offset, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 100);
  const slice = idx.slice(Math.max(0, total - off - limit), Math.max(0, total - off)).reverse(); // newest first
  const items = [];
  for (const id of slice) {
    const u = await getUser(env, id);
    items.push({
      chat_id: id, name: (u && u.name) || null, tg: (u && u.tg) || null,
      lang: (u && u.lang) || '—', isp: (u && u.isp) || '—', client: (u && u.client) || '—',
      refs: (u && u.ref_count) || 0, since: (u && u.created) || null,
    });
  }
  return Response.json({ total, offset: off, items });
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

async function apiV1Stats(env) {
  const s = await getStats(env);
  if (!s || !s.validation || !s.scoring) return jsonRes({ error: 'no_data' }, 503);
  const v = s.validation, p = v.latency_ms || {};
  return jsonRes({
    generated_at: s.generated_at || null,
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
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Vazirmatn:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#14110C;--card:rgba(232,200,114,.055);--card2:rgba(232,200,114,.11);
--line:rgba(232,200,114,.16);--line2:rgba(232,200,114,.34);
--gold:#E8C872;--deep:#C9A24A;--silver:#C0C6CC;--bronze:#B87333;
--txt:#F3ECDD;--dim:#8d8262;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--txt);font-family:'Vazirmatn',system-ui,sans-serif;font-size:15px;line-height:1.65}
body{min-height:100vh;background-image:radial-gradient(560px 280px at 50% -70px,rgba(232,200,114,.14),transparent 72%)}
.wrap{max-width:520px;margin:0 auto;padding:14px 16px calc(30px + env(safe-area-inset-bottom))}
header{display:flex;align-items:center;gap:10px;padding:8px 2px 14px}
.emblem{width:36px;height:30px;flex:0 0 auto}
.brand{font-family:'Cinzel',serif;font-weight:700;letter-spacing:.32em;font-size:15px;text-indent:.32em}
.hlive{margin-inline-start:auto;display:flex;align-items:center;gap:10px}
.livewrap{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.14em}
.dot{width:7px;height:7px;border-radius:50%;background:var(--gold);animation:pulse 2.2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(232,200,114,.5)}70%{box-shadow:0 0 0 7px rgba(232,200,114,0)}100%{box-shadow:0 0 0 0 rgba(232,200,114,0)}}
.refresh{background:none;border:1px solid var(--line);color:var(--gold);width:30px;height:30px;border-radius:50%;font-size:13px;cursor:pointer;line-height:1}
.refresh:active{transform:rotate(30deg)}
.hero{position:relative;border:1px solid var(--line2);border-radius:20px;padding:22px 20px 18px;overflow:hidden;
background:linear-gradient(165deg,rgba(232,200,114,.13),rgba(232,200,114,.03) 55%,rgba(232,200,114,.07));animation:up .5s ease both}
.hero .num{font-family:'Cinzel',serif;font-weight:700;font-size:56px;line-height:1.05;color:var(--gold)}
.hero .lbl{margin-top:6px;font-weight:700;font-size:14.5px}
.hero .sub{margin-top:3px;color:var(--dim);font-size:12.5px}
.hero .kbar{position:absolute;top:0;inset-inline:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.7}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;animation:up .5s .07s ease both}
.stat{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px 14px}
.stat .v{font-family:var(--mono);font-weight:600;font-size:18px;direction:ltr;text-align:end}
.stat .v small{font-size:11px;color:var(--dim);font-weight:400}
.stat .k{font-size:11.5px;color:var(--dim);margin-top:1px}
.sec{display:flex;align-items:center;gap:10px;margin:24px 2px 10px;animation:up .5s .12s ease both}
.sec h2{font-size:13.5px;font-weight:700;margin:0;color:var(--gold);white-space:nowrap}
.sec .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.hint{font-size:11px;color:var(--dim);margin:-4px 2px 10px}
.gcard{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px 14px;margin-bottom:8px;cursor:pointer;
transition:transform .12s ease,border-color .2s ease}
.gcard:active{transform:scale(.98);border-color:var(--line2)}
.gtop{display:flex;align-items:center;gap:9px}
.rank{font-size:15px;width:26px;text-align:center;flex:0 0 auto}
.chip{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;border:1px solid;border-radius:6px;padding:2px 7px;flex:0 0 auto}
.chip.vless{color:var(--gold);border-color:rgba(232,200,114,.45)}
.chip.trojan{color:var(--silver);border-color:rgba(192,198,204,.45)}
.chip.hysteria2,.chip.hy2,.chip.tuic{color:var(--bronze);border-color:rgba(184,115,51,.5)}
.chip.vmess,.chip.ss,.chip.other{color:var(--txt);border-color:rgba(243,236,221,.35)}
.host{font-family:var(--mono);font-size:11.5px;color:var(--txt);opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;flex:1;text-align:left}
.metrics{display:flex;gap:6px;align-items:center;flex:0 0 auto;margin-inline-start:auto}
.ema{font-family:var(--mono);font-size:11.5px;font-weight:600}
.ema.g{color:var(--gold)}.ema.s{color:var(--silver)}.ema.b{color:var(--bronze)}
.lat{font-family:var(--mono);font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:1px 6px}
.gfoot{display:flex;align-items:center;gap:12px;margin-top:9px;padding-top:9px;border-top:1px dashed rgba(232,200,114,.13)}
.fb{background:none;border:none;color:var(--dim);font-size:12.5px;cursor:pointer;padding:0 2px;font-family:inherit}
.fb.on{color:var(--gold)}
.gfoot .ok{font-family:var(--mono);font-size:10px;color:var(--dim);margin-inline-start:auto;direction:ltr}
.sub{border:1px solid var(--line);border-radius:16px;background:var(--card);padding:15px 16px;animation:up .5s .18s ease both}
.sub .t{font-weight:700;font-size:13.5px}
.sub .url{font-family:var(--mono);font-size:10.5px;color:var(--dim);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:9px 0 11px;border:1px dashed var(--line);border-radius:10px;padding:9px 11px}
.sub .meta{font-size:11.5px;color:var(--dim);margin-top:10px}
.scard{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:9px 11px;margin-top:8px;cursor:pointer;transition:transform .12s ease,border-color .2s ease}
.scard:active{transform:scale(.98);border-color:var(--line2)}
.scard .host{font-family:var(--mono);font-size:11px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;flex:1;text-align:left}
.scard .ping{font-family:var(--mono);font-size:10px;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:1px 6px;flex:0 0 auto}
.mk{background:none;border:1px solid var(--line);border-radius:8px;font-size:12px;width:30px;height:26px;cursor:pointer;line-height:1;flex:0 0 auto;padding:0}
.mk.ok.on{border-color:rgba(232,200,114,.6);background:rgba(232,200,114,.14)}
.mk.bad.on{border-color:rgba(192,101,74,.55);background:rgba(192,101,74,.14)}
.rot{font-family:var(--mono);font-size:10px;color:var(--gold);border:1px dashed var(--line2);border-radius:8px;padding:2px 8px;flex:0 0 auto}
.btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line2);color:var(--gold);background:rgba(232,200,114,.07);
border-radius:999px;padding:8px 18px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:700}
.btn:active{transform:scale(.97)}
.more{width:100%;border:1px dashed var(--line2);background:none;color:var(--gold);border-radius:12px;padding:11px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:600}
footer{margin-top:28px;display:flex;justify-content:center;gap:16px;font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.1em}
footer a{color:var(--dim);text-decoration:none}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(18px);opacity:0;transition:.25s ease;
background:rgba(30,26,19,.94);border:1px solid var(--line2);color:var(--txt);border-radius:999px;padding:9px 18px;font-size:12.5px;pointer-events:none;z-index:9}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.sk{height:54px;border-radius:14px;border:1px solid var(--line);margin-bottom:8px;background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%;animation:sh 1.3s infinite}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.err{border:1px dashed rgba(192,101,74,.5);color:#d8a18c;border-radius:14px;padding:14px;font-size:12.5px;text-align:center}
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
    <div class="brand">ARISTON</div>
    <div class="hlive">
      <div class="livewrap"><span class="dot"></span><span>LIVE</span></div>
      <button class="refresh" id="refresh" aria-label="refresh">⟳</button>
    </div>
  </header>

  <section class="hero">
    <div class="kbar"></div>
    <div class="num" id="heroNum">—</div>
    <div class="lbl" id="heroLbl">…</div>
    <div class="sub" id="heroSub">…</div>
  </section>

  <div class="grid">
    <div class="stat"><div class="v" id="stAlive">—</div><div class="k" id="stAliveK">…</div></div>
    <div class="stat"><div class="v" id="stP50">—</div><div class="k" id="stP50K">…</div></div>
    <div class="stat"><div class="v" id="stSrc">—</div><div class="k" id="stSrcK">…</div></div>
    <div class="stat"><div class="v" id="stRun">—</div><div class="k" id="stRunK">…</div></div>
  </div>

  <div class="sec"><h2 id="goldTitle">…</h2><div class="rule"></div></div>
  <div class="hint" id="goldHint">…</div>
  <div id="goldList">
    <div class="sk"></div><div class="sk"></div><div class="sk"></div>
  </div>
  <button class="more" id="moreBtn" style="display:none">…</button>

  <div class="sec"><h2 id="subTitle">…</h2><div class="rule"></div></div>
  <div class="sub" id="subCard">…</div>

  <footer>
    <a href="https://edsel-rahimi.github.io/Ariston/" target="_blank" id="ftSite">PAGES</a>
    <a href="https://github.com/Edsel-Rahimi/Ariston" target="_blank">GITHUB</a>
    <span>D4 · v4.0</span>
  </footer>
</div>
<div class="toast" id="toast"></div>

<script>
var I18N = {
  fa: {hero_lbl:'کانفیگ طلایی', hero_sub:'برگزیده از بین {alive} کانفیگ سالم · دور {run}',
    st_alive:'کانفیگ سالم', st_p50:'پینگ p50', st_src:'منابع فعال', st_run:'آخرین تست',
    rel_min:'{n} دقیقه پیش', rel_hour:'{n} ساعت پیش', rel_day:'{n} روز پیش',
    gold_t:'کانفیگ‌های طلایی', gold_hint:'روی کارت بزن تا کپی بشه · 👍 یعنی برات کار کرد',
    more:'نمایش بیشتر', copied:'کپی شد ✅', voted:'ممنون! ثبت شد 🙏', vote_tg:'رأی دادن فقط توی تلگرام ممکنه',
    sub_t:'اشتراک شخصی من', sub_note:'هر بار اپت رو آپدیت کنی، ۱۰ تا کانفیگ مخصوص خودت می‌رسه (تعویض روزانه یا هر دور تست)', sub_copy:'کپی لینک',
    sub_meta:'اپراتور: {o} · اپ: {c}', sub_need:'اول توی ربات /start رو بزن', open_tg:'برای دیدن اشتراک شخصی، این صفحه رو توی تلگرام باز کن',
    mk_ok:'وصل شد', mk_fail:'وصل نشد', my10:'کانفیگ‌های مخصوص من', rot_day:'تعویض: روزانه', rot_run:'تعویض: هر دور تست',
    marked:'ثبت شد', fail:'نتونستم اطلاعات رو بگیرم — دوباره امتحان کن', isp_other:'همه', cl_other:'سایر'},
  en: {hero_lbl:'gold configs', hero_sub:'refined from {alive} alive · run {run}',
    st_alive:'Alive configs', st_p50:'p50 latency', st_src:'Healthy sources', st_run:'Last run',
    rel_min:'{n} min ago', rel_hour:'{n} h ago', rel_day:'{n} d ago',
    gold_t:'Gold configs', gold_hint:'tap a card to copy · 👍 = it worked for you',
    more:'Show more', copied:'Copied ✅', voted:'Recorded 🙏', vote_tg:'Voting works inside Telegram only',
    sub_t:'My personal subscription', sub_note:'every client refresh delivers your personal 10-pick (daily or per-run rotation)', sub_copy:'Copy link',
    sub_meta:'ISP: {o} · Client: {c}', sub_need:'press /start in the bot first', open_tg:'open this page inside Telegram for your personal sub',
    mk_ok:'connected', mk_fail:'failed', my10:'My personal picks', rot_day:'rotation: daily', rot_run:'rotation: per run',
    marked:'Recorded', fail:'failed to load — try again', isp_other:'All', cl_other:'Other'},
  ru: {hero_lbl:'золотых конфигов', hero_sub:'отобрано из {alive} живых · прогон {run}',
    st_alive:'Живых конфигов', st_p50:'Задержка p50', st_src:'Рабочих источников', st_run:'Последний прогон',
    rel_min:'{n} мин назад', rel_hour:'{n} ч назад', rel_day:'{n} дн назад',
    gold_t:'Золотые конфиги', gold_hint:'нажми на карточку — копировать · 👍 = работает',
    more:'Показать ещё', copied:'Скопировано ✅', voted:'Записано 🙏', vote_tg:'Голосование — только в Telegram',
    sub_t:'Моя личная подписка', sub_note:'при каждом обновлении — твоя персональная десятка (день или прогон)', sub_copy:'Копировать ссылку',
    sub_meta:'Оператор: {o} · Клиент: {c}', sub_need:'сначала /start в боте', open_tg:'открой эту страницу в Telegram для личной подписки',
    mk_ok:'подключилось', mk_fail:'не вышло', my10:'Мои личные конфиги', rot_day:'ротация: день', rot_run:'ротация: прогон',
    marked:'Записано', fail:'ошибка загрузки — попробуй снова', isp_other:'Все', cl_other:'Другое'},
  tr: {hero_lbl:'altın yapılandırma', hero_sub:'{alive} çalışan içinden seçildi · çalışma {run}',
    st_alive:'Çalışan yapılandırma', st_p50:'p50 gecikme', st_src:'Sağlıklı kaynak', st_run:'Son çalışma',
    rel_min:'{n} dk önce', rel_hour:'{n} sa önce', rel_day:'{n} gün önce',
    gold_t:'Altın yapılandırmalar', gold_hint:'kopyalamak için karta dokun · 👍 = işime yaradı',
    more:'Daha fazla', copied:'Kopyalandı ✅', voted:'Kaydedildi 🙏', vote_tg:'Oylama sadece Telegram içinde',
    sub_t:'Kişisel aboneliğim', sub_note:'her yenilemede kişisel 10’luk seçkin (günlük veya her çalışma)', sub_copy:'Bağlantıyı kopyala',
    sub_meta:'Sağlayıcı: {o} · İstemci: {c}', sub_need:'önce botta /start gönder', open_tg:'kişisel abonelik için bu sayfayı Telegram içinde aç',
    mk_ok:'bağlandı', mk_fail:'olmadı', my10:'Kişisel seçkilerim', rot_day:'rotasyon: günlük', rot_run:'rotasyon: çalışma',
    marked:'Kaydedildi', fail:'yükleme hatası — tekrar dene', isp_other:'Tümü', cl_other:'Diğer'},
  zh: {hero_lbl:'金牌配置', hero_sub:'从 {alive} 个可用中精选 · 第 {run} 轮',
    st_alive:'可用配置', st_p50:'p50 延迟', st_src:'可用源', st_run:'最近一轮',
    rel_min:'{n} 分钟前', rel_hour:'{n} 小时前', rel_day:'{n} 天前',
    gold_t:'金牌配置', gold_hint:'点卡片即复制 · 👍 = 对我有用',
    more:'显示更多', copied:'已复制 ✅', voted:'已记录 🙏', vote_tg:'仅限在 Telegram 内投票',
    sub_t:'我的个人订阅', sub_note:'客户端每次刷新拿到你的专属 10 个（按天或每轮轮换）', sub_copy:'复制链接',
    sub_meta:'运营商：{o} · 客户端：{c}', sub_need:'请先在机器人里 /start', open_tg:'在 Telegram 内打开此页面以获取个人订阅',
    mk_ok:'连上了', mk_fail:'连不上', my10:'我的专属配置', rot_day:'轮换：每天', rot_run:'轮换：每轮',
    marked:'已记录', fail:'加载失败 — 请重试', isp_other:'全部', cl_other:'其他'}
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
function countUp(el, to){ var t0 = null, dur = 900;
  function step(ts){ if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / dur); k = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtN(Math.round(to * k)); if (k < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function applyTexts(){
  document.getElementById('heroLbl').textContent = T('hero_lbl');
  document.getElementById('stAliveK').textContent = T('st_alive');
  document.getElementById('stP50K').textContent = T('st_p50');
  document.getElementById('stSrcK').textContent = T('st_src');
  document.getElementById('stRunK').textContent = T('st_run');
  document.getElementById('goldTitle').textContent = '🏆 ' + T('gold_t');
  document.getElementById('goldHint').textContent = T('gold_hint');
  document.getElementById('subTitle').textContent = '🔗 ' + T('sub_t');
  var mb = document.getElementById('moreBtn'); mb.textContent = T('more');
}
var lastStats = null, goldOffset = 0;
function loadStats(){
  fetch('/app/api/stats').then(function(r){ return r.json(); }).then(function(s){
    if (s.error){ return; }
    lastStats = s;
    countUp(document.getElementById('heroNum'), s.gold);
    document.getElementById('heroSub').textContent = T('hero_sub', {alive: fmtN(s.alive), run: rel(s.generated_at)});
    document.getElementById('stAlive').textContent = fmtN(s.alive);
    document.getElementById('stP50').innerHTML = fmtN(s.p50) + '<small> ms</small>';
    document.getElementById('stSrc').innerHTML = fmtN(s.sources_ok) + '<small> / ' + fmtN(s.sources_total) + '</small>';
    document.getElementById('stRun').textContent = rel(s.generated_at);
  }).catch(function(){ toast(T('fail')); });
}
function goldCard(it, idx){
  var proto = (it.uri.split('://')[0] || 'other').toLowerCase();
  var hostPart = it.uri.split('://')[1] || '';
  hostPart = hostPart.split(/[\\/?#]/)[0] || it.uri.replace(/^[a-z0-9+.-]+:\/\//i, '').slice(0, 26) || '—';
  var rank = (goldOffset + idx < 3) ? MEDALS[goldOffset + idx] : ('#' + (goldOffset + idx + 1));
  var emaCls = it.ema !== null ? (it.ema >= 0.99 ? 'g' : it.ema >= 0.8 ? 's' : 'b') : 'b';
  var emaTx = it.ema !== null ? Math.round(it.ema * 100) + '%' : '—';
  var latTx = it.latency_ms !== null ? Math.round(it.latency_ms) + 'ms' : '—';
  return '<div class="gcard" data-uri="' + esc(it.uri) + '" style="animation:up .4s ' + (idx * 0.05) + 's ease both">' +
    '<div class="gtop"><div class="rank">' + rank + '</div>' +
    '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
    '<div class="host">' + esc(hostPart) + '</div>' +
    '<div class="metrics"><span class="ema ' + emaCls + '">' + emaTx + '</span>' +
    '<span class="lat">' + latTx + '</span></div></div>' +
    '<div class="gfoot">' +
    '<button class="fb" data-hash="' + esc(it.hash) + '" data-v="up">👍 <span>' + (it.up || 0) + '</span></button>' +
    '<button class="fb" data-hash="' + esc(it.hash) + '" data-v="down">👎 <span>' + (it.down || 0) + '</span></button>' +
    '<span class="ok">✔ ' + (it.ok || 0) + ' / ✘ ' + (it.fail || 0) + '</span></div></div>';
}
function bindCards(){
  var list = document.getElementById('goldList');
  Array.prototype.forEach.call(list.querySelectorAll('.gcard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(ev){
      if (ev.target.closest && ev.target.closest('.fb')) return;
      copyText(card.getAttribute('data-uri'));
    });
  });
  Array.prototype.forEach.call(list.querySelectorAll('.fb'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData){ toast(T('vote_tg')); return; }
      var vote = btn.getAttribute('data-v'), hash = btn.getAttribute('data-hash');
      haptic('medium');
      fetch('/app/api/feedback', {method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({initData: initData, hash: hash, vote: vote})})
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (res.ok){ toast(T('voted'));
            var card = btn.closest('.gcard');
            Array.prototype.forEach.call(card.querySelectorAll('.fb'), function(b){ b.classList.remove('on'); });
            btn.classList.add('on');
            var cnt = btn.querySelector('span'); if (cnt) cnt.textContent = (vote === 'up') ? res.up : res.down;
          } else toast(T('vote_tg'));
        }).catch(function(){ toast(T('fail')); });
    });
  });
}
function loadGold(append){
  var list = document.getElementById('goldList');
  if (!append){ list.innerHTML = '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; goldOffset = 0; }
  /* D5: POST + initData → the server stamps the user's own name on the copied configs */
  var req = initData
    ? fetch('/app/api/gold', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: initData, offset: goldOffset, limit: 6 }) })
    : fetch('/app/api/gold?offset=' + goldOffset + '&limit=6');
  req.then(function(r){ return r.json(); }).then(function(d){
    if (d.error || !d.items){ list.innerHTML = '<div class="err">' + T('fail') + '</div>'; return; }
    if (!d.items.length && !append){ list.innerHTML = '<div class="err">⏳</div>'; return; }
    var html = append ? '' : '';
    for (var i = 0; i < d.items.length; i++){ html += goldCard(d.items[i], i); }
    if (append){ list.insertAdjacentHTML('beforeend', html); } else { list.innerHTML = html; }
    goldOffset += d.items.length;
    var mb = document.getElementById('moreBtn');
    /* D5: keep the app light — at most 12 gold cards, the rest lives in the bot (/gold) */
    mb.style.display = (goldOffset < d.total && goldOffset < 12) ? 'block' : 'none';
    bindCards();
  }).catch(function(){ list.innerHTML = '<div class="err">' + T('fail') + '</div>'; });
}
function subRow(it, idx){
  var proto = (it.uri.split('://')[0] || 'other').toLowerCase();
  var hostPart = it.uri.split('://')[1] || '';
  hostPart = hostPart.split(/[\\/?#]/)[0] || it.uri.replace(/^[a-z0-9+.-]+:\/\//i, '').slice(0, 26) || '—';
  var pingTx = it.ping != null ? Math.round(it.ping) + 'ms' : '—';
  var okOn = it.mark === 1 ? ' on' : '', badOn = it.mark === 2 ? ' on' : '';
  return '<div class="scard" data-uri="' + esc(it.uri) + '">' +
    '<span class="chip ' + esc(proto) + '">' + esc(proto) + '</span>' +
    '<div class="host">' + esc(hostPart) + '</div>' +
    '<span class="ping">' + esc(pingTx) + '</span>' +
    '<button class="mk ok' + okOn + '" data-hash="' + esc(it.hash) + '" data-v="ok" title="' + T('mk_ok') + '">✅</button>' +
    '<button class="mk bad' + badOn + '" data-hash="' + esc(it.hash) + '" data-v="fail" title="' + T('mk_fail') + '">❌</button>' +
    '</div>';
}
function bindSubMarks(){
  Array.prototype.forEach.call(document.querySelectorAll('#subCard .scard'), function(card){
    if (card._bound) return; card._bound = true;
    card.addEventListener('click', function(ev){
      if (ev.target.closest && ev.target.closest('.mk')) return;
      copyText(card.getAttribute('data-uri'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#subCard .mk'), function(btn){
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (!initData){ toast(T('vote_tg')); return; }
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
          } else toast(T('vote_tg'));
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
      var html = '<div class="t">' + T('sub_t') + ' ' + rotChip + '</div>' +
        '<div class="url">' + esc(d.url) + '</div>' +
        '<button class="btn" id="copySub">📋 ' + T('sub_copy') + '</button>' +
        '<div class="meta">' + T('sub_note') + '</div>' +
        '<div class="meta">' + T('sub_meta', {o: isp, c: cl}) + nameTag + '</div>';
      if (d.items && d.items.length){
        html += '<div class="meta" style="margin-top:14px;font-weight:700;color:var(--gold)">📦 ' + T('my10') + ' · ' + d.items.length + '</div>';
        for (var i = 0; i < d.items.length; i++){ html += subRow(d.items[i], i); }
        html += '<div class="meta" style="margin-top:8px">✅ ' + T('mk_ok') + ' · ❌ ' + T('mk_fail') + '</div>';
      }
      card.innerHTML = html;
      document.getElementById('copySub').addEventListener('click', function(){ copyText(d.url); });
      bindSubMarks();
    }).catch(function(){ card.innerHTML = '<div class="err">' + T('fail') + '</div>'; });
}
applyTexts();
loadStats();
loadGold(false);
loadSub();
document.getElementById('moreBtn').addEventListener('click', function(){ haptic('light'); loadGold(true); });
document.getElementById('refresh').addEventListener('click', function(){ haptic('light'); loadStats(); loadGold(false); });
setInterval(loadStats, 5 * 60 * 1000);
if (tg){ try { tg.ready(); tg.expand(); tg.setHeaderColor('#14110C'); tg.setBackgroundColor('#14110C'); } catch (e){} }
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
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#14110C;--card:rgba(232,200,114,.06);--line:rgba(232,200,114,.18);
--gold:#E8C872;--deep:#C9A24A;--txt:#F3ECDD;--dim:#8d8262;--bad:#e06c5a;--ok:#7ec97e;
--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--txt);font-family:'Vazirmatn',system-ui,sans-serif;font-size:15px;line-height:1.7}
body{min-height:100vh;background-image:radial-gradient(560px 280px at 50% -70px,rgba(232,200,114,.14),transparent 72%)}
.wrap{max-width:520px;margin:0 auto;padding:14px 16px calc(30px + env(safe-area-inset-bottom))}
header{display:flex;align-items:baseline;gap:10px;padding:8px 2px 14px}
.brand{font-family:'Cinzel',Georgia,serif;font-weight:700;letter-spacing:.32em;font-size:15px;color:var(--gold)}
.sub{color:var(--dim);font-size:12px}
h2{font-size:13.5px;color:var(--deep);margin:22px 2px 8px;letter-spacing:.04em;display:flex;align-items:center;gap:8px}
h2::after{content:'';flex:1;height:1px;background:var(--line)}
h2 .n{font-family:var(--mono);font-size:10.5px;color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 14px;margin-bottom:10px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed rgba(232,200,114,.1)}
.row:last-child{border-bottom:none}
.k{font-size:13.5px;font-weight:500}
.hint{color:var(--dim);font-size:11.5px;margin-top:2px}
.tg{font-family:var(--mono);direction:ltr}
.chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
.chip{border:1px solid var(--line);background:none;color:var(--txt);border-radius:999px;padding:6px 13px;font-family:var(--mono);font-size:12.5px;cursor:pointer}
.chip.on{background:var(--gold);color:#14110C;border-color:var(--gold);font-weight:700}
.tgl{border:1px solid var(--line);background:none;color:var(--txt);border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;flex:0 0 auto}
.tgl.on{background:rgba(126,201,126,.14);color:var(--ok);border-color:rgba(126,201,126,.5)}
.tgl.off{background:rgba(224,108,90,.1);color:var(--bad);border-color:rgba(224,108,90,.45)}
.btn{flex:1;border:1px solid var(--gold);background:var(--gold);color:#14110C;font-weight:700;font-family:inherit;font-size:13.5px;border-radius:12px;padding:11px;cursor:pointer}
.btn.ghost{background:none;color:var(--gold)}
input{width:92px;background:rgba(0,0,0,.25);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:7px 10px;font-family:var(--mono);font-size:13px;direction:ltr;text-align:center}
.stat{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px 0}
.stat div{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:11px;padding:8px 4px;text-align:center}
.stat b{display:block;font-family:var(--mono);font-size:15px;color:var(--gold);direction:ltr}
.stat span{font-size:10.5px;color:var(--dim)}
#users .u{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:6px 0;border-bottom:1px dashed rgba(232,200,114,.08)}
#users .u:last-child{border-bottom:none}
.toast{position:fixed;inset-inline:0;bottom:18px;margin:auto;width:max-content;max-width:88vw;background:var(--gold);color:#14110C;font-weight:700;font-size:13px;border-radius:999px;padding:9px 18px;opacity:0;pointer-events:none;transition:.25s;z-index:9}
.toast.show{opacity:1}
.lock{text-align:center;padding:60px 10px;color:var(--dim)}
</style>
</head>
<body><div class="wrap">
<header><span class="brand">ARISTON</span><span class="sub">🛠 پنل مدیریت</span></header>
<div id="lock" class="lock" hidden>⛔ این پنل فقط برای مدیرهای ربات باز می‌شه.</div>
<div id="panel" hidden>
  <h2>وضعیت لحظه‌ای</h2>
  <div class="card"><div class="stat" id="stat"></div><div class="hint" id="statTime" style="padding:0 2px 8px"></div></div>

  <h2>کانال</h2>
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

  <h2>رفتار ربات</h2>
  <div class="card">
    <div class="row"><div><div class="k">عضویت اجباری در کانال</div><div class="hint">بدون عضویت، ربات به کسی چیزی نمی‌ده</div></div><button class="tgl" id="tglJoin"></button></div>
    <div class="row"><div><div class="k">کانال اجباری</div><div class="hint tg" id="chUser">@Ariston_CH</div></div>
      <div style="display:flex;gap:6px;align-items:center"><input id="chUserIn" placeholder="@name" style="width:120px"><button class="tgl" id="saveCh">ثبت</button></div></div>
  </div>

  <h2>دعوت دوستان</h2>
  <div class="card">
    <div class="row"><div><div class="k">سهمیهٔ پایه</div><div class="hint">هر کاربر تازه با /start</div></div><input id="refBase" type="number" min="5" max="50"></div>
    <div class="row"><div><div class="k">سقف سهمیه</div><div class="hint">با دعوت دوستان تا این عدد</div></div><input id="refCap" type="number" min="10" max="100"></div>
    <div style="padding:10px 0 8px"><button class="btn" id="saveRef">ذخیره</button></div>
  </div>

  <h2>کاربرها <span class="n" id="uTotal"></span></h2>
  <div class="card" id="users"><div class="hint">—</div></div>
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
function drawTgl(el, on){ el.textContent = on ? '✅ روشن' : '⛔ خاموش';
  el.classList.toggle('on', !!on); el.classList.toggle('off', !on); }
var FREQS = [1, 2, 3, 6, 12, 24], S = null;
function draw(){
  drawTgl($('tglCard'), S.cfg.card_enabled !== false);
  drawTgl($('tglDigest'), S.cfg.digest_enabled !== false);
  drawTgl($('tglWatch'), S.cfg.watchtower_enabled !== false);
  drawTgl($('tglJoin'), S.cfg.force_join !== false);
  $('refBase').value = S.cfg.ref_base || 10; $('refCap').value = S.cfg.ref_cap || 20;
  $('chName').textContent = S.channel ? ('@' + S.channel.user + ' · id ' + S.channel.id) : '— هنوز ثبت نشده —';
  $('chUserIn').value = '@' + (S.cfg.channel_user || 'Ariston_CH');
  var ch = '';
  for (var i = 0; i < FREQS.length; i++){ var h = FREQS[i];
    ch += '<button class="chip' + (h === S.every_hours ? ' on' : '') + '" data-h="' + h + '">' + h + 'h</button>'; }
  $('freqChips').innerHTML = ch;
  Array.prototype.forEach.call($('freqChips').querySelectorAll('.chip'), function(b){
    b.onclick = function(){ set('every_hours', parseInt(b.getAttribute('data-h'), 10)); }; });
  if (S.stats){ var st = S.stats;
    $('stat').innerHTML = '<div><b>' + fmt(st.gold) + '</b><span>طلایی</span></div>' +
      '<div><b>' + fmt(st.alive) + '</b><span>سالم</span></div>' +
      '<div><b>' + fmt(st.p50) + '</b><span>p50 ms</span></div>' +
      '<div><b>' + fmt(st.sources_ok) + '/' + fmt(st.sources_total) + '</b><span>منابع</span></div>';
    try { $('statTime').textContent = 'آخرین تست: ' + new Date(st.generated_at).toLocaleString('fa-IR'); }
    catch (e){ $('statTime').textContent = st.generated_at || ''; }
  } else { $('stat').innerHTML = '<div style="grid-column:1/-1;color:var(--dim);text-align:center;padding:6px 0">آمار در دسترس نیست</div>'; $('statTime').textContent = ''; }
}
function set(key, value){
  post('set', { key: key, value: value }).then(function(r){
    if (r && r.ok){ toast('ذخیره شد ✓');
      if (key === 'every_hours') S.every_hours = r.value; else S.cfg[key] = r.value;
      draw(); } else toast('خطا — دوباره بزن');
  }).catch(function(){ toast('خطا'); });
}
function loadUsers(){
  post('users', { offset: 0, limit: 30 }).then(function(d){
    if (!d || d.error) return;
    $('uTotal').textContent = '· ' + fmt(d.total) + ' نفر';
    if (!d.items.length){ $('users').innerHTML = '<div class="hint">هنوز کاربری ثبت نشده</div>'; return; }
    var h = '';
    for (var i = 0; i < d.items.length; i++){ var u = d.items[i];
      h += '<div class="u"><span>' + (u.name ? '✍️ ' + u.name : (u.tg || '👤')) +
        ' <span style="color:var(--dim);font-family:var(--mono);font-size:10.5px">' + u.lang + '</span></span>' +
        '<span style="color:var(--dim);font-family:var(--mono);font-size:10.5px;direction:ltr">' + u.isp + ' · 👥' + u.refs + '</span></div>'; }
    $('users').innerHTML = h;
  }).catch(function(){});
}
if (!initData){ $('lock').hidden = false; $('lock').textContent = 'برای باز کردن پنل، این صفحه رو داخل تلگرام باز کن.'; }
else post('state').then(function(d){
  if (!d || d.error){ $('lock').hidden = false; return; }
  S = d; $('panel').hidden = false; draw(); loadUsers();
}).catch(function(){ $('lock').hidden = false; });
$('tglCard').onclick = function(){ if (S) set('card_enabled', S.cfg.card_enabled === false); };
$('tglDigest').onclick = function(){ if (S) set('digest_enabled', S.cfg.digest_enabled === false); };
$('tglWatch').onclick = function(){ if (S) set('watchtower_enabled', S.cfg.watchtower_enabled === false); };
$('tglJoin').onclick = function(){ if (S) set('force_join', S.cfg.force_join === false); };
$('saveRef').onclick = function(){ if (!S) return;
  set('ref_base', parseInt($('refBase').value, 10));
  setTimeout(function(){ set('ref_cap', parseInt($('refCap').value, 10)); }, 350); };
$('saveCh').onclick = function(){ if (S) set('channel_user', $('chUserIn').value); };
$('postCard').onclick = function(){ toast('دارم می‌فرستم…');
  post('post_now', { kind: 'card' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
$('postDigest').onclick = function(){ toast('دارم می‌فرستم…');
  post('post_now', { kind: 'digest' }).then(function(r){ toast(r && r.ok ? 'فرستاده شد ✓' : 'خطا'); }).catch(function(){ toast('خطا'); }); };
if (tg){ try { tg.ready(); tg.expand(); tg.setHeaderColor('#14110C'); tg.setBackgroundColor('#14110C'); } catch (e){} }
<\/script>
</div></body>
</html>`;

/* ────────────────────────────────── router ────────────────────────────────── */

export default {
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
      ctx.waitUntil(handleUpdate(env, update, origin).catch((e) => console.error('update error', e && e.message)));
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

      /* D4: menu button (Mini App one tap away) + the command list */
      const menuBtn = await api(env, 'setChatMenuButton', {
        menu_button: { type: 'web_app', text: '👑 ARISTON', web_app: { url: origin + '/app' } },
      });
      const cmds = await api(env, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Start / main menu' },
          { command: 'gold', description: 'Top gold configs' },
          { command: 'best', description: 'Gold ticket — fastest alive' },
          { command: 'stats', description: 'Live run stats' },
          { command: 'sub', description: 'Personal subscription link' },
          { command: 'ref', description: 'Invite friends — quota up to 20' },
          { command: 'settings', description: 'ISP / client / name / rotation' },
          { command: 'lang', description: 'Change language' },
          { command: 'panel', description: 'Admin settings panel' },
          { command: 'freq', description: 'Channel digest interval (owner)' },
        ],
      });

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
        channel,
        test_card,
        webhook_info: info && info.ok ? info.result : null,
      }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    /* GET /u/<token> — personal subscription feed */
    const um = url.pathname.match(/^\/u\/([A-Za-z0-9-]{8,})\/?$/);
    if (um) {
      let sub = null;
      try { sub = await buildSubscription(env, um[1]); } catch (e) { console.error('sub error', e && e.message); }
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
    if (url.pathname === '/app/api/mark' && request.method === 'POST') return appMark(env, request);
    if (url.pathname === '/app/api/feedback' && request.method === 'POST') return appFeedback(env, request);

    /* ── D5 admin panel: page + api ── */
    if (url.pathname === '/panel' || url.pathname === '/panel/') {
      return new Response(ADMIN_PANEL_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/app/api/admin/state' && request.method === 'POST') return guardAdmin(env, request, adminState);
    if (url.pathname === '/app/api/admin/set' && request.method === 'POST') return guardAdmin(env, request, adminSet);
    if (url.pathname === '/app/api/admin/post_now' && request.method === 'POST') return guardAdmin(env, request, adminPostNow);
    if (url.pathname === '/app/api/admin/users' && request.method === 'POST') return guardAdmin(env, request, adminUsers);

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
    if (cfg.watchtower_enabled !== false) ctx.waitUntil(broadcastNewRun(env).catch((e) => console.error('cron error', e && e.message)));
    ctx.waitUntil(dailyChannelCard(env).catch((e) => console.error('card error', e && e.message)));
    ctx.waitUntil(channelDigest(env).catch((e) => console.error('digest error', e && e.message)));
  },
};

/* test hooks — named exports are ignored by the Workers runtime */
export { renderCardPNG, remarkUri, brandRemark, cleanName, allocateSub, buildSubscription };
