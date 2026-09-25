# Berthier — P1 + P2 + P3

Tek kullanıcılı, Türkçe, mobil öncelikli kişisel karargâh. Proje kararları üst klasördeki `00-BASLA.md`, `DURUM.md` ve paket dosyalarındadır. Eski şartnameyle çelişen yerlerde yeni paketler geçerlidir: emir ve aktif kulvar sayısı sınırsız, Kilitlendim düğmesi yok.

## Çalıştırma

Node 22.13+ gerekir. Bağımlılıklar kilit dosyasıyla kuruludur. `npm run dev` yerel önizlemeyi 5173 portunda başlatır. Yerel giriş Sites'in yalnızca loopback üzerinde çalışan deneme kimliğidir; üretimdeki giriş ve tek kullanıcı erişimi Sites tarafından doğrulanır.

Anahtarları Git dışında tutulan `.env.local` dosyasına yaz, ardından `node scripts/sync-local-env.mjs` çalıştır ve önizlemeyi yeniden başlat. `ANTHROPIC_API_KEY` varsa Claude kullanılır; aksi halde `GEMINI_API_KEY`. Anahtar çalışma alanına bağlı değilse `ANTHROPIC_WORKSPACE_ID` de gereklidir. Sağlayıcı ve model `lib/llm.ts` arkasındadır. Üretim sırları Sites ortam değişkenlerinde saklanır, kaynak veya tarayıcıda bulunmaz.

`npm run build` Cloudflare Worker ve istemci paketini üretir. Sites eklentisi yayın kimliğini `.openai/hosting.json` içinde saklar. Var olan projeyi yeniden oluşturma. Sunucu verileri D1'de, geçişler `drizzle/` altındadır; yayın uygulanmış geçişleri değiştirme.

## Veri ve güvenlik

- `notebooks`: kullanıcı kimliğiyle ayrılmış cepheler, hamleler, tarihli emir anlık görüntüleri ve geri alma kayıtları. Eşzamanlı yazma revizyon karşılaştırmasıyla korunur.
- `dictations`: model çağrısından **önce** kaydedilen ham metin. Başarısızlıkta yeniden işlenebilir. Değişiklikler geri alınsa bile ham metin silinmez.
- İstemcide IndexedDB yalnızca geçici dikte kuyruğu, taslak ve son doğrulanmış sunucu kopyasıdır. Kalıcı ana kayıt D1'dir. Service worker çevrimdışı kabuğu saklar.
- API kimlik kontrolü, aynı kaynak denetimi, Zod şeması, sınırlı işlem listesi ve idempotent istek kimliği kullanır. Modelin doğrudan veri silme, cephe kapatma, ayar değiştirme veya dışarı mesaj gönderme yetkisi yoktur.
- Gün İstanbul saatiyle 04:00'te döner. Onaylı emir yeni girdilerle yeniden sıralanmaz. Sadece kullanıcının emri düzenlemesi veya hamleyi tamamlaması ilgili yuvayı değiştirir.
- Geri alma daha yeni düzenlemeyi ezmez; aynı kayıttaki bağımlı değişiklikler önce geri alınır. Hamle/not geçmişi değişiklik kayıtlarında korunur.

## Kontroller

- `node scripts/check.mjs`: deterministik çekirdek testleri.
- `node scripts/check.mjs --llm`: gerçek sağlayıcıyla sentetik P1 senaryosu; API kullanımı tüketir.
- `node node_modules/typescript/bin/tsc --noEmit`: tip denetimi.
- `tests/api-check.mjs`: 5174 portundaki yerel **derlenmiş** Worker'a karşı ayrı `berthier-qa` test kimliğiyle API kontrolleri. Önce `scripts/seed-qa.mjs` çıktısı yerel D1'e uygulanır. Bu kimlik üretim erişimi değildir; test verisi yayımlanmaz.

P2 tarih çıkarma, 14 günlük Ufuk, çakışma taslakları, hazırlık planları ve başvuru belgeleri eklendi. Tarihler İstanbul takvim gününe, günlük emir 04:00 sınırına göre hesaplanır. Bilinmeyen bitiş saati varsayılmaz; eşit başlangıçlar veya bilinen aralıkların örtüşmesi çakışır. `node scripts/check.mjs --calendar` tarih/plan testlerini, `--p2-llm` canlı P2 kabul senaryosunu çalıştırır.

P4 Gmail/Takvim ve uygulama içi ses/görsel, P5 bildirimler henüz yoktur. Tercihlerdeki 08:30 ve Pazar 20:00 gelecekteki paketler için kayıtlı kararlardır, çalışan bildirim vaadi değildir.

P3: Fikir deposu, açıkça söylenen kulvar aktifleştirmesi, beş adımlı kalıcı teftiş ve eski diktelerden yalnız fikir çıkarma. `--research` çekirdek, `--p3-llm` canlı kabul testidir; `tests/research-api.mjs` derlenmiş yerel Worker üzerinde ayrı QA kullanıcısıyla çalışır. Fikirleri atmak geri alınabilir; asıl metin ve kaynak dikte korunur.


## P4 öncesi kullanım düzeltmeleri

Dikte önce cihaz kuyruğuna ve hızlı bir sunucu kaydına alınır; pencere kapanır ve model isteği arayüzü kilitlemeden işlenir. Kabul edilmiş, tamamlanmamış girdiler uygulama tekrar açılınca sunucudan da kurtarılır. Sekme/telefon askıya alınırsa işlem bir sonraki açılışta devam edebilir. Sonuçlar sessizce görünür. Eşzamanlı düzenlemeler son sunucu sürümüne uygulanır; kayıtlar revizyon ve istek kimliğiyle korunur.

Yanıtlar ayrı `replyTo` bağıyla saklanır; düzenleme kutusuna ham dikte veya kimlik kopyalanmaz. Tarih/saat soruları seçici, eşleşme soruları Evet/Hayır sunar; serbest yazı seçeneği korunur. Sorunun kapanması başarılı yanıtla birlikte kaydedilir.

Somut kısa eylemler doğrudan hamledir. Ön adım yalnız büyük/belirsiz işler için gerekçesiyle önerilir; tek dokunuşla kaldırılır. Elle düzeltmeler ve reddedilen ön adımlar sunucuda geri alınabilir tercihler olarak saklanır; son 30 örnek model bağlamına girer.

`node scripts/check.mjs --flow` davranış kontrollerini, `--flow-llm` gerçek sağlayıcı kontrollerini çalıştırır. GitHub için kaynak ve proje belgelerinin temiz bir anlık kopyası yayımlanır; `.env*`, `.dev.vars*`, yerel veri, çalışma çıktıları ve kaynak deponun geçmişi kopyalanmaz.
