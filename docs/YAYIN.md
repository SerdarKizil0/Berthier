# Berthier · Yayın: Sites'tan Cloudflare'e taşıma planı

**Durum:** Onay bekliyor (2 Ekim 2026). Bu dalda (`claude/cloudflare-yayin`) şimdilik yalnız bu plan var; kod değişmedi. Onaydan sonra uygulama aynı dalda yapılır. Taşıma, Adım B'den önce biter.

## Kısaca

- **Yayın:** GitHub deposu Cloudflare Workers Builds'e bağlanır.
  - `main`'e her merge derlenip kendiliğinden yayına çıkar; başka dallar yayına çıkmaz.
  - Derleme başarısız olursa yayındaki sürüm değişmez.
- **Veri:** Sites'taki "Verilerimi dışa aktar" dosyası, yeni uygulamaya eklenecek "Yedekten geri yükle" ile alınır.
  - Tablolar ve JSON biçimi aynen kalır.
  - Sunucuda saklanmış dosya yok; taşınacak dosya da yok.
- **Giriş:** ChatGPT girişinin yerine tek kullanıcılı parola ve uzun ömürlü oturum (önerim).
- **Sırlar:** API anahtarları ve parola yalnız Cloudflare paneline girer; sohbete ve depoya girmez.
  - Benim Cloudflare hesabına erişimim olmaz: ben push ederim, sen merge edersin, Cloudflare yayınlar.
- **Sites:** Yenisi sorunsuz çalışana kadar olduğu gibi açık kalır; oraya bir daha yayın yapılmaz.

## 1. Yayın düzeni

### Kodda değişecekler

- **Kökte `wrangler.jsonc`** (yeni):
  - Worker adı `berthier`. Giriş noktası bugünkü gibi vinext.
  - D1 bağlantısı `DB` → veritabanı `berthier`. Kimliğini sen oluşturduktan sonra yazarım.
  - Migrasyon klasörü `drizzle/`.
  - Yalnız `berthier.<alt-alan>.workers.dev` açık; sürüm önizleme adresleri kapalı (`preview_urls: false`).
  - Panelden girilen değişkenler yayında silinmez (`keep_vars: true`).
  - Günlükler (observability) açık.
  - Giriş denemesi sınırlayıcısı `GIRIS_SINIRI`: IP başına dakikada 5 deneme.
- **`vite.config.ts`:**
  - Sites eklentisi ve `.openai/hosting.json` içe aktarması kaldırılır.
  - Cloudflare eklentisi ayarları `wrangler.jsonc`'ten okur.
  - Böylece temiz klonda `npm ci && npm run build` yerel stub olmadan çalışır.
- **`package.json`:** `deploy` komutu eklenir: `wrangler d1 migrations apply DB --remote && wrangler deploy`.
  - Önce bekleyen migrasyonları uygular, sonra yayınlar.
  - Yeni migrasyon yoksa ilk kısım bir şey yapmaz.
- **`.node-version`:** `22`. Yerelde kullandığımız sürüm; Cloudflare'in varsayılanı 24.

**Ön deneme** (yerelde yapıldı, commit'lenmedi):

- Bu ayarlarla stub olmadan derleme geçti.
- `wrangler deploy --dry-run` geçti: 1,0 MB paket; `DB` ve `GIRIS_SINIRI` bağlantıları görünüyor.
- `wrangler d1 migrations list`, `drizzle/0000_brief_nekra.sql` dosyasını buldu.

### Akış

1. Ben çalışma dalına push ederim. Dallar yayına çıkmaz; önizleme derlemeleri kapalı.
2. Sen PR'ı `main`'e merge edersin. Cloudflare derler, migrasyonları uygular ve yayınlar; birkaç dakika sürer.
3. Sonuç, GitHub'da commit'in yanındaki Cloudflare denetiminde görünür; ben de oradan izlerim. Ayrıntılı günlük panelde: Worker › Deployments › View build history.
4. Geri dönüş: Worker › Deployments'ta önceki sürümün yanındaki üç nokta › Rollback.
   - Bu kodu geri alır, veriyi geri almaz.
   - Veri için dışa aktarılan yedek ve D1'in zaman yolculuğu (Time Travel) var.

### Adres ve maliyet

- Adres `https://berthier.<alt-alan>.workers.dev` olur. Alan adı gerekmez; istersen sonra kendi alan adını bağlarız.
- **Ücretsiz plan:** İstek başına 10 ms CPU sınırı var; aşan istek "Error 1102" ile düşer.
  - Yerel ölçümde ana sayfa isteği 16–34 ms sürdü; çoğu, sayfanın sunucuda çizimi.
  - Cloudflare'de daha kısa sürebilir, ama sınırın üstünde kalması muhtemel.
- **Önerim: Workers Paid, ayda 5 $.**
  - İstek başına CPU sınırı 30 sn.
  - D1 zaman yolculuğu 30 gün (ücretsizde 7).
  - Plana dahil kota bu kullanım için fazlasıyla yeter.
- Ücretsiz başlamak istersen deneme süresinde Worker › Metrics › Errors'a bakarız. "Exceeded CPU Time Limits" görünürse Paid'e geçeriz; kod değişmez.
- Derleme kotası ücretsiz planda ayda 3.000 dakika, Paid'de 6.000; bir derleme birkaç dakika sürer.

## 2. Veri

### Ne taşınır

- Sunucudaki her şey iki tabloda:
  - `notebooks`: tek satır, defterin tamamı tek bir JSON. Cepheler, emirler, takvim kalemleri, fikir deposu, teftiş ve değişiklik geçmişi.
  - `dictations`: ham dikteler, durumları ve sonuçları.
- Sites'taki **Tercihler › Verilerimi dışa aktar** ikisini de eksiksiz verir: `state` (defterin tamamı) ve `dictations` (bütün dikteler, sınırsız).
  - Kodda doğrulandı: Dosya `/api/state`'in döndürdüğü veriden yazılır. O da `notebooks.data`'nın tamamını ve senin bütün dikte satırlarını döndürür.
  - Bu düğme yayındaki P4 sürümünde var.
- **Yüklenen dosya yok:**
  - Ses, görsel ve PDF yalnız döküm için anında işlenip atılıyor.
  - D1'e, R2'ye ya da sağlayıcıların dosya alanlarına yazılmıyor; R2 hiç tanımlanmadı.
- **Taşınmayanlar** (yalnız cihazda duranlar):
  - Gönderilmemiş dikte taslağı.
  - Yarım kalmış ses ya da dosya taslağı.
  - Cihaz kuyruğu: çevrimdışıyken yapılıp henüz gönderilmemiş işlemler.

  Yeni adres ayrı bir site sayıldığı için bunlar oraya geçmez. Geçişten önce bitirilmeleri gerekir (bkz. 18. adım).
- Codex'in yerel önizlemesindeki eski yedek (`.sites-runtime/preview-backup.json`, "Staj Defteri") zaten Sites'ta değildi; bu taşımaya dahil değil.

### Veri yapısı değişmez

- Yeni veritabanına mevcut `drizzle/0000_brief_nekra.sql` aynen uygulanır. Yeni tablo, sütun ya da JSON alanı eklenmez.
- **Sahip kimliği:** Sites'ta ChatGPT kullanıcı kimliğiydi; yeni uygulamada tek ve sabit bir sahip var (`sahip`). İçe aktarma veriyi bu sahibe yazar; defterin içeriği değişmez.

### İçe aktarma (kalıcı özellik: yedekten geri yükleme)

- **Tercihler › Yedekten geri yükle:**
  - Dışa aktarılmış JSON dosyası seçilir.
  - Özet gösterilir: dışa aktarma tarihi; cephe, değişiklik ve dikte sayıları.
  - "Sunucudaki defterin yerine geçer" uyarısıyla onay istenir.
- **Sunucu tarafı (`POST /api/import`):**
  - Giriş, aynı köken denetimi ve 10 MB sınırı var.
  - Dosyanın biçimi denetlenir.
  - Dosyada gönderilmemiş cihaz kuyruğu (`outbox`) varsa işlem reddedilir.
- **Yazma tek bir D1 toplu işlemidir; yarım kalmaz:**
  - Defter satırı değiştirilir. Revizyon artar; açık kalmış eski bir sekme yeni defterin üstüne yazamaz.
  - Senin dikte satırların silinir. Dosyadakiler aynı kimlik, tarih, durum ve sonuçla eklenir.
- **Sorgular parametrelidir.** Dosyayı SQL'e çevirip `wrangler d1 execute` ile yüklemek D1'in 100 KB'lık SQL ifadesi sınırına takılırdı; bu yol takılmaz.
- **Sonrası:** Uygulama yenilenir. "Kuyrukta" görünen dikteler yeni uygulamada kendiliğinden işlenir.
- Aynı dosya iki kez yüklenebilir; ikincisi birincinin yerine geçer. Deneme taşıması ve asıl geçiş bu sayede aynı düğmeyle yapılır.

## 3. Giriş

### Öneri: parola ve uzun ömürlü oturum

- **Parola:**
  - Cloudflare panelinde `GIRIS_PAROLASI` adında bir sır tanımlarsın.
  - En az 16 karakter olmalı. iCloud Anahtar Zinciri gibi bir parola yöneticisiyle üretip orada sakla.
  - Parolayı ben görmem; depoda yalnız adı geçer.
- **`/giris` sayfası:**
  - Tek bir parola alanı var; parola yöneticisi doldurabilir.
  - Doğru parolada bir yıllık oturum çerezi verilir (`HttpOnly`, `Secure`, `SameSite=Lax`). Uygulamayı kullandıkça süre yenilenir.
- **Çerezin imzası:**
  - Çerez, parolanın kendisinden türetilen bir anahtarla imzalanır.
  - Parolayı değiştirmek bütün cihazlardaki oturumları kapatır. Telefon kaybolursa yapılacak tek şey budur.
- **Korumalar:**
  - Parola sabit süreli karşılaştırılır.
  - Cloudflare'in hız sınırlayıcısıyla IP başına dakikada 5 deneme sınırı konur.
  - Parola tanımlı değilse ya da 16 karakterden kısaysa giriş tamamen kapalı kalır; sayfa kurulumun eksik olduğunu söyler.
  - POST isteklerindeki mevcut köken denetimi sürer.
- **iPhone:** Giriş aynı adreste yapılır, başka siteye gidip gelinmez. Bu yüzden ana ekran uygulamasında sorunsuz çalışır.
- **Tercihler:** "Çıkış yap" eklenir.
- **Koddaki değişiklikler:**
  - `app/chatgpt-auth.ts` yerine `app/auth.ts` gelir.
  - `page.tsx`, `api/state` ve `api/media` yeni işlevi kullanır.
  - 401 alan istemci giriş sayfasına yönlenir.
  - Servis çalışanı `/giris`'i önbelleğe almaz.
- **Yerel testler:**
  - Yalnız yerelde açılan bir test başlığı (`x-berthier-test-owner`) iki koşulla çalışır: yerel başlatma komutundaki bayrak ve isteğin `127.0.0.1` ya da `localhost`'a gelmesi. Yayında ikisi de yoktur.
  - QA testleri bugünkü gibi ayrı kimliklerle çalışır.

### Değerlendirip önermediklerim

- **Cloudflare Access** (e-postaya tek kullanımlık kod): Giriş Cloudflare'de yapılır, iyi bir seçenek. Ama:
  - Zero Trust kurulumu ücretsiz planda bile ödeme bilgisi istiyor.
  - Statik dosyalı Worker'larda Cloudflare, girişi yapanın kimliğini koda iletmiyor. Uygulamanın bu kimliği taşıyan imzayı (JWT) ayrıca doğrulaması gerekiyor.
  - Giriş başka bir alan adında yapılıyor. iPhone ana ekran uygulamasında oturum açmak ve süre dolunca yeniden girmek sürtünmeli.
- **Passkey** (Face ID ile giriş): En rahat ve en güvenli yol. Ama:
  - Anahtarı saklamak için yeni bir tablo gerekiyor; "veri yapısı değişmesin" şartına uymuyor.
  - Taşıma bittikten sonra ayrı bir iş olarak eklenebilir.

## 4. Senin yapacakların (adım adım)

**Önemli:**

- Anahtarları ve parolayı yalnız Cloudflare paneline yaz; sohbete yazma.
- Senden istediğim tek bilgi D1 veritabanının kimliği (Database ID). Bu bir anahtar değil: Hesabına giriş yetkisi olmadan hiçbir işe yaramaz; Cloudflare'in kendi örneklerinde de depoya yazılır.
- Yine de sohbete yazmak istemezsen GitHub'da `wrangler.jsonc` dosyasına kendin yapıştırabilirsin.

### A. Hesap ve veritabanı (ben kodu yazarken yapılabilir)

1. https://dash.cloudflare.com/sign-up adresinden hesap aç ve e-postanı doğrula. Profil › Authentication'dan iki adımlı doğrulamayı aç.
2. Workers & Pages sayfasında "Your subdomain" yanındaki `workers.dev` alt alan adına bak; istersen Change ile değiştir (ör. `serdar`). Uygulamanın adresi `berthier.<bu-ad>.workers.dev` olur.
3. Önerilen: Workers & Pages'teki Plans bölümünden Workers Paid'e geç ($5/ay). Ücretsiz kalacaksan bu adımı atla.
4. Storage & Databases › D1 SQL database › Create Database:
   - Ad: `berthier`. Konum: otomatik.
   - Oluşunca sayfadaki Database ID'yi bana gönder.

### B. Derleme anahtarı (PR merge edilmeden önce)

Cloudflare'in kendiliğinden oluşturduğu derleme anahtarında D1 izni yok. Onsuz yayın sırasında migrasyon uygulanamaz; bu yüzden ayrı bir anahtar gerekiyor.

5. Sağ üstte profil › API Tokens › Create Token. "Edit Cloudflare Workers" şablonunda Use template'e bas.
6. İzinleri ayarla:
   - Permissions'a bir satır ekle: Account › D1 › Edit.
   - Account Resources: kendi hesabın. Zone Resources: All zones.
   - Continue to summary › Create Token.
   - Ekranda çıkan değeri hiçbir yere yazma; Cloudflare anahtarı kendi listesinden seçecek.

### C. Depoyu bağlama (PR `main`'e merge edildikten sonra)

7. Workers & Pages › Create application › Import a repository › Get started.
8. Git hesabı olarak GitHub'ı seç. "Cloudflare Workers and Pages" uygulamasını kur; Repository access › Only select repositories › `Berthier`.
9. `SerdarKizil0/Berthier` deposunu seç ve ayarları gir:
   - Project name: `berthier`. `wrangler.jsonc`'teki adla aynı olmalı.
   - Production branch: `main`
   - Build command: `npm run build`
   - Deploy command: `npm run deploy`
   - Advanced settings › API token: 6. adımda oluşturduğun anahtar.
     - Formda bu seçenek yoksa ilk derleme D1 izni hatasıyla durur.
     - O zaman Settings › Build › API token'dan bu anahtarı seç. Ardından Deployments › View build history'den derlemeyi Retry build ile yeniden başlat.
   - Build variables: boş bırak.
10. Save and Deploy. İlk derleme birkaç dakika sürer.
11. Worker › Settings › Build › Branch control'de "Enable Preview Builds" kapalı olsun; yalnız `main` yayına çıksın.

### D. Sırlar ve parola

12. Worker › Settings › Variables and Secrets › Add. Her birinde Type olarak **Secret** seç:
    - `GIRIS_PAROLASI`: parola yöneticinle ürettiğin, en az 16 karakterlik parola.
    - Model anahtarları, Sites'taki adlarla:
      - `ANTHROPIC_API_KEY`; varsa `ANTHROPIC_WORKSPACE_ID` ve `ANTHROPIC_MODEL`.
      - Ses dökümü için `GEMINI_API_KEY`; varsa `GEMINI_MODEL` ve `GEMINI_AUDIO_MODEL`.
      - Model adı tanımlamazsan kodun varsayılanı kullanılır: Claude için `claude-sonnet-5`, Gemini için `gemini-2.5-flash`.
      - Cloudflare için yeni anahtar üretmen daha iyi; Sites'takini kapattığında bu etkilenmez. Mevcut anahtarlar da olur.
    - Deploy'a bas. Sırlar hemen geçerli olur ve sonraki yayınlarda korunur.
13. iPhone'da Safari'yle `https://berthier.<alt-alan>.workers.dev` adresini aç ve parolayla gir.
    - Paylaş › Ana Ekrana Ekle ile uygulamayı ekle.
    - Deneme süresince adını "Berthier CF" yaparsan ikisini karıştırmazsın.

### E. Deneme taşıması

İkisini de bilgisayarda yapmak en kolayı. Ana ekran uygulaması, dosyayı indirmek yerine önizleme açabilir.

14. Sites'ı aç (https://berthier-serdar.serdar16.chatgpt.site) › Tercihler › Verilerimi dışa aktar. `berthier-<tarih>.json` dosyası iner.
15. Yeni uygulamada Tercihler › Yedekten geri yükle › dosyayı seç › özeti kontrol et › Geri yükle.
16. Bir iki gün dene: Karargâh, Harita, Ufuk, dikte (Claude), ses (Gemini), belge, teftiş.
    - Bu sürede asıl kullanımın Sites'ta sürsün.
    - Denemede yaptığın değişiklikler asıl geçişte silinir.
17. Sorun görürsen bana yaz. Hata metni ya da ekran görüntüsü yeter; anahtar gerekmez.

### F. Asıl geçiş

18. Telefonda Sites'ı çevrimiçi aç. Kayıt defteri › Ham dikteler'de "Kuyrukta" yazan kayıt, yarım ses ya da dosya taslağı kalmadığını kontrol et.
19. Sites'tan yeniden dışa aktar. Yeni uygulamada bu dosyayı geri yükle; deneme verisinin yerine geçer.
20. Bundan sonra yalnız yeni uygulamayı kullan. Sites'ta yapılan değişiklik yeni uygulamaya geçmez.
21. Bana "geçiş tamam" de. Belgeleri güncellerim, sonra Adım B'ye geçeriz.

## 5. Sites yedeği

- Sites'taki uygulama ve verisi olduğu gibi kalır; oraya yayın yapılmaz, kapatılmaz.
- `.openai/hosting.json` depoda kalır; yedeğin proje kimliği orada.
- Asıl geçişten sonra Sites, geçiş anının donmuş bir kopyasıdır.
  - Yeni uygulamada sorun çıkarsa Sites'a dönülebilir.
  - Geçişten sonra yeni uygulamaya girilenler Sites'ta olmaz. Bunlar yeni uygulamadan dışa aktarılır, sorun giderilince geri yüklenir.
- Sites'ı ne zaman kapatacağına sen karar verirsin.
  - Önerim: Adım B ve C yeni yayında sorunsuz çalıştıktan sonra.
  - Kapatınca Sites'a özel dosyaları (`.openai/`, Sites betikleri) ayrı bir temizlik işinde kaldırırım.

## 6. Belgeler (taşıma bitince)

- **`CLAUDE.md`:**
  - Teknoloji ve "Push ve yayın" bölümleri Cloudflare düzenine göre yeniden yazılır.
  - "Bilinen tuzak: Sites eklentisi" bölümü kalkar; stub artık gerekmez.
  - Eklenenler: sırların yeri ve adları, yerel test girişi, migrasyonların yayında kendiliğinden uygulandığı, içe ve dışa aktarma, Sites'ın donmuş yedek olduğu.
- **`docs/DURUM.md`:**
  - Eklenenler: yayın bilgileri (adres, Worker ve D1 adı), taşıma tarihi ve kaynak commit, "Kaldığın yer" satırı.
  - Sites satırları silinmez; "yedek, donduruldu" notu eklenir.
  - P1'deki ChatGPT girişi satırının yanına yeni giriş kararı yazılır.
  - Bildirimler: Sites eklentisi engeli kalkıyor. İş yine ayrı dalda ve senin onayınla yapılır.
- **`README.md`:** Yerel geliştirme ve yayın paragrafları Sites'tan söz ediyor; onlar da güncellenir.
- **Bu dosya:** Son hâliyle yayın el kitabına dönüşür.

## 7. Benim yapacaklarım (onaydan sonra, bu dalda)

1. **Yayın dosyaları:** `wrangler.jsonc`, `vite.config.ts`, `package.json` (`deploy`), `.node-version`.
2. **Giriş:**
   - `app/auth.ts`, `/giris` sayfası, `/api/giris` ve `/api/cikis`.
   - `page.tsx` ve API rotaları yeni girişi kullanır.
   - İstemci 401'de giriş sayfasına yönlenir; servis çalışanı güncellenir.
   - Tercihler'e "Çıkış yap" eklenir.
3. **İçe aktarma:** `/api/import` ve Tercihler'de "Yedekten geri yükle".
4. **Testler:**
   - API testlerinde giriş başlıkları değişir.
   - Giriş testleri: imza, süre, sahte ya da değiştirilmiş çerez, kısa parola.
   - İçe aktarma testleri: biçim, kuyruk reddi, tek parça değiştirme, aynı dosyayı yeniden yükleme.
5. **Doğrulama:**
   - Tip denetimi, lint ve `scripts/check.mjs` testleri.
   - Temiz klonda stub olmadan `npm ci && npm run build`; `wrangler deploy --dry-run`.
   - Yerel sunucuda giriş, çıkış ve içe aktarma.
   - 390×844 ekran görüntüleri.
   - `export-github.py` anahtar taraması.
6. **Teslim:** Push edip dururum ve sonuçları sana gösteririm. D1 kimliği gelince `wrangler.jsonc`'e yazıp push ederim. Merge sende.
7. **Belgeler:** Geçiş bitince 6. bölümdekileri güncellerim.

**Dokunulmayacaklar:** alan mantığı (`lib/`), tasarım ve stiller, veritabanı şeması, bildirim işi.

## 8. Olası sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Derleme ortama özgü bir hatayla durur (Node sürümü, bağımlılık kurulumu). | Cloudflare'in derleme ortamı yerelden farklı. | Günlük panelde (View build history). Hata metnini bana ilet; düzeltip push ederim. Yayındaki sürüm etkilenmez. |
| Derlemede `Authentication error [code: 10000]`. | Derleme anahtarında D1 izni yok. | 5–6. adımlardaki anahtarı seç ve derlemeyi yeniden başlat. |
| `Error 1102`. | Ücretsiz planda CPU sınırı aşıldı. | Workers Paid'e geç. |
| Giriş sayfası "kurulum eksik" diyor. | `GIRIS_PAROLASI` yok ya da 16 karakterden kısa. | 12. adım. |
| Parola unutuldu. | — | Panelde `GIRIS_PAROLASI`'nı değiştir. Bütün oturumlar kapanır. |

## Onayına sunulanlar

1. **Giriş:** Parola ve uzun oturum (önerim) mi, Cloudflare Access mi?
2. **Plan:** Workers Paid, ayda 5 $ (önerim) mı, ücretsiz başlayıp deneme süresinde bakmak mı?
3. **Adres:** `workers.dev` yeterli mi, yoksa bağlamak istediğin bir alan adın var mı?
4. **D1 kimliği:** Sohbette paylaşmak sana uygun mu, yoksa dosyaya kendin mi yazarsın?
