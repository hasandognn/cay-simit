# Çay & Simit

Boğaz kıyısında geçen, Türk kahvaltısı temalı bağımsız bir HTML5 eşleştirme oyunu. Curio/arcade koleksiyonuyla bağlantısı veya ortak kayıt sistemi yoktur. Bu klasör başka bir yere taşınarak da kullanılabilir.

## Çalıştırma

`dist/index.html` dosyasını doğrudan tarayıcıda açabilir veya bu klasörde `npm start` çalıştırıp `http://127.0.0.1:4177` adresini ziyaret edebilirsin. Paket kurulumu veya derleme gerekmez. `npm start` için Python 3 gerekir.

Herhangi bir statik sunucuya yalnızca `dist/` içeriği yüklenir. Yazı tipi için Google Fonts kullanılır; bağlantı yoksa yerel yazı tipine geçilir.

## GitHub Pages

Oyun adresi: https://hasandognn.github.io/cay-simit/

`main` dalına gönderilen değişiklikler `.github/workflows/pages.yml` ile otomatik yayınlanır. İş akışı önce oyun kurallarını test eder, ardından yalnızca `dist/` klasörünü GitHub Pages'e yükler.

## Oynanış

- Yan yana iki taşı kaydırarak veya sırayla seçerek değiştir. Üç aynı taş yatay veya dikey birleşince temizlenir.
- Dört taş satır roketi, beş taş renk yıldızı, T/L eşleşmeleri çevre bombası üretir. Özel taşa tek dokunuşla da güç çalıştırılabilir.
- Sepetlerin yanında eşleştirme yaparak onları topla. `2` işaretli sepetler iki darbe ister.
- Tokmak bir hücreye vurur, roket bir satırı temizler, karıştır taşları yeniler. Bu araçlar hamle tüketmez; her bölümde 3/2/2 hakla başlar.
- Beş bölüm sırayla açılır. Bölümler, puan, altın, ses tercihi ve mevcut tur tarayıcının yerel depolamasında saklanır.
- İstanbul haritasındaki rota: Ortaköy → Beşiktaş → Karaköy → Üsküdar → Kadıköy. Her semtin ayrı manzarası, renk paleti ve simgesi vardır. Harita, kazanılan yıldızları, kilitleri ve mevcut durağı gösterir; bölüm başlığına veya üstteki semt etiketine dokunarak açılır. Mevcut kayıtların bölüm indeksleri ve ilerlemesi korunur.
- Yıldızlar puana bağlıdır: tamamlanan bölüm en az bir yıldız, 3.700 puan iki, 6.000 puan üç yıldız verir.
- Klavyede Tab ile tahtaya gel, ok tuşlarıyla dolaş, Enter/Boşluk ile seç. Escape seçimi veya güçlendiriciyi iptal eder.

## Dosyalar

`dist/engine.js`: DOM'dan bağımsız oyun kuralları ve bölüm tanımları.

`dist/game.js`: kullanıcı etkileşimi, ses, animasyon, kayıt ve diyaloglar.

`dist/style.css`: mobil/masaüstü yerleşim ve görsel stil.

`dist/assets/`: bu oyun için üretilen özgün illüstrasyonlar. Üretim yöntemi ve istemler `ART-DIRECTION.md` içindedir.

## Doğrulama

`npm test`: Node.js yerleşik test çalıştırıcısı ile 150 sabit tohumlu tam oyun turu; geçersiz hamle, özel taş, güçlendirici, sepet, karıştırma ve kayıt kurtarma senaryoları.

Mobil arayüz, ekranın kullanılabilir yüksekliğine göre tahtayı boyutlandırır. Tek parmakla kaydırma ve iki taşa sırayla dokunma desteklenir. Patlama efektleri sınırlı parçacık sayısıyla tek canvas üzerinde çizilir; animasyonlar boşta ve arka planda çalışmaz. Ayarlardan canlı efektler kapatılabilir, destekleyen cihazlarda hafif titreşim açılabilir. İşletim sisteminin azaltılmış hareket tercihi korunur.

Her hamlenin sonuç durumu animasyon başlamadan kaydedilir. Dörtlü eşleşmenin dört yiyeceği de toplanır ve ayrı görünümlü bir roket oluşturulur; bu roket ikinci kez yiyecek sayılmaz.

Güçlendiricilerin özgün SVG görselleri küçük ekranlarda da keskin kalır. Roket iki yöne uçar; taşlar uçuşun kendilerine ulaştığı anda temizlenir. Bombanın genişleyen patlama halkaları, renk yıldızının hedeflere yayılan renkli ışıkları vardır. Taşlar düşerken boyut değiştirmez veya sekmez; yeni taşlar sütun aralıklarını koruyarak girer. Düşüş, son patlama tamamlandıktan sonra başlar. Animasyon zamanlaması testleri de yayın öncesi çalışır.

Bu sürüm oynanabilir bir prototiptir. Altın yalnızca oyun içi ödüldür; ödeme veya mağaza entegrasyonu bulunmaz. İlerleme bu tarayıcıya özeldir.
