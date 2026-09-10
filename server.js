// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                                                                          ║
// ║   ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗              ║
// ║   ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝              ║
// ║   █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗                ║
// ║   ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝                ║
// ║   ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗              ║
// ║   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝              ║
// ║                                                                          ║
// ║   ULTIMATE EDITION v5.0 - 2000+ LINES PREMIUM KARAOKE BOT               ║
// ║                                                                          ║
// ║   ✨ Features:                                                            ║
// ║   • 🔒 Lock/Unlock System with Admin Only                                ║
// ║   • ☁️  JSONBin.io Persistent Storage                                    ║
// ║   • 📊 Live Progress Bar (Real-time Update)                              ║
// ║   • 🔄 3-Layer Fallback Download                                         ║
// ║   • 📚 Song Library with Pagination & Search                             ║
// ║   • 🎛️  Admin Control Panel                                              ║
// ║   • 📤 Selective Upload to Roblox                                        ║
// ║   • 📈 Statistics & Analytics                                            ║
// ║   • 🛡️  Content Filter                                                   ║
// ║   • ⏱️  Rate Limiting                                                    ║
// ║   • 🎨 Beautiful Premium UI                                              ║
// ║                                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 01] - IMPORTS & DEPENDENCIES
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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
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
    MAX_SONGS_PER_PAGE: 10,
    RATE_LIMIT_MS: 5000,
    UNLOCK_RATE_MS: 10000,
    
    // Auto-Search
    AUTO_SEARCH_INTERVAL: 60000,
    AUTO_SEARCH_TARGET: 'เพลงไทย',
    
    // UI
    COLOR_PRIMARY: 0x5865F2,
    COLOR_SUCCESS: 0x57F287,
    COLOR_WARNING: 0xFEE75C,
    COLOR_ERROR: 0xED4245,
    COLOR_INFO: 0x3498DB,
    COLOR_DARK: 0x2B2D31,
    COLOR_BLACK: 0x000000,
    COLOR_GOLD: 0xF1C40F
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 03] - GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;
let saveTask = null;
let isLocked = true;
let unlockAttempts = new Map();
let commandCooldowns = new Map();

// Message IDs สำหรับ Edit แทนการสร้างใหม่
let messageIds = {
    songList: null,
    autoProgress: null,
    browse: null,
    adminPanel: null
};

// ข้อมูลการค้นหาล่าสุด
let lastSearchResults = [];
let browsePage = 0;

// สถิติ
let stats = {
    totalSearches: 0,
    totalDownloads: 0,
    totalUploads: 0,
    totalFailures: 0,
    totalSongsAdded: 0,
    totalSongsRemoved: 0,
    startTime: Date.now(),
    lastAutoSearch: null,
    autoSearchCount: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 04] - EXPRESS SERVER
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'offline',
        locked: isLocked,
        songs: Object.keys(songs).length,
        storage: CONFIG.JSONBIN_ID ? 'JSONBin.io' : 'Local',
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/stats', (req, res) => {
    res.json({
        ...stats,
        songCount: Object.keys(songs).length,
        locked: isLocked
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`\n✅ Web server running on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 05] - DISCORD CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 06] - PERSISTENT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_BACKUP = '/tmp/backup.json';

async function loadFromCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        console.log('⚠️ ไม่ได้ตั้งค่า JSONBin - ใช้ Local Storage');
        loadFromLocal();
        return;
    }
    
    try {
        console.log('☁️ กำลังโหลดข้อมูลจาก JSONBin...');
        const res = await axios.get(
            `${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}/latest`,
            {
                headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY },
                timeout: 30000
            }
        );
        
        const data = res.data.record || res.data;
        
        if (data.songs) songs = data.songs;
        if (data.channelId) songChannelId = data.channelId;
        if (data.isLocked !== undefined) isLocked = data.isLocked;
        if (data.stats) {
            stats.totalSearches = data.stats.totalSearches || 0;
            stats.totalDownloads = data.stats.totalDownloads || 0;
            stats.totalUploads = data.stats.totalUploads || 0;
            stats.totalFailures = data.stats.totalFailures || 0;
            stats.totalSongsAdded = data.stats.totalSongsAdded || 0;
            stats.totalSongsRemoved = data.stats.totalSongsRemoved || 0;
        }
        if (data.messageIds) {
            messageIds.songList = data.messageIds.songList || null;
            messageIds.adminPanel = data.messageIds.adminPanel || null;
        }
        
        console.log(`✅ โหลดสำเร็จ: ${Object.keys(songs).length} เพลง`);
        saveToLocal();
    } catch (error) {
        console.error('❌ Cloud load error:', error.message);
        loadFromLocal();
    }
}

async function saveToCloud() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        saveToLocal();
        return;
    }
    
    try {
        const data = {
            songs,
            channelId: songChannelId,
            isLocked,
            stats: {
                totalSearches: stats.totalSearches,
                totalDownloads: stats.totalDownloads,
                totalUploads: stats.totalUploads,
                totalFailures: stats.totalFailures,
                totalSongsAdded: stats.totalSongsAdded,
                totalSongsRemoved: stats.totalSongsRemoved
            },
            messageIds: {
                songList: messageIds.songList,
                adminPanel: messageIds.adminPanel
            },
            lastUpdate: new Date().toISOString()
        };
        
        await axios.put(
            `${CONFIG.JSONBIN_URL}/${CONFIG.JSONBIN_ID}`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.JSONBIN_KEY
                },
                timeout: 30000
            }
        );
        
        saveToLocal();
    } catch (error) {
        console.error('❌ Cloud save error:', error.message);
        saveToLocal();
    }
}

function saveToLocal() {
    try {
        fs.writeFileSync(
            LOCAL_BACKUP,
            JSON.stringify({ songs, channelId: songChannelId, isLocked }),
            'utf8'
        );
    } catch (e) {}
}

function loadFromLocal() {
    try {
        if (fs.existsSync(LOCAL_BACKUP)) {
            const data = JSON.parse(fs.readFileSync(LOCAL_BACKUP, 'utf8'));
            if (data.songs) songs = data.songs;
            if (data.channelId) songChannelId = data.channelId;
            if (data.isLocked !== undefined) isLocked = data.isLocked;
            console.log(`📂 Local backup: ${Object.keys(songs).length} เพลง`);
        }
    } catch (e) {}
}

function startAutoSave() {
    if (saveTask) clearInterval(saveTask);
    saveTask = setInterval(async () => {
        if (Object.keys(songs).length > 0 || songChannelId) {
            await saveToCloud();
        }
    }, 30000);
    console.log('💾 Auto-save enabled (30s interval)');
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 07] - SECURITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function verifyKey(inputKey) {
    if (!inputKey) return false;
    try {
        const a = Buffer.from(inputKey.padEnd(64, '0'));
        const b = Buffer.from(CONFIG.UNLOCK_KEY.padEnd(64, '0'));
        return crypto.timingSafeEqual(a, b) && inputKey === CONFIG.UNLOCK_KEY;
    } catch {
        return false;
    }
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
        return { allowed: false, reason: '❌ คำสั่งนี้ใช้ได้เฉพาะผู้ดูแลเซิร์ฟเวอร์ (Admin) เท่านั้น!' };
    }
    if (isLocked && !['unlock', 'status', 'help'].includes(interaction.commandName)) {
        return { allowed: false, reason: '🔒 **บอทถูกล็อกอยู่!**\nกรุณาใช้ `/unlock` พร้อม Key เพื่อปลดล็อก' };
    }
    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 08] - CONTENT FILTER
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "โง่", "ควาย", "ห่า", "แม่ง", "อีดอก",
    "xxx", "porn", "sex", "18+", "หนังโป๊", "ลามก", "อนาจาร", "โป๊",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "ปฏิวัติ", "ล้มเจ้า",
    "บูลลี่", "bully", "เหยียด", "ชาติพันธุ์", "เหยียดผิว",
    "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน", "ทำร้าย", "ยาเสพติด"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 09] - UTILITY FUNCTIONS
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
    if (total === 0) return `[${'░'.repeat(length)}] 0%`;
    const pct = Math.min(Math.round((current / total) * 100), 100);
    const filled = Math.round((pct / 100) * length);
    return `[${'█'.repeat(filled)}${'░'.repeat(length - filled)}] ${pct}%`;
}

function statusEmoji(status) {
    const map = {
        pending: '⏳',
        downloading: '⬇️',
        uploading: '⬆️',
        success: '✅',
        failed: '❌',
        skipped: '⏭️',
        banned: '⛔'
    };
    return map[status] || '❓';
}

function truncate(str, len = 50) {
    if (!str) return 'Unknown';
    return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 10] - JOOX SEARCH
// ═══════════════════════════════════════════════════════════════════════════

async function searchJoox(query) {
    try {
        console.log(`🔍 Searching JOOX: "${query}"`);
        stats.totalSearches++;
        
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, {
            params: { q: query, type: 'song', sources: 'joox' },
            timeout: 90000
        });
        
        const list = res.data?.data?.songs || [];
        console.log(`✅ Found ${list.length} songs`);
        return list;
    } catch (e) {
        console.error(`❌ Search error: ${e.message}`);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 11] - GET DIRECT URL (Layer 1)
// ═══════════════════════════════════════════════════════════════════════════

async function getDirectUrl(songId, source = 'joox') {
    try {
        const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/url`, {
            params: { id: songId, source },
            timeout: 60000
        });
        return res.data?.url || res.data?.data?.url || res.data?.link || null;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 12] - DOWNLOAD VIA STREAM (Layer 2)
// ═══════════════════════════════════════════════════════════════════════════

async function downloadViaStream(songId, source = 'joox') {
    try {
        const url = `${CONFIG.MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(songId)}&source=${source}`;
        
        const res = await axios.get(url, {
            responseType: 'stream',
            timeout: CONFIG.DOWNLOAD_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'audio/*,*/*'
            }
        });
        
        const ct = res.headers['content-type'] || '';
        if (!ct.includes('audio') && !ct.includes('octet-stream')) {
            return null;
        }
        return res.data;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 13] - SWITCH SOURCE (Layer 3)
// ═══════════════════════════════════════════════════════════════════════════

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
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 14] - DOWNLOAD AUDIO (3-LAYER FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════

async function downloadAudio(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    console.log(`⬇️ Downloading: ${songName}`);
    
    // Layer 1: Direct URL
    try {
        const directUrl = await getDirectUrl(songId, source);
        if (directUrl) {
            const res = await axios.get(directUrl, {
                responseType: 'stream',
                timeout: CONFIG.DOWNLOAD_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://www.joox.com/'
                }
            });
            const writer = fs.createWriteStream(tempPath);
            res.data.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            
            if (fs.statSync(tempPath).size > 1024) {
                console.log(`✅ Layer 1 success`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    // Layer 2: Stream Proxy
    try {
        const stream = await downloadViaStream(songId, source);
        if (stream) {
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            
            if (fs.statSync(tempPath).size > 1024) {
                console.log(`✅ Layer 2 success`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    // Layer 3: Switch Source
    try {
        const sw = await switchSource(songId, songName, artist, source);
        if (sw?.type === 'id') {
            const stream = await downloadViaStream(sw.id, sw.source);
            if (stream) {
                const writer = fs.createWriteStream(tempPath);
                stream.pipe(writer);
                await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
                
                if (fs.statSync(tempPath).size > 1024) {
                    console.log(`✅ Layer 3 success`);
                    stats.totalDownloads++;
                    return tempPath;
                }
                fs.unlinkSync(tempPath);
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
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    console.log(`❌ All layers failed`);
    stats.totalFailures++;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 15] - ROBLOX UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

async function uploadToRoblox(filePath, title, artist) {
    if (!CONFIG.ROBLOX_API_KEY || !CONFIG.ROBLOX_USER_ID) {
        return { success: false, error: 'ไม่ได้ตั้งค่า ROBLOX API' };
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
            creationContext: {
                creator: { userId: parseInt(CONFIG.ROBLOX_USER_ID) }
            }
        }), { contentType: 'application/json' });
        
        form.append('fileContent', buf, {
            filename: path.basename(filePath),
            contentType: 'audio/mpeg'
        });
        
        const res = await axios.post(CONFIG.ROBLOX_API_URL, form, {
            headers: {
                'x-api-key': CONFIG.ROBLOX_API_KEY,
                ...form.getHeaders()
            },
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
        const msg = e.response?.data
            ? JSON.stringify(e.response.data).slice(0, 200)
            : e.message;
        return { success: false, error: msg };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 16] - PROCESS SONG (LIVE PROGRESS)
// ═══════════════════════════════════════════════════════════════════════════

async function processSong(song, interaction = null, index = 0, total = 1, useMessageId = false) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    
    console.log(`🎵 [${index+1}/${total}] ${title}`);
    
    if (songs[songId]) {
        return { status: 'skipped', reason: 'มีอยู่แล้ว' };
    }
    if (isBanned(title, artist)) {
        return { status: 'banned', reason: 'ถูกคัดกรอง' };
    }
    
    try {
        // แสดงสถานะ: กำลังดาวน์โหลด
        if (interaction) {
            const embed = new EmbedBuilder()
                .setTitle(`⬇️ กำลังดาวน์โหลด ${index+1}/${total}`)
                .setDescription(
                    `🎵 **${truncate(title, 60)}**\n` +
                    `🎤 ${truncate(artist, 50)}\n\n` +
                    `${progressBar(index, total)}\n` +
                    `📊 **สถานะ:** ดาวน์โหลด MP3...`
                )
                .setColor(CONFIG.COLOR_WARNING)
                .setThumbnail(song.cover || null)
                .setFooter({ text: `เพลง ${index+1} จาก ${total}` });
            
            if (useMessageId && interaction.editReply) {
                await interaction.editReply({ embeds: [embed] }).catch(() => {});
            } else {
                await interaction.editReply({ embeds: [embed] }).catch(() => {});
            }
        }
        
        // ดาวน์โหลด
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        if (!audioPath) {
            return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        }
        
        // แสดงสถานะ: กำลังอัปโหลด
        if (interaction) {
            const embed = new EmbedBuilder()
                .setTitle(`⬆️ กำลังอัปโหลด ${index+1}/${total}`)
                .setDescription(
                    `🎵 **${truncate(title, 60)}**\n` +
                    `🎤 ${truncate(artist, 50)}\n\n` +
                    `${progressBar(index + 0.5, total)}\n` +
                    `📊 **สถานะ:** อัปโหลดขึ้น Roblox...`
                )
                .setColor(CONFIG.COLOR_INFO)
                .setThumbnail(song.cover || null)
                .setFooter({ text: `เพลง ${index+1} จาก ${total}` });
            
            await interaction.editReply({ embeds: [embed] }).catch(() => {});
        }
        
        // อัปโหลด
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        // บันทึก
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
        await saveToCloud();
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        await refreshMessage();
        
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (e) {
        console.error(`❌ Process error: ${e.message}`);
        return { status: 'failed', reason: e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 17] - REFRESH MESSAGE (EDIT INSTEAD OF NEW)
// ═══════════════════════════════════════════════════════════════════════════

async function refreshMessage() {
    if (!songChannelId) return;
    
    try {
        const channel = client.channels.cache.get(songChannelId);
        if (!channel) return;
        
        const songList = Object.values(songs);
        
        // สร้าง Embed
        let embed;
        
        if (songList.length === 0) {
            embed = new EmbedBuilder()
                .setTitle('🎤 รายการเพลง Karaoke')
                .setDescription('*ยังไม่มีเพลงในคลัง*\n\nใช้ `/หาเพลง` หรือ `/เริ่มหาเพลง` เพื่อเพิ่มเพลง')
                .setColor(CONFIG.COLOR_BLACK)
                .setFooter({ text: `อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });
        } else {
            const chunk = songList.slice(0, CONFIG.MAX_SONGS_PER_PAGE);
            const uploaded = songList.filter(s => s.robloxAssetId).length;
            
            embed = new EmbedBuilder()
                .setTitle('🎤 รายการเพลง Karaoke')
                .setColor(CONFIG.COLOR_BLACK)
                .setFooter({ 
                    text: `รวม ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${songList.length - uploaded} · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}`
                });
            
            let desc = '';
            chunk.forEach((s, i) => {
                const r = s.robloxAssetId ? `🟢 \`${s.robloxAssetId}\`` : '🔴 รออัปโหลด';
                const dur = fmtDuration(s.duration);
                desc += `**${i+1}. ${truncate(s.title, 50)}**\n`;
                desc += `　🎤 ${truncate(s.artist, 40)} · ⏱️ ${dur}\n`;
                desc += `　${r}\n\n`;
            });
            
            if (songList.length > CONFIG.MAX_SONGS_PER_PAGE) {
                desc += `\n*...และอีก ${songList.length - CONFIG.MAX_SONGS_PER_PAGE} เพลง*\n`;
                desc += `*ใช้ \`/คลังเพลง\` เพื่อดูทั้งหมด*`;
            }
            
            embed.setDescription(desc);
        }
        
        // พยายาม Edit ข้อความเก่า
        if (messageIds.songList) {
            try {
                const msg = await channel.messages.fetch(messageIds.songList);
                await msg.edit({ embeds: [embed] });
                return;
            } catch (e) {
                // ข้อความถูกลบ → สร้างใหม่
                messageIds.songList = null;
            }
        }
        
        // สร้างข้อความใหม่
        const msg = await channel.send({ embeds: [embed] });
        messageIds.songList = msg.id;
    } catch (e) {
        console.error('❌ Refresh error:', e.message);
    }
}

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (songChannelId && !isLocked) {
            await refreshMessage();
        }
    }, 30000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 18] - BUILD SONG BROWSE EMBED (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function buildBrowseEmbed(page = 0, filter = null) {
    let songList = Object.values(songs);
    
    // กรองตามคำค้น
    if (filter) {
        const lower = filter.toLowerCase();
        songList = songList.filter(s => 
            s.title.toLowerCase().includes(lower) ||
            s.artist.toLowerCase().includes(lower)
        );
    }
    
    if (songList.length === 0) {
        return {
            embed: new EmbedBuilder()
                .setTitle('📚 คลังเพลงทั้งหมด')
                .setDescription(filter ? `*ไม่พบเพลงที่ตรงกับ "${filter}"*` : '*ยังไม่มีเพลงในคลัง*')
                .setColor(CONFIG.COLOR_BLACK),
            pages: 0
        };
    }
    
    // เรียงตามชื่อ
    songList.sort((a, b) => a.title.localeCompare(b.title));
    
    const totalPages = Math.ceil(songList.length / CONFIG.MAX_SONGS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * CONFIG.MAX_SONGS_PER_PAGE;
    const chunk = songList.slice(start, start + CONFIG.MAX_SONGS_PER_PAGE);
    
    const embed = new EmbedBuilder()
        .setTitle('📚 คลังเพลงทั้งหมด')
        .setColor(CONFIG.COLOR_PRIMARY)
        .setFooter({ 
            text: `หน้า ${currentPage + 1}/${totalPages} · รวม ${songList.length} เพลง${filter ? ` · ค้นหา: "${filter}"` : ''}`
        });
    
    let desc = '';
    chunk.forEach((s, i) => {
        const num = start + i + 1;
        const r = s.robloxAssetId ? `🟢` : `🔴`;
        const dur = fmtDuration(s.duration);
        desc += `**${num}. ${truncate(s.title, 55)}**\n`;
        desc += `　🎤 ${truncate(s.artist, 45)}\n`;
        desc += `　⏱️ ${dur} · ${r} · \`${s.id.slice(0, 8)}...\`\n\n`;
    });
    
    embed.setDescription(desc);
    
    return { embed, pages: totalPages, currentPage, filter };
}

function buildBrowseButtons(currentPage, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('browse_first')
            .setLabel('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('browse_prev')
            .setLabel('◀️ ก่อน')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('browse_page')
            .setLabel(`หน้า ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('browse_next')
            .setLabel('ถัดไป ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages - 1),
        new ButtonBuilder()
            .setCustomId('browse_last')
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 19] - AUTO SEARCH WITH LIVE PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

async function runAutoSearch(channel, target = CONFIG.AUTO_SEARCH_TARGET) {
    if (isLocked) return;
    
    try {
        console.log(`\n🤖 Auto-search: ${target}`);
        stats.autoSearchCount++;
        stats.lastAutoSearch = new Date().toISOString();
        
        // ส่ง/แก้ไขข้อความ Progress
        const startEmbed = new EmbedBuilder()
            .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
            .setDescription(
                `🎯 **เป้าหมาย:** ${target}\n` +
                `⏱️ **เริ่มเมื่อ:** ${new Date().toLocaleTimeString('th-TH')}\n\n` +
                `${progressBar(0, 1)}\n` +
                `📊 **สถานะ:** กำลังค้นหา...`
            )
            .setColor(CONFIG.COLOR_WARNING)
            .setFooter({ text: `รอบที่ ${stats.autoSearchCount}` });
        
        let progressMsg;
        
        // ลบข้อความเก่าและสร้างใหม่
        if (messageIds.autoProgress) {
            try {
                const old = await channel.messages.fetch(messageIds.autoProgress);
                await old.edit({ embeds: [startEmbed] });
                progressMsg = old;
            } catch {
                progressMsg = await channel.send({ embeds: [startEmbed] });
                messageIds.autoProgress = progressMsg.id;
            }
        } else {
            progressMsg = await channel.send({ embeds: [startEmbed] });
            messageIds.autoProgress = progressMsg.id;
        }
        
        // ค้นหา
        const results = await searchJoox(target);
        
        if (results.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('⏭️ ไม่พบเพลง')
                .setDescription(`ไม่พบเพลงจากคำค้น: **${target}**\n🔄 จะลองใหม่ใน 60 วินาที`)
                .setColor(CONFIG.COLOR_WARNING)
                .setFooter({ text: `รอบที่ ${stats.autoSearchCount}` });
            
            await progressMsg.edit({ embeds: [embed] });
            return;
        }
        
        // อัปเดตว่าพบเพลงแล้ว
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(`🔍 พบ ${results.length} เพลง`)
                .setDescription(
                    `🎯 **เป้าหมาย:** ${target}\n` +
                    `📊 **สถานะ:** เริ่มดาวน์โหลด...\n\n` +
                    `${progressBar(0, results.length)}`
                )
                .setColor(CONFIG.COLOR_INFO)
                .setFooter({ text: `รอบที่ ${stats.autoSearchCount}` })
            ]
        });
        
        // วนหาทีละเพลง
        for (let i = 0; i < results.length; i++) {
            const song = results[i];
            const r = await processSong(song, progressMsg, i, results.length, true);
            
            if (r.status === 'success') {
                const uploadInfo = r.uploadResult.success
                    ? `🟢 \`${r.uploadResult.assetId}\``
                    : `🔴 ${r.uploadResult.error?.slice(0, 50) || 'failed'}`;
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                    .setDescription(
                        `🎵 **${truncate(r.song.title, 60)}**\n` +
                        `🎤 ${truncate(r.song.artist, 50)}\n\n` +
                        `${progressBar(i + 1, results.length)}\n\n` +
                        `🟢 **Roblox:** ${uploadInfo}\n` +
                        `📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง\n\n` +
                        `🔄 จะหาใหม่ใน **60 วินาที**`
                    )
                    .setColor(CONFIG.COLOR_SUCCESS)
                    .setThumbnail(r.song.thumbnail)
                    .setFooter({ text: `รอบที่ ${stats.autoSearchCount}` });
                
                await progressMsg.edit({ embeds: [successEmbed] });
                return;
            }
        }
        
        // ไม่มีเพลงใหม่
        const noNewEmbed = new EmbedBuilder()
            .setTitle('⏭️ ไม่มีเพลงใหม่ในรอบนี้')
            .setDescription(
                `ลอง **${results.length}** เพลง แต่ซ้ำ/ถูกข้ามทั้งหมด\n\n` +
                `🔄 จะหาใหม่ใน **60 วินาที**`
            )
            .setColor(CONFIG.COLOR_WARNING)
            .setFooter({ text: `รอบที่ ${stats.autoSearchCount}` });
        
        await progressMsg.edit({ embeds: [noNewEmbed] });
        
    } catch (e) {
        console.error('❌ Auto search error:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 20] - ADMIN PANEL (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function buildAdminPanel() {
    const songList = Object.values(songs);
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    
    const embed = new EmbedBuilder()
        .setTitle('🎛️ แผงควบคุมผู้ดูแล')
        .setDescription(
            '**ยินดีต้อนรับสู่แผงควบคุม**\n' +
            'เลือกปุ่มด้านล่างเพื่อจัดการบอท'
        )
        .addFields(
            { name: '🔒 สถานะ', value: isLocked ? '🔒 ล็อก' : '🔓 ปลดล็อก', inline: true },
            { name: '⏱️ ออนไลน์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
            { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? 'Cloud ✅' : 'Local ⚠️', inline: true },
            { name: '📂 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
            { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
            { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true },
            { name: '🔍 ค้นหาทั้งหมด', value: `${stats.totalSearches}`, inline: true },
            { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
            { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true }
        )
        .setColor(isLocked ? CONFIG.COLOR_ERROR : CONFIG.COLOR_SUCCESS)
        .setFooter({ text: 'Admin Panel v5.0' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_stats')
            .setLabel('📊 สถิติ')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_backup')
            .setLabel('💾 สำรอง')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('admin_refresh')
            .setLabel('🔄 รีเฟรช')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admin_browse')
            .setLabel('📚 ดูคลัง')
            .setStyle(ButtonStyle.Secondary)
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_lock')
            .setLabel(isLocked ? '🔓 ปลดล็อก' : '🔒 ล็อก')
            .setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('admin_upload_all')
            .setLabel('📤 อัปโหลดทั้งหมด')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_clear')
            .setLabel('🗑️ ล้างทั้งหมด')
            .setStyle(ButtonStyle.Danger)
    );
    
    return { embed, components: [row1, row2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 21] - BOT READY
// ═══════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะเริ่มต้น: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลงในคลัง: ${Object.keys(songs).length}`);
    console.log(`☁️ Storage: ${CONFIG.JSONBIN_ID ? 'JSONBin.io' : 'Local'}`);
    console.log(`🔗 API: ${CONFIG.MUSIC_API_URL}`);
    console.log('═'.repeat(70) + '\n');
    
    // โหลดข้อมูลจาก Cloud
    await loadFromCloud();
    
    // เริ่ม Tasks
    startAutoRefresh();
    startAutoSave();
    
    // ลงทะเบียนคำสั่ง
    const commands = [
        new SlashCommandBuilder()
            .setName('unlock')
            .setDescription('🔓 ปลดล็อกบอทด้วย Key')
            .addStringOption(o => o
                .setName('key')
                .setDescription('รหัสปลดล็อก')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('lock')
            .setDescription('🔒 ล็อกบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('🎛️ เปิดแผงควบคุมผู้ดูแล')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('📊 ดูสถานะบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('📖 ดูคำสั่งทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่า')
            .setDescription('⚙️ ตั้งค่าช่องแสดงเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ทดสอบ')
            .setDescription('🧪 ทดสอบการเชื่อมต่อ JOOX API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หาเพลง')
            .setDescription('🔍 ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o
                .setName('ชื่อเพลง')
                .setDescription('ชื่อเพลง/ศิลปิน')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ศิลปิน')
            .setDescription('🎤 ดึงเพลงศิลปินทั้งหมด')
            .addStringOption(o => o
                .setName('ชื่อศิลปิน')
                .setDescription('ชื่อศิลปิน')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เพลงฮิต')
            .setDescription('🔥 ดึงเพลงยอดนิยม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เริ่มหาเพลง')
            .setDescription('🚀 เริ่มระบบหาเพลงอัตโนมัติ')
            .addStringOption(o => o
                .setName('เป้าหมาย')
                .setDescription('คำค้นหา (ค่าเริ่มต้น: เพลงไทย)')
                .setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หยุดหาเพลง')
            .setDescription('⏹️ หยุดระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ลบเพลง')
            .setDescription('🗑️ ลบเพลงออกจากระบบ')
            .addStringOption(o => o
                .setName('id')
                .setDescription('ID ของเพลง')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('คลังเพลง')
            .setDescription('📚 ดูคลังเพลงทั้งหมด (แบ่งหน้า)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ค้นหา')
            .setDescription('🔎 ค้นหาเพลงในคลัง')
            .addStringOption(o => o
                .setName('คำค้น')
                .setDescription('คำค้นหา')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สุ่มเพลง')
            .setDescription('🎲 สุ่มเพลงจากคลัง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปโหลด')
            .setDescription('📤 เลือกเพลงอัปโหลดขึ้น Roblox')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปโหลดทั้งหมด')
            .setDescription('📤 อัปโหลดทุกเพลงที่ยังไม่ได้อัปโหลด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สถิติ')
            .setDescription('📈 ดูสถิติการใช้งาน')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สำรองข้อมูล')
            .setDescription('💾 สำรองข้อมูลขึ้น Cloud ทันที')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ข้อมูลเพลง')
            .setDescription('ℹ️ ดูข้อมูลเพลงแบบละเอียด')
            .addStringOption(o => o
                .setName('id')
                .setDescription('ID เพลง')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) {
        console.error('❌ Register error:', e.message);
    }
    
    await refreshMessage();
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 22] - INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    // Components
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(CONFIG.COLOR_BLACK);
    
    // ═════════════════════════════════════════════════════════════════════
    // UNLOCK
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!').setColor(CONFIG.COLOR_ERROR)],
                ephemeral: true
            });
        }
        if (!checkUnlockRateLimit(interaction.user.id)) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('⏱️ รอ 10 วินาทีก่อนลองใหม่!').setColor(CONFIG.COLOR_WARNING)],
                ephemeral: true
            });
        }
        
        const key = options.getString('key');
        
        if (verifyKey(key)) {
            isLocked = false;
            await saveToCloud();
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🔓 ปลดล็อกสำเร็จ!')
                    .setDescription('บอทพร้อมใช้งานแล้ว!\nใช้ `/panel` เพื่อเปิดแผงควบคุม')
                    .setColor(CONFIG.COLOR_SUCCESS)
                ],
                ephemeral: true
            });
        } else {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Key ไม่ถูกต้อง!')
                    .setDescription('กรุณาตรวจสอบ Key แล้วลองใหม่')
                    .setColor(CONFIG.COLOR_ERROR)
                ],
                ephemeral: true
            });
        }
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // LOCK
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        isLocked = true;
        await saveToCloud();
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔒 ล็อกบอทแล้ว!')
                .setDescription('ใช้ `/unlock` พร้อม Key เพื่อปลดล็อก')
                .setColor(CONFIG.COLOR_WARNING)
            ]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // PANEL
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'panel') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        const { embed, components } = buildAdminPanel();
        return interaction.reply({ embeds: [embed], components });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // STATUS
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'status') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📊 สถานะบอท')
                .addFields(
                    { name: '🔒 สถานะ', value: isLocked ? '🔒 ล็อก' : '🔓 ปลดล็อก', inline: true },
                    { name: '⏱️ ออนไลน์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '☁️ Storage', value: CONFIG.JSONBIN_ID ? 'Cloud ✅' : 'Local ⚠️', inline: true },
                    { name: '📂 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true },
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true }
                )
                .setColor(isLocked ? CONFIG.COLOR_ERROR : CONFIG.COLOR_SUCCESS)
                .setTimestamp()
            ]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // HELP
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'help') {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📖 คำสั่งทั้งหมด')
                .setColor(CONFIG.COLOR_PRIMARY)
                .addFields(
                    { name: '🔒 ความปลอดภัย', value: '`/unlock` `/lock` `/status` `/panel`', inline: false },
                    { name: '⚙️ ตั้งค่า', value: '`/ตั้งค่า` `/ทดสอบ`', inline: false },
                    { name: '🔍 ค้นหาเพลง', value: '`/หาเพลง` `/ศิลปิน` `/เพลงฮิต`', inline: false },
                    { name: '🚀 อัตโนมัติ', value: '`/เริ่มหาเพลง` `/หยุดหาเพลง`', inline: false },
                    { name: '📚 จัดการคลัง', value: '`/คลังเพลง` `/ค้นหา` `/ข้อมูลเพลง` `/ลบเพลง` `/สุ่มเพลง`', inline: false },
                    { name: '📤 อัปโหลด', value: '`/อัปโหลด` `/อัปโหลดทั้งหมด`', inline: false },
                    { name: '📊 ข้อมูล', value: '`/สถิติ` `/สำรองข้อมูล`', inline: false }
                )
                .setFooter({ text: 'Karaoke Bot v5.0 - Ultimate Edition' })
                .setTimestamp()
            ],
            ephemeral: true
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // สำรองข้อมูล
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'สำรองข้อมูล') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        await saveToCloud();
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('💾 สำรองข้อมูลสำเร็จ!')
                .setDescription(`☁️ บันทึก ${Object.keys(songs).length} เพลงขึ้น Cloud เรียบร้อย`)
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
    }
    
    // ตรวจสอบสิทธิ์
    const access = checkAccess(interaction);
    if (!access.allowed) {
        return interaction.reply({
            embeds: [replyEmbed.setDescription(access.reason).setColor(CONFIG.COLOR_ERROR)],
            ephemeral: true
        });
    }
    
    // ตรวจสอบ Cooldown
    if (!checkCooldown(interaction.user.id, commandName)) {
        return interaction.reply({
            embeds: [replyEmbed.setDescription('⏱️ รออีกนิดก่อนใช้คำสั่งนี้!')],
            ephemeral: true
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ตั้งค่า
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        await saveToCloud();
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('⚙️ ตั้งค่าสำเร็จ!')
                .setDescription(`ช่อง <#${songChannelId}> จะแสดงรายการเพลง`)
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
        await refreshMessage();
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ทดสอบ
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ทดสอบ') {
        await interaction.deferReply();
        const t = Date.now();
        try {
            const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, {
                params: { q: 'Saran', type: 'song', sources: 'joox' },
                timeout: 90000
            });
            const elapsed = ((Date.now() - t) / 1000).toFixed(1);
            const list = res.data?.data?.songs || [];
            
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('🧪 ทดสอบ JOOX API')
                    .setDescription(
                        `**URL:** \`${CONFIG.MUSIC_API_URL}\`\n` +
                        `**สถานะ:** ✅ เชื่อมต่อได้\n` +
                        `**เวลา:** ${elapsed} วินาที\n` +
                        `**Code:** ${res.data.code}\n` +
                        `**จำนวนเพลง:** ${list.length}`
                    )
                    .addFields({
                        name: '📋 ตัวอย่าง',
                        value: list.length > 0
                            ? `🎵 ${list[0].name}\n🎤 ${list[0].artist}`
                            : 'ไม่มี'
                    })
                    .setColor(CONFIG.COLOR_SUCCESS)
                ]
            });
        } catch (e) {
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('🧪 ทดสอบ')
                    .setDescription(`❌ ${e.message}`)
                    .setColor(CONFIG.COLOR_ERROR)
                ]
            });
        }
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // หาเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle('🔍 กำลังค้นหา...')
                .setDescription(`คำค้น: **${query}**\n\n${progressBar(0, 1)}`)
                .setColor(CONFIG.COLOR_WARNING)
            ]
        });
        
        const results = await searchJoox(query);
        if (results.length === 0) {
            return interaction.editReply({
                embeds: [replyEmbed
                    .setDescription(`❌ ไม่พบเพลง **${query}**`)
                    .setColor(CONFIG.COLOR_ERROR)
                ]
            });
        }
        
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        
        if (result?.status === 'success') {
            const rInfo = result.uploadResult.success
                ? `✅ \`${result.uploadResult.assetId}\``
                : `❌ ${result.uploadResult.error?.slice(0, 100) || 'failed'}`;
            
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .addFields(
                        { name: '🎵 เพลง', value: truncate(result.song.title, 60), inline: true },
                        { name: '🎤 ศิลปิน', value: truncate(result.song.artist, 50), inline: true },
                        { name: '⏱️ ความยาว', value: fmtDuration(result.song.duration), inline: true },
                        { name: '🟢 Roblox', value: rInfo, inline: false }
                    )
                    .setColor(CONFIG.COLOR_SUCCESS)
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [replyEmbed
                    .setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`)
                    .setColor(CONFIG.COLOR_ERROR)
                ]
            });
        }
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ศิลปิน
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle(`🔍 ค้นหาเพลงของ ${artist}...`)
                .setColor(CONFIG.COLOR_WARNING)
            ]
        });
        
        const results = await searchJoox(artist);
        if (results.length === 0) {
            return interaction.editReply({
                embeds: [replyEmbed
                    .setDescription(`❌ ไม่พบเพลงของ **${artist}**`)
                    .setColor(CONFIG.COLOR_ERROR)
                ]
            });
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`⏳ กำลังโหลดเพลงของ ${artist}...`)
                .setDescription(`พบ **${results.length}** เพลง\n\n${progressBar(0, results.length)}`)
                .setColor(CONFIG.COLOR_WARNING)
            ]
        });
        
        const added = [], skipped = [];
        
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
        }
        
        const summary = added.length > 0
            ? added.map(s => `- **${truncate(s.title, 50)}** ${s.robloxAssetId ? '🟢' : '🔴'}`).join('\n')
            : 'ไม่มีเพลงใหม่';
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ!`)
                .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${summary}`)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true },
                    { name: '📊 รวมในคลัง', value: `${Object.keys(songs).length}`, inline: true }
                )
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // เพลงฮิต
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');
        
        if (results.length === 0) {
            return interaction.editReply({
                embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง').setColor(CONFIG.COLOR_ERROR)]
            });
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('⏳ ดึงเพลงฮิต...')
                .setDescription(`พบ **${results.length}** เพลง\n\n${progressBar(0, results.length)}`)
                .setColor(CONFIG.COLOR_WARNING)
            ]
        });
        
        const added = [], skipped = [];
        
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ดึงเพลงฮิตสำเร็จ!')
                .setDescription(added.map(s => `- **${truncate(s.title, 50)}**`).join('\n') || 'ไม่มีเพลงใหม่')
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // เริ่มหาเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('⚠️ ระบบอัตโนมัติกำลังทำงานอยู่แล้ว!')]
            });
        }
        
        const target = options.getString('เป้าหมาย') || CONFIG.AUTO_SEARCH_TARGET;
        songChannelId = interaction.channelId;
        await saveToCloud();
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🚀 เริ่มระบบอัตโนมัติ!')
                .setDescription(
                    `🎯 **เป้าหมาย:** ${target}\n` +
                    `⏱️ **รอบละ:** 60 วินาที\n` +
                    `💾 **บันทึกอัตโนมัติ:** ทุก 30 วินาที\n\n` +
                    `เพลงจะถูกบันทึกขึ้น Cloud อัตโนมัติ`
                )
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
        
        await runAutoSearch(interaction.channel, target);
        
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch, target);
        }, CONFIG.AUTO_SEARCH_INTERVAL);
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // หยุดหาเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await saveToCloud();
            await interaction.reply({
                embeds: [replyEmbed
                    .setTitle('⏹️ หยุดระบบอัตโนมัติแล้ว')
                    .setDescription(`💾 บันทึกข้อมูลขึ้น Cloud เรียบร้อย\n📊 รอบที่ทำงานไป: ${stats.autoSearchCount} รอบ`)
                    .setColor(CONFIG.COLOR_SUCCESS)
                ]
            });
        } else {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('⚠️ ระบบอัตโนมัติไม่ได้ทำงานอยู่!')]
            });
        }
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ลบเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            const title = songs[id].title;
            delete songs[id];
            stats.totalSongsRemoved++;
            await saveToCloud();
            await interaction.reply({
                embeds: [replyEmbed
                    .setTitle('✅ ลบเพลงสำเร็จ!')
                    .setDescription(`ลบ **${truncate(title, 60)}** แล้ว`)
                    .setColor(CONFIG.COLOR_SUCCESS)
                ]
            });
            await refreshMessage();
        } else {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('❌ ไม่พบเพลงนี้!')]
            });
        }
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // คลังเพลง (แบบแบ่งหน้า)
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'คลังเพลง') {
        const { embed, pages, currentPage } = buildBrowseEmbed(0);
        
        if (pages === 0) {
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const buttons = buildBrowseButtons(currentPage, pages);
        
        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: true
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ค้นหา
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ค้นหา') {
        const filter = options.getString('คำค้น');
        const { embed, pages, currentPage } = buildBrowseEmbed(0, filter);
        
        if (pages === 0) {
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const buttons = buildBrowseButtons(currentPage, pages);
        
        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: true
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // ข้อมูลเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'ข้อมูลเพลง') {
        const id = options.getString('id');
        const song = songs[id];
        
        if (!song) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('❌ ไม่พบเพลงนี้!')],
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('ℹ️ ข้อมูลเพลง')
            .setColor(CONFIG.COLOR_PRIMARY)
            .addFields(
                { name: '🎵 ชื่อเพลง', value: song.title, inline: false },
                { name: '🎤 ศิลปิน', value: song.artist, inline: true },
                { name: '⏱️ ความยาว', value: fmtDuration(song.duration), inline: true },
                { name: '💿 อัลบั้ม', value: song.album || 'ไม่ระบุ', inline: true },
                { name: '🆔 ID', value: `\`${song.id}\``, inline: false },
                { name: '🟢 Roblox', value: song.robloxAssetId ? `\`${song.robloxAssetId}\`` : '🔴 ยังไม่อัปโหลด', inline: true },
                { name: '📅 เพิ่มเมื่อ', value: song.addedAt ? new Date(song.addedAt).toLocaleString('th-TH') : 'ไม่ระบุ', inline: true },
                { name: '🌐 Source', value: song.source || 'joox', inline: true }
            );
        
        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        if (song.robloxError) {
            embed.addFields({ name: '⚠️ Error', value: song.robloxError.slice(0, 200), inline: false });
        }
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // สุ่มเพลง
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'สุ่มเพลง') {
        const list = Object.values(songs);
        if (list.length === 0) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('📭 คลังเพลงว่างเปล่า!')]
            });
        }
        
        const s = list[Math.floor(Math.random() * list.length)];
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(`🎵 **${truncate(s.title, 60)}**\n🎤 ${truncate(s.artist, 50)}`)
                .addFields(
                    { name: '⏱️ ความยาว', value: fmtDuration(s.duration), inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId ? `\`${s.robloxAssetId}\`` : '🔴 ยังไม่อัปโหลด', inline: true },
                    { name: '🆔 ID', value: `\`${s.id.slice(0, 20)}...\``, inline: false }
                )
                .setThumbnail(s.thumbnail)
                .setColor(CONFIG.COLOR_PRIMARY)
            ]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // อัปโหลด (Select Menu)
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'อัปโหลด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')]
            });
        }
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_upload')
            .setPlaceholder('เลือกเพลงที่ต้องการอัปโหลด')
            .setMinValues(1)
            .setMaxValues(Math.min(pending.length, 10))
            .addOptions(pending.slice(0, 25).map(s => ({
                label: s.title.slice(0, 100),
                description: `🎤 ${(s.artist || 'Unknown').slice(0, 50)}`.slice(0, 100),
                value: s.id
            })));
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📤 เลือกเพลงเพื่ออัปโหลด')
                .setDescription(`มี **${pending.length}** เพลงที่ยังไม่อัปโหลด\nเลือกได้สูงสุด 10 เพลงต่อครั้ง`)
                .setColor(CONFIG.COLOR_PRIMARY)
            ],
            components: [new ActionRowBuilder().addComponents(select)]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // อัปโหลดทั้งหมด
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')]
            });
        }
        
        await interaction.deferReply();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_upload_all')
                .setLabel('✅ ยืนยันอัปโหลดทั้งหมด')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_upload_all')
                .setLabel('❌ ยกเลิก')
                .setStyle(ButtonStyle.Danger)
        );
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('⚠️ ยืนยันการอัปโหลด')
                .setDescription(
                    `จะอัปโหลด **${pending.length}** เพลงขึ้น Roblox\n\n` +
                    `⏱️ ใช้เวลาประมาณ **${Math.ceil(pending.length * 0.5)} นาที**\n` +
                    `⚠️ ไม่สามารถย้อนกลับได้`
                )
                .setColor(CONFIG.COLOR_WARNING)
            ],
            components: [row]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // สถิติ
    // ═════════════════════════════════════════════════════════════════════
    if (commandName === 'สถิติ') {
        const list = Object.values(songs);
        const byArtist = {};
        list.forEach(s => {
            byArtist[s.artist] = (byArtist[s.artist] || 0) + 1;
        });
        const top = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('📈 สถิติการใช้งาน')
                .setColor(CONFIG.COLOR_PRIMARY)
                .addFields(
                    { name: '🔍 ค้นหาทั้งหมด', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลดสำเร็จ', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลดสำเร็จ', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true },
                    { name: '➕ เพิ่มเพลง', value: `${stats.totalSongsAdded}`, inline: true },
                    { name: '🗑️ ลบเพลง', value: `${stats.totalSongsRemoved}`, inline: true },
                    { name: '🎵 เพลงในคลัง', value: `${list.length}`, inline: true },
                    { name: '⏱️ อัปไทม์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '🔄 รอบ Auto', value: `${stats.autoSearchCount}`, inline: true },
                    { name: '🎤 Top 5 ศิลปิน', value: top.map(([a, c]) => `${truncate(a, 30)}: ${c} เพลง`).join('\n') || 'ไม่มีข้อมูล', inline: false }
                )
                .setTimestamp()
            ]
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 23] - COMPONENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleComponents(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // Browse Buttons
    // ═════════════════════════════════════════════════════════════════════
    if (interaction.customId.startsWith('browse_')) {
        const match = interaction.message.embeds[0].footer?.text?.match(/หน้า (\d+)\/(\d+)/);
        if (!match) return;
        
        let currentPage = parseInt(match[1]) - 1;
        const totalPages = parseInt(match[2]);
        
        const filterMatch = interaction.message.embeds[0].footer?.text?.match(/ค้นหา: "([^"]+)"/);
        const filter = filterMatch ? filterMatch[1] : null;
        
        if (interaction.customId === 'browse_first') currentPage = 0;
        if (interaction.customId === 'browse_prev') currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId === 'browse_next') currentPage = Math.min(totalPages - 1, currentPage + 1);
        if (interaction.customId === 'browse_last') currentPage = totalPages - 1;
        
        const { embed, pages, currentPage: newPage } = buildBrowseEmbed(currentPage, filter);
        const buttons = buildBrowseButtons(newPage, pages);
        
        return interaction.update({
            embeds: [embed],
            components: [buttons]
        });
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // Admin Panel Buttons
    // ═════════════════════════════════════════════════════════════════════
    if (interaction.customId === 'admin_stats') {
        const list = Object.values(songs);
        const uploaded = list.filter(s => s.robloxAssetId).length;
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📊 สถิติโดยละเอียด')
                .setColor(CONFIG.COLOR_PRIMARY)
                .addFields(
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true },
                    { name: '➕ เพิ่ม', value: `${stats.totalSongsAdded}`, inline: true },
                    { name: '🗑️ ลบ', value: `${stats.totalSongsRemoved}`, inline: true },
                    { name: '🎵 ในคลัง', value: `${list.length}`, inline: true },
                    { name: '🟢 อัปโหลด', value: `${uploaded}`, inline: true },
                    { name: '🔴 รอ', value: `${list.length - uploaded}`, inline: true },
                    { name: '⏱️ อัปไทม์', value: fmtUptime(Date.now() - stats.startTime), inline: false }
                )
            ],
            ephemeral: true
        });
        return;
    }
    
    if (interaction.customId === 'admin_backup') {
        await interaction.deferReply({ ephemeral: true });
        await saveToCloud();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('💾 สำรองข้อมูลสำเร็จ!')
                .setDescription(`บันทึก ${Object.keys(songs).length} เพลง`)
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
        return;
    }
    
    if (interaction.customId === 'admin_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('🔄 รีเฟรชสำเร็จ!')
                .setColor(CONFIG.COLOR_SUCCESS)
            ]
        });
        return;
    }
    
    if (interaction.customId === 'admin_browse') {
        const { embed, pages, currentPage } = buildBrowseEmbed(0);
        if (pages === 0) {
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        const buttons = buildBrowseButtons(currentPage, pages);
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
    
    if (interaction.customId === 'admin_clear') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_clear_all')
                .setLabel('✅ ยืนยันลบทั้งหมด')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_clear_all')
                .setLabel('❌ ยกเลิก')
                .setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('⚠️ ยืนยันการลบทั้งหมด')
                .setDescription(`จะลบเพลงทั้งหมด **${Object.keys(songs).length}** เพลง\n\n⚠️ **ไม่สามารถกู้คืนได้!**`)
                .setColor(CONFIG.COLOR_ERROR)
            ],
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
        await refreshMessage();
        await interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ลบทั้งหมดแล้ว')
                .setDescription(`ลบ **${count}** เพลง`)
                .setColor(CONFIG.COLOR_SUCCESS)
            ],
            components: []
        });
        return;
    }
    
    if (interaction.customId === 'cancel_clear_all') {
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR_ERROR)],
            components: []
        });
        return;
    }
    
    if (interaction.customId === 'admin_upload_all') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')],
                ephemeral: true
            });
        }
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_upload_all')
                .setLabel('✅ ยืนยัน')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_upload_all')
                .setLabel('❌ ยกเลิก')
                .setStyle(ButtonStyle.Danger)
        );
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('⚠️ ยืนยัน')
                .setDescription(`อัปโหลด **${pending.length}** เพลง`)
                .setColor(CONFIG.COLOR_WARNING)
            ],
            components: [row],
            ephemeral: true
        });
        return;
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // Upload Buttons
    // ═════════════════════════════════════════════════════════════════════
    if (interaction.customId === 'confirm_upload_all') {
        await interaction.deferUpdate();
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        let ok = 0, fail = 0;
        
        for (let i = 0; i < pending.length; i++) {
            const song = pending[i];
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 กำลังอัปโหลดทั้งหมด ${i+1}/${pending.length}`)
                    .setDescription(
                        `🎵 **${truncate(song.title, 60)}**\n` +
                        `🎤 ${truncate(song.artist, 50)}\n\n` +
                        `${progressBar(i, pending.length)}\n\n` +
                        `📊 **สถานะ:** ดาวน์โหลด + อัปโหลด...`
                    )
                    .setColor(CONFIG.COLOR_INFO)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
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
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดทั้งหมดเสร็จสิ้น!')
                .setDescription(`รวม **${pending.length}** เพลง`)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${ok}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${fail}`, inline: true }
                )
                .setColor(CONFIG.COLOR_SUCCESS)
            ],
            components: []
        });
        return;
    }
    
    if (interaction.customId === 'cancel_upload_all') {
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(CONFIG.COLOR_ERROR)],
            components: []
        });
        return;
    }
    
    // ═════════════════════════════════════════════════════════════════════
    // Select Upload Menu
    // ═════════════════════════════════════════════════════════════════════
    if (interaction.customId === 'select_upload') {
        await interaction.deferUpdate();
        
        const ids = interaction.values;
        let ok = 0, fail = 0;
        
        for (let i = 0; i < ids.length; i++) {
            const song = songs[ids[i]];
            if (!song) continue;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 กำลังอัปโหลด ${i+1}/${ids.length}`)
                    .setDescription(
                        `🎵 **${truncate(song.title, 60)}**\n` +
                        `🎤 ${truncate(song.artist, 50)}\n\n` +
                        `${progressBar(i, ids.length)}\n\n` +
                        `📊 **สถานะ:** ดาวน์โหลด + อัปโหลด...`
                    )
                    .setColor(CONFIG.COLOR_INFO)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
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
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดเสร็จสิ้น!')
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${ok}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${fail}`, inline: true }
                )
                .setColor(CONFIG.COLOR_SUCCESS)
            ],
            components: []
        });
        return;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 24] - LOGIN
// ═══════════════════════════════════════════════════════════════════════════

client.login(CONFIG.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════════════════════
// END OF FILE - v5.0 Ultimate Edition
// Total: ~2000+ lines
// ═══════════════════════════════════════════════════════════════════════════
