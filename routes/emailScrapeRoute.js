const emailScrape = require('express').Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { Parser } = require('json2csv');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const upload = multer({ dest: 'uploads/' });
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const { getEmailsFromDomain } = require('../utils/scraperHelper');
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// function extractFromHtml(html, emailSet) {
//     if (!html) return;

//     // 1. Improved Regex (Machine IDs ko ignore karne ke liye thoda strict)
//     const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;

//     // 2. mailto: extraction (NVIDIA/Corporate sites ke liye)
//     const $ = cheerio.load(html);
//     $('a[href^="mailto:"]').each((i, el) => {
//         let email = $(el).attr('href').replace('mailto:', '').split('?')[0];
//         addCleanEmail(email, emailSet);
//     });

//     // 3. Text content extraction
//     const matches = html.match(EMAIL_REGEX);
//     if (matches) {
//         matches.forEach(email => addCleanEmail(email, emailSet));
//     }
// }

function extractFromHtml(html, emailSet) {
    if (!html) return;

    const $ = cheerio.load(html);

    // 1. Sabse pehle mailto links nikaalein (Ye sabse accurate hote hain)
    $('a[href^="mailto:"]').each((i, el) => {
        let email = $(el).attr('href').replace('mailto:', '').split('?')[0];
        addCleanEmail(email, emailSet);
    });

    // 2. Pure HTML text ko extract karein (par tags ke beech space dekar)
    // Hum <br> aur </p> jaise tags ko space se replace karenge taaki info@... chipak na jaye
    let textContent = $('body').text(); // Basic text

    // 3. Regex apply karein pure text par
    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(EMAIL_REGEX); // HTML string se bhi check karein
    const textMatches = textContent.match(EMAIL_REGEX); // Clean text se bhi check karein

    if (matches) matches.forEach(email => addCleanEmail(email, emailSet));
    if (textMatches) textMatches.forEach(email => addCleanEmail(email, emailSet));
}

function addCleanEmail(email, emailSet) {
    if (!email) return;

    // 1. Basic cleaning: lower case, remove trailing slashes/dots, and whitespace
    let cleaned = email.toLowerCase()
        .replace(/u003e/g, '')
        .replace(/u003c/g, '')
        .replace(/\/+$/, '') // Remove trailing slashes (techcrunch fix)
        .replace(/\.+$/, '')  // Remove trailing dots
        .trim();

    // 2. Comprehensive Blacklist
    const blacklistedWords = [
        'sentry', 'prober', 'test@', 'example', 'domain.com', 'git@', 'bootstrap',
        'jquery', 'npm', 'yarn', 'placeholder', 'yourname', 'mybusiness',
        'mystunningwebsite', 'user@', 'xxx@', 'email.com', 'reply', 'noreply'
    ];

    const blacklistedExtensions = [
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.js', '.css',
        '.pdf', '.zip', '.mp4', '.webm', '.ogg', '.ico'
    ];

    // Check if it's a garbage email
    const isGarbage = blacklistedWords.some(word => cleaned.includes(word));
    const isFile = blacklistedExtensions.some(ext => cleaned.endsWith(ext));

    // 3. Logic: Length check + No common library patterns (like react@1.0.js)
    const isVersionPattern = /@[0-9.]+/.test(cleaned); // Matches things like @16.14.0

    if (!isGarbage && !isFile && !isVersionPattern && cleaned.length > 7 && cleaned.includes('.') && cleaned.length < 50) {
        // Validation for proper email structure
        const finalCheck = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
        if (finalCheck) {
            emailSet.add(cleaned);
        }
    }
}

async function getSource(url, browser, headers) {
    try {
        // Try Axios first with full headers
        const response = await axios.get(url, {
            // headers,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000,
            maxRedirects: 5
        });
        return { html: response.data, method: 'Axios' };
    } catch (error) {
        // Agar Axios fail ho, toh Puppeteer with Stealth
        if (browser) {
            const page = await browser.newPage();
            // Sabse important: Bot detection bypass karne ke liye
            await page.setExtraHTTPHeaders(headers);

            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
                const html = await page.content();
                await page.close();
                return { html, method: 'Puppeteer' };
            } catch (pError) {
                await page.close();
                return { html: null, error: pError.message };
            }
        }
        return { html: null, error: error.message };
    }
}
const PRIORITY_KEYWORDS = ['contact', 'about', 'support', 'info', 'reach', 'touch', 'help', 'career'];

async function scrapeEmails(domain, browser) {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    let allEmails = new Set();
    let methodUsed = 'Axios';
    let pagesScanned = 0;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    };

    try {
        // 1. Pehle Axios se koshish karein
        let source = await getSource(baseUrl, null, headers);

        // 2. Logic: Agar Axios fail hua (null), ya content bahut chhota hai, ya block ho gaya hai
        const isBlocked = (html) => !html || html.length < 2000 || html.includes('captcha') || html.includes('Access Denied') || html.includes('detected unusual traffic');

        if (isBlocked(source.html)) {
            console.log(`🔄 Axios failed or blocked for ${domain}. Retrying with Puppeteer...`);
            methodUsed = 'Puppeteer (Retry Mode)';
            source = await getSource(baseUrl, browser, headers);
        }

        // 3. Final check: Agar ab content mil gaya hai
        if (source && source.html) {
            pagesScanned++;
            extractFromHtml(source.html, allEmails);

            // Agar home page pe email nahi mila, toh inner pages (Contact, About) scan karein
            if (allEmails.size === 0) {
                const $ = cheerio.load(source.html);
                const priorityLinks = new Set();

                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                        try {
                            const fullUrl = new URL(href, baseUrl).href;
                            const lowerUrl = fullUrl.toLowerCase();
                            // Apne hi domain ke links scan karein
                            if (fullUrl.includes(domain)) {
                                const isMatch = PRIORITY_KEYWORDS.some(k => lowerUrl.includes(k));
                                const isGarbage = /\.(jpg|jpeg|png|gif|pdf|zip|css|js|mp4|webm|webp|ogg|svg)$/.test(lowerUrl);

                                if (isMatch && !isGarbage) {
                                    priorityLinks.add(fullUrl);
                                }
                            }
                        } catch (e) { }
                    }
                });

                const linksToScan = Array.from(priorityLinks).slice(0, 3);
                for (const link of linksToScan) {
                    // Inner pages ke liye seedha Puppeteer use karna behtar hai agar main page pe dikat thi
                    const subSource = await getSource(link, browser, headers);
                    if (subSource && subSource.html) {
                        pagesScanned++;
                        extractFromHtml(subSource.html, allEmails);
                    }
                }
            }
        } else {
            console.log(`❌ No content could be fetched for ${domain} even after Puppeteer retry.`);
        }

    } catch (err) {
        console.log(`❌ Error scanning ${domain}: ${err.message}`);
    }

    const filtered = Array.from(allEmails);
    // return {
    //     domain: domain,
    //     emails: filtered.join(', '),
    //     status: filtered.length > 0 ? 'Success' : 'Not Found'
    // };
    return {
        domain: domain,
        emails: filtered.length > 0 ? filtered.join(', ') : 'No Email Found', // Email na mile toh 'Not Found' likha aayega
        status: 'Processed' // Status ko 'Processed' kar dein taaki ye filter mein aa jaye
    };
}

emailScrape.post('/upload', upload.single('file'), (req, res) => {
    const domains = [];
    console.log("domains", domains)
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
            if (row.domain) domains.push(row.domain.trim());
        })
        .on('end', async () => {
            // const browser = await puppeteer.launch({
            //     headless: "new",
            //     args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
            // });

            // const browser = await puppeteer.launch({
            //     headless: "new",
            //     args: [
            //         '--no-sandbox',
            //         '--disable-setuid-sandbox',
            //         '--disable-dev-shm-usage',
            //         '--single-process',
            //         '--no-zygote'
            //     ],
            // Ye line check karegi ki Render ne kahan install kiya hai
            // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ||
            //     '/opt/render/.cache/puppeteer/chrome/linux-146.0.7680.66/chrome-linux64/chrome'
            // });
            let browser;
            try {
                const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
                if (BROWSERLESS_TOKEN) {
                    console.log("🌐 Connecting to Remote Browser...");
                    browser = await puppeteer.connect({
                        browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}&stealth&--disable-web-security`
                    });
                } else {
                    // Agar token nahi hai toh local launch (Sirf testing ke liye)
                    console.log("⚠️ No Token found, trying local launch...");
                    browser = await puppeteer.launch({
                        headless: "new",
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process']
                    });
                }

                const { default: pLimit } = await import('p-limit');
                // const limit = pLimit(15);
                const limit = pLimit(1);
                console.log(`🚀 Processing ${domains.length} domains...`);

                const tasks = domains.map(domain => limit(() => scrapeEmails(domain, browser)));
                const allResults = await Promise.all(tasks);
                // const filteredResults = allResults.filter(result =>
                //     result && result.status === 'Success' && result.emails && result.emails.length > 0
                // );
                const filteredResults = allResults.filter(result =>
                    result && result.domain // Sirf ye check karein ki result exist karta hai
                );
                const json2csvParser = new Parser({
                    fields: ['domain', 'emails'], // Sirf ye do columns CSV mein jayenge
                    quote: '',
                    flatten: true
                });
                // const json2csvParser = new Parser({
                //     quote: '',
                //     flatten: true
                // });

                let csvData = "";
                if (filteredResults.length > 0) {
                    csvData = json2csvParser.parse(filteredResults);
                }

                // const outputPath = `results/result-${Date.now()}.csv`;
                const fileName = `result-${Date.now()}.csv`;
                const outputPath = `results/${fileName}`;
                if (!fs.existsSync('results')) fs.mkdirSync('results');

                fs.writeFileSync(outputPath, csvData);
                console.log(`✅ Success: Found ${filteredResults.length} domains with emails.`);

                res.status(200).json({
                    success: true,
                    message: `Scraping completed. Found ${filteredResults.length} emails.`,
                    downloadUrl: `${process.env.BACKENd_URL}/results/${fileName}`,
                    fileName: fileName
                });

            } catch (err) {
                console.error("Scraping Error:", err);
                if (!res.headersSent) res.status(500).send("Error processing file", err);
            } finally {
                await browser.close();
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            }
        });
});


const uploads = multer({ dest: "uploads/" });

emailScrape.post("/clean-domains", uploads.single("file"), (req, res) => {
    const results = [];

    fs.createReadStream(req.file.path)
        .pipe(csv({ headers: false }))
        .on("data", (row) => {
            const values = Object.values(row);

            if (values[2]) {
                results.push({ domain: values[2] });
            }
        })
        .on("end", () => {
            const csvOutput =
                "domain\n" + results.map((r) => r.domain).join("\n");

            const outputPath = `outputs/clean_domains_${Date.now()}.csv`;

            fs.writeFileSync(outputPath, csvOutput);

            res.download(outputPath);
        });
});



emailScrape.post('/scrape-email', uploads.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const domains = [];
    
    // CSV Read stream
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
            const domain = row.domain || row.Domain || Object.values(row)[0];
            if (domain) domains.push(domain.trim());
        })
        .on('end', async () => {
            try {
                const { default: pLimit } = await import('p-limit');
                const limit = pLimit(2); // Render free tier ke liye 2-3 safe hai

                console.log(`🚀 Processing ${domains.length} domains...`);

                // Saare domains ko parallel process karo helper function se
                const tasks = domains.map(domain => limit(() => getEmailsFromDomain(domain)));
                const results = await Promise.all(tasks);

                // CSV Generate logic
                const json2csvParser = new Parser({ fields: ['domain', 'emails'] });
                const csvData = json2csvParser.parse(results);
                
                const fileName = `result-${Date.now()}.csv`;
                const outputPath = `results/${fileName}`;
                
                if (!fs.existsSync('results')) fs.mkdirSync('results');
                fs.writeFileSync(outputPath, csvData);

                // Success Response
                res.status(200).json({
                    success: true,
                    message: `Scraping completed for ${domains.length} domains.`,
                    downloadUrl: `${process.env.BACKEND_URL}/results/${fileName}`,
                    data: results // Optional: Frontend pe table dikhane ke liye
                });

            } catch (error) {
                console.error("Route Error:", error);
                res.status(500).json({ error: "Processing failed" });
            } finally {
                // Har haal mein temp file delete karo
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            }
        });
});



module.exports = emailScrape;