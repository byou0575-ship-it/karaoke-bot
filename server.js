// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   KARAOKE BOT v12.0 - FULL DISPLAY EDITION                               ║
// ║   ✨ Show All Songs · Auto Delete Old · Simple Search · 3-Layer Fallback║
// ╚══════════════════════════════════════════════════════════════════════════╝

const {
    Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder,
    PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 01] - CONFIG
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
    HTTP_TIMEOUT: 180000,
    UPLOAD_TIMEOUT: 180000,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    SONGS_PER_MSG: 15, // ★ แสดง 15 เพลงต่อ 1 ข้อความ
    RATE_LIMIT_MS: 3000,
    UNLOCK_RATE_MS: 10000,
    AUTO_SEARCH_INTERVAL: 90000,
    AUTO_UPDATE_INTERVAL: 20000,
    AUTO_CLEANUP_INTERVAL: 600000,
    SEARCH_DELETE_TIMEOUT: 15000,
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
        PRIMARY: 0x5865F2, SUCCESS: 0x57F287, WARNING: 0xFEE75C,
        ERROR: 0xED4245, INFO: 0x3498DB, BLACK: 0x000000,
        GOLD: 0xF1C40F, PINK: 0xEB459E, PURPLE: 0x9B59B6
    }
};

const ASSETS = {
    SUCCESS: 'https://media.tenor.com/8B6m6cZvB5sAAAAC/success.gif',
    MUSIC: 'https://media.tenor.com/XfN7hy_IYWYAAAAC/music.gif',
    SEARCH: 'https://media.tenor.com/Qg5RJ6wGdpEAAAAC/search.gif',
    LIBRARY: 'https://media.tenor.com/qP3S7gXsV3sAAAAC/library.gif',
    FIRE: 'https://media.tenor.com/2roX3uxz_68AAAAC/fire.gif',
    CHART: 'https://media.tenor.com/YvR6qC4jW1sAAAAC/chart.gif',
    NEW: 'https://media.tenor.com/yJ5fSP7_hQMAAAAC/new.gif',
    BELL: 'https://media.tenor.com/8yWL3gYgBsAAAAAC/bell.gif',
    WARNING: 'https://media.tenor.com/Og5bYvHEB2wAAAAC/warning.gif',
    ROCKET: 'https://media.tenor.com/xGvJCRXtL5IAAAAC/rocket.gif',
    BROOM: 'https://media.tenor.com/6zV3LTFQ8VUAAAAC/broom.gif',
    UPLOAD: 'https://media.tenor.com/qKz5v9rUYWYAAAAC/upload.gif'
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 02] - GLOBAL STATE
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

// ★ เก็บ message IDs ที่ bot ส่งไว้ในแต่ละช่อง เพื่อลบทีหลัง
let postedMessages = {
    display: {}, // { channelId: [messageIds] }
    library: [], // [messageIds]
    search: null // messageId
};

let lastLibraryHash = '';
let lastDisplayHashes = {};
let searchQueryIndex = 0;
let lastSaveHash = '';

let stats = {
    totalSearches: 0, totalDownloads: 0, totalUploads: 0, totalFailures: 0,
    totalSongsAdded: 0, totalSongsRemoved: 0, totalSearchesByUser: 0,
    totalUpdates: 0, totalSkipped: 0, totalCleaned: 0, totalDuplicatesRemoved: 0,
    layer1Success: 0, layer2Success: 0, layer3Success: 0,
    startTime: Date.now(), autoSearchCount: 0, cleanupCount: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 03] - EXPRESS
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'offline',
        locked: isLocked,
        songs: Object.keys(songs).length,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    });
});
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 04] - DISCORD CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 05] - STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_BACKUP = '/tmp/backup.json';

async function loadFromCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) { loadFromLocal(); return; }
    try {
        const res = await axios.get(`${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}/latest`,
            { headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }, timeout: 30000 });
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

async function saveToCloud(force = false) {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) { saveToLocal(); return; }
    
    const currentHash = simpleHash(JSON.stringify({
        songsCount: Object.keys(songs).length,
        songIds: Object.keys(songs).sort(),
        channels: displayChannels, library: libraryChannelId,
        notification: notificationChannelId, search: searchChannelId, locked: isLocked
    }));
    
    if (!force && currentHash === lastSaveHash) return;
    
    try {
        await axios.put(`${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}`,
            { songs, displayChannels, libraryChannelId, notificationChannelId, searchChannelId, isLocked, lastUpdate: new Date().toISOString() },
            { headers: { 'Content-Type': 'application/json', 'X-Master-Key': CONFIG.JSONBIN_KEY }, timeout: 30000 });
        
        lastSaveHash = currentHash;
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
        if (Object.keys(songs).length > 0 || displayChannels.length > 0) await saveToCloud();
    }, 60000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 06] - SECURITY
// ═══════════════════════════════════════════════════════════════════════════

function verifyKey(input) { return input === CONFIG.UNLOCK_KEY; }

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
    if (!isAdmin(interaction)) return { allowed: false, reason: '❌ คำสั่งนี้ใช้ได้เฉพาะ Admin!' };
    if (isLocked && !['unlock', 'status', 'help'].includes(interaction.commandName)) {
        return { allowed: false, reason: '🔒 บอทถูกล็อกอยู่! ใช้ `/unlock` ก่อน' };
    }
    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 07] - CONTENT FILTER
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
// [SECTION 08] - UTILITIES
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
        s.title.toLowerCase().includes(lower) || s.artist.toLowerCase().includes(lower));
}
function simpleHash(str) { return crypto.createHash('md5').update(str).digest('hex'); }
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function getNextSearchQuery() {
    const q = CONFIG.SEARCH_QUERIES[searchQueryIndex];
    searchQueryIndex = (searchQueryIndex + 1) % CONFIG.SEARCH_QUERIES.length;
    return q;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 09] - JOOX API
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
        if (i < count - 1) await sleep(3000);
    }
    return shuffleArray(allSongs);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 10] - DOWNLOAD (3-Layer Fallback)
// ═══════════════════════════════════════════════════════════════════════════

async function writeStreamToFile(stream, layer) {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    const writer = fs.createWriteStream(tempPath);
    stream.pipe(writer);
    
    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        stream.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), CONFIG.HTTP_TIMEOUT);
    });
    
    const size = fs.statSync(tempPath).size;
    if (size < 1024) {
        console.log(`   ⚠️ [${layer}] ไฟล์เล็กเกินไป (${size} bytes)`);
        try { fs.unlinkSync(tempPath); } catch (e) {}
        throw new Error(`ไฟล์เล็กเกินไป`);
    }
    console.log(`   ✅ [${layer}] สำเร็จ: ${(size / 1024).toFixed(1)} KB`);
    return tempPath;
}

async function downloadUrlToFile(url, layer, headers = {}) {
    const res = await axios.get(url, {
        responseType: 'stream',
        timeout: CONFIG.HTTP_TIMEOUT,
        maxContentLength: Infinity, maxBodyLength: Infinity,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'audio/*,*/*',
            ...headers
        }
    });
    
    const ct = (res.headers['content-type'] || '').toLowerCase();
    console.log(`   📥 [${layer}] Content-Type: ${ct}`);
    
    if (!ct.includes('audio') && !ct.includes('octet-stream') && !ct.includes('mpeg')) {
        throw new Error(`Content-Type ไม่ใช่ audio: ${ct}`);
    }
    return await writeStreamToFile(res.data, layer);
}

// ชั้น 1: Direct URL
async function layer1_directUrl(songId, source = 'joox') {
    try {
        console.log(`\n   🎯 [ชั้น 1] Direct URL (${source})...`);
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/url`, {
            params: { id: songId, source }, timeout: 45000
        });
        const directUrl = res.data?.url || res.data?.data?.url || res.data?.link;
        if (!directUrl) { console.log(`   ❌ [ชั้น 1] ไม่มี URL`); return null; }
        console.log(`   🔗 [ชั้น 1] URL: ${directUrl.slice(0, 80)}...`);
        return await downloadUrlToFile(directUrl, 'L1', { 'Referer': 'https://www.joox.com/' });
    } catch (e) {
        console.log(`   ❌ [ชั้น 1] ล้มเหลว: ${e.message.slice(0, 80)}`);
        return null;
    }
}

// ชั้น 2: Stream Proxy
async function layer2_streamProxy(songId, source = 'joox') {
    try {
        console.log(`\n   🎯 [ชั้น 2] Stream Proxy (${source})...`);
        const streamUrl = `${CONFIG.MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(songId)}&source=${source}`;
        const res = await axios.get(streamUrl, {
            responseType: 'stream', timeout: CONFIG.HTTP_TIMEOUT,
            maxContentLength: Infinity, maxBodyLength: Infinity
        });
        const ct = (res.headers['content-type'] || '').toLowerCase();
        console.log(`   📥 [ชั้น 2] Content-Type: ${ct}`);
        if (!ct.includes('audio') && !ct.includes('octet-stream') && !ct.includes('mpeg')) {
            console.log(`   ❌ [ชั้น 2] Content-Type ไม่ใช่ audio`);
            return null;
        }
        return await writeStreamToFile(res.data, 'L2');
    } catch (e) {
        console.log(`   ❌ [ชั้น 2] ล้มเหลว: ${e.message.slice(0, 80)}`);
        return null;
    }
}

// ชั้น 3: Switch Source
async function layer3_switchSource(songId, songName, artist, source = 'joox') {
    try {
        console.log(`\n   🎯 [ชั้น 3] Switch Source...`);
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/switch`, {
            params: { id: songId, source, name: songName, artist }, timeout: 60000
        });
        
        if (res.data?.url || res.data?.data?.url) {
            const newUrl = res.data.url || res.data.data.url;
            return await downloadUrlToFile(newUrl, 'L3-url');
        }
        
        if (res.data?.id) {
            const newId = res.data.id;
            const newSource = res.data.source || 'joox';
            const streamUrl = `${CONFIG.MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(newId)}&source=${newSource}`;
            const res2 = await axios.get(streamUrl, {
                responseType: 'stream', timeout: CONFIG.HTTP_TIMEOUT,
                maxContentLength: Infinity, maxBodyLength: Infinity
            });
            const ct = (res2.headers['content-type'] || '').toLowerCase();
            if (ct.includes('audio') || ct.includes('octet-stream') || ct.includes('mpeg')) {
                return await writeStreamToFile(res2.data, 'L3-stream');
            }
        }
        return null;
    } catch (e) {
        console.log(`   ❌ [ชั้น 3] ล้มเหลว: ${e.message.slice(0, 80)}`);
        return null;
    }
}

// MAIN: downloadAudio
async function downloadAudio(songId, songName, artist, source = 'joox') {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`⬇️ ดาวน์โหลด: ${songName} - ${artist}`);
    console.log(`${'━'.repeat(60)}`);
    
    const startTime = Date.now();
    let result = null;
    
    result = await layer1_directUrl(songId, source);
    if (result) { stats.layer1Success++; stats.totalDownloads++; console.log(`✅ สำเร็จด้วยชั้น 1 (${((Date.now()-startTime)/1000).toFixed(1)}s)`); return result; }
    await sleep(1500);
    
    result = await layer2_streamProxy(songId, source);
    if (result) { stats.layer2Success++; stats.totalDownloads++; console.log(`✅ สำเร็จด้วยชั้น 2`); return result; }
    await sleep(2000);
    
    result = await layer3_switchSource(songId, songName, artist, source);
    if (result) { stats.layer3Success++; stats.totalDownloads++; console.log(`✅ สำเร็จด้วยชั้น 3`); return result; }
    
    stats.totalFailures++;
    console.log(`❌ ทั้ง 3 ชั้นล้มเหลว`);
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 11] - ROBLOX UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

async function uploadToRoblox(filePath, title, artist) {
    if (!CONFIG.ROBLOX_API_KEY || !CONFIG.ROBLOX_USER_ID) return { success: false, error: 'ไม่ได้ตั้งค่า ROBLOX' };
    try {
        const buf = fs.readFileSync(filePath);
        if (buf.length > CONFIG.MAX_FILE_SIZE) return { success: false, error: 'ไฟล์ใหญ่เกิน 20MB' };
        
        const form = new FormData();
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: { creator: { userId: parseInt(CONFIG.ROBLOX_USER_ID) } }
        }), { contentType: 'application/json' });
        form.append('fileContent', buf, { filename: path.basename(filePath), contentType: 'audio/mpeg' });
        
        const res = await axios.post(CONFIG.ROBLOX_API_URL, form, {
            headers: { 'x-api-key': CONFIG.ROBLOX_API_KEY, ...form.getHeaders() },
            maxBodyLength: Infinity, maxContentLength: Infinity, timeout: CONFIG.UPLOAD_TIMEOUT
        });
        
        if (res.data?.assetId) { stats.totalUploads++; return { success: true, assetId: String(res.data.assetId) }; }
        return { success: false, error: JSON.stringify(res.data).slice(0, 200) };
    } catch (e) {
        return { success: false, error: e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 12] - CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupLibrary() {
    try {
        stats.cleanupCount++;
        const songList = Object.values(songs);
        const beforeCount = songList.length;
        let removedDuplicates = 0, removedInvalid = 0;
        
        const seenKey = new Map();
        for (const song of songList) {
            const key = `${song.title.toLowerCase().trim()}|${song.artist.toLowerCase().trim()}`;
            if (seenKey.has(key)) {
                const existing = seenKey.get(key);
                const currentTime = new Date(song.addedAt || 0).getTime();
                const existingTime = new Date(existing.addedAt || 0).getTime();
                if (currentTime > existingTime) { delete songs[existing.id]; seenKey.set(key, song); }
                else delete songs[song.id];
                removedDuplicates++;
            } else seenKey.set(key, song);
        }
        
        for (const song of Object.values(songs)) {
            let invalid = false;
            if (!song.id || song.id.length < 5) invalid = true;
            if (!song.title || song.title.trim() === '' || song.title === 'Unknown') invalid = true;
            if (!song.artist || song.artist.trim() === '' || song.artist === 'Unknown') invalid = true;
            if (invalid) { delete songs[song.id]; removedInvalid++; }
        }
        
        const afterCount = Object.keys(songs).length;
        const removedTotal = beforeCount - afterCount;
        stats.totalCleaned += removedInvalid;
        stats.totalDuplicatesRemoved += removedDuplicates;
        if (removedTotal > 0) await saveToCloud(true);
        
        return { removed: removedTotal, duplicates: removedDuplicates, invalid: removedInvalid, before: beforeCount, after: afterCount };
    } catch (e) { return { removed: 0, error: e.message }; }
}

function startAutoCleanup() {
    if (cleanupTask) clearInterval(cleanupTask);
    cleanupTask = setInterval(async () => {
        if (isLocked) return;
        try { await cleanupLibrary(); } catch (e) {}
    }, CONFIG.AUTO_CLEANUP_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 13] - PROCESS SONG
// ═══════════════════════════════════════════════════════════════════════════

async function processSong(song, interaction = null, index = 0, total = 1) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    
    if (songs[songId]) { stats.totalSkipped++; return { status: 'skipped', reason: 'ID ซ้ำ' }; }
    const dupeCheck = Object.values(songs).find(s =>
        s.title.toLowerCase().trim() === title.toLowerCase().trim() &&
        s.artist.toLowerCase().trim() === artist.toLowerCase().trim());
    if (dupeCheck) { stats.totalSkipped++; return { status: 'skipped', reason: 'ชื่อ+ศิลปิน ซ้ำ' }; }
    if (!title || title === 'Unknown' || !artist || artist === 'Unknown') { stats.totalSkipped++; return { status: 'skipped', reason: 'ข้อมูลไม่ครบ' }; }
    if (isBanned(title, artist)) { stats.totalSkipped++; return { status: 'banned', reason: 'ถูกคัดกรอง' }; }
    
    try {
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬇️ ดาวน์โหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${truncate(title, 60)}**\n🎤 ${truncate(artist, 50)}\n\n${progressBar(index, total)}`)
                    .setColor(CONFIG.COLOR.WARNING)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        if (!audioPath) return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬆️ อัปโหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${truncate(title, 60)}**\n🎤 ${truncate(artist, 50)}\n\n${progressBar(index + 0.5, total)}`)
                    .setColor(CONFIG.COLOR.INFO)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        if (uploadResult.success) {
            songs[songId] = {
                id: songId, title, artist,
                thumbnail: song.cover || null,
                album: song.album || null,
                duration: song.duration || 0,
                robloxAssetId: uploadResult.assetId,
                robloxError: null, source: 'joox',
                searchQuery: song.searchQuery || null,
                addedAt: new Date().toISOString()
            };
            stats.totalSongsAdded++;
        }
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        
        if (uploadResult.success) {
            await notifyNewSong(songs[songId]);
            await updateAllChannels();
            await saveToCloud();
        }
        
        return { status: uploadResult.success ? 'success' : 'failed', song: songs[songId], uploadResult };
    } catch (e) { return { status: 'failed', reason: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 14] - NOTIFY
// ═══════════════════════════════════════════════════════════════════════════

async function notifyNewSong(song) {
    if (!notificationChannelId) return;
    try {
        const channel = client.channels.cache.get(notificationChannelId);
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setTitle('🎉 เพลงใหม่มาแล้ว!')
            .setDescription(
                `🎵 **${truncate(song.title, 80)}**\n` +
                `🎤 ${truncate(song.artist, 60)}\n` +
                `⏱️ ${fmtDuration(song.duration)}\n\n` +
                `🟢 **Roblox:** \`${song.robloxAssetId}\`\n` +
                `📊 **รวม:** ${Object.keys(songs).length} เพลง`
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setImage(ASSETS.NEW)
            .setFooter({ text: `🔔 ${new Date().toLocaleTimeString('th-TH')}` })
            .setTimestamp();
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        await channel.send({ content: '@everyone 🎵 เพลงใหม่!', embeds: [embed] });
    } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 15] - ★★★ DISPLAY ALL SONGS (ไม่จำกัด) ★★★
// ═══════════════════════════════════════════════════════════════════════════

// ★ ลบข้อความเก่าทั้งหมดในช่อง
async function deleteAllBotMessages(channel) {
    try {
        // ลบทีละ 100 (Discord จำกัด 100 ต่อครั้ง)
        let totalDeleted = 0;
        let fetchMore = true;
        
        while (fetchMore) {
            const messages = await channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            
            if (botMessages.size === 0) {
                fetchMore = false;
                break;
            }
            
            for (const msg of botMessages.values()) {
                try { await msg.delete(); totalDeleted++; } catch (e) {}
                // หน่วงเวลาเล็กน้อย กัน rate limit
                if (totalDeleted % 5 === 0) await sleep(500);
            }
            
            if (botMessages.size < 100) fetchMore = false;
        }
        
        console.log(`  🗑️ ลบข้อความเก่า ${totalDeleted} ข้อความใน #${channel.name}`);
    } catch (e) {
        console.error(`  ❌ Delete error: ${e.message}`);
    }
}

// ★ สร้าง Embeds ทั้งหมด (แบ่งหน้า)
function buildAllSongsEmbeds(channelName, songsPerMsg = CONFIG.SONGS_PER_MSG) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return [new EmbedBuilder()
            .setTitle('🎤 ' + channelName)
            .setDescription('```\n📭 ยังไม่มีเพลงในคลัง\n```\n💡 ใช้ `/หาเพลง` หรือ `/เริ่มหาเพลง`')
            .setColor(CONFIG.COLOR.BLACK)
            .setImage(ASSETS.MUSIC)
            .setFooter({ text: `📊 0 เพลง · ${new Date().toLocaleTimeString('th-TH')}` })
        ];
    }
    
    // เรียงเพลงตามตัวอักษร
    const sortedSongs = [...songList].sort((a, b) => a.title.localeCompare(b.title));
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    // แบ่งเป็นหน้าๆ ละ 15 เพลง
    const totalPages = Math.ceil(sortedSongs.length / songsPerMsg);
    const embeds = [];
    
    for (let page = 0; page < totalPages; page++) {
        const start = page * songsPerMsg;
        const chunk = sortedSongs.slice(start, start + songsPerMsg);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎤 ${channelName}${totalPages > 1 ? ` (${page + 1}/${totalPages})` : ''}`)
            .setColor(CONFIG.COLOR.BLACK);
        
        // ★ หน้าแรกใส่สถิติ
        if (page === 0) {
            embed.addFields({
                name: '📊 สถิติรวม',
                value: `> 🎵 **ทั้งหมด:** \`${songList.length}\` เพลง\n> 🟢 **นำเข้า Roblox:** \`${uploaded}\`\n> 🔴 **รอนำเข้า:** \`${pending}\``,
                inline: false
            });
        }
        
        let desc = '';
        chunk.forEach((s, i) => {
            const num = start + i + 1;
            const r = s.robloxAssetId ? '🟢' : '🔴';
            const dur = fmtDuration(s.duration);
            desc += `**${num}.** ${r} **${truncate(s.title, 55)}**\n`;
            desc += `　🎤 ${truncate(s.artist, 45)}\n`;
            desc += `　⏱️ ${dur} · 🆔 \`${s.id.slice(0, 10)}\`\n\n`;
        });
        
        embed.setDescription(desc || 'ไม่มีเพลง');
        embed.setFooter({ 
            text: `📊 ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${pending} · หน้า ${page + 1}/${totalPages} · ${new Date().toLocaleTimeString('th-TH')}` 
        });
        embed.setTimestamp();
        
        // ★ ใส่รูปเฉพาะหน้าแรก
        if (page === 0 && sortedSongs[0]?.thumbnail) {
            embed.setThumbnail(sortedSongs[0].thumbnail);
        }
        
        embeds.push(embed);
    }
    
    return embeds;
}

// ★ Post ข้อความแสดงเพลงทั้งหมด (แบ่งเป็นหลายข้อความ)
async function postAllSongsToChannel(channel, channelName) {
    try {
        // ลบของเก่าทั้งหมดก่อน
        await deleteAllBotMessages(channel);
        await sleep(500);
        
        // สร้าง Embeds ทั้งหมด
        const embeds = buildAllSongsEmbeds(channelName);
        
        // ส่งทีละข้อความ (Discord จำกัด 10 embeds ต่อข้อความ)
        const sentIds = [];
        for (let i = 0; i < embeds.length; i += 10) {
            const batch = embeds.slice(i, i + 10);
            try {
                const msg = await channel.send({ embeds: batch });
                sentIds.push(msg.id);
                // หน่วง 1 วิ ระหว่างข้อความ กัน rate limit
                if (i + 10 < embeds.length) await sleep(1000);
            } catch (e) {
                console.error(`Send error: ${e.message}`);
                await sleep(2000);
            }
        }
        
        return sentIds;
    } catch (e) {
        console.error(`postAllSongs error: ${e.message}`);
        return [];
    }
}

// ★ อัปเดตช่องแสดงทั้งหมด
async function postToDisplayChannels() {
    if (displayChannels.length === 0) return;
    
    for (let i = 0; i < displayChannels.length; i++) {
        const chId = displayChannels[i];
        try {
            const channel = client.channels.cache.get(chId);
            if (!channel) continue;
            
            console.log(`\n📺 อัปเดตช่องแสดง ${i+1}: #${channel.name}`);
            await postAllSongsToChannel(channel, `รายการเพลง Karaoke (ช่อง ${i+1})`);
        } catch (e) {
            console.error(`Display error: ${e.message}`);
        }
    }
    stats.totalUpdates++;
}

// ★ อัปเดตช่องคลัง
async function postToLibraryChannel() {
    if (!libraryChannelId) return;
    try {
        const channel = client.channels.cache.get(libraryChannelId);
        if (!channel) return;
        
        console.log(`\n📚 อัปเดตช่องคลัง: #${channel.name}`);
        await postAllSongsToChannel(channel, 'คลังเพลงทั้งหมด');
    } catch (e) {
        console.error(`Library error: ${e.message}`);
    }
}

// ★ อัปเดตทุกช่อง
async function updateAllChannels() {
    await postToDisplayChannels();
    await postToLibraryChannel();
}

function startAutoUpdate() {
    if (autoUpdateTask) clearInterval(autoUpdateTask);
    autoUpdateTask = setInterval(async () => {
        if (isLocked) return;
        try { await updateAllChannels(); } catch (e) {}
    }, CONFIG.AUTO_UPDATE_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 16] - SEARCH CHANNEL (พิมพ์ตรงๆ)
// ═══════════════════════════════════════════════════════════════════════════

// ★ สร้าง Embed ช่องค้นหา (ข้อความต้อนรับ)
async function postToSearchChannel() {
    if (!searchChannelId) return;
    try {
        const channel = client.channels.cache.get(searchChannelId);
        if (!channel) return;
        
        // ลบข้อความเก่าทั้งหมด
        await deleteAllBotMessages(channel);
        await sleep(500);
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 ค้นหาเพลง')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '**📝 วิธีค้นหาเพลง:**\n\n' +
                '> **พิมพ์ชื่อเพลงหรือศิลปินในช่องนี้ได้เลย!**\n' +
                '> ไม่ต้องใช้คำสั่ง `/` นำหน้า\n\n' +
                '**✨ ตัวอย่าง:**\n' +
                '> `Saran` - ค้นหาเพลงของ Saran\n' +
                '> `แค่เพื่อน` - ค้นหาเพลงที่มีคำนี้\n' +
                '> `Bodyslam` - ค้นหาเพลงของ Bodyslam\n\n' +
                '**📌 หมายเหตุ:**\n' +
                '> • ผลลัพธ์จะแสดง**เฉพาะคุณเห็น**\n' +
                '> • ข้อความจะ**ลบใน 15 วินาที**\n' +
                '> • ข้อความที่คุณพิมพ์จะถูกลบอัตโนมัติ\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                `**📊 เพลงในคลัง:** ${Object.keys(songs).length} เพลง\n` +
                `**🔄 อัปเดตล่าสุด:** ${new Date().toLocaleTimeString('th-TH')}`
            )
            .setColor(CONFIG.COLOR.PRIMARY)
            .setImage(ASSETS.SEARCH)
            .setFooter({ text: '💡 พิมพ์ชื่อเพลงในช่องนี้ได้เลย!' });
        
        const msg = await channel.send({ embeds: [embed] });
        postedMessages.search = msg.id;
    } catch (e) {
        console.error('postToSearch error:', e.message);
    }
}

// ★ ฟังก์ชันค้นหา (แสดงเฉพาะคนพิมพ์)
async function handleSearchMessage(message, query) {
    const results = searchSongs(query);
    stats.totalSearchesByUser++;
    
    let embed;
    if (results.length === 0) {
        embed = new EmbedBuilder()
            .setTitle(`🔍 "${truncate(query, 40)}"`)
            .setDescription(
                '❌ **ไม่พบเพลงที่ตรงกัน**\n\n' +
                '💡 **ลองค้นหาด้วย:**\n' +
                '> ชื่อเพลง (บางส่วนก็ได้)\n' +
                '> ชื่อศิลปิน\n\n' +
                '⏱️ ข้อความนี้จะหายไปใน **15 วินาที**'
            )
            .setColor(CONFIG.COLOR.ERROR)
            .setFooter({ text: `📊 คลังมี ${Object.keys(songs).length} เพลง` });
    } else {
        const displayed = results.slice(0, 15); // แสดงสูงสุด 15 เพลง
        embed = new EmbedBuilder()
            .setTitle(`🔍 "${truncate(query, 40)}"`)
            .setDescription(
                `✅ **พบ ${results.length} เพลง**${results.length > 15 ? ' (แสดง 15 เพลงแรก)' : ''}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `⏱️ หายใน 15 วิ · ${new Date().toLocaleTimeString('th-TH')}` });
        
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
    
    try {
        // ส่งแบบ reply กับข้อความที่ผู้ใช้พิมพ์ → แสดงเฉพาะเขา (ephemeral-like)
        const reply = await message.reply({ embeds: [embed] });
        
        // ★ ลบ reply ใน 15 วิ
        setTimeout(async () => {
            try { await reply.delete(); } catch (e) {}
        }, CONFIG.SEARCH_DELETE_TIMEOUT);
    } catch (e) {
        console.error('Reply error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 17] - AUTO SEARCH
// ═══════════════════════════════════════════════════════════════════════════

async function runAutoSearch(channel) {
    if (isLocked) return;
    try {
        stats.autoSearchCount++;
        
        let progressMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setDescription(`⏱️ ${new Date().toLocaleTimeString('th-TH')}\n🔄 รอบ ${stats.autoSearchCount}`)
                .setColor(CONFIG.COLOR.WARNING)
                .setImage(ASSETS.SEARCH)]
        });
        
        const results = await searchMultipleQueries(3);
        if (results.length === 0) {
            await progressMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setColor(CONFIG.COLOR.WARNING)] });
            setTimeout(() => progressMsg.delete().catch(() => {}), 10000);
            return;
        }
        
        const maxToTry = Math.min(results.length, CONFIG.MAX_SONGS_TO_TRY);
        let skipped = 0, failed = 0;
        
        for (let i = 0; i < maxToTry; i++) {
            const song = results[i];
            if (songs[song.id]) { skipped++; continue; }
            const r = await processSong(song, progressMsg, i, maxToTry);
            if (r.status === 'success') {
                await progressMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .setDescription(
                            `🎵 **${truncate(r.song.title, 60)}**\n` +
                            `🎤 ${truncate(r.song.artist, 50)}\n\n` +
                            `🟢 \`${r.uploadResult.assetId}\`\n` +
                            `📊 รวม: ${Object.keys(songs).length} เพลง`
                        )
                        .setColor(CONFIG.COLOR.SUCCESS)
                        .setImage(ASSETS.SUCCESS)
                        .setThumbnail(r.song.thumbnail)]
                });
                setTimeout(() => progressMsg.delete().catch(() => {}), 15000);
                return;
            } else if (r.status === 'skipped') skipped++;
            else if (r.status === 'failed') failed++;
        }
        
        await progressMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่มีเพลงใหม่')
            .setDescription(`ลอง ${maxToTry} เพลง\n⏭️ ข้าม: ${skipped} · ❌ ล้ม: ${failed}`)
            .setColor(CONFIG.COLOR.WARNING)] });
        setTimeout(() => progressMsg.delete().catch(() => {}), 10000);
    } catch (e) { console.error('Auto error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 18] - BOT READY
// ═══════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลง: ${Object.keys(songs).length}`);
    console.log(`📺 ช่องแสดง: ${displayChannels.length}`);
    console.log('═'.repeat(70) + '\n');
    
    await loadFromCloud();
    const cleanResult = await cleanupLibrary();
    if (cleanResult.removed > 0) console.log(`🧹 Cleanup: ลบ ${cleanResult.removed} เพลง`);
    
    startAutoSave();
    startAutoUpdate();
    startAutoCleanup();
    
    const commands = [
        new SlashCommandBuilder().setName('unlock').setDescription('🔓 ปลดล็อก').addStringOption(o => o.setName('key').setDescription('Key').setRequired(true)),
        new SlashCommandBuilder().setName('lock').setDescription('🔒 ล็อก'),
        new SlashCommandBuilder().setName('panel').setDescription('🎛️ แผงควบคุม'),
        new SlashCommandBuilder().setName('status').setDescription('📊 สถานะ'),
        new SlashCommandBuilder().setName('help').setDescription('📖 คำสั่ง'),
        
        new SlashCommandBuilder().setName('ตั้งค่าช่องแสดง').setDescription('📺 ช่องแสดงเพลง')
            .addChannelOption(o => o.setName('ช่อง1').setDescription('ช่อง 1').setRequired(true))
            .addChannelOption(o => o.setName('ช่อง2').setDescription('ช่อง 2').setRequired(false))
            .addChannelOption(o => o.setName('ช่อง3').setDescription('ช่อง 3').setRequired(false)),
        new SlashCommandBuilder().setName('ตั้งค่าคลังเพลง').setDescription('📚 ช่องคลัง').addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true)),
        new SlashCommandBuilder().setName('ตั้งค่าช่องแจ้งเตือน').setDescription('🔔 ช่องแจ้ง').addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true)),
        new SlashCommandBuilder().setName('ตั้งค่าช่องค้นหา').setDescription('🔍 ช่องค้นหา').addChannelOption(o => o.setName('ช่อง').setDescription('ช่อง').setRequired(true)),
        new SlashCommandBuilder().setName('ทดสอบ').setDescription('🧪 ทดสอบ'),
        
        new SlashCommandBuilder().setName('หาเพลง').setDescription('🔍 หาเพลง').addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อ').setRequired(true)),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('🎤 ดึงศิลปิน').addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('🔥 เพลงฮิต'),
        
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('🚀 เริ่ม Auto'),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('⏹️ หยุด Auto'),
        
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('🎲 สุ่ม'),
        new SlashCommandBuilder().setName('ข้อมูลเพลง').setDescription('ℹ️ ข้อมูล').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true)),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('🗑️ ลบ').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true)),
        
        new SlashCommandBuilder().setName('อัปโหลด').setDescription('📤 เลือกอัปโหลด'),
        new SlashCommandBuilder().setName('อัปโหลดทั้งหมด').setDescription('📤 อัปโหลดทั้งหมด'),
        
        new SlashCommandBuilder().setName('สถิติ').setDescription('📈 สถิติ'),
        new SlashCommandBuilder().setName('สำรองข้อมูล').setDescription('💾 สำรอง'),
        new SlashCommandBuilder().setName('อัปเดตช่อง').setDescription('🔄 อัปเดต'),
        new SlashCommandBuilder().setName('เคลียร์คลัง').setDescription('🧹 เคลียร์')
    ];
    
    try { await client.application.commands.set(commands); console.log('✅ Commands registered!'); } catch (e) { console.error(e.message); }
    
    await updateAllChannels();
    await postToSearchChannel();
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 19] - ★★★ MESSAGE LISTENER (ช่องค้นหา) ★★★
// ═══════════════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
    // ข้าม bot
    if (message.author.bot) return;
    
    // ★ เช็คว่าเป็นช่องค้นหาหรือไม่
    if (!searchChannelId || message.channelId !== searchChannelId) return;
    
    // ★ ข้ามข้อความที่ bot เองส่ง (ข้อความต้อนรับ)
    if (message.id === postedMessages.search) return;
    
    const query = message.content.trim();
    if (!query) return;
    
    // ★ ลบข้อความผู้ใช้ทันที
    try { await message.delete(); } catch (e) {}
    
    // Rate limit
    if (!checkCooldown(message.author.id, 'search_msg')) return;
    
    // ★ ค้นหา + แสดงผลเฉพาะเขา
    await handleSearchMessage(message, query);
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 20] - INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) return handleComponents(interaction);
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(CONFIG.COLOR.BLACK);
    
    // PUBLIC
    if (commandName === 'สุ่มเพลง') {
        const list = Object.values(songs);
        if (list.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่าง!')] });
        const s = list[Math.floor(Math.random() * list.length)];
        return interaction.reply({
            embeds: [replyEmbed.setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(`🎵 **${truncate(s.title, 60)}**\n🎤 ${truncate(s.artist, 50)}`)
                .addFields({ name: '⏱️', value: `\`${fmtDuration(s.duration)}\``, inline: true }, { name: '🟢', value: s.robloxAssetId ? `\`${s.robloxAssetId}\`` : '🔴 รอ', inline: true })
                .setThumbnail(s.thumbnail).setColor(CONFIG.COLOR.PINK)],
            ephemeral: true
        });
    }
    
    // OWNER/ADMIN
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        if (!checkUnlockRateLimit(interaction.user.id)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รอ 10 วิ!')], ephemeral: true });
        if (verifyKey(options.getString('key'))) {
            isLocked = false;
            await saveToCloud(true);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 ปลดล็อกสำเร็จ!').setDescription('ใช้ `/panel`').setColor(CONFIG.COLOR.SUCCESS)], ephemeral: true });
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Key ไม่ถูก!').setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    }
    
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        isLocked = true;
        await saveToCloud(true);
        return interaction.reply({ embeds: [replyEmbed.setDescription('🔒 ล็อกแล้ว!').setColor(CONFIG.COLOR.WARNING)] });
    }
    
    if (commandName === 'panel') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        const { embed, components } = buildAdminPanel();
        return interaction.reply({ embeds: [embed], components });
    }
    
    if (commandName === 'status') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        const list = Object.values(songs);
        const uploaded = list.filter(s => s.robloxAssetId).length;
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 สถานะบอท v12.0').addFields(
            { name: '🔒 สถานะ', value: isLocked ? '`🔒`' : '`🔓`', inline: true },
            { name: '⏱️ ออนไลน์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
            { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? '`✅ Cloud`' : '`⚠️ Local`', inline: true },
            { name: '📂 เพลง', value: `\`${list.length}\``, inline: true },
            { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
            { name: '🔴 รอ', value: `\`${list.length - uploaded}\``, inline: true },
            { name: '🛡️ ชั้น 1', value: `\`${stats.layer1Success}\``, inline: true },
            { name: '🛡️ ชั้น 2', value: `\`${stats.layer2Success}\``, inline: true },
            { name: '🛡️ ชั้น 3', value: `\`${stats.layer3Success}\``, inline: true },
            { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
            { name: '🧹 เคลียร์', value: `\`${stats.totalCleaned}\``, inline: true },
            { name: '🗑️ ซ้ำ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true }
        ).setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS).setThumbnail(ASSETS.CHART).setTimestamp()] });
    }
    
    if (commandName === 'help') {
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 คำสั่งทั้งหมด').setColor(CONFIG.COLOR.PRIMARY)
            .addFields(
                { name: '🌟 ทุกคน', value: '`/สุ่มเพลง` · ช่องค้นหา (พิมพ์ตรง)', inline: false },
                { name: '🔒 Security', value: '`/unlock` `/lock` `/status` `/panel` `/help`', inline: false },
                { name: '⚙️ ตั้งค่า', value: '`/ตั้งค่าช่องแสดง` `/ตั้งค่าคลังเพลง` `/ตั้งค่าช่องแจ้งเตือน` `/ตั้งค่าช่องค้นหา`', inline: false },
                { name: '🔍 ค้นหา', value: '`/หาเพลง` `/ศิลปิน` `/เพลงฮิต`', inline: false },
                { name: '🚀 Auto', value: '`/เริ่มหาเพลง` `/หยุดหาเพลง`', inline: false },
                { name: '📤 อัปโหลด', value: '`/อัปโหลด` `/อัปโหลดทั้งหมด`', inline: false },
                { name: '🧹 เคลียร์', value: '`/เคลียร์คลัง`', inline: false },
                { name: '📊 ข้อมูล', value: '`/สถิติ` `/สำรองข้อมูล` `/อัปเดตช่อง`', inline: false })
            .setImage(ASSETS.MUSIC)
            .setFooter({ text: '✨ แสดงเพลงทั้งหมด · ค้นหาพิมพ์ตรง · 3-Layer' })], ephemeral: true });
    }
    
    if (commandName === 'ตั้งค่าช่องแสดง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        displayChannels = [options.getChannel('ช่อง1').id];
        if (options.getChannel('ช่อง2')) displayChannels.push(options.getChannel('ช่อง2').id);
        if (options.getChannel('ช่อง3')) displayChannels.push(options.getChannel('ช่อง3').id);
        lastDisplayHashes = {};
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📺 ตั้งค่าสำเร็จ!').setDescription(displayChannels.map((id, i) => `${i+1}. <#${id}>`).join('\n')).setColor(CONFIG.COLOR.SUCCESS)] });
        await postToDisplayChannels();
    }
    
    if (commandName === 'ตั้งค่าคลังเพลง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        libraryChannelId = options.getChannel('ช่อง').id;
        lastLibraryHash = '';
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📚 ตั้งค่าคลังสำเร็จ!').setDescription(`<#${libraryChannelId}>`).setColor(CONFIG.COLOR.SUCCESS)] });
        await postToLibraryChannel();
    }
    
    if (commandName === 'ตั้งค่าช่องแจ้งเตือน') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        notificationChannelId = options.getChannel('ช่อง').id;
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔔 ตั้งค่าสำเร็จ!').setDescription(`<#${notificationChannelId}>`).setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.BELL)] });
    }
    
    if (commandName === 'ตั้งค่าช่องค้นหา') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        searchChannelId = options.getChannel('ช่อง').id;
        postedMessages.search = null;
        await saveToCloud(true);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔍 ตั้งค่าสำเร็จ!').setDescription(`<#${searchChannelId}>\n💡 พิมพ์ชื่อเพลงในช่อง → เห็นเฉพาะคุณ`).setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.SEARCH)] });
        await postToSearchChannel();
    }
    
    if (commandName === 'อัปเดตช่อง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        await interaction.deferReply();
        await updateAllChannels();
        await postToSearchChannel();
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🔄 อัปเดตทุกช่องแล้ว!').setDescription('ลบของเก่า + แสดงใหม่ครบ').setColor(CONFIG.COLOR.SUCCESS)] });
    }
    
    if (commandName === 'เคลียร์คลัง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        await interaction.deferReply();
        const result = await cleanupLibrary();
        let desc = `**🧹 ผลการเคลียร์:**\n\n> 📊 ก่อน: \`${result.before}\`\n> 📊 หลัง: \`${result.after}\`\n> 🗑️ ลบ: \`${result.removed}\`\n> 🔄 ซ้ำ: \`${result.duplicates}\`\n> ❌ ไม่ครบ: \`${result.invalid}\``;
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🧹 เคลียร์สำเร็จ!').setDescription(desc).setColor(result.removed > 0 ? CONFIG.COLOR.SUCCESS : CONFIG.COLOR.INFO).setImage(ASSETS.BROOM)] });
        if (result.removed > 0) await updateAllChannels();
    }
    
    if (commandName === 'ทดสอบ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        await interaction.deferReply();
        const t = Date.now();
        try {
            const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, { params: { q: 'Saran', type: 'song', sources: 'joox' }, timeout: 90000 });
            const list = res.data?.data?.songs || [];
            await interaction.editReply({ embeds: [replyEmbed.setTitle('🧪 ทดสอบ').setDescription(`✅ เชื่อมต่อได้\n⏱️ ${((Date.now()-t)/1000).toFixed(1)}s\n🎵 ${list.length} เพลง`).setColor(CONFIG.COLOR.SUCCESS)] });
        } catch (e) { await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${e.message}`).setColor(CONFIG.COLOR.ERROR)] }); }
    }
    
    if (commandName === 'สำรองข้อมูล') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin!')], ephemeral: true });
        await interaction.deferReply();
        await saveToCloud(true);
        await interaction.editReply({ embeds: [replyEmbed.setTitle('💾 สำรองแล้ว').setDescription(`${Object.keys(songs).length} เพลง`).setColor(CONFIG.COLOR.SUCCESS)] });
    }
    
    const access = checkAccess(interaction);
    if (!access.allowed) return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    if (!checkCooldown(interaction.user.id, commandName)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิด!')], ephemeral: true });
    
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🔍 กำลังค้นหา...').setDescription(`**${query}**`).setColor(CONFIG.COLOR.WARNING).setImage(ASSETS.SEARCH)] });
        const results = await searchJoox(query);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง`).setColor(CONFIG.COLOR.ERROR)] });
        const shuffled = shuffleArray(results);
        const maxTry = Math.min(shuffled.length, 15);
        let result = null, skipped = 0;
        for (let i = 0; i < maxTry; i++) {
            result = await processSong(shuffled[i], interaction, i, maxTry);
            if (result.status === 'success') break;
            if (result.status === 'skipped') skipped++;
        }
        if (result?.status === 'success') {
            await interaction.editReply({ embeds: [replyEmbed.setTitle('✅ เพิ่มเพลงสำเร็จ!')
                .setThumbnail(result.song.thumbnail).setImage(ASSETS.SUCCESS)
                .addFields(
                    { name: '🎵', value: truncate(result.song.title, 60), inline: true },
                    { name: '🎤', value: truncate(result.song.artist, 50), inline: true },
                    { name: '⏱️', value: fmtDuration(result.song.duration), inline: true },
                    { name: '🟢 Roblox', value: `\`${result.uploadResult.assetId}\``, inline: false })
                .setColor(CONFIG.COLOR.SUCCESS)] });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ลอง ${maxTry} เพลง · ข้าม ${skipped}`).setColor(CONFIG.COLOR.ERROR)] });
        }
    }
    
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        const results = await searchJoox(artist);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบ **${artist}**`).setColor(CONFIG.COLOR.ERROR)] });
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`⏳ โหลด ${artist}...`).setDescription(`พบ ${results.length} เพลง`).setColor(CONFIG.COLOR.WARNING)] });
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(2000);
        }
        const summary = added.length > 0 ? added.map(s => `> 🟢 **${truncate(s.title, 50)}**`).join('\n') : '> ไม่มีเพลงใหม่';
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`✅ ${artist}`).setDescription(`**รายชื่อ:**\n${summary}`)
            .addFields({ name: '➕ สำเร็จ', value: `\`${added.length}\``, inline: true }, { name: '⏭️ ข้าม', value: `\`${skipped.length}\``, inline: true }, { name: '📊 รวม', value: `\`${Object.keys(songs).length}\``, inline: true })
            .setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.SUCCESS)] });
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
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔥 เพลงฮิต')
            .setDescription(added.map(s => `> **${truncate(s.title, 50)}**`).join('\n') || '> ไม่มีเพลงใหม่')
            .addFields({ name: '➕', value: `\`${added.length}\``, inline: true }, { name: '⏭️', value: `\`${skipped.length}\``, inline: true })
            .setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.FIRE)] });
    }
    
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่!')] });
        if (displayChannels.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ตั้งค่าช่องแสดงก่อน!').setColor(CONFIG.COLOR.WARNING)] });
        await interaction.reply({ embeds: [replyEmbed.setTitle('🚀 เริ่มระบบ Auto!')
            .setDescription(`⏱️ รอบละ: ${CONFIG.AUTO_SEARCH_INTERVAL/1000} วิ\n🔍 3 คำ/รอบ\n🛡️ 3-Layer Fallback\n🧹 Cleanup ทุก 10 นาที`)
            .setColor(CONFIG.COLOR.SUCCESS).setImage(ASSETS.ROCKET)] });
        const channel = client.channels.cache.get(displayChannels[0]);
        if (channel) {
            await runAutoSearch(channel);
            autoTask = setInterval(async () => { const ch = client.channels.cache.get(displayChannels[0]); if (ch) await runAutoSearch(ch); }, CONFIG.AUTO_SEARCH_INTERVAL);
        }
    }
    
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) { clearInterval(autoTask); autoTask = null; await saveToCloud(true); await interaction.reply({ embeds: [replyEmbed.setTitle('⏹️ หยุดแล้ว').setDescription(`💾 บันทึก\n📊 รอบ: ${stats.autoSearchCount}`).setColor(CONFIG.COLOR.SUCCESS)] }); }
        else await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงาน!')] });
    }
    
    if (commandName === 'ข้อมูลเพลง') {
        const id = options.getString('id');
        const song = songs[id];
        if (!song) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบ!')], ephemeral: true });
        const embed = new EmbedBuilder().setTitle('ℹ️ ข้อมูลเพลง').setColor(CONFIG.COLOR.PRIMARY)
            .addFields(
                { name: '🎵 ชื่อ', value: song.title, inline: false },
                { name: '🎤 ศิลปิน', value: song.artist, inline: true },
                { name: '⏱️ ความยาว', value: fmtDuration(song.duration), inline: true },
                { name: '💿 อัลบั้ม', value: song.album || 'ไม่ระบุ', inline: true },
                { name: '🆔 ID', value: `\`${song.id}\``, inline: false },
                { name: '🟢 Roblox', value: song.robloxAssetId ? `\`${song.robloxAssetId}\`` : '🔴 รอ', inline: true },
                { name: '📅 เพิ่มเมื่อ', value: song.addedAt ? new Date(song.addedAt).toLocaleString('th-TH') : 'ไม่ระบุ', inline: false });
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
            await interaction.reply({ embeds: [replyEmbed.setTitle('✅ ลบเพลง').setDescription(`**${truncate(title, 60)}**`).setColor(CONFIG.COLOR.SUCCESS)] });
            await updateAllChannels();
        } else await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบ!')] });
    }
    
    if (commandName === 'อัปโหลด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        const select = new StringSelectMenuBuilder().setCustomId('select_upload').setPlaceholder('เลือกเพลง (สูงสุด 10)')
            .setMinValues(1).setMaxValues(Math.min(pending.length, 10))
            .addOptions(pending.slice(0, 25).map(s => ({ label: s.title.slice(0, 100), description: `🎤 ${(s.artist || 'Unknown').slice(0, 50)}`.slice(0, 100), value: s.id })));
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📤 เลือกเพลง').setDescription(`**${pending.length}** เพลงรอ`).setColor(CONFIG.COLOR.PRIMARY).setImage(ASSETS.UPLOAD)], components: [new ActionRowBuilder().addComponents(select)] });
    }
    
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        await interaction.deferReply();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger));
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`อัปโหลด **${pending.length}** เพลง\n⏱️ ~${Math.ceil(pending.length * 0.5)} นาที`).setColor(CONFIG.COLOR.WARNING).setImage(ASSETS.WARNING)], components: [row] });
    }
    
    if (commandName === 'สถิติ') {
        const list = Object.values(songs);
        const byArtist = {};
        list.forEach(s => { byArtist[s.artist] = (byArtist[s.artist] || 0) + 1; });
        const top = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 5);
        await interaction.reply({ embeds: [replyEmbed.setTitle('📈 สถิติ v12.0').setColor(CONFIG.COLOR.PRIMARY).setImage(ASSETS.CHART)
            .addFields(
                { name: '🔍 ค้นหา', value: `\`${stats.totalSearches}\``, inline: true },
                { name: '⬇️ ดาวน์โหลด', value: `\`${stats.totalDownloads}\``, inline: true },
                { name: '📤 อัปโหลด', value: `\`${stats.totalUploads}\``, inline: true },
                { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                { name: '🛡️ ชั้น 1', value: `\`${stats.layer1Success}\``, inline: true },
                { name: '🛡️ ชั้น 2', value: `\`${stats.layer2Success}\``, inline: true },
                { name: '🛡️ ชั้น 3', value: `\`${stats.layer3Success}\``, inline: true },
                { name: '📊 ในคลัง', value: `\`${list.length}\``, inline: true },
                { name: '🎤 Top 5', value: top.map(([a, c]) => `> ${truncate(a, 25)}: **${c}**`).join('\n') || '> ไม่มี', inline: false })
            .setTimestamp()] });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 21] - COMPONENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleComponents(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    if (isLocked) return interaction.reply({ content: '🔒 ล็อกอยู่!', ephemeral: true });
    
    if (interaction.customId === 'admin_stats') {
        const list = Object.values(songs);
        const uploaded = list.filter(s => s.robloxAssetId).length;
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 สถิติ').setColor(CONFIG.COLOR.PRIMARY).setImage(ASSETS.CHART)
            .addFields(
                { name: '📂 เพลง', value: `\`${list.length}\``, inline: true },
                { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
                { name: '🔴 รอ', value: `\`${list.length - uploaded}\``, inline: true },
                { name: '🛡️ ชั้น 1', value: `\`${stats.layer1Success}\``, inline: true },
                { name: '🛡️ ชั้น 2', value: `\`${stats.layer2Success}\``, inline: true },
                { name: '🛡️ ชั้น 3', value: `\`${stats.layer3Success}\``, inline: true })
        ], ephemeral: true });
    }
    
    if (interaction.customId === 'admin_backup') { await interaction.deferReply({ ephemeral: true }); await saveToCloud(true); await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💾 สำรองแล้ว').setColor(CONFIG.COLOR.SUCCESS)] }); return; }
    if (interaction.customId === 'admin_refresh') { await interaction.deferReply({ ephemeral: true }); await updateAllChannels(); await postToSearchChannel(); await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔄 รีเฟรชแล้ว').setColor(CONFIG.COLOR.SUCCESS)] }); return; }
    if (interaction.customId === 'admin_lock') { isLocked = !isLocked; await saveToCloud(true); const { embed, components } = buildAdminPanel(); await interaction.update({ embeds: [embed], components }); return; }
    
    if (interaction.customId === 'admin_setup_channels') {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📺 วิธีตั้งค่า').setDescription(
            '`/ตั้งค่าช่องแสดง ช่อง1:#ch1 ช่อง2:#ch2 ช่อง3:#ch3`\n`/ตั้งค่าคลังเพลง ช่อง:#lib`\n`/ตั้งค่าช่องแจ้งเตือน ช่อง:#notify`\n`/ตั้งค่าช่องค้นหา ช่อง:#search`'
        ).setColor(CONFIG.COLOR.INFO)], ephemeral: true }); return;
    }
    
    if (interaction.customId === 'admin_clear') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_clear_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_clear_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Secondary));
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`ลบ **${Object.keys(songs).length}** เพลง`).setColor(CONFIG.COLOR.ERROR)], components: [row], ephemeral: true }); return;
    }
    
    if (interaction.customId === 'confirm_clear_all') {
        const count = Object.keys(songs).length;
        songs = {};
        stats.totalSongsRemoved += count;
        await saveToCloud(true);
        await updateAllChannels();
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('✅ ลบแล้ว').setDescription(`ลบ ${count} เพลง`).setColor(CONFIG.COLOR.SUCCESS)], components: [] }); return;
    }
    
    if (interaction.customId === 'cancel_clear_all') { await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR.ERROR)], components: [] }); return; }
    
    if (interaction.customId === 'admin_upload_all') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')], ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger));
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`อัปโหลด **${pending.length}** เพลง`).setColor(CONFIG.COLOR.WARNING)], components: [row], ephemeral: true }); return;
    }
    
    if (interaction.customId === 'confirm_upload_all' || interaction.customId === 'select_upload') {
        await interaction.deferUpdate();
        const ids = interaction.customId === 'select_upload' ? interaction.values : Object.values(songs).filter(s => !s.robloxAssetId).map(s => s.id);
        let ok = 0, fail = 0;
        for (let i = 0; i < ids.length; i++) {
            const song = songs[ids[i]];
            if (!song) continue;
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📤 ${i+1}/${ids.length}`).setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i, ids.length)}`).setColor(CONFIG.COLOR.INFO).setImage(ASSETS.UPLOAD).setThumbnail(song.thumbnail)], components: [] });
            const audioPath = await downloadAudio(song.id, song.title, song.artist);
            if (!audioPath) { fail++; continue; }
            const up = await uploadToRoblox(audioPath, song.title, song.artist);
            try { fs.unlinkSync(audioPath); } catch (e) {}
            if (up.success) { songs[song.id].robloxAssetId = up.assetId; songs[song.id].robloxError = null; ok++; } else { songs[song.id].robloxError = up.error; fail++; }
            await saveToCloud(); await sleep(2000);
        }
        await updateAllChannels();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('✅ เสร็จสิ้น!').setImage(ASSETS.SUCCESS)
            .addFields({ name: '🟢 สำเร็จ', value: `\`${ok}\``, inline: true }, { name: '🔴 ล้มเหลว', value: `\`${fail}\``, inline: true }).setColor(CONFIG.COLOR.SUCCESS)], components: [] }); return;
    }
    
    if (interaction.customId === 'cancel_upload_all') { await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR.ERROR)], components: [] }); return; }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 22] - ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

function buildAdminPanel() {
    const songList = Object.values(songs);
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    const embed = new EmbedBuilder()
        .setTitle('🎛️ แผงควบคุมผู้ดูแล v12.0')
        .setDescription('**Full Display Edition**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            { name: '🔒 สถานะ', value: isLocked ? '`🔒 ล็อก`' : '`🔓 ปลดล็อก`', inline: true },
            { name: '⏱️ ออนไลน์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
            { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? '`✅ Cloud`' : '`⚠️ Local`', inline: true },
            { name: '📂 เพลง', value: `\`${songList.length}\``, inline: true },
            { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
            { name: '🔴 รอ', value: `\`${pending}\``, inline: true },
            { name: '🛡️ ชั้น 1', value: `\`${stats.layer1Success}\``, inline: true },
            { name: '🛡️ ชั้น 2', value: `\`${stats.layer2Success}\``, inline: true },
            { name: '🛡️ ชั้น 3', value: `\`${stats.layer3Success}\``, inline: true },
            { name: '🧹 เคลียร์', value: `\`${stats.totalCleaned}\``, inline: true },
            { name: '🗑️ ซ้ำ', value: `\`${stats.totalDuplicatesRemoved}\``, inline: true },
            { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true }
        )
        .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
        .setFooter({ text: '🎛️ Admin Panel v12.0' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_stats').setLabel('สถิติ').setStyle(ButtonStyle.Primary).setEmoji('📊'),
        new ButtonBuilder().setCustomId('admin_backup').setLabel('สำรอง').setStyle(ButtonStyle.Success).setEmoji('💾'),
        new ButtonBuilder().setCustomId('admin_refresh').setLabel('รีเฟรช').setStyle(ButtonStyle.Secondary).setEmoji('🔄'));
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_lock').setLabel(isLocked ? 'ปลดล็อก' : 'ล็อก').setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji(isLocked ? '🔓' : '🔒'),
        new ButtonBuilder().setCustomId('admin_upload_all').setLabel('อัปโหลดทั้งหมด').setStyle(ButtonStyle.Primary).setEmoji('📤'),
        new ButtonBuilder().setCustomId('admin_setup_channels').setLabel('วิธีตั้งค่า').setStyle(ButtonStyle.Secondary).setEmoji('📺'),
        new ButtonBuilder().setCustomId('admin_clear').setLabel('ล้างทั้งหมด').setStyle(ButtonStyle.Danger).setEmoji('🗑️'));
    
    return { embed, components: [row1, row2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 23] - LOGIN
// ═══════════════════════════════════════════════════════════════════════════

client.login(CONFIG.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════════════════════
// END - v12.0 FULL DISPLAY EDITION
// ═══════════════════════════════════════════════════════════════════════════
