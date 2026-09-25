# DURUM

> Astra her oturumun sonunda bu dosyayı günceller. Kısa tut.

## Her oturumda Astra'ya yazılacak mesaj

> 00-BASLA.md ve DURUM.md'yi oku, sıradaki paketi (ya da yarım kalan parçayı) yap, sonunda DURUM.md'yi güncelle.

## Kullanıcı kararları

Kullanıcı başlamadan doldurur. Boş bırakılan maddede Astra varsayılanı kullanır.

| Konu | Karar | Varsayılan |
|---|---|---|
| Telefon (iOS ya da Android) | iPhone (iOS) | İkisi de desteklensin |
| Üniversite maili bu Gmail hesabına düşüyor mu? | Evet, Gmail'e düşüyor | Hayır; yalnızca kişisel Gmail okunur |
| Ders sistemi duyuruları maille geliyor mu? | Varsayılan: hayır | Hayır; dikte ve ekran görüntüsüyle girilir |
| Sabah raporu saati | 08:30 | 08:30 |
| Haftalık teftiş günü ve saati | Pazar 20:00 | Pazar 20:00 |
| Sessiz saatler | Varsayılan: 23:00-07:30 | 23:00-07:30 |
| Gün kaçta bitmiş sayılsın? (Geç saate kadar çalışıyorsan) | Varsayılan: 04:00 | 04:00 |
| Hitap | Varsayılan: sen | sen |
| Mail taslakları için ad soyad, öğrenci no, bölüm, üniversite | İlk taslakta sorulacak | İlk taslakta sorulsun |
| "Kilitlendim" düğmesi olsun mu? | Olmasın | Hayır |
| Yapay zekâ sağlayıcısı | Claude Sonnet 5 seçildi; canlı kabul testleri geçti | Anahtarlar yalnız sunucuda |

## İlerleme

| Paket | Durum | Not |
|---|---|---|
| P1 Çekirdek döngü | tamamlandı ve özel yayında | Claude ile canlı senaryolar ve derlenmiş API kaydı geçti. |
| P2 Tarihler | tamamlandı ve özel yayında | Ufuk, tarih çıkarma/düzenleme, çakışmalar, mail taslağı, hazırlıklar ve başvuru belgeleri. |
| P3 Kulvarlar ve teftiş | tamamlandı ve özel yayında | Fikir deposu, sınırsız aktif kulvar, kalıcı beş adımlı teftiş. |
| P4 Dış dünya | başlamadı | |
| P5 Ritim ve motivasyon | başlamadı | |

## Tasarım dili

Mürekkep mavisi/açık kâğıt, koyu yeşil emir defteri, serif hamleler ve sade arayüz yazısı. Açık/koyu görünüm sistemi izler; mobilde sabit dikte çubuğu, 44 px dokunma hedefleri, azaltılmış hareket desteği.

## Kaldığın yer

- 25 Eylül, P4 öncesi düzeltmeler: dikte penceresi cihaz kaydından hemen sonra kapanır. Hızlı sunucu kuyruğu modelden ayrıldı; arka plan işlemi diğer ekranları ve yeni dikteyi kilitlemez. Otomatik kulvar penceresi kaldırıldı. Sonuç sessiz görünür. Sekme/telefon askıya alınırsa sunucuda kalan girdi sonraki açılışta sürdürülür; sürekli bağımsız zamanlayıcı yok.
- Yanıtla: asıl dikte/uzun kimlik kutuya konmaz. Soru ve boş cevap alanı görünür. Tarih/saat seçici, uygun sorularda Evet/Hayır ve yazıyla yanıt seçeneği var. Yanıtın soru bağı sunucuda tutulur; başarılı kayıtta eski soru kapanır, hatada kaybolmaz.
- Hamle: zaten yapılabilir eylem aynen korunur; kelime alt sınırı ve kapalı fiil listesi kaldırıldı. Büyük/belirsiz iş için gerekçeli ön adım ve “Ön adıma gerek yok” var. Elle düzeltme/ret tercihleri sunucuda tutulur, benzer işlerin model bağlamına girer, topluca geri alınır. Eski kısa eylem dikteleri için de uygun ön adım atlama desteklenir. `00-BASLA.md` Hamle nedir bölümü güncellendi.
- Doğrulama: tip denetimi, 10 P1 + 5 P2 + 4 P3 + 5 yeni davranış testi ve derleme geçti. Gerçek Claude: “Reuteri yoğurt yap” ön adımsız kaldı; benzer işte düzeltme hatırlandı. API: kalıcı kuyruğa alma yaklaşık 100 ms (yerel ölçüm), tekrar/kimlik çakışması, eşzamanlı düzenleme korunması ve yanıt sahipliği geçti.
- Derlenmiş uygulama 390×844 görünümünde ayrı yerel QA hesabıyla denendi: sade soru/tarih alanı, tarih gönderimi sonrası pencerenin kapanması, model çalışırken Harita/Ufuk ve yeni dikte kullanımı geçti. Tarih sunucuya yazıldı, soru kapandı. Yerel geliştirme stil sorunu sürüyor; derlenmiş görünüm düzgün. Codex tarayıcısının yerel takvim açılır penceresi çöktü; tarih alanı doldurularak akış doğrulandı. Fiziksel iPhone testi yapılmadı.
- P1–P3 tamam. Sırada P4 Gmail/Takvim ve dış dünya var; bu oturum P4’e başlamadı. P5 bildirimler yok. 08:30/Pazar 20:00 kayıtlı tercih; çalışan bildirim değil.
- GitHub: `https://github.com/SerdarKizil0/Berthier` özel depoya kaynak + kökteki plan/şartname belgeleri gönderildi; `main` ve `isPrivate=true` GitHub üzerinden doğrulandı. Eski kaynak geçmişi taşınmadı. 143 dosya ve yerel bilinen anahtarlar tarandı: anahtar eşleşmesi 0, .env dosyası 0. `app/scripts/export-github.py` dosya listesini ve bilinen anahtarları denetler; `.env*` (örnek dahil), `.dev.vars*`, yerel veriler ve çalışma çıktıları dışlanır. Kopya `app/.sites-runtime/github-export`; Sites kaynağından ayrıdır. Sonraki güncellemelerde bu kopyayı da yenile/push et.
- Yayın başarılı: sürüm 4 (25 Eylül 2026), kaynak `2ad9eca52a476f2798caa8c962b7aeddf877ff0c`, dağıtım `appgdep_6ab60ffb750c8191942ac4634680b8b6`, sürüm kimliği `appgprj_6aae680569c481919ee47ee6d8d5fb61~appgver_0797581893fc8191b8efaba4e935203e`. Canlı adres: https://berthier-serdar.serdar16.chatgpt.site . Yalnız sahibi, aynı ChatGPT hesabıyla erişir.
- Yayın kimliği `app/.openai/hosting.json`: `appgprj_6aae680569c481919ee47ee6d8d5fb61`. Yeni site oluşturma. Claude sırrı sunucuda, ortam revizyonu 2; anahtarlar Git dışında.
- Kullanıcı verileri korunuyor. Yerel yedek `app/.sites-runtime/preview-backup.json`; yerel Staj Defteri buluta taşınmadı. Testler yalnız ayrı QA hesaplarında; üretime test verisi gitmedi.
- Windows: gerçek npm CLI ile derle. Derlenmiş Worker’ı derlemeden önce durdur. Paketlemede gerekirse Git Bash login kabuğu ve `/c/Users/...` yollarını kullan; yükseltilmiş izin gerekiyor. GitHub CLI girişi yalnız yükseltilmiş komutta görüldü.

## Astra'nın kendi eklemeleri

- Çakışan geri alma daha yeni veriyi ezmez; emre bağlı cephe değişikliği gerektiğinde birlikte geri alınır.
- Son bilinen hamle bitince aynı işi tekrar üreten döngü yok; sonraki hamle bilinmiyorsa açıkça gösterilir.
- Giriş P1'de Sites'in yalnız sahibine açık ChatGPT oturumuyla sağlanır. Google bağlantıları P4'e bırakıldı.
- Cihaz önbelleği ve kuyruk ana verinin yerini almaz; sunucu D1 kaydı esastır.
