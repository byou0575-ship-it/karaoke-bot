// ============================================================================
// KARAOKE BOT v3.1 - FULL DISPLAY EDITION
// อ้างอิงจาก v3.0 (ทำงานได้) + เพิ่มระบบแสดงเพลงทั้งหมด + ค้นหาช่อง
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
    SONGS_PER_MSG: 10, // ★ แสดง 10 เพลงต่อ 1 ข้อความ
    SEARCH_DELETE_TIMEOUT: 15000 // ★ ลบข้อความค้นหาใน 15 วิ
};

// ============================================================================
// [SECTION 3] GLOBAL STATE
// ============================================================================

let songs = {};
let songChannelId = null;
let libraryChannelId = null; // ★ ช่องคลังเพลง
let searchChannelId = null; // ★ ช่องค้นหา
let autoTask = null;
let refreshTask = null;
let isLocked = true;
let unlockAttempts = new Map();
let commandCooldowns = new Map();

// ★ เก็บ message IDs ที่ bot ส่งไว้ในช่องค้นหา
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
        return { allowed: false, reason: '🔒 บอทถูกล็อกอยู่! ใช้ `/unlock` ก่อน' };
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
// [SECTION 10] JOOX SEARCH (คงเดิมจาก v3.0)
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
// [SECTION 14] DOWNLOAD AUDIO (3 ชั้น Fallback - คงเดิมจาก v3.0)
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
        
        // ★ เพิ่มเข้าคลังเฉพาะเมื่อ upload สำเร็จ
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
// ★★★ [SECTION 17] ลบข้อความเก่าทั้งหมดในช่อง ★★★
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
                // หน่วงเวลาเล็กน้อยกัน rate limit
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
// ★★★ [SECTION 18] สร้าง Embeds แสดงเพลงทั้งหมด ★★★
// ============================================================================

function buildAllSongsEmbeds(channelName, songsPerMsg = CONFIG.SONGS_PER_MSG) {
    const songList = Object.values(songs);
    
    if (songList.length === 0) {
        return [new EmbedBuilder()
            .setTitle('🎤 ' + channelName)
            .setDescription('```\n📭 ยังไม่มีเพลงในคลัง\n```\n💡 ใช้ `/หาเพลง` หรือ `/เริ่มหาเพลง`')
            .setColor(0x000000)
            .setFooter({ text: `📊 0 เพลง · ${new Date().toLocaleTimeString('th-TH')}` })
        ];
    }
    
    // ★ เรียงตามชื่อ
    const sortedSongs = [...songList].sort((a, b) => a.title.localeCompare(b.title));
    
    const uploaded = songList.filter(s => s.robloxAssetId).length;
    const pending = songList.length - uploaded;
    
    // ★ แบ่งหน้า
    const totalPages = Math.ceil(sortedSongs.length / songsPerMsg);
    const embeds = [];
    
    for (let page = 0; page < totalPages; page++) {
        const start = page * songsPerMsg;
        const chunk = sortedSongs.slice(start, start + songsPerMsg);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎤 ${channelName}${totalPages > 1 ? ` (${page + 1}/${totalPages})` : ''}`)
            .setColor(0x000000);
        
        // หน้าแรกใส่สถิติ
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
        
        embeds.push(embed);
    }
    
    return embeds;
}

// ★★★ [SECTION 19] Post เพลงทั้งหมด (ลบเก่า + สร้างใหม่) ★★★
// ============================================================================

async function postAllSongsToChannel(channel, channelName) {
    try {
        // ★ ลบข้อความเก่าทั้งหมดก่อน
        await deleteAllBotMessages(channel);
        await sleep(1000);
        
        // ★ สร้าง Embeds ใหม่
        const embeds = buildAllSongsEmbeds(channelName);
        
        // ★ ส่งทีละ batch (Discord จำกัด 10 embeds ต่อข้อความ)
        for (let i = 0; i < embeds.length; i += 10) {
            const batch = embeds.slice(i, i + 10);
            try {
                await channel.send({ embeds: batch });
                // หน่วง 1.5 วิ ระหว่าง batch กัน rate limit
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
// [SECTION 20] REFRESH MESSAGE (อัปเดตช่องแสดงเพลงทั้งหมด)
// ============================================================================

async function refreshMessage() {
    // อัปเดตช่องแสดงหลัก
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
    
    // ★ อัปเดตช่องคลัง (ถ้ามี)
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
    }, 60000); // ★ ทุก 1 นาที
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
// [SECTION 23] BOT READY
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
            .setDescription('🔓 ปลดล็อกบอทด้วย Key')
            .addStringOption(o => o.setName('key').setDescription('รหัส').setRequired(true))
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
            .setDescription('⚙️ ตั้งค่าช่องแสดงเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่าคลังเพลง')
            .setDescription('📚 ตั้งค่าช่องคลังเพลง (ทุกคนเห็น)')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องคลัง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ตั้งค่าช่องค้นหา')
            .setDescription('🔍 ตั้งค่าช่องค้นหา (พิมพ์ตรง)')
            .addChannelOption(o => o.setName('ช่อง').setDescription('ช่องค้นหา').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ทดสอบ')
            .setDescription('🧪 ทดสอบ API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หาเพลง')
            .setDescription('🔍 ค้นหาและเพิ่มเพลง')
            .addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ศิลปิน')
            .setDescription('🎤 ดึงเพลงศิลปิน')
            .addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เพลงฮิต')
            .setDescription('🔥 เพลงยอดนิยม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เริ่มหาเพลง')
            .setDescription('🚀 เริ่มระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หยุดหาเพลง')
            .setDescription('⏹️ หยุดระบบอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ลบเพลง')
            .setDescription('🗑️ ลบเพลง')
            .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ดูคลังเพลง')
            .setDescription('📂 ดูรายการเพลงทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สุ่มเพลง')
            .setDescription('🎲 สุ่มเพลง (ทุกคน)'),
        
        new SlashCommandBuilder()
            .setName('อัปโหลด')
            .setDescription('📤 เลือกเพลงอัปโหลด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปโหลดทั้งหมด')
            .setDescription('📤 อัปโหลดทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สถิติ')
            .setDescription('📈 ดูสถิติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('อัปเดตช่อง')
            .setDescription('🔄 บังคับอัปเดตทุกช่อง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered!');
    } catch (e) {
        console.error('❌ Register error:', e.message);
    }
    
    // อัปเดตครั้งแรก
    await refreshMessage();
});

// ============================================================================
// ★★★ [SECTION 24] MESSAGE LISTENER (ช่องค้นหา) ★★★
// ============================================================================

client.on('messageCreate', async message => {
    // ข้าม bot
    if (message.author.bot) return;
    
    // ★ เช็คว่าเป็นช่องค้นหาหรือไม่
    if (!searchChannelId || message.channelId !== searchChannelId) return;
    
    // ★ ข้ามข้อความต้อนรับของ bot เอง
    if (searchWelcomeMsgId && message.id === searchWelcomeMsgId) return;
    
    const query = message.content.trim();
    if (!query) return;
    
    // ★ ลบข้อความผู้ใช้ทันที
    try { await message.delete(); } catch (e) {}
    
    // Rate limit
    if (!checkCooldown(message.author.id, 'search_msg')) return;
    
    // ★ ค้นหา
    const results = searchSongs(query);
    
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
            .setColor(0xe74c3c)
            .setFooter({ text: `📊 คลังมี ${Object.keys(songs).length} เพลง` });
    } else {
        const displayed = results.slice(0, 15);
        embed = new EmbedBuilder()
            .setTitle(`🔍 "${truncate(query, 40)}"`)
            .setDescription(
                `✅ **พบ ${results.length} เพลง**${results.length > 15 ? ' (แสดง 15 เพลงแรก)' : ''}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .setColor(0x57F287)
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
        // ★ reply กับข้อความผู้ใช้ → แสดงเฉพาะเขา
        const reply = await message.reply({ embeds: [embed] });
        
        // ★ ลบ reply ใน 15 วิ
        setTimeout(async () => {
            try { await reply.delete(); } catch (e) {}
        }, CONFIG.SEARCH_DELETE_TIMEOUT);
    } catch (e) {
        console.error('Reply error:', e.message);
    }
});

// ============================================================================
// [SECTION 25] INTERACTION HANDLER
// ============================================================================

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        return handleComponents(interaction);
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);
    
    // ─────────────────────────────────────────────
    // 🔓 /unlock
    // ─────────────────────────────────────────────
    if (commandName === 'unlock') {
        if (!isAdmin(interaction)) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!').setColor(0xe74c3c)], ephemeral: true });
        }
        if (!checkUnlockRateLimit(interaction.user.id)) {
            return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รอ 10 วินาที!').setColor(0xe67e22)], ephemeral: true });
        }
        
        const inputKey = options.getString('key');
        if (verifyKey(inputKey)) {
            isLocked = false;
            saveData();
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle('🔓 ปลดล็อกสำเร็จ!').setDescription('บอทพร้อมใช้งาน!').setColor(0x57F287)],
                ephemeral: true
            });
        } else {
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle('❌ Key ไม่ถูกต้อง!').setColor(0xe74c3c)],
                ephemeral: true
            });
        }
    }
    
    // ─────────────────────────────────────────────
    // 🔒 /lock
    // ─────────────────────────────────────────────
    if (commandName === 'lock') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        isLocked = true;
        saveData();
        return interaction.reply({ embeds: [replyEmbed.setDescription('🔒 ล็อกบอทแล้ว!').setColor(0xe67e22)] });
    }
    
    // ─────────────────────────────────────────────
    // 📊 /status
    // ─────────────────────────────────────────────
    if (commandName === 'status') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('📊 สถานะบอท v3.1')
                .addFields(
                    { name: '🔒 สถานะ', value: isLocked ? '🔒 ล็อก' : '🔓 ปลดล็อก', inline: true },
                    { name: '⏱️ ออนไลน์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '📂 เพลงในคลัง', value: `${songList.length} เพลง`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true },
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true }
                )
                .setColor(isLocked ? 0xe74c3c : 0x57F287)
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // ⚙️ /ตั้งค่า
    // ─────────────────────────────────────────────
    if (commandName === 'ตั้งค่า') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องแสดงเพลงแล้ว!\n📺 จะแสดงเพลงทั้งหมดอัตโนมัติ')] });
        await refreshMessage();
    }
    
    // ─────────────────────────────────────────────
    // 📚 /ตั้งค่าคลังเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'ตั้งค่าคลังเพลง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        libraryChannelId = options.getChannel('ช่อง').id;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ตั้งค่าช่องคลังเพลงแล้ว!\n📚 <#${libraryChannelId}>\n💡 ทุกคนเห็นได้')] });
        await refreshMessage();
    }
    
    // ─────────────────────────────────────────────
    // 🔍 /ตั้งค่าช่องค้นหา
    // ─────────────────────────────────────────────
    if (commandName === 'ตั้งค่าช่องค้นหา') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        searchChannelId = options.getChannel('ช่อง').id;
        saveData();
        
        // ลบข้อความเก่า + สร้างข้อความต้อนรับใหม่
        try {
            const channel = client.channels.cache.get(searchChannelId);
            if (channel) {
                await deleteAllBotMessages(channel);
                await sleep(1000);
                
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('🔍 ค้นหาเพลง')
                    .setDescription(
                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                        '**📝 วิธีค้นหาเพลง:**\n\n' +
                        '> **พิมพ์ชื่อเพลงหรือศิลปินในช่องนี้ได้เลย!**\n' +
                        '> ไม่ต้องใช้คำสั่ง `/` นำหน้า\n\n' +
                        '**✨ ตัวอย่าง:**\n' +
                        '> `Saran` · `Bodyslam` · `แค่เพื่อน`\n\n' +
                        '**📌 หมายเหตุ:**\n' +
                        '> • ผลลัพธ์จะแสดง**เฉพาะคุณเห็น**\n' +
                        '> • ข้อความจะ**ลบใน 15 วินาที**\n' +
                        '> • ข้อความที่คุณพิมพ์จะถูกลบอัตโนมัติ\n' +
                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                        `**📊 เพลงในคลัง:** ${Object.keys(songs).length} เพลง`
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: '💡 พิมพ์ชื่อเพลงในช่องนี้ได้เลย!' });
                
                const msg = await channel.send({ embeds: [welcomeEmbed] });
                searchWelcomeMsgId = msg.id;
            }
        } catch (e) {
            console.error('Setup search error:', e.message);
        }
        
        await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ตั้งค่าช่องค้นหาแล้ว!\n🔍 <#${searchChannelId}>\n💡 พิมพ์ชื่อเพลงตรงๆ ได้เลย')] });
    }
    
    // ─────────────────────────────────────────────
    // 🧪 /ทดสอบ
    // ─────────────────────────────────────────────
    if (commandName === 'ทดสอบ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
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
                embeds: [replyEmbed.setTitle('🧪 ทดสอบ JOOX API')
                    .setDescription(`**สถานะ:** ✅\n**เวลา:** ${elapsed}s\n**พบเพลง:** ${list.length}`)
                    .setColor(0x57F287)
                ]
            });
        } catch (e) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${e.message}`).setColor(0xe74c3c)] });
        }
    }
    
    // ตรวจสอบสิทธิ์
    const access = checkAccess(interaction);
    if (!access.allowed) {
        return interaction.reply({ embeds: [replyEmbed.setDescription(access.reason).setColor(0xe74c3c)], ephemeral: true });
    }
    
    if (!checkCooldown(interaction.user.id, commandName)) {
        return interaction.reply({ embeds: [replyEmbed.setDescription('⏱️ รออีกนิด!')], ephemeral: true });
    }
    
    // ─────────────────────────────────────────────
    // 🔍 /หาเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหา: **${query}**...`)] });
        
        const results = await searchJoox(query);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง`)] });
        
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        
        if (result?.status === 'success') {
            const rInfo = result.uploadResult.success ? `✅ \`${result.uploadResult.assetId}\`` : `❌ ${result.uploadResult.error}`;
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .addFields(
                        { name: '🎵 เพลง', value: truncate(result.song.title, 60), inline: true },
                        { name: '🎤 ศิลปิน', value: truncate(result.song.artist, 50), inline: true },
                        { name: '🟢 Roblox', value: rInfo, inline: false }
                    )
                ]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`)] });
        }
    }
    
    // ─────────────────────────────────────────────
    // 🎤 /ศิลปิน
    // ─────────────────────────────────────────────
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`🔍 ค้นหาเพลงของ **${artist}**...`)] });
        
        const results = await searchJoox(artist);
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบ`)] });
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle(`⏳ โหลดเพลงของ ${artist}...`).setDescription(`พบ ${results.length} เพลง`).setColor(0xf1c40f)]
        });
        
        const added = [], skipped = [];
        for (let i = 0; i < results.length; i++) {
            const r = await processSong(results[i], interaction, i, results.length);
            if (r.status === 'success') added.push(r.song);
            else skipped.push(r.reason);
            await sleep(3000);
        }
        
        const summary = added.length > 0 ? added.map(s => `- **${truncate(s.title, 50)}** ${s.robloxAssetId ? '🟢' : '🔴'}`).join('\n') : 'ไม่มีเพลงใหม่';
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ!`)
                .setDescription(summary)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // 🔥 /เพลงฮิต
    // ─────────────────────────────────────────────
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) return interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบ')] });
        
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
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ ดึงเพลงฮิตสำเร็จ!')
                .setDescription(added.map(s => `- **${truncate(s.title, 50)}**`).join('\n') || 'ไม่มีเพลงใหม่')
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // 🚀 /เริ่มหาเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) return interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่แล้ว!')] });
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('🚀 เริ่มระบบอัตโนมัติ!')] });
        await runAutoSearch(interaction.channel);
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch);
        }, 90000); // ★ ทุก 90 วิ
    }
    
    // ─────────────────────────────────────────────
    // ⏹️ /หยุดหาเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ หยุดแล้ว!')] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงาน!')] });
        }
    }
    
    // ─────────────────────────────────────────────
    // 🗑️ /ลบเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) {
            const title = songs[id].title;
            delete songs[id];
            saveData();
            await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ลบ \`${truncate(title, 50)}\` แล้ว!`)] });
            await refreshMessage();
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] });
        }
    }
    
    // ─────────────────────────────────────────────
    // 📂 /ดูคลังเพลง
    // ─────────────────────────────────────────────
    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        await interaction.reply({
            embeds: [replyEmbed.setTitle('📂 สถิติคลังเพลง')
                .addFields(
                    { name: '🎵 ทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '🟢 อัปโหลดแล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 รออัปโหลด', value: `${songList.length - uploaded}`, inline: true }
                )
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // 🎲 /สุ่มเพลง (ทุกคนใช้ได้)
    // ─────────────────────────────────────────────
    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] });
        const s = songList[Math.floor(Math.random() * songList.length)];
        await interaction.reply({
            embeds: [replyEmbed.setTitle('🎲 สุ่มได้เพลงนี้!')
                .setDescription(`🎵 **${truncate(s.title, 60)}**\n🎤 ${truncate(s.artist, 50)}`)
                .addFields(
                    { name: '⏱️', value: fmtDuration(s.duration), inline: true },
                    { name: '🟢 Roblox', value: s.robloxAssetId || 'ยังไม่อัปโหลด', inline: true }
                )
                .setThumbnail(s.thumbnail)
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // 📤 /อัปโหลด
    // ─────────────────────────────────────────────
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
            embeds: [new EmbedBuilder().setTitle('📤 เลือกเพลงอัปโหลด')
                .setDescription(`มี **${pending.length}** เพลงรออัปโหลด`)
                .setColor(0x5865F2)
            ],
            components: [new ActionRowBuilder().addComponents(select)]
        });
    }
    
    // ─────────────────────────────────────────────
    // 📤 /อัปโหลดทั้งหมด
    // ─────────────────────────────────────────────
    if (commandName === 'อัปโหลดทั้งหมด') {
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        if (pending.length === 0) return interaction.reply({ embeds: [replyEmbed.setDescription('✅ ทุกเพลงอัปโหลดแล้ว!')] });
        
        await interaction.deferReply();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_upload_all').setLabel('✅ ยืนยัน').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_upload_all').setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('⚠️ ยืนยันอัปโหลดทั้งหมด')
                .setDescription(`อัปโหลด **${pending.length}** เพลง\n⏱️ ประมาณ ${Math.ceil(pending.length * 0.5)} นาที`)
                .setColor(0xe67e22)
            ],
            components: [row]
        });
    }
    
    // ─────────────────────────────────────────────
    // 📈 /สถิติ
    // ─────────────────────────────────────────────
    if (commandName === 'สถิติ') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        
        const songList = Object.values(songs);
        const byArtist = {};
        songList.forEach(s => { byArtist[s.artist] = (byArtist[s.artist] || 0) + 1; });
        const top = Object.entries(byArtist).sort((a,b) => b[1]-a[1]).slice(0,5);
        
        await interaction.reply({
            embeds: [replyEmbed.setTitle('📈 สถิติการใช้งาน')
                .addFields(
                    { name: '🔍 ค้นหา', value: `${stats.totalSearches}`, inline: true },
                    { name: '⬇️ ดาวน์โหลด', value: `${stats.totalDownloads}`, inline: true },
                    { name: '📤 อัปโหลด', value: `${stats.totalUploads}`, inline: true },
                    { name: '❌ ล้มเหลว', value: `${stats.totalFailures}`, inline: true },
                    { name: '🎵 เพลง', value: `${songList.length}`, inline: true },
                    { name: '⏱️ อัปไทม์', value: fmtUptime(Date.now() - stats.startTime), inline: true },
                    { name: '🎤 Top 5', value: top.map(([a,c]) => `${a}: ${c}`).join('\n') || 'ไม่มี', inline: false }
                )
                .setColor(0x5865F2)
            ]
        });
    }
    
    // ─────────────────────────────────────────────
    // 🔄 /อัปเดตช่อง
    // ─────────────────────────────────────────────
    if (commandName === 'อัปเดตช่อง') {
        if (!isAdmin(interaction)) return interaction.reply({ embeds: [replyEmbed.setDescription('❌ Admin เท่านั้น!')], ephemeral: true });
        await interaction.deferReply();
        await refreshMessage();
        await interaction.editReply({ embeds: [replyEmbed.setTitle('🔄 อัปเดตทุกช่องแล้ว!').setColor(0x57F287)] });
    }
});

// ============================================================================
// [SECTION 26] COMPONENT HANDLER
// ============================================================================

async function handleComponents(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin เท่านั้น!', ephemeral: true });
    if (isLocked) return interaction.reply({ content: '🔒 ล็อกอยู่!', ephemeral: true });
    
    if (interaction.customId === 'select_upload') {
        await interaction.deferUpdate();
        const ids = interaction.values;
        let ok = 0, fail = 0;
        
        for (let i = 0; i < ids.length; i++) {
            const song = songs[ids[i]];
            if (!song) continue;
            
            await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle(`📤 อัปโหลด ${i+1}/${ids.length}`)
                    .setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i+1, ids.length)}`)
                    .setColor(0x3498db).setThumbnail(song.thumbnail)
                ], components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
            if (!audioPath) { fail++; continue; }
            
            const up = await uploadToRoblox(audioPath, song.title, song.artist);
            try { fs.unlinkSync(audioPath); } catch (e) {}
            
            if (up.success) {
                songs[ids[i]].robloxAssetId = up.assetId;
                songs[ids[i]].robloxError = null;
                ok++;
            } else { fail++; }
            saveData();
            await sleep(2000);
        }
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ อัปโหลดเสร็จ!')
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${ok}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${fail}`, inline: true }
                ).setColor(0x57F287)
            ]
        });
    }
    
    if (interaction.customId === 'confirm_upload_all') {
        await interaction.deferUpdate();
        const pending = Object.values(songs).filter(s => !s.robloxAssetId);
        let ok = 0, fail = 0;
        
        for (let i = 0; i < pending.length; i++) {
            const song = pending[i];
            await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle(`📤 อัปโหลดทั้งหมด ${i+1}/${pending.length}`)
                    .setDescription(`🎵 **${truncate(song.title, 60)}**\n\n${progressBar(i+1, pending.length)}`)
                    .setColor(0x3498db).setThumbnail(song.thumbnail)
                ], components: []
            });
            
            const audioPath = await downloadAudio(song.id, song.title, song.artist, 'joox');
            if (!audioPath) { fail++; continue; }
            
            const up = await uploadToRoblox(audioPath, song.title, song.artist);
            try { fs.unlinkSync(audioPath); } catch (e) {}
            
            if (up.success) {
                songs[song.id].robloxAssetId = up.assetId;
                songs[song.id].robloxError = null;
                ok++;
            } else { fail++; }
            saveData();
            await sleep(2000);
        }
        
        await refreshMessage();
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ อัปโหลดทั้งหมดเสร็จ!')
                .setDescription(`รวม ${pending.length} เพลง`)
                .addFields(
                    { name: '🟢 สำเร็จ', value: `${ok}`, inline: true },
                    { name: '🔴 ล้มเหลว', value: `${fail}`, inline: true }
                ).setColor(0x57F287)
            ]
        });
    }
    
    if (interaction.customId === 'cancel_upload_all') {
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ ยกเลิก').setColor(0xe74c3c)],
            components: []
        });
    }
}

// ============================================================================
// [SECTION 27] LOGIN
// ============================================================================

client.login(CONFIG.DISCORD_TOKEN);
