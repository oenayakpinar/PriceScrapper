const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');
const app = express();
const port = 3000;

const xml2js = require('xml2js');

// TCMB XML servisinden Euro kuru çeken fonksiyon
async function getEuroToTRYRate() {
    try {
        const response = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml');
        const xml = response.data;
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(xml);

        // EUR koduna sahip Currency'yi bul
        const euroCurrency = result.Tarih_Date.Currency.find(c => c['$'].Kod === 'EUR');
        if (!euroCurrency) {
            console.error('Euro kuru bulunamadı.');
            return null;
        }

        // Euro kuru bilgisini al
        const euroRate = parseFloat(euroCurrency.ForexSelling.replace(',', '.'));
        return euroRate;
    } catch (error) {
        console.error(`TCMB Euro kuru çekme hatası: ${error}`);
        return null;
    }
}


// CSV dosyasından liste fiyatlarını okuyan ve bir obje olarak döndüren fonksiyon
// Liste fiyatlarını okuma ve para birimine göre dönüştürme
// CSV dosyasından liste fiyatlarını okuyan ve bir obje olarak döndüren fonksiyon
async function readListPrices(csvFilePath) {
    const csvContent = fs.readFileSync(path.resolve(csvFilePath), 'utf8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });

    // Euro kuru çek
    const euroToTRYRate = await getEuroToTRYRate();

    const listPrices = {};
    records.forEach(record => {
        let priceStr = record['2023 Liste Fiyatı'];

        // Tırnak işaretlerini ve gereksiz boşlukları kaldır
        priceStr = priceStr.replace(/["'\s]/g, '');

        // Eğer virgül varsa, binlik ayırıcıları kaldır ve ondalık ayırıcıyı noktaya çevir
        if (priceStr.includes(',')) {
            priceStr = priceStr.replace(/\./g, '').replace(',', '.');
        }

        let price = parseFloat(priceStr);
        let euroPrice = null;

        // Eğer para birimi Euro ise, TL'ye çevir ve Euro fiyatını sakla
        if (record['Para Birimi'] === 'EUR' && euroToTRYRate) {
            euroPrice = price; // Euro fiyatını sakla
            price = price * euroToTRYRate; // TL'ye çevir
        }

        listPrices[record['Referans']] = {
            price: price,
            euroPrice: euroPrice,
            euroToTRYRate: euroToTRYRate
        };
    });
    return listPrices;
}




// Liste fiyatlarını ve mağaza fiyatlarını alıp iskonto oranını hesaplayan fonksiyon
function calculateDiscounts(storePrices, listPrices) {
    return storePrices.map(storePrice => {
        const listPriceInfo = listPrices[storePrice.productCode];
        if (listPriceInfo && listPriceInfo.price && listPriceInfo.price > 0) {
            const discount = ((listPriceInfo.price - storePrice.priceValue) / listPriceInfo.price) * 100;
            return { ...storePrice, discount: discount.toFixed(2) + '%' };
        } else {
            return { ...storePrice, discount: 'Liste fiyatı yok veya 0' };
        }
    });
}



// CSV dosyasının yolu
const csvFilePath = 'ListeFiyatlari.csv';

// CSV dosyasını oku ve liste fiyatlarını al
const listPrices = readListPrices(csvFilePath);

// Mağaza fiyatlarını al (örnek data, dinamik olarak değişecektir)
const storePrices = [
    { store: 'Atakmarket', productCode: '50171', price: 5000 }, // Örnek fiyatlar
    // ... diğer mağazalar
];

// İskonto oranlarını hesapla
const discounts = calculateDiscounts(storePrices, listPrices);


// Body-parser middleware'ini kullanarak form verilerini işleyebiliriz.
app.use(bodyParser.urlencoded({ extended: true }));

// Ana sayfa için basit bir HTML formu
app.get('/', (req, res) => {
    res.send(`
        <h1>Atak Market Ürün Fiyat Kontrolü</h1>
        <form action="/search" method="post">
            <input type="text" name="productCode" placeholder="Ürün Kodunu Girin" required>
            <button type="submit">Kontrol Et</button>
        </form>
    `);
});

// Form gönderildiğinde bu route çalışır
app.post('/search', async (req, res) => {
    const productCode = req.body.productCode;
    const listPrices = await readListPrices(csvFilePath); // Liste fiyatlarını oku

    // Liste fiyatını al (TL cinsinden)
    const listPriceInfo = listPrices[productCode];
    const listPriceDisplay = listPriceInfo && listPriceInfo.price ? `${listPriceInfo.price.toFixed(2)} ₺` : 'Liste fiyatı bulunamadı';
    const euroPriceDisplay = listPriceInfo && listPriceInfo.euroPrice ? `Euro Fiyatı: ${listPriceInfo.euroPrice.toFixed(2)} EUR` : '';
    const euroRateDisplay = listPriceInfo && listPriceInfo.euroToTRYRate ? `TCMB Kuru: ${listPriceInfo.euroToTRYRate.toFixed(4)}` : '';

    // Mağaza fiyatlarını içeren bir dizi oluştur
    const prices = []; // Bu satırı ekleyin

    // ... mağazaların fiyatlarını almak için kodlar ...

    prices.push({ store: 'Atakmarket', productCode, price: await searchProductAtAtakmarket(productCode) });
    prices.push({ store: 'Elektrix', productCode, price: await searchProductAtElektrix(productCode) });
    prices.push({ store: 'Botek', productCode, price: await searchProductAtBotek(productCode) });
    prices.push({ store: 'Elektromarketim', productCode, price: await searchProductAtElektroMarketim(productCode) });
    prices.push({ store: 'Elektrofors', productCode, price: await searchProductAtElektrofors(productCode) });

    // Fiyatları ve iskontoları hesapla
    const parsedPrices = prices.map(item => {
        // Eğer fiyat bilgisi geçerli bir string değilse, priceValue olarak null atayın
        const priceValue = (typeof item.price === 'string') 
            ? parseFloat(item.price.replace(/\./g, '').replace(',', '.')) 
            : null;
    
        const discount = (listPriceInfo && listPriceInfo.price && priceValue !== null)
            ? (((listPriceInfo.price - priceValue) / listPriceInfo.price) * 100).toFixed(2) + '%'
            : 'Liste fiyatı yok veya 0';
    
        return {
            store: item.store,
            productCode: item.productCode,
            price: item.price,
            discount: discount
        };
    });
    

    // En düşük ve en yüksek fiyatları bulma
    let minPrice = { priceValue: Number.MAX_VALUE, store: '', price: '' };
    let maxPrice = { priceValue: 0, store: '', price: '' };

    parsedPrices.forEach(item => {
        const priceValue = parseFloat(item.price.replace(/[\.,₺]/g, '').replace(',', '.'));
        if (priceValue > 0 && priceValue < minPrice.priceValue) {
            minPrice = { ...item, priceValue };
        }
        if (priceValue > maxPrice.priceValue) {
            maxPrice = { ...item, priceValue };
        }
    });

    // Yüzde farkı hesaplama
    const atakMarketEntry = parsedPrices.find(item => item.store === 'Atakmarket');
    const atakMarketPrice = atakMarketEntry ? parseFloat(atakMarketEntry.price.replace(/[\.,₺]/g, '').replace(',', '.')) : null;


    let percentageDifference = 0;
    if (minPrice.store !== 'Atakmarket' && atakMarketPrice && minPrice.priceValue > 0) {
        percentageDifference = ((atakMarketPrice - minPrice.priceValue) / atakMarketPrice) * 100;
    }

    console.log('AtakMarket Price:', atakMarketPrice);
    console.log('Min Price:', minPrice.priceValue);
    console.log('Percentage Difference:', percentageDifference);
    console.log(parsedPrices);


    res.send(`
    <h3><p>Ürün Kodu: ${productCode}</p></h3>
<h3><p>Liste Fiyatı: ${listPriceDisplay} (${euroPriceDisplay} ${euroRateDisplay})</p></h3>

<table border="1">
    <tr>
        <th>Site İsmi</th>
        <th>Satış Fiyatı</th>
        <th>İskonto Oranı</th>
    </tr>
    ${parsedPrices
        .sort((a, b) => a.priceValue - b.priceValue) // En düşük fiyattan en yükseğe sırala
        .map(item => `
            <tr>
                <td>${item.store}</td>
                <td>${item.price}</td>
                <td>${item.discount}</td>
            </tr>
        `).join('')}
</table>

${minPrice.priceValue !== Number.MAX_VALUE ? `<p><strong>En Ucuz Satış Yapan E-Ticaret Sitesi:</strong> ${minPrice.store}, Atak Marketten %${percentageDifference.toFixed(2)} daha ucuza satış yapmaktadır.</p>` : ''}
<br>
<form action="/" method="get">
    <button class="btn btn-primary" type="submit">Yeni Sorgu Yap</button>
</form>


`);

});




// Atakmarket'te ürün arama
async function searchProductAtAtakmarket(productCode) {
    const searchUrl = `https://www.atakmarket.com/arama/${encodeURIComponent(productCode)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        let selectedPrice = null;

        // Tüm ürünler üzerinde döngü yap
        $('.showcase-content').each((index, element) => {
            const productTitle = $(element).find('.showcase-title a').text().trim();

            // Ürün başlığında ürün kodunu tam olarak içerip içermediğini kontrol et
            if (productTitle.includes(productCode) && !productTitle.includes(`${productCode}X`)) {
                const priceWithCurrency = $(element).find('.showcase-price-new').text().trim();
                const priceWithoutCurrency = priceWithCurrency.replace('TL', '').replace('₺', '').trim();
                selectedPrice = priceWithoutCurrency + ' ₺';
                return false; // Döngüyü durdur
            }
        });

        return selectedPrice;
    } catch (error) {
        console.error(`Error searching product on Atakmarket: ${error}`);
        return null;
    }
}



async function searchProductAtElektrix(productCode) {
    const searchUrl = `https://www.elektrix.com/arama?q=${encodeURIComponent(productCode)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);

        
        let priceWithCurrency = $('.currentPrice').first().text().trim();
        
        // Para birimi işaretlerini ve yazılarını çıkar
        let priceWithoutCurrency = priceWithCurrency.replace('TL', '').replace('₺', '').trim();
        
        return priceWithoutCurrency +' ₺';
    } catch (error) {
        console.error(`Error searching product on Elektrix: ${error}`);
        return null;
    }
}

async function searchProductAtBotek(productCode) {
    const searchUrl = `https://eticaret.botekotomasyon.com/arama?q=${encodeURIComponent(productCode)}`;

    try {
        // Axios isteğini yapılandırma nesnesi ile birlikte gönderiyoruz
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
            },
            timeout: 3000 // 30 saniye zaman aşımı süresi
        });

        const $ = cheerio.load(response.data);
        
        let priceWithCurrency = $('.current-price').first().text().trim();
        
        // Para birimi işaretlerini ve yazılarını çıkar
        let priceWithoutCurrency = priceWithCurrency.replace('TL', '').replace('₺', '').trim();
        
        return priceWithoutCurrency +' ₺';
    } catch (error) {
        console.error(`Error searching product on Elektrofors: ${error}`);
        return null;
    }
}

async function searchProductAtElektroMarketim(productCode) {
    const searchUrl = `https://www.elektromarketim.com/arama?q=${encodeURIComponent(productCode)}`;

    try {
        // Axios isteğini yapılandırma nesnesi ile birlikte gönderiyoruz
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
            },
            timeout: 3000 // 30 saniye zaman aşımı süresi
        });

        const $ = cheerio.load(response.data);
      
        let priceWithCurrency = $('.vitrin-current-price').first().text().trim();
        
        // Para birimi işaretlerini ve yazılarını çıkar
        let priceWithoutCurrency = priceWithCurrency.replace('TL', '').replace('₺', '').trim();
        
        return priceWithoutCurrency +' ₺';
    } catch (error) {
        console.error(`Error searching product on Elektrofors: ${error}`);
        return null;
    }
}

async function searchProductAtElektrofors(productCode) {
    const searchUrl = `https://www.elektrofors.com/index.php?route=product/search&search=${encodeURIComponent(productCode + ',')}`;

    try {
        // Axios isteğini yapılandırma nesnesi ile birlikte gönderiyoruz
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 50000 // 50 saniye zaman aşımı süresi
        });

        const $ = cheerio.load(response.data);

        let priceWithCurrency = $('.price-normal').first().text().trim();
        
        // Para birimi işaretlerini ve yazılarını çıkar
        let priceWithoutCurrency = priceWithCurrency.replace('TL', '').replace('₺', '').trim();
        
        return priceWithoutCurrency +' ₺';
    } catch (error) {
        console.error(`Error searching product on Elektrofors: ${error}`);
        return null;
    }
}


app.listen(port, () => {
    console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
});
