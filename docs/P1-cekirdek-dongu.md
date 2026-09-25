# P1: Çekirdek döngü

> Önce 00-BASLA.md ve DURUM.md. Bu paket, tasarım dilinin de kurulduğu yer.

## Amaç

Kullanıcının kafasını boşaltıp ilk emrini alabildiği, her gün kullanılabilir ilk sürüm.

## Kapsam

### Ana ekran (karargâh)

Kullanıcının her gün açtığı ekran. En az şunları içerir: tarih, günün emri, dikte girişi, haritaya erişim. Sonraki paketlerde ufuk, gelen evrak, uyarılar ve sabah raporu eklenecek; yerleşimi buna göre büyüyebilecek şekilde düşün. Görünüm ve yerleşim senin.

### Dikte

- Her ekrandan tek dokunuşla erişilir.
- Bu pakette yazı yeterli; telefon klavyesinin kendi diktesi zaten sesle yazmayı sağlar. Uygulama içi ses kaydı ve görseller P4'te.
- Berthier dağınık girdiyi şunlara çevirir: yeni cepheler, mevcut cephelere güncellemeler, hamleler, tamamlanan hamleler, kaldığın yer notları.
- Tarihler (P2) ve fikir deposu (P3) sonraki paketlerde geliyor. Ham dikte saklandığı için bu arada hiçbir şey kaybolmaz; sonraki paketler eski diktelerden de yararlanabilir.
- Önce mevcut cephelerle eşler. Emin değilse yeni cephe açmaz, soru sorar. Bir dikte başına en fazla bir soru.
- Belirsiz ifadeleri ("istatistiğe çalışmam lazım") somut hamleye çevirir. Çeviremiyorsa somut bir keşif hamlesi yazar ("İstatistik ders sayfasını aç ve vizeye kadarki konuları listele.").
- "Gönderdim", "bitirdim", "attım" gibi ifadeler eşleşen hamleyi tamamlar.
- Sonuç tek satırlık bir özetle gösterilir ("2 yeni hamle, 1 cephe güncellendi"). Ayrıntı açılabilir; her değişiklik tek tek, ya da tümü birden geri alınabilir.
- İnternet yoksa dikte bekletilir, bağlantı gelince işlenir.

### Harita

- Bütün cepheler, tipe göre: ders, kulvar, başvuru, genel.
- Her cephede ad, sıradaki hamle ve son dokunulma.
- Cephe detayı: durum (aktif, bekletilen, kapalı), sıradaki hamle (düzenlenebilir), hamle geçmişi, bu cepheye özel dikte.
- Berthier olası kopya cepheleri fark eder ve birleştirmeyi önerir.
- Sıralama ve düzen Berthier'in işi; kullanıcıdan elle düzen beklenmez.

### Günün emri

- Berthier her sabah bir öneri hazırlar: sıralı bir cephe ve hamle listesi, her birinde tek satırlık olgusal gerekçe.
- **Sabit sayı yok.** Berthier günün durumuna göre önerir; kullanıcı istediği kadarını seçer, ekler ya da çıkarır. Sıfır da geçerli bir seçimdir ve suçlayıcı dil kullanılmaz.
- Onay tek dokunuşla verilir. Onaylanan emir gün içinde Berthier tarafından kendiliğinden değiştirilmez. Yeni bir şey çıkarsa Berthier öneri olarak sunar ("Yarın teslim: Lab raporu. Emre eklensin mi?").
- "Bitti" denince Berthier aynı cephenin sıradaki hamlesini yazar ve gösterir. Cephe bir kulvarsa önce kaldığın yer sorulur.
- Bitmeyen hamleler ertesi günün önerisine öncelikli girer.
- Bekletilen kulvarlar öneriye girmez.

### Kaldığın yer notu

- Her kulvarda iki kısa alan: "Kaldığın yer" ve "Sıradaki soru".
- Bir kulvar hamlesi bitince Berthier sorar: "Nerede kaldın? Tek cümle yeter." Atlanabilir.
- Kullanıcı dikte ederken nerede kaldığını söylerse not kendiliğinden güncellenir.
- Berthier cümleyi sadeleştirir ama anlam eklemez.
- Kulvar açıldığında ilk görünen şey bu nottur: çekmeceyi açınca nerede kaldığını görmek.

### İlk kurulum

1. Giriş.
2. Kısa tanıtım.
3. İlk beyin boşaltması: "Kafandaki her şeyi söyle; dağınık olabilir."
4. Berthier ilk haritayı çıkarır.
5. Kullanıcı bu hafta hangi kulvarların aktif olacağını seçer (sayı sınırı yok).
6. İlk günün emri.

## Bitti sayılır

- Serbest bir dikte hızlıca işlenir; tek satır özet ve geri alma sunulur.
- Mevcut bir cepheye ait girdi yeni cephe açmaz.
- Üretilen hamleler 00-BASLA.md'deki "Hamle nedir" kurallarına uyar.
- Günün emrinde sabit bir sayı sınırı yoktur; sıfır cephe de seçilebilir.
- Onaylı emir gün içinde kendiliğinden değişmez.
- "Bitti" sonrası sıradaki hamle hemen görünür; kulvarda önce kaldığın yer sorulur.
- Her değişiklik geri alınabilir; hiçbir girdi kaybolmaz.
- Uygulama telefonda rahatça kullanılır.

## Test

**Bugün 12 Ekim 2026 Pazartesi, harita boş.** Dikte:

> Tezde literatür tablosunda kalmıştım, yöntemleri karşılaştırıyordum. İstatistiğe çalışmam lazım. Erasmus başvurusu için iki referans mektubu lazım, biri Ayşe Hoca'dan olabilir. Robotik projesine de başlamak istiyorum.

Beklenen: Tez (kulvar; kaldığın yer: yöntem karşılaştırması), İstatistik (ders; somut bir keşif hamlesi), Erasmus (başvuru; ilk hamle Ayşe Hoca'ya rica maili), Robotik (kulvar). En fazla bir soru, tek satır özet.

Ardından: "Ayşe Hoca'ya maili attım." → ilgili hamle tamamlanır, Erasmus'un sıradaki hamlesi görünür.

Ardından Tez hamlesi bitirilir ve kullanıcı şunu söyler: "Üç yöntemi tabloya koydum, sırada hangisinin küçük veride iyi çalıştığı var." → Kaldığın yer ve sıradaki soru güncellenir; Tez'in sıradaki hamlesi bu soruya uygun yazılır (ör. "Küçük veride 3 yöntemi karşılaştıran 2 makale bul ve tabloya ekle.").

## Oturum sonu

DURUM.md'yi güncelle. Kurduğun tasarım dilini orada bir iki cümleyle tarif et ki sonraki oturumlar aynı dili sürdürsün.
