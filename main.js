const axios = require('axios');
const cheerio = require('cheerio');

async function searchProductAtElektrix(productCode) {
    const searchUrl = `https://www.elektrix.com/arama?q=${encodeURIComponent(productCode)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);

        const price = $('.currentPrice').first().text().trim();
        return price;
    } catch (error) {
        console.error(`Error searching product on Elektrix: ${error}`);
        return null;
    }
}

async function searchProductAtAtakmarket(productCode) {
    const searchUrl = `https://www.atakmarket.com/arama/${encodeURIComponent(productCode)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);

        const price = $('.showcase-price-new').first().text().trim();
        return price;
    } catch (error) {
        console.error(`Error searching product on Atakmarket: ${error}`);
        return null;
    }
}

async function main() {
    const productCode = 'EVH2S22P0CK'; // Aranacak ürün kodu

    const priceAtElektrix = await searchProductAtElektrix(productCode);
    console.log(`Elektrix Price for ${productCode}: ${priceAtElektrix}`);

    const priceAtAtakmarket = await searchProductAtAtakmarket(productCode);
    console.log(`Atakmarket Price for ${productCode}: ${priceAtAtakmarket}`);
}

main();
