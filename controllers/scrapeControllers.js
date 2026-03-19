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