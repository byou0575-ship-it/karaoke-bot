// ============================================================================
// ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗    ██████╗  ██████╗ ████████╗
// ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
// █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗      ██████╔╝██║   ██║   ██║   
// ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝      ██╔══██╗██║   ██║   ██║   
// ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗    ██████╔╝╚██████╔╝   ██║   
// ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
//
// KARAOKE BOT ULTIMATE EDITION v3.0
// - ระบบ Lock/Unlock ด้วย Key (Admin เท่านั้น)
// - ระบบ Fallback 3 ชั้นสำหรับดาวน์โหลด
// - ระบบเลือกอัปโหลดเพลงขึ้น Roblox
// - ระบบอัปโหลดทั้งหมด
// - ระบบ Auto-Search
// - UI แสดงผลแบบละเอียด
// - Content Filter
// - Rate Limiting
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
    UNLOCK_KEY: 'Owjadk@#23241hxb', // ⚠️ Key สำหรับปลดล็อกบอท
    HTTP_TIMEOUT: 120000,
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    MAX_SONGS_PER_UPLOAD: 50,
    RATE_LIMIT_MS: 5000 // 5 วินาทีต่อคำสั่ง
};

// ============================================================================
// [SECTION 3] GLOBAL STATE
// ============================================================================

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;
let isLocked = true; // 🔒 บอทเริ่มต้นในสถานะล็อก
let unlockAttempts = new Map(); // rate limit สำหรับ unlock
let commandCooldowns = new Map(); // rate limit สำหรับ commands
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
// [SECTION 6] DATA STORAGE
// ============================================================================

const SONGS_FILE = '/tmp/songs.json';
const CHANNEL_FILE = '/tmp/channel.json';
const LOCK_FILE = '/tmp/lock_state.json';

function loadData() {
    try {
        if (fs.existsSync(SONGS_FILE)) {
            songs = JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8'));
            console.log(`📂 Loaded ${Object.keys(songs).length} songs`);
        }
        if (fs.existsSync(CHANNEL_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
            songChannelId = data.channelId || null;
        }
        if (fs.existsSync(LOCK_FILE)) {
            const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
            isLocked = lockData.isLocked !== false;
        }
    } catch (err) {
        console.error('❌ Load error:', err.message);
    }
}

function saveData() {
    try {
        fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8');
        fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ channelId: songChannelId }), 'utf8');
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ isLocked }), 'utf8');
    } catch (err) {
        console.error('❌ Save error:', err.message);
    }
}

loadData();

// ============================================================================
// [SECTION 7] SECURITY FUNCTIONS
// ============================================================================

// ตรวจสอบ Key
function verifyKey(inputKey) {
    if (!inputKey) return false;
    return crypto.timingSafeEqual(
        Buffer.from(inputKey),
        Buffer.from(CONFIG.UNLOCK_KEY)
    );
}

// Rate limit สำหรับ Unlock
function checkUnlockRateLimit(userId) {
    const now = Date.now();
    const lastAttempt = unlockAttempts.get(userId) || 0;
    if (now - lastAttempt < 10000) {
        return false;
    }
    unlockAttempts.set(userId, now);
    return true;
}

// Rate limit สำหรับ Command
function checkCooldown(userId, command) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    const lastUse = commandCooldowns.get(key) || 0;
    if (now - lastUse < CONFIG.RATE_LIMIT_MS) {
        return false;
    }
    commandCooldowns.set(key, now);
    return true;
}

// ตรวจสอบ Admin
function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// ตรวจสอบสิทธิ์ + Lock
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

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        console.log(`🔗 [Layer 1] Direct URL for: ${songId}`);
        
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
        console.error(`❌ Layer 1: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 12] DOWNLOAD VIA STREAM
// ============================================================================

async function downloadViaStream(songId, source = 'joox') {
    try {
        console.log(`🌊 [Layer 2] Stream proxy: ${songId}`);
        
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
        if (!ct.includes('audio') && !ct.includes('octet-stream')) {
            return null;
        }
        return response.data;
    } catch (error) {
        console.error(`❌ Layer 2: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 13] SWITCH SOURCE
// ============================================================================

async function switchSource(songId, songName, artist, source = 'joox') {
    try {
        console.log(`🔄 [Layer 3] Switch source`);
        
        const response = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/switch`, {
            params: { id: songId, source, name: songName, artist: artist },
            timeout: 90000
        });
        
        if (response.data?.url) return { type: 'url', url: response.data.url };
        if (response.data?.data?.url) return { type: 'url', url: response.data.data.url };
        if (response.data?.id) return { type: 'id', id: response.data.id, source: response.data.source };
        
        return null;
    } catch (error) {
        console.error(`❌ Layer 3: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 14] DOWNLOAD AUDIO (FALLBACK 3 LAYERS)
// ============================================================================

async function downloadAudio(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⬇️ Downloading: ${songName} - ${artist}`);
    console.log(`${'='.repeat(60)}`);
    
    // Layer 1: Direct URL
    try {
        const directUrl = await getDirectUrl(songId, source);
        if (directUrl) {
            const response = await axios.get(directUrl, {
                responseType: 'stream',
                timeout: CONFIG.HTTP_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'audio/*,*/*',
                    'Referer': 'https://www.joox.com/'
                }
            });
            
            const writer = fs.createWriteStream(tempPath);
            response.data.pipe(writer);
            await new Promise((res, rej) => {
                writer.on('finish', res);
                writer.on('error', rej);
            });
            
            const size = fs.statSync(tempPath).size;
            if (size > 1024) {
                console.log(`✅ Layer 1 success: ${(size/1024).toFixed(1)} KB`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {
        console.error(`❌ Layer 1 failed: ${e.message}`);
    }
    
    // Layer 2: Stream proxy
    try {
        const stream = await downloadViaStream(songId, source);
        if (stream) {
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            await new Promise((res, rej) => {
                writer.on('finish', res);
                writer.on('error', rej);
            });
            
            const size = fs.statSync(tempPath).size;
            if (size > 1024) {
                console.log(`✅ Layer 2 success: ${(size/1024).toFixed(1)} KB`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {
        console.error(`❌ Layer 2 failed: ${e.message}`);
    }
    
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
                    await new Promise((res, rej) => {
                        writer.on('finish', res);
                        writer.on('error', rej);
                    });
                    const size = fs.statSync(tempPath).size;
                    if (size > 1024) {
                        console.log(`✅ Layer 3 success: ${(size/1024).toFixed(1)} KB`);
                        stats.totalDownloads++;
                        return tempPath;
                    }
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
                await new Promise((res, rej) => {
                    writer.on('finish', res);
                    writer.on('error', rej);
                });
                const size = fs.statSync(tempPath).size;
                if (size > 1024) {
                    console.log(`✅ Layer 3 success: ${(size/1024).toFixed(1)} KB`);
                    stats.totalDownloads++;
                    return tempPath;
                }
                fs.unlinkSync(tempPath);
            }
        }
    } catch (e) {
        console.error(`❌ Layer 3 failed: ${e.message}`);
    }
    
    console.log(`❌ All layers failed for: ${songName}`);
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
        
        console.log(`📤 Uploading to Roblox: ${title}`);
        
        const form = new FormData();
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: {
                creator: { userId: parseInt(CONFIG.ROBLOX_USER_ID) }
            }
        }), { contentType: 'application/json' });
        
        form.append('fileContent', fileBuffer, {
            filename: path.basename(filePath),
            contentType: 'audio/mpeg'
        });
        
        const response = await axios.post(
            'https://apis.roblox.com/assets/v1/assets',
            form,
            {
                headers: {
                    'x-api-key': CONFIG.ROBLOX_API_KEY,
                    ...form.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 180000
            }
        );
        
        if (response.data?.assetId) {
            console.log(`✅ Roblox Asset ID: ${response.data.assetId}`);
            stats.totalUploads++;
            return { success: true, assetId: String(response.data.assetId) };
        }
        
        return { success: false, error: JSON.stringify(response.data).slice(0, 200) };
    } catch (error) {
        const errMsg = error.response?.data
            ? JSON.stringify(error.response.data).slice(0, 200)
            : error.message;
        console.error(`❌ Roblox error: ${errMsg}`);
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
    
    console.log(`\n🎵 [${index+1}/${total}] ${title}`);
    
    if (songs[songId]) return { status: 'skipped', reason: 'มีอยู่แล้ว' };
    if (isBanned(title, artist)) return { status: 'banned', reason: 'ถูกคัดกรอง' };
    
    try {
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬇️ กำลังดาวน์โหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${title}**\n🎤 ${artist}\n\n${progressBar(index+1, total)}`)
                    .setColor(0xf1c40f)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        if (!audioPath) return { status: 'failed', reason: 'ดาวน์โหลดไม่ได้' };
        
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⬆️ กำลังอัปโหลด ${index+1}/${total}`)
                    .setDescription(`🎵 **${title}**\n🎤 ${artist}\n\n${progressBar(index+1, total)}`)
                    .setColor(0x3498db)
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
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error,
            source: 'joox',
            addedAt: new Date().toISOString()
        };
        saveData();
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        await refreshMessage();
        
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (error) {
        console.error(`❌ Process error: ${error.message}`);
        return { status: 'failed', reason: error.message };
    }
}

// ============================================================================
// [SECTION 17] REFRESH MESSAGE
// ============================================================================

async function refreshMessage() {
    if (!songChannelId) return;
    
    try {
        const channel = client.channels.cache.get(songChannelId);
        if (!channel) return;
        
        const songList = Object.values(songs);
        
        if (songList.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎤 รายการเพลง Karaoke')
                .setDescription('*ยังไม่มีเพลง — ใช้ `/หาเพลง`*')
                .setColor(0x000000)
                .setFooter({ text: `อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });
            
            const existing = await channel.messages.fetch({ limit: 5 }).catch(() => []);
            for (const msg of existing.values()) {
                if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                    await msg.edit({ embeds: [embed] }).catch(() => {});
                    return;
                }
            }
            await channel.send({ embeds: [embed] });
            return;
        }
        
        // แสดงทีละ 10 เพลง + แบ่งหน้า
        const chunk = songList.slice(0, 10);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        const embed = new EmbedBuilder()
            .setTitle('🎤 รายการเพลง Karaoke (JOOX)')
            .setColor(0x000000)
            .setFooter({ 
                text: `รวม ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${songList.length - uploaded} · ${new Date().toLocaleTimeString('th-TH')}`
            });
        
        let desc = '';
        chunk.forEach((s, i) => {
            const r = s.robloxAssetId ? `🟢 \`${s.robloxAssetId}\`` : `🔴 ยังไม่อัปโหลด`;
            desc += `**${i+1}. ${s.title}**\n　🎤 ${s.artist}\n　${r}\n\n`;
        });
        embed.setDescription(desc);
        
        const existing = await channel.messages.fetch({ limit: 10 }).catch(() => []);
        let edited = false;
        for (const msg of existing.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                await msg.edit({ embeds: [embed] }).catch(() => {});
                edited = true;
                break;
            }
        }
        if (!edited) await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('❌ Refresh error:', error.message);
    }
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
// [SECTION 19] AUTO SEARCH
// ============================================================================

async function runAutoSearch(channel) {
    if (isLocked) return;
    
    try {
        console.log('\n🤖 Auto-search: เริ่ม...');
        const searchMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setColor(0xf1c40f)
            ]
        });
        
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) {
            await searchMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setColor(0xe67e22)] });
            return;
        }
        
        for (let i = 0; i < results.length; i++) {
            const result = await processSong(results[i], searchMsg, i, results.length);
            if (result.status === 'success') {
                await searchMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .setDescription(`🎵 **${result.song.title}**\n🎤 ${result.song.artist}\n🟢 Roblox: ${result.uploadResult.assetId || 'failed'}\n\n🔄 หาใหม่ใน 60 วิ`)
                        .setColor(0x57F287)
                    ]
                });
                return;
            }
        }
        
        await searchMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่มีเพลงใหม่').setColor(0xe67e22)] });
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
    console.log('='.repeat(70) + '\n');
    
    startAutoRefresh();
    
    const commands = [
        new SlashCommandBuilder()
            .setName('unlock')
            .setDescription('🔓 ปลดล็อกบอทด้วย Key (Admin เท่านั้น)')
            .addStringOption(o => o
                .setName('key')
                .setDescription('รหัสสำหรับปลดล็อก')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('lock')
            .setDescription('🔒 ล็อกบอทกลับ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('📊 ดูสถานะบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่า')
            .setDescription('ตั้งค่าช่องแสดงเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ทดสอบ')
            .setDescription('ทดสอบการเชื่อมต่อ JOOX API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หาเพลง')
            .setDescription('ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง/ศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ศิลปิน')
            .setDescription('ดึงเพลงศิลปินทั้งหมด')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เพลงฮิต')
            .setDescription('ดึงเพลงยอดนิยม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เริ่มหาเพลง')
            .setDescription('เริ่มระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หยุดหาเพลง')
            .setDescription('หยุดระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ลบเพลง')
            .setDescription('ลบเพลงออกจากระบบ')
            .addStringOption(o => o.setName('id').setDescription('ID เพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ดูคลังเพลง')
            .setDescription('ดูรายการเพลงทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สุ่มเพลง')
            .setDescription('สุ่มเพลงจากคลัง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🆕 คำสั่งใหม่: อัปโหลดเพลงที่เลือก
        new SlashCommandBuilder()
            .setName('อัปโหลด')
            .setDescription('เลือกเพลงจากคลังเพื่ออัปโหลดขึ้น Roblox')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🆕 คำสั่งใหม่: อัปโหลดทั้งหมด
        new SlashCommandBuilder()
            .setName('อัปโหลดทั้งหมด')
            .setDescription('อัปโหลดเพลงทั้งหมดในคลังขึ้น Roblox')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        // 🆕 คำสั่งใหม่: สถิติ
        new SlashCommandBuilder()
            .setName('สถิติ')
            .setDescription('ดูสถิติการใช้งานบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) {
        console.error('❌ Register error:', e.message);
    }
    
    refreshMessage();
});

// ============================================================================
// [SECTION 21] INTERACTION HANDLER
// ============================================================================

client.on('interactionCreate', async interaction => {
    // จัดการ Select Menu และ Button
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);
    
    // -------------------------------------------------------------------------
    // 🔓 /unlock
    // -------------------------------------------------------------------------
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('❌ เฉพาะ Admin เท่านั้น!').setColor(0xe74c3c)],
                ephemeral: true
            });
        }
        
        if (!checkUnlockRateLimit(interaction.user.id)) {
            return interaction.reply({
                embeds: [replyEmbed.setDescription('⏱️ กรุณารอ 10 วินาทีก่อนลองใหม่!').setColor(0xe67e22)],
                ephemeral: true
            });
        }
        
        const inputKey = options.getString('key');
        
        if (verifyKey(inputKey)) {
            isLocked = false;
            saveData();
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🔓 ปลดล็อกสำเร็จ!')
                    .setDescription('บอทพร้อมใช้งานแล้ว! ใช้คำสั่งต่างๆ ได้เลย')
                    .setColor(0x57F287)
                ],
                ephemeral: true
            });
        } else {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Key ไม่ถูกต้อง!')
                    .setDescription('กรุณาตรวจสอบ Key แล้วลองใหม่')
                    .setColor(0xe74c3c)
                ],
                ephemeral: true
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // 🔒 /lock
    // -------------------------------------------------------------------------
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        }
        isLocked = true;
        saveData();
        return interaction.reply({
            embeds: [replyEmbed.setDescription('🔒 ล็อกบอทแล้ว! ใช้ /unlock เพื่อปลดล็อก').setColor(0xe67e22)]
        });
    }
    
    // -------------------------------------------------------------------------
    // 📊 /status
    // -------------------------------------------------------------------------
    if (commandName === 'status') {
        if (!isAdmin(interaction)) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        }
        
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📊 สถานะบอท Karaoke')
                .addFields(
                    { name: '🔒 สถานะ', value: isLocked ? '🔒 ล็อกอยู่' : '🔓 ปลดล็อกแล้ว', inline: true },
                    { name: '⏱️ ออนไลน์มา', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '🌐 API', value: CONFIG.MUSIC_API_URL, inline: false },
                    { name: '📂 เพลงในคลัง', value: `${songList.length} เพลง`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded} เพลง`, inline: true },
                    { name: '🔴 ยังไม่อัปโหลด', value: `${songList.length - uploaded} เพลง`, inline: true },
                    { name: '🔍 ค้นหาทั้งหมด', value: `${stats.totalSearches} ครั้ง`, inline: true },
                    { name: '⬇️ ดาวน์โหลดสำเร็จ', value: `${stats.totalDownloads} ครั้ง`, inline: true },
                    { name: '📤 อัปโหลดสำเร็จ', value: `${stats.totalUploads} ครั้ง`, inline: true }
                )
                .setColor(isLocked ? 0xe74c3c : 0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // 📈 /สถิติ
    // -------------------------------------------------------------------------
    if (commandName === 'สถิติ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const songList = Object.values(songs);
        const byArtist = {};
        songList.forEach(s => {
            byArtist[s.artist] = (byArtist[s.artist] || 0) + 1;
        });
        const topArtists = Object.entries(byArtist).sort((a,b) => b[1]-a[1]).slice(0,5);
        
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📈 สถิติการใช้งาน')
                .addFields(
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true },
                    { name: '🎵 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '⏱️ อัปไทม์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { 
                        name: '🎤 Top 5 ศิลปิน', 
                        value: topArtists.map(([a,c]) => `${a}: ${c} เพลง`).join('\n') || 'ไม่มีข้อมูล', 
                        inline: false 
                    }
                )
                .setColor(0x5865F2)
            ]
        });
    }
    
    // ตรวจสอบ Lock
    const access = checkAccess(interaction);
    if (!access.allowed) {
        return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(0xe74c3c)], ephemeral: true });
    }
    
    // ตรวจสอบ Cooldown
    if (!checkCooldown(interaction.user.id, commandName)) {
        return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิดก่อนใช้คำสั่ง!')], ephemeral: true });
    }
    
    // -------------------------------------------------------------------------
    // ⚙️ /ตั้งค่า
    // -------------------------------------------------------------------------
    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงแล้ว!')] });
        await refreshMessage();
    }
    
    // -------------------------------------------------------------------------
    // 🧪 /ทดสอบ
    // -------------------------------------------------------------------------
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
                        value: list.length > 0 ? `🎵 ${list[0].name}\n🎤 ${list[0].artist}` : 'ไม่มี'
                    })
                    .setColor(0x57F287)
                ]
            });
        } catch (e) {
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('🧪 ทดสอบ').setDescription(`❌ ${e.message}`).setColor(0xe74c3c)]
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // 🔍 /หาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหา: **${query}**...`)] });
        
        const results = await searchJoox(query);
        if (results.length === 0) {
            return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง **${query}**`)] });
        }
        
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        
        if (result?.status === 'success') {
            const rInfo = result.uploadResult.success ? `✅ \`${result.uploadResult.assetId}\`` : `❌ ${result.uploadResult.error}`;
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .addFields(
                        { name: '🎵 เพลง', value: result.song.title, inline: true },
                        { name: '🎤 ศิลปิน', value: result.song.artist, inline: true },
                        { name: '🟢 Roblox', value: rInfo, inline: false }
                    )
                ]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`)] });
        }
    }
    
    // -------------------------------------------------------------------------
    // 🎤 /ศิลปิน
    // -------------------------------------------------------------------------
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหาเพลงของ **${artist}**...`)] });
        
        const results = await searchJoox(artist);
        if (results.length === 0) {
            return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลงของ **${artist}**`)] });
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`⏳ กำลังโหลดเพลงของ ${artist}...`)
                .setDescription(`พบ **${results.length}** เพลง`)
                .setColor(0xf1c40f)
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
            ? added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢` : '🔴'}`).join('\n')
            : 'ไม่มีเพลงใหม่';
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ!`)
                .setDescription(summary)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // 🔥 /เพลงฮิต
    // -------------------------------------------------------------------------
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) {
            return interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง')] });
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('⏳ ดึงเพลงฮิต...').setDescription(`พบ ${results.length} เพลง`).setColor(0xf1c40f)]
        });
        
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
        }
        
        const summary = added.map(s => `- **${s.title}**`).join('\n') || 'ไม่มีเพลงใหม่';
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ดึงเพลงฮิตสำเร็จ!')
                .setDescription(summary)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // 🚀 /เริ่มหาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ระบบทำงานอยู่แล้ว!')] });
        }
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('🚀 เริ่มระบบอัตโนมัติ!')] });
        await runAutoSearch(interaction.channel);
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch);
        }, 60000);
    }
    
    // -------------------------------------------------------------------------
    // ⏹️ /หยุดหาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ หยุดแล้ว!')] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงานอยู่!')] });
        }
    }
    
    // -------------------------------------------------------------------------
    // 🗑️ /ลบเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            delete songs[id];
            saveData();
            await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ลบ \`${id}\` แล้ว!`)] });
            await refreshMessage();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    // -------------------------------------------------------------------------
    // 📂 /ดูคลังเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('📂 สถิติคลังเพลง')
                .addFields(
                    { name: '🎵 ทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true }
                )
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // 🎲 /สุ่มเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        }
        const s = songList[Math.floor(Math.random() * songList.length)];
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .addFields(
                    { name: '🎵', value: s.title, inline: true },
                    { name: '🎤', value: s.artist, inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId || 'ยังไม่อัปโหลด', inline: false }
                )
                .setThumbnail(s.thumbnail)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // 📤 /อัปโหลด (Select Menu)
    // -------------------------------------------------------------------------
    if (commandName === 'อัปโหลด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        }
        
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_upload')
            .setPlaceholder('เลือกเพลงที่ต้องการอัปโหลด')
            .setMinValues(1)
            .setMaxValues(Math.min(pending.length, 10))
            .addOptions(
                pending.slice(0, 25).map(s => ({
                    label: s.title.slice(0, 100),
                    description: `🎤 ${s.artist.slice(0, 50)}`.slice(0, 100),
                    value: s.id
                }))
            );
        
        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📤 เลือกเพลงเพื่ออัปโหลด')
                .setDescription(`มี **${pending.length}** เพลงที่ยังไม่อัปโหลด\nเลือกได้สูงสุด 10 เพลงต่อครั้ง`)
                .setColor(0x5865F2)
            ],
            components: [row]
        });
    }
    
    // -------------------------------------------------------------------------
    // 📤 /อัปโหลดทั้งหมด
    // -------------------------------------------------------------------------
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        }
        
        await interaction.deferReply();
        
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('⚠️ ยืนยันการอัปโหลดทั้งหมด')
                .setDescription(`จะอัปโหลด **${pending.length}** เพลงขึ้น Roblox\n\n⏱️ ใช้เวลาประมาณ **${Math.ceil(pending.length * 0.5)} นาที**`)
                .setColor(0xe67e22)
            ],
            components: [confirmRow]
        });
    }
});

// ============================================================================
// [SECTION 22] COMPONENT HANDLER (Select Menu + Button)
// ============================================================================

async function handleComponents(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    }
    if (isLocked) {
        return interaction.reply({ content: '🔒 บอทถูกล็อกอยู่!', ephemeral: true });
    }
    
    // -------------------------------------------------------------------------
    // Select Menu: เลือกเพลงเพื่ออัปโหลด
    // -------------------------------------------------------------------------
    if (interaction.customId === 'select_upload') {
        const selectedIds = interaction.values;
        await interaction.deferUpdate();
        
        const results = { success: 0, failed: 0 };
        
        for (let i = 0; i < selectedIds.length; i++) {
            const songId = selectedIds[i];
            const song = songs[songId];
            if (!song) continue;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 กำลังอัปโหลด ${i+1}/${selectedIds.length}`)
                    .setDescription(`🎵 **${song.title}**\n🎤 ${song.artist}\n\n${progressBar(i+1, selectedIds.length)}`)
                    .setColor(0x3498db)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
            });
            
            try {
                const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
                if (!audioPath) {
                    results.failed++;
                    continue;
                }
                
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
                saveData();
            } catch (e) {
                results.failed++;
            }
            
            await sleep(2000);
        }
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดเสร็จสิ้น')
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${results.success}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${results.failed}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // Button: ยืนยันอัปโหลดทั้งหมด
    // -------------------------------------------------------------------------
    if (interaction.customId === 'confirm_upload_all') {
        await interaction.deferUpdate();
        
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        const results = { success: 0, failed: 0 };
        
        for (let i = 0; i < pending.length; i++) {
            const song = pending[i];
            const songId = song.id;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📤 กำลังอัปโหลดทั้งหมด ${i+1}/${pending.length}`)
                    .setDescription(`🎵 **${song.title}**\n🎤 ${song.artist}\n\n${progressBar(i+1, pending.length)}`)
                    .setColor(0x3498db)
                    .setThumbnail(song.thumbnail)
                ],
                components: []
            });
            
            try {
                const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
                if (!audioPath) {
                    results.failed++;
                    continue;
                }
                
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
                saveData();
            } catch (e) {
                results.failed++;
            }
            
            await sleep(2000);
        }
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ อัปโหลดทั้งหมดเสร็จสิ้น')
                .setDescription(`รวม **${pending.length}** เพลง`)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${results.success}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${results.failed}`, inline: true }
                )
                .setColor(0x57F287)
            ]
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
// [SECTION 23] LOGIN
// ============================================================================

client.login(CONFIG.DISCORD_TOKEN);

// ============================================================================
// END OF FILE
// ============================================================================
