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
  <a href="README.tr.md"><img src="assets/lang-tr-on.svg" height="46" alt="tr"></a>&nbsp;
  <a href="README.ru.md"><img src="assets/lang-ru.svg" height="46" alt="ru"></a>&nbsp;
  <a href="README.zh.md"><img src="assets/lang-zh.svg" height="46" alt="zh"></a>
</p>

> **Sağlam düğüm deposu — her saat filtrelenir.** Eski Yunanca'da **Ariston** “en iyi” demektir; amaç da tam olarak bu. Aşağıdaki karttaki sayılar son gerçek hattın çıktısından üretilir — pazarlama matematiği yok.

<p align="center">
  <img src="assets/run-card.svg" alt="last run — live stats" width="100%">
</p>

## ⚡ Quick start

<p align="center">
  <img src="assets/quickstart.svg" alt="quick start" width="100%">
</p>

Tek bir satırlık yeriniz varsa bunu içe aktarın:

```text
# best quality — gold tier
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/gold.txt
# balanced (recommended) — everything healthy this run
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/validated.txt
# everything — the full unique pool
https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/nodes.txt
```

**Telefonda mısınız?** Bu kodlardan birini tarayın:

<p align="center">
  <img src="assets/qr-gold.svg" width="168" alt="QR gold">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-validated.svg" width="168" alt="QR validated">&nbsp;&nbsp;&nbsp;
  <img src="assets/qr-nodes.svg" width="168" alt="QR all">
</p>

## 🎛️ Tiers — text & Base64, one click

Bu dosyalar farklı kaynaklar değil; **tek bir tekrarsız havuzun**, her düğümün sağlık kanıtına göre filtrelenmiş hâlleridir. Karta veya düğmeye tıklayın:

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

Son çalıştırmanın canlı düğümlerinden, en iyisi başta — dosyayı açmak için karta tıklayın:

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

Çoğu depo büyük bir sayı gösterir ve sizi tahminle baş başa bırakır. Ariston tersini yapar: **gerçek sayıyı ölçer ve gösterir.** Düğüm bazlı geçmiş [`results.json`](https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/results.json) içinde; yukarıdaki kart her saat yenilenir.

## 🇮🇷 Iranian operator split

IP'si İran ağlarına ait düğümler ayrı yayımlanır — çoğu zaman ücretsiz ve hızlı olan yerel trafik için. Ayrım ASN tablosuna (ağın sahibine) dayanır, coğrafi tahmine değil. **Dosyayı açmak için karta tıklayın:**

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

> Boş dosya, son çalıştırmada o ağda düğüm bulunmadığı anlamına gelir — dosya bozuk değil.

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

Yeni bir kaynağınız mı var (Telegram kanalı veya herkese açık dosya)? [`CONTRIBUTING.md`](CONTRIBUTING.md) — `pipeline/sources.json` düzenleyen tek bir PR yeter.

> ⚠️ **Adlandırma politikası:** bu proje dosya adlarında, metinlerde ve kodda bilinçli olarak nötr kelimeler (“düğüm”, “ağ ucu”) kullanır; açık adlandırma kullanan depoların öne çıktı bilinir. Lütfen PR'lerde de aynı dili koruyun.

## 🗺 Roadmap

- [x] **Faz 1 — MVP: toplama + normalleştirme + tekrarsızlaştırma**
- [x] **Faz 1b — çift motor testi: GitHub Actions'ta xray-core + sing-box**
- [x] **Faz 2 — puanlama ve istemciler: altın/gümüş/bronz, mihomo.yaml, singbox.json**
- [x] **Faz 3 — operatörler ve bildirim: İran ASN ayrımı, Telegram bildirimi, aynalar**
- [ ] **Faz 4 — web panosu: GitHub Pages'te canlı sayfa**
- [ ] **Faz 5 — Telegram botu: dosyaları Telegram içinde almak**

## ❓ FAQ

<details>
<summary><b>Bu kadar düğümden neden yalnızca bu kadarı canlı?</b></summary>

Ücretsiz konfigürasyonların doğası bu — düğümler hızla ölür veya kalabalıklaşır. Fark şu: gerçeği uydurmak yerine **ölçüp gösteriyoruz.** Gerçek sayı her saat kartta yenilenir.

</details>

<details>
<summary><b>Hangi dosya bana uygun?</b></summary>

Yeni başlayan veya acelesi olan → `validated.txt` · sadece en iyiler → `gold.txt` · belirli uygulama → `mihomo.yaml` / `singbox.json` · kendim karışmak isterim → `nodes.txt`

</details>

<details>
<summary><b>Ne sıklıkta güncellenir?</b></summary>

Her saat :07 UTC'de otomatik. `data` dalı her zaman tek bir anlık görüntü tutar; bugün kopyaladığınız bağlantılar geçerli kalır.

</details>

<details>
<summary><b>Dil neden bu kadar nötr?</b></summary>

Açık adlandırmanın kaldırılma riskini artırdığı biliniyor. Ariston yalnızca herkese açık veriyi indeksler ve filtreler — uzun ömür için.

</details>

## ⚖️ Disclaimer

Bu proje yalnızca herkese açık veriyi **indeksler ve filtreler**; hizmet sunmaz, sunucu işletmez. Sorumluluk kullanıcıya aittir. İçerik sahibiyseniz bir issue açın, anında kaldırılır.

## 📄 License

MIT — see [`LICENSE`](LICENSE)

---

<p align="center">
  İşinize yaradıysa, depoyu ayakta tutmak için bir ⭐ bırakın.
</p>
