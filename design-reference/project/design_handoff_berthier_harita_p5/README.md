# Handoff: Sefer haritası (Grafit Gece) ve P5 · Ritim ve motivasyon

Depo: `SerdarKizil0/Berthier` (`main`). Arayüz dili Türkçe, saat dilimi Europe/Istanbul. Bu belge Claude Code içindir; konuşmayı görmemiş birinin işi buradan yapabilmesi hedeflenir.

## Genel bakış

İki iş var:

1. **Sefer haritası:** Karargâh’taki “Bugünün arazisi” rota haritası ve Harita sekmesi, cephe tipine göre bölgelere ayrılmış bir araziye dönüşür. Aciliyet kampın kendi görünümüyle gösterilir. Günün sırası araziyi izleyen tek bir patikadır. Bütün uygulama koyu **Grafit Gece** paletine geçer.
2. **P5 · Ritim ve motivasyon** (`docs/P5-ritim-ve-motivasyon.md`): sabah raporu, bildirimler (iPhone Web Push), sefer defteri (motivasyon katmanı), iki haftalık sefer ölçümleri, çevrimdışı davranış.

## Tasarım dosyaları hakkında

Bu paketteki `.dc.html` dosyaları **HTML ile yapılmış tasarım referanslarıdır**. Amaçlanan görünümü ve davranışı gösterirler; üretim kodu değildirler, doğrudan kopyalanmazlar. Görev bu tasarımları **mevcut kod tabanında**, onun kalıplarıyla yeniden kurmaktır. Mevcut ortam: React + TypeScript (`app/*.tsx`), Atlas stilleri `app/atlas.css` ve `app/globals.css`, sunucu `app/api/state/route.ts` (Worker + D1), ChatGPT oturumu `app/chatgpt-auth.ts`. Haritanın arazi, rota ve etiket hesapları ise tasarım dosyasının mantık sınıfında çalışan bir referans olarak duruyor; bunları TypeScript’e taşımak doğru yoldur (aşağıda “Harita mimarisi”).

Dosyaları açmak için klasördeki `support.js` aynı klasörde durmalı; tarayıcıda doğrudan açılırlar. Tasarım dosyalarındaki “Tweaks” değerleri (örnek gün, durum, aciliyet eşikleri) yalnız önizleme içindir.

## Doğruluk düzeyi

**Yüksek.** Renkler, yazı, aralıklar, metinler ve etkileşimler nihaidir. Ekranlar 390 × 844 telefon boyutunda tasarlandı.

## Çalışma kuralları

- `docs/00-BASLA.md` içindeki değişmez kurallar geçerli: bakım kullanıcıya düşmez, Berthier önerir ve kullanıcı onaylar, sayı sınırı yok, dışarıya hiçbir şey onaysız gitmez, hiçbir girdi kaybolmaz ve her değişiklik geri alınabilir, çalışma temposu sorgulanmaz, sıfır cepheli gün cezalandırılmaz.
- Kullanıcı 1 Ekim’de GitHub’a yazma izni verdi. Push’tan önce tip denetimi, mevcut testler (13 P1 + 5 P2 + 4 P3 + 5 davranış + 4 P4) ve derleme geçmeli; `app/scripts/export-github.py` ile anahtar taraması yapılmalı. `.env*`, `.dev.vars*` ve yerel veriler depoya girmez. Testler yalnız ayrı QA hesaplarında; üretim verisine dokunulmaz.
- Çalışan kodu baştan yazma; yalnız gereken yerlere dokun. Oturum sonunda `docs/DURUM.md`’yi güncelle. Bu paketteki `DURUM.md`, depodakinin 1 Ekim kararlarıyla güncellenmiş hâlidir; önce onu depoya al.
- Yayın: uygulama Sites üzerinde (`https://berthier-serdar.serdar16.chatgpt.site`, yayın kimliği `app/.openai/hosting.json`), giriş ChatGPT oturumuyla. Önceki yayınlar Codex’in Sites aracıyla yapıldı. Push ile yayın ayrıdır; yayın yolunu kullanıcıyla netleştir.

## Önerilen uygulama sırası

1. Grafit Gece tokenlarını `app/atlas.css` `:root` değişkenlerine uygula (bütün uygulama).
2. Haritayı yeni bir bileşen olarak kur (öneri: `app/expedition-map.tsx`) ve iki yerde kullan: `app/atlas-order.tsx` (Karargâh, küçük rota) ve `app/berthier.tsx` harita görünümü (tam ekran atlas).
3. Veri modeli: günün emri biten hamleleri saklamalı (aşağıda “Durum ve veri”).
4. P5: sabah raporu, bildirimler, sefer defteri, ölçümler, çevrimdışı.
5. Fiziksel iPhone’da bildirim, basılı tutup sürükleme ve ana ekran oturumu testi.

---

## Ekranlar

Ortak kabuk (bütün ekranlar): üst başlık 76 px yüksek, alt çizgi `#343538`; solda “berthier” (Instrument Serif 2rem, `#d6d3cb`) ve mercan ✳ (`#ed845c`, DM Sans 1.6rem); sağda Kayıt defteri ve Tercihler ikon düğmeleri (44 × 44, ikon 20 px). Altta sabit dikte paneli: genişlik `100% - 20px`, üst köşeler 22 px, zemin `#18191b`, kenar `#343538`, gölge `0 -8px 30px rgba(0,0,0,.3)`; “Aklındakini bırak. / Berthier yerine yerleştirir.” düğmesi (`#2a2b2d`, köşe 14) ve dört sekme: Karargâh, Harita, Ufuk, Teftiş (etkin `#d6d3cb` 700, diğerleri `#8f8d88` 500, yazı .75rem). İçerik panelin altından kayar; bu kasıtlıdır.

### 1. Karargâh · Bugünün arazisi (küçük rota haritası)

- **Amaç:** Günün emrini harita üstünde görmek, hamleyi seçmek, sırayı değiştirmek, hamleyi bitirmek.
- **Yerleşim:** Mevcut `atlas-order.tsx` yapısı korunur: başlık satırı (“Bugünün arazisi.” Instrument Serif 2rem; sağda “ÖNERİLEN ROTA” IBM Plex Mono .75rem), altında **360 px sabit yükseklikte** harita, harita altı satırı (sol: “6 CEPHE / 6 HAMLE”, sağ: “MERCAN = ACİL”), ardından 23 px köşeli hamle sayfası (“01 / SIRADAKİ HAMLE”, cephe adı, Instrument Serif 2.2rem hamle metni, “↳ gerekçe”, “Hamleyi bitir”, “Düzenle”, “Bu rotayla ilerle”, “Cephe ekle / çıkar”, emir listesi).
- **Harita:** Sağ üstte yakınlaştır / uzaklaştır / sığdır düğmeleri (44 × 44, köşe 14’lük grup, zemin `rgba(28,29,31,.9)`, kenar `rgba(150,148,142,.3)`). Açılışta tüm rota karargâhla birlikte sığdırılır; “Tüm rotayı göster / Haritayı daralt” düğmesi kaldırıldı. Sayfa kaydırması korunur: tek parmakla dikey hareket sayfayı kaydırır, iki parmak haritayı yakınlaştırır/kaydırır, fareyle sürükleme haritayı kaydırır, Ctrl + tekerlek yakınlaştırır.
- **Liste:** Biten satır üstü çizili, numara yerine ✓; cephe adının yanında “· geçildi 10:12”.

### 2. Harita · Tam ekran atlas

- **Amaç:** Bütün açık cepheleri arazide görmek; bugünün rotası öne çıkar.
- **Yerleşim:** Başlığın altından alt panele kadar tam ekran harita. Üstte koyu geçişli örtü (`linear-gradient(#18191b 0%, rgba(24,25,27,.88) 45%, rgba(24,25,27,0) 100%)`) üzerinde “← Karargâh”, “Harita” (Instrument Serif 2.7rem) ve “13 AÇIK CEPHE · BUGÜNÜN ROTASI 6 KAMP” (mono .75rem). Sağ üstte zoom grubu. Sağ altta “NASIL OKUNUR?” düğmesi; açılınca lejant (bölgeler, kontur, patika, mühür, bayrak, mercan = acil).
- **Rota dışı cepheler:** 14 px küçük kamp (dolu nokta; bekletilen cephe kesik kenarlı, nokta yok), yalnız ad etiketi.
- **Kampa dokununca** alt panelin üstünde cephe kartı açılır (köşe 20, zemin `#202123`): tip çubuğu + tip adı, başlık (Instrument Serif 1.9rem), tarihli kalem ve saat ya da “Kaldığın yer: …”, kalan gün çipi (aciliyete göre renkli), “ROTADA 03” ya da “BUGÜNÜN ROTASINDA DEĞİL”, “SIRADAKİ HAMLE”, “Cepheyi aç →”. Boş alana dokunmak kartı kapatır.

### 3. Sabah raporu

- **Amaç:** Raporu okuyup emri birkaç dakikadan kısa sürede onaylamak. Bildirime dokununca açılır; gün içinde Karargâh’tan da erişilir.
- **Yapı her gün aynıdır, bölüm sırası değişmez, boş bölüm gizlenmez:**
  - Başlık: “← Karargâh”, “Sabah raporu” (Instrument Serif 2.7rem), “CMT 26 EYLÜL · 08:00’DE HAZIRLANDI” (mono .75rem `#8f8d88`).
  - **Yapışkan içindekiler** (kaydırınca üstte kalır): dört eşit düğme, 48 px yüksek, köşe 10, zemin `#202123`: “I / Emir 6”, “II / Uyarı 2”, “III / Yer 2”, “IV / Karar 2”; sayı yoksa “yok”. Dokununca ilgili bölüme yumuşak kaydırır (yapışkan şerit yüksekliği kadar pay bırakılır).
  - Bölüm başlıkları: Romen rakamı `#d4b98a`, ad mono .75rem harf aralığı .1em `#b3b0a8`, sağda sayı; alt çizgi `#343538`.
  - **I Günün emri:** Güzergâh şeridi (karargâh ✳ 28 px kare + her kamp için 28 px numaralı daire, aralar 2 px noktalı `#c9ad7a`; acil kamp mercan kenar, kritik kamp mercan dolgu). Altında “Güzergâh: Karargâh → Başvuru Geçidi → Genel Düzlük → Ders Ovası → Kulvar Dağları → Başvuru Geçidi” (art arda aynı bölge birleşir). Her satır: numara, “Cephe · Bölge” (.75rem), hamle (1rem 500), “↳ gerekçe” (.8125rem), sağda kalan gün çipi. Altında “Sırayı düzenle” ve “Cephe ekle / çıkar” (mevcut pencereleri açar). Boşsa: “Bugün için önerilen cephe yok. İstersen bir cephe ekleyebilirsin.”
  - **II Uyarılar:** Kart (köşe 14, `#202123`, kenar `#343538`): etiket “SAAT ÇAKIŞMASI” veya “HAZIRLIK DARALIYOR” (`#ea9a7c`), sağda “02:14’TE YAKALANDI”; metin; eylemler (“Başka saat için mail taslağı” → mevcut çakışma maili; “Belgeleri gör”; “Görüldü”). Görülen kart .65 opaklık, etiket gri, sağda “GÖRÜLDÜ”, eylem “Geri al”. Boşsa “Uyarı yok.”
  - **III Bugün ve yarın:** İki blok her zaman var: “BUGÜN · CMT 26 EYL” ve “YARIN · PAZ 27 EYL · 11:00”. Yer adı Instrument Serif 1.6rem, bağlam .875rem, “YANINA AL” (mono `#d4b98a`) + liste. Yer yoksa “Olunacak yer yok.”
  - **IV Kararını bekleyenler:** Berthier’in soruları (seçenek çipleri 44 px, köşe 22; yanıt sonrası “✓ Yanıtın kaydedildi: 15 dk” + “Geri al”) ve gönderilmeyi bekleyen mail taslakları (“Gönderen sensin; Berthier göndermez.” + “Taslağı aç”). Boşsa “Kararını bekleyen bir şey yok.”
  - Son satır: “RAPORUN SONU · SIRADAKİ RAPOR PAZ 27 EYL 08:30”.
  - **Sabit alt çubuk:** “Emri onayla” (52 px, köşe 12, zemin `#333437`, kenar `#434448`, yazı `#e2dfd7` 600; sağda “6 CEPHE”). Onaydan sonra “✓ Onaylandı · 08:34” (`#d4b98a`), “Geri al”, “Karargâh’a git”. Emir boşsa tek düğme “Karargâh’a dön”.
- Gelen evrak bölümü yok (26 Eylül kararı). Raporda süre sayacı gösterilmez.

### 4. Tercihler › Bildirimler

- **KURULUM · iPhone** (üç adım; numaralı 28 px daire, tamamlanınca altın ✓ ve sağda durum):
  1. “Ana ekrana ekle”: “iPhone’da bildirimler yalnız ana ekrandan açılan Berthier’de çalışır. Safari’de Paylaş, sonra Ana Ekrana Ekle.” → “TAMAM”
  2. “Bildirim izni”: “İzin penceresi yalnız bu düğmeye dokununca açılır.” [İzin ver] → “VERİLDİ”
  3. “Deneme bildirimi”: “Kurulumun bu telefonda çalıştığını görmek için.” [Gönder] (izin yoksa pasif) → “08:31’DE GELDİ”
- **NE ZAMAN GELİR** (her satırda başlık, saat, kural ve örnek bildirim kutusu):
  - Sabah raporu · Her gün 08:30 · “Rapor 08:00’de hazırlanır; bildirim seçtiğin saatte gelir.” Örnek: “Sabah raporu hazır / Önerilen emir: 6 cephe. 2 uyarı, 2 yer, kararını bekleyen 2 konu.”
  - Haftalık teftiş · Pazar 20:00 · “Teftiş beş adımdır; kaldığın adım korunur.” Örnek: “Haftalık teftiş zamanı / Bir haftadır dokunulmamış 2 cephe var.”
  - Çakışma · Yakalandığı anda · “Sessiz saatlerde yakalanırsa ayrı bildirim olmaz; sabah raporuna girer.” Örnek: “Yeni çakışma / Pzt 28 Eyl 14:00 dekanlık randevusu, Organik Kimya Lab ile çakışıyor.”
  - Akşam · **kullanıcı seçer (varsayılan 21:00)**, saat seçici 15 dk adımlı · “Yalnız yarın olunacak bir yer varsa gelir. Saatini sen seçersin.” Seçilen saat 23:00–07:30 aralığındaysa `#ea9a7c` uyarı: “Bu saat sessiz saatlere denk geliyor; bildirim gelmez. 23:00’ten önce bir saat seç.” Örnek: “Yarın 11:00 · Laboratuvar B-204 / Yanına al: laboratuvar defteri, pH kalibrasyon tamponları.”
  - Sessiz saatler · 23:00–07:30 · “Bu aralıkta hiçbir bildirim gelmez.”

### 5. Sefer defteri (motivasyon katmanı)

- **Amaç:** Yapılanı kayıt olarak görmek. Kullanıcıdan hiçbir giriş istemez.
- Başlık “Sefer defteri”, alt satır “İKİ HAFTALIK SEFER · 6. GÜN / 14 · 21 EYL – 4 EKİ”.
- 14 günlük şerit: 14 eşit hücre (22 px yükseklik, köşe 5) + tarih (mono .75rem). Geçmiş gün `rgba(212,185,138,.72)`, emirsiz gün yalnız kenar `#434448`, bugün `rgba(212,185,138,.22)` + `#d4b98a` kenar, gelecek kesik kenar `#3a3b3e`.
- “ALINAN KAMP 18 · KAPANAN CEPHE 2” (sayılar `#d4b98a`).
- Gün kayıtları (yeniden eskiye): tarih, sağda etiket (“SÜRÜYOR”, “SEFER TAMAMLANDI” altın, “KARARGÂHTA”, “1. GÜN”); küçük mühür izi (✳ + 14 px kamplar; alınan kamp altın dolgu ve parıltı, iki alınmış kamp arası 2 px altın parlayan çizgi, diğerleri noktalı `#5d5c58`); Berthier’in tamamlanan hamlelerden yazdığı kısa özet; kapanan cephe varsa “⚑ CEPHE KAPANDI · Ders ekle-bırak” mührü (altın kenar).
- Seri, puan, seviye, karşılaştırma yok. Emirsiz gün “Karargâhta. Bu gün için emir yoktu.” diye nötr geçer.
- **Seferin ölçümleri** (kapalı başlar, yalnız dokununca açılır): emirdeki hamlelerin tamamlanma oranı (“%78 · 18/23”), rapor açılışından onaya ortalama süre, elle düzenleme ve ayar değişikliği sayısı (hedef sıfıra yakın). Altta: “14. günde tek soru sorulur: Kilitlenmeler seyreldi mi? Hükmü sen verirsin.”
- Erişim: Karargâh’tan (öneri: Fikir deposu / Haftalık teftiş kartlarının yanında) ve Teftiş’ten.

### 6. Kilit ekranı bildirimi

Başlık “Sabah raporu hazır”, gövde rapordaki dört bölümün özeti, ör. “Önerilen emir: 6 cephe. 2 uyarı, 2 yer, kararını bekleyen 2 konu.” Sakin günde: “Bugün için önerilen cephe yok. Uyarı, yer ve bekleyen karar da yok.” Dokununca sabah raporu açılır.

### Çevrimdışı

Raporun üstünde bilgi kutusu: “Bağlantı yok. Rapor 08:00’deki haliyle gösteriliyor; dikte cihazda saklanır.” Onay, yanıt ve uyarı eylemleri pasif (.5 opaklık); onay çubuğunun altında “Onay için bağlantı gerekiyor. Diktelerin cihazda saklanır.” Harita ve son rapor cihaz önbelleğinden görünür; dikte mevcut cihaz kuyruğuna girer. Sunucu kaydı esas kalır.

---

## Harita mimarisi

Referans uygulama `Berthier Harita v7.dc.html` içindeki `class Component` mantığıdır. Fonksiyon adları aşağıda; birebir sayılar oradadır.

- **Dünya:** Koordinatlar `C.X0..X1 = -380..1180`, `C.Y0..Y1 = -420..1520`; karargâh `C.HQ = [400, 640]`. Kuzeyde sırt hattı `C.RIDGE`, güneydoğuya inen vadi `C.VAL` (geçit noktası `C.PASS`), vadiden güneye akan nehir `C.RIVER`, güneyde alçak tepeler `C.HILLS`, güneydoğuda ayrı bir yükselti `C.SE`.
- **Yükselti:** `height(x, y)`: alan çarpıtmalı fBm taban + tepeler + sırt hattına yakınlıkla artan `ridged` gürültü (Kulvar Dağları) + nehir/vadi oyması. Ders Ovası düşük ve yumuşak, kontur seyrek; dağlar sık konturlu.
- **Kontur ve gölge:** `geo()` alanı `C.ST = 6` px adımla örnekler, `C.LV = .036` aralıklı eş yükselti çizgilerini çıkarır (`rdp` sadeleştirme, `crC`/`crO` Catmull-Rom). `raster(PP)` hipsometrik renk rampası (`PP.HY`) ve kabartma gölgesini bir kez tuvale çizip resim olarak üretir; sonucu önbelleğe al (öneri: Web Worker veya ilk açılışta bir kez).
- **Bölgeler:** Kulvar → Kulvar Dağları, Ders → Ders Ovası, Başvuru → Başvuru Geçidi (vadi boyunca), Genel → karargâhın çevresindeki Genel Düzlük. Bölge adları haritada italik Instrument Serif ile yazılır (`regionCands`, `regionLabels`, `genelArc`, `genelFlat`); kamplar, etiketler ve patikayla çakışmayan yere konur.
- **Kamp yerleşimi:** Taslak `layout()` her tip için sabit yuvalar (`C.SLOTS`) kullanır. **Üretimde değiştirilmeli:** sayı sınırı olmadığı için her cephe için kimliğinden türetilen (hash) ve günden güne yerinden oynamayan bir konum üret; kendi bölgesinde kalsın, kamplar arası en az ~58 birim boşluk olsun, karargâha ve diğer kamplara binmesin. Yeni cephe eklenince eskiler kaymamalı.
- **Patika:** `astar(a, b)`, `C.PS = 12` birimlik ızgarada eğim maliyetli A*. Dik yamaçtan kaçar, vadi ve geçitleri izler; bacaklar önbelleğe alınır (`legPts`, ters yön yeniden kullanılır). Rota karargâhtan başlar ve emir sırasıyla kampları bağlar.
- **Bacak stilleri:** altta 6 px koyu kılıf `rgba(8,8,9,.55)`; sıradaki bacak 2.4 px kesik (`7 5`) `#c9ad7a`; sonraki bacaklar 2.2 px yuvarlak noktalı (`0.1 6.5`) `rgba(201,173,122,.55)`. İki ucu da alınmış bacak **mühür hattıdır**: üst üste 13 / 7 / 3.6 / 1.7 px çizgiler (`rgba(201,173,122,.1)`, `.24`, `.7`, çekirdek `#efe2c4`).
- **Kamp:** 44 px dokunma alanı, 38 px daire, mono .8125rem numara; çevresinde hafif açıklık ve kesik çit halkası. Seçili kamp kalın vurgu, sıradaki kamp ince halka. Etiket plakası `rgba(28,29,31,.92)`, ad 13 px 500, alt satır mono 10.5 px (kalan gün, “TARİHSİZ”, “BEKLETİLİYOR”).
- **Aciliyet** (`urg`): `kritik` eşiği varsayılan 2 gün, `yaklaşan` eşiği varsayılan 7 gün. Yaklaşan: mercan kenar ve mercan etiket (`#e0805e` / `#ea9a7c`). Kritik: mercan dolgu, koyu yazı `#1c1d1f` ve yavaş sonar halkaları (`sonar`); hareket azaltma açıksa tek sabit halka. Tarihsiz veya uzak: sakin gri. “0 gün” “BUGÜN”, “1 gün” “YARIN” yazar.
- **Geçilen kamp:** silinmez. Altın bayrak (`#d4b98a`, parıltı `0 0 0 4px rgba(212,185,138,.12), 0 0 14px 2px rgba(212,185,138,.3)`), her zaman görünen “GEÇİLDİ · 10:12” mührü.
- **Etiket yerleşimi** (`placeLabels`): adaylar kampın 8 yönü; etiket başka bir kampa kendi kampından ~10 px daha yakınsa reddedilir; ekran kenarına taşan aday içeri kaydırılır; karargâhın üstüne etiket konmaz. “GEÇİLDİ” mühürleri zorunludur (en iyi yer seçilir). Yer bulunamayan sıradan etiket gizlenir, yakınlaşınca görünür.
- **Hamleyi bitirince** (`startFx`, `rippled`): kamp 560 ms boyunca 1.36 ölçekten yerine oturur; konturlar kamptan dışa 1150 ms süren bir dalga ile kıpırdar; yeni oluşan mühür hattı 720 ms’de çizilir. Son hamlede ikinci, daha geniş dalga (480 ms gecikme, 2000 ms) ve “Sefer tamamlandı”. `prefers-reduced-motion` açıksa hiçbir hareket oynamaz.
- **Görünüm:** `fitView` (rotayı ve karargâhı sığdırır), `clampK` (yakınlaştırma sınırları), `zoomBy` / `refit` 300 ms ease-out. İşaretçi olayları `pDown/pMove/pUp`: iki parmakla kıstırma, fareyle kaydırma.
- **Sürükleyerek sıralama:** Dokunmatikte kampı 350 ms basılı tut (kısa titreşim), fareyle doğrudan sürükle; başka bir kampın üstüne bırak. Sürüklerken “Bırakırsan 03. sıraya geçer.” ipucu. Bırakınca “Yeni sıra hazır. [Vazgeç] [Sırayı kaydet]” çubuğu; kayıt mevcut `{kind:'reorder', ids, orderDate, orderSnapshot}` komutuyla yapılır ve kayıt defterinden geri alınabilir. Mevcut “Sırayı düzenle” penceresi ve klavye desteği kalır. Biten kamp sürüklenmez.

## Durum ve veri

- **Biten hamle anlık görüntüsü:** Bugün bir hamle bitince cephenin sıradaki hamlesi onun yerine geçiyor. Haritada “geçilen kamp” ve sefer defteri için günün emri her yuvada biten hamlenin metnini ve `doneAt` saatini saklamalı.
- **Sabah raporu:** Sunucu her gün 08:00’de (Europe/Istanbul, gün başlangıcı 04:00) raporu üretip saklar: önerilen emir ve gerekçeler, uyarılar (çakışma, daralan hazırlık), bugün/yarın yerleri ve yanına alınacaklar, bekleyen sorular ve mail taslakları. Sessiz saatlerde yakalanan çakışma bildirim yerine bu rapora girer.
- **Bildirimler:** Web Push (iOS 16.4+, yalnız ana ekrana eklenmiş uygulama). Servis çalışanı, VAPID anahtarları sunucuda, abonelik kullanıcıya bağlı D1 kaydında. Sunucu tarafında zamanlanmış gönderim gerekir: 08:30 rapor, Pazar 20:00 teftiş, akşam bildirimi kullanıcının saati, çakışma anında. Sessiz saatler 23:00–07:30. Sites ortamında zamanlanmış görev desteği ve ana ekran uygulamasında ChatGPT oturumunun korunması doğrulanmalı.
- **Tercihler:** akşam bildirimi saati (varsayılan 21:00), mevcut 08:30 / Pazar 20:00 / sessiz saatler.
- **Ölçümler:** rapor açılış zamanı, onay zamanı, elle düzenleme (sıra değişikliği, düzenleme) ve ayar değişikliği olayları; seferin başlangıç günü. Hiçbiri kullanıcıya baskı olarak gösterilmez.

## Tasarım tokenları · Grafit Gece

Uygulama:

| Ad | Değer |
|---|---|
| zemin | `#18191b` |
| yüzey | `#202123` |
| ikincil yüzey / çip | `#2a2b2d` |
| çizgi | `#343538` |
| metin | `#d6d3cb` |
| ikincil metin | `#8f8d88` |
| üçüncül metin | `#b3b0a8` |
| vurgu (altın) | `#d4b98a` |
| ana düğme | zemin `#333437`, kenar `#434448`, yazı `#e2dfd7` |
| sıcak çip | zemin `rgba(224,128,94,.18)`, yazı `#ea9a7c` |
| marka ✳ | `#ed845c` |

Harita:

| Ad | Değer |
|---|---|
| zemin | `#1c1d1f` |
| kontur (ince / ana) | `rgba(220,220,215,.08)` / `rgba(220,220,215,.2)` |
| nehir | `rgba(140,150,165,.42)` |
| patika | `#c9ad7a`, sönük `rgba(201,173,122,.55)` |
| mühür / bayrak | `#d4b98a`, çekirdek `#efe2c4` |
| mercan (yalnız aciliyet) | `#e0805e`, yazı `#ea9a7c`, kenar `rgba(234,154,124,.55)` |
| kamp | zemin `#222325`, kenar `#77756f` |
| etiket plakası | `rgba(28,29,31,.92)`, bölge adı `#b3b0a8` |
| kontrol grubu | `rgba(28,29,31,.9)`, kenar `rgba(150,148,142,.3)` |
| vinyet | `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,.5) 100%)` |
| gren | SVG fractalNoise, `soft-light`, opaklık .35 |

Hipsometrik rampa (`HY`, yükselti → RGB): 0 → 20,21,23 · .07 → 25,26,28 · .095 → 28,29,31 · .16 → 31,32,34 · .3 → 36,37,39 · .5 → 42,43,46 · .75 → 49,50,53 · 1 → 57,58,61 · 1.3 → 70,71,74. Kabartma: ışık `[95,96,98]` × .35, gölge × .5.

Yazı: Instrument Serif (başlıklar, yer adları, bölge adları italik), DM Sans 400–700 (gövde), IBM Plex Mono 400–500 (etiketler, sayılar; .75rem, harf aralığı .06–.1em). Köşeler: düğme 10–12, kart 14, cephe kartı 20, panel 22–23. Dokunma alanı en az 44 px.

## Varlıklar

- Yazı tipleri Google Fonts (`app/layout.tsx` zaten yüklüyor).
- İkonlar Lucide (mevcut kodda kullanılıyor): history, settings, arrow-left, arrow-down-up, check, chevron-right, flag, wifi-off, audio-lines, plus, compass, map, calendar-days, clipboard-check.
- Gren dokusu satır içi SVG (fractalNoise). Görsel dosya yok.

## Dosyalar

- `Berthier Harita v7.dc.html`: harita (Karargâh + atlas), Grafit Gece. Mantık sınıfı arazi, rota, etiket ve efektlerin referans uygulamasıdır. Sayfadaki önceki tur bağlantıları bu pakette yok.
- `Berthier P5.dc.html`: kilit ekranı, sabah raporu, sefer defteri, bildirim tercihleri.
- `Berthier Mevcut.dc.html`: depodaki 26 Eylül hâlinin birebir kopyası (karşılaştırma için).
- `DURUM.md`: 1 Ekim kararlarıyla güncel durum dosyası; depodaki `docs/DURUM.md`’nin yerine geçer.
- `support.js`: tasarım dosyalarını tarayıcıda açmak için gerekli çalışma dosyası (depoya girmez).
