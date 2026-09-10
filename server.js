// ============================================================================
// ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗    ██████╗  ██████╗ ████████╗
// ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
// █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗      ██████╔╝██║   ██║   ██║   
// ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝      ██╔══██╗██║   ██║   ██║   
// ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗    ██████╔╝╚██████╔╝   ██║   
// ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
//
// KARAOKE BOT ULTIMATE EDITION v3.2 (JSONBin + Pagination)
// - ระบบ Lock/Unlock ด้วย Key (Admin เท่านั้น)
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
    SONGS_PER_PAGE: 10 // ✅ จำนวนเพลงต่อหน้า
};

// ============================================================================
// [SECTION 3] GLOBAL STATE
// ============================================================================

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;
let isLocked = true;
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
            isLocked = data.isLocked !== undefined ? data.isLocked : true;
            console.log(`✅ Loaded ${Object.keys(songs).length} songs from JSONBin`);
        }
    } catch (err) {
        console.error('❌ JSONBin Load error:', err.message);
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
        console.log('💾 Data saved to JSONBin');
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
    return crypto.timingSafeEqual(
        Buffer.from(inputKey),
        Buffer.from(CONFIG.UNLOCK_KEY)
    );
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
// [SECTION 9.5] PAGINATION BUILDER (ใหม่)
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
// [SECTION 17] REFRESH MESSAGE (ใช้ Pagination)
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
        
        // ค้นหาข้อความเดิมของบอท
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
// [SECTION 19] AUTO SEARCH (แก้ใหม่: ทีละ 10 เพลง วนไปเรื่อยๆ)
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
        
        // ค้นหาเพลงไทย
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) {
            await searchMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setColor(0xe67e22)] });
            return;
        }
        
        // ✅ กรองเพลงที่มีอยู่แล้วออก
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
        
        // ✅ จำกัด 10 เพลงต่อรอบ
        const songsToProcess = newSongs.slice(0, 10);
        
        await searchMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(`🎵 กำลังเพิ่ม ${songsToProcess.length} เพลง`)
                .setDescription(`จากทั้งหมด ${newSongs.length} เพลงใหม่`)
                .setColor(0x3498db)]
        });
        
        let successCount = 0;
        let failCount = 0;
        
        // วนลูปเพิ่มทีละเพลง (เหมือน /เพลงฮิต)
        for (let i = 0; i < songsToProcess.length; i++) {
            const result = await processSong(songsToProcess[i], searchMsg, i, songsToProcess.length);
            if (result.status === 'success') successCount++;
            else failCount++;
            await sleep(3000); // ✅ ห่างกัน 3 วิ (เหมือน /เพลงฮิต)
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
    console.log('\n' + '='.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`);
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
        new SlashCommandBuilder().setName('อัปโหลดทั้งหมด').setDescription('อัปโหลดเพลงทั้งหมดในคลังขึ้น Roblox').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สถิติ').setDescription('ดูสถิติการใช้งานบอท').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) { console.error('❌ Register error:', e.message); }
    
    refreshMessage();
});

// ============================================================================
// [SECTION 21] INTERACTION HANDLER
// ============================================================================

client.on('interactionCreate', async interaction => {
    // ✅ จัดการ Pagination Buttons (ต้องมาก่อน isChatInputCommand)
    if (interaction.isButton() && interaction.customId.startsWith('songs_page_')) {
        return handlePaginationButton(interaction);
    }
    
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);
    
    // /unlock
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ เฉพาะ Admin เท่านั้น!').setColor(0xe74c3c)], ephemeral: true });
        if (!checkUnlockRateLimit(interaction.user.id)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ กรุณารอ 10 วินาทีก่อนลองใหม่!').setColor(0xe67e22)], ephemeral: true });
        const inputKey = options.getString('key');
        if (verifyKey(inputKey)) {
            isLocked = false;
            await saveDataToJSONBin();
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 ปลดล็อกสำเร็จ!').setDescription('บอทพร้อมใช้งานแล้ว!').setColor(0x57F287)], ephemeral: true });
        } else {
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Key ไม่ถูกต้อง!').setColor(0xe74c3c)], ephemeral: true });
        }
    }
    
    // /lock
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        isLocked = true;
        await saveDataToJSONBin();
        return interaction.reply({ embeds: [replyEmbed.setDescription('🔒 ล็อกบอทแล้ว!').setColor(0xe67e22)] });
    }
    
    // /status
    if (commandName === 'status') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📊 สถานะบอท Karaoke')
                .addFields(
                    { name: '🔒 สถานะ', value: isLocked ? '🔒 ล็อกอยู่' : '🔓 ปลดล็อกแล้ว', inline: true },
                    { name: '⏱️ ออนไลน์มา', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '📂 เพลงในคลัง', value: `${songList.length} เพลง`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded} เพลง`, inline: true },
                    { name: '🔴 ยังไม่อัปโหลด', value: `${songList.length - uploaded} เพลง`, inline: true },
                    { name: '📦 JSONBin', value: CONFIG.JSONBIN_ID ? 'เชื่อมต่อแล้ว' : 'ไม่ได้ตั้งค่า', inline: true },
                    { name: '🤖 Auto-Search', value: autoTask ? '🟢 กำลังทำงาน' : '🔴 หยุดอยู่', inline: true }
                ).setColor(isLocked ? 0xe74c3c : 0x57F287)]
        });
    }
    
    // /สถิติ
    if (commandName === 'สถิติ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        const songList = Object.values(songs);
        const byArtist = {};
        songList.forEach(s => { byArtist[s.artist] = (byArtist[s.artist] || 0) + 1; });
        const topArtists = Object.entries(byArtist).sort((a,b) => b[1]-a[1]).slice(0,5);
        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📈 สถิติการใช้งาน')
                .addFields(
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true },
                    { name: '🎵 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '⏱️ อัปไทม์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '🎤 Top 5 ศิลปิน', value: topArtists.map(([a,c]) => `${a}: ${c} เพลง`).join('\n') || 'ไม่มีข้อมูล', inline: false }
                ).setColor(0x5865F2)]
        });
    }
    
    const access = checkAccess(interaction);
    if (!access.allowed) return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(0xe74c3c)], ephemeral: true });
    if (!checkCooldown(interaction.user.id, commandName)) return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิดก่อนใช้คำสั่ง!')], ephemeral: true });
    
    // /ตั้งค่า
    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        currentSongPage = 1;
        await saveDataToJSONBin();
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงแล้ว! (มีปุ่มเลื่อนหน้า)')] });
        await refreshMessage();
    }
    
    // /ทดสอบ
    if (commandName === 'ทดสอบ') {
        await interaction.deferReply();
        const t = Date.now();
        try {
            const res = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/search`, { params: { q: 'Saran', type: 'song', sources: 'joox' }, timeout: 90000 });
            const elapsed = ((Date.now() - t) / 1000).toFixed(1);
            const list = res.data?.data?.songs || [];
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('🧪 ทดสอบ JOOX API')
                    .setDescription(`**URL:** \`${CONFIG.MUSIC_API_URL}\`\n**สถานะ:** ✅ เชื่อมต่อได้\n**เวลา:** ${elapsed} วินาที\n**จำนวนเพลง:** ${list.length}`)
                    .addFields({ name: '📋 ตัวอย่าง', value: list.length > 0 ? `🎵 ${list[0].name}\n🎤 ${list[0].artist}` : 'ไม่มี' })
                    .setColor(0x57F287)]
            });
        } catch (e) {
            await interaction.editReply({ embeds: [replyEmbed.setTitle('🧪 ทดสอบ').setDescription(`❌ ${e.message}`).setColor(0xe74c3c)] });
        }
    }
    
    // /หาเพลง
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหา: **${query}**...`)] });
        const results = await searchJoox(query);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง **${query}**`)] });
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        if (result?.status === 'success') {
            const rInfo = result.uploadResult.success ? `✅ \`${result.uploadResult.assetId}\`` : `❌ ${result.uploadResult.error}`;
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('✅ เพิ่มเพลงสำเร็จ!').setThumbnail(result.song.thumbnail)
                    .addFields(
                        { name: '🎵 เพลง', value: result.song.title, inline: true },
                        { name: '🎤 ศิลปิน', value: result.song.artist, inline: true },
                        { name: '🟢 Roblox', value: rInfo, inline: false }
                    )]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`)] });
        }
    }
    
    // /ศิลปิน
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหาเพลงของ **${artist}**...`)] });
        const results = await searchJoox(artist);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลงของ **${artist}**`)] });
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`⏳ กำลังโหลดเพลงของ ${artist}...`).setDescription(`พบ **${results.length}** เพลง`).setColor(0xf1c40f)] });
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song); else skipped.push(r.reason);
            await sleep(3000);
        }
        const summary = added.length > 0 ? added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢` : '🔴'}`).join('\n') : 'ไม่มีเพลงใหม่';
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ!`).setDescription(summary)
                .addFields({ name: '➕ สำเร็จ', value: `${added.length}`, inline: true }, { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true })
                .setColor(0x57F287)]
        });
    }
    
    // /เพลงฮิต
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง')] });
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⏳ ดึงเพลงฮิต...').setDescription(`พบ ${results.length} เพลง`).setColor(0xf1c40f)] });
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song); else skipped.push(r.reason);
            await sleep(3000);
        }
        const summary = added.map(s => `- **${s.title}**`).join('\n') || 'ไม่มีเพลงใหม่';
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ ดึงเพลงฮิตสำเร็จ!').setDescription(summary)
                .addFields({ name: '➕ สำเร็จ', value: `${added.length}`, inline: true }, { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true })
                .setColor(0x57F287)]
        });
    }
    
    // /เริ่มหาเพลง
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ระบบทำงานอยู่แล้ว!')] });
        songChannelId = interaction.channelId;
        await saveDataToJSONBin();
        await interaction.reply({ 
            embeds: [replyEmbed
                .setDescription('🚀 เริ่มระบบอัตโนมัติแล้ว!\nจะเพิ่มทีละ **10 เพลง** ทุก **60 วินาที**\n\nใช้ `/หยุดหาเพลง` เพื่อหยุด')
                .setColor(0x57F287)] 
        });
        await runAutoSearch(interaction.channel);
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch);
        }, 60000);
    }
    
    // /หยุดหาเพลง
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ หยุดระบบอัตโนมัติแล้ว!')] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงานอยู่!')] });
        }
    }
    
    // /ลบเพลง
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            delete songs[id];
            await saveDataToJSONBin();
            await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ลบ \`${id}\` แล้ว!`)] });
            await refreshMessage();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    // /ดูคลังเพลง
    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        await interaction.reply({
            embeds: [replyEmbed.setTitle('📂 สถิติคลังเพลง')
                .addFields(
                    { name: '🎵 ทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true }
                )]
        });
    }
    
    // /สุ่มเพลง
    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        const s = songList[Math.floor(Math.random() * songList.length)];
        await interaction.reply({
            embeds: [replyEmbed.setTitle('🎲 สุ่มได้เพลงนี้!')
                .addFields(
                    { name: '🎵', value: s.title, inline: true },
                    { name: '🎤', value: s.artist, inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId || 'ยังไม่อัปโหลด', inline: false }
                ).setThumbnail(s.thumbnail)]
        });
    }
    
    // /อัปโหลด
    if (commandName === 'อัปโหลด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_upload')
            .setPlaceholder('เลือกเพลงที่ต้องการอัปโหลด')
            .setMinValues(1).setMaxValues(Math.min(pending.length, 10))
            .addOptions(pending.slice(0, 25).map(s => ({
                label: s.title.slice(0, 100),
                description: `🎤 ${s.artist.slice(0, 50)}`.slice(0, 100),
                value: s.id
            })));
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📤 เลือกเพลงเพื่ออัปโหลด')
                .setDescription(`มี **${pending.length}** เพลงที่ยังไม่อัปโหลด\nเลือกได้สูงสุด 10 เพลงต่อครั้ง`)
                .setColor(0x5865F2)],
            components: [row]
        });
    }
    
    // /อัปโหลดทั้งหมด
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        await interaction.deferReply();
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยันการอัปโหลดทั้งหมด')
                .setDescription(`จะอัปโหลด **${pending.length}** เพลงขึ้น Roblox\n\n⏱️ ใช้เวลาประมาณ **${Math.ceil(pending.length * 0.5)} นาที**`)
                .setColor(0xe67e22)],
            components: [confirmRow]
        });
    }
});

// ============================================================================
// [SECTION 22] PAGINATION BUTTON HANDLER (ใหม่)
// ============================================================================

async function handlePaginationButton(interaction) {
    try {
        const songList = Object.values(songs);
        const totalPages = Math.max(1, Math.ceil(songList.length / CONFIG.SONGS_PER_PAGE));
        let newPage = currentSongPage;
        
        switch (interaction.customId) {
            case 'songs_page_first': newPage = 1; break;
            case 'songs_page_prev': newPage = Math.max(1, currentSongPage - 1); break;
            case 'songs_page_next': newPage = Math.min(totalPages, currentSongPage + 1); break;
            case 'songs_page_last': newPage = totalPages; break;
            case 'songs_page_info': return; // ปุ่มแสดงข้อมูล ไม่ต้องทำอะไร
        }
        
        currentSongPage = newPage;
        
        const { embed, currentPage, totalPages: tp } = buildSongsPageEmbed(newPage);
        const row = buildPaginationRow(currentPage, tp);
        
        await interaction.update({
            embeds: [embed],
            components: row ? [row] : []
        });
    } catch (error) {
        console.error('❌ Pagination error:', error.message);
    }
}

// ============================================================================
// [SECTION 23] COMPONENT HANDLER
// ============================================================================

async function handleComponents(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    if (isLocked) return interaction.reply({ content: '🔒 บอทถูกล็อกอยู่!', ephemeral: true });
    
    if (interaction.customId === 'select_upload') {
        const selectedIds = interaction.values;
        await interaction.deferUpdate();
        const results = { success: 0, failed: 0 };
        
        for (let i = 0; i < selectedIds.length; i++) {
            const songId = selectedIds[i];
            const song = songs[songId];
            if (!song) continue;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle(`📤 กำลังอัปโหลด ${i+1}/${selectedIds.length}`)
                    .setDescription(`🎵 **${song.title}**\n🎤 ${song.artist}\n\n${progressBar(i+1, selectedIds.length)}`)
                    .setColor(0x3498db).setThumbnail(song.thumbnail)],
                components: []
            });
            
            try {
                const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
                if (!audioPath) { results.failed++; continue; }
                const uploadResult = await uploadToRoblox(audioPath, song.title, song.artist);
                try { fs.unlinkSync(audioPath); } catch (e) {}
                
                if (uploadResult.success) {
                    songs[songId].robloxAssetId = uploadResult.assetId;
                    songs[songId].robloxError = null;
                    results.success++;
                } else {
                    songs[songId].robloxError = uploadResult.error;
                    results.failed++;
                }
                await saveDataToJSONBin();
            } catch (e) { results.failed++; }
            await sleep(2000);
        }
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ อัปโหลดเสร็จสิ้น')
                .addFields({ name: '🟢 สำเร็จ', value: `${results.success}`, inline: true }, { name: '🔴 ล้มเหลว', value: `${results.failed}`, inline: true })
                .setColor(0x57F287)]
        });
    }
    
    if (interaction.customId === 'confirm_upload_all') {
        await interaction.deferUpdate();
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        const results = { success: 0, failed: 0 };
        
        for (let i = 0; i < pending.length; i++) {
            const song = pending[i];
            const songId = song.id;
            await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle(`📤 กำลังอัปโหลดทั้งหมด ${i+1}/${pending.length}`)
                    .setDescription(`🎵 **${song.title}**\n🎤 ${song.artist}\n\n${progressBar(i+1, pending.length)}`)
                    .setColor(0x3498db).setThumbnail(song.thumbnail)],
                components: []
            });
            try {
                const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
                if (!audioPath) { results.failed++; continue; }
                const uploadResult = await uploadToRoblox(audioPath, song.title, song.artist);
                try { fs.unlinkSync(audioPath); } catch (e) {}
                if (uploadResult.success) {
                    songs[songId].robloxAssetId = uploadResult.assetId;
                    songs[songId].robloxError = null;
                    results.success++;
                } else {
                    songs[songId].robloxError = uploadResult.error;
                    results.failed++;
                }
                await saveDataToJSONBin();
            } catch (e) { results.failed++; }
            await sleep(2000);
        }
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ อัปโหลดทั้งหมดเสร็จสิ้น')
                .setDescription(`รวม **${pending.length}** เพลง`)
                .addFields({ name: '🟢 สำเร็จ', value: `${results.success}`, inline: true }, { name: '🔴 ล้มเหลว', value: `${results.failed}`, inline: true })
                .setColor(0x57F287)]
        });
    }
    
    if (interaction.customId === 'cancel_upload_all') {
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ ยกเลิกแล้ว').setColor(0xe74c3c)],
            components: []
        });
    }
}

// ============================================================================
// [SECTION 24] LOGIN
// ============================================================================

client.login(CONFIG.DISCORD_TOKEN);

// ============================================================================
// END OF FILE
// ============================================================================
