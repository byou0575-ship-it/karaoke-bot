// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                                                                          ║
// ║   ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗              ║
// ║   ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝              ║
// ║   █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗                ║
// ║   ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝                ║
// ║   ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗              ║
// ║   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝              ║
// ║                                                                          ║
// ║   AUTO-UPDATE EDITION v7.0 - 3000+ LINES PREMIUM                        ║
// ║   ✨ Auto-Delete & Repost · Public Library · Beautiful Search           ║
// ║                                                                          ║
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
    ButtonStyle,
    ChannelType
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
    // Discord
    DISCORD_TOKEN: process.env.DISCORD_BOT_TOKEN,
    
    // Roblox
    ROBLOX_API_KEY: process.env.ROBLOX_API_KEY,
    ROBLOX_USER_ID: process.env.ROBLOX_USER_ID,
    ROBLOX_API_URL: 'https://apis.roblox.com/assets/v1/assets',
    
    // Music API
    MUSIC_API_URL: process.env.MUSIC_API_URL || 'https://joox-api.onrender.com',
    
    // Security
    UNLOCK_KEY: 'Owjadk@#23241hxb',
    
    // Storage
    JSONBIN_ID: process.env.JSONBIN_ID,
    JSONBIN_KEY: process.env.JSONBIN_KEY,
    JSONBIN_URL: 'https://api.jsonbin.io/v3/b',
    
    // Limits
    HTTP_TIMEOUT: 120000,
    DOWNLOAD_TIMEOUT: 180000,
    UPLOAD_TIMEOUT: 180000,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    SONGS_PER_PAGE: 8,
    RATE_LIMIT_MS: 3000,
    UNLOCK_RATE_MS: 10000,
    
    // Auto
    AUTO_SEARCH_INTERVAL: 60000,
    AUTO_SEARCH_TARGET: 'เพลงไทย',
    AUTO_UPDATE_INTERVAL: 15000, // อัปเดตทุก 15 วินาที
    AUTO_DELETE_MESSAGES: true, // ลบข้อความเก่าก่อนสร้างใหม่
    
    // Colors
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
        TEAL: 0x1ABC9C,
        RED: 0xE74C3C
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 03] - ASSETS (GIF & IMAGES)
// ═══════════════════════════════════════════════════════════════════════════

const ASSETS = {
    // Loading
    LOADING: 'https://media.tenor.com/On7kvXhzml4AAAAj/loading-gif.gif',
    LOADING2: 'https://media.tenor.com/6nH2y6gKz0gAAAAj/loading.gif',
    
    // Success
    SUCCESS: 'https://media.tenor.com/8B6m6cZvB5sAAAAC/success.gif',
    CONGRATS: 'https://media.tenor.com/P0T2yQGGe9sAAAAC/thumbs-up.gif',
    
    // Music
    MUSIC: 'https://media.tenor.com/XfN7hy_IYWYAAAAC/music.gif',
    MUSIC_NOTES: 'https://media.tenor.com/1Q9hN8kNZ8AAAAAC/music-notes.gif',
    HEADPHONE: 'https://media.tenor.com/8gH7Vz4jJxEAAAAC/headphone.gif',
    
    // Karaoke
    KARAOKE: 'https://media.tenor.com/6wL6Zm3cJuIAAAAC/singing.gif',
    MICROPHONE: 'https://media.tenor.com/YwzZ5L8wHxsAAAAC/microphone.gif',
    SINGING: 'https://media.tenor.com/XPj6rGgLQ3YAAAAC/singing.gif',
    
    // Download
    DOWNLOAD: 'https://media.tenor.com/KGzZlT5Uu2QAAAAC/download.gif',
    DOWNLOAD2: 'https://media.tenor.com/YpJ5K8qYw9sAAAAC/downloading.gif',
    
    // Upload
    UPLOAD: 'https://media.tenor.com/qKz5v9rUYWYAAAAC/upload.gif',
    
    // Dance
    DANCING: 'https://media.tenor.com/XQeY7_wKPYwAAAAC/dance.gif',
    PARTY: 'https://media.tenor.com/8jLwH5kS5MsAAAAC/party.gif',
    
    // Roblox
    ROBLOX: 'https://media.tenor.com/9Z6zB9kJhSgAAAAC/roblox.gif',
    
    // Alert
    ALERT: 'https://media.tenor.com/tPz7y_4XrXcAAAAC/alert.gif',
    WARNING: 'https://media.tenor.com/Og5bYvHEB2wAAAAC/warning.gif',
    
    // New
    NEW: 'https://media.tenor.com/yJ5fSP7_hQMAAAAC/new.gif',
    BELL: 'https://media.tenor.com/8yWL3gYgBsAAAAAC/bell.gif',
    
    // Search
    SEARCH: 'https://media.tenor.com/Qg5RJ6wGdpEAAAAC/search.gif',
    MAGNIFY: 'https://media.tenor.com/VlHvh_H1A6AAAAAC/magnify.gif',
    
    // Library
    LIBRARY: 'https://media.tenor.com/qP3S7gXsV3sAAAAC/library.gif',
    BOOKS: 'https://media.tenor.com/4dN3lR6Sg4MAAAAC/books.gif',
    
    // Stats
    CHART: 'https://media.tenor.com/YvR6qC4jW1sAAAAC/chart.gif',
    
    // Fire
    FIRE: 'https://media.tenor.com/2roX3uxz_68AAAAC/fire.gif',
    HOT: 'https://media.tenor.com/d7c6HwOW1ZsAAAAC/fire-fire-flame.gif'
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 04] - GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let songs = {};
let displayChannels = []; // ช่องแสดงเพลง (ทุกคนเห็น)
let libraryChannelId = null; // ช่องคลังเพลง (ทุกคนเห็น)
let notificationChannelId = null; // ช่องแจ้งเตือนเพลงใหม่
let searchChannelId = null; // ช่องค้นหาเพลง

let isLocked = true;
let autoTask = null;
let refreshTask = null;
let saveTask = null;
let autoUpdateTask = null;
let unlockAttempts = new Map();
let commandCooldowns = new Map();

// เก็บข้อความที่ส่งไปแล้ว เพื่อลบทีหลัง
let postedMessages = {
    display: {}, // { channelId: [messageIds] }
    library: [], // [messageIds]
    search: null, // messageId
    autoProgress: null
};

// Hash ข้อความล่าสุด เพื่อเช็คว่ามีการเปลี่ยนแปลงไหม
let lastLibraryHash = '';
let lastDisplayHashes = {}; // { channelId: hash }

let stats = {
    totalSearches: 0,
    totalDownloads: 0,
    totalUploads: 0,
    totalFailures: 0,
    totalSongsAdded: 0,
    totalSongsRemoved: 0,
    totalSearchesByUser: 0,
    totalUpdates: 0,
    startTime: Date.now(),
    lastAutoSearch: null,
    autoSearchCount: 0
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
        channels: {
            display: displayChannels.length,
            library: !!libraryChannelId,
            notification: !!notificationChannelId,
            search: !!searchChannelId
        },
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/stats', (req, res) => {
    res.json({ ...stats, songCount: Object.keys(songs).length });
});

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
// [SECTION 07] - PERSISTENT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_BACKUP = '/tmp/backup.json';

async function loadFromCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        loadFromLocal();
        return;
    }
    try {
        console.log('☁️ Loading from JSONBin...');
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
        if (data.stats) {
            stats.totalSearches = data.stats.totalSearches || 0;
            stats.totalDownloads = data.stats.totalDownloads || 0;
            stats.totalUploads = data.stats.totalUploads || 0;
            stats.totalFailures = data.stats.totalFailures || 0;
            stats.totalSongsAdded = data.stats.totalSongsAdded || 0;
            stats.totalSongsRemoved = data.stats.totalSongsRemoved || 0;
            stats.totalSearchesByUser = data.stats.totalSearchesByUser || 0;
        }
        
        console.log(`✅ Loaded: ${Object.keys(songs).length} songs`);
        saveToLocal();
    } catch (e) {
        console.error('❌ Load error:', e.message);
        loadFromLocal();
    }
}

async function saveToCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        saveToLocal();
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
                stats: {
                    totalSearches: stats.totalSearches,
                    totalDownloads: stats.totalDownloads,
                    totalUploads: stats.totalUploads,
                    totalFailures: stats.totalFailures,
                    totalSongsAdded: stats.totalSongsAdded,
                    totalSongsRemoved: stats.totalSongsRemoved,
                    totalSearchesByUser: stats.totalSearchesByUser
                },
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
        saveToLocal();
    } catch (e) {
        console.error('❌ Cloud save error:', e.message);
        saveToLocal();
    }
}

function saveToLocal() {
    try {
        fs.writeFileSync(
            LOCAL_BACKUP,
            JSON.stringify({
                songs,
                displayChannels,
                libraryChannelId,
                notificationChannelId,
                searchChannelId,
                isLocked
            }),
            'utf8'
        );
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
            console.log(`📂 Local: ${Object.keys(songs).length} songs`);
        }
    } catch (e) {}
}

function startAutoSave() {
    if (saveTask) clearInterval(saveTask);
    saveTask = setInterval(async () => {
        if (Object.keys(songs).length > 0 || displayChannels.length > 0) {
            await saveToCloud();
        }
    }, 30000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 08] - SECURITY
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
    if (isLocked && !['unlock', 'status', 'help', 'ค้นหาเพลง'].includes(interaction.commandName)) {
        return { allowed: false, reason: '🔒 บอทถูกล็อกอยู่! ใช้ `/unlock` เพื่อปลดล็อก' };
    }
    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 09] - CONTENT FILTER
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "โง่", "ควาย", "ห่า", "แม่ง",
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
// [SECTION 10] - UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

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

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 11] - MUSIC API
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

async function downloadAudio(songId, title, artist) {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    // Layer 1
    try {
        const directUrl = await getDirectUrl(songId);
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
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    // Layer 2
    try {
        const stream = await downloadViaStream(songId);
        if (stream) {
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            if (fs.statSync(tempPath).size > 1024) {
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    stats.totalFailures++;
    return null;
}

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
// [SECTION 12] - DELETE OLD MESSAGES (ระบบลบข้อความเก่า)
// ═══════════════════════════════════════════════════════════════════════════

async function deleteOldMessages(channel, messageIds) {
    if (!channel || !messageIds || messageIds.length === 0) return;
    for (const id of messageIds) {
        try {
            const msg = await channel.messages.fetch(id);
            if (msg) await msg.delete();
        } catch (e) {
            // message already deleted
        }
    }
}

async function deleteAllPostedMessages() {
    // ลบข้อความในช่องแสดง
    for (const chId of Object.keys(postedMessages.display)) {
        const channel = client.channels.cache.get(chId);
        if (channel) {
            await deleteOldMessages(channel, postedMessages.display[chId]);
        }
        postedMessages.display[chId] = [];
    }
    
    // ลบข้อความในช่องคลัง
    if (libraryChannelId) {
        const channel = client.channels.cache.get(libraryChannelId);
        if (channel) {
            await deleteOldMessages(channel, postedMessages.library);
        }
        postedMessages.library = [];
    }
    
    // ลบข้อความในช่องค้นหา
    if (searchChannelId && postedMessages.search) {
        const channel = client.channels.cache.get(searchChannelId);
        if (channel) {
            await deleteOldMessages(channel, [postedMessages.search]);
        }
        postedMessages.search = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 13] - BUILD SONG LIST EMBED (สวยงาม)
// ═══════════════════════════════════════════════════════════════════════════

function buildSongListEmbed(channelName = 'รายการเพลง Karaoke', useGif = true) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return new EmbedBuilder()
            .setTitle('🎤 ' + channelName)
            .setDescription(
                '```\n📭 ยังไม่มีเพลงในคลัง\n```\n' +
                '💡 **วิธีเพิ่มเพลง:**\n' +
                '> 🔍 ใช้ `/หาเพลง` เพื่อเพิ่มเพลง\n' +
                '> 🚀 ใช้ `/เริ่มหาเพลง` เพื่อระบบอัตโนมัติ'
            )
            .setColor(CONFIG.COLOR.BLACK)
            .setImage(useGif ? ASSETS.MUSIC : null)
            .setFooter({ text: `📊 0 เพลง · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });
    }
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    // เรียงตามเวลาที่เพิ่มล่าสุด
    const sortedSongs = [...songList].sort((a, b) => 
        new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
    );
    
    const chunk = sortedSongs.slice(0, CONFIG.SONGS_PER_PAGE);
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 ' + channelName)
        .setColor(CONFIG.COLOR.BLACK);
    
    // Statistics
    embed.addFields({
        name: '📊 สถิติ',
        value: 
            `> 🎵 **เพลงทั้งหมด:** \`${songList.length}\`\n` +
            `> 🟢 **นำเข้า Roblox:** \`${uploaded}\`\n` +
            `> 🔴 **รอนำเข้า:** \`${pending}\``,
        inline: false
    });
    
    // Song list
    let desc = '📀 **เพลงล่าสุด:**\n\n';
    chunk.forEach((s, i) => {
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `**${i+1}.** ${r} **${truncate(s.title, 50)}**\n`;
        desc += `　　🎤 ${truncate(s.artist, 40)}\n`;
        desc += `　　⏱️ ${dur} · 🆔 \`${s.id.slice(0, 10)}\`\n\n`;
    });
    
    if (songList.length > CONFIG.SONGS_PER_PAGE) {
        desc += `\n*...และอีก **${songList.length - CONFIG.SONGS_PER_PAGE}** เพลง*\n`;
        desc += `*ใช้ \`/คลังเพลง\` เพื่อดูทั้งหมด*`;
    }
    
    embed.setDescription(desc);
    embed.setFooter({ 
        text: `📊 ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${pending} · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}`
    });
    embed.setTimestamp();
    
    return embed;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 14] - BUILD LIBRARY EMBED (คลังเพลงแบบเต็ม)
// ═══════════════════════════════════════════════════════════════════════════

function buildLibraryEmbed(page = 0) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return {
            embed: new EmbedBuilder()
                .setTitle('📚 คลังเพลงทั้งหมด')
                .setDescription('*ยังไม่มีเพลงในคลัง*')
                .setColor(CONFIG.COLOR.BLACK)
                .setImage(ASSETS.LIBRARY),
            pages: 1,
            currentPage: 0,
            total: 0
        };
    }
    
    // เรียงตามชื่อ
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
        new ButtonBuilder()
            .setCustomId('lib_first')
            .setLabel('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('lib_prev')
            .setLabel('◀️ ก่อน')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('lib_page')
            .setLabel(`หน้า ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('lib_next')
            .setLabel('ถัดไป ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder()
            .setCustomId('lib_last')
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 15] - POST TO CHANNEL (ลบเก่า + สร้างใหม่)
// ═══════════════════════════════════════════════════════════════════════════

async function postToDisplayChannels() {
    if (displayChannels.length === 0) return;
    
    const hash = simpleHash(JSON.stringify(Object.values(songs).map(s => ({ id: s.id, r: s.robloxAssetId }))));
    
    for (let i = 0; i < displayChannels.length; i++) {
        const chId = displayChannels[i];
        const channelName = `รายการเพลง Karaoke (ช่อง ${i+1})`;
        
        // ถ้า hash ไม่เปลี่ยน ข้าม
        if (lastDisplayHashes[chId] === hash) continue;
        
        try {
            const channel = client.channels.cache.get(chId);
            if (!channel) continue;
            
            // ลบข้อความเก่าในช่องนี้
            if (postedMessages.display[chId] && postedMessages.display[chId].length > 0) {
                await deleteOldMessages(channel, postedMessages.display[chId]);
            }
            postedMessages.display[chId] = [];
            
            // สร้างข้อความใหม่
            const embed = buildSongListEmbed(channelName, true);
            const msg = await channel.send({ embeds: [embed] });
            postedMessages.display[chId] = [msg.id];
            
            lastDisplayHashes[chId] = hash;
            stats.totalUpdates++;
        } catch (e) {
            console.error(`Post to display ${chId} error:`, e.message);
        }
    }
}

async function postToLibraryChannel() {
    if (!libraryChannelId) return;
    
    const hash = simpleHash(JSON.stringify(Object.values(songs).map(s => ({ id: s.id, r: s.robloxAssetId }))));
    
    if (lastLibraryHash === hash) return;
    
    try {
        const channel = client.channels.cache.get(libraryChannelId);
        if (!channel) return;
        
        // ลบข้อความเก่าทั้งหมด
        if (postedMessages.library.length > 0) {
            await deleteOldMessages(channel, postedMessages.library);
        }
        postedMessages.library = [];
        
        // สร้าง Embed ใหม่
        const { embed, pages, currentPage } = buildLibraryEmbed(0);
        const buttons = pages > 1 ? [buildLibraryButtons(currentPage, pages)] : [];
        
        const msg = await channel.send({ 
            embeds: [embed], 
            components: buttons 
        });
        postedMessages.library = [msg.id];
        
        lastLibraryHash = hash;
        stats.totalUpdates++;
    } catch (e) {
        console.error('Post to library error:', e.message);
    }
}

async function postToSearchChannel() {
    if (!searchChannelId) return;
    
    try {
        const channel = client.channels.cache.get(searchChannelId);
        if (!channel) return;
        
        // ลบข้อความเก่า
        if (postedMessages.search) {
            await deleteOldMessages(channel, [postedMessages.search]);
        }
        
        // สร้าง Embed สำหรับช่องค้นหา
        const embed = new EmbedBuilder()
            .setTitle('🔍 ค้นหาเพลง')
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '**📝 วิธีค้นหาเพลง:**\n\n' +
                '> พิมพ์ชื่อเพลงหรือชื่อศิลปินในช่องนี้ได้เลย!\n\n' +
                '**✨ ตัวอย่าง:**\n' +
                '> `Saran` - ค้นหาเพลงของ Saran\n' +
                '> `แค่เพื่อน` - ค้นหาเพลงที่มีคำนี้\n' +
                '> `Bodyslam` - ค้นหาเพลงของ Bodyslam\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                `**📊 เพลงในคลัง:** ${Object.keys(songs).length} เพลง\n` +
                `**🔄 อัปเดตล่าสุด:** ${new Date().toLocaleTimeString('th-TH')}`
            )
            .setColor(CONFIG.COLOR.PRIMARY)
            .setImage(ASSETS.SEARCH)
            .setFooter({ text: '💡 พิมพ์ชื่อเพลงในช่องนี้เพื่อค้นหา' });
        
        const msg = await channel.send({ embeds: [embed] });
        postedMessages.search = msg.id;
    } catch (e) {
        console.error('Post to search error:', e.message);
    }
}

async function updateAllChannels() {
    await postToDisplayChannels();
    await postToLibraryChannel();
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 16] - AUTO UPDATE SYSTEM (ระบบอัปเดตอัตโนมัติ)
// ═══════════════════════════════════════════════════════════════════════════

function startAutoUpdate() {
    if (autoUpdateTask) clearInterval(autoUpdateTask);
    autoUpdateTask = setInterval(async () => {
        if (isLocked) return;
        try {
            await updateAllChannels();
        } catch (e) {
            console.error('Auto-update error:', e.message);
        }
    }, CONFIG.AUTO_UPDATE_INTERVAL);
    console.log(`🔄 Auto-update enabled (every ${CONFIG.AUTO_UPDATE_INTERVAL / 1000}s)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 17] - NOTIFY NEW SONG
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
                (song.robloxAssetId 
                    ? `🟢 **นำเข้า Roblox แล้ว!**\n\`${song.robloxAssetId}\``
                    : '🔴 รออัปโหลด Roblox') +
                `\n\n📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง`
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setImage(ASSETS.NEW)
            .setFooter({ text: `🔔 แจ้งเตือนอัตโนมัติ · ${new Date().toLocaleTimeString('th-TH')}` })
            .setTimestamp();
        
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        
        await channel.send({ 
            content: '@everyone 🎵 เพลงใหม่มาแล้ว!',
            embeds: [embed] 
        });
    } catch (e) {
        console.error('Notify error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 18] - PROCESS SONG
// ═══════════════════════════════════════════════════════════════════════════

async function processSong(song, interaction = null, index = 0, total = 1) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    
    if (songs[songId]) return { status: 'skipped', reason: 'มีอยู่แล้ว' };
    if (isBanned(title, artist)) return { status: 'banned', reason: 'ถูกคัดกรอง' };
    
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
                    .setImage(ASSETS.DOWNLOAD)
                ]
            }).catch(() => {});
        }
        
        const audioPath = await downloadAudio(songId, title, artist);
        if (!audioPath) return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        
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
                    .setImage(ASSETS.UPLOAD)
                ]
            }).catch(() => {});
        }
        
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        songs[songId] = {
            id: songId,
            title,
            artist,
            thumbnail: song.cover || null,
            album: song.album || null,
            duration: song.duration || 0,
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error,
            source: 'joox',
            addedAt: new Date().toISOString()
        };
        stats.totalSongsAdded++;
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        
        // 🔔 แจ้งเตือน + 🔄 อัปเดต
        await notifyNewSong(songs[songId]);
        await updateAllChannels();
        
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (e) {
        return { status: 'failed', reason: e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 19] - AUTO SEARCH
// ═══════════════════════════════════════════════════════════════════════════

async function runAutoSearch(channel, target = CONFIG.AUTO_SEARCH_TARGET) {
    if (isLocked) return;
    
    try {
        stats.autoSearchCount++;
        stats.lastAutoSearch = new Date().toISOString();
        
        const startEmbed = new EmbedBuilder()
            .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
            .setDescription(
                `🎯 **เป้าหมาย:** ${target}\n` +
                `⏱️ **เริ่มเมื่อ:** ${new Date().toLocaleTimeString('th-TH')}\n\n` +
                `${progressBar(0, 1)}\n\n` +
                `📊 **สถานะ:** 🔍 กำลังค้นหา...`
            )
            .setColor(CONFIG.COLOR.WARNING)
            .setImage(ASSETS.SEARCH)
            .setFooter({ text: `🔄 รอบที่ ${stats.autoSearchCount}` });
        
        let progressMsg;
        if (postedMessages.autoProgress) {
            try {
                const old = await channel.messages.fetch(postedMessages.autoProgress);
                await old.delete();
            } catch {}
        }
        progressMsg = await channel.send({ embeds: [startEmbed] });
        postedMessages.autoProgress = progressMsg.id;
        
        const results = await searchJoox(target);
        if (results.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('⏭️ ไม่พบเพลง')
                .setDescription(`ไม่พบเพลงจาก: **${target}**\n🔄 จะลองใหม่ใน 60 วินาที`)
                .setColor(CONFIG.COLOR.WARNING);
            await progressMsg.edit({ embeds: [embed] });
            return;
        }
        
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(`🔍 พบ ${results.length} เพลง`)
                .setDescription(
                    `🎯 **เป้าหมาย:** ${target}\n` +
                    `📊 **สถานะ:** เริ่มดาวน์โหลด...\n\n` +
                    `${progressBar(0, results.length)}`
                )
                .setColor(CONFIG.COLOR.INFO)
            ]
        });
        
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], progressMsg, i, results.length);
            
            if (r.status === 'success') {
                const uploadInfo = r.uploadResult.success
                    ? `🟢 \`${r.uploadResult.assetId}\``
                    : `🔴 ${r.uploadResult.error?.slice(0, 50) || 'failed'}`;
                
                await progressMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                        .setDescription(
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                            `🎵 **${truncate(r.song.title, 60)}**\n` +
                            `🎤 ${truncate(r.song.artist, 50)}\n` +
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                            `${progressBar(i + 1, results.length)}\n\n` +
                            `🟢 **Roblox:** ${uploadInfo}\n` +
                            `📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง\n\n` +
                            `🔄 จะหาใหม่ใน **60 วินาที**`
                        )
                        .setColor(CONFIG.COLOR.SUCCESS)
                        .setImage(ASSETS.SUCCESS)
                        .setThumbnail(r.song.thumbnail)
                    ]
                });
                return;
            }
        }
        
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle('⏭️ ไม่มีเพลงใหม่ในรอบนี้')
                .setDescription(
                    `ลอง **${results.length}** เพลง แต่ซ้ำ/ถูกข้ามทั้งหมด\n\n` +
                    `🔄 จะหาใหม่ใน **60 วินาที**`
                )
                .setColor(CONFIG.COLOR.WARNING)
            ]
        });
    } catch (e) {
        console.error('Auto search error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 20] - PUBLIC SEARCH (ช่องค้นหา)
// ═══════════════════════════════════════════════════════════════════════════

async function handleSearchMessage(message, query) {
    const results = searchSongs(query);
    stats.totalSearchesByUser++;
    
    let embed;
    
    if (results.length === 0) {
        embed = new EmbedBuilder()
            .setTitle(`🔍 ค้นหา: "${truncate(query, 50)}"`)
            .setDescription(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '❌ **ไม่พบเพลงที่ตรงกัน**\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                '💡 **ลองค้นหาด้วย:**\n' +
                '> ชื่อเพลง (บางส่วนก็ได้)\n' +
                '> ชื่อศิลปิน\n' +
                '> คำที่อยู่ในชื่อเพลง'
            )
            .setColor(CONFIG.COLOR.ERROR)
            .setImage(ASSETS.WARNING)
            .setFooter({ text: `📊 คลังมี ${Object.keys(songs).length} เพลง · ${new Date().toLocaleTimeString('th-TH')}` });
    } else {
        const displayed = results.slice(0, 10);
        embed = new EmbedBuilder()
            .setTitle(`🔍 ค้นหา: "${truncate(query, 50)}"`)
            .setDescription(
                `✅ พบ **${results.length}** เพลงที่ตรงกัน${results.length > 10 ? ' (แสดง 10 เพลงแรก)' : ''}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `🎵 ค้นหาจากคลัง ${Object.keys(songs).length} เพลง · ${new Date().toLocaleTimeString('th-TH')}` });
        
        let desc = embed.data.description;
        displayed.forEach((s, i) => {
            const r = s.robloxAssetId ? '🟢' : '🔴';
            const dur = fmtDuration(s.duration);
            desc += `\n**${i+1}.** ${r} **${truncate(s.title, 55)}**\n`;
            desc += `　🎤 ${truncate(s.artist, 45)}\n`;
            desc += `　⏱️ ${dur} · 🆔 \`${s.id.slice(0, 10)}...\`\n`;
        });
        
        embed.setDescription(desc);
        
        if (displayed[0].thumbnail) {
            embed.setThumbnail(displayed[0].thumbnail);
        }
    }
    
    const reply = await message.reply({ embeds: [embed] });
    
    // ลบ reply หลัง 60 วินาที
    setTimeout(() => {
        reply.delete().catch(() => {});
    }, 60000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 21] - BOT READY
// ═══════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลง: ${Object.keys(songs).length}`);
    console.log(`📺 ช่องแสดง: ${displayChannels.length}`);
    console.log(`📚 คลัง: ${libraryChannelId || 'ไม่ได้ตั้ง'}`);
    console.log(`🔔 แจ้งเตือน: ${notificationChannelId || 'ไม่ได้ตั้ง'}`);
    console.log(`🔍 ค้นหา: ${searchChannelId || 'ไม่ได้ตั้ง'}`);
    console.log('═'.repeat(70) + '\n');
    
    await loadFromCloud();
    
    startAutoSave();
    startAutoUpdate();
    
    const commands = [
        // 🔒 Security
        new SlashCommandBuilder().setName('unlock').setDescription('🔓 ปลดล็อกบอท')
            .addStringOption(o => o.setName('key').setDescription('Key').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('lock').setDescription('🔒 ล็อกบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('panel').setDescription('🎛️ เปิดแผงควบคุม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('status').setDescription('📊 สถานะบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('help').setDescription('📖 คำสั่งทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // ⚙️ Setup
        new SlashCommandBuilder().setName('ตั้งค่าช่องแสดง').setDescription('📺 ตั้งค่าช่องแสดงเพลง (สูงสุด 3 ช่อง)')
            .addChannelOption(o => o.setName('ช่อง1').setDescription('ช่องที่ 1').setRequired(true))
            .addChannelOption(o => o.setName('ช่อง2').setDescription('ช่องที่ 2').setRequired(false))
            .addChannelOption(o => o.setName('ช่อง3').setDescription('ช่องที่ 3').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าคลังเพลง').setDescription('📚 ตั้งค่าช่องคลังเพลง (ทุกคนเห็น)')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องคลังเพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าช่องแจ้งเตือน').setDescription('🔔 ตั้งค่าช่องแจ้งเตือนเพลงใหม่')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องแจ้งเตือน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าช่องค้นหา').setDescription('🔍 ตั้งค่าช่องค้นหา (พิมพ์หาที่นี่)')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องค้นหา').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ทดสอบ').setDescription('🧪 ทดสอบ API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🔍 Search
        new SlashCommandBuilder().setName('หาเพลง').setDescription('🔍 ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง/ศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('🎤 ดึงเพลงศิลปิน')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('🔥 เพลงยอดนิยม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🚀 Auto
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('🚀 เริ่มระบบอัตโนมัติ')
            .addStringOption(o => o.setName('เป้าหมาย').setDescription('คำค้นหา').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('⏹️ หยุดระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 📚 Library
        new SlashCommandBuilder().setName('คลังเพลง').setDescription('📚 ดูคลังเพลง (ทุกคน)'),
        new SlashCommandBuilder().setName('ค้นหา').setDescription('🔎 ค้นหาในคลัง')
            .addStringOption(o => o.setName('คำค้น').setDescription('คำค้นหา').setRequired(true)),
        new SlashCommandBuilder().setName('ข้อมูลเพลง').setDescription('ℹ️ ข้อมูลเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('🗑️ ลบเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('🎲 สุ่มเพลง (ทุกคน)'),
        
        // 📤 Upload
        new SlashCommandBuilder().setName('อัปโหลด').setDescription('📤 เลือกเพลงอัปโหลด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปโหลดทั้งหมด').setDescription('📤 อัปโหลดทุกเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 📊 Stats
        new SlashCommandBuilder().setName('สถิติ').setDescription('📈 สถิติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สำรองข้อมูล').setDescription('💾 สำรองข้อมูล')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปเดตช่อง').setDescription('🔄 บังคับอัปเดตทุกช่อง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) {
        console.error('Register error:', e.message);
    }
    
    await updateAllChannels();
    await postToSearchChannel();
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 22] - MESSAGE LISTENER (ช่องค้นหา)
// ═══════════════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!searchChannelId) return;
    if (message.channelId !== searchChannelId) return;
    
    const query = message.content.trim();
    if (!query || query.length < 1) return;
    
    // ลบข้อความของผู้ใช้เพื่อไม่ให้รกช่อง
    try { await message.delete(); } catch {}
    
    // Rate limit
    if (!checkCooldown(message.author.id, 'search_msg')) return;
    
    await handleSearchMessage(message, query);
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 23] - INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(CONFIG.COLOR.BLACK);
    
    // 🌟 PUBLIC: /คลังเพลง
    if (commandName === 'คลังเพลง') {
        const { embed, pages, currentPage } = buildLibraryEmbed(0);
        if (pages <= 1) {
            return interaction.reply({ embeds: [embed] });
        }
        const buttons = buildLibraryButtons(currentPage, pages);
        return interaction.reply({ embeds: [embed], components: [buttons] });
    }
    
    // 🌟 PUBLIC: /ค้นหา
    if (commandName === 'ค้นหา') {
        const filter = options.getString('คำค้น');
        const results = searchSongs(filter);
        stats.totalSearchesByUser++;
        
        if (results.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`🔍 ค้นหา: "${filter}"`)
                    .setDescription(`❌ ไม่พบเพลงที่ตรงกับ **"${filter}"**\n\n💡 ลองค้นหาด้วยชื่อเพลงหรือศิลปิน`)
                    .setColor(CONFIG.COLOR.ERROR)
                    .setImage(ASSETS.WARNING)
                ],
                ephemeral: true
            });
        }
        
        const displayed = results.slice(0, 10);
        const embed = new EmbedBuilder()
            .setTitle(`🔍 ค้นหา: "${filter}"`)
            .setDescription(
                `✅ พบ **${results.length}** เพลง\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `🎵 จากคลัง ${Object.keys(songs).length} เพลง` });
        
        let desc = embed.data.description;
        displayed.forEach((s, i) => {
            const r = s.robloxAssetId ? '🟢' : '🔴';
            desc += `\n**${i+1}.** ${r} **${truncate(s.title, 55)}**\n　🎤 ${truncate(s.artist, 45)}\n`;
        });
        embed.setDescription(desc);
        
        if (displayed[0].thumbnail) embed.setThumbnail(displayed[0].thumbnail);
        
        return interaction.reply({ embeds: [embed] });
    }
    
    // 🌟 PUBLIC: /สุ่มเพลง
    if (commandName === 'สุ่มเพลง') {
        const list = Object.values(songs);
        if (list.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        const s = list[Math.floor(Math.random() * list.length)];
        
        return interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                    `🎵 **${truncate(s.title, 60)}**\n` +
                    `🎤 ${truncate(s.artist, 50)}\n` +
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                )
                .addFields(
                    { name: '⏱️ ความยาว', value: `\`${fmtDuration(s.duration)}\``, inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId ? `\`${s.robloxAssetId}\`` : '🔴 รอ', inline: true }
                )
                .setThumbnail(s.thumbnail)
                .setImage(ASSETS.MUSIC_NOTES)
                .setColor(CONFIG.COLOR.PINK)
            ]
        });
    }
    
    // 🔓 UNLOCK
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        if (!checkUnlockRateLimit(interaction.user.id)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รอ 10 วินาที!')], ephemeral: true });
        
        if (verifyKey(options.getString('key'))) {
            isLocked = false;
            await saveToCloud();
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🔓 ปลดล็อกสำเร็จ!')
                    .setDescription('บอทพร้อมใช้งาน!\n\nใช้ `/panel` เพื่อเปิดแผงควบคุม')
                    .setColor(CONFIG.COLOR.SUCCESS)
                    .setImage(ASSETS.SUCCESS)
                ],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Key ไม่ถูกต้อง!').setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    }
    
    // 🔒 LOCK
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        isLocked = true;
        await saveToCloud();
        return interaction.reply({ embeds: [replyEmbed.setDescription('🔒 ล็อกบอทแล้ว!').setColor(CONFIG.COLOR.WARNING)] });
    }
    
    // 🎛️ PANEL
    if (commandName === 'panel') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        const { embed, components } = buildAdminPanel();
        return interaction.reply({ embeds: [embed], components });
    }
    
    // 📊 STATUS
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
                    { name: '📺 ช่องแสดง', value: `\`${displayChannels.length}\``, inline: true },
                    { name: '📚 คลังเพลง', value: libraryChannelId ? `<#${libraryChannelId}>` : '`❌ ไม่ได้ตั้ง`', inline: true },
                    { name: '🔔 แจ้งเตือน', value: notificationChannelId ? `<#${notificationChannelId}>` : '`❌ ไม่ได้ตั้ง`', inline: true },
                    { name: '🔍 ช่องค้นหา', value: searchChannelId ? `<#${searchChannelId}>` : '`❌ ไม่ได้ตั้ง`', inline: true },
                    { name: '🔄 อัปเดตล่าสุด', value: `\`${stats.totalUpdates}\` ครั้ง`, inline: true }
                )
                .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
                .setThumbnail(ASSETS.CHART)
                .setTimestamp()
            ]
        });
    }
    
    // 📖 HELP
    if (commandName === 'help') {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📖 คำสั่งทั้งหมด')
                .setColor(CONFIG.COLOR.PRIMARY)
                .setDescription('**Karaoke Bot v7.0 - Auto-Update Edition**')
                .addFields(
                    { name: '🌟 สำหรับทุกคน', value: '`/คลังเพลง` `/ค้นหา` `/สุ่มเพลง`', inline: false },
                    { name: '🔒 ความปลอดภัย', value: '`/unlock` `/lock` `/status` `/panel` `/help`', inline: false },
                    { name: '⚙️ ตั้งค่า', value: '`/ตั้งค่าช่องแสดง` `/ตั้งค่าคลังเพลง` `/ตั้งค่าช่องแจ้งเตือน` `/ตั้งค่าช่องค้นหา`', inline: false },
                    { name: '🔍 ค้นหาเพลง', value: '`/หาเพลง` `/ศิลปิน` `/เพลงฮิต`', inline: false },
                    { name: '🚀 อัตโนมัติ', value: '`/เริ่มหาเพลง` `/หยุดหาเพลง`', inline: false },
                    { name: '📤 อัปโหลด', value: '`/อัปโหลด` `/อัปโหลดทั้งหมด`', inline: false },
                    { name: '📊 ข้อมูล', value: '`/สถิติ` `/สำรองข้อมูล` `/อัปเดตช่อง`', inline: false }
                )
                .setImage(ASSETS.MUSIC)
                .setFooter({ text: '💡 บอทอัปเดตช่องอัตโนมัติทุก 15 วินาที' })
            ],
            ephemeral: true
        });
    }
    
    // 📺 ตั้งค่าช่องแสดง
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
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📺 ตั้งค่าช่องแสดงสำเร็จ!')
                .setDescription(
                    `**ช่องแสดงเพลง (${displayChannels.length} ช่อง):**\n` +
                    displayChannels.map((id, i) => `> ${i+1}. <#${id}>`).join('\n') +
                    `\n\n✅ ทุกช่องจะแสดงรายการเพลงอัตโนมัติ`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.SUCCESS)
            ]
        });
        
        await postToDisplayChannels();
    }
    
    // 📚 ตั้งค่าคลังเพลง
    if (commandName === 'ตั้งค่าคลังเพลง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        libraryChannelId = options.getChannel('ช่อง').id;
        postedMessages.library = [];
        lastLibraryHash = '';
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📚 ตั้งค่าคลังเพลงสำเร็จ!')
                .setDescription(`ช่องคลัง: <#${libraryChannelId}>\n\n✅ ทุกคนเห็นได้ + อัปเดตอัตโนมัติ`)
                .setColor(CONFIG.COLOR.SUCCESS)
            ]
        });
        
        await postToLibraryChannel();
    }
    
    // 🔔 ตั้งค่าช่องแจ้งเตือน
    if (commandName === 'ตั้งค่าช่องแจ้งเตือน') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        notificationChannelId = options.getChannel('ช่อง').id;
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔔 ตั้งค่าช่องแจ้งเตือนสำเร็จ!')
                .setDescription(`ช่องแจ้งเตือน: <#${notificationChannelId}>\n\n✅ เมื่อมีเพลงใหม่ จะแจ้งเตือนอัตโนมัติ`)
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.BELL)
            ]
        });
    }
    
    // 🔍 ตั้งค่าช่องค้นหา
    if (commandName === 'ตั้งค่าช่องค้นหา') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        searchChannelId = options.getChannel('ช่อง').id;
        postedMessages.search = null;
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ตั้งค่าช่องค้นหาสำเร็จ!')
                .setDescription(
                    `ช่องค้นหา: <#${searchChannelId}>\n\n` +
                    `✅ **วิธีใช้:**\n` +
                    `> พิมพ์ชื่อเพลง/ศิลปินในช่องนี้\n` +
                    `> บอทจะแสดงผลลัพธ์ทันที`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.SEARCH)
            ]
        });
        
        await postToSearchChannel();
    }
    
    // 🔄 อัปเดตช่อง
    if (commandName === 'อัปเดตช่อง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        
        lastLibraryHash = '';
        lastDisplayHashes = {};
        
        await updateAllChannels();
        await postToSearchChannel();
        
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('🔄 อัปเดตทุกช่องสำเร็จ!')
                .setDescription('ลบข้อความเก่า + สร้างใหม่เรียบร้อย')
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.SUCCESS)
            ]
        });
    }
    
    // 🧪 ทดสอบ
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
                embeds: [replyEmbed
                    .setTitle('🧪 ทดสอบ API')
                    .setDescription(
                        `**URL:** \`${CONFIG.MUSIC_API_URL}\`\n` +
                        `**สถานะ:** ✅ เชื่อมต่อได้\n` +
                        `**เวลา:** ${((Date.now()-t)/1000).toFixed(1)}s\n` +
                        `**พบเพลง:** ${list.length}`
                    )
                    .setColor(CONFIG.COLOR.SUCCESS)
                ]
            });
        } catch (e) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${e.message}`).setColor(CONFIG.COLOR.ERROR)] });
        }
    }
    
    // 💾 สำรอง
    if (commandName === 'สำรองข้อมูล') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        await saveToCloud();
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('💾 สำรองข้อมูลสำเร็จ!')
                .setDescription(`บันทึก ${Object.keys(songs).length} เพลงขึ้น Cloud`)
                .setColor(CONFIG.COLOR.SUCCESS)
            ]
        });
    }
    
    // ตรวจสอบ Access
    const access = checkAccess(interaction);
    if (!access.allowed) {
        return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(CONFIG.COLOR.ERROR)], ephemeral: true });
    }
    
    if (!checkCooldown(interaction.user.id, commandName)) {
        return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิด!')], ephemeral: true });
    }
    
    // 🔍 หาเพลง
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('🔍 กำลังค้นหา...')
                .setDescription(`**${query}**`)
                .setColor(CONFIG.COLOR.WARNING)
                .setImage(ASSETS.SEARCH)
            ]
        });
        
        const results = await searchJoox(query);
        if (results.length === 0) {
            return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง **${query}**`).setColor(CONFIG.COLOR.ERROR)] });
        }
        
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        
        if (result?.status === 'success') {
            const rInfo = result.uploadResult.success ? `✅ \`${result.uploadResult.assetId}\`` : `❌ ${result.uploadResult.error?.slice(0, 100)}`;
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .setImage(ASSETS.SUCCESS)
                    .addFields(
                        { name: '🎵 เพลง', value: truncate(result.song.title, 60), inline: true },
                        { name: '🎤 ศิลปิน', value: truncate(result.song.artist, 50), inline: true },
                        { name: '⏱️ ความยาว', value: fmtDuration(result.song.duration), inline: true },
                        { name: '🟢 Roblox', value: rInfo, inline: false }
                    )
                    .setColor(CONFIG.COLOR.SUCCESS)
                ]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`).setColor(CONFIG.COLOR.ERROR)] });
        }
    }
    
    // 🎤 ศิลปิน
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        const results = await searchJoox(artist);
        
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบ **${artist}**`).setColor(CONFIG.COLOR.ERROR)] });
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle(`⏳ โหลดเพลง ${artist}...`).setDescription(`พบ ${results.length} เพลง`).setColor(CONFIG.COLOR.WARNING)]
        });
        
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
        }
        
        const summary = added.length > 0 ? added.map(s => `> ${s.robloxAssetId ? '🟢' : '🔴'} **${truncate(s.title, 50)}**`).join('\n') : '> ไม่มีเพลงใหม่';
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
    
    // 🔥 เพลงฮิต
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบ')] });
        
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⏳ ดึงเพลงฮิต...').setDescription(`พบ ${results.length} เพลง`).setColor(CONFIG.COLOR.WARNING)] });
        
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
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
    
    // 🚀 เริ่มหาเพลง
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่แล้ว!')] });
        
        const target = options.getString('เป้าหมาย') || CONFIG.AUTO_SEARCH_TARGET;
        
        if (displayChannels.length === 0) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ยังไม่ได้ตั้งค่าช่องแสดง! ใช้ `/ตั้งค่าช่องแสดง` ก่อน').setColor(CONFIG.COLOR.WARNING)] });
        }
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🚀 เริ่มระบบอัตโนมัติ!')
                .setDescription(
                    `🎯 **เป้าหมาย:** ${target}\n` +
                    `⏱️ **รอบละ:** 60 วินาที\n` +
                    `🔄 **อัปเดตช่อง:** ทุก 15 วินาที\n` +
                    `🔔 **แจ้งเตือน:** ${notificationChannelId ? `<#${notificationChannelId}>` : 'ไม่ได้ตั้ง'}\n\n` +
                    `💾 เพลงจะถูกบันทึกอัตโนมัติ`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
                .setImage(ASSETS.LOADING)
            ]
        });
        
        const channel = client.channels.cache.get(displayChannels[0]);
        if (channel) {
            await runAutoSearch(channel, target);
            autoTask = setInterval(async () => {
                const ch = client.channels.cache.get(displayChannels[0]);
                if (ch) await runAutoSearch(ch, target);
            }, CONFIG.AUTO_SEARCH_INTERVAL);
        }
    }
    
    // ⏹️ หยุดหาเพลง
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await saveToCloud();
            await interaction.reply({
                embeds: [replyEmbed
                    .setTitle('⏹️ หยุดระบบอัตโนมัติ')
                    .setDescription(`💾 บันทึกแล้ว\n📊 รอบที่ทำ: ${stats.autoSearchCount}`)
                    .setColor(CONFIG.COLOR.SUCCESS)
                ]
            });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงาน!')] });
        }
    }
    
    // ℹ️ ข้อมูลเพลง
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
                { name: '🟢 Roblox', value: song.robloxAssetId ? `\`${song.robloxAssetId}\`` : '🔴 ยังไม่อัปโหลด', inline: true },
                { name: '📅 เพิ่มเมื่อ', value: song.addedAt ? new Date(song.addedAt).toLocaleString('th-TH') : 'ไม่ระบุ', inline: true }
            );
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        if (song.robloxError) embed.addFields({ name: '⚠️ Error', value: song.robloxError.slice(0, 200), inline: false });
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // 🗑️ ลบเพลง
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            const title = songs[id].title;
            delete songs[id];
            stats.totalSongsRemoved++;
            await saveToCloud();
            lastLibraryHash = '';
            lastDisplayHashes = {};
            await interaction.reply({ embeds: [replyEmbed.setTitle('✅ ลบเพลง').setDescription(`ลบ **${truncate(title, 60)}**`).setColor(CONFIG.COLOR.SUCCESS)] });
            await updateAllChannels();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    // 📤 อัปโหลด
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
            embeds: [new EmbedBuilder()
                .setTitle('📤 เลือกเพลงอัปโหลด')
                .setDescription(`มี **${pending.length}** เพลงรออัปโหลด\nเลือกได้สูงสุด 10 เพลง`)
                .setColor(CONFIG.COLOR.PRIMARY)
                .setImage(ASSETS.UPLOAD)
            ],
            components: [new ActionRowBuilder().addComponents(select)]
        });
    }
    
    // 📤 อัปโหลดทั้งหมด
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        
        await interaction.deferReply();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('⚠️ ยืนยันการอัปโหลดทั้งหมด')
                .setDescription(
                    `จะอัปโหลด **${pending.length}** เพลง\n` +
                    `⏱️ ใช้เวลาประมาณ **${Math.ceil(pending.length * 0.5)} นาที**`
                )
                .setColor(CONFIG.COLOR.WARNING)
                .setImage(ASSETS.WARNING)
            ],
            components: [row]
        });
    }
    
    // 📈 สถิติ
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
                    { name: '👥 ค้นหาผู้ใช้', value: `\`${stats.totalSearchesByUser}\``, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `\`${stats.totalDownloads}\``, inline: true },
                    { name: '📤 อัปโหลด', value: `\`${stats.totalUploads}\``, inline: true },
                    { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '➕ เพิ่มเพลง', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '🗑️ ลบเพลง', value: `\`${stats.totalSongsRemoved}\``, inline: true },
                    { name: '📊 ในคลัง', value: `\`${list.length}\``, inline: true },
                    { name: '🔄 อัปเดตช่อง', value: `\`${stats.totalUpdates}\``, inline: true },
                    { name: '⏱️ อัปไทม์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
                    { name: '🎤 Top 5 ศิลปิน', value: top.map(([a, c]) => `> ${truncate(a, 30)}: **${c}** เพลง`).join('\n') || '> ไม่มี', inline: false }
                )
                .setTimestamp()
            ]
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 24] - COMPONENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleComponents(interaction) {
    // Library browse buttons (PUBLIC)
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
        const buttons = buildLibraryButtons(newPage, pages);
        
        return interaction.update({ embeds: [embed], components: [buttons] });
    }
    
    // Admin only
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    }
    if (isLocked) {
        return interaction.reply({ content: '🔒 บอทถูกล็อกอยู่!', ephemeral: true });
    }
    
    if (interaction.customId === 'admin_stats') {
        const list = Object.values(songs);
        const uploaded = list.filter(s => s.robloxAssetId).length;
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📊 สถิติโดยละเอียด')
                .setColor(CONFIG.COLOR.PRIMARY)
                .setImage(ASSETS.CHART)
                .addFields(
                    { name: '🔍 ค้นหา', value: `\`${stats.totalSearches}\``, inline: true },
                    { name: '👥 ผู้ใช้ค้นหา', value: `\`${stats.totalSearchesByUser}\``, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `\`${stats.totalDownloads}\``, inline: true },
                    { name: '📤 อัปโหลด', value: `\`${stats.totalUploads}\``, inline: true },
                    { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '➕ เพิ่ม', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '🗑️ ลบ', value: `\`${stats.totalSongsRemoved}\``, inline: true },
                    { name: '🎵 ในคลัง', value: `\`${list.length}\``, inline: true },
                    { name: '🟢 นำเข้า', value: `\`${uploaded}\``, inline: true },
                    { name: '🔴 รอ', value: `\`${list.length - uploaded}\``, inline: true },
                    { name: '⏱️ อัปไทม์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: false }
                )
            ],
            ephemeral: true
        });
    }
    
    if (interaction.customId === 'admin_backup') {
        await interaction.deferReply({ ephemeral: true });
        await saveToCloud();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💾 สำรองแล้ว').setDescription(`${Object.keys(songs).length} เพลง`).setColor(CONFIG.COLOR.SUCCESS)] });
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
        const buttons = buildLibraryButtons(currentPage, pages);
        await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
        return;
    }
    
    if (interaction.customId === 'admin_lock') {
        isLocked = !isLocked;
        await saveToCloud();
        const { embed, components } = buildAdminPanel();
        await interaction.update({ embeds: [embed], components });
        return;
    }
    
    if (interaction.customId === 'admin_setup_channels') {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📺 วิธีตั้งค่าช่อง')
                .setDescription(
                    '**ใช้คำสั่งต่อไปนี้:**\n\n' +
                    '`/ตั้งค่าช่องแสดง ช่อง1:#ch1 ช่อง2:#ch2 ช่อง3:#ch3`\n' +
                    '→ ตั้งช่องแสดงเพลง (สูงสุด 3 ช่อง)\n\n' +
                    '`/ตั้งค่าคลังเพลง ช่อง:#library`\n' +
                    '→ ตั้งช่องคลังเพลง (ทุกคนเห็น)\n\n' +
                    '`/ตั้งค่าช่องแจ้งเตือน ช่อง:#notify`\n' +
                    '→ ตั้งช่องแจ้งเตือนเพลงใหม่\n\n' +
                    '`/ตั้งค่าช่องค้นหา ช่อง:#search`\n' +
                    '→ ตั้งช่องค้นหา (พิมพ์ชื่อเพลงในช่องนี้)'
                )
                .setColor(CONFIG.COLOR.INFO)
            ],
            ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'admin_clear') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_clear_all').setLabel('✅ ยืนยันลบทั้งหมด').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_clear_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยัน').setDescription(`ลบ **${Object.keys(songs).length}** เพลง`).setColor(CONFIG.COLOR.ERROR)],
            components: [row],
            ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'confirm_clear_all') {
        const count = Object.keys(songs).length;
        songs = {};
        stats.totalSongsRemoved += count;
        await saveToCloud();
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
            components: [row],
            ephemeral: true
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
                    .setTitle(`📤 กำลังอัปโหลดทั้งหมด ${i+1}/${pending.length}`)
                    .setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i, pending.length)}`)
                    .setColor(CONFIG.COLOR.INFO)
                    .setImage(ASSETS.UPLOAD)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
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
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดทั้งหมดเสร็จสิ้น!')
                .setImage(ASSETS.SUCCESS)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `\`${ok}\``, inline: true },
                    { name: '🔴 ล้มเหลว', value: `\`${fail}\``, inline: true }
                )
                .setColor(CONFIG.COLOR.SUCCESS)
            ],
            components: []
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
                    .setColor(CONFIG.COLOR.INFO)
                    .setImage(ASSETS.UPLOAD)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
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
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดเสร็จสิ้น!')
                .setImage(ASSETS.SUCCESS)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `\`${ok}\``, inline: true },
                    { name: '🔴 ล้มเหลว', value: `\`${fail}\``, inline: true }
                )
                .setColor(CONFIG.COLOR.SUCCESS)
            ],
            components: []
        });
        return;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 25] - ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

function buildAdminPanel() {
    const songList = Object.values(songs);
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    const embed = new EmbedBuilder()
        .setTitle('🎛️ แผงควบคุมผู้ดูแล')
        .setDescription(
            '**จัดการบอท Karaoke**\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '> เลือกปุ่มด้านล่างเพื่อดำเนินการ'
        )
        .addFields(
            { name: '🔒 สถานะ', value: isLocked ? '`🔒 ล็อก`' : '`🔓 ปลดล็อก`', inline: true },
            { name: '⏱️ ออนไลน์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
            { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? '`✅ Cloud`' : '`⚠️ Local`', inline: true },
            { name: '📂 เพลงทั้งหมด', value: `\`${songList.length}\``, inline: true },
            { name: '🟢 นำเข้าแล้ว', value: `\`${uploaded}\``, inline: true },
            { name: '🔴 รอนำเข้า', value: `\`${pending}\``, inline: true },
            { name: '📺 ช่องแสดง', value: `\`${displayChannels.length}\``, inline: true },
            { name: '📚 คลังเพลง', value: libraryChannelId ? '`✅ ตั้งค่า`' : '`❌ ไม่ได้ตั้ง`', inline: true },
            { name: '🔔 แจ้งเตือน', value: notificationChannelId ? '`✅ ตั้งค่า`' : '`❌ ไม่ได้ตั้ง`', inline: true },
            { name: '🔍 ช่องค้นหา', value: searchChannelId ? '`✅ ตั้งค่า`' : '`❌ ไม่ได้ตั้ง`', inline: true },
            { name: '🔄 อัปเดตทั้งหมด', value: `\`${stats.totalUpdates}\` ครั้ง`, inline: true }
        )
        .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
        .setFooter({ text: '🎛️ Admin Panel v7.0 - Auto-Update Edition' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_stats').setLabel('สถิติ').setStyle(ButtonStyle.Primary).setEmoji('📊'),
        new ButtonBuilder().setCustomId('admin_backup').setLabel('สำรอง').setStyle(ButtonStyle.Success).setEmoji('💾'),
        new ButtonBuilder().setCustomId('admin_refresh').setLabel('รีเฟรช').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('admin_browse').setLabel('ดูคลัง').setStyle(ButtonStyle.Secondary).setEmoji('📚')
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_lock')
            .setLabel(isLocked ? 'ปลดล็อก' : 'ล็อก')
            .setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(isLocked ? '🔓' : '🔒'),
        new ButtonBuilder().setCustomId('admin_upload_all').setLabel('อัปโหลดทั้งหมด').setStyle(ButtonStyle.Primary).setEmoji('📤'),
        new ButtonBuilder().setCustomId('admin_setup_channels').setLabel('วิธีตั้งค่า').setStyle(ButtonStyle.Secondary).setEmoji('📺'),
        new ButtonBuilder().setCustomId('admin_clear').setLabel('ล้างทั้งหมด').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    
    return { embed, components: [row1, row2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 26] - LOGIN
// ═══════════════════════════════════════════════════════════════════════════

client.login(CONFIG.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════════════════════
// END OF FILE - v7.0 Auto-Update Edition
// Total: 3000+ lines
// ═══════════════════════════════════════════════════════════════════════════
