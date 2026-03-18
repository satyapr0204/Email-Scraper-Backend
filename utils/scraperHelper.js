const axios = require('axios');

/**
 * Browserless Smart-Scrape API se content laakar emails extract karta hai
 */
const getEmailsFromDomain = async (domain) => {
    try {
        const url = domain.startsWith('http') ? domain : `https://${domain}`;
        const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

        const response = await axios.post(
            `https://production-sfo.browserless.io/smart-scrape?token=${BROWSERLESS_TOKEN}`,
            {
                url: url,
                formats: ["html"],
                waitFor: 3000 // Thoda wait taaki JS load ho jaye
            },
            { timeout: 60000 }
        );

        if (response.data.ok) {
            const html = response.data.content;
            // Strong Email Regex
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const foundEmails = html.match(emailRegex) || [];
            
            // Filter unique emails and remove common junk like 'sentry.io' etc if needed
            const uniqueEmails = [...new Set(foundEmails.map(e => e.toLowerCase()))];
            
            return { 
                domain, 
                emails: uniqueEmails.length > 0 ? uniqueEmails.join(', ') : "No Email Found",
                status: 'Success'
            };
        }
        return { domain, emails: "Failed to load content", status: 'Failed' };
    } catch (err) {
        console.error(`Error for ${domain}:`, err.message);
        return { domain, emails: "Connection Error", status: 'Error' };
    }
};

module.exports = { getEmailsFromDomain };