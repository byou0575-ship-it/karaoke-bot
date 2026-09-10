// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   KARAOKE BOT v6.0 - MULTI-CHANNEL EDITION                               ║
// ║   ✨ 3 Channels + Notifications + Public Search + Beautiful UI           ║
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
    SONGS_PER_PAGE: 10,
    RATE_LIMIT_MS: 3000,
    UNLOCK_RATE_MS: 10000,
    AUTO_SEARCH_INTERVAL: 60000,
    AUTO_SEARCH_TARGET: 'เพลงไทย',
    COLOR: {
        PRIMARY: 0x5865F2,
        SUCCESS: 0x57F287,
        WARNING: 0xFEE75C,
        ERROR: 0xED4245,
        INFO: 0x3498DB,
        BLACK: 0x000000,
        GOLD: 0xF1C40F,
        PINK: 0xEB459E,
        PURPLE: 0x9B59B6
    }
};

// GIF/Image assets สำหรับ UI สวยๆ
const ASSETS = {
    LOADING: 'https://media.tenor.com/On7kvXhzml4AAAAj/loading-gif.gif',
    SUCCESS: 'https://media.tenor.com/8B6m6cZvB5sAAAAC/success.gif',
    MUSIC: 'https://media.tenor.com/XfN7hy_IYWYAAAAC/music.gif',
    KARAOKE: 'https://media.tenor.com/6wL6Zm3cJuIAAAAC/singing.gif',
    DOWNLOAD: 'https://media.tenor.com/KGzZlT5Uu2QAAAAC/download.gif',
    UPLOAD: 'https://media.tenor.com/qKz5v9rUYWYAAAAC/upload.gif',
    DANCING: 'https://media.tenor.com/XQeY7_wKPYwAAAAC/dance.gif',
    ROBLOX: 'https://media.tenor.com/9Z6zB9kJhSgAAAAC/roblox.gif',
    MUSIC_NOTES: 'https://media.tenor.com/1Q9hN8kNZ8AAAAAC/music-notes.gif',
    THUMBUP: 'https://media.tenor.com/P0T2yQGGe9sAAAAC/thumbs-up.gif'
};

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 03] - GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let songs = {};
let displayChannels = []; // 3 ช่องแสดงเพลง
let notificationChannelId = null; // ช่องแจ้งเตือนเพลงใหม่
let searchChannelId = null; // ช่องสำหรับค้นหา
let isLocked = true;
let autoTask = null;
let refreshTask = null;
let saveTask = null;
let unlockAttempts = new Map();
let commandCooldowns = new Map();

// Message IDs สำหรับ Edit
let messageIds = {
    songLists: {}, // { channelId: messageId } สำหรับ 3 ช่อง
    autoProgress: null,
    adminPanel: null,
    searchResults: null
};

let stats = {
    totalSearches: 0,
    totalDownloads: 0,
    totalUploads: 0,
    totalFailures: 0,
    totalSongsAdded: 0,
    totalSongsRemoved: 0,
    totalSearchesByUser: 0,
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
        channels: displayChannels.length
    });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

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
        if (data.notificationChannelId) notificationChannelId = data.notificationChannelId;
        if (data.searchChannelId) searchChannelId = data.searchChannelId;
        if (data.isLocked !== undefined) isLocked = data.isLocked;
        if (data.stats) Object.assign(stats, data.stats);
        if (data.messageIds) messageIds = { ...messageIds, ...data.messageIds };
        
        console.log(`✅ Loaded: ${Object.keys(songs).length} songs, ${displayChannels.length} channels`);
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
                notificationChannelId,
                searchChannelId,
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
                    songLists: messageIds.songLists,
                    adminPanel: messageIds.adminPanel
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
    }, 30000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 07] - SECURITY
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
// [SECTION 08] - CONTENT FILTER
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
// [SECTION 09] - UTILITIES
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
    const bar = '█'.repeat(filled) + '░'.repeat(length - filled);
    return `\`[${bar}]\` **${pct}%**`;
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

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 10] - MUSIC API FUNCTIONS
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
    
    // Layer 1: Direct
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
    
    // Layer 2: Stream
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
// [SECTION 11] - SONG PROCESSING
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
                        `${progressBar(index, total)}\n` +
                        `📊 **สถานะ:** กำลังดาวน์โหลด MP3...`
                    )
                    .setColor(CONFIG.COLOR.WARNING)
                    .setThumbnail(song.cover || null)
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
                        `${progressBar(index + 0.5, total)}\n` +
                        `📊 **สถานะ:** อัปโหลดขึ้น Roblox...`
                    )
                    .setColor(CONFIG.COLOR.INFO)
                    .setThumbnail(song.cover || null)
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
        
        // 🔔 แจ้งเตือนเพลงใหม่!
        await notifyNewSong(songs[songId]);
        await refreshAllChannels();
        
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (e) {
        return { status: 'failed', reason: e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 12] - NOTIFY NEW SONG (🔔 แจ้งเตือนทุกคน)
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
                `${song.robloxAssetId ? `🟢 **นำเข้า Roblox แล้ว!**\n\`${song.robloxAssetId}\`` : '🔴 รออัปโหลด Roblox'}\n\n` +
                `📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง`
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setFooter({ text: `🔔 แจ้งเตือนอัตโนมัติ · ${new Date().toLocaleTimeString('th-TH')}` });
        
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
// [SECTION 13] - BUILD SONG LIST EMBED (สวยงาม)
// ═══════════════════════════════════════════════════════════════════════════

function buildSongListEmbed() {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return new EmbedBuilder()
            .setTitle('🎤 รายการเพลง Karaoke')
            .setDescription(
                '```\n' +
                '📭 ยังไม่มีเพลงในคลัง\n' +
                '```\n' +
                '💡 **วิธีเพิ่มเพลง:**\n' +
                '> ใช้ `/หาเพลง` เพื่อเพิ่มเพลง\n' +
                '> หรือ `/เริ่มหาเพลง` เพื่อระบบอัตโนมัติ'
            )
            .setColor(CONFIG.COLOR.BLACK)
            .setFooter({ text: `📊 0 เพลง · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });
    }
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    const chunk = songList.slice(0, CONFIG.SONGS_PER_PAGE);
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
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
    let desc = '';
    chunk.forEach((s, i) => {
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `**${i+1}.** ${r} **${truncate(s.title, 45)}**\n`;
        desc += `　　🎤 ${truncate(s.artist, 35)}\n`;
        desc += `　　⏱️ ${dur} · \`${s.id.slice(0, 8)}\`\n\n`;
    });
    
    if (songList.length > CONFIG.SONGS_PER_PAGE) {
        desc += `\n*...และอีก **${songList.length - CONFIG.SONGS_PER_PAGE}** เพลง*\n`;
        desc += `*ใช้ \`/คลังเพลง\` เพื่อดูทั้งหมด*`;
    }
    
    embed.setDescription(desc);
    embed.setFooter({ 
        text: `📊 ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${pending} · ${new Date().toLocaleTimeString('th-TH')}`
    });
    
    return embed;
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 14] - REFRESH ALL CHANNELS (อัปเดต 3 ช่อง)
// ═══════════════════════════════════════════════════════════════════════════

async function refreshAllChannels() {
    if (displayChannels.length === 0) return;
    
    const embed = buildSongListEmbed();
    
    for (const channelId of displayChannels) {
        try {
            const channel = client.channels.cache.get(channelId);
            if (!channel) continue;
            
            // ลอง Edit ข้อความเก่า
            if (messageIds.songLists[channelId]) {
                try {
                    const msg = await channel.messages.fetch(messageIds.songLists[channelId]);
                    await msg.edit({ embeds: [embed] });
                    continue;
                } catch {
                    delete messageIds.songLists[channelId];
                }
            }
            
            // สร้างใหม่
            const msg = await channel.send({ embeds: [embed] });
            messageIds.songLists[channelId] = msg.id;
        } catch (e) {
            console.error(`Refresh channel ${channelId} error:`, e.message);
        }
    }
}

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (displayChannels.length > 0 && !isLocked) {
            await refreshAllChannels();
        }
    }, 30000);
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 15] - PUBLIC SEARCH (ค้นหาสำหรับทุกคน)
// ═══════════════════════════════════════════════════════════════════════════

async function publicSearch(interaction, query) {
    stats.totalSearchesByUser++;
    
    const results = searchSongs(query);
    
    if (results.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ค้นหา: ไม่พบเพลง')
                .setDescription(
                    `❌ ไม่พบเพลงที่ตรงกับ **"${query}"**\n\n` +
                    `💡 **ลองค้นหาด้วย:**\n` +
                    `> ชื่อเพลง (บางส่วนก็ได้)\n` +
                    `> ชื่อศิลปิน`
                )
                .setColor(CONFIG.COLOR.ERROR)
                .setFooter({ text: `📊 คลังเพลงมี ${Object.keys(songs).length} เพลง` })
            ],
            ephemeral: true
        });
    }
    
    // แสดงผลลัพธ์
    const displayed = results.slice(0, 10);
    const embed = new EmbedBuilder()
        .setTitle(`🔍 ผลการค้นหา: "${query}"`)
        .setDescription(
            `พบ **${results.length}** เพลงที่ตรงกัน${results.length > 10 ? ' (แสดง 10 เพลงแรก)' : ''}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setColor(CONFIG.COLOR.PRIMARY)
        .setFooter({ text: `🎵 ค้นหาจากคลัง ${Object.keys(songs).length} เพลง` });
    
    let desc = embed.data.description;
    displayed.forEach((s, i) => {
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `\n**${i+1}.** ${r} **${truncate(s.title, 50)}**\n`;
        desc += `　🎤 ${truncate(s.artist, 40)}\n`;
        desc += `　⏱️ ${dur} · \`${s.id.slice(0, 10)}...\`\n`;
    });
    
    embed.setDescription(desc);
    
    if (displayed[0].thumbnail) {
        embed.setThumbnail(displayed[0].thumbnail);
    }
    
    await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 16] - BROWSE LIBRARY (ค้นหาในคลัง - แบ่งหน้า)
// ═══════════════════════════════════════════════════════════════════════════

let browseState = new Map(); // { userId: { page, filter } }

function buildBrowseEmbed(page = 0, filter = null) {
    let songList = Object.values(songs);
    
    if (filter) {
        const lower = filter.toLowerCase();
        songList = songList.filter(s => 
            s.title.toLowerCase().includes(lower) ||
            s.artist.toLowerCase().includes(lower)
        );
    }
    
    songList.sort((a, b) => a.title.localeCompare(b.title));
    
    const totalPages = Math.max(1, Math.ceil(songList.length / CONFIG.SONGS_PER_PAGE));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * CONFIG.SONGS_PER_PAGE;
    const chunk = songList.slice(start, start + CONFIG.SONGS_PER_PAGE);
    
    if (songList.length === 0) {
        return {
            embed: new EmbedBuilder()
                .setTitle('📚 คลังเพลง')
                .setDescription(filter ? `*ไม่พบเพลงที่ตรงกับ "${filter}"*` : '*ยังไม่มีเพลงในคลัง*')
                .setColor(CONFIG.COLOR.BLACK),
            pages: 0,
            currentPage: 0
        };
    }
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    
    const embed = new EmbedBuilder()
        .setTitle(filter ? `🔍 ค้นหา: "${filter}"` : '📚 คลังเพลงทั้งหมด')
        .setColor(CONFIG.COLOR.PRIMARY)
        .setFooter({ 
            text: `หน้า ${currentPage + 1}/${totalPages} · รวม ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${songList.length - uploaded}`
        });
    
    let desc = '';
    chunk.forEach((s, i) => {
        const num = start + i + 1;
        const r = s.robloxAssetId ? '🟢' : '🔴';
        const dur = fmtDuration(s.duration);
        desc += `**${num}.** ${r} **${truncate(s.title, 55)}**\n`;
        desc += `　🎤 ${truncate(s.artist, 45)}\n`;
        desc += `　⏱️ ${dur} · 🆔 \`${s.id.slice(0, 12)}\`\n\n`;
    });
    
    embed.setDescription(desc);
    
    return { embed, pages: totalPages, currentPage };
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
            .setLabel('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('browse_page')
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('browse_next')
            .setLabel('▶️')
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
// [SECTION 17] - AUTO SEARCH
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
                `${progressBar(0, 1)}\n` +
                `📊 **สถานะ:** กำลังค้นหา...`
            )
            .setColor(CONFIG.COLOR.WARNING)
            .setFooter({ text: `🔄 รอบที่ ${stats.autoSearchCount}` });
        
        let progressMsg;
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
        
        const results = await searchJoox(target);
        if (results.length === 0) {
            await progressMsg.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('⏭️ ไม่พบเพลง')
                    .setDescription(`ไม่พบเพลงจาก: **${target}**\n🔄 จะลองใหม่ใน 60 วินาที`)
                    .setColor(CONFIG.COLOR.WARNING)
                ]
            });
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
                            `🎵 **${truncate(r.song.title, 60)}**\n` +
                            `🎤 ${truncate(r.song.artist, 50)}\n\n` +
                            `${progressBar(i + 1, results.length)}\n\n` +
                            `🟢 **Roblox:** ${uploadInfo}\n` +
                            `📊 **รวมในคลัง:** ${Object.keys(songs).length} เพลง\n\n` +
                            `🔄 จะหาใหม่ใน **60 วินาที**`
                        )
                        .setColor(CONFIG.COLOR.SUCCESS)
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
// [SECTION 18] - ADMIN PANEL
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
            { name: '🔔 แจ้งเตือน', value: notificationChannelId ? `\`✅ ตั้งค่า\`` : '`❌ ไม่ได้ตั้ง`', inline: true },
            { name: '🔍 ค้นหาผู้ใช้', value: `\`${stats.totalSearchesByUser}\``, inline: true }
        )
        .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
        .setFooter({ text: '🎛️ Admin Panel v6.0' })
        .setTimestamp();
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_stats').setLabel('📊 สถิติ').setStyle(ButtonStyle.Primary).setEmoji('📊'),
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
        new ButtonBuilder().setCustomId('admin_setup_channels').setLabel('ตั้งค่าช่อง').setStyle(ButtonStyle.Secondary).setEmoji('📺'),
        new ButtonBuilder().setCustomId('admin_clear').setLabel('ล้างทั้งหมด').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    
    return { embed, components: [row1, row2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 19] - BOT READY
// ═══════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลง: ${Object.keys(songs).length}`);
    console.log(`📺 ช่องแสดง: ${displayChannels.length}`);
    console.log(`🔔 แจ้งเตือน: ${notificationChannelId || 'ไม่ได้ตั้ง'}`);
    console.log('═'.repeat(70) + '\n');
    
    await loadFromCloud();
    
    startAutoRefresh();
    startAutoSave();
    
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
        new SlashCommandBuilder().setName('ตั้งค่าช่องแจ้งเตือน').setDescription('🔔 ตั้งค่าช่องแจ้งเตือนเพลงใหม่')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องแจ้งเตือน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่าช่องค้นหา').setDescription('🔍 ตั้งค่าช่องค้นหาสำหรับทุกคน')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องค้นหา').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ทดสอบ').setDescription('🧪 ทดสอบ API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🔍 Search (Admin)
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
        new SlashCommandBuilder().setName('คลังเพลง').setDescription('📚 ดูคลังเพลง (แบ่งหน้า)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ค้นหา').setDescription('🔎 ค้นหาในคลัง')
            .addStringOption(o => o.setName('คำค้น').setDescription('คำค้นหา').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ข้อมูลเพลง').setDescription('ℹ️ ข้อมูลเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('🗑️ ลบเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('🎲 สุ่มเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
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
        
        // 🌟 PUBLIC COMMAND (ทุกคนใช้ได้)
        new SlashCommandBuilder().setName('ค้นหาเพลง').setDescription('🔍 ค้นหาเพลงในคลัง (ทุกคน)')
            .addStringOption(o => o.setName('คำค้น').setDescription('ชื่อเพลงหรือศิลปิน').setRequired(true))
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) {
        console.error('Register error:', e.message);
    }
    
    await refreshAllChannels();
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 20] - INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(CONFIG.COLOR.BLACK);
    
    // 🌟 PUBLIC: /ค้นหาเพลง
    if (commandName === 'ค้นหาเพลง') {
        if (!checkCooldown(interaction.user.id, commandName)) {
            return interaction.reply({ content: '⏱️ รอ 3 วินาทีก่อนค้นหาใหม่', ephemeral: true });
        }
        return publicSearch(interaction, options.getString('คำค้น'));
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
                    .setDescription('บอทพร้อมใช้งาน!\nใช้ `/panel` เพื่อเปิดแผงควบคุม')
                    .setColor(CONFIG.COLOR.SUCCESS)
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
                    { name: '🔔 แจ้งเตือน', value: notificationChannelId ? `<#${notificationChannelId}>` : '`❌ ไม่ได้ตั้ง`', inline: true },
                    { name: '🔍 ช่องค้นหา', value: searchChannelId ? `<#${searchChannelId}>` : '`❌ ไม่ได้ตั้ง`', inline: true }
                )
                .setColor(isLocked ? CONFIG.COLOR.ERROR : CONFIG.COLOR.SUCCESS)
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
                .addFields(
                    { name: '🌟 สำหรับทุกคน', value: '`/ค้นหาเพลง` - ค้นหาเพลงในคลัง', inline: false },
                    { name: '🔒 ความปลอดภัย', value: '`/unlock` `/lock` `/status` `/panel` `/help`', inline: false },
                    { name: '⚙️ ตั้งค่า', value: '`/ตั้งค่าช่องแสดง` `/ตั้งค่าช่องแจ้งเตือน` `/ตั้งค่าช่องค้นหา` `/ทดสอบ`', inline: false },
                    { name: '🔍 ค้นหาเพลง', value: '`/หาเพลง` `/ศิลปิน` `/เพลงฮิต`', inline: false },
                    { name: '🚀 อัตโนมัติ', value: '`/เริ่มหาเพลง` `/หยุดหาเพลง`', inline: false },
                    { name: '📚 จัดการคลัง', value: '`/คลังเพลง` `/ค้นหา` `/ข้อมูลเพลง` `/ลบเพลง` `/สุ่มเพลง`', inline: false },
                    { name: '📤 อัปโหลด', value: '`/อัปโหลด` `/อัปโหลดทั้งหมด`', inline: false },
                    { name: '📊 ข้อมูล', value: '`/สถิติ` `/สำรองข้อมูล`', inline: false }
                )
                .setFooter({ text: 'Karaoke Bot v6.0 - Multi-Channel Edition' })
            ],
            ephemeral: true
        });
    }
    
    // 📺 ตั้งค่าช่องแสดง (3 ช่อง)
    if (commandName === 'ตั้งค่าช่องแสดง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const ch1 = options.getChannel('ช่อง1');
        const ch2 = options.getChannel('ช่อง2');
        const ch3 = options.getChannel('ช่อง3');
        
        displayChannels = [ch1.id];
        if (ch2) displayChannels.push(ch2.id);
        if (ch3) displayChannels.push(ch3.id);
        
        messageIds.songLists = {};
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
            ]
        });
        
        await refreshAllChannels();
    }
    
    // 🔔 ตั้งค่าช่องแจ้งเตือน
    if (commandName === 'ตั้งค่าช่องแจ้งเตือน') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        notificationChannelId = options.getChannel('ช่อง').id;
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔔 ตั้งค่าช่องแจ้งเตือนสำเร็จ!')
                .setDescription(
                    `ช่องแจ้งเตือน: <#${notificationChannelId}>\n\n` +
                    `✅ เมื่อมีเพลงใหม่ จะแจ้งเตือนที่ช่องนี้`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
            ]
        });
    }
    
    // 🔍 ตั้งค่าช่องค้นหา
    if (commandName === 'ตั้งค่าช่องค้นหา') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        searchChannelId = options.getChannel('ช่อง').id;
        await saveToCloud();
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ตั้งค่าช่องค้นหาสำเร็จ!')
                .setDescription(`ช่องค้นหา: <#${searchChannelId}>`)
                .setColor(CONFIG.COLOR.SUCCESS)
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
                        `**สถานะ:** ✅\n` +
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
                .setDescription(`บันทึก ${Object.keys(songs).length} เพลง`)
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
            embeds: [replyEmbed.setTitle('🔍 กำลังค้นหา...').setDescription(`**${query}**`).setColor(CONFIG.COLOR.WARNING)]
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
                .setTitle('✅ เพลงฮิต')
                .setDescription(added.map(s => `> **${truncate(s.title, 50)}**`).join('\n') || '> ไม่มีเพลงใหม่')
                .addFields(
                    { name: '➕ สำเร็จ', value: `\`${added.length}\``, inline: true },
                    { name: '⏭️ ข้าม', value: `\`${skipped.length}\``, inline: true }
                )
                .setColor(CONFIG.COLOR.SUCCESS)
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
                    `🔔 **แจ้งเตือน:** ${notificationChannelId ? `<#${notificationChannelId}>` : 'ไม่ได้ตั้ง'}\n\n` +
                    `💾 เพลงจะถูกบันทึกอัตโนมัติ`
                )
                .setColor(CONFIG.COLOR.SUCCESS)
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
    
    // 📚 คลังเพลง
    if (commandName === 'คลังเพลง') {
        const { embed, pages, currentPage } = buildBrowseEmbed(0);
        if (pages === 0) return interaction.reply({ embeds: [embed], ephemeral: true });
        const buttons = buildBrowseButtons(currentPage, pages);
        await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }
    
    // 🔎 ค้นหา
    if (commandName === 'ค้นหา') {
        const filter = options.getString('คำค้น');
        const { embed, pages, currentPage } = buildBrowseEmbed(0, filter);
        if (pages === 0) return interaction.reply({ embeds: [embed], ephemeral: true });
        const buttons = buildBrowseButtons(currentPage, pages);
        await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
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
            await interaction.reply({ embeds: [replyEmbed.setTitle('✅ ลบเพลง').setDescription(`ลบ **${truncate(title, 60)}**`).setColor(CONFIG.COLOR.SUCCESS)] });
            await refreshAllChannels();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    // 🎲 สุ่มเพลง
    if (commandName === 'สุ่มเพลง') {
        const list = Object.values(songs);
        if (list.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        const s = list[Math.floor(Math.random() * list.length)];
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(`🎵 **${truncate(s.title, 60)}**\n🎤 ${truncate(s.artist, 50)}`)
                .addFields(
                    { name: '⏱️ ความยาว', value: fmtDuration(s.duration), inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId ? `\`${s.robloxAssetId}\`` : '🔴 รอ', inline: true }
                )
                .setThumbnail(s.thumbnail)
                .setColor(CONFIG.COLOR.PINK)
            ]
        });
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
                .addFields(
                    { name: '🔍 ค้นหา', value: `\`${stats.totalSearches}\``, inline: true },
                    { name: '👥 ค้นหาผู้ใช้', value: `\`${stats.totalSearchesByUser}\``, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `\`${stats.totalDownloads}\``, inline: true },
                    { name: '📤 อัปโหลด', value: `\`${stats.totalUploads}\``, inline: true },
                    { name: '❌ ล้มเหลว', value: `\`${stats.totalFailures}\``, inline: true },
                    { name: '➕ เพิ่มเพลง', value: `\`${stats.totalSongsAdded}\``, inline: true },
                    { name: '🗑️ ลบเพลง', value: `\`${stats.totalSongsRemoved}\``, inline: true },
                    { name: '📊 ในคลัง', value: `\`${list.length}\``, inline: true },
                    { name: '⏱️ อัปไทม์', value: `\`${fmtUptime(Date.now() - stats.startTime)}\``, inline: true },
                    { name: '🎤 Top 5 ศิลปิน', value: top.map(([a, c]) => `> ${truncate(a, 30)}: **${c}** เพลง`).join('\n') || '> ไม่มี', inline: false }
                )
                .setTimestamp()
            ]
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// [SECTION 21] - COMPONENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleComponents(interaction) {
    // Browse buttons (ทุกคนใช้ได้)
    if (interaction.customId.startsWith('browse_')) {
        const match = interaction.message.embeds[0].footer?.text?.match(/หน้า (\d+)\/(\d+)/);
        if (!match) return;
        
        let currentPage = parseInt(match[1]) - 1;
        const totalPages = parseInt(match[2]);
        
        const filterMatch = interaction.message.embeds[0].title?.match(/ค้นหา: "([^"]+)"/);
        const filter = filterMatch ? filterMatch[1] : null;
        
        if (interaction.customId === 'browse_first') currentPage = 0;
        if (interaction.customId === 'browse_prev') currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId === 'browse_next') currentPage = Math.min(totalPages - 1, currentPage + 1);
        if (interaction.customId === 'browse_last') currentPage = totalPages - 1;
        
        const { embed, pages, currentPage: newPage } = buildBrowseEmbed(currentPage, filter);
        const buttons = buildBrowseButtons(newPage, pages);
        
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
        await refreshAllChannels();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔄 รีเฟรชแล้ว').setColor(CONFIG.COLOR.SUCCESS)] });
        return;
    }
    
    if (interaction.customId === 'admin_browse') {
        const { embed, pages, currentPage } = buildBrowseEmbed(0);
        if (pages === 0) return interaction.reply({ embeds: [embed], ephemeral: true });
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
    
    if (interaction.customId === 'admin_setup_channels') {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📺 วิธีตั้งค่าช่อง')
                .setDescription(
                    '**ใช้คำสั่งต่อไปนี้:**\n\n' +
                    '`/ตั้งค่าช่องแสดง ช่อง1:#ch1 ช่อง2:#ch2 ช่อง3:#ch3`\n' +
                    '→ ตั้งช่องแสดงเพลง (สูงสุด 3 ช่อง)\n\n' +
                    '`/ตั้งค่าช่องแจ้งเตือน ช่อง:#notify`\n' +
                    '→ ตั้งช่องแจ้งเตือนเพลงใหม่\n\n' +
                    '`/ตั้งค่าช่องค้นหา ช่อง:#search`\n' +
                    '→ ตั้งช่องสำหรับค้นหา'
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
        await refreshAllChannels();
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
        
        await refreshAllChannels();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดทั้งหมดเสร็จสิ้น!')
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
        
        await refreshAllChannels();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดเสร็จสิ้น!')
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
// [SECTION 22] - LOGIN
// ═══════════════════════════════════════════════════════════════════════════

client.login(CONFIG.DISCORD_TOKEN);

// ═══════════════════════════════════════════════════════════════════════════
// END OF FILE - v6.0 Multi-Channel Edition
// Total: ~2500+ lines
// ═══════════════════════════════════════════════════════════════════════════
