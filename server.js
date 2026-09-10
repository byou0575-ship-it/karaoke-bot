// ============================================================================
// KARAOKE BOT v3.1 - FULL DISPLAY EDITION (แก้ Backtick แล้ว)
// ============================================================================

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

// ============================================================================
// [SECTION 2] CONFIGURATION
// ============================================================================

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_BOT_TOKEN,
    ROBLOX_API_KEY: process.env.ROBLOX_API_KEY,
    ROBLOX_USER_ID: process.env.ROBLOX_USER_ID,
    MUSIC_API_URL: process.env.MUSIC_API_URL || 'https://joox-api.onrender.com',
    UNLOCK_KEY: 'Owjadk@#23241hxb',
    HTTP_TIMEOUT: 120000,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    MAX_SONGS_PER_UPLOAD: 50,
    RATE_LIMIT_MS: 5000,
    SONGS_PER_MSG: 10,
    SEARCH_DELETE_TIMEOUT: 15000
};

// ============================================================================
// [SECTION 3] GLOBAL STATE
// ============================================================================

let songs = {};
let songChannelId = null;
let libraryChannelId = null;
let searchChannelId = null;
let autoTask = null;
let refreshTask = null;
let isLocked = true;
let unlockAttempts = new Map();
let commandCooldowns = new Map();
let searchWelcomeMsgId = null;

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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

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
            libraryChannelId = data.libraryChannelId || null;
            searchChannelId = data.searchChannelId || null;
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
        fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ 
            channelId: songChannelId,
            libraryChannelId: libraryChannelId,
            searchChannelId: searchChannelId
        }), 'utf8');
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ isLocked }), 'utf8');
    } catch (err) {
        console.error('❌ Save error:', err.message);
    }
}

loadData();

// ============================================================================
// [SECTION 7] SECURITY
// ============================================================================

function verifyKey(inputKey) {
    if (!inputKey) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(inputKey), Buffer.from(CONFIG.UNLOCK_KEY));
    } catch { return false; }
}

function checkUnlockRateLimit(userId) {
    const now = Date.now();
    const last = unlockAttempts.get(userId) || 0;
    if (now - last < 10000) return false;
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
    if (isLocked && !['unlock', 'status'].includes(interaction.commandName)) {
        return { allowed: false, reason: '🔒 บอทถูกล็อกอยู่! ใช้ /unlock ก่อน' };
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
// [SECTION 9] UTILITIES
// ============================================================================

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

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
// [SECTION 11] GET DIRECT URL (ชั้นที่ 1)
// ============================================================================

async function getDirectUrl(songId, source = 'joox') {
    try {
        console.log(`🔗 [ชั้น 1] Direct URL for: ${songId}`);
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
        console.error(`❌ ชั้น 1: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 12] DOWNLOAD VIA STREAM (ชั้นที่ 2)
// ============================================================================

async function downloadViaStream(songId, source = 'joox') {
    try {
        console.log(`🌊 [ชั้น 2] Stream proxy: ${songId}`);
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
        console.log(`📥 [ชั้น 2] Content-Type: ${ct}`);
        if (!ct.includes('audio') && !ct.includes('octet-stream')) {
            return null;
        }
        return response.data;
    } catch (error) {
        console.error(`❌ ชั้น 2: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 13] SWITCH SOURCE (ชั้นที่ 3)
// ============================================================================

async function switchSource(songId, songName, artist, source = 'joox') {
    try {
        console.log(`🔄 [ชั้น 3] Switch source`);
        const response = await axios.get(`${CONFIG.MUSIC_API_URL}/api/v1/music/switch`, {
            params: { id: songId, source, name: songName, artist: artist },
            timeout: 90000
        });
        
        if (response.data?.url) return { type: 'url', url: response.data.url };
        if (response.data?.data?.url) return { type: 'url', url: response.data.data.url };
        if (response.data?.id) return { type: 'id', id: response.data.id, source: response.data.source };
        return null;
    } catch (error) {
        console.error(`❌ ชั้น 3: ${error.message}`);
        return null;
    }
}

// ============================================================================
// [SECTION 14] DOWNLOAD AUDIO (3 ชั้น Fallback)
// ============================================================================

async function downloadAudio(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⬇️ Downloading: ${songName} - ${artist}`);
    console.log(`${'='.repeat(60)}`);
    
    // ชั้น 1: Direct URL
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
                console.log(`✅ ชั้น 1 สำเร็จ: ${(size/1024).toFixed(1)} KB`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {
        console.error(`❌ ชั้น 1 ล้มเหลว: ${e.message}`);
    }
    
    await sleep(1500);
    
    // ชั้น 2: Stream proxy
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
                console.log(`✅ ชั้น 2 สำเร็จ: ${(size/1024).toFixed(1)} KB`);
                stats.totalDownloads++;
                return tempPath;
            }
            fs.unlinkSync(tempPath);
        }
    } catch (e) {
        console.error(`❌ ชั้น 2 ล้มเหลว: ${e.message}`);
    }
    
    await sleep(2000);
    
    // ชั้น 3: Switch source
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
                        console.log(`✅ ชั้น 3 สำเร็จ: ${(size/1024).toFixed(1)} KB`);
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
                    console.log(`✅ ชั้น 3 สำเร็จ: ${(size/1024).toFixed(1)} KB`);
                    stats.totalDownloads++;
                    return tempPath;
                }
                fs.unlinkSync(tempPath);
            }
        }
    } catch (e) {
        console.error(`❌ ชั้น 3 ล้มเหลว: ${e.message}`);
    }
    
    console.log(`❌ ทั้ง 3 ชั้นล้มเหลว: ${songName}`);
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
                    .setDescription(`🎵 **${truncate(title, 60)}**\n🎤 ${truncate(artist, 50)}\n\n${progressBar(index+1, total)}`)
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
                    .setDescription(`🎵 **${truncate(title, 60)}**\n🎤 ${truncate(artist, 50)}\n\n${progressBar(index+1, total)}`)
                    .setColor(0x3498db)
                    .setThumbnail(song.cover || null)
                ]
            }).catch(() => {});
        }
        
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        if (uploadResult.success) {
            songs[songId] = {
                id: songId,
                title,
                artist,
                thumbnail: song.cover || null,
                duration: song.duration || 0,
                robloxAssetId: uploadResult.assetId,
                robloxError: null,
                source: 'joox',
                addedAt: new Date().toISOString()
            };
            saveData();
        }
        
        try { fs.unlinkSync(audioPath); } catch (e) {}
        
        if (uploadResult.success) {
            await refreshMessage();
        }
        
        return { status: uploadResult.success ? 'success' : 'failed', song: songs[songId], uploadResult };
    } catch (error) {
        console.error(`❌ Process error: ${error.message}`);
        return { status: 'failed', reason: error.message };
    }
}

// ============================================================================
// [SECTION 17] DELETE OLD MESSAGES
// ============================================================================

async function deleteAllBotMessages(channel) {
    try {
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
                try { 
                    await msg.delete(); 
                    totalDeleted++;
                } catch (e) {}
                if (totalDeleted % 5 === 0) await sleep(500);
            }
            
            if (botMessages.size < 100) fetchMore = false;
        }
        
        console.log(`  🗑️ ลบข้อความเก่า ${totalDeleted} ข้อความใน #${channel.name}`);
    } catch (e) {
        console.error(`  ❌ Delete error: ${e.message}`);
    }
}

// ============================================================================
// [SECTION 18] BUILD SONG EMBEDS
// ============================================================================

function buildAllSongsEmbeds(channelName, songsPerMsg = CONFIG.SONGS_PER_MSG) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return [new EmbedBuilder()
            .setTitle('🎤 ' + channelName)
            .setDescription('📭 ยังไม่มีเพลงในคลัง\n💡 ใช้ /หาเพลง หรือ /เริ่มหาเพลง')
            .setColor(0x000000)
            .setFooter({ text: `📊 0 เพลง · ${new Date().toLocaleTimeString('th-TH')}` })
        ];
    }
    
    const sortedSongs = [...songList].sort((a, b) => a.title.localeCompare(b.title));
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    const totalPages = Math.ceil(sortedSongs.length / songsPerMsg);
    const embeds = [];
    
    for (let page = 0; page < totalPages; page++) {
        const start = page * songsPerMsg;
        const chunk = sortedSongs.slice(start, start + songsPerMsg);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎤 ${channelName}${totalPages > 1 ? ` (${page + 1}/${totalPages})` : ''}`)
            .setColor(0x000000);
        
        if (page === 0) {
            embed.addFields({
                name: '📊 สถิติรวม',
                value: `> 🎵 **ทั้งหมด:** ${songList.length} เพลง\n> 🟢 **นำเข้า Roblox:** ${uploaded}\n> 🔴 **รอนำเข้า:** ${pending}`,
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
            desc += `　⏱️ ${dur} · ID: ${s.id.slice(0, 10)}\n\n`;
        });
        
        embed.setDescription(desc || 'ไม่มีเพลง');
        embed.setFooter({ 
            text: `📊 ${songList.length} เพลง · 🟢 ${uploaded} · 🔴 ${pending} · หน้า ${page + 1}/${totalPages} · ${new Date().toLocaleTimeString('th-TH')}` 
        });
        embed.setTimestamp();
        embeds.push(embed);
    }
    
    return embeds;
}

// ============================================================================
// [SECTION 19] POST ALL SONGS
// ============================================================================

async function postAllSongsToChannel(channel, channelName) {
    try {
        await deleteAllBotMessages(channel);
        await sleep(1000);
        
        const embeds = buildAllSongsEmbeds(channelName);
        
        for (let i = 0; i < embeds.length; i += 10) {
            const batch = embeds.slice(i, i + 10);
            try {
                await channel.send({ embeds: batch });
                if (i + 10 < embeds.length) await sleep(1500);
            } catch (e) {
                console.error(`Send batch error: ${e.message}`);
                await sleep(3000);
            }
        }
    } catch (e) {
        console.error(`postAllSongs error: ${e.message}`);
    }
}

// ============================================================================
// [SECTION 20] REFRESH MESSAGE
// ============================================================================

async function refreshMessage() {
    if (songChannelId) {
        try {
            const channel = client.channels.cache.get(songChannelId);
            if (channel) {
                console.log(`\n📺 อัปเดตช่องแสดง: #${channel.name}`);
                await postAllSongsToChannel(channel, 'รายการเพลง Karaoke');
            }
        } catch (e) {
            console.error('Refresh display error:', e.message);
        }
    }
    
    if (libraryChannelId) {
        try {
            const channel = client.channels.cache.get(libraryChannelId);
            if (channel) {
                console.log(`\n📚 อัปเดตช่องคลัง: #${channel.name}`);
                await postAllSongsToChannel(channel, 'คลังเพลงทั้งหมด');
            }
        } catch (e) {
            console.error('Refresh library error:', e.message);
        }
    }
}

// ============================================================================
// [SECTION 21] AUTO REFRESH
// ============================================================================

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (songChannelId && !isLocked) await refreshMessage();
    }, 60000);
}

// ============================================================================
// [SECTION 22] AUTO SEARCH
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
                        .setDescription(`🎵 **${truncate(result.song.title, 60)}**\n🎤 ${truncate(result.song.artist, 50)}\n🟢 Roblox: ${result.uploadResult.assetId || 'failed'}\n\n🔄 หาใหม่ใน 90 วิ`)
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
// [SECTION 23] BOT READY
// ============================================================================

client.once('ready', async () => {
    console.log('\n' + '='.repeat(70));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`🔒 สถานะ: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
    console.log(`📂 เพลงในคลัง: ${Object.keys(songs).length}`);
    console.log(`🔗 MUSIC_API_URL: ${CONFIG.MUSIC_API_URL}`);
    console.log('='.repeat(70) + '\n');
    
    startAutoRefresh();
    
    const commands = [
        new SlashCommandBuilder()
            .setName('unlock')
            .setDescription('ปลดล็อกบอทด้วย Key')
            .addStringOption(o => o.setName('key').setDescription('รหัส').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('lock')
            .setDescription('ล็อกบอทกลับ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('ดูสถานะบอท')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่า')
            .setDescription('ตั้งค่าช่องแสดงเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่าคลังเพลง')
            .setDescription('ตั้งค่าช่องคลังเพลง')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องคลัง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่าช่องค้นหา')
            .setDescription('ตั้งค่าช่องค้นหา')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องค้นหา').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ทดสอบ')
            .setDescription('ทดสอบ API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หาเพลง')
            .setDescription('ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ศิลปิน')
            .setDescription('ดึงเพลงศิลปิน')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เพลงฮิต')
            .setDescription('เพลงยอดนิยม')
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
            .setDescription('ลบเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ดูคลังเพลง')
            .setDescription('ดูรายการเพลงทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สุ่มเพลง')
            .setDescription('สุ่มเพลง'),
        
        new SlashCommandBuilder()
            .setName('อัปโหลด')
            .setDescription('เลือกเพลงอัปโหลด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปโหลดทั้งหมด')
            .setDescription('อัปโหลดทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สถิติ')
            .setDescription('ดูสถิติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปเดตช่อง')
            .setDescription('บังคับอัปเดตทุกช่อง')
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

// ============================================================================
