# PriceScrapper
Schneider Electric E-Commerce Price Scrapper

# Currency Conversion and Price Comparison Tool

This project is a comprehensive Node.js application designed to fetch the current Euro to Turkish Lira (TRY) exchange rate, convert product list prices from Euros to TRY, and compare these prices with those found in various online stores. The aim is to provide a convenient way to monitor and compare product prices, facilitating more informed purchasing decisions.

## Features

- **Exchange Rate Fetching**: Automatically retrieves the latest Euro to TRY exchange rate from the Central Bank of the Republic of Turkey (TCMB) XML service.
- **Price Conversion**: Reads product list prices from a CSV file and converts them from Euros to TRY using the current exchange rate.
- **Price Comparison**: Scrapes product prices from multiple online stores and calculates the discount compared to the list price.
- **Web Scraping**: Utilizes cheerio and axios for efficient web scraping from e-commerce websites.
- **Express Server**: A simple web server to showcase the functionality through a web interface.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

What things you need to install the software and how to install them:

```bash
node.js
npm

## Installing

git clone https://github.com/yourusername/your-repository-name.git

cd your-repository-name
npm install

npm start

Navigate to the home page at http://localhost:3000.
Enter a product code into the form to check its list price in TRY, its converted price from Euros (if applicable), and compare prices across various online stores.
