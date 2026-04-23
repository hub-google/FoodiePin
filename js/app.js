/**
 * FoodiePin Frontend Logic
 */

const CONFIG = {
    // GAS_URL: 'YOUR_GAS_WEB_APP_URL_HERE'
    GAS_URL: 'https://script.google.com/macros/s/AKfycbwVI3VRvibqEZyn--L8AXSYVGOtDHhKGogjjwxJjxNsauoNtQJ4C9IACxV1TTWT9YZR6Q/exec'
};

// State management
let state = {
    user: JSON.parse(localStorage.getItem('foodiepin_user')) || null,
    token: localStorage.getItem('foodiepin_token') || null,
    bookmarks: JSON.parse(localStorage.getItem('foodiepin_bookmarks')) || []
};

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
    renderBookmarks();
    handleIncomingShare();
});

// --- Section Navigation ---
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`section-${sectionId}`).style.display = 'block';
    
    // Set active nav item
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    if (sectionId === 'home') navItems[0].classList.add('active');
    if (sectionId === 'list') navItems[1].classList.add('active');
    if (sectionId === 'profile') navItems[2].classList.add('active');
}

// --- Auth Functions ---
async function handleRegister() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const confirmPassword = document.getElementById('auth-confirm-password').value;
    
    if (!email || !password || !confirmPassword) return alert('請填寫所有欄位');
    if (password !== confirmPassword) return alert('兩次密碼輸入不一致，請重新檢查！');
    
    const res = await apiRequest({ action: 'register', email, password });
    if (res.success) {
        state.user = { email, userId: res.userId };
        state.token = res.token;
        saveState();
        updateUI();
        await syncBookmarks();
    } else {
        alert('註冊失敗: ' + res.error);
    }
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    const res = await apiRequest({ action: 'login', email, password });
    if (res.success) {
        state.user = { email, userId: res.userId };
        state.token = res.token;
        saveState();
        updateUI();
        await syncBookmarks();
    } else {
        alert('登入失敗: ' + res.error);
    }
}

function handleLogout() {
    state.user = null;
    state.token = null;
    state.bookmarks = []; // Optional: keep local or clear on logout
    saveState();
    updateUI();
    location.reload();
}

// --- Data Functions ---
async function parseAndSave(imageBase64 = null) {
    const text = document.getElementById('input-text').value;
    if (!text && !imageBase64) return alert('請輸入內容或上傳截圖');
    
    const btn = document.getElementById('btn-parse');
    btn.disabled = true;
    
    const isSocialUrl = text && (text.includes('instagram.com') || text.includes('facebook.com') || text.includes('fb.com') || text.includes('threads.net'));
    const isGenericUrl = text && text.startsWith('http') && !isSocialUrl;
    
    if (imageBase64) {
        btn.innerText = '🧠 AI 正在辨識圖片...';
    } else if (isSocialUrl) {
        btn.innerText = '🔍 社群深度爬網中 (約 20s)...';
    } else if (isGenericUrl) {
        btn.innerText = '🌐 正在解析網頁內容...';
    } else {
        btn.innerText = '🧠 AI 正在解析...';
    }
    
    try {
        const res = await apiRequest({
            action: 'parse_location',
            text,
            image: imageBase64,
            token: state.token,
            source: imageBase64 ? 'Screenshot' : 'Web'
        });
        
        if (res.success) {
            const data = res.data;
            const mapsUrl = data.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.name + ' ' + data.city_region)}`;
            
            // Update UI with result
            document.getElementById('parse-result').style.display = 'block';
            document.getElementById('result-name').innerText = data.name;
            document.getElementById('result-details').innerText = `${data.city_region} | ${data.category}`;
            document.getElementById('result-maps').href = mapsUrl;
            document.getElementById('save-status').style.display = 'inline-block';
            
            // Add to local list
            const newBookmark = {
                id: res.bookmarkId || Date.now(),
                name: data.name,
                city: data.city_region,
                category: data.category,
                mapsUrl: mapsUrl,
                timestamp: new Date().toISOString()
            };
            
            state.bookmarks.unshift(newBookmark);
            saveState();
            renderBookmarks();
        } else {
            let errorMsg = res.error || '解析失敗';
            if (res.debugInfo) {
                errorMsg += `\n\n[技術診斷]\n訊息: ${res.debugInfo.message}\n軌跡: ${res.debugInfo.stack ? res.debugInfo.stack.substring(0, 100) + '...' : ''}`;
            }
            alert(errorMsg);
        }
    } catch (e) {
        console.error('Frontend Catch:', e);
        alert('解析發生嚴重錯誤，請檢查網路或聯絡維護者。');
    } finally {
        btn.disabled = false;
        btn.innerText = '立即解析並儲存';
    }
}

async function syncBookmarks() {
    if (!state.token) return;
    
    const res = await apiRequest({ action: 'sync_bookmarks', token: state.token });
    if (res.success) {
        // Merge or overwrite? The requirement says "overwrite or merge"
        // Let's overwrite for simplicity as requested by "案例二"
        state.bookmarks = res.bookmarks.map(b => ({
            id: b.id,
            name: b.name,
            city: b.city,
            category: b.category,
            mapsUrl: b.mapsUrl,
            timestamp: b.timestamp
        }));
        saveState();
        renderBookmarks();
    }
}

// --- UI Helpers ---
function updateUI() {
    const headerAuth = document.getElementById('header-auth');
    if (state.user) {
        headerAuth.innerHTML = `
            <span style="font-size: 0.8rem; color: var(--text-muted);">${state.user.email}</span>
            <button id="header-btn-logout" class="btn-ghost" style="width: auto; padding: 5px 12px; font-size: 0.7rem; margin-left: 10px;">登出</button>
        `;
        document.getElementById('header-btn-logout').addEventListener('click', handleLogout);
        
        document.getElementById('auth-unlogged').style.display = 'none';
        document.getElementById('auth-logged').style.display = 'block';
        document.getElementById('logged-email').innerText = `已登入: ${state.user.email}`;
    } else {
        headerAuth.innerHTML = `
            <button id="header-btn-login" class="btn-ghost" style="width: auto; padding: 5px 12px; font-size: 0.7rem;">登入</button>
            <button id="header-btn-register" class="btn-primary" style="width: auto; padding: 5px 12px; font-size: 0.7rem; margin-left: 8px;">註冊</button>
        `;
        document.getElementById('header-btn-login').addEventListener('click', () => showSection('profile'));
        document.getElementById('header-btn-register').addEventListener('click', () => showSection('profile'));
        
        document.getElementById('auth-unlogged').style.display = 'block';
        document.getElementById('auth-logged').style.display = 'none';
    }
}

function renderBookmarks() {
    const container = document.getElementById('food-list-container');
    container.innerHTML = '';
    
    if (state.bookmarks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">還沒有收藏的美食喔！</p>';
        return;
    }
    
    state.bookmarks.forEach(item => {
        const div = document.createElement('div');
        div.className = 'food-item card glass';
        div.innerHTML = `
            <div class="food-info">
                <h3>${item.name}</h3>
                <p>${item.city} | ${item.category}</p>
            </div>
            <a href="${item.mapsUrl}" target="_blank" class="maps-link">📍</a>
        `;
        container.appendChild(div);
    });
}

function saveState() {
    localStorage.setItem('foodiepin_user', JSON.stringify(state.user));
    localStorage.setItem('foodiepin_token', state.token);
    localStorage.setItem('foodiepin_bookmarks', JSON.stringify(state.bookmarks));
}

// --- API Helper ---
async function apiRequest(data) {
    if (!CONFIG.GAS_URL) {
        console.warn('GAS_URL not set. Using mock response.');
        return mockApi(data);
    }
    
    const response = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    return result;
}

// --- Share API ---
if (navigator.share) {
    document.getElementById('btn-share-list').addEventListener('click', () => {
        const text = state.bookmarks.map(b => `${b.name} - ${b.city} (${b.mapsUrl})`).join('\n');
        navigator.share({
            title: '我的美食圖鑑',
            text: text,
            url: window.location.href
        });
    });
}

function handleIncomingShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedText = urlParams.get('text') || urlParams.get('title');
    if (sharedText) {
        document.getElementById('input-text').value = sharedText;
        parseAndSave();
    }
}

// --- Event Listeners ---
document.getElementById('btn-parse').addEventListener('click', () => parseAndSave());
document.getElementById('btn-register').addEventListener('click', handleRegister);
document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('btn-logout').addEventListener('click', handleLogout);
document.getElementById('btn-sync').addEventListener('click', syncBookmarks);
document.getElementById('btn-close-banner').addEventListener('click', () => {
    document.getElementById('install-banner').style.display = 'none';
    localStorage.setItem('foodiepin_banner_closed', new Date().getTime());
});

// Image Upload Logic
document.getElementById('btn-upload').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        await parseAndSave(base64);
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    e.target.value = '';
});

// --- PWA Install Logic ---
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const iosModal = document.getElementById('ios-install-modal');

// Keep it visible as per user request, but detect platform
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Check if user has closed the banner recently (24h)
    const lastClosed = localStorage.getItem('foodiepin_banner_closed');
    const now = new Date().getTime();
    if (!lastClosed || (now - lastClosed > 24 * 60 * 60 * 1000)) {
        installBanner.style.display = 'flex';
    }
});

// Always show for iOS if not already in standalone mode
if (isIOS && !window.navigator.standalone) {
    installBanner.style.display = 'flex';
}

// Fallback: If after 2 seconds no native prompt event, still show banner for manual guidance
setTimeout(() => {
    if (!deferredPrompt && !isIOS && !window.matchMedia('(display-mode: standalone)').matches) {
        installBanner.style.display = 'flex';
    }
}, 2000);

document.getElementById('btn-install-now').addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            installBanner.style.display = 'none';
        } else if (isIOS) {
            // Show iOS instructions
            iosModal.style.display = 'flex';
            installBanner.style.display = 'none';
        }
    });
