/**
 * FoodiePin Backend API - Final Production Version (v1.2 - Stability Fix)
 */

const CONFIG = {
  GEMINI_API_KEY: PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'),
  APIFY_TOKEN: PropertiesService.getScriptProperties().getProperty('APIFY_TOKEN'),
  TOKEN_SECRET: 'foodiepin-secret-2024'
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let response;
    
    switch (action) {
      case 'register': response = handleRegister(payload); break;
      case 'login': response = handleLogin(payload); break;
      case 'parse_location': response = handleParseLocation(payload); break;
      case 'sync_bookmarks': response = handleSyncBookmarks(payload); break;
      default: throw new Error('Invalid action');
    }
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleParseLocation(data) {
  const { text, token, source } = data;
  const userId = token ? verifyToken(token) : null;
  let finalContent = text;
  let scrapedData = null; 

  try {
    let platform = 'UNIVERSAL';
    let targetUrl = text;
    let actorId = 'apify~instagram-scraper';

    if (text) {
      if (text.includes('instagram.com') || text.includes('instagr.am')) {
        platform = 'IG';
        actorId = 'apify~instagram-scraper';
        const igMatch = text.match(/instagram\.com\/(?:p|reels|reel)\/([^/?#&]+)/);
        if (igMatch) targetUrl = `https://www.instagram.com/p/${igMatch[1]}/`;
      } else if (text.includes('facebook.com') || text.includes('fb.watch') || text.includes('fb.com')) {
        platform = 'FB';
        actorId = 'apify~facebook-posts-scraper';
        targetUrl = text;
      }
    }

    // Step 1: Scrape
    scrapedData = fetchApifyContent(targetUrl, actorId, platform);
    if (scrapedData) {
      const postText = scrapedData.text || scrapedData.caption || '';
      const locHint = scrapedData.location || '';
      finalContent = postText + (locHint ? '\n地點標籤: ' + locHint : '');
    }

    // --- EXTRACTION LOGIC ---
    let parsed = null;

    // STRATEGY 1: Metadata
    if (scrapedData && scrapedData.location && scrapedData.location.trim().length > 1) {
      parsed = { name: scrapedData.location.trim(), city_region: '自動偵測', category: '美食', location_clue: scrapedData.location, is_fallback: false };
    }

    // STRATEGY 2: Smart Regex
    if (!parsed && finalContent) {
      const patterns = [/📍\s*([^\n.#]+)/, /🏠\s*([^\n.#]+)/, /店名[:：]\s*([^\n.#]+)/, /#([^\s\n.#]+)/, /【([^】]+)】/];
      for (let p of patterns) {
        const m = finalContent.match(p);
        if (m && m[1] && m[1].trim().length > 1) {
          const name = m[1].trim();
          // 嘗試在全文中尋找地址特徵
          const addrMatch = finalContent.match(/(?:地址|地點)[:：]\s*([^\n.#]+)/) || finalContent.match(/([^\s\n.#]+(?:路|街|巷|弄)[^\s\n.#]+)/);
          const clue = addrMatch ? addrMatch[1].trim() : '';
          parsed = { name: name, city_region: '自動偵測', category: '美食', location_clue: clue, is_fallback: false };
          break;
        }
      }
    }

    // STRATEGY 3: Gemini AI
    if (!parsed && finalContent && finalContent.length > 30) { 
      try {
        parsed = callGeminiAPI(finalContent);
        if (parsed) parsed.is_fallback = false;
      } catch (e) { console.warn(`Gemini Error: ${e.message}`); }
    }

    // Fallback
    if (!parsed || !parsed.name) {
      parsed = { name: '解析中 (請點擊開啟地圖)', city_region: '自動偵測', category: '美食', location_clue: '', is_fallback: true };
    }

    // DB Operations
    logTrend(parsed.name, parsed.city_region, parsed.category, parsed.location_clue, source || 'Direct');
    
    let bId = null;
    if (parsed.name && !parsed.name.includes('解析中')) {
      const q = [parsed.name, parsed.location_clue, parsed.city_region].filter(Boolean).join(' ');
      parsed.maps_url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      if (userId) bId = addBookmark(userId, parsed.name, parsed.city_region, parsed.category, parsed.maps_url);
    }
    
    return { success: true, data: parsed, bookmarkId: bId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function fetchApifyContent(url, actorId, platform) {
    const payload = platform === 'IG' 
        ? { "directUrls": [url], "resultsLimit": 1, "resultsType": "posts", "searchType": "hashtag" }
        : { "startUrls": [{"url": url}], "resultsLimit": 1, "proxyConfiguration": { "useApifyProxy": true } };

    try {
        const startRes = UrlFetchApp.fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${CONFIG.APIFY_TOKEN}`, {
            method: 'post', contentType: 'application/json', payload: JSON.stringify(payload)
        });
        const runId = JSON.parse(startRes.getContentText()).data.id;
        const datasetId = JSON.parse(startRes.getContentText()).data.defaultDatasetId;
        
        let attempts = 0;
        while (attempts < 20) {
            Utilities.sleep(3000);
            const status = JSON.parse(UrlFetchApp.fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${CONFIG.APIFY_TOKEN}`).getContentText()).data.status;
            if (status === 'SUCCEEDED') break;
            if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) return null;
            attempts++;
        }

        const items = JSON.parse(UrlFetchApp.fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${CONFIG.APIFY_TOKEN}`).getContentText());
        if (items && items.length > 0) {
            const it = items[0];
            if (platform === 'IG') return { text: it.caption || '', location: it.locationName || '' };
            let fbText = it.text || '';
            let fbLoc = '';
            if (it.textReferences) {
                const tags = it.textReferences.filter(r => r.url && r.url.includes('hashtag')).map(r => decodeURIComponent(r.url.split('/').pop().split('?')[0]));
                if (tags.length > 0) fbLoc = tags[0];
            }
            return { text: fbText, location: fbLoc };
        }
    } catch (e) { console.error(`Apify Error: ${e.message}`); }
    return null;
}

function callGeminiAPI(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const prompt = `你是一個美食助手。請從以下內容擷取 JSON (name, city_region, category, location_clue):\n\n${text}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), muteHttpExceptions: true
  });
  const json = JSON.parse(res.getContentText());
  const content = json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(content);
}

function handleRegister(d) {
  const u = Utilities.getUuid();
  addUser(u, d.email, hashPassword(d.password));
  return { success: true, token: generateToken(u), userId: u };
}

function handleLogin(d) {
  const u = findUserByEmail(d.email);
  if (!u || u.hash !== hashPassword(d.password)) return { success: false, error: 'Auth failed' };
  return { success: true, token: generateToken(u.id), userId: u.id };
}

function handleSyncBookmarks(data) {
  const u = verifyToken(data.token);
  if (!u) return { success: false, error: 'Unauthorized' };
  return { success: true, bookmarks: getBookmarksForUser(u) };
}

function hashPassword(p) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join(''); }
function generateToken(u) { return Utilities.base64EncodeWebSafe(u + ':' + Date.now()); }
function verifyToken(t) { try { return Utilities.newBlob(Utilities.base64DecodeWebSafe(t)).getDataAsString().split(':')[0]; } catch (e) { return null; } }
