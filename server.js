// ============================================================================
// KARAOKE BOT - JOOX EDITION v2.0 - ULTIMATE FALLBACK SYSTEM
// ============================================================================
//
// บอท Discord สำหรับค้นหาเพลงจาก JOOX + ดาวน์โหลด MP3 + อัปโหลด Roblox อัตโนมัติ
//
// ระบบ Fallback 3 ชั้น:
//   ชั้นที่ 1: ใช้ /api/v1/music/url ดึง URL ตรง (เร็วที่สุด)
//   ชั้นที่ 2: ใช้ /api/v1/music/stream เป็น proxy (ถ้าชั้น 1 ไม่ได้)
//   ชั้นที่ 3: ใช้ /api/v1/music/switch สลับ source (ถ้าชั้น 1+2 ไม่ได้)
//
// ============================================================================

// ============================================================================
// SECTION 1: IMPORTS & SETUP
// ============================================================================

const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================

const token = process.env.DISCORD_BOT_TOKEN;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;
const MUSIC_API_URL = process.env.MUSIC_API_URL || 'https://joox-api.onrender.com';
const HTTP_TIMEOUT = 120000; // 2 นาที สำหรับ download ขนาดใหญ่

// ============================================================================
// SECTION 3: EXPRESS SERVER (สำหรับ Render Health Check)
// ============================================================================

const app = express();

app.get('/', (req, res) => {
    res.send('Karaoke Bot is running!');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: client.user ? client.user.tag : 'offline',
        songs: Object.keys(songs).length,
        api_url: MUSIC_API_URL
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// ============================================================================
// SECTION 4: DISCORD CLIENT SETUP
// ============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ============================================================================
// SECTION 5: DATA STORAGE (SAVE/LOAD)
// ============================================================================

const SONGS_FILE = '/tmp/songs.json';
const CHANNEL_FILE = '/tmp/channel.json';

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;

// โหลดข้อมูลจากไฟล์
function loadData() {
    try {
        if (fs.existsSync(SONGS_FILE)) {
            songs = JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8'));
            console.log(`📂 Loaded ${Object.keys(songs).length} songs from storage`);
        }
        if (fs.existsSync(CHANNEL_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
            songChannelId = data.channelId || null;
            console.log(`📂 Loaded channel ID: ${songChannelId}`);
        }
    } catch (err) {
        console.error('❌ Load data error:', err.message);
    }
}

// บันทึกข้อมูลลงไฟล์
function saveData() {
    try {
        fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8');
        fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ channelId: songChannelId }), 'utf8');
    } catch (err) {
        console.error('❌ Save data error:', err.message);
    }
}

// โหลดข้อมูลตอนเริ่ม
loadData();

// ============================================================================
// SECTION 6: CONTENT FILTER
// ============================================================================

const BANNED_WORDS = [
    // คำหยาบ
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "โง่", "ควาย",
    // ลามก
    "xxx", "porn", "sex", "18+", "หนังโป๊", "ลามก",
    // การเมือง
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "ชนชั้น",
    // บูลลี่
    "บูลลี่", "bully", "เหยียด", "ชาติพันธุ์",
    // ความรุนแรง
    "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) return true;
    }
    return false;
}

// ============================================================================
// SECTION 7: UTILITY FUNCTIONS
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

// ============================================================================
// SECTION 8: JOOX SEARCH FUNCTION
// ============================================================================

async function searchJoox(query) {
    try {
        console.log(`🔍 Searching JOOX for: "${query}"`);
        
        const response = await axios.get(`${MUSIC_API_URL}/api/v1/music/search`, {
            params: {
                q: query,
                type: 'song',
                sources: 'joox'
            },
            timeout: 90000
        });
        
        console.log(`📥 Search response code: ${response.data.code}`);
        
        // API ตอบกลับเป็น { code, data: { songs: [...] }, ... }
        if (response.data && response.data.data && response.data.data.songs) {
            const songsList = response.data.data.songs;
            console.log(`✅ Found ${songsList.length} songs for "${query}"`);
            return songsList;
        }
        
        console.log('⚠️ No songs in response');
        return [];
        
    } catch (error) {
        console.error(`❌ Search error: ${error.message}`);
        if (error.code === 'ECONNABORTED') {
            console.error('⏱️ Timeout - joox-api may be sleeping');
        }
        return [];
    }
}

// ============================================================================
// SECTION 9: GET DIRECT URL (ชั้นที่ 1 ของ Fallback)
// ============================================================================

async function getDirectUrl(songId, source = 'joox') {
    try {
        console.log(`🔗 [Layer 1] Getting direct URL for: ${songId}`);
        
        const response = await axios.get(`${MUSIC_API_URL}/api/v1/music/url`, {
            params: {
                id: songId,
                source: source
            },
            timeout: 60000
        });
        
        console.log(`📥 URL response:`, JSON.stringify(response.data).slice(0, 200));
        
        // API อาจส่ง URL มาในหลายรูปแบบ
        const data = response.data;
        
        if (data && data.url) {
            console.log(`✅ Got direct URL: ${data.url.slice(0, 80)}...`);
            return data.url;
        }
        if (data && data.data && data.data.url) {
            console.log(`✅ Got direct URL (nested): ${data.data.url.slice(0, 80)}...`);
            return data.data.url;
        }
        if (data && data.link) {
            console.log(`✅ Got direct URL (link): ${data.link.slice(0, 80)}...`);
            return data.link;
        }
        
        console.log('⚠️ No URL in response');
        return null;
        
    } catch (error) {
        console.error(`❌ [Layer 1] Error: ${error.message}`);
        return null;
    }
}

// ============================================================================
// SECTION 10: DOWNLOAD VIA STREAM PROXY (ชั้นที่ 2 ของ Fallback)
// ============================================================================

async function downloadViaStream(songId, source = 'joox') {
    try {
        console.log(`🌊 [Layer 2] Downloading via stream proxy: ${songId}`);
        
        const streamUrl = `${MUSIC_API_URL}/api/v1/music/stream?id=${encodeURIComponent(songId)}&source=${source}`;
        console.log(`🌊 Stream URL: ${streamUrl}`);
        
        const response = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: HTTP_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'audio/*,*/*'
            }
        });
        
        console.log(`📥 Content-Type: ${response.headers['content-type']}`);
        console.log(`📥 Content-Length: ${response.headers['content-length'] || 'unknown'}`);
        
        // ตรวจสอบว่าได้ audio หรือไม่
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
            console.log(`⚠️ Content-Type ไม่ใช่ audio: ${contentType}`);
            // อาจเป็น JSON error
            return null;
        }
        
        return response.data;
        
    } catch (error) {
        console.error(`❌ [Layer 2] Error: ${error.message}`);
        return null;
    }
}

// ============================================================================
// SECTION 11: SWITCH SOURCE (ชั้นที่ 3 ของ Fallback)
// ============================================================================

async function switchSource(songId, songName, artist, currentSource = 'joox') {
    try {
        console.log(`🔄 [Layer 3] Switching source for: ${songName} - ${artist}`);
        
        const response = await axios.get(`${MUSIC_API_URL}/api/v1/music/switch`, {
            params: {
                id: songId,
                source: currentSource,
                name: songName,
                artist: artist
            },
            timeout: 90000
        });
        
        console.log(`📥 Switch response:`, JSON.stringify(response.data).slice(0, 300));
        
        // ถ้าได้ URL ใหม่
        if (response.data && response.data.url) {
            return { type: 'url', url: response.data.url, source: response.data.source };
        }
        if (response.data && response.data.data && response.data.data.url) {
            return { type: 'url', url: response.data.data.url, source: response.data.data.source };
        }
        // ถ้าได้ ID ใหม่
        if (response.data && response.data.id) {
            return { type: 'id', id: response.data.id, source: response.data.source };
        }
        
        return null;
        
    } catch (error) {
        console.error(`❌ [Layer 3] Error: ${error.message}`);
        return null;
    }
}

// ============================================================================
// SECTION 12: DOWNLOAD AUDIO (UNIFIED - ลองทุกวิธี)
// ============================================================================

async function downloadAudio(songId, songName, artist, source = 'joox') {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⬇️ เริ่มดาวน์โหลด: ${songName} - ${artist}`);
    console.log(`   ID: ${songId}`);
    console.log(`${'='.repeat(60)}`);
    
    // -------------------------------------------------------------------------
    // ลองวิธีที่ 1: ดึง URL ตรงแล้วดาวน์โหลด
    // -------------------------------------------------------------------------
    try {
        const directUrl = await getDirectUrl(songId, source);
        if (directUrl) {
            console.log(`⬇️ ดาวน์โหลดจาก URL ตรง...`);
            const response = await axios.get(directUrl, {
                responseType: 'stream',
                timeout: HTTP_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'audio/*,*/*',
                    'Referer': 'https://www.joox.com/'
                }
            });
            
            const writer = fs.createWriteStream(tempPath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            const size = fs.statSync(tempPath).size;
            console.log(`✅ ดาวน์โหลดสำเร็จ (URL ตรง): ${(size / 1024).toFixed(1)} KB`);
            
            if (size > 1024) {
                return tempPath;
            }
            
            // ไฟล์เล็กเกินไป ลบทิ้ง
            fs.unlinkSync(tempPath);
            console.log('⚠️ ไฟล์เล็กเกินไป ลบและลองวิธีถัดไป');
        }
    } catch (error) {
        console.error(`❌ วิธีที่ 1 ล้มเหลว: ${error.message}`);
    }
    
    // -------------------------------------------------------------------------
    // ลองวิธีที่ 2: ใช้ Stream Proxy
    // -------------------------------------------------------------------------
    try {
        const stream = await downloadViaStream(songId, source);
        if (stream) {
            console.log(`⬇️ กำลังบันทึกจาก stream proxy...`);
            const writer = fs.createWriteStream(tempPath);
            stream.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            const size = fs.statSync(tempPath).size;
            console.log(`✅ ดาวน์โหลดสำเร็จ (Stream): ${(size / 1024).toFixed(1)} KB`);
            
            if (size > 1024) {
                return tempPath;
            }
            
            fs.unlinkSync(tempPath);
            console.log('⚠️ ไฟล์เล็กเกินไป ลบและลองวิธีถัดไป');
        }
    } catch (error) {
        console.error(`❌ วิธีที่ 2 ล้มเหลว: ${error.message}`);
    }
    
    // -------------------------------------------------------------------------
    // ลองวิธีที่ 3: สลับ Source
    // -------------------------------------------------------------------------
    try {
        const switched = await switchSource(songId, songName, artist, source);
        if (switched) {
            if (switched.type === 'url') {
                console.log(`⬇️ ดาวน์โหลดจาก URL ที่สลับ source: ${switched.source}`);
                const response = await axios.get(switched.url, {
                    responseType: 'stream',
                    timeout: HTTP_TIMEOUT,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                
                const writer = fs.createWriteStream(tempPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                const size = fs.statSync(tempPath).size;
                console.log(`✅ ดาวน์โหลดสำเร็จ (Switch URL): ${(size / 1024).toFixed(1)} KB`);
                
                if (size > 1024) {
                    return tempPath;
                }
                fs.unlinkSync(tempPath);
            } else if (switched.type === 'id') {
                console.log(`⬇️ ลอง ID ใหม่: ${switched.id} (source: ${switched.source})`);
                const stream = await downloadViaStream(switched.id, switched.source);
                if (stream) {
                    const writer = fs.createWriteStream(tempPath);
                    stream.pipe(writer);
                    
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    
                    const size = fs.statSync(tempPath).size;
                    console.log(`✅ ดาวน์โหลดสำเร็จ (Switch ID): ${(size / 1024).toFixed(1)} KB`);
                    
                    if (size > 1024) {
                        return tempPath;
                    }
                    fs.unlinkSync(tempPath);
                }
            }
        }
    } catch (error) {
        console.error(`❌ วิธีที่ 3 ล้มเหลว: ${error.message}`);
    }
    
    // -------------------------------------------------------------------------
    // ล้มเหลวทุกวิธี
    // -------------------------------------------------------------------------
    console.error(`❌ ทุกวิธีล้มเหลวสำหรับ: ${songName}`);
    return null;
}

// ============================================================================
// SECTION 13: ROBLOX UPLOAD FUNCTION
// ============================================================================

async function uploadToRoblox(filePath, title, artist) {
    // ตรวจสอบการตั้งค่า
    if (!ROBLOX_API_KEY || !ROBLOX_USER_ID) {
        return {
            success: false,
            error: 'ไม่ได้ตั้งค่า ROBLOX_API_KEY หรือ ROBLOX_USER_ID'
        };
    }
    
    try {
        // อ่านไฟล์
        const fileBuffer = fs.readFileSync(filePath);
        const fileSize = fileBuffer.length;
        
        console.log(`📤 กำลังอัปโหลดขึ้น Roblox: ${title} (${(fileSize / 1024).toFixed(1)} KB)`);
        
        // ตรวจสอบขนาดไฟล์ (Roblox จำกัด 20MB)
        if (fileSize > 20 * 1024 * 1024) {
            return {
                success: false,
                error: `ไฟล์ใหญ่เกิน 20MB (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
            };
        }
        
        // สร้าง FormData
        const form = new FormData();
        
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: {
                creator: {
                    userId: parseInt(ROBLOX_USER_ID)
                }
            }
        }), { contentType: 'application/json' });
        
        form.append('fileContent', fileBuffer, {
            filename: path.basename(filePath),
            contentType: 'audio/mpeg'
        });
        
        // ส่ง Request
        const response = await axios.post(
            'https://apis.roblox.com/assets/v1/assets',
            form,
            {
                headers: {
                    'x-api-key': ROBLOX_API_KEY,
                    ...form.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 180000
            }
        );
        
        // ตรวจสอบผลลัพธ์
        if (response.data && response.data.assetId) {
            console.log(`✅ อัปโหลดสำเร็จ! Asset ID: ${response.data.assetId}`);
            return {
                success: true,
                assetId: String(response.data.assetId)
            };
        }
        
        return {
            success: false,
            error: JSON.stringify(response.data).slice(0, 200)
        };
        
    } catch (error) {
        const errorMsg = error.response?.data
            ? JSON.stringify(error.response.data).slice(0, 200)
            : error.message;
        
        console.error(`❌ Roblox upload error: ${errorMsg}`);
        
        return {
            success: false,
            error: errorMsg
        };
    }
}

// ============================================================================
// SECTION 14: PROCESS SONG (UNIFIED)
// ============================================================================

async function processSong(song, interaction = null, index = 0, total = 1) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🎵 [${index + 1}/${total}] ${title} - ${artist}`);
    console.log(`${'─'.repeat(60)}`);
    
    // ตรวจสอบว่ามีอยู่แล้วหรือไม่
    if (songs[songId]) {
        console.log(`⏭️ ข้าม: มีอยู่ในระบบแล้ว`);
        return { status: 'skipped', reason: 'มีอยู่แล้ว' };
    }
    
    // ตรวจสอบเนื้อหาต้องห้าม
    if (isBanned(title, artist)) {
        console.log(`⏭️ ข้าม: เนื้อหาถูกคัดกรอง`);
        return { status: 'banned', reason: 'ถูกคัดกรอง' };
    }
    
    try {
        // อัปเดตสถานะ: กำลังดาวน์โหลด
        if (interaction) {
            try {
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`⬇️ เพลงที่ ${index + 1}/${total} - กำลังดาวน์โหลด...`)
                        .setDescription(`🎵 **${title}**\n🎤 ${artist}`)
                        .setColor(0xf1c40f)
                        .setThumbnail(song.cover || null)
                        .setFooter({ text: `กำลังลองดาวน์โหลด...` })
                    ]
                });
            } catch (e) { /* ignore */ }
        }
        
        // ดาวน์โหลด
        const audioPath = await downloadAudio(songId, title, artist, 'joox');
        
        if (!audioPath) {
            console.log(`❌ ดาวน์โหลดล้มเหลว: ${title}`);
            return { status: 'failed', reason: 'ดาวน์โหลดล้มเหลว' };
        }
        
        // อัปเดตสถานะ: กำลังอัปโหลด
        if (interaction) {
            try {
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`⬆️ เพลงที่ ${index + 1}/${total} - กำลังอัปโหลด Roblox...`)
                        .setDescription(`🎵 **${title}**\n🎤 ${artist}`)
                        .setColor(0x3498db)
                        .setThumbnail(song.cover || null)
                        .setFooter({ text: `อัปโหลดขึ้น Roblox...` })
                    ]
                });
            } catch (e) { /* ignore */ }
        }
        
        // อัปโหลด
        const uploadResult = await uploadToRoblox(audioPath, title, artist);
        
        // บันทึก
        songs[songId] = {
            id: songId,
            title: title,
            artist: artist,
            thumbnail: song.cover || null,
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error,
            source: 'joox',
            addedAt: new Date().toISOString()
        };
        
        saveData();
        
        // ลบไฟล์ชั่วคราว
        try {
            fs.unlinkSync(audioPath);
        } catch (e) { /* ignore */ }
        
        // รีเฟรชข้อความ
        await refreshMessage();
        
        if (uploadResult.success) {
            console.log(`✅ สำเร็จ: ${title} → Roblox ID: ${uploadResult.assetId}`);
            return {
                status: 'success',
                song: songs[songId],
                uploadResult: uploadResult
            };
        } else {
            console.log(`⚠️ ดาวน์โหลดได้ แต่อัปโหลดล้มเหลว: ${title}`);
            return {
                status: 'success',
                song: songs[songId],
                uploadResult: uploadResult
            };
        }
        
    } catch (error) {
        console.error(`❌ Process error: ${error.message}`);
        return { status: 'failed', reason: error.message };
    }
}

// ============================================================================
// SECTION 15: REFRESH MESSAGE
// ============================================================================

async function refreshMessage() {
    if (!songChannelId) return;
    
    try {
        const channel = client.channels.cache.get(songChannelId);
        if (!channel) return;
        
        const songList = Object.values(songs);
        
        // ถ้าไม่มีเพลง
        if (songList.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎤 รายการเพลง Karaoke')
                .setDescription('*ยังไม่มีเพลง — ใช้ `/หาเพลง` เพื่อเพิ่มเพลงแรก*')
                .setColor(0x000000)
                .setFooter({ text: `อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')}` });
            
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
        
        // แสดง 10 เพลงแรก
        const chunk = songList.slice(0, 10);
        const embed = new EmbedBuilder()
            .setTitle('🎤 รายการเพลง Karaoke (JOOX)')
            .setColor(0x000000)
            .setFooter({
                text: `รวม ${songList.length} เพลง · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}`
            });
        
        let description = '';
        chunk.forEach((s, i) => {
            const roblox = s.robloxAssetId
                ? `🟢 Roblox: ${s.robloxAssetId}`
                : `🔴 ยังไม่อัปโหลด`;
            description += `**${i + 1}. ${s.title}**\n`;
            description += `　🎤 ${s.artist}\n`;
            description += `　${roblox}\n\n`;
        });
        
        embed.setDescription(description);
        
        // หาข้อความเก่าแล้วแก้ไข
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
// SECTION 16: AUTO REFRESH
// ============================================================================

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (songChannelId) await refreshMessage();
    }, 30000);
    console.log('🔄 Auto-refresh started (every 30s)');
}

// ============================================================================
// SECTION 17: AUTO SEARCH SYSTEM
// ============================================================================

async function runAutoSearch(channel) {
    try {
        console.log('\n🤖 ระบบอัตโนมัติ: เริ่มหาเพลงใหม่...');
        
        const searchMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setDescription(`🎯 เป้าหมาย: **เพลงไทย**\n⏱️ เริ่มเมื่อ: ${new Date().toLocaleTimeString('th-TH')}`)
                .setColor(0xf1c40f)
            ]
        });
        
        const results = await searchJoox('เพลงไทย');
        
        if (results.length === 0) {
            await searchMsg.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('⏭️ ไม่พบเพลง')
                    .setDescription('🔄 รอ 60 วิ แล้วหาใหม่')
                    .setColor(0xe67e22)
                ]
            });
            return;
        }
        
        // ลองทีละเพลงจนกว่าจะสำเร็จ
        for (let i = 0; i < results.length; i++) {
            const result = await processSong(results[i], searchMsg, i, results.length);
            
            if (result.status === 'success') {
                const uploadInfo = result.uploadResult.success
                    ? `🟢 Roblox: ${result.uploadResult.assetId}`
                    : `🔴 Roblox Error: ${result.uploadResult.error?.slice(0, 100)}`;
                
                await searchMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                        .setDescription(
                            `🎵 **${result.song.title}**\n` +
                            `🎤 ${result.song.artist}\n\n` +
                            `${uploadInfo}\n\n` +
                            `🔄 หาใหม่ในอีก 60 วินาที`
                        )
                        .setColor(0x57F287)
                        .setThumbnail(result.song.thumbnail)
                    ]
                });
                return;
            }
        }
        
        await searchMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle('⏭️ ไม่มีเพลงใหม่ในรอบนี้')
                .setDescription(`ลอง ${results.length} เพลง แต่ซ้ำ/ถูกข้ามทั้งหมด\n🔄 รอ 60 วิ`)
                .setColor(0xe67e22)
            ]
        });
        
    } catch (error) {
        console.error('❌ Auto search error:', error.message);
    }
}

// ============================================================================
// SECTION 18: BOT READY EVENT
// ============================================================================

client.once('ready', async () => {
    console.log('\n' + '='.repeat(60));
    console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
    console.log(`📂 เพลงในคลัง: ${Object.keys(songs).length}`);
    console.log(`🔗 MUSIC_API_URL: ${MUSIC_API_URL}`);
    console.log(`🟢 ROBLOX: ${ROBLOX_API_KEY ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}`);
    console.log('='.repeat(60) + '\n');
    
    startAutoRefresh();
    
    // ลงทะเบียนคำสั่ง
    const commands = [
        new SlashCommandBuilder()
            .setName('ตั้งค่า')
            .setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ทดสอบ')
            .setDescription('ทดสอบการเชื่อมต่อ JOOX API')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หาเพลง')
            .setDescription('ค้นหาและเพิ่มเพลงจาก JOOX')
            .addStringOption(o => o
                .setName('ชื่อเพลง')
                .setDescription('ชื่อเพลงหรือชื่อศิลปิน')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ศิลปิน')
            .setDescription('ดึงเพลงทั้งหมดของศิลปิน')
            .addStringOption(o => o
                .setName('ชื่อศิลปิน')
                .setDescription('ชื่อศิลปิน')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เพลงฮิต')
            .setDescription('ดึงเพลงยอดนิยม')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('เริ่มหาเพลง')
            .setDescription('เริ่มระบบหาเพลงอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('หยุดหาเพลง')
            .setDescription('หยุดระบบหาเพลงอัตโนมัติ')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ลบเพลง')
            .setDescription('ลบเพลงออกจากระบบ')
            .addStringOption(o => o
                .setName('id')
                .setDescription('ID ของเพลงที่ต้องการลบ')
                .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('ดูคลังเพลง')
            .setDescription('ดูรายการเพลงทั้งหมด')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('สุ่มเพลง')
            .setDescription('สุ่มเพลงจากคลัง')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('✅ ลงทะเบียนคำสั่งสำเร็จ!');
    } catch (error) {
        console.error('❌ ลงทะเบียนคำสั่งล้มเหลว:', error.message);
    }
    
    refreshMessage();
});

// ============================================================================
// SECTION 19: INTERACTION HANDLER
// ============================================================================

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);
    
    // -------------------------------------------------------------------------
    // /ทดสอบ
    // -------------------------------------------------------------------------
    if (commandName === 'ทดสอบ') {
        await interaction.deferReply();
        
        const startTime = Date.now();
        
        try {
            const res = await axios.get(`${MUSIC_API_URL}/api/v1/music/search`, {
                params: { q: 'Saran', type: 'song', sources: 'joox' },
                timeout: 90000
            });
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const songsList = res.data?.data?.songs || [];
            
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('🧪 ทดสอบ JOOX API')
                    .setDescription(
                        `**URL:** \`${MUSIC_API_URL}\`\n` +
                        `**สถานะ:** ✅ เชื่อมต่อได้\n` +
                        `**เวลา:** ${elapsed} วินาที\n` +
                        `**Code:** ${res.data.code}\n` +
                        `**Msg:** ${res.data.msg}\n` +
                        `**จำนวนเพลง:** ${songsList.length}`
                    )
                    .addFields({
                        name: '📋 ตัวอย่างเพลงแรก',
                        value: songsList.length > 0
                            ? `🎵 ${songsList[0].name}\n🎤 ${songsList[0].artist}`
                            : 'ไม่มี'
                    })
                    .setColor(0x57F287)
                ]
            });
        } catch (error) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('🧪 ทดสอบ JOOX API')
                    .setDescription(
                        `**URL:** \`${MUSIC_API_URL}\`\n` +
                        `**สถานะ:** ❌ ไม่สามารถเชื่อมต่อได้\n` +
                        `**เวลา:** ${elapsed} วินาที\n` +
                        `**Error:** ${error.message}`
                    )
                    .setColor(0xe74c3c)
                ]
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // /ตั้งค่า
    // -------------------------------------------------------------------------
    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        saveData();
        
        await interaction.reply({
            embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!')]
        });
        
        await refreshMessage();
    }
    
    // -------------------------------------------------------------------------
    // /หาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        
        const query = options.getString('ชื่อเพลง');
        
        await interaction.editReply({
            embeds: [replyEmbed.setDescription(`🔍 กำลังค้นหา: **${query}**...`)]
        });
        
        const results = await searchJoox(query);
        
        if (results.length === 0) {
            await interaction.editReply({
                embeds: [replyEmbed.setDescription(
                    `❌ ไม่พบเพลง **${query}**\n\n` +
                    `💡 ลองพิมพ์ \`/ทดสอบ\` เพื่อเช็ค API`
                )]
            });
            return;
        }
        
        // ลองทีละเพลง
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }
        
        if (result && result.status === 'success') {
            const robloxInfo = result.uploadResult.success
                ? `✅ Roblox ID: ${result.uploadResult.assetId}`
                : `❌ ${result.uploadResult.error}`;
            
            await interaction.editReply({
                embeds: [replyEmbed
                    .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                    .setThumbnail(result.song.thumbnail)
                    .addFields(
                        { name: '🎵 ชื่อเพลง', value: result.song.title, inline: true },
                        { name: '🎤 ศิลปิน', value: result.song.artist, inline: true },
                        { name: '🟢 Roblox', value: robloxInfo, inline: false }
                    )
                ]
            });
        } else {
            await interaction.editReply({
                embeds: [replyEmbed.setDescription(
                    `❌ ${result?.reason || 'ไม่สำเร็จ'}\n\n` +
                    `💡 ลองพิมพ์ \`/ทดสอบ\` เพื่อเช็ค API`
                )]
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // /ศิลปิน
    // -------------------------------------------------------------------------
    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        
        const artist = options.getString('ชื่อศิลปิน');
        
        await interaction.editReply({
            embeds: [replyEmbed.setDescription(`🔍 กำลังค้นหาเพลงของ **${artist}**...`)]
        });
        
        const results = await searchJoox(artist);
        
        if (results.length === 0) {
            await interaction.editReply({
                embeds: [replyEmbed.setDescription(
                    `❌ ไม่พบเพลงของ **${artist}**\n\n` +
                    `💡 ลองพิมพ์ \`/ทดสอบ\` เพื่อเช็ค API`
                )]
            });
            return;
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`⏳ กำลังโหลดเพลงของ ${artist}...`)
                .setDescription(`พบ **${results.length}** เพลง กำลังเริ่มโหลด...`)
                .setColor(0xf1c40f)
            ]
        });
        
        const added = [];
        const skipped = [];
        
        for (let i = 0; i < results.length; i++) {
            const result = await processSong(results[i], interaction, i, results.length);
            
            if (result.status === 'success') {
                added.push(result.song);
            } else {
                skipped.push(result.reason || 'unknown');
            }
            
            await sleep(3000);
        }
        
        const summary = added.length > 0
            ? added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢 (${s.robloxAssetId})` : '🔴'}`).join('\n')
            : 'ไม่มีเพลงใหม่';
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ!`)
                .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${summary}`)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // /เพลงฮิต
    // -------------------------------------------------------------------------
    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        
        await interaction.editReply({
            embeds: [replyEmbed.setDescription('🔍 กำลังดึงเพลงฮิต...')]
        });
        
        const results = await searchJoox('เพลงไทย');
        
        if (results.length === 0) {
            await interaction.editReply({
                embeds: [replyEmbed.setDescription(
                    `❌ ไม่พบเพลง\n\n💡 ลองพิมพ์ \`/ทดสอบ\` เพื่อเช็ค API`
                )]
            });
            return;
        }
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('⏳ กำลังดึงเพลงฮิต...')
                .setDescription(`พบ **${results.length}** เพลง กำลังเริ่มโหลด...`)
                .setColor(0xf1c40f)
            ]
        });
        
        const added = [];
        const skipped = [];
        
        for (let i = 0; i < results.length; i++) {
            const result = await processSong(results[i], interaction, i, results.length);
            
            if (result.status === 'success') {
                added.push(result.song);
            } else {
                skipped.push(result.reason);
            }
            
            await sleep(3000);
        }
        
        const summary = added.length > 0
            ? added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢` : '🔴'}`).join('\n')
            : 'ไม่มีเพลงใหม่';
        
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ดึงเพลงฮิตสำเร็จ!')
                .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${summary}`)
                .addFields(
                    { name: '➕ สำเร็จ', value: `${added.length}`, inline: true },
                    { name: '⏭️ ข้าม', value: `${skipped.length}`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // /เริ่มหาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('⚠️ ระบบอัตโนมัติกำลังทำงานอยู่แล้ว!')]
            });
            return;
        }
        
        songChannelId = interaction.channelId;
        saveData();
        
        await interaction.reply({
            embeds: [replyEmbed.setDescription(
                '🚀 **เริ่มระบบหาเพลงอัตโนมัติแล้ว!**\n\n' +
                'บอทจะหาเพลงใหม่ทุก 60 วินาที'
            )]
        });
        
        await runAutoSearch(interaction.channel);
        
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch);
        }, 60000);
    }
    
    // -------------------------------------------------------------------------
    // /หยุดหาเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply({
                embeds: [replyEmbed.setDescription('⏹️ หยุดระบบอัตโนมัติแล้ว!')]
            });
        } else {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('⚠️ ระบบอัตโนมัติไม่ได้ทำงานอยู่!')]
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // /ลบเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        
        if (songs[id]) {
            delete songs[id];
            saveData();
            await interaction.reply({
                embeds: [replyEmbed.setDescription(`✅ ลบเพลง \`${id}\` แล้ว!`)]
            });
            await refreshMessage();
        } else {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('❌ ไม่พบเพลงนี้!')]
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // /ดูคลังเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('📂 สถิติคลังเพลง')
                .addFields(
                    { name: '🎵 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
                    { name: '🟢 อัปโหลด Roblox แล้ว', value: `${uploaded}`, inline: true },
                    { name: '🔴 ยังไม่อัปโหลด', value: `${songList.length - uploaded}`, inline: true }
                )
            ]
        });
    }
    
    // -------------------------------------------------------------------------
    // /สุ่มเพลง
    // -------------------------------------------------------------------------
    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        
        if (songList.length === 0) {
            await interaction.reply({
                embeds: [replyEmbed.setDescription('📭 คลังเพลงว่างเปล่า!')]
            });
            return;
        }
        
        const randomSong = songList[Math.floor(Math.random() * songList.length)];
        
        await interaction.reply({
            embeds: [replyEmbed
                .setTitle('🎲 สุ่มได้เพลงนี้!')
                .addFields(
                    { name: '🎵 ชื่อเพลง', value: randomSong.title, inline: true },
                    { name: '🎤 ศิลปิน', value: randomSong.artist, inline: true },
                    { name: '🟢 Roblox', value: randomSong.robloxAssetId || 'ยังไม่อัปโหลด', inline: false }
                )
                .setThumbnail(randomSong.thumbnail)
            ]
        });
    }
});

// ============================================================================
// SECTION 20: LOGIN
// ============================================================================

client.login(token);
