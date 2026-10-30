/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARISTON — Telegram Bot · Phase D1 MVP
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
 *    GET  /u/<token>                  personal subscription (auto-refresh)
 *    GET  /                           brand landing page
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
    fa: 'v2rayNG ← اشتراک‌ها ← + ← «وارد کردن از کلیپ‌بورد» یا «URL» ← لینک را جای‌گذاری کن ← ذخیره. سپس «به‌روزرسانی اشتراک» بزن.',
    en: 'v2rayNG → Subscriptions → + → Import from clipboard/URL → paste the link → Save → Update subscription.',
    ru: 'v2rayNG → Подписки → + → Импорт из буфера/URL → вставить ссылку → Сохранить → Обновить подписку.',
    tr: 'v2rayNG → Abonelikler → + → Panodan/URL\'den içe aktar → bağlantıyı yapıştır → Kaydet → Aboneliği güncelle.',
    zh: 'v2rayNG → 订阅分组 → + → 从剪贴板/URL 导入 → 粘贴链接 → 保存 → 更新订阅。',
  },
  hiddify: {
    fa: 'Hiddify ← «افزودن پروفایل» ← از کلیپ‌بورد یا لینک ← لینک را جای‌گذاری کن ← ذخیره.',
    en: 'Hiddify → Add profile → From clipboard / URL → paste the link → Save.',
    ru: 'Hiddify → Добавить профиль → Из буфера / URL → вставить ссылку → Сохранить.',
    tr: 'Hiddify → Profil ekle → Panodan / URL\'den → bağlantıyı yapıştır → Kaydet.',
    zh: 'Hiddify → 添加配置 → 从剪贴板 / URL → 粘贴链接 → 保存。',
  },
  streisand: {
    fa: 'Streisand ← + ← «افزودن اشتراک» ← لینک را جای‌گذاری کن ← ذخیره.',
    en: 'Streisand → + → Add subscription → paste the link → Save.',
    ru: 'Streisand → + → Добавить подписку → вставить ссылку → Сохранить.',
    tr: 'Streisand → + → Abonelik ekle → bağlantıyı yapıştır → Kaydet.',
    zh: 'Streisand → + → 添加订阅 → 粘贴链接 → 保存。',
  },
  singbox: {
    fa: 'sing-box خالص فقط فایل JSON می‌پذیرد؛ ساده‌ترین راه: اپ Hiddify یا NekoBox (هر دو موتور sing-box دارند) و همین لینک اشتراک.',
    en: 'Plain sing-box only accepts JSON files; easiest path: Hiddify or NekoBox (both run the sing-box core) with this same subscription link.',
    ru: 'Чистый sing-box принимает только JSON; проще всего: Hiddify или NekoBox (ядро sing-box) с этой же ссылкой.',
    tr: 'Saf sing-box yalnızca JSON kabul eder; en kolay yol: Hiddify veya NekoBox (sing-box çekirdeği) ve aynı abonelik bağlantısı.',
    zh: '原生 sing-box 只接受 JSON；最简单的方式：使用 Hiddify 或 NekoBox（sing-box 内核）导入同一订阅链接。',
  },
  other: {
    fa: 'لینک را در بخش Subscription / پروفایل کلاینت خودت جای‌گذاری کن.',
    en: 'Paste the link into your client\'s Subscription / profile section.',
    ru: 'Вставьте ссылку в раздел «Подписка» вашего клиента.',
    tr: 'Bağlantıyı istemcinizin Abonelik / profil bölümüne yapıştırın.',
    zh: '将链接粘贴到客户端的「订阅 / 配置」区域。',
  },
};

/* ───────────────────────────────── i18n ───────────────────────────────────── */

const T = {
  fa: {
    start_new: '👑 به آریستون خوش اومدی!\n\nآریستون هر نیم‌ساعت هزاران کانفیگ عمومی رو جمع می‌کنه، با دو موتور xray-core و sing-box تست می‌کنه و فقط سالم‌ها رو تحویل می‌ده.\n\n⬇️ اول چند تنظیم سریع:',
    pick_lang: '🌐 زبان رو انتخاب کن:',
    pick_isp: '📡 اپراتور اینترنتیت چیه؟\nاشتراک شخصیت بر همین اساس فیلتر می‌شه.',
    pick_client: '📱 با کدوم کلاینت وصل می‌شی؟\nبرای راهنمای دقیقِ وارد کردن می‌پرسم.',
    setup_done: '✅ تمومه! تنظیماتت ذخیره شد.\n\nحالا از منو «🏆 طلایی‌ها» رو امتحان کن.',
    menu_title: 'از منو انتخاب کن:',
    menu_fallback: 'این رو نمی‌فهمم 🙈 از منو استفاده کن:',
    gold_page: '🏆 <b>طلایی‌ها {a}–{b}</b> از {n} — بهترین‌های آخرین اجرا',
    gold_empty: 'فهرست طلایی همین حالا خالیه ⏳\nچند دقیقه دیگه که اجرای جدید تموم شد دوباره بزن.',
    gold_hint: '💡 برای کپی: روی متن بزن و نگه دار ← Copy',
    more: '🔄 سه‌تای بعدی',
    stats_fail: 'داده‌ها الان در دسترس نیستن ⏳ چند لحظه بعد دوباره امتحان کن.',
    stats_head: '📊 <b>وضعیت زندهٔ شبکه</b>',
    last_run: '🕐 آخرین اجرا: {t}',
    sources: '📡 منابع سالم: {ok} از {total}',
    unique_n: '📥 کانفیگ یکتا: {n}',
    probed_n: '🧪 تست‌شده: {a} | ❤️ سالم: {b}',
    latency: '⚡ تأخیر p50: {p50}ms | میانگین: {avg}ms',
    sub_title: '🔗 <b>اشتراک شخصی تو</b>',
    sub_note: 'این لینک مخصوص خودته — با کسی به اشتراک نذاش.\nهر بار کلاینتت رفرش کنه، تازه‌ترین کانفیگ‌های سالمِ فیلترشده بر اساس اپراتورت رو می‌گیری.',
    sub_howto: '📥 راهنمای وارد کردن:',
    sub_fallback_note: 'ℹ️ برای این اپراتور هنوز کانفیگ داخلی کافی نداریم؛ لیست کامل کانفیگ‌های تست‌شده برات فعال شد.',
    sub_open: '📥 باز کردن لینک',
    help_text: '❓ <b>راهنمای آریستون</b>\n\n/start — شروع و منوی اصلی\n/gold — ۳ کانفیگ طلایی برتر\n/stats — آمار زندهٔ آخرین اجرا\n/sub — لینک اشتراک شخصی\n/settings — تغییر اپراتور / کلاینت\n/lang — تغییر زبان\n\n👑 هر نیم‌ساعت: جمع‌آوری ← نرمال‌سازی ← تست ← امتیازدهی ← انتشار.',
    set_pick: '⚙️ چی رو عوض کنم؟',
    saved: '✅ ذخیره شد',
    err_generic: 'ای وای، خطایی پیش اومد ⚠️ چند لحظه بعد دوباره امتحان کن.',
    rel_min: '{n} دقیقه پیش', rel_hour: '{n} ساعت پیش', rel_day: '{n} روز پیش',
    btn_gold: '🏆 طلایی‌ها', btn_stats: '📊 آمار', btn_sub: '🔗 اشتراک من',
    btn_settings: '⚙️ تنظیمات', btn_help: '❓ راهنما', btn_lang: '🌐 زبان',
    btn_isp: '📡 اپراتور', btn_client: '📱 کلاینت', btn_menu: '↩️ منو',
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
    help_text: '❓ <b>Ariston guide</b>\n\n/start — start & main menu\n/gold — top 3 gold configs\n/stats — live stats of the last run\n/sub — personal subscription link\n/settings — change ISP / client\n/lang — change language\n\n👑 Every 30 min: collect → normalize → validate → score → publish.',
    set_pick: '⚙️ What should I change?',
    saved: '✅ Saved',
    err_generic: 'Oops, something went wrong ⚠️ Please try again in a moment.',
    rel_min: '{n} min ago', rel_hour: '{n} h ago', rel_day: '{n} d ago',
    btn_gold: '🏆 Gold', btn_stats: '📊 Stats', btn_sub: '🔗 My sub',
    btn_settings: '⚙️ Settings', btn_help: '❓ Help', btn_lang: '🌐 Language',
    btn_isp: '📡 ISP', btn_client: '📱 Client', btn_menu: '↩️ Menu',
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
    help_text: '❓ <b>Гид по Ariston</b>\n\n/start — старт и меню\n/gold — топ-3 золотых конфигов\n/stats — живая статистика прогона\n/sub — ссылка личной подписки\n/settings — сменить оператора / клиент\n/lang — сменить язык\n\n👑 Каждые 30 минут: сбор → нормализация → проверка → оценка → публикация.',
    set_pick: '⚙️ Что изменить?',
    saved: '✅ Сохранено',
    err_generic: 'Упс, что-то пошло не так ⚠️ Попробуйте ещё раз чуть позже.',
    rel_min: '{n} мин назад', rel_hour: '{n} ч назад', rel_day: '{n} дн назад',
    btn_gold: '🏆 Gold', btn_stats: '📊 Статистика', btn_sub: '🔗 Моя подписка',
    btn_settings: '⚙️ Настройки', btn_help: '❓ Помощь', btn_lang: '🌐 Язык',
    btn_isp: '📡 Оператор', btn_client: '📱 Клиент', btn_menu: '↩️ Меню',
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
    help_text: '❓ <b>Ariston rehberi</b>\n\n/start — başlangıç ve ana menü\n/gold — ilk 3 altın yapılandırma\n/stats — son çalışmanın canlı istatistiği\n/sub — kişisel abonelik bağlantısı\n/settings — sağlayıcı / istemci değiştir\n/lang — dil değiştir\n\n👑 Her 30 dakika: topla → normalize et → doğrula → puanla → yayınla.',
    set_pick: '⚙️ Neyi değiştireyim?',
    saved: '✅ Kaydedildi',
    err_generic: 'Hops, bir şeyler ters gitti ⚠️ Lütfen birazdan tekrar dene.',
    rel_min: '{n} dk önce', rel_hour: '{n} sa önce', rel_day: '{n} gün önce',
    btn_gold: '🏆 Gold', btn_stats: '📊 İstatistik', btn_sub: '🔗 Aboneliğim',
    btn_settings: '⚙️ Ayarlar', btn_help: '❓ Yardım', btn_lang: '🌐 Dil',
    btn_isp: '📡 Sağlayıcı', btn_client: '📱 İstemci', btn_menu: '↩️ Menü',
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
    help_text: '❓ <b>Ariston 指南</b>\n\n/start — 启动与主菜单\n/gold — 前三名金牌配置\n/stats — 最新一轮实时统计\n/sub — 个人订阅链接\n/settings — 更换运营商 / 客户端\n/lang — 更换语言\n\n👑 每 30 分钟：收集 → 规范化 → 验证 → 评分 → 发布。',
    set_pick: '⚙️ 要更改什么？',
    saved: '✅ 已保存',
    err_generic: '哎呀，出错了 ⚠️ 请稍后再试。',
    rel_min: '{n} 分钟前', rel_hour: '{n} 小时前', rel_day: '{n} 天前',
    btn_gold: '🏆 金牌', btn_stats: '📊 统计', btn_sub: '🔗 我的订阅',
    btn_settings: '⚙️ 设置', btn_help: '❓ 帮助', btn_lang: '🌐 语言',
    btn_isp: '📡 运营商', btn_client: '📱 客户端', btn_menu: '↩️ 菜单',
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

const getStats = (env) => fetchTextCached(env, 'stats.json', STATS_TTL_SEC).then((s) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } });

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

/* ──────────────────────────────── keyboards ───────────────────────────────── */

const langKb = () => {
  const names = Object.entries(LANG_META).map(([code, label]) => [{ text: label, callback_data: 'lang:' + code }]);
  return { inline_keyboard: [names[0], names[1], names[2]] };
};

function ispKb(lang) {
  const rows = [];
  for (let i = 0; i < ISP_ORDER.length - 1; i += 2) {
    rows.push(ISP_ORDER.slice(i, i + 2).map((s) => ({ text: ispName(s, lang), callback_data: 'op:' + s })));
  }
  rows.push([{ text: ispName('other', lang), callback_data: 'op:other' }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

function clientKb(lang) {
  const rows = [];
  for (let i = 0; i < CLIENT_ORDER.length - 1; i += 2) {
    rows.push(CLIENT_ORDER.slice(i, i + 2).map((s) => ({ text: clName(s, lang), callback_data: 'cl:' + s })));
  }
  rows.push([{ text: clName('other', lang), callback_data: 'cl:other' }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

const menuKb = (lang) => ({
  inline_keyboard: [
    [{ text: t(lang, 'btn_gold'), callback_data: 'menu:gold' }, { text: t(lang, 'btn_stats'), callback_data: 'menu:stats' }],
    [{ text: t(lang, 'btn_sub'), callback_data: 'menu:sub' }],
    [{ text: t(lang, 'btn_settings'), callback_data: 'menu:settings' }, { text: t(lang, 'btn_help'), callback_data: 'menu:help' }],
  ],
});

const settingsKb = (lang) => ({
  inline_keyboard: [
    [{ text: t(lang, 'btn_isp'), callback_data: 'set:isp' }],
    [{ text: t(lang, 'btn_client'), callback_data: 'set:client' }],
    [{ text: t(lang, 'btn_lang'), callback_data: 'menu:lang' }],
    [{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }],
  ],
});

/* ─────────────────────────────── bot actions ──────────────────────────────── */

async function sendMenu(env, chatId, lang, text) {
  return sendMessage(env, chatId, text || t(lang, 'menu_title'), { reply_markup: menuKb(lang) });
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
  return sendMessage(env, chatId, t(lang, 'set_pick'), { reply_markup: settingsKb(lang) });
}

async function cmdStart(env, chatId, msg) {
  let user = await getUser(env, chatId);
  if (user && user.lang && user.isp && user.client) return sendMenu(env, chatId, user.lang);
  const lc = String((msg.from && msg.from.language_code) || '').toLowerCase();
  const guess = lc.startsWith('fa') ? 'fa' : lc.startsWith('ru') ? 'ru' : lc.startsWith('tr') ? 'tr' : lc.startsWith('zh') ? 'zh' : lc.startsWith('en') ? 'en' : null;
  if (!user) user = { created: new Date().toISOString().slice(0, 10) };
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
  if (off + 3 < total) rows.push([{ text: t(lang, 'more'), callback_data: 'gold:' + (off + 3) }]);
  rows.push([{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]);
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: rows } });
}

async function cmdStats(env, chatId, lang) {
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
  return sendMessage(env, chatId, msg, { reply_markup: menuKb(lang) });
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
  const msg = [
    t(lang, 'sub_title'), '',
    '<code>' + esc(url) + '</code>', '',
    t(lang, 'sub_note'), note, '',
    '📡 ' + ispName(user.isp, lang) + ' · 📱 ' + clientLine, '',
    t(lang, 'sub_howto'), how,
  ].join('\n');
  return sendMessage(env, chatId, msg, {
    reply_markup: { inline_keyboard: [[{ text: t(lang, 'sub_open'), url }], [{ text: t(lang, 'btn_menu'), callback_data: 'menu:main' }]] },
  });
}

function cmdHelp(env, chatId, lang) {
  return sendMessage(env, chatId, t(lang, 'help_text'), { reply_markup: menuKb(lang) });
}

/* ─────────────────────────── update router (webhook) ──────────────────────── */

async function handleUpdate(env, update, origin) {
  const msg = update.message;
  if (msg && msg.text && msg.chat) {
    const chatId = msg.chat.id;
    const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
    const user = await getUser(env, chatId);
    const lang = (user && user.lang) || 'fa';
    try {
      switch (cmd) {
        case '/start': return await cmdStart(env, chatId, msg);
        case '/gold': return await cmdGold(env, chatId, lang, 0);
        case '/stats': return await cmdStats(env, chatId, lang);
        case '/sub': return await cmdSub(env, chatId, lang, origin || '');
        case '/help': return await cmdHelp(env, chatId, lang);
        case '/lang': return await askLang(env, chatId);
        case '/settings': return await askSettings(env, chatId, lang);
        default: return await sendMenu(env, chatId, lang, t(lang, 'menu_fallback'));
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
    await api(env, 'answerCallbackQuery', { callback_query_id: cb.id }); // always answer → stops the spinner
    const [head, arg] = String(cb.data).split(':');
    try {
      switch (head) {
        case 'lang': {
          let user = (await getUser(env, chatId)) || { created: new Date().toISOString().slice(0, 10) };
          user.lang = arg; await saveUser(env, chatId, user);
          if (user.isp) return sendMenu(env, chatId, arg, t(arg, 'saved'));
          return askIsp(env, chatId, arg);
        }
        case 'op': {
          const user = await getUser(env, chatId);
          if (!user) return;
          user.isp = arg; await saveUser(env, chatId, user);
          if (user.client) return sendMenu(env, chatId, user.lang || 'fa', t(user.lang || 'fa', 'saved'));
          return askClient(env, chatId, user.lang || 'fa');
        }
        case 'cl': {
          const user = await getUser(env, chatId);
          if (!user) return;
          user.client = arg; await saveUser(env, chatId, user);
          return sendMenu(env, chatId, user.lang || 'fa', t(user.lang || 'fa', 'setup_done'));
        }
        case 'menu': {
          const user = await getUser(env, chatId);
          const lang = (user && user.lang) || 'fa';
          switch (arg) {
            case 'gold': return cmdGold(env, chatId, lang, 0);
            case 'stats': return cmdStats(env, chatId, lang);
            case 'sub': return cmdSub(env, chatId, lang, origin || '');
            case 'settings': return askSettings(env, chatId, lang);
            case 'help': return cmdHelp(env, chatId, lang);
            case 'lang': return askLang(env, chatId);
            default: return sendMenu(env, chatId, lang);
          }
        }
        case 'gold': return cmdGold(env, chatId, (await getUser(env, chatId) || {}).lang || 'fa', parseInt(arg, 10) || 0);
        case 'set': {
          const user = await getUser(env, chatId);
          const lang = (user && user.lang) || 'fa';
          if (arg === 'isp') return askIsp(env, chatId, lang);
          if (arg === 'client') return askClient(env, chatId, lang);
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

  let lines = [], usedFallback = false;
  if (user.isp && user.isp !== 'other') {
    lines = toLines(await fetchTextCached(env, 'by-operator/' + user.isp + '.txt', FILE_TTL_SEC));
  }
  if (lines.length < SUB_MIN_OP_LINES) { // golden rule: never hand out an empty feed
    const gold = toLines(await fetchTextCached(env, 'gold.txt', FILE_TTL_SEC));
    const silver = toLines(await fetchTextCached(env, 'silver.txt', FILE_TTL_SEC));
    lines = [...new Set([...gold, ...silver])];
    if (!lines.length) lines = toLines(await fetchTextCached(env, 'validated.txt', FILE_TTL_SEC));
    usedFallback = Boolean(user.isp && user.isp !== 'other');
  }
  if (!lines.length) return null;

  const title = 'ARISTON ' + (usedFallback ? '⭐' : '⚡') + ' ' + ispName(user.isp || 'other', lang);
  const header = [
    '#profile-title: ' + title,
    '#profile-update-interval: 12',
    '#profile-web-page-url: ' + PAGES,
  ].join('\n');
  const body = header + '\n' + lines.slice(0, SUB_MAX_LINES).join('\n');
  return { body: b64(body), title, count: Math.min(lines.length, SUB_MAX_LINES) };
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
    + '</style></head><body><div>'
    + EMBLEM_SVG
    + '<div class="m">ARISTON</div>'
    + '<div class="s">COLLECT · VALIDATE · SCORE · PUBLISH</div>'
    + btn
    + '</div></body></html>';
}

/* ────────────────────────────────── router ────────────────────────────────── */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    /* POST — telegram webhook */
    if (request.method === 'POST') {
      const m = url.pathname.match(/^\/webhook\/(.+)$/);
      if (!m || m[1] !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      if (request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
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
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      });
      const me = await api(env, 'getMe');
      if (me && me.ok) await kvPut(env, 'meta:bot_username', me.result.username, 604800);
      const info = await api(env, 'getWebhookInfo');
      return new Response(JSON.stringify({
        webhook_registered: Boolean(set && set.ok),
        bot: me && me.ok ? '@' + me.result.username : null,
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

    /* GET / — brand landing */
    if (url.pathname === '/' || url.pathname === '') {
      const username = await kvGet(env, 'meta:bot_username');
      return new Response(landingPage(username), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
      });
    }

    return new Response('not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
