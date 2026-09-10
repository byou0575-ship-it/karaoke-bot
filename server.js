// ============================================================================
// ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗    ██████╗  ██████╗ ████████╗
// ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
// █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗      ██████╔╝██║   ██║   ██║   
// ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝      ██╔══██╗██║   ██║   ██║   
// ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗    ██████╔╝╚██████╔╝   ██║   
// ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
//
// KARAOKE BOT ULTIMATE EDITION v3.3 (JSONBin + Pagination + Persistent Unlock)
// - ระบบ Lock/Unlock ด้วย Key (Admin เท่านั้น) — จำสถานะได้
// - ระบบ Fallback 3 ชั้นสำหรับดาวน์โหลด
// - ระบบเลือกอัปโหลดเพลงขึ้น Roblox
// - ระบบ Auto-Search ทีละ 10 เพลง วนไปเรื่อยๆ
// - ระบบแบ่งหน้าแสดงรายการเพลง (Pagination)
// - บันทึกข้อมูลลง JSONBin (ถาวร)
// ============================================================================

// ============================================================================
// [SECTION 1] IMPORTS
// ============================================================================

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
    ComponentType
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// ============================================================================
// [SECTION 2] CONFIGURATION
// ============================================================================

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_BOT_TOKEN,
    ROBLOX_API_KEY: process.env.ROBLOX_API_KEY,
    ROBLOX_USER_ID: process.env.ROBLOX_USER_ID,
    MUSIC_API_URL: process.env.MUSIC_API_URL || 'https://joox-api.onrender.com',
    JSONBIN_ID: process.env.JSONBIN_ID,
    JSONBIN_KEY: process.env.JSONBIN_KEY,
    UNLOCK_KEY: 'Owjadk@#23241hxb',
    HTTP_TIMEOUT: 120000,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    RATE_LIMIT_MS: 5000,
    SONGS_PER_PAGE: 10
};

// ============================================================================
// [SECTION 3] GLOBAL STATE
// ============================================================================

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;
let isLocked = true;
let dataLoaded = false; // ✅ flag เช็คการโหลดจาก JSONBin
let unlockAttempts = new Map();
let commandCooldowns = new Map();
let stats = {
    totalSearches: 0,
    totalDownloads: 0,
    totalUploads: 0,
    totalFailures: 0,
    startTime: Date.now()
};

// ============================================================================
// [SECTION 4] EXPRESS SERVER
// ============================================================================

const app = express();

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'offline',
        locked: isLocked,
        songs: Object.keys(songs).length,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000)
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// ============================================================================
// [SECTION 5] DISCORD CLIENT
// ============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ============================================================================
// [SECTION 6] DATA STORAGE (JSONBin)
// ============================================================================

const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}`;

async function loadDataFromJSONBin() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        console.log('⚠️ JSONBin ID or Key not found. Using empty data.');
        dataLoaded = true;
        return;
    }
    try {
        console.log('📂 Loading data from JSONBin...');
        const response = await axios.get(`${JSONBIN_URL}/latest`, {
            headers: {
                'X-Master-Key': CONFIG.JSONBIN_KEY,
                'Content-Type': 'application/json'
            }
        });
        const data = response.data.record;
        if (data) {
            songs = data.songs || {};
            songChannelId = data.channelId || null;
            
            // ✅ โหลดสถานะ Lock จาก JSONBin (ถ้าไม่เคยมี → ล็อก)
            if (data.isLocked !== undefined) {
                isLocked = data.isLocked;
                console.log(`🔐 สถานะจาก JSONBin: ${isLocked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`);
            } else {
                isLocked = true;
                console.log('🔐 ครั้งแรก: LOCKED 🔒');
            }
            
            console.log(`✅ Loaded ${Object.keys(songs).length} songs from JSONBin`);
        } else {
            isLocked = true;
            console.log('🔐 ไม่มีข้อมูลใน JSONBin: LOCKED 🔒');
        }
        dataLoaded = true;
    } catch (err) {
        console.error('❌ JSONBin Load error:', err.message);
        isLocked = true;
        dataLoaded = true;
    }
}

async function saveDataToJSONBin() {
    if (!CONFIG.JSONBIN_ID || !CONFIG.JSONBIN_KEY) {
        console.log('⚠️ Cannot save to JSONBin: Missing ID or Key');
        return;
    }
    try {
        const dataToSave = {
            songs: songs,
            channelId: songChannelId,
            isLocked: isLocked,
            lastUpdated: new Date().toISOString()
        };
        await axios.put(JSONBIN_URL, dataToSave, {
            headers: {
                'X-Master-Key': CONFIG.JSONBIN_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log(`💾 Data saved to JSONBin (Locked: ${isLocked})`);
    } catch (err) {
        console.error('❌ JSONBin Save error:', err.message);
    }
}

loadDataFromJSONBin();

// ============================================================================
// [SECTION 7] SECURITY FUNCTIONS
// ============================================================================

function verifyKey(inputKey) {
    if (!inputKey) return false;
    try {
        return crypto.timingSafeEqual(
            Buffer.from(inputKey),
            Buffer.from(CONFIG.UNLOCK_KEY)
        );
    } catch (e) {
        return false; // ถ้าความยาวไม่เท่ากันจะ error
    }
}

function checkUnlockRateLimit(userId) {
    const now = Date.now();
    const lastAttempt = unlockAttempts.get(userId) || 0;
    if (now - lastAttempt < 10000) return false;
    unlockAttempts.set(userId, now);
    return true;
}

function checkCooldown(userId, command) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    const lastUse = commandCooldowns.get(key) || 0;
    if (now - lastUse < CONFIG.RATE_LIMIT_MS) return false;
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
    if (isLocked && interaction.commandName !== 'unlock' && interaction.commandName !== 'status') {
        return { allowed: false, reason: '🔒 **บอทถูกล็อกอยู่!**\nกรุณาใช้ `/unlock` พร้อม Key เพื่อปลดล็อกก่อน' };
    }
    return { allowed: true };
}

// ============================================================================
// [SECTION 8] CONTENT FILTER
// ============================================================================

const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "โง่", "ควาย", "ห่า", "แม่ง",
    "xxx", "porn", "sex", "18+", "หนังโป๊", "ลามก", "อนาจาร",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "ปฏิวัติ", "ล้มเจ้า",
    "บูลลี่", "bully", "เหยียด", "ชาติพันธุ์", "เหยียดผิว",
    "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน", "ทำร้าย"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) return true;
    }
    return false;
}

// ============================================================================
// [SECTION 9] UTILITY FUNCTIONS
// ============================================================================

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fmtUptime(ms) {
    const secs = Math.floor(ms / 1000);
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (d > 0) return `${d}วัน ${h}ชม. ${m}นาที`;
    if (h > 0) return `${h}ชม. ${m}นาที`;
    if (m > 0) return `${m}นาที ${s}วิ`;
    return `${s} วินาที`;
}

function progressBar(current, total, length = 20) {
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round((current / total) * 100)}%`;
}

// ============================================================================
// [SECTION 9.5] PAGINATION BUILDER
// ============================================================================

function buildSongsPageEmbed(page = 1) {
    const songList = Object.values(songs);
    const totalPages = Math.max(1, Math.ceil(songList.length / CONFIG.SONGS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    
    const start = (currentPage - 1) * CONFIG.SONGS_PER_PAGE;
    const end = start + CONFIG.SONGS_PER_PAGE;
    const pageItems = songList.slice(start, end);
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke (JOOX)')
        .setColor(0x000000)
        .setFooter({ 
            text: `หน้า ${currentPage}/${totalPages} · รวม ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${songList.length - uploaded} · ${new Date().toLocaleTimeString('th-TH')}` 
        });
    
    if (pageItems.length === 0) {
        embed.setDescription('*ยังไม่มีเพลง — ใช้ `/หาเพลง`*');
    } else {
        let desc = '';
        pageItems.forEach((s, i) => {
            const num = start + i + 1;
            const r = s.robloxAssetId ? `🟢 \`${s.robloxAssetId}\`` : `🔴 ยังไม่อัปโหลด`;
            desc += `**${num}. ${s.title}**\n　🎤 ${s.artist}\n　${r}\n\n`;
        });
        embed.setDescription(desc);
    }
    
    return { embed, currentPage, totalPages };
}

function buildPaginationRow(currentPage, totalPages) {
    if (totalPages <= 1) return null;
    
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`songs_page_first`)
            .setLabel('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`songs_page_prev`)
            .setLabel('◀️ ก่อนหน้า')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`songs_page_info`)
            .setLabel(`หน้า ${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`songs_page_next`)
            .setLabel('ถัดไป ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages),
        new ButtonBuilder()
            .setCustomId(`songs_page_last`)
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages)
    );
}

// ============================================================================
// [SECTION 10] JOOX SEARCH
// ============================================================================

async function searchJoox(query) {
    try {
        console.log(`🔍 Searching: "${query}"`);
        stats.totalSearches++;
        const response = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, {
            params: { q: query, type: 'song', sources: 'joox' },
            timeout: 90000
        });
        if (response.data?.data?.songs) {
            const list = response.data.data.songs;
            console.log(`✅ Found ${list.length} songs`);
            return list;
        }
        return [];
    } catch (error) {
        console.error(`❌ Search error: ${error.message}`);
        return [];
    }
}

// ============================================================================
// [SECTION 11] GET DIRECT URL
// ============================================================================

async function getDirectUrl(songId, source = 'joox') {
    try {
        const response = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/url`, {
            params: { id: songId, source: source },
            timeout: 60000
        });
        const data = response.data;
        if (data?.url) return data.url;
        if (data?.data?.url) return data.data.url;
        if (data?.link) return data.link;
        return null;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// [SECTION 12] DOWNLOAD VIA STREAM
// ============================================================================

async function downloadViaStream(songId, source = 'joox') {
    try {
        const streamUrl = `${CONFIG.MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(songId)}&source=${source}`;
        const response = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: CONFIG.HTTP_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'audio/*,*/*'
            }
        });
        const ct = response.headers['content-type'] || '';
        if (!ct.includes('audio') && !ct.includes('octet-stream')) return null;
        return response.data;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// [SECTION 13] SWITCH SOURCE
// ============================================================================

async function switchSource(songId, songName, artist, source = 'joox') {
    try {
        const response = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/switch`, {
            params: { id: songId, source, name: songName, artist: artist },
            timeout: 90000
        });
        if (response.data?.url) return { type: 'url', url: response.data.url };
        if (response.data?.data?.url) return { type: 'url', url: response.data.data.url };
        if (response.data?.id) return { type: 'id', id: response.data.id, source: response.data.source };
        return null;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// [SECTION 14] DOWNLOAD AUDIO (FALLBACK 3 LAYERS)
// ============================================================================

async function downloadAudio(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    // Layer 1: Direct URL
    try {
        const directUrl = await getDirectUrl(songId, source);
        if (directUrl) {
            const response = await axios.get(directUrl, {
                responseType: 'stream',
                timeout: CONFIG.HTTP_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'audio/*,*/*', 'Referer': 'https://www.joox.com/' }
            });
            const writer = fs.createWriteStream(tempPath);
            response.data.pipe(writer);
            await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
            const size = fs.statSync(tempPath).size;
            if (size > 1024) { stats.totalDownloads++; return tempPath; }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    // Layer 2: Stream proxy
    try {
        const stream = await downloadViaStream(songId, source);
        if (stream) {
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
            const size = fs.statSync(tempPath).size;
            if (size > 1024) { stats.totalDownloads++; return tempPath; }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {}
    
    // Layer 3: Switch source
    try {
        const sw = await switchSource(songId, songName, artist, source);
        if (sw) {
            let targetUrl = null;
            if (sw.type === 'url') targetUrl = sw.url;
            else if (sw.type === 'id') {
                const stream = await downloadViaStream(sw.id, sw.source);
                if (stream) {
                    const writer = fs.createWriteStream(tempPath);
                    stream.pipe(writer);
                    await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
                    const size = fs.statSync(tempPath).size;
                    if (size > 1024) { stats.totalDownloads++; return tempPath; }
                    fs.unlinkSync(tempPath);
                }
            }
            if (targetUrl) {
                const response = await axios.get(targetUrl, {
                    responseType: 'stream',
                    timeout: CONFIG.HTTP_TIMEOUT,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                const writer = fs.createWriteStream(tempPath);
                response.data.pipe(writer);
                await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
                const size = fs.statSync(tempPath).size;
                if (size > 1024) { stats.totalDownloads++; return tempPath; }
                fs.unlinkSync(tempPath);
            }
        }
    } catch (e) {}
    
    stats.totalFailures++;
    return null;
}

// ============================================================================
// [SECTION 15] ROBLOX UPLOAD
// ============================================================================

async function uploadToRoblox(filePath, title, artist) {
    if (!CONFIG.ROBLOX_API_KEY || !CONFIG.ROBLOX_USER_ID) {
        return { success: false, error: 'ไม่ได้ตั้งค่า ROBLOX API KEY' };
    }
    try {
        const fileBuffer = fs.readFileSync(filePath);
        if (fileBuffer.length > CONFIG.MAX_FILE_SIZE) {
            return { success: false, error: `ไฟล์ใหญ่เกิน 20MB` };
        }
        const form = new FormData();
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: { creator: { userId: parseInt(CONFIG.ROBLOX_USER_ID) } }
        }), { contentType: 'application/json' });
        
        form.append('fileContent', fileBuffer, {
            filename: path.basename(filePath),
            contentType: 'audio/mpeg'
        });
        
        const response = await axios.post('https://apis.roblox.com/assets/v1/assets', form, {
            headers: { 'x-api-key': CONFIG.ROBLOX_API_KEY, ...form.getHeaders() },
            maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 180000
        });
        
        if (response.data?.assetId) {
            stats.totalUploads++;
            return { success: true, assetId: String(response.data.assetId) };
        }
        return { success: false, error: JSON.stringify(response.data).slice(0, 200) };
    } catch (error) {
        const errMsg = error.response?.data ? JSON.stringify(error.response.data).slice(0, 200) : error.message;
        return { success: false, error: errMsg };
    }
}

// ============================================================================
// [SECTION 16] PROCESS SONG
// ============================================================================

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
                    .setTitle(`⬇️ กำลังดาวน์โหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${title}**\n🎤 ${artist}\n\n${progressBar(index+1, total)}`)
                    .setColor(0xf1c40f).setThumbnail(song.cover || null)]
            }).catch(() => {});
        }
        
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        if (!audioPath) return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬆️ กำลังอัปโหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${title}**\n🎤 ${artist}\n\n${progressBar(index+1, total)}`)
                    .setColor(0x3498db).setThumbnail(song.cover || null)]
            }).catch(() => {});
        }
        
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        songs[songId] = {
            id: songId, title, artist,
            thumbnail: song.cover || null,
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error,
            source: 'joox',
            addedAt: new Date().toISOString()
        };
        
        await saveDataToJSONBin();
        try { fs.unlinkSync(audioPath); } catch (e) {}
        await refreshMessage();
        
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (error) {
        return { status: 'failed', reason: error.message };
    }
}

// ============================================================================
// [SECTION 17] REFRESH MESSAGE
// ============================================================================

let currentSongPage = 1;

async function refreshMessage() {
    if (!songChannelId) return;
    try {
        const channel = client.channels.cache.get(songChannelId);
        if (!channel) return;
        
        const { embed, currentPage, totalPages } = buildSongsPageEmbed(currentSongPage);
        const row = buildPaginationRow(currentPage, totalPages);
        currentSongPage = currentPage;
        
        const messagePayload = {
            embeds: [embed],
            components: row ? [row] : []
        };
        
        const existing = await channel.messages.fetch({ limit: 10 }).catch(() => []);
        let edited = false;
        for (const msg of existing.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                await msg.edit(messagePayload).catch(() => {});
                edited = true;
                break;
            }
        }
        if (!edited) await channel.send(messagePayload);
    } catch (error) { console.error('❌ Refresh error:', error.message); }
}

// ============================================================================
// [SECTION 18] AUTO REFRESH
// ============================================================================

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (songChannelId && !isLocked) await refreshMessage();
    }, 30000);
}

// ============================================================================
// [SECTION 19] AUTO SEARCH (ทีละ 10 เพลง วนไปเรื่อยๆ)
// ============================================================================

async function runAutoSearch(channel) {
    if (isLocked) return;
    try {
        console.log('\n🤖 Auto-search: เริ่มรอบใหม่...');
        const searchMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setDescription('กำลังดึงข้อมูลจาก JOOX')
                .setColor(0xf1c40f)]
        });
        
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) {
            await searchMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setColor(0xe67e22)] });
            return;
        }
        
        const newSongs = results.filter(s => !songs[s.id] && !isBanned(s.name || '', s.artist || ''));
        
        if (newSongs.length === 0) {
            await searchMsg.edit({ 
                embeds: [new EmbedBuilder()
                    .setTitle('⏭️ ไม่มีเพลงใหม่')
                    .setDescription('เพลงทั้งหมดมีอยู่ในคลังแล้ว')
                    .setColor(0xe67e22)] 
            });
            return;
        }
        
        const songsToProcess = newSongs.slice(0, 10);
        
        await searchMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(`🎵 กำลังเพิ่ม ${songsToProcess.length} เพลง`)
                .setDescription(`จากทั้งหมด ${newSongs.length} เพลงใหม่`)
                .setColor(0x3498db)]
        });
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < songsToProcess.length; i++) {
            const result = await processSong(songsToProcess[i], searchMsg, i, songsToProcess.length);
            if (result.status === 'success') successCount++;
            else failCount++;
            await sleep(3000);
        }
        
        await searchMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle('✅ รอบนี้เสร็จสิ้น!')
                .setDescription(`เพิ่มสำเร็จ **${successCount}** เพลง\nล้มเหลว **${failCount}** เพลง`)
                .addFields(
                    { name: '⏱️ รอรอบถัดไป', value: '60 วินาที', inline: true },
                    { name: '🔄 สถานะ', value: 'ยังทำงานอยู่ (วนไปเรื่อยๆ)', inline: true }
                )
                .setColor(0x57F287)]
        });
        
        console.log(`✅ Auto-search รอบนี้: สำเร็จ ${successCount}, ล้มเหลว ${failCount}`);
    } catch (error) {
        console.error('❌ Auto error:', error.message);
    }
}

// ============================================================================
// [SECTION 20] BOT READY
// ============================================================================

client.once('ready', async () => {
    // ✅ รอให้โหลดข้อมูลจาก JSONBin เสร็จก่อน
    let waitCount = 0;
    while (!dataLoaded && waitCount < 50) {
        await sleep(100);
        waitCount++;
    }
    if (!dataLoaded) {
        console.log('⚠️ โหลดข้อมูลไม่เสร็จ แต่เริ่มบอทต่อ');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔐 สถานะ: ${isLocked ? 'LOCKED 🔒 (ต้องใช้ /unlock)' : 'UNLOCKED 🔓 (ใช้ได้เลย)'}`);
    console.log(`📂 เพลงในคลัง: ${Object.keys(songs).length}`);
    console.log(`🔗 MUSIC_API_URL: ${CONFIG.MUSIC_API_URL}`);
    console.log(`📦 JSONBin ID: ${CONFIG.JSONBIN_ID ? 'ตั้งค่าแล้ว' : 'ไม่พบ'}`);
    console.log('='.repeat(70) + '\n');
    
    startAutoRefresh();
    
    const commands = [
        new SlashCommandBuilder().setName('unlock').setDescription('🔓 ปลดล็อกบอทด้วย Key (Admin เท่านั้น)')
            .addStringOption(o => o.setName('key').setDescription('รหัสสำหรับปลดล็อก').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('lock').setDescription('🔒 ล็อกบอทกลับ').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('status').setDescription('📊 ดูสถานะบอท').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องแสดงเพลง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ทดสอบ').setDescription('ทดสอบการเชื่อมต่อ JOOX API').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง/ศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงศิลปินทั้งหมด')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงยอดนิยม').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่มระบบอัตโนมัติ (ทีละ 10 เพลง วนไปเรื่อยๆ)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุดระบบอัตโนมัติ').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลงออกจากระบบ')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ดูคลังเพลง').setDescription('ดูรายการเพลงทั้งหมด').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('สุ่มเพลงจากคลัง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปโหลด').setDescription('เลือกเพลงจากคลังเพื่ออัปโหลดขึ้น Roblox').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('อัปโหลดทั้งหมด').setDescription('อัปโหลดเพลงทั้งหมดใน
