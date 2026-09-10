const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;
const MUSIC_API_URL = process.env.MUSIC_API_URL || 'https://joox-api.onrender.com';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const app = express();
app.get('/', (req, res) => { res.send('Bot is running!'); });
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`Web server running on port ${PORT}`); });

// ★★★ ระบบบันทึก/โหลดข้อมูลลงไฟล์ ★★★
const DATA_DIR = '/tmp';
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const CHANNEL_FILE = path.join(DATA_DIR, 'channel.json');

let songs = {};
let songChannelId = null;
let autoTask = null;
let refreshTask = null;

// โหลดข้อมูลจากไฟล์
function loadData() {
    try {
        if (fs.existsSync(SONGS_FILE)) {
            songs = JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8'));
            console.log(`📂 Loaded ${Object.keys(songs).length} songs from file`);
        }
        if (fs.existsSync(CHANNEL_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
            songChannelId = data.channelId || null;
            console.log(`📂 Loaded channel ID: ${songChannelId}`);
        }
    } catch (err) {
        console.error('Error loading data:', err.message);
    }
}

// บันทึกข้อมูลลงไฟล์
function saveData() {
    try {
        fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8');
        fs.writeFileSync(CHANNEL_FILE, JSON.stringify({ channelId: songChannelId }, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving data:', err.message);
    }
}

// โหลดข้อมูลตอนเริ่ม
loadData();

// ระบบคัดกรองเนื้อหา
const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "xxx", "porn", "sex", "18+",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "บูลลี่", "bully",
    "เหยียด", "ชาติพันธุ์", "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const w of BANNED_WORDS) {
        if (text.includes(w.toLowerCase())) return true;
    }
    return false;
}

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ★★★ ค้นหาเพลงจาก JOOX ★★★
async function searchJoox(query) {
    try {
        const response = await axios.get(`${MUSIC_API_URL}/api/v1/music/search`, {
            params: { q: query, type: 'song', sources: 'joox' },
            timeout: 30000
        });
        if (response.data && response.data.data && response.data.data.songs) {
            return response.data.data.songs;
        }
        return [];
    } catch (error) {
        console.error('Search error:', error.message);
        return [];
    }
}

// ★★★ ดาวน์โหลด MP3 ★★★
async function downloadAudio(downloadUrl) {
    const tempPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(tempPath));
        writer.on('error', reject);
    });
}

// ★★★ อัปโหลดขึ้น Roblox ★★★
async function uploadToRoblox(filePath, title, artist) {
    if (!ROBLOX_API_KEY || !ROBLOX_USER_ID) {
        return { success: false, error: 'ไม่ได้ตั้งค่า ROBLOX_API_KEY หรือ ROBLOX_USER_ID' };
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        if (fileBuffer.length > 20 * 1024 * 1024) {
            return { success: false, error: 'ไฟล์ใหญ่เกิน 20MB' };
        }

        const form = new FormData();
        form.append('request', JSON.stringify({
            assetType: 'Audio',
            displayName: title.slice(0, 50),
            description: `Karaoke: ${title} by ${artist}`,
            creationContext: { creator: { userId: parseInt(ROBLOX_USER_ID) } }
        }), { contentType: 'application/json' });
        form.append('fileContent', fileBuffer, { filename: path.basename(filePath), contentType: 'audio/mpeg' });

        const response = await axios.post('https://apis.roblox.com/assets/v1/assets', form, {
            headers: { 'x-api-key': ROBLOX_API_KEY, ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 120000
        });

        if (response.data && response.data.assetId) {
            return { success: true, assetId: String(response.data.assetId) };
        }
        return { success: false, error: JSON.stringify(response.data).slice(0, 100) };
    } catch (error) {
        return { success: false, error: error.response?.data ? JSON.stringify(error.response.data).slice(0, 100) : error.message };
    }
}

// ★★★ ประมวลผลเพลงเดียว ★★★
async function processSong(song, interaction = null, index = 0, total = 1) {
    const songId = song.id;
    const title = song.name || 'Unknown';
    const artist = song.artist || 'Unknown';
    const downloadUrl = song.url;

    if (songs[songId]) return { status: 'skipped', reason: 'ซ้ำ' };
    if (isBanned(title, artist)) return { status: 'banned', reason: 'ถูกคัดกรอง' };
    if (!downloadUrl) return { status: 'failed', reason: 'ไม่มี URL' };

    try {
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⏳ กำลังโหลดเพลงที่ ${index + 1}/${total}`)
                    .setDescription(`🎵 **${title}**\n🎤 ${artist}`)
                    .setColor(0xf1c40f)
                    .setThumbnail(song.cover || null)
                ]
            });
        }

        const audioPath = await downloadAudio(downloadUrl);
        const uploadResult = await uploadToRoblox(audioPath, title, artist);

        songs[songId] = {
            id: songId,
            title: title,
            artist: artist,
            thumbnail: song.cover || null,
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error
        };
        saveData(); // ★ บันทึกทันที

        try { fs.unlinkSync(audioPath); } catch (e) {}

        await refreshMessage();
        return { status: 'success', song: songs[songId], uploadResult };
    } catch (error) {
        console.error(`Process error for ${title}:`, error.message);
        return { status: 'failed', reason: error.message };
    }
}

// ★★★ รีเฟรชข้อความ ★★★
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    if (songList.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎤 รายการเพลง Karaoke')
            .setDescription('*ยังไม่มีเพลง — ระบบอัปเดตทุก 30 วินาที*')
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

    const chunk = songList.slice(0, 10);
    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke (JOOX)')
        .setColor(0x000000)
        .setFooter({ text: `รวม ${songList.length} เพลง · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });

    let description = '';
    chunk.forEach((s, i) => {
        const roblox = s.robloxAssetId ? `🟢 Roblox: ${s.robloxAssetId}` : `🔴 ยังไม่อัปโหลด`;
        description += `**${i + 1}. ${s.title}**\n　🎤 ${s.artist} · ${roblox}\n\n`;
    });
    embed.setDescription(description);

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
}

function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => { if (songChannelId) await refreshMessage(); }, 30000);
}

// ★★★ ระบบ Auto ★★★
async function runAutoSearch(channel) {
    try {
        const searchMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setDescription(`🎯 เป้าหมาย: **เพลงไทย**\n⏱️ เริ่มเมื่อ: ${new Date().toLocaleTimeString('th-TH')}`)
                .setColor(0xf1c40f)
            ]
        });

        const results = await searchJoox('เพลงไทย');
        if (results.length === 0) {
            await searchMsg.edit({ embeds: [new EmbedBuilder().setTitle('⏭️ ไม่พบเพลง').setDescription('รอ 60 วิ').setColor(0xe67e22)] });
            return;
        }

        // หาเพลงใหม่
        for (let i = 0; i < results.length; i++) {
            const result = await processSong(results[i], searchMsg, i, results.length);
            if (result.status === 'success') {
                const uploadInfo = result.uploadResult.success
                    ? `🟢 Roblox: ${result.uploadResult.assetId}`
                    : `🔴 Roblox Error`;
                await searchMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                        .setDescription(`🎵 **${result.song.title}**\n🎤 ${result.song.artist}\n\n${uploadInfo}\n\n🔄 หาใหม่ในอีก 60 วิ`)
                        .setColor(0x57F287)
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
        console.error('Auto search error:', error.message);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`📂 Songs in storage: ${Object.keys(songs).length}`);
    startAutoRefresh();

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องแสดงเพลง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหา+อัปโหลด Roblox จาก JOOX').addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง/ศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงศิลปินจาก JOOX').addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงฮิตจาก JOOX').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่ม Auto').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุด Auto').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลง').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ดูคลังเพลง').setDescription('ดูคลัง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('สุ่มเพลง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Commands registered!');
    } catch (e) { console.error(e); }
    refreshMessage();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);

    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงแล้ว!')] });
        await refreshMessage();
    }

    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const query = options.getString('ชื่อเพลง');
        const results = await searchJoox(query);
        if (results.length === 0) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลง **${query}**`)] });
            return;
        }
        
        let result = null;
        for (let i = 0; i < results.length; i++) {
            result = await processSong(results[i], interaction, i, results.length);
            if (result.status === 'success') break;
        }

        if (result && result.status === 'success') {
            const robloxInfo = result.uploadResult.success ? `✅ Roblox ID: ${result.uploadResult.assetId}` : `❌ ${result.uploadResult.error}`;
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('✅ สำเร็จ!').addFields(
                    { name: '🎵 เพลง', value: result.song.title, inline: true },
                    { name: '🎤 ศิลปิน', value: result.song.artist, inline: true },
                    { name: '🟢 Roblox', value: robloxInfo, inline: false }
                )]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result?.reason || 'ไม่สำเร็จ'}`)] });
        }
    }

    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        const results = await searchJoox(artist);

        if (results.length === 0) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ไม่พบเพลงของ **${artist}**`)] });
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
            if (result.status === 'success') added.push(result.song);
            else skipped.push(result.reason || 'unknown');
            await new Promise(res => setTimeout(res, 3000));
        }

        const summary = added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢` : '🔴'}`).join('\n') || 'ไม่มีเพลงใหม่';
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

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const results = await searchJoox('เพลงไทย');

        if (results.length === 0) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง')] });
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
            if (result.status === 'success') added.push(result.song);
            else skipped.push(result.reason);
            await new Promise(res => setTimeout(res, 3000));
        }

        const summary = added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢` : '🔴'}`).join('\n') || 'ไม่มีเพลงใหม่';
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

    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) { await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่แล้ว!')] }); return; }
        songChannelId = interaction.channelId;
        saveData();
        await interaction.reply({ embeds: [replyEmbed.setDescription('🚀 เริ่มระบบอัตโนมัติ!')] });
        await runAutoSearch(interaction.channel);
        autoTask = setInterval(async () => {
            const ch = client.channels.cache.get(interaction.channelId);
            if (ch) await runAutoSearch(ch);
        }, 60000);
    }

    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) { clearInterval(autoTask); autoTask = null; await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ หยุดแล้ว!')] }); }
        else { await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ไม่ได้ทำงานอยู่!')] }); }
    }

    if (commandName === 'ลบเพลง') {
        const id = options.getString('id');
        if (songs[id]) { delete songs[id]; saveData(); await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ลบ ${id} แล้ว!`)] }); await refreshMessage(); }
        else { await interaction.reply({ embeds: [replyEmbed.setDescription('❌ ไม่พบเพลง!')] }); }
    }

    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uploaded = songList.filter(s => s.robloxAssetId).length;
        await interaction.reply({ embeds: [replyEmbed.setTitle('📂 สถิติคลังเพลง')
            .addFields(
                { name: '🎵 เพลงทั้งหมด', value: `${songList.length}`, inline: true },
                { name: '🟢 อัปโหลด Roblox แล้ว', value: `${uploaded}`, inline: true },
                { name: '🔴 ยังไม่อัปโหลด', value: `${songList.length - uploaded}`, inline: true }
            )
        ] });
    }

    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) { await interaction.reply({ embeds: [replyEmbed.setDescription('📭 ว่างเปล่า!')] }); return; }
        const s = songList[Math.floor(Math.random() * songList.length)];
        await interaction.reply({ embeds: [replyEmbed.setTitle('🎲 สุ่มได้เพลงนี้!')
            .addFields(
                { name: '🎵', value: s.title, inline: true },
                { name: '🎤', value: s.artist, inline: true },
                { name: '🟢 Roblox', value: s.robloxAssetId || 'ยังไม่อัปโหลด', inline: false }
            )
        ] });
    }
});

client.login(token);
