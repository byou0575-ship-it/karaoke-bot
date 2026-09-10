// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   KARAOKE BOT v9.0 - CLEAN & SMART EDITION                               ║
// ║   ✨ Auto-Cleanup · Ephemeral Search · 15s Delete · High Success Rate   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 01] - IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 02] - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_BOT_TOKEN,
    ROBLOX_API_KEY: process.env.ROBLOX_API_KEY,
    ROBLOX_USER_ID: process.env.ROBLOX_USER_ID,
    ROBLOX_API_URL: 'https://apis.roblox.com/assets/v1/assets',
    MUSIC_API_URL: process.env.MUSIC_API_URL || 'https://joox-api.onrender.com',
    UNLOCK_KEY: 'Owjadk@#23241hxb',
    JSONBIN_ID: process.env.JSONBIN_ID,
    JSONBIN_KEY: process.env.JSONBIN_KEY,
    JSONBIN_URL: 'https://api.jsonbin.io/v3/b',
    HTTP_TIMEOUT: 120000,
    DOWNLOAD_TIMEOUT: 180000,
    UPLOAD_TIMEOUT: 180000,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    SONGS_PER_PAGE: 8,
    RATE_LIMIT_MS: 3000,
    UNLOCK_RATE_MS: 10000,
    AUTO_SEARCH_INTERVAL: 90000,
    AUTO_UPDATE_INTERVAL: 15000,
    AUTO_CLEANUP_INTERVAL: 600000, // ★ Cleanup ทุก 10 นาที
    SEARCH_DELETE_TIMEOUT: 15000, // ★ ลบข้อความค้นหาใน 15 วิ
    MAX_DOWNLOAD_RETRIES: 3,
    MAX_SONGS_TO_TRY: 30,
    SEARCH_QUERIES: [
        'เพลงไทย', 'เพลงใหม่', 'เพลงฮิต', 'ลูกทุ่ง', 'หมอลำ',
        'เพลงรัก', 'เพลงเศร้า', 'เพลงสากล', 'Thai pop', 'Thai rock',
        'เพลงไทย 2024', 'เพลงไทย 2025', 'เพลงไวรัล', 'เพลง TikTok',
        'Bodyslam', 'Saran', 'Three Man Down', 'Tattoo Colour',
        'Potato', 'Cocktail', 'Slot Machine', 'Room 39',
        'The Toys', 'Ink Waruntorn', 'Violette Wautier', 'Phum Viphurit'
    ],
    COLOR: {
        PRIMARY: 0x5865F2,
        SUCCESS: 0x57F287,
        WARNING: 0xFEE75C,
        ERROR: 0xED4245,
        INFO: 0x3498DB,
        BLACK: 0x000000,
        GOLD: 0xF1C40F,
        PINK: 0xEB459E,
        PURPLE: 0x9B59B6,
        TEAL: 0x1ABC9C
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 03] - ASSETS
// ═══════════════════════════════════════════════════════════════════════════

const ASSETS = {
    LOADING: 'https://media.tenor.com/On7kvXhzml4AAAAj/loading-gif.gif',
    SUCCESS: 'https://media.tenor.com/8B6m6cZvB5sAAAAC/success.gif',
    MUSIC: 'https://media.tenor.com/XfN7hy_IYWYAAAAC/music.gif',
    KARAOKE: 'https://media.tenor.com/6wL6Zm3cJuIAAAAC/singing.gif',
    DOWNLOAD: 'https://media.tenor.com/KGzZlT5Uu2QAAAAC/download.gif',
    UPLOAD: 'https://media.tenor.com/qKz5v9rUYWYAAAAC/upload.gif',
    DANCING: 'https://media.tenor.com/XQeY7_wKPYwAAAAC/dance.gif',
    MUSIC_NOTES: 'https://media.tenor.com/1Q9hN8kNZ8AAAAAC/music-notes.gif',
    SEARCH: 'https://media.tenor.com/Qg5RJ6wGdpEAAAAC/search.gif',
    LIBRARY: 'https://media.tenor.com/qP3S7gXsV3sAAAAC/library.gif',
    FIRE: 'https://media.tenor.com/2roX3uxz_68AAAAC/fire.gif',
    CHART: 'https://media.tenor.com/YvR6qC4jW1sAAAAC/chart.gif',
    NEW: 'https://media.tenor.com/yJ5fSP7_hQMAAAAC/new.gif',
    BELL: 'https://media.tenor.com/8yWL3gYgBsAAAAAC/bell.gif',
    WARNING: 'https://media.tenor.com/Og5bYvHEB2wAAAAC/warning.gif',
    ROCKET: 'https://media.tenor.com/xGvJCRXtL5IAAAAC/rocket.gif',
    BROOM: 'https://media.tenor.com/6zV3LTFQ8VUAAAAC/broom.gif'
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 04] - GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let songs = {};
let displayChannels = [];
let libraryChannelId = null;
let notificationChannelId = null;
let searchChannelId = null;
let isLocked = true;
let autoTask = null;
let autoUpdateTask = null;
let saveTask = null;
let cleanupTask = null;
let unlockAttempts = new Map();
let commandCooldowns = new Map();

let postedMessages = {
    display: {},
    library: [],
    search: null,
    autoProgress: null
};

let lastLibraryHash = '';
let lastDisplayHashes = {};
let searchQueryIndex = 0;

// ★ นับจำนวนการบันทึกซ้ำ (เช็คก่อน save)
let lastSaveHash = '';
let saveCount = 0;

let stats = {
    totalSearches: 0,
    totalDownloads: 0,
    totalUploads: 0,
    totalFailures: 0,
    totalSongsAdded: 0,
    totalSongsRemoved: 0,
    totalSearchesByUser: 0,
    totalUpdates: 0,
    totalSkipped: 0,
    totalCleaned: 0, // ★ เพลงที่ถูกเคลียร์
    totalDuplicatesRemoved: 0, // ★ เพลงซ้ำที่ลบ
    startTime: Date.now(),
    lastAutoSearch: null,
    lastCleanup: null,
    autoSearchCount: 0,
    cleanupCount: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 05] - EXPRESS SERVER
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'offline',
        locked: isLocked,
        songs: Object.keys(songs).length,
        stats: {
            added: stats.totalSongsAdded,
            skipped: stats.totalSkipped,
            failed: stats.totalFailures,
            cleaned: stats.totalCleaned,
            duplicatesRemoved: stats.totalDuplicatesRemoved
        },
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 06] - DISCORD CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 07] - STORAGE (Smart Save - ไม่บันทึกซ้ำ)
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_BACKUP = '/tmp/backup.json';

async function loadFromCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        loadFromLocal();
        return;
    }
    try {
        const res = await axios.get(
            `${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}/latest`,
            { headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }, timeout: 30000 }
        );
        const data = res.data.record || res.data;
        
        if (data.songs) songs = data.songs;
        if (data.displayChannels) displayChannels = data.displayChannels;
        if (data.libraryChannelId) libraryChannelId = data.libraryChannelId;
        if (data.notificationChannelId) notificationChannelId = data.notificationChannelId;
        if (data.searchChannelId) searchChannelId = data.searchChannelId;
        if (data.isLocked !== undefined) isLocked = data.isLocked;
        
        console.log(`✅ Loaded: ${Object.keys(songs).length} songs`);
        saveToLocal();
    } catch (e) {
        console.error('❌ Load error:', e.message);
        loadFromLocal();
    }
}

// ★★★ Smart Save - เช็ค hash ก่อนบันทึก (ประหยัดพื้นที่) ★★★
async function saveToCloud(force = false) {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        saveToLocal();
        return;
    }
    
    // ★ สร้าง hash เพื่อเช็คว่าข้อมูลเปลี่ยนไหม
    const currentHash = simpleHash(JSON.stringify({
        songsCount: Object.keys(songs).length,
        songIds: Object.keys(songs).sort(),
        channels: displayChannels,
        library: libraryChannelId,
        notification: notificationChannelId,
        search: searchChannelId,
        locked: isLocked
    }));
    
    if (!force && currentHash === lastSaveHash) {
        console.log('💾 Data unchanged - skip save (ประหยัดพื้นที่)');
        return;
    }
    
    try {
        await axios.put(
            `${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}`,
            {
                songs,
                displayChannels,
                libraryChannelId,
                notificationChannelId,
                searchChannelId,
                isLocked,
                lastUpdate: new Date().toISOString()
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.JSONBIN_KEY
                },
                timeout: 30000
            }
        );
        
        lastSaveHash = currentHash;
        saveCount++;
        console.log(`☁️ Saved to cloud (ครั้งที่ ${saveCount})`);
        saveToLocal();
    } catch (e) {
        console.error('❌ Save error:', e.message);
        saveToLocal();
    }
}

function saveToLocal() {
    try {
        fs.writeFileSync(LOCAL_BACKUP, JSON.stringify({
            songs, displayChannels, libraryChannelId,
            notificationChannelId, searchChannelId, isLocked
        }), 'utf8');
    } catch (e) {}
}

function loadFromLocal() {
    try {
        if (fs.existsSync(LOCAL_BACKUP)) {
            const data = JSON.parse(fs.readFileSync(LOCAL_BACKUP, 'utf8'));
            if (data.songs) songs = data.songs;
            if (data.displayChannels) displayChannels = data.displayChannels;
            if (data.libraryChannelId) libraryChannelId = data.libraryChannelId;
            if (data.notificationChannelId) notificationChannelId = data.notificationChannelId;
            if (data.searchChannelId) searchChannelId = data.searchChannelId;
            if (data.isLocked !== undefined) isLocked = data.isLocked;
        }
    } catch (e) {}
}

function startAutoSave() {
    if (saveTask) clearInterval(saveTask);
    saveTask = setInterval(async () => {
        if (Object.keys(songs).length > 0 || displayChannels.length > 0) {
            await saveToCloud();
        }
    }, 60000); // ทุก 1 นาที (จากเดิม 30 วิ)
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 08] - CLEANUP SYSTEM (★ ใหม่)
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupLibrary() {
    try {
        stats.cleanupCount++;
        stats.lastCleanup = new Date().toISOString();
        
        const songList = Object.values(songs);
        const beforeCount = songList.length;
        
        let removedDuplicates = 0;
        let removedInvalid = 0;
        const removedTitles = [];
        
        // ★ 1. หาเพลงซ้ำ (เทียบชื่อ + ศิลปิน)
        const seenKey = new Map();
        for (const song of songList) {
            const key = `${song.title.toLowerCase().trim()}|${song.artist.toLowerCase().trim()}`;
            if (seenKey.has(key)) {
                // ซ้ำ → ลบเพลงที่เพิ่มทีหลัง
                const existing = seenKey.get(key);
                const currentTime = new Date(song.addedAt || 0).getTime();
                const existingTime = new Date(existing.addedAt || 0).getTime();
                
                if (currentTime > existingTime) {
                    // เพลงใหม่กว่า → ลบเพลงเก่า
                    delete songs[existing.id];
                    seenKey.set(key, song);
                    removedTitles.push(`🗑️ ซ้ำ: ${song.title}`);
                } else {
                    // เพลงเก่ากว่า → ลบเพลงใหม่
                    delete songs[song.id];
                    removedTitles.push(`🗑️ ซ้ำ: ${song.title}`);
                }
                removedDuplicates++;
            } else {
                seenKey.set(key, song);
            }
        }
        
        // ★ 2. หาเพลงที่ข้อมูลไม่ครบ (ไม่มี ID, ไม่มีชื่อ, ฯลฯ)
        for (const song of Object.values(songs)) {
            let invalid = false;
            const reasons = [];
            
            if (!song.id || song.id.length < 5) {
                invalid = true;
                reasons.push('ไม่มี ID');
            }
            if (!song.title || song.title.trim() === '' || song.title === 'Unknown') {
                invalid = true;
                reasons.push('ไม่มีชื่อ');
            }
            if (!song.artist || song.artist.trim() === '' || song.artist === 'Unknown') {
                invalid = true;
                reasons.push('ไม่มีศิลปิน');
            }
            if (song.title && song.title.length > 200) {
                invalid = true;
                reasons.push('ชื่อยาวเกิน');
            }
            
            if (invalid) {
                delete songs[song.id];
                removedInvalid++;
                removedTitles.push(`🗑️ ไม่ครบ: ${song.title || song.id}`);
            }
        }
        
        const afterCount = Object.keys(songs).length;
        const removedTotal = beforeCount - afterCount;
        stats.totalCleaned += removedInvalid;
        stats.totalDuplicatesRemoved += removedDuplicates;
        
        // ★ บันทึกถ้ามีการเปลี่ยนแปลง
        if (removedTotal > 0) {
            await saveToCloud(true);
            console.log(`🧹 Cleanup: ลบ ${removedTotal} เพลง (ซ้ำ: ${removedDuplicates}, ไม่ครบ: ${removedInvalid})`);
            return {
                removed: removedTotal,
                duplicates: removedDuplicates,
                invalid: removedInvalid,
                before: beforeCount,
                after: afterCount,
                titles: removedTitles
            };
        }
        
        console.log(`🧹 Cleanup: ไม่มีเพลงที่ต้องลบ (${beforeCount} เพลง)`);
        return {
            removed: 0,
            duplicates: 0,
            invalid: 0,
            before: beforeCount,
            after: afterCount,
            titles: []
        };
    } catch (e) {
        console.error('❌ Cleanup error:', e.message);
        return { removed: 0, error: e.message };
    }
}

function startAutoCleanup() {
    if (cleanupTask) clearInterval(cleanupTask);
    cleanupTask = setInterval(async () => {
        if (isLocked) return;
        try {
            await cleanupLibrary();
        } catch (e) {}
    }, CONFIG.AUTO_CLEANUP_INTERVAL);
    console.log(`🧹 Auto-cleanup enabled (every ${CONFIG.AUTO_CLEANUP_INTERVAL/1000}s)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 09] - SECURITY
// ═══════════════════════════════════════════════════════════════════════════

function verifyKey(input) {
    if (!input) return false;
    return input === CONFIG.UNLOCK_KEY;
}

function checkUnlockRateLimit(userId) {
    const now = Date.now();
    const last = unlockAttempts.get(userId) || 0;
    if (now - last < CONFIG.UNLOCK_RATE_MS) return false;
    unlockAttempts.set(userId, now);
    return true;
}

function checkCooldown(userId, command) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    const last = commandCooldowns.get(key) || 0;
    if (now - last < CONFIG.RATE_LIMIT_MS) return false;
    commandCooldowns.set(key, now);
    return true;
}

function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function checkAccess(interaction) {
    if (!isAdmin(interaction)) {
        return { allowed: false, reason: '❌ คำสั่งนี้ใช้ได้เฉพาะ Admin เท่านั้น!' };
    }
    if (isLocked && !['unlock', 'status', 'help'].includes(interaction.commandName)) {
        return { allowed: false, reason: '🔒 บอทถูกล็อกอยู่! ใช้ `/unlock` เพื่อปลดล็อก' };
    }
    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 10] - CONTENT FILTER
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "โง่", "ควาย",
    "xxx", "porn", "sex", "18+", "หนังโป๊", "ลามก",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง",
    "บูลลี่", "bully", "เหยียด", "ชาติพันธุ์",
    "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    return BANNED_WORDS.some(w => text.includes(w.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 11] - UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}วัน ${h}ชม.`;
    if (h > 0) return `${h}ชม. ${m}นาที`;
    if (m > 0) return `${m}นาที`;
    return `${s} วินาที`;
}

function progressBar(current, total, length = 20) {
    if (total === 0) return `\`[${'░'.repeat(length)}]\` **0%**`;
    const pct = Math.min(Math.round((current / total) * 100), 100);
    const filled = Math.round((pct / 100) * length);
    return `\`[${'█'.repeat(filled)}${'░'.repeat(length - filled)}]\` **${pct}%**`;
}

function truncate(str, len = 50) {
    if (!str) return 'Unknown';
    return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

function searchSongs(query) {
    const lower = query.toLowerCase();
    return Object.values(songs).filter(s => 
        s.title.toLowerCase().includes(lower) ||
        s.artist.toLowerCase().includes(lower)
    );
}

function simpleHash(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getNextSearchQuery() {
    const query = CONFIG.SEARCH_QUERIES[searchQueryIndex];
    searchQueryIndex = (searchQueryIndex + 1) % CONFIG.SEARCH_QUERIES.length;
    return query;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 12] - MUSIC API
// ═══════════════════════════════════════════════════════════════════════════

async function searchJoox(query) {
    try {
        stats.totalSearches++;
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, {
            params: { q: query, type: 'song', sources: 'joox' },
            timeout: 90000
        });
        return res.data?.data?.songs || [];
    } catch (e) {
        console.error(`Search error: ${e.message}`);
        return [];
    }
}

async function searchMultipleQueries(count = 3) {
    const allSongs = [];
    const seenIds = new Set();
    
    for (let i = 0; i < count; i++) {
        const query = getNextSearchQuery();
        console.log(`🔍 Query [${i+1}/${count}]: "${query}"`);
        const results = await searchJoox(query);
        
        for (const song of results) {
            if (!seenIds.has(song.id)) {
                seenIds.add(song.id);
                allSongs.push({ ...song, searchQuery: query });
            }
        }
        
        if (i < count - 1) await sleep(2000);
    }
    
    return shuffleArray(allSongs);
}

async function getDirectUrl(songId, source = 'joox') {
    try {
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/url`, {
            params: { id: songId, source },
            timeout: 60000
        });
        return res.data?.url || res.data?.data?.url || null;
    } catch { return null; }
}

async function downloadViaStream(songId, source = 'joox') {
    try {
        const url = `${CONFIG.MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(songId)}&source=${source}`;
        const res = await axios.get(url, {
            responseType: 'stream',
            timeout: CONFIG.DOWNLOAD_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        const ct = res.headers['content-type'] || '';
        if (!ct.includes('audio') && !ct.includes('octet-stream')) return null;
        return res.data;
    } catch { return null; }
}

async function switchSource(songId, songName, artist, source = 'joox') {
    try {
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/switch`, {
            params: { id: songId, source, name: songName, artist },
            timeout: 90000
        });
        if (res.data?.url) return { type: 'url', url: res.data.url };
        if (res.data?.data?.url) return { type: 'url', url: res.data.data.url };
        if (res.data?.id) return { type: 'id', id: res.data.id, source: res.data.source };
        return null;
    } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 13] - DOWNLOAD (ปรับปรุงให้สำเร็จมากขึ้น)
// ═══════════════════════════════════════════════════════════════════════════

async function downloadAudioOnce(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    // Layer 1: Direct URL
    try {
        const directUrl = await getDirectUrl(songId, source);
        if (directUrl) {
            const res = await axios.get(directUrl, {
                responseType: 'stream',
                timeout: CONFIG.DOWNLOAD_TIMEOUT,
                maxContentLength: Infinity,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.joox.com/' }
            });
            const writer = fs.createWriteStream(tempPath);
            res.data.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            if (fs.statSync(tempPath).size > 1024) {
                stats.totalDownloads++;
                return tempPath;
            }
            try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    } catch (e) {}
    
    // Layer 2: Stream
    try {
        const stream = await downloadViaStream(songId, source);
        if (stream) {
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            if (fs.statSync(tempPath).size > 1024) {
                stats.totalDownloads++;
                return tempPath;
            }
            try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    } catch (e) {}
    
    // Layer 3: Switch
    try {
        const sw = await switchSource(songId, songName, artist, source);
        if (sw?.type === 'id') {
            const stream = await downloadViaStream(sw.id, sw.source);
            if (stream) {
                const writer = fs.createWriteStream(tempPath);
                stream.pipe(writer);
                await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
                if (fs.statSync(tempPath).size > 1024) {
                    stats.totalDownloads++;
                    return tempPath;
                }
                try { fs.unlinkSync(tempPath); } catch (e) {}
            }
        } else if (sw?.type === 'url') {
            const res = await axios.get(sw.url, {
                responseType: 'stream',
                timeout: CONFIG.DOWNLOAD_TIMEOUT
            });
            const writer = fs.createWriteStream(tempPath);
            res.data.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            if (fs.statSync(tempPath).size > 1024) {
                stats.totalDownloads++;
                return tempPath;
            }
            try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    } catch (e) {}
    
    return null;
}

async function downloadAudio(songId, songName, artist, source = 'joox') {
    for (let attempt = 1; attempt <= CONFIG.MAX_DOWNLOAD_RETRIES; attempt++) {
        console.log(`⬇️ [Attempt ${attempt}/${CONFIG.MAX_DOWNLOAD_RETRIES}] ${songName}`);
        const result = await downloadAudioOnce(songId, songName, artist, source);
        if (result) {
            console.log(`✅ Downloaded on attempt ${attempt}`);
            return result;
        }
        if (attempt < CONFIG.MAX_DOWNLOAD_RETRIES) {
            console.log(`⏳ Retry in 2s...`);
            await sleep(2000);
        }
    }
    stats.totalFailures++;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 14] - ROBLOX UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

async function uploadToRoblox(filePath, title, artist) {
    if (!CONFIG.ROBLOX_API_KEY || !CONFIG.ROBLOX_USER_ID) {
        return { success: false, error: 'ไม่ได้ตั้งค่า ROBLOX' };
    }
    try {
        const buf = fs.readFileSync(filePath);
        if (buf.length > CONFIG.MAX_FILE_SIZE) {
            return { success: false, error: 'ไฟล์ใหญ่เกิน 20MB' };
        }
        
        const form = new FormData();
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: { creator: { userId: parseInt(CONFIG.ROBLOX_USER_ID) } }
        }), { contentType: 'application/json' });
        form.append('fileContent', buf, {
            filename: path.basename(filePath),
            contentType: 'audio/mpeg'
        });
        
        const res = await axios.post(CONFIG.ROBLOX_API_URL, form, {
            headers: { 'x-api-key': CONFIG.ROBLOX_API_KEY, ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: CONFIG.UPLOAD_TIMEOUT
        });
        
        if (res.data?.assetId) {
            stats.totalUploads++;
            return { success: true, assetId: String(res.data.assetId) };
        }
        return { success: false, error: JSON.stringify(res.data).slice(0, 200) };
    } catch (e) {
        return { success: false, error: e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 15] - PROCESS SONG (ตรวจสอบซ้ำก่อนเพิ่ม)
// ═══════════════════════════════════════════════════════════════════════════

async function processSong(song, interaction = null, index = 0, total = 1) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    
    // ★ ตรวจสอบว่ามี ID อยู่แล้ว
    if (songs[songId]) {
        stats.totalSkipped++;
        console.log(`⏭️ Skip (ID ซ้ำ): ${title}`);
        return { status: 'skipped', reason: 'ID ซ้ำ' };
    }
    
    // ★ ตรวจสอบชื่อ + ศิลปิน ซ้ำ (ป้องกันการเพิ่มซ้ำคนละ ID)
    const dupeCheck = Object.values(songs).find(s => 
        s.title.toLowerCase().trim() === title.toLowerCase().trim() &&
        s.artist.toLowerCase().trim() === artist.toLowerCase().trim()
    );
    
    if (dupeCheck) {
        stats.totalSkipped++;
        console.log(`⏭️ Skip (ชื่อ+ศิลปิน ซ้ำ): ${title}`);
        return { status: 'skipped', reason: 'ชื่อ+ศิลปิน ซ้ำ' };
    }
    
    // ★ ตรวจสอบว่า title/artist ไม่ว่าง
    if (!title || title === 'Unknown' || !artist || artist === 'Unknown') {
        stats.totalSkipped++;
        console.log(`⏭️ Skip (ข้อมูลไม่ครบ): ${title}`);
        return { status: 'skipped', reason: 'ข้อมูลไม่ครบ' };
    }
    
    // ตรวจสอบเนื้อหา
    if (isBanned(title, artist)) {
        stats.totalSkipped++;
        return { status: 'banned', reason: 'ถูกคัดกรอง' };
    }
    
    try {
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬇️ กำลังดาวน์โหลดเพลงที่ ${index+1}/${total}`)
                    .setDescription(
                        `🎵 **${truncate(title, 60)}**\n` +
                        `🎤 ${truncate(artist, 50)}\n\n` +
                        `${progressBar(index, total)}\n\n` +
                        `📊 **สถานะ:** ⬇️ ดาวน์โหลด MP3...`
                    )
                    .setColor(CONFIG.COLOR.WARNING)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        if (!audioPath) {
            console.log(`❌ Download failed: ${title}`);
            return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        }
        
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬆️ กำลังอัปโหลดเพลงที่ ${index+1}/${total}`)
                    .setDescription(
                        `🎵 **${truncate(title, 60)}**\n` +
                        `🎤 ${truncate(artist, 50)}\n\n` +
                        `${progressBar(index + 0.5, total)}\n\n` +
                        `📊 **สถานะ:** ⬆️ อัปโหลดขึ้น Roblox...`
                    )
                    .setColor(CONFIG.COLOR.INFO)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        // ★ เพิ่มเข้าคลังเฉพาะเมื่อ upload สำเร็จ
        if (uploadResult.success) {
            songs[songId] = {
                id: songId,
                title,
                artist,
                thumbnail: song.cover || null,
                album: song.album || null,
                duration: song.duration || 0,
                robloxAssetId: uploadResult.assetId,
                robloxError: null,
                source: 'joox',
                searchQuery: song.searchQuery || null,
                addedAt: new Date().toISOString()
            };
            stats.totalSongsAdded++;
            console.log(`✅ Added: ${title} (${uploadResult.assetId})`);
        } else {
            console.log(`❌ Upload failed, not adding: ${title}`);
        }
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        
        if (uploadResult.success) {
            await notifyNewSong(songs[songId]);
            await updateAllChannels();
            await saveToCloud();
        }
        
        return { status: uploadResult.success ? 'success' : 'failed', song: songs[songId], uploadResult };
    } catch (e) {
        console.error(`Process error: ${e.message}`);
        return { status: 'failed', reason: e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 16] - NOTIFY
// ═══════════════════════════════════════════════════════════════════════════

async function notifyNewSong(song) {
    if (!notificationChannelId) return;
    try {
        const channel = client.channels.cache.get(notificationChannelId);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 เพลงใหม่มาแล้ว!')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                `🎵 **${truncate(song.title, 80)}**\n` +
                `🎤 ${truncate(song.artist, 60)}\n` +
                `⏱️ ${fmtDuration(song.duration)}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                `🟢 **นำเข้า Roblox แล้ว!**\n\`${song.robloxAssetId}\`\n\n` +
                `📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง`
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setImage(ASSETS.NEW)
            .setFooter({ text: `🔔 ${new Date().toLocaleTimeString('th-TH')}` })
            .setTimestamp();
        
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        
        await channel.send({ 
            content: '@everyone 🎵 เพลงใหม่มาแล้ว!',
            embeds: [embed] 
        });
    } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 17] - BUILD EMBEDS
// ═══════════════════════════════════════════════════════════════════════════

function buildSongListEmbed(channelName = 'รายการเพลง Karaoke') {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return new EmbedBuilder()
            .setTitle('🎤 ' + channelName)
            .setDescription('```\n📭 ยังไม่มีเพลงในคลัง\n```\n💡 ใช้ `/หาเพลง` หรือ `/เริ่มหาเพลง`')
            .setColor(CONFIG.COLOR.BLACK)
            .setImage(ASSETS.MUSIC)
            .setFooter({ text: `📊 0 เพลง · ${new Date().toLocaleTimeString('th-TH')}` });
    }
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    const sortedSongs = [...songList].sort((a, b) => 
        new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
    );
    
    const chunk = sortedSongs.slice(0, CONFIG.SONGS_PER_PAGE);
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 ' + channelName)
        .setColor(CONFIG.COLOR.BLACK);
    
    embed.addFields({
        name: '📊 สถิติ',
        value: `> 🎵 **ทั้งหมด:** \`${songList.length}\` · 🟢 **นำเข้า:** \`${uploaded}\` · 🔴 **รอ:** \`${pending}\``,
        inline: false
    });
    
    let desc = '📀 **เพลงล่าสุด:**\n\n';
    chunk.forEach((s, i) => {
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `**${i+1}.** ${r} **${truncate(s.title, 50)}**\n`;
        desc += `　　🎤 ${truncate(s.artist, 40)} · ⏱️ ${dur}\n\n`;
    });
    
    if (songList.length > CONFIG.SONGS_PER_PAGE) {
        desc += `\n*...และอีก **${songList.length - CONFIG.SONGS_PER_PAGE}** เพลง*`;
    }
    
    embed.setDescription(desc);
    embed.setFooter({ 
        text: `📊 ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${pending} · ${new Date().toLocaleTimeString('th-TH')}`
    });
    embed.setTimestamp();
    
    return embed;
}

function buildLibraryEmbed(page = 0) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return {
            embed: new EmbedBuilder().setTitle('📚 คลังเพลง').setDescription('*ว่างเปล่า*').setColor(CONFIG.COLOR.BLACK).setImage(ASSETS.LIBRARY),
            pages: 1, currentPage: 0, total: 0
        };
    }
    
    songList.sort((a, b) => a.title.localeCompare(b.title));
    
    const totalPages = Math.max(1, Math.ceil(songList.length / CONFIG.SONGS_PER_PAGE));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * CONFIG.SONGS_PER_PAGE;
    const chunk = songList.slice(start, start + CONFIG.SONGS_PER_PAGE);
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    const embed = new EmbedBuilder()
        .setTitle('📚 คลังเพลงทั้งหมด')
        .setDescription(
            `**📊 สถิติ:**\n` +
            `> 🎵 ทั้งหมด: \`${songList.length}\`\n` +
            `> 🟢 นำเข้า Roblox: \`${uploaded}\`\n` +
            `> 🔴 รอนำเข้า: \`${pending}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setColor(CONFIG.COLOR.PRIMARY)
        .setFooter({ 
            text: `📄 หน้า ${currentPage + 1}/${totalPages} · รวม ${songList.length} เพลง · ${new Date().toLocaleTimeString('th-TH')}`
        });
    
    let desc = embed.data.description + '\n';
    chunk.forEach((s, i) => {
        const num = start + i + 1;
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `**${num}.** ${r} **${truncate(s.title, 55)}**\n`;
        desc += `　🎤 ${truncate(s.artist, 45)}\n`;
        desc += `　⏱️ ${dur} · 🆔 \`${s.id.slice(0, 12)}\`\n\n`;
    });
    
    embed.setDescription(desc);
    return { embed, pages: totalPages, currentPage, total: songList.length };
}

function buildLibraryButtons(currentPage, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lib_first').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('lib_prev').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('lib_page').setLabel(`${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('lib_next').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder().setCustomId('lib_last').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 18] - POST CHANNELS
// ═══════════════════════════════════════════════════════════════════════════

async function deleteOldMessages(channel, messageIds) {
    if (!channel || !messageIds || messageIds.length === 0) return;
    for (const id of messageIds) {
        try {
            const msg = await channel.messages.fetch(id);
            if (msg) await msg.delete();
        } catch (e) {}
    }
}

async function postToDisplayChannels() {
    if (displayChannels.length === 0) return;
    
    const hash = simpleHash(JSON.stringify(Object.values(songs).map(s => ({ id: s.id, r: s.robloxAssetId }))));
    
    for (let i = 0; i < displayChannels.length; i++) {
        const chId = displayChannels[i];
        const channelName = `รายการเพลง Karaoke (ช่อง ${i+1})`;
        
        if (lastDisplayHashes[chId] === hash) continue;
        
        try {
            const channel = client.channels.cache.get(chId);
            if (!channel) continue;
            
            if (postedMessages.display[chId]?.length > 0) {
                await deleteOldMessages(channel, postedMessages.display[chId]);
            }
            postedMessages.display[chId] = [];
            
            const embed = buildSongListEmbed(channelName);
            const msg = await channel.send({ embeds: [embed] });
            postedMessages.display[chId] = [msg.id];
            
            lastDisplayHashes[chId] = hash;
            stats.totalUpdates++;
        } catch (e) {}
    }
}

async function postToLibraryChannel() {
    if (!libraryChannelId) return;
    
    const hash = simpleHash(JSON.stringify(Object.values(songs).map(s => ({ id: s.id, r: s.robloxAssetId }))));
    if (lastLibraryHash === hash) return;
    
    try {
        const channel = client.channels.cache.get(libraryChannelId);
        if (!channel) return;
        
        if (postedMessages.library.length > 0) {
            await deleteOldMessages(channel, postedMessages.library);
        }
        postedMessages.library = [];
        
        const { embed, pages, currentPage } = buildLibraryEmbed(0);
        const buttons = pages > 1 ? [buildLibraryButtons(currentPage, pages)] : [];
        
        const msg = await channel.send({ embeds: [embed], components: buttons });
        postedMessages.library = [msg.id];
        
        lastLibraryHash = hash;
        stats.totalUpdates++;
    } catch (e) {}
}

async function postToSearchChannel() {
    if (!searchChannelId) return;
    try {
        const channel = client.channels.cache.get(searchChannelId);
        if (!channel) return;
        
        if (postedMessages.search) {
            await deleteOldMessages(channel, [postedMessages.search]);
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 ค้นหาเพลง')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '**📝 วิธีค้นหาเพลง:**\n\n' +
                '> พิมพ์ชื่อเพลงหรือชื่อศิลปินในช่องนี้\n' +
                '> ผลลัพธ์จะแสดง **เฉพาะคุณเห็น** และลบใน **15 วินาที**\n\n' +
                '**✨ ตัวอย่าง:**\n' +
                '> `Saran` · `Bodyslam` · `แค่เพื่อน` · `Potato`\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                `**📊 เพลงในคลัง:** ${Object.keys(songs).length} เพลง\n` +
                `**🔄 อัปเดต:** ${new Date().toLocaleTimeString('th-TH')}`
            )
            .setColor(CONFIG.COLOR.PRIMARY)
            .setImage(ASSETS.SEARCH)
            .setFooter({ text: '💡 ผลลัพธ์จะหายไปใน 15 วินาที' });
        
        const msg = await channel.send({ embeds: [embed] });
        postedMessages.search = msg.id;
    } catch (e) {}
}

async function updateAllChannels() {
    await postToDisplayChannels();
    await postToLibraryChannel();
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 19] - AUTO UPDATE
// ═══════════════════════════════════════════════════════════════════════════

function startAutoUpdate() {
    if (autoUpdateTask) clearInterval(autoUpdateTask);
    autoUpdateTask = setInterval(async () => {
        if (isLocked) return;
        try { await updateAllChannels(); } catch (e) {}
    }, CONFIG.AUTO_UPDATE_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 20] - AUTO SEARCH
// ═══════════════════════════════════════════════════════════════════════════

async function runAutoSearch(channel) {
    if (isLocked) return;
    
    try {
        stats.autoSearchCount++;
        stats.lastAutoSearch = new Date().toISOString();
        
        const startEmbed = new EmbedBuilder()
            .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
            .setDescription(
                `⏱️ **เริ่ม:** ${new Date().toLocaleTimeString('th-TH')}\n` +
                `🔄 **รอบที่:** ${stats.autoSearchCount}\n` +
                `📋 **กำลังค้นหา 3 คำ**\n\n` +
                `${progressBar(0, 1)}`
            )
            .setColor(CONFIG.COLOR.WARNING)
            .setImage(ASSETS.SEARCH);
        
        let progressMsg;
        if (postedMessages.autoProgress) {
            try {
                const old = await channel.messages.fetch(postedMessages.autoProgress);
                await old.delete();
            } catch {}
        }
        progressMsg = await channel.send({ embeds: [startEmbed] });
        postedMessages.autoProgress = progressMsg.id;
        
        const results = await searchMultipleQueries(3);
        console.log(`🔍 Found ${results.length} unique songs`);
        
        if (results.length === 0) {
            await progressMsg.edit({
                embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setDescription('🔄 รอรอบถัดไป').setColor(CONFIG.COLOR.WARNING)]
            });
            return;
        }
        
        const maxToTry = Math.min(results.length, CONFIG.MAX_SONGS_TO_TRY);
        
        let skippedCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < maxToTry; i++) {
            const song = results[i];
            
            if (songs[song.id]) {
                skippedCount++;
                continue;
            }
            
            const r = await processSong(song, progressMsg, i, maxToTry);
            
            if (r.status === 'success') {
                await progressMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                        .setDescription(
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            `🎵 **${truncate(r.song.title, 60)}**\n` +
                            `🎤 ${truncate(r.song.artist, 50)}\n` +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                            `${progressBar(i + 1, maxToTry)}\n\n` +
                            `🟢 **Roblox:** \`${r.uploadResult.assetId}\`\n` +
                            `📊 **รวม:** ${Object.keys(songs).length} เพลง\n` +
                            `⏭️ ข้าม: ${skippedCount} · ❌ ล้ม: ${failedCount}\n\n` +
                            `🔄 รอบถัดไปใน ${CONFIG.AUTO_SEARCH_INTERVAL/1000} วิ`
                        )
                        .setColor(CONFIG.COLOR.SUCCESS)
                        .setImage(ASSETS.SUCCESS)
                        .setThumbnail(r.song.thumbnail)
                    ]
                });
                return;
            } else if (r.status === 'skipped') {
                skippedCount++;
            } else if (r.status === 'failed') {
                failedCount++;
            }
        }
        
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle('⏭️ ไม่มีเพลงใหม่ในรอบนี้')
                .setDescription(
                    `ลองทั้งหมด **${maxToTry}** เพลง\n\n` +
                    `⏭️ ข้าม: \`${skippedCount}\` · ❌ ล้ม: \`${failedCount}\`\n\n` +
                    `🔄 รอ ${CONFIG.AUTO_SEARCH_INTERVAL/1000} วิ`
                )
                .setColor(CONFIG.COLOR.WARNING)
            ]
        });
    } catch (e) {
        console.error('Auto search error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 21] - EPHEMERAL SEARCH (★ ใหม่ - แสดงเฉพาะคนพิมพ์ + ลบ 15 วิ)
// ═══════════════════════════════════════════════════════════════════════════

async function handleSearchMessage(message, query) {
    const results = searchSongs(query);
    stats.totalSearchesByUser++;
    
    let embed;
    
    if (results.length === 0) {
        embed = new EmbedBuilder()
            .setTitle(`🔍 "${truncate(query, 40)}"`)
            .setDescription(
                '❌ **ไม่พบเพลงที่ตรงกัน**\n\n' +
                '💡 ลองพิมพ์ชื่อเพลงหรือศิลปิน\n' +
                '⏱️ ข้อความนี้จะหายไปใน 15 วินาที'
            )
            .setColor(CONFIG.COLOR.ERROR)
            .setFooter({ text: `📊 คลังมี ${Object.keys(songs).length} เพลง · ${new Date().toLocaleTimeString('th-TH')}` });
    } else {
        const displayed = results.slice(0, 10);
        embed = new EmbedBuilder()
            .setTitle(`🔍 "${truncate(query, 40)}"`)
            .setDescription(
                `✅ พบ **${results.length}** เพลง${results.length > 10 ? ' (แสดง 10)' : ''}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `🎵 ${new Date().toLocaleTimeString('th-TH')} · ⏱️ หายใน 15 วิ` });
        
        let desc = embed.data.description;
        displayed.forEach((s, i) => {
            const r = s.robloxAssetId ? '🟢' : '🔴';
            const dur = fmtDuration(s.duration);
            desc += `\n**${i+1}.** ${r} **${truncate(s.title, 50)}**\n`;
            desc += `　🎤 ${truncate(s.artist, 40)} · ⏱️ ${dur}\n`;
        });
        
        embed.setDescription(desc);
        if (displayed[0].thumbnail) embed.setThumbnail(displayed[0].thumbnail);
    }
    
    // ★ ส่งแบบ reply (เฉพาะคนพิมพ์เห็น) แล้วลบใน 15 วินาที
    try {
        const reply = await message.reply({ embeds: [embed] });
        
        // ★ ลบ reply + ข้อความเดิมใน 15 วิ
        setTimeout(async () => {
            try { await reply.delete(); } catch (e) {}
        }, CONFIG.SEARCH_DELETE_TIMEOUT);
    } catch (e) {
        console.error('Reply error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 22] - BOT READY
// ═══════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลง: ${Object.keys(songs).length}`);
    console.log(`📺 ช่องแสดง: ${displayChannels.length}`);
    console.log('═'.repeat(70) + '\n');
    
    await loadFromCloud();
    
    // ★ รัน Cleanup ครั้งแรก
    const cleanResult = await cleanupLibrary();
    if (cleanResult.removed > 0) {
        console.log(`🧹 Initial cleanup: ลบ ${cleanResult.removed} เพลง`);
    }
    
    startAutoSave();
    startAutoUpdate();
    startAutoCleanup();
    
    const commands = [
        new SlashCommandBuilder().setName('unlock').setDescription('🔓 ปลดล็อกบอท')
            .addStringOption(o => o.setName('key').setDescription('Key').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('lock').setDescription('🔒 ล็อกบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('panel').setDescription('🎛️ แผงควบคุม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('status').setDescription('📊 สถานะ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('help').setDescription('📖 คำสั่งทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('ตั้งค่าช่องแสดง').setDescription('📺 ตั้งค่าช่องแสดงเพลง')
            .addChannelOption(o => o.setName('ช่อง1').setDescription('ช่องที่ 1').setRequired(true))
            .addChannelOption(o => o.setName('ช่อง2').setDescription('ช่องที่ 2').setRequired(false))
            .addChannelOption(o => o.setName('ช่อง3').setDescription('ช่องที่ 3').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าคลังเพลง').setDescription('📚 ตั้งค่าช่องคลังเพลง')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าช่องแจ้งเตือน').setDescription('🔔 ช่องแจ้งเตือน')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าช่องค้นหา').setDescription('🔍 ช่องค้นหา')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ทดสอบ').setDescription('🧪 ทดสอบ API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('หาเพลง').setDescription('🔍 ค้นหาเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('🎤 ดึงเพลงศิลปิน')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('🔥 เพลงฮิต')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('🚀 เริ่มระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('⏹️ หยุดระบบ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('คลังเพลง').setDescription('📚 ดูคลังเพลง (ทุกคน)'),
        new SlashCommandBuilder().setName('ค้นหา').setDescription('🔎 ค้นหาในคลัง (ทุกคน)')
            .addStringOption(o => o.setName('คำค้น').setDescription('คำค้น').setRequired(true)),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('🎲 สุ่มเพลง (ทุกคน)'),
        new SlashCommandBuilder().setName('ข้อมูลเพลง').setDescription('ℹ️ ข้อมูลเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('🗑️ ลบเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('อัปโหลด').setDescription('📤 เลือกเพลงอัปโหลด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปโหลดทั้งหมด').setDescription('📤 อัปโหลดทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder().setName('สถิติ').setDescription('📈 สถิติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สำรองข้อมูล').setDescription('💾 สำรอง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปเดตช่อง').setDescription('🔄 อัปเดตช่อง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // ★ คำสั่งใหม่: เคลียร์คลัง
        new SlashCommandBuilder().setName('เคลียร์คลัง').setDescription('🧹 เคลียร์เพลงซ้ำ + เพลงไม่ครบ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) { console.error(e.message); }
    
    await updateAllChannels();
    await postToSearchChannel();
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 23] - MESSAGE LISTENER (ช่องค้นหา)
// ═══════════════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!searchChannelId || message.channelId !== searchChannelId) return;
    
    const query = message.content.trim();
    if (!query) return;
    
    // ★ ลบข้อความผู้ใช้ทันที
    try { await message.delete(); } catch {}
    
    if (!checkCooldown(message.author.id, 'search_msg')) return;
    
    await handleSearchMessage(message, query);
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 24] - INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(CONFIG.COLOR.BLACK);
    
    // PUBLIC commands
    if (commandName === 'คลังเพลง') {
        const { embed, pages, currentPage } = buildLibraryEmbed(0);
        if (pages <= 1) return interaction.reply({ embeds: [embed] });
        return interaction.reply({ embeds: [embed], components: [buildLibraryButtons(currentPage, pages)] });
    }
    
    if (commandName === 'ค้นหา') {
        const filter = options.getString('คำค้น');
        const results = searchSongs(filter);
        stats.totalSearchesByUser++;
        
        if (results.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle(`🔍 "${filter}"`).setDescription(`❌ ไม่พบเพลง`).setColor(CONFIG.COLOR.ERROR).setImage(ASSETS.WARNING)],
                ephemeral: true
            });
        }
        
        const displayed = results.slice(0, 10);
        const embed = new EmbedBuilder()
            .setTitle(`🔍 "${filter}"`)
            .setDescription(`✅ พบ **${results.length}** เพลง\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `🎵 จากคลัง ${Object.keys(songs).length} เพลง` });
        
        let desc = embed.data.description;
        displayed.forEach((s, i) => {
            const r = s.robloxAssetId ? '🟢' : '🔴';
            desc += `\n**${i+1}.** ${r} **${truncate(s.title, 55)}**\n　🎤 ${truncate(s.artist, 45)}\n`;
        });
        embed.setDescription(desc);
        if (displayed[0].thumbnail) embed.setThumbnail(displayed[0].thumbnail);
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (commandName === 'สุ่มเพลง') {
        const list = Object.values(songs);
        if (list.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        const s = list[Math.floor(Math.random() * list.length)];
        
        return interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(`🎵 **${truncate(s.title, 60)}**\n🎤 ${truncate(s.artist, 50)}`)
                .addFields(
                    { name: '⏱️ ความยาว', value: `\`${fmtDuration(s.duration)}\``, inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId ? `\`${s.robloxAssetId}\`` : '🔴 รอ', inline: true }
                )
                .setThumbnail(s.thumbnail)
                .setImage(ASSETS.MUSIC_NOTES)
                .setColor(CONFIG.COLOR.PINK)
            ],
            ephemeral: true
        });
    }
    
    // Admin commands
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        if (!checkUnlockRateLimit(interaction.user.id)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รอ 10 วินาที!')], ephemeral: true });
        
        if (verifyKey(options.getString('key'))) {
            isLocked = false;
            await saveToCloud(true);
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle('🔓 ปลดล็อกสำเร็จ!').setDescription('ใช้ `/panel` เพื่อเปิดแผงควบคุม').setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.SUCCESS)],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Key ไม่ถูกต้อง!').setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    }
    
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        isLocked = true;
        await saveToCloud(true);
        return interaction.reply({ embeds: [replyEmbed.setDescription('🔒 ล็อกบอทแล้ว!').setColor(CONFIG.COLOR.WARNING)] });
    }
    
    if (commandName === 'panel') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        const { embed, components } = buildAdminPanel();
        return interaction.reply({ embeds: [embed], components });
    }
    
    if (commandName === 'status') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📊 สถานะบอท')
                .addFields(
                    { name: '🔒 สถานะ', value: isLocked ? '`🔒 ล็อก`' : '`🔓 ปลดล็อก`', inline: true },
                    { name: '⏱️ ออนไลน์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
                    { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? '`✅ Cloud`' : '`⚠️ Local`', inline: true },
                    { name: '📂 เพลงทั้งหมด', value: `\`${songList.length}\``, inline: true },
                    { name: '🟢 นำเข้า Roblox', value: `\`${uploaded}\``, inline: true },
                    { name: '🔴 รอนำเข้า', value: `\`${songList.length - uploaded}\``, inline: true },
                    { name: '🧹 เคลียร์ไปแล้ว', value: `\`${stats.totalCleaned}\``, inline: true },
                    { name: '🗑️ เพลงซ้ำที่ลบ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${stats.totalSkipped}\``, inline: true },
                    { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '➕ เพิ่มสำเร็จ', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '🔄 Cleanup รอบ', value: `\`${stats.cleanupCount}\``, inline: true }
                )
                .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
                .setThumbnail(ASSETS.CHART)
                .setTimestamp()
            ]
        });
    }
    
    if (commandName === 'help') {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📖 คำสั่งทั้งหมด')
                .setColor(CONFIG.COLOR.PRIMARY)
                .setDescription('**Karaoke Bot v9.0 - Clean & Smart**')
                .addFields(
                    { name: '🌟 ทุกคนใช้ได้', value: '`/คลังเพลง` `/ค้นหา` `/สุ่มเพลง`', inline: false },
                    { name: '🔒 Security', value: '`/unlock` `/lock` `/status` `/panel` `/help`', inline: false },
                    { name: '⚙️ ตั้งค่า', value: '`/ตั้งค่าช่องแสดง` `/ตั้งค่าคลังเพลง` `/ตั้งค่าช่องแจ้งเตือน` `/ตั้งค่าช่องค้นหา`', inline: false },
                    { name: '🔍 ค้นหาเพลง', value: '`/หาเพลง` `/ศิลปิน` `/เพลงฮิต`', inline: false },
                    { name: '🚀 อัตโนมัติ', value: '`/เริ่มหาเพลง` `/หยุดหาเพลง`', inline: false },
                    { name: '📤 อัปโหลด', value: '`/อัปโหลด` `/อัปโหลดทั้งหมด`', inline: false },
                    { name: '🧹 เคลียร์', value: '`/เคลียร์คลัง`', inline: false },
                    { name: '📊 ข้อมูล', value: '`/สถิติ` `/สำรองข้อมูล` `/อัปเดตช่อง`', inline: false }
                )
                .setImage(ASSETS.MUSIC)
                .setFooter({ text: '✨ Auto-cleanup ทุก 10 นาที · Smart Save · Ephemeral Search' })
            ],
            ephemeral: true
        });
    }
    
    if (commandName === 'ตั้งค่าช่องแสดง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const ch1 = options.getChannel('ช่อง1');
        const ch2 = options.getChannel('ช่อง2');
        const ch3 = options.getChannel('ช่อง3');
        
        displayChannels = [ch1.id];
        if (ch2) displayChannels.push(ch2.id);
        if (ch3) displayChannels.push(ch3.id);
        
        postedMessages.display = {};
        lastDisplayHashes = {};
        await saveToCloud(true);
        
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📺 ตั้งค่าช่องแสดงสำเร็จ!').setDescription(displayChannels.map((id, i) => `${i+1}. <#${id}>`).join('\n')).setColor(CONFIG.COLOR.SUCCESS)]
        });
        await postToDisplayChannels();
    }
    
    if (commandName === 'ตั้งค่าคลังเพลง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        libraryChannelId = options.getChannel('ช่อง').id;
        postedMessages.library = [];
        lastLibraryHash = '';
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📚 ตั้งค่าคลังสำเร็จ!').setDescription(`<#${libraryChannelId}>`).setColor(CONFIG.COLOR.SUCCESS)] });
        await postToLibraryChannel();
    }
    
    if (commandName === 'ตั้งค่าช่องแจ้งเตือน') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        notificationChannelId = options.getChannel('ช่อง').id;
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔔 ตั้งค่าแจ้งเตือนสำเร็จ!').setDescription(`<#${notificationChannelId}>`).setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.BELL)] });
    }
    
    if (commandName === 'ตั้งค่าช่องค้นหา') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        searchChannelId = options.getChannel('ช่อง').id;
        postedMessages.search = null;
        await saveToCloud(true);
        await interaction.reply({ 
            embeds: [new EmbedBuilder().setTitle('🔍 ตั้งค่าช่องค้นหาสำเร็จ!')
                .setDescription(`<#${searchChannelId}>\n\n💡 พิมพ์ชื่อเพลงในช่องนี้ → ผลลัพธ์แสดงเฉพาะคุณ + ลบใน 15 วิ`)
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.SEARCH)
            ] 
        });
        await postToSearchChannel();
    }
    
    if (commandName === 'อัปเดตช่อง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        lastLibraryHash = '';
        lastDisplayHashes = {};
        await updateAllChannels();
        await postToSearchChannel();
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🔄 อัปเดตทุกช่องสำเร็จ!').setColor(CONFIG.COLOR.SUCCESS)] });
    }
    
    // ★ คำสั่งเคลียร์คลัง
    if (commandName === 'เคลียร์คลัง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        
        const result = await cleanupLibrary();
        
        if (result.error) {
            return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result.error}`).setColor(CONFIG.COLOR.ERROR)] });
        }
        
        let desc = `**🧹 ผลการเคลียร์คลัง:**\n\n`;
        desc += `> 📊 **ก่อนเคลียร์:** \`${result.before}\` เพลง\n`;
        desc += `> 📊 **หลังเคลียร์:** \`${result.after}\` เพลง\n`;
        desc += `> 🗑️ **ลบทั้งหมด:** \`${result.removed}\` เพลง\n`;
        desc += `> 🔄 **เพลงซ้ำ:** \`${result.duplicates}\`\n`;
        desc += `> ❌ **ข้อมูลไม่ครบ:** \`${result.invalid}\`\n`;
        
        if (result.titles.length > 0 && result.titles.length <= 10) {
            desc += `\n**รายการที่ลบ:**\n${result.titles.map(t => `> ${t}`).join('\n')}`;
        } else if (result.titles.length > 10) {
            desc += `\n**ตัวอย่างที่ลบ:**\n${result.titles.slice(0, 10).map(t => `> ${t}`).join('\n')}\n> ...และอีก ${result.titles.length - 10}`;
        }
        
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('🧹 เคลียร์คลังสำเร็จ!')
                .setDescription(desc)
                .setColor(result.removed > 0 ? CONFIG.COLOR.SUCCESS : CONFIG.COLOR.INFO)
                .setImage(ASSETS.BROOM)
                .setFooter({ text: `⏱️ ${new Date().toLocaleTimeString('th-TH')}` })
            ]
        });
        
        // อัปเดตช่องถ้ามีการเปลี่ยนแปลง
        if (result.removed > 0) {
            lastLibraryHash = '';
            lastDisplayHashes = {};
            await updateAllChannels();
        }
    }
    
    if (commandName === 'ทดสอบ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        const t = Date.now();
        try {
            const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, {
                params: { q: 'Saran', type: 'song', sources: 'joox' },
                timeout: 90000
            });
            const list = res.data?.data?.songs || [];
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('🧪 ทดสอบ API').setDescription(`✅ สถานะ: เชื่อมต่อได้\n⏱️ เวลา: ${((Date.now()-t)/1000).toFixed(1)}s\n🎵 พบเพลง: ${list.length}`).setColor(CONFIG.COLOR.SUCCESS)]
            });
        } catch (e) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${e.message}`).setColor(CONFIG.COLOR.ERROR)] });
        }
    }
    
    if (commandName === 'สำรองข้อมูล') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        await saveToCloud(true);
        await interaction.editReply({ embeds: [replyEmbed.setTitle('💾 สำรองสำเร็จ!').setDescription(`${Object.keys(songs).length} เพลง`).setColor(CONFIG.COLOR.SUCCESS)] });
    }
    
    // Access check
    const access = checkAccess(interaction);
    if (!access.allowed) {
        return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    }
    
    if (!checkCooldown(interaction.user.id, commandName)) {
        return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิด!')], ephemeral: true });
    }
    
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🔍 กำลังค้นหา...').setDescription(`**${query}**`).setColor(CONFIG.COLOR.WARNING).setImage(ASSETS.SEARCH)] });
        
        const results = await searchJoox(query);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง`).setColor(CONFIG.COLOR.ERROR)] });
        
        const shuffled = shuffleArray(results);
        const maxTry = Math.min(shuffled.length, 15);
        
        let result = null;
        let skipped = 0;
        
        for (let i = 0; i < maxTry; i++) {
            result = await processSong(shuffled[i], interaction, i, maxTry);
            if (result.status === 'success') break;
            if (result.status === 'skipped') skipped++;
        }
        
        if (result?.status === 'success') {
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .setImage(ASSETS.SUCCESS)
                    .addFields(
                        { name: '🎵 เพลง', value: truncate(result.song.title, 60), inline: true },
                        { name: '🎤 ศิลปิน', value: truncate(result.song.artist, 50), inline: true },
                        { name: '⏱️ ความยาว', value: fmtDuration(result.song.duration), inline: true },
                        { name: '🟢 Roblox', value: `\`${result.uploadResult.assetId}\``, inline: false }
                    )
                    .setColor(CONFIG.COLOR.SUCCESS)
                ]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ลอง ${maxTry} เพลง · ข้าม ${skipped} · ล้มเหลวทั้งหมด`).setColor(CONFIG.COLOR.ERROR)] });
        }
    }
    
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        const results = await searchJoox(artist);
        
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบ **${artist}**`).setColor(CONFIG.COLOR.ERROR)] });
        
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`⏳ โหลดเพลง ${artist}...`).setDescription(`พบ ${results.length} เพลง`).setColor(CONFIG.COLOR.WARNING)] });
        
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(2000);
        }
        
        const summary = added.length > 0 ? added.map(s => `> 🟢 **${truncate(s.title, 50)}**`).join('\n') : '> ไม่มีเพลงใหม่';
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`✅ ${artist}`)
                .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${summary}`)
                .addFields(
                    { name: '➕ สำเร็จ', value: `\`${added.length}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${skipped.length}\``, inline: true },
                    { name: '📊 รวม', value: `\`${Object.keys(songs).length}\``, inline: true }
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.SUCCESS)
            ]
        });
    }
    
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบ')] });
        
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⏳ ดึงเพลงฮิต...').setDescription(`พบ ${results.length} เพลง`).setColor(CONFIG.COLOR.WARNING)] });
        
        const shuffled = shuffleArray(results);
        const maxTry = Math.min(shuffled.length, 15);
        const added = [], skipped = [];
        
        for (let i = 0; i < maxTry; i++) {
            const r = await processSong(shuffled[i], interaction, i, maxTry);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(2000);
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('🔥 เพลงฮิต')
                .setDescription(added.map(s => `> **${truncate(s.title, 50)}**`).join('\n') || '> ไม่มีเพลงใหม่')
                .addFields(
                    { name: '➕ สำเร็จ', value: `\`${added.length}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${skipped.length}\``, inline: true }
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.FIRE)
            ]
        });
    }
    
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่แล้ว!')] });
        
        if (displayChannels.length === 0) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ตั้งค่าช่องแสดงก่อน!').setColor(CONFIG.COLOR.WARNING)] });
        }
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🚀 เริ่มระบบอัตโนมัติ!')
                .setDescription(
                    `⏱️ **รอบละ:** ${CONFIG.AUTO_SEARCH_INTERVAL/1000} วินาที\n` +
                    `🔍 **ค้นหา:** 3 คำต่อรอบ\n` +
                    `🔄 **ลองสูงสุด:** ${CONFIG.MAX_SONGS_TO_TRY} เพลง\n` +
                    `♻️ **Retry:** ${CONFIG.MAX_DOWNLOAD_RETRIES} ครั้ง\n` +
                    `🧹 **Auto-cleanup:** ทุก 10 นาที\n\n` +
                    `💾 เพลงจะถูกบันทึกอัตโนมัติ`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.ROCKET)
            ]
        });
        
        const channel = client.channels.cache.get(displayChannels[0]);
        if (channel) {
            await runAutoSearch(channel);
            autoTask = setInterval(async () => {
                const ch = client.channels.cache.get(displayChannels[0]);
                if (ch) await runAutoSearch(ch);
            }, CONFIG.AUTO_SEARCH_INTERVAL);
        }
    }
    
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await saveToCloud(true);
            await interaction.reply({ embeds: [replyEmbed.setTitle('⏹️ หยุดระบบอัตโนมัติ').setDescription(`💾 บันทึกแล้ว\n📊 รอบ: ${stats.autoSearchCount}\n➕ เพิ่ม: ${stats.totalSongsAdded}\n⏭️ ข้าม: ${stats.totalSkipped}`).setColor(CONFIG.COLOR.SUCCESS)] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงาน!')] });
        }
    }
    
    if (commandName === 'ข้อมูลเพลง') {
        const id = options.getString('id');
        const song = songs[id];
        if (!song) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')], ephemeral: true });
        
        const embed = new EmbedBuilder()
            .setTitle('ℹ️ ข้อมูลเพลง')
            .setColor(CONFIG.COLOR.PRIMARY)
            .addFields(
                { name: '🎵 ชื่อเพลง', value: song.title, inline: false },
                { name: '🎤 ศิลปิน', value: song.artist, inline: true },
                { name: '⏱️ ความยาว', value: fmtDuration(song.duration), inline: true },
                { name: '💿 อัลบั้ม', value: song.album || 'ไม่ระบุ', inline: true },
                { name: '🆔 ID', value: `\`${song.id}\``, inline: false },
                { name: '🟢 Roblox', value: song.robloxAssetId ? `\`${song.robloxAssetId}\`` : '🔴 รอ', inline: true },
                { name: '🔍 คำค้นหา', value: song.searchQuery || 'ไม่ระบุ', inline: true },
                { name: '📅 เพิ่มเมื่อ', value: song.addedAt ? new Date(song.addedAt).toLocaleString('th-TH') : 'ไม่ระบุ', inline: false }
            );
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        
        await interaction.reply({ embeds: [embed] });
    }
    
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            const title = songs[id].title;
            delete songs[id];
            stats.totalSongsRemoved++;
            await saveToCloud(true);
            lastLibraryHash = '';
            lastDisplayHashes = {};
            await interaction.reply({ embeds: [replyEmbed.setTitle('✅ ลบเพลง').setDescription(`ลบ **${truncate(title, 60)}**`).setColor(CONFIG.COLOR.SUCCESS)] });
            await updateAllChannels();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    if (commandName === 'อัปโหลด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_upload')
            .setPlaceholder('เลือกเพลง (สูงสุด 10)')
            .setMinValues(1)
            .setMaxValues(Math.min(pending.length, 10))
            .addOptions(pending.slice(0, 25).map(s => ({
                label: s.title.slice(0, 100),
                description: `🎤 ${(s.artist || 'Unknown').slice(0, 50)}`.slice(0, 100),
                value: s.id
            })));
        
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📤 เลือกเพลงอัปโหลด').setDescription(`มี **${pending.length}** เพลงรอ`).setColor(CONFIG.COLOR.PRIMARY).setImage(ASSETS.UPLOAD)],
            components: [new ActionRowBuilder().addComponents(select)]
        });
    }
    
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        
        await interaction.deferReply();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`อัปโหลด **${pending.length}** เพลง\n⏱️ ประมาณ **${Math.ceil(pending.length * 0.5)} นาที**`).setColor(CONFIG.COLOR.WARNING).setImage(ASSETS.WARNING)],
            components: [row]
        });
    }
    
    if (commandName === 'สถิติ') {
        const list = Object.values(songs);
        const byArtist = {};
        list.forEach(s => { byArtist[s.artist] = (byArtist[s.artist] || 0) + 1; });
        const top = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('📈 สถิติการใช้งาน')
                .setColor(CONFIG.COLOR.PRIMARY)
                .setImage(ASSETS.CHART)
                .addFields(
                    { name: '🔍 ค้นหา', value: `\`${stats.totalSearches}\``, inline: true },
                    { name: '👥 ผู้ใช้ค้นหา', value: `\`${stats.totalSearchesByUser}\``, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `\`${stats.totalDownloads}\``, inline: true },
                    { name: '📤 อัปโหลด', value: `\`${stats.totalUploads}\``, inline: true },
                    { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${stats.totalSkipped}\``, inline: true },
                    { name: '🧹 เคลียร์', value: `\`${stats.totalCleaned}\``, inline: true },
                    { name: '🗑️ ซ้ำที่ลบ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true },
                    { name: '➕ เพิ่มสำเร็จ', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '📊 ในคลัง', value: `\`${list.length}\``, inline: true },
                    { name: '🎤 Top 5', value: top.map(([a, c]) => `> ${truncate(a, 25)}: **${c}**`).join('\n') || '> ไม่มี', inline: false }
                )
                .setTimestamp()
            ]
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 25] - COMPONENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleComponents(interaction) {
    if (interaction.customId.startsWith('lib_')) {
        const match = interaction.message.embeds[0].footer?.text?.match(/หน้า (\d+)\/(\d+)/);
        if (!match) return;
        
        let currentPage = parseInt(match[1]) - 1;
        const totalPages = parseInt(match[2]);
        
        if (interaction.customId === 'lib_first') currentPage = 0;
        if (interaction.customId === 'lib_prev') currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId === 'lib_next') currentPage = Math.min(totalPages - 1, currentPage + 1);
        if (interaction.customId === 'lib_last') currentPage = totalPages - 1;
        
        const { embed, pages, currentPage: newPage } = buildLibraryEmbed(currentPage);
        return interaction.update({ embeds: [embed], components: [buildLibraryButtons(newPage, pages)] });
    }
    
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    if (isLocked) return interaction.reply({ content: '🔒 ล็อกอยู่!', ephemeral: true });
    
    if (interaction.customId === 'admin_stats') {
        const list = Object.values(songs);
        const uploaded = list.filter(s => s.robloxAssetId).length;
        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📊 สถิติ').setColor(CONFIG.COLOR.PRIMARY).setImage(ASSETS.CHART)
                .addFields(
                    { name: '📂 เพลง', value: `\`${list.length}\``, inline: true },
                    { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
                    { name: '🔴 รอ', value: `\`${list.length - uploaded}\``, inline: true },
                    { name: '➕ เพิ่ม', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${stats.totalSkipped}\``, inline: true },
                    { name: '❌ ล้ม', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '🧹 เคลียร์', value: `\`${stats.totalCleaned}\``, inline: true },
                    { name: '🗑️ ซ้ำ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true }
                )
            ], ephemeral: true
        });
    }
    
    if (interaction.customId === 'admin_backup') {
        await interaction.deferReply({ ephemeral: true });
        await saveToCloud(true);
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💾 สำรองแล้ว').setColor(CONFIG.COLOR.SUCCESS)] });
        return;
    }
    
    if (interaction.customId === 'admin_refresh') {
        await interaction.deferReply({ ephemeral: true });
        lastLibraryHash = '';
        lastDisplayHashes = {};
        await updateAllChannels();
        await postToSearchChannel();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔄 รีเฟรชแล้ว').setColor(CONFIG.COLOR.SUCCESS)] });
        return;
    }
    
    if (interaction.customId === 'admin_browse') {
        const { embed, pages, currentPage } = buildLibraryEmbed(0);
        if (pages === 0) return interaction.reply({ embeds: [embed], ephemeral: true });
        await interaction.reply({ embeds: [embed], components: [buildLibraryButtons(currentPage, pages)], ephemeral: true });
        return;
    }
    
    if (interaction.customId === 'admin_lock') {
        isLocked = !isLocked;
        await saveToCloud(true);
        const { embed, components } = buildAdminPanel();
        await interaction.update({ embeds: [embed], components });
        return;
    }
    
    if (interaction.customId === 'admin_setup_channels') {
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📺 วิธีตั้งค่าช่อง').setDescription(
                '`/ตั้งค่าช่องแสดง ช่อง1:#ch1 ช่อง2:#ch2 ช่อง3:#ch3`\n' +
                '`/ตั้งค่าคลังเพลง ช่อง:#library`\n' +
                '`/ตั้งค่าช่องแจ้งเตือน ช่อง:#notify`\n' +
                '`/ตั้งค่าช่องค้นหา ช่อง:#search`'
            ).setColor(CONFIG.COLOR.INFO)], ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'admin_clear') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_clear_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_clear_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`ลบ **${Object.keys(songs).length}** เพลง`).setColor(CONFIG.COLOR.ERROR)],
            components: [row], ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'confirm_clear_all') {
        const count = Object.keys(songs).length;
        songs = {};
        stats.totalSongsRemoved += count;
        await saveToCloud(true);
        lastLibraryHash = '';
        lastDisplayHashes = {};
        await updateAllChannels();
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('✅ ลบแล้ว').setDescription(`ลบ ${count} เพลง`).setColor(CONFIG.COLOR.SUCCESS)], components: [] });
        return;
    }
    
    if (interaction.customId === 'cancel_clear_all') {
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR.ERROR)], components: [] });
        return;
    }
    
    if (interaction.customId === 'admin_upload_all') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')], ephemeral: true });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`อัปโหลด **${pending.length}** เพลง`).setColor(CONFIG.COLOR.WARNING)],
            components: [row], ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'confirm_upload_all') {
        await interaction.deferUpdate();
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        let ok = 0, fail = 0;
        
        for (let i = 0; i < pending.length; i++) {
            const song = pending[i];
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 อัปโหลด ${i+1}/${pending.length}`)
                    .setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i, pending.length)}`)
                    .setColor(CONFIG.COLOR.INFO).setImage(ASSETS.UPLOAD).setThumbnail(song.thumbnail)
                ], components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist);
            if (!audioPath) { fail++; continue; }
            
            const up = await uploadToRoblox(audioPath, song.title, song.artist);
            try { fs.unlinkSync(audioPath); } catch (e) {}
            
            if (up.success) {
                songs[song.id].robloxAssetId = up.assetId;
                songs[song.id].robloxError = null;
                ok++;
            } else {
                songs[song.id].robloxError = up.error;
                fail++;
            }
            await saveToCloud();
            await sleep(2000);
        }
        
        lastLibraryHash = '';
        lastDisplayHashes = {};
        await updateAllChannels();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ เสร็จสิ้น!').setImage(ASSETS.SUCCESS)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `\`${ok}\``, inline: true },
                    { name: '🔴 ล้มเหลว', value: `\`${fail}\``, inline: true }
                ).setColor(CONFIG.COLOR.SUCCESS)
            ], components: []
        });
        return;
    }
    
    if (interaction.customId === 'cancel_upload_all') {
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR.ERROR)], components: [] });
        return;
    }
    
    if (interaction.customId === 'select_upload') {
        await interaction.deferUpdate();
        const ids = interaction.values;
        let ok = 0, fail = 0;
        
        for (let i = 0; i < ids.length; i++) {
            const song = songs[ids[i]];
            if (!song) continue;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 อัปโหลด ${i+1}/${ids.length}`)
                    .setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i, ids.length)}`)
                    .setColor(CONFIG.COLOR.INFO).setImage(ASSETS.UPLOAD).setThumbnail(song.thumbnail)
                ], components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist);
            if (!audioPath) { fail++; continue; }
            
            const up = await uploadToRoblox(audioPath, song.title, song.artist);
            try { fs.unlinkSync(audioPath); } catch (e) {}
            
            if (up.success) {
                songs[ids[i]].robloxAssetId = up.assetId;
                songs[ids[i]].robloxError = null;
                ok++;
            } else {
                songs[ids[i]].robloxError = up.error;
                fail++;
            }
            await saveToCloud();
            await sleep(2000);
        }
        
        lastLibraryHash = '';
        lastDisplayHashes = {};
        await updateAllChannels();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ เสร็จสิ้น!').setImage(ASSETS.SUCCESS)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `\`${ok}\``, inline: true },
                    { name: '🔴 ล้มเหลว', value: `\`${fail}\``, inline: true }
                ).setColor(CONFIG.COLOR.SUCCESS)
            ], components: []
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 26] - ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

function buildAdminPanel() {
    const songList = Object.values(songs);
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    const embed = new EmbedBuilder()
        .setTitle('🎛️ แผงควบคุมผู้ดูแล')
        .setDescription('**จัดการบอท Karaoke v9.0**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            { name: '🔒 สถานะ', value: isLocked ? '`🔒 ล็อก`' : '`🔓 ปลดล็อก`', inline: true },
            { name: '⏱️ ออนไลน์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
            { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? '`✅ Cloud`' : '`⚠️ Local`', inline: true },
            { name: '📂 เพลง', value: `\`${songList.length}\``, inline: true },
            { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
            { name: '🔴 รอ', value: `\`${pending}\``, inline: true },
            { name: '➕ เพิ่มสำเร็จ', value: `\`${stats.totalSongsAdded}\``, inline: true },
            { name: '⏭️ ข้าม', value: `\`${stats.totalSkipped}\``, inline: true },
            { name: '🧹 เคลียร์', value: `\`${stats.totalCleaned}\``, inline: true },
            { name: '🗑️ ซ้ำ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true },
            { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
            { name: '🔄 Cleanup รอบ', value: `\`${stats.cleanupCount}\``, inline: true }
        )
        .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
        .setFooter({ text: '🎛️ Admin Panel v9.0' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_stats').setLabel('สถิติ').setStyle(ButtonStyle.Primary).setEmoji('📊'),
        new ButtonBuilder().setCustomId('admin_backup').setLabel('สำรอง').setStyle(ButtonStyle.Success).setEmoji('💾'),
        new ButtonBuilder().setCustomId('admin_refresh').setLabel('รีเฟรช').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('admin_browse').setLabel('ดูคลัง').setStyle(ButtonStyle.Secondary).setEmoji('📚')
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_lock').setLabel(isLocked ? 'ปลดล็อก' : 'ล็อก').setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji(isLocked ? '🔓' : '🔒'),
        new ButtonBuilder().setCustomId('admin_upload_all').setLabel('อัปโหลดทั้งหมด').setStyle(ButtonStyle.Primary).setEmoji('📤'),
        new ButtonBuilder().setCustomId('admin_setup_channels').setLabel('วิธีตั้งค่า').setStyle(ButtonStyle.Secondary).setEmoji('📺'),
        new ButtonBuilder().setCustomId('admin_clear').setLabel('ล้างทั้งหมด').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    
    return { embed, components: [row1, row2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 27] - LOGIN
// ═══════════════════════════════════════════════════════════════════════════

client.login(CONFIG.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════════════════════
// END - v9.0 Clean & Smart Edition
// ═══════════════════════════════════════════════════════════════════════════
