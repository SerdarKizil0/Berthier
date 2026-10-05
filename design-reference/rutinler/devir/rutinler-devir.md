# Rutinler ve dikte türleri · Claude Code devir notu

Tasarım: `Berthier Rutinler.dc.html` (4 Ekim 2026). Ekran kimlikleri (A1–A7, B1–B4, C1–C4, D1–D3, R1–R4) ve kararlar (K6–K10) o dosyadadır. Görsel dil Grafit Gece; yeni renk yok, yalnız `app/atlas.css` tokenları.

## Kararlar

- **K6** Alt çubuk: Karargâh · Rutinler · Söyle · Ufuk · Defter. Harita, cephe sayfaları ve sabah raporu açıkken Karargâh seçili görünür. Harita sayfası aynen kalır (`ExpeditionMap variant="atlas"` + liste), Karargâh’taki “Haritada aç” ve cephe bağlantılarıyla açılır.
- **K7** Tür anahtarları aynı (`course`, `lane`, `application`, `general`), Türkçe adlar değişir: Ders, Proje (eski Kulvar), Başvuru, İş (eski Genel). Tür hiçbir ekranda sorulmaz; yalnız cephe sayfasının meta satırında yazar ve oradan değişir (`retype`). Harita bölgeleri: PROJE DAĞLARI, DERS OVASI, BAŞVURU GEÇİDİ, İŞ DÜZLÜĞÜ. Liste: Dersler · Projeler · Başvurular · İşler. Fikir deposu, teftiş adımı ve Karargâh notunda “kulvar” → “proje”.
- **K8** Dikte sonucu durum kartında makbuz: her kalem türüyle (HAMLE, RUTİN, TARİH, FİKİR, KAYIT), belirsiz kalemde Berthier’in ikinci tahmini tek dokunuşluk pil. En çok üç satır, seçenekli satır üstte; seçenekli makbuz 12 sn, diğerleri 8 sn. Kayıt defterinde “YAPILANLAR” → “YERLEŞTİRME”, satır başına “Değiştir”.
- **K9** Teftiş altı adım: BAYAT · DEPO · PROJE · UFUK · RUTİN · ÖZET. Rutin yoksa RUTİN adımı atlanır.
- **K10** Durum kartı öncelik: hata › soru › sonuç › sayaç (`is-running`) › hatırlatma (`is-routine`) › işleniyor › çevrimdışı kuyruk.
- Değişmeyenler: sabah raporunun dört bölümü (rutin girmez), Ufuk ve tarih türleri, kamp yerleri, rutinler emre ve haritaya girmez.

## Veri (`State`, JSON; migrasyon yok)

```ts
type Routine = {
  id: string; title: string;
  count: number;                       // haftada kaç seans; her gün = 7
  status: 'observing' | 'settled' | 'paused';
  createdAt: string; observeFrom: string;          // dayKey
  estimate?: { minutes?: number; time?: string };  // kullanıcının söylediği, aynen
  pattern?: { days: number[]; time: string; minutes: number; range?: [number, number]; after?: string; approvedAt: string };
  travel?: number;                     // tek yön dk; toplam süreye 2× eklenir
  steps?: { key: string; title: string; offsetMin: number; activeMin: number; wait?: boolean }[];
  timer: boolean;                      // kayıt sayaçla mı (öğrenmede true)
  reminder: { on: boolean; leadMin: number; group?: 'a' | 'b' };
  ownWords?: { text: string; show: boolean; sourceId: string };   // ham dikteden aynen
  avoidDays?: number[];                // öğrenilen kaçan günler (0 = Paz)
  asked?: { reminderOff?: string; timerOff?: string; declinedUntil?: string };
};
type Session = { id: string; routineId: string; day: string; start?: string; end: string; minutes: number; source: 'timer' | 'tap' | 'dictation' | 'review'; step?: string };
type Skip = { routineId: string; day: string; at: string; slidTo?: string };
// State eklemeleri
routines?: Record<string, Routine>; sessions?: Session[]; skips?: Skip[];
running?: { routineId: string; start: string; step?: string } | null;
kindPreferences?: { text: string; from: Kind; to: Kind; at: string }[];
typePreferences?: { title: string; from: FrontType; to: FrontType; at: string }[];
reminderTrial?: { startedAt: string; a: string[]; b: string[] };
```

`commitChanges`/`value`/`put` için yeni anahtar `routines` (routines + sessions + skips + running + reminderTrial). `kindPreferences` ve `typePreferences` mevcut `preferences` anahtarıyla birlikte tutulabilir. `lib/ledger.ts`: `describeOp` için RUTİN, SEANS, BUGÜN DEĞİL, DÜZEN, TÜR satırları.

## Komutlar (`app/api/state/route.ts`, zod)

| Komut | Alanlar | Etiket |
|---|---|---|
| routineStart | routineId, step? | Sayaç başladı |
| routineFinish | end?, minutes? | Rutin kaydedildi |
| routineLog | routineId, day?, end?, minutes? | Rutin kaydedildi |
| routineSkip | routineId, day | Bugün değil |
| routinePattern | routineId, days, time | Haftalık düzen değişti |
| routinePatternAll | ids, reminder: none/half/all | Haftalık düzen onaylandı |
| routineReminder | routineId, on, leadMin? | Hatırlatma açıldı / kapandı |
| routineTimer | routineId, on | Sayaç / tek dokunuş |
| routineOwnWords | routineId, show | Kendi sözün |
| routinePause | routineId, paused | Rutin durduruldu / açıldı |
| routineMerge | routineId, targetId | Rutinler birleştirildi |
| rekind | sourceId, ref, to, count? | Tür değiştirildi |
| retype | frontId, type | Cephe türü değiştirildi |

Hepsi `commitChanges` ile, geri alınabilir. `rekind` taşıdığı kaydı tek değişiklikte siler/oluşturur; ham dikte (`dictations`) aynen kalır.

## Model (`lib/llm.ts`)

- `Result` eklemeleri: `routines: [{id|null, title, count, time|null, minutes|null, travel|null, ownWords|null, steps|null, alt: 'move'|null}]`, `sessions: [{routineId|null, title, dayText, end|null, minutes|null, skip}]`, `items[].alt: 'routine'|null`.
- Ayırma kuralları (sırayla): 1) saati başkası koyduysa tarih, kendin koyduysan rutin; 2) sıklık sözü → rutin; 3) var olan rutinin adı → kayıt (yap: bugünkü seans, yaptım: seans, bugün değil: kaydır), yeni şey açılmaz; 4) sıklık yok ama tekrar eden türde eylem → hamle + `alt:'routine'`; 5) fikir kuralı (P3) aynen; 6) kalanı hamle. Tür belirsizliği için soru sorulmaz; cephe belirsizliği için bugünkü tek soru kalır.
- `ownWords` yalnız kullanıcı bir neden söylediyse, ham metinden aynen alıntı (≤120 karakter); uydurma yok.
- TYPE metni: course=ders; lane=proje (tez, araştırma, proje, kendi çalışması); application=başvuru; general=iş (kısa, bitince kapanan; kişisel bakım/spor/yemek rutindir).
- `kindPreferences`/`typePreferences` son 30 örnek bağlama.
- Testler: “yüz yogası yap” (rutin yok → hamle+alt; rutin var → kayıt, yeni hamle yok), “her Pzt 14:00 lab” → tarih (weekly), “haftada 3 gym, 20 dk yol” → rutin travel=20, “yogayı yaptım 25 dakika” → seans, “dün yoga yapamadım” → skip.

## Kurallar

- Hafta Pazartesi 04:00’te döner (`dayKey`). Günün toplamı: kalan seansların ortanca aktif süresi; yol dahil, bekleme hariç.
- **Gözlem → öneri:** rutin eklendikten ≥14 gün ve ≥ max(3, 1,5 × count) seans (count=7 için ≥7). Öneri Pazartesi 04:00’ten sonra ya da teftişte görünür. Kaydı az olan gözlemde kalır.
- **Günler:** son 2–4 haftanın seanslarına göre en sık `count` gün; planlıyken ≥2 kez kaçan gün `avoidDays`’e girer ve önerilmez (yerine en yakın sık gün, kesik çiple gösterilir). **Saat:** başlangıç ortancası, 15 dk’ya yuvarlı. **Süre:** sayaçlı seans ortancası; (p90−p10) > ortanca/2 ise “30–90 dk” biçiminde aralık.
- **Zincir (`after`):** iki rutinin seansları ≥3 kez 15 dk içinde arka arkaya ise; satırda “↳ … ardından”, tek hatırlatma.
- **Kayma:** planlı gün 04:00’te seanssız geçerse ya da “bugün değil”de, haftanın kalan günlerinden ilk uygun gün: düzende değil, `avoidDays`’te değil, o saatte sabit kalem (Ufuk) yok. Uygun gün yoksa kaymaz; sayı olduğu gibi kalır. Cezalandırıcı dil, kırmızı, seri yok.
- **Hatırlatma:** gözlemde kapalı. Blok saati − `leadMin` (10; yol varsa travel + 10). Blok başına bir, rutin başına günde bir, tekrar yok. Sessiz saat (Tercihler › Ritim) aralığına düşerse push yok, yalnız uygulama içi. Yapıldıysa / bugün değilse düşer. İçerik: başlık “<Rutin> · <saat>”; gövde “<bu hafta n/N | haftanın ilk seansı> · <ardından …> · <≈süre>”, gün sabit kalem taşıyorsa “<saat> boş”; ikinci satır kendi sözü (show=true ise). iOS’ta düğme yok varsayılır; dokunma rutinin kayıt sayfasını açar.
- **Uygulama içi karşılık:** uygulama açıkken [hatırlatma saati, blok bitişi] aralığında durum kartı `is-routine` (Başlat · Bugün değil · ×). × yalnız o gün için gizler. `reminderFor(state, now)` saf fonksiyon olsun; bildirim dalı aynı fonksiyonu kullanır.
- **İskele:** hatırlatmayı kapatma önerisi: düzen ≥3 hafta onaylı, her hafta hedef, seansların ≥%75’i hatırlatma saatinden önce başladı. Sayaçtan tek dokunuşa: ≥8 ölçüm ve (p90−p10) ≤ ortanca/4. Reddedilince 4 hafta sorulmaz. Kart Rutinler’de ve teftişin RUTİN adımında; biri yanıtlanınca öteki düşer.
- **Deneme (`reminder: half`):** rutinler saat dilimi ve sıklığa göre sıralanıp sırayla a/b gruplarına; a’da hatırlatma açık. 14 gün sonra teftişte iki grubun seans sayıları yan yana; yorum yok; seçenekler: Hepsine aç · Böyle kalsın · Hepsini kapat.
- **Sayaç unutulursa:** olağan sürenin 2 katı geçince bir sonraki açılışta durum kartında “Hâlâ sürüyor mu?” (Bitti · Bitişi düzelt).
- **Adımlı rutin:** her adım ayrı kayıt; bekleme adımı süre yazmaz, sonraki adımın saatini hesaplar (öğrenilen ortanca bekleme). Hafta sayısı son adımla tamamlanır.

## Ekranlar ve ölçüler

- **Rutinler sekmesi** (A3): `.page-top` (“5 – 11 EKİ · HAFTANIN 1. GÜNÜ”, sağda + = Söyle’yi “Yeni rutin” bağlamıyla açar), `.page-title`, BUGÜN bölümü (başlıkta “KALAN ≈…”, --gold), BU HAFTA bölümü. Bugün satırı: grid `48px minmax(0,1fr) auto`, gap `2px 10px`, padding `11px 0`, alt çizgi `--border`; saat `400 13px` mono (yapılan/sıradaki --gold, diğerleri --muted-foreground); ad 15px/1.4 (sıradaki 600; yapılan --muted-foreground, üstü çizilmez); alt satır 12px; çip `.hq-chip` (yapılan `is-done` “✓ 22 DK”). Sabit kalem satırı soluk, çipsiz. Zincir satırı saat yerine “↳”.
- **Hafta satırı:** grid `minmax(0,1fr) auto`, padding `11px 0`; ad 15px 500, alt satır 12px (günler · saat); nokta 8px, gap 5px, dolu `--gold`, boş `inset 0 0 0 1.5px var(--track-dot)`; sayı `500 12px` mono `--tertiary-foreground`, min-width 28px.
- **Gözlem kartı** (A1): `.review-card` düzeni; üst satır GÖZLEM (--gold) · “11. GÜN / 14”; 14 hücrelik şerit 6px yükseklik, gap 4px (geçen `--gold-strong`, bugün `--gold` + parıltı, gelecek `--cell-future`).
- **Haftalık düzen** (A2): iç sayfa; kart başına rutin; gün çipleri 7 sütun, gap 5px, min-height 40px, radius 10px, `500 12px` mono; seçili `--gold-soft` / `--gold-line` / `--gold`; önerilmeyen ama denenmiş gün kesik `1px dashed var(--input)`. Alt çubuk yerine `.mr-bar`: üstte HATIRLATMA seçimi (Hiçbirine · Yarısına · deneme · Hepsine, 36px pil), altta `.btn-main` “Düzeni onayla · N RUTİN”.
- **Kayıt sayfası** (A4): `SaySheet`; `.btn-main` Başlat (lucide Play 18), altında iki `.btn-quiet` (Yaptım · Bugün değil), 14px açıklama “Bugün değil dersen seans <gün saat>’a kayar.” Süresi oturmuş rutinde ana eylem Yaptım, Başlat ikinci.
- **Rutin ayrıntısı** (A6): düzen kartı, SÜRE şeridi (ölçümler 8px nokta, ortanca 2px × 32px --gold çizgi, ilk tahmin 16px halka, eksen 20/30/40 dk), Sayaç kalsın / Tek dokunuş (`.stale-choices` düzeni), Hatırlatma ve Kendi sözün (`.pref-group`).
- **Durum kartı:** `is-running` — `--gold-line` kenar, 9px nabız noktası (`rec-pulse` 1,6 sn), ad --gold 600, süre `400 20px` mono tabular, “Bitti”. `is-routine` — `.is-question` düzeni; kendi sözü 13px, `border-left: 2px solid var(--input)`, `margin-left: 32px`; pil “Başlat” (gold) ve “Bugün değil”.
- **Makbuz** (C1): kart içi satırlar grid `52px minmax(0,1fr)`, padding `8px 0`, `border-top: 1px solid var(--border)`, `margin-left: 32px`; tür `500 11px` mono .08em `--gold`; alt satır 12px; seçenek pili min-height 32px, radius 16px, `--secondary` / `--input`.
- **Cephe türü** (C3): meta satırında tür --gold + ChevronDown 14; dokununca `SaySheet` “Bu cephe ne?”: beş satır (İş, Ders, Proje, Başvuru, Rutin), her birinde renk çizgisi 3×16 ve 13px sonuç cümlesi, seçili satırda --gold Check.
- **Karargâh** (D1): “Bugün ve yarın”ın ilk satırı `hq-line-item`: lucide Repeat 18, etiket “RUTİNLER · BUGÜN n · KALAN ≈…”, metin “Sıradaki <saat> · <blok>”, eylem “Rutinleri aç”; satır zemini `linear-gradient(90deg, rgba(212,185,138,.07), transparent 70%)`.
- **Teftiş** (D3): `.review-steps-bar` 6 sütun; RUTİN adımı: rutin satırları (ad · n/N · “+ Seans”), ilk üçten sonra “+N rutin”, iskele ve deneme kartları.
- **Alt çubuk** (D2): ikinci yuva lucide `Repeat` 22, “Rutinler”.

## Uygulama sırası

1. Veri, komutlar, geri alma, Kayıt defteri dili (`--ui` testlerine rutin satırları).
2. Model şeması ve ayırma kuralları, deterministik ve canlı testler.
3. Rutinler sekmesi, kayıt sayfası, sayaç, durum kartı hâlleri (K6, K10).
4. Gözlem kartı, haftalık düzen sayfası, kayma ve öğrenme fonksiyonları (saf, testli).
5. Karargâh satırı, makbuz, cephe türü sayfası, harita/fikir/teftiş metinleri (K7, K8).
6. Teftiş RUTİN adımı, iskele ve deneme kartları (K9).
7. Uygulama içi hatırlatma; bildirim dalı için `reminderFor(state, now)` ve içerik biçimi hazır.
