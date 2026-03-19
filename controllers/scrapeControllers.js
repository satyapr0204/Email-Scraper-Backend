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










function extractFromHtml(html, emailSet) {
    if (!html) return;

    // 1. Improved Regex (Machine IDs ko ignore karne ke liye thoda strict)
    const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;

    // 2. mailto: extraction (NVIDIA/Corporate sites ke liye)
    const $ = cheerio.load(html);
    $('a[href^="mailto:"]').each((i, el) => {
        let email = $(el).attr('href').replace('mailto:', '').split('?')[0];
        addCleanEmail(email, emailSet);
    });

    // 3. Text content extraction
    const matches = html.match(EMAIL_REGEX);
    if (matches) {
        matches.forEach(email => addCleanEmail(email, emailSet));
    }
}

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
