<p align="center">
  <img src="assets/banner.svg" alt="Ariston" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Edsel-Rahimi/Ariston/stargazers"><img src="https://img.shields.io/github/stars/Edsel-Rahimi/Ariston?style=flat&color=00E5A0&labelColor=0A0E1A" alt="Stars"></a>
  <a href="https://github.com/Edsel-Rahimi/Ariston/actions/workflows/pipeline.yml"><img src="https://img.shields.io/github/actions/workflow/status/Edsel-Rahimi/Ariston/pipeline.yml?branch=main&label=pipeline&color=38BDF8&labelColor=0A0E1A" alt="Pipeline"></a>
  <img src="https://img.shields.io/github/last-commit/Edsel-Rahimi/Ariston/data?label=data%20refresh&color=00E5A0&labelColor=0A0E1A" alt="Data refresh">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Edsel-Rahimi/Ariston?color=8CA3C3&labelColor=0A0E1A" alt="License"></a>
</p>

<p align="center">
  <a href="README.fa.md"><img src="assets/lang-fa.svg" height="46" alt="fa"></a>&nbsp;
  <a href="README.md"><img src="assets/lang-en.svg" height="46" alt="en"></a>&nbsp;
  <a href="README.tr.md"><img src="assets/lang-tr.svg" height="46" alt="tr"></a>&nbsp;
  <a href="README.ru.md"><img src="assets/lang-ru-on.svg" height="46" alt="ru"></a>&nbsp;
  <a href="README.zh.md"><img src="assets/lang-zh.svg" height="46" alt="zh"></a>
</p>

> **Репозиторий живых узлов — фильтруется каждый час.** В древнегреческом **Ariston** значит “лучшее”; в этом и есть вся цель. Числа на карточке ниже построены из последнего реального запуска — без рекламной арифметики.

<p align="center">
  <img src="assets/run-card.svg" alt="last run — live stats" width="100%">
</p>

## ⚡ Quick start

<p align="center">
  <img src="assets/quickstart.svg" alt="quick start" width="100%">
</p>

Место только на одну строку? Импортируйте это:

```text
# best quality — gold tier
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt
# balanced (recommended) — everything healthy this run
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt
# everything — the full unique pool
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/nodes.txt
```

**С телефона?** Отсканируйте один из кодов:

<p align="center">
  <img src="assets/qr-gold.svg" width="168" alt="QR gold">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-validated.svg" width="168" alt="QR validated">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-nodes.svg" width="168" alt="QR all">
</p>

## 🎛️ Tiers — text & Base64, one click

Это не разные источники; это **единый уникальный пул**, отфильтрованный по количеству свидетельств здоровья каждого узла. Нажмите на карточку или кнопку:

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt"><img src="assets/tier-gold.svg" width="398"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt"><img src="assets/btn-text.svg" width="158"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.b64"><img src="assets/btn-b64.svg" width="158"></a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/silver.txt"><img src="assets/tier-silver.svg" width="398"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/silver.txt"><img src="assets/btn-text.svg" width="158"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/silver.b64"><img src="assets/btn-b64.svg" width="158"></a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt"><img src="assets/tier-validated.svg" width="398"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt"><img src="assets/btn-text.svg" width="158"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.b64"><img src="assets/btn-b64.svg" width="158"></a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/all.txt"><img src="assets/tier-all.svg" width="398"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/all.txt"><img src="assets/btn-text.svg" width="158"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/all.b64"><img src="assets/btn-b64.svg" width="158"></a>
</p>

## 🖥️ Ready-made client configs

Собраны из живых узлов последнего запуска, лучшие впереди — нажмите на карточку, чтобы открыть файл:

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/mihomo.yaml"><img src="assets/client-mihomo.svg" width="400" alt="mihomo.yaml"></a>&nbsp;
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/singbox.json"><img src="assets/client-singbox.svg" width="400" alt="singbox.json"></a>
</p>

<details>
<summary>📎 Import guide</summary>

- **v2rayNG** → Subscriptions → add the `.b64` URL
- **Hiddify** → New Profile → `validated.txt` URL
- **NekoBox** → Groups → Add group → `validated.txt` URL
- **Streisand** → Configs → `+` → `validated.txt` URL
- **Clash Verge / Mihomo** → Import → `mihomo.yaml` URL
- **sing-box / SFA / SFI** → Profiles → New → `singbox.json` URL

</details>

## 🧪 "Does it actually work?" — measured, not estimated

<p align="center">
  <img src="assets/proof.svg" alt="proof" width="100%">
</p>

Большинство репозиториев показывают большое число и оставляют вас с догадками. Ariston поступает наоборот: **измеряет и показывает реальное число.** История каждого узла — в [`results.json`](https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/results.json); карточка выше обновляется ежечасно.

## 🇮🇷 Iranian operator split

Узлы, чьи IP принадлежат иранским сетям, публикуются отдельно — для внутреннего трафика, который часто бесплатнее и быстрее. Разделение по таблице ASN (владелец сети), а не по гео-догадкам. **Нажмите на карточку, чтобы открыть файл сети:**

<p align="center">
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/irancell.txt"><img src="assets/op-irancell.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/mci.txt"><img src="assets/op-mci.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/tci.txt"><img src="assets/op-tci.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/rightel.txt"><img src="assets/op-rightel.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/pishgaman.txt"><img src="assets/op-pishgaman.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/shatel.txt"><img src="assets/op-shatel.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/mobinnet.txt"><img src="assets/op-mobinnet.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/asiatech.txt"><img src="assets/op-asiatech.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/parsonline.txt"><img src="assets/op-parsonline.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/respina.txt"><img src="assets/op-respina.svg" width="262"></a>
  <a href="https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/by-operator/ir-other.txt"><img src="assets/op-ir-other.svg" width="262"></a>
</p>

> Пустой файл означает, что в последнем запуске узлов этой сети не нашлось — файл не сломан.

## ⚙️ Supported protocols

<p align="center">
  <img src="assets/protocols.svg" alt="protocols" width="100%">
</p>

## 🏗 Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="architecture" width="100%">
</p>

Every station in detail: [`docs/architecture.md`](docs/architecture.md)

## ➕ Adding a source

Есть новый источник (Telegram-канал или публичный файл)? Смотрите [`CONTRIBUTING.md`](CONTRIBUTING.md) — достаточно одного PR с правкой `pipeline/sources.json`.

> ⚠️ **Политика именования:** проект намеренно использует нейтральные слова (“узел”, “сетевая точка”) в именах файлов, текстах и коде; опыт показывает, что репозитории с прямыми названиями живут меньше. Пожалуйста, держите PR нейтральными.

## 🗺 Roadmap

- [x] **Фаза 1 — MVP: сбор + нормализация + дедупликация**
- [x] **Фаза 1b — двух-двигательный тест: xray-core + sing-box в GitHub Actions**
- [x] **Фаза 2 — скоринг и клиенты: золото/серебро/бронза, mihomo.yaml, singbox.json**
- [x] **Фаза 3 — операторы и уведомления: ASN-разбивка Ирана, Telegram-уведомления, зеркала**
- [ ] **Фаза 4 — веб-панель: живая страница на GitHub Pages**
- [ ] **Фаза 5 — Telegram-бот: получение файлов внутри Telegram**

## ❓ FAQ

<details>
<summary><b>Почему живых узлов так мало?</b></summary>

Такова природа бесплатных конфигов — узлы быстро умирают или перегружаются. Разница в том, что мы это **измеряем и показываем**, а не ослепляем вас сырым числом “десятки тысяч конфигов”. Реальное число обновляется ежечасно на карточке.

</details>

<details>
<summary><b>Какой файл мне подходит?</b></summary>

Новичок или некогда → `validated.txt` · только лучшее → `gold.txt` · конкретное приложение → `mihomo.yaml` / `singbox.json` · покопаться самому → `nodes.txt`

</details>

<details>
<summary><b>Как часто обновляется?</b></summary>

Автоматически каждый час в :07 UTC. Ветка `data` всегда хранит ровно один снимок; ссылки, скопированные сегодня, остаются действительными.

</details>

<details>
<summary><b>Почему формулировки такие нейтральные?</b></summary>

Известно, что прямые названия повышают риск удаления. Ariston лишь индексирует и фильтрует публичные данные — с расчётом на долгую жизнь.

</details>

## ⚖️ Disclaimer

Проект только **индексирует и фильтрует** публичные данные; услуг не оказывает, серверов не держит. Ответственность за использование — на пользователе. Владелец контента? Откройте issue — удалим немедленно.

## 📄 License

MIT — see [`LICENSE`](LICENSE)

---

<p align="center">
  Если оказалось полезным — поставьте ⭐, чтобы репозиторий жил.
</p>
