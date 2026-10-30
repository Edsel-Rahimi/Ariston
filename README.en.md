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
  <a href="README.md"><img src="assets/lang-en-on.svg" height="46" alt="en"></a>&nbsp;
  <a href="README.tr.md"><img src="assets/lang-tr.svg" height="46" alt="tr"></a>&nbsp;
  <a href="README.ru.md"><img src="assets/lang-ru.svg" height="46" alt="ru"></a>&nbsp;
  <a href="README.zh.md"><img src="assets/lang-zh.svg" height="46" alt="zh"></a>
</p>

> **The healthy-node repository — filtered every hour.** In ancient Greek, **Ariston** means “the best”; that is the whole goal. The numbers in the card below come from the last real pipeline run — no marketing math.

<p align="center">
  <img src="assets/run-card.svg" alt="last run — live stats" width="100%">
</p>

## ⚡ Quick start

<p align="center">
  <img src="assets/quickstart.svg" alt="quick start" width="100%">
</p>

If you only have room for one line, import this:

```text
# best quality — gold tier
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt
# balanced (recommended) — everything healthy this run
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt
# everything — the full unique pool
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/nodes.txt
```

**On mobile?** Scan one of these codes:

<p align="center">
  <img src="assets/qr-gold.svg" width="168" alt="QR gold">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-validated.svg" width="168" alt="QR validated">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-nodes.svg" width="168" alt="QR all">
</p>

## 🎛️ Tiers — text & Base64, one click

These files are not different sources; it is **one deduplicated pool**, filtered by how much health evidence each node has. Click a card or a button:

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

Built from the live nodes of the latest run, best first — click a card to open the file:

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

Most repositories show one big number and leave you guessing. Ariston does the opposite: **it measures and shows the real number.** Full per-node history lives in [`results.json`](https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/results.json); the stat card above refreshes hourly.

## 🇮🇷 Iranian operator split

Nodes whose IP belongs to Iranian networks are published separately — for domestic traffic that is often free and faster. The split uses the ASN table (who owns the network), not geo-guessing. **Click any card to open that network's file:**

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

> An empty file means the last run found no node on that network — not a broken file.

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

Have a new source (a Telegram channel or a public file)? See [`CONTRIBUTING.md`](CONTRIBUTING.md) — one PR editing `pipeline/sources.json` is enough.

> ⚠️ **Naming policy:** this project deliberately uses neutral words (“node”, “network endpoint”) in filenames, texts and code; experience shows repositories with explicit naming live shorter. Please keep PRs neutral too.

## 🗺 Roadmap

- [x] **Phase 1 — MVP: collect + normalize + deduplicate**
- [x] **Phase 1b — dual-engine testing: xray-core + sing-box on GitHub Actions**
- [x] **Phase 2 — scoring & clients: gold/silver/bronze, mihomo.yaml, singbox.json**
- [x] **Phase 3 — operators & notify: Iran ASN split, Telegram notify, mirrors**
- [ ] **Phase 4 — web dashboard: live page on GitHub Pages**
- [ ] **Phase 5 — Telegram bot: fetch files inside Telegram**

## ❓ FAQ

<details>
<summary><b>Why are only this many nodes alive?</b></summary>

That is the nature of free configs — nodes die or get crowded fast. The difference is that we **measure and show** this reality instead of dazzling you with a raw “tens of thousands of configs” number. The real number refreshes hourly in the stat card.

</details>

<details>
<summary><b>Which file is right for me?</b></summary>

Beginner or in a hurry → `validated.txt` · only the best → `gold.txt` · a specific app → `mihomo.yaml` / `singbox.json` · want to dig yourself → `nodes.txt`

</details>

<details>
<summary><b>How often does it update?</b></summary>

Automatically every hour at :07 UTC. The `data` branch always holds exactly one snapshot; links you copy today stay valid.

</details>

<details>
<summary><b>Why is the wording so neutral?</b></summary>

Experience shows explicit naming raises takedown risk. Ariston only indexes and filters public data — built for the long run.

</details>

## ⚖️ Disclaimer

This project only **indexes and filters** public data; it provides no service and owns no servers. Use at your own responsibility. Content owner? Open an issue and it will be removed immediately.

## 📄 License

MIT — see [`LICENSE`](LICENSE)

---

<p align="center">
  If this helped, give it a ⭐ to keep the repository alive.
</p>
