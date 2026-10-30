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
  <a href="README.ru.md"><img src="assets/lang-ru.svg" height="46" alt="ru"></a>&nbsp;
  <a href="README.zh.md"><img src="assets/lang-zh-on.svg" height="46" alt="zh"></a>
</p>

> **健康节点仓库 — 每小时过滤一次。** 在古希腊语中，**Ariston** 意为“最好”，这正是我们的目标。下方卡片中的数字来自上一次真实流水线运行——不是营销数字。

<p align="center">
  <img src="assets/run-card.svg" alt="last run — live stats" width="100%">
</p>

## ⚡ Quick start

<p align="center">
  <img src="assets/quickstart.svg" alt="quick start" width="100%">
</p>

只放得下一行？导入这个：

```text
# best quality — gold tier
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt
# balanced (recommended) — everything healthy this run
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt
# everything — the full unique pool
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/nodes.txt
```

**在手机上？** 扫描其中一个二维码：

<p align="center">
  <img src="assets/qr-gold.svg" width="168" alt="QR gold">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-validated.svg" width="168" alt="QR validated">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-nodes.svg" width="168" alt="QR all">
</p>

## 🎛️ Tiers — text & Base64, one click

这些文件不是不同来源；它们是**同一个去重后的节点池**，按“健康证据多少”过滤而成。点击卡片或按钮：

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

由最近一次运行的存活节点生成，优选在前——点击卡片即可打开文件：

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

大多数仓库只显示一个大数字，让你自己去猜。Ariston 反其道而行：**实测并展示真实数字。**每个节点的完整历史在 [`results.json`](https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/results.json)；上方卡片每小时刷新。

## 🇮🇷 Iranian operator split

IP 属于伊朗网络的节点单独发布——国内流量通常更免费、更快速。分流依据 ASN 表（网络归属），而不是地理猜测。**点击卡片打开对应网络的文件：**

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

> 文件为空表示上一次运行在该网络上没有发现节点——不是文件损坏。

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

有新来源（Telegram 频道或公开文件）？参见 [`CONTRIBUTING.md`](CONTRIBUTING.md) —— 修改 `pipeline/sources.json` 的一个 PR 即可。

> ⚠️ **命名策略：**本项目在文件名、文本和代码中刻意使用中性词汇（“节点”“网络端点”）；经验表明，使用直白命名的仓库存续更短。请在 PR 中同样保持中性。

## 🗺 Roadmap

- [x] **阶段 1 — MVP：采集 + 规范化 + 去重**
- [x] **阶段 1b — 双引擎测试：在 GitHub Actions 上运行 xray-core + sing-box**
- [x] **阶段 2 — 评分与客户端：金/银/铜分层，mihomo.yaml、singbox.json**
- [x] **阶段 3 — 运营商与通知：伊朗 ASN 分流、Telegram 通知、镜像**
- [ ] **阶段 4 — 网页面板：GitHub Pages 上的实时页面**
- [ ] **阶段 5 — Telegram 机器人：在 Telegram 内直接获取文件**

## ❓ FAQ

<details>
<summary><b>这么多节点，为什么存活的只有这些？</b></summary>

免费配置的本质如此——节点很快死亡或拥挤。区别在于我们**实测并展示**这一现实，而不是用“数万配置”的原始数字迷惑你。真实数字每小时在卡片上更新。

</details>

<details>
<summary><b>哪个文件适合我？</b></summary>

新手或赶时间 → `validated.txt` · 只要最好的 → `gold.txt` · 特定应用 → `mihomo.yaml` / `singbox.json` · 想自己翻 → `nodes.txt`

</details>

<details>
<summary><b>多久更新一次？</b></summary>

每小时 :07 UTC 自动运行。`data` 分支始终只保留一个快照；今天复制的链接始终有效。

</details>

<details>
<summary><b>为什么措辞如此中性？</b></summary>

经验表明直白命名会提高被删除的风险。Ariston 只对公开数据做索引与过滤——为了项目能长久运行。

</details>

## ⚖️ Disclaimer

本项目仅对公开数据做**索引与过滤**；不提供服务，也不持有任何服务器。使用责任由用户承担。如果您是内容所有者且反对被索引，请提交 issue，我们会立即删除。

## 📄 License

MIT — see [`LICENSE`](LICENSE)

---

<p align="center">
  如果对你有帮助，点一个 ⭐ 让仓库活下去。
</p>
