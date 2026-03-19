const axios = require('axios');

/**
 * Browserless Smart-Scrape API se content laakar emails extract karta hai
 */
const getEmailsFromDomain = async (domain) => {
    try {
        // 1. Header skip logic (Agar domain ki value "Domain" hai toh skip karo)
        if (domain.toLowerCase() === 'domain') return null;

        // const targetUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

        // Correct API Endpoint with Token as Query Param
        const apiUrl = `https://production-sfo.browserless.io/smart-scrape?token=${BROWSERLESS_TOKEN}`;

        const response = await axios.post(apiUrl, {
            url: domain,
            formats: ["html"]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (response.data && response.data.ok) {
            const html = response.data.content;
            return { html: html, method: "3rd" }
        }
        return { html: null, error: "No Email found" }
    } catch (err) {
        // Detailed log taaki pata chale 400 kyu aaya
        console.error(`❌ Error for ${domain}:`, err.response ? err.response.data : err.message);
        // return { domain, emails: "Connection Error", status: 'Error' };
        return { html: null, error: "No Email found" }
    }
};

module.exports = { getEmailsFromDomain };