const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const app = express();
app.get('/', (req, res) => { res.send('Bot is running!'); });
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`Web server running on port ${PORT}`); });

let songs = {};
let autoTask = null;
let songChannelId = null;
let refreshTask = null;

// ★★★ หา cookies ★★★
const cookiesPath = path.join(__dirname, 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

if (hasCookies) {
    console.log('✅ cookies.txt found. Will use for yt-dlp');
} else {
    console.log('⚠️ cookies.txt not found.');
}

const COMPILATION_KEYWORDS = [
    "รวมเพลง", "playlist", "อัลบั้ม", "album", "mixtape", "compilation",
    "รวมฮิต", "best of", "greatest hits", "non-stop", "nonstop", "mix",
    "dj", "medley", "lofi", "lo-fi"
];

function isCompilation(title) {
    const lower = title.toLowerCase();
    for (const kw of COMPILATION_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) return true;
    }
    return false;
}

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

async function searchYouTube(query) {
    try {
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', q: query, type: 'video', maxResults: 10, key: YOUTUBE_API_KEY },
            timeout: 15000
        });
        const items = searchRes.data.items || [];
        if (items.length === 0) return [];

        const videoIds = items.map(i => i.id.videoId).join(',');
        const detailRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'contentDetails', id: videoIds, key: YOUTUBE_API_KEY },
            timeout: 15000
        });

        const durations = {};
        if (detailRes.data.items) {
            detailRes.data.items.forEach(item => {
                durations[item.id] = parseISODuration(item.contentDetails.duration);
            });
        }

        return items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            thumbnail: item.snippet.thumbnails.high.url,
            duration: durations[item.id.videoId] || 0
        }));
    } catch (error) {
        console.error('Error searching:', error.message);
        return [];
    }
}

function parseISODuration(iso) {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

// ★★★ ดาวน์โหลดเสียงด้วย yt-dlp ★★★
async function downloadAudio(videoId) {
    const tempPath = path.join('/tmp', `${videoId}.mp3`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const options = {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '192',
        output: tempPath,
        noWarnings: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    };

    if (hasCookies) {
        options.cookies = cookiesPath;
    }

    try {
        await youtubedl(url, options);
        return tempPath;
    } catch (error) {
        console.error('yt-dlp download error:', error.message);
        throw new Error(`Download failed: ${error.message}`);
    }
}

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
        return { success: false, error: JSON.stringify(response.data) };
    } catch (error) {
        return { success: false, error: error.response?.data ? JSON.stringify(error.response.data) : error.message };
    }
}

async function processSong(video, interaction = null) {
    if (songs[video.id]) return { status: 'skipped', reason: 'มีอยู่ในระบบแล้ว' };
    if (isBanned(video.title, video.artist)) return { status: 'banned' };
    if (isCompilation(video.title)) return { status: 'skipped', reason: 'เป็นเพลงรวม' };
    if (video.duration > 900) return { status: 'skipped', reason: 'ยาวเกิน 15 นาที' };

    try {
        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('⬇️ กำลังดาวน์โหลดเพลง...')
                    .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}`)
                    .setColor(0xf1c40f)
                    .setThumbnail(video.thumbnail)
                ]
            });
        }

        const audioPath = await downloadAudio(video.id);

        if (interaction) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('⬆️ กำลังอัปโหลดขึ้น Roblox...')
                    .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}`)
                    .setColor(0x3498db)
                    .setThumbnail(video.thumbnail)
                ]
            });
        }

        const uploadResult = await uploadToRoblox(audioPath, video.title, video.artist);

        songs[video.id] = {
            ...video,
            robloxAssetId: uploadResult.success ? uploadResult.assetId : null,
            robloxError: uploadResult.success ? null : uploadResult.error
        };

        try { fs.unlinkSync(audioPath); } catch (e) {}

        await refreshMessage();
        return { status: 'success', song: songs[video.id], uploadResult };
    } catch (error) {
        console.error('Process song error:', error.message);
        return { status: 'failed', reason: error.message };
    }
}

async function addSongFromYouTube(query, interaction = null) {
    const items = await searchYouTube(query);
    if (!items || items.length === 0) return { status: 'failed', reason: 'ไม่พบผลลัพธ์' };

    for (const video of items) {
        const result = await processSong(video, interaction);
        if (result.status === 'success') return result;
        if (result.status === 'failed') return result;
    }
    return { status: 'skipped', reason: 'ทุกเพลงที่เจอซ้ำ/ถูกข้าม' };
}

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
        .setTitle('🎤 รายการเพลง Karaoke')
        .setColor(0x000000)
        .setFooter({ text: `รวม ${songList.length} เพลง · อัปเดต: ${new Date().toLocaleTimeString('th-TH')}` });

    let description = '';
    chunk.forEach((s, i) => {
        const roblox = s.robloxAssetId ? `🟢 Roblox: ${s.robloxAssetId}` : `🔴 ${s.robloxError ? 'Error: ' + s.robloxError.slice(0, 50) : 'ยังไม่อัปโหลด'}`;
        description += `**${i + 1}. ${s.title}**\n　🎤 ${s.artist} · ⏱️ ${fmtDuration(s.duration)}\n　🆔 \`${s.id}\` · ${roblox}\n\n`;
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

async function runAutoSearch(channel) {
    try {
        const searchMsg = await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🔍 ระบบอัตโนมัติกำลังหาเพลง...')
                .setDescription(`🎯 เป้าหมาย: **เพลงไทย**\n⏱️ เริ่มเมื่อ: ${new Date().toLocaleTimeString('th-TH')}`)
                .setColor(0xf1c40f)
            ]
        });

        const items = await searchYouTube('เพลงไทย');
        let result = null;

        for (const video of items) {
            const r = await processSong(video, searchMsg);
            if (r.status === 'success') { result = r; break; }
        }

        if (result && result.status === 'success') {
            const uploadInfo = result.uploadResult.success
                ? `🟢 Roblox: ${result.uploadResult.assetId}`
                : `🔴 Roblox Error: ${result.uploadResult.error}`;
            await searchMsg.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ เพิ่มเพลงอัตโนมัติสำเร็จ!')
                    .setDescription(`🎵 **${result.song.title}**\n🎤 ${result.song.artist}\n⏱️ ${fmtDuration(result.song.duration)}\n\n${uploadInfo}\n\n🔄 หาใหม่ในอีก 60 วิ`)
                    .setColor(0x57F287)
                    .setThumbnail(result.song.thumbnail)
                ]
            });
        } else {
            await searchMsg.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('⏭️ ไม่มีเพลงใหม่ในรอบนี้')
                    .setDescription(`เจอ ${items.length} เพลง แต่ซ้ำ/ข้ามทั้งหมด\n\n🔄 รอ 60 วิ แล้วหาใหม่`)
                    .setColor(0xe67e22)
                ]
            });
        }
    } catch (error) {
        console.error('Auto search error:', error.message);
        await channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription(error.message).setColor(0xe74c3c)] });
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startAutoRefresh();

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องแสดงเพลง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหา+อัปโหลด Roblox').addStringOption(o => o.setName('ชื่อเพลง').setDescription('ชื่อเพลง/ศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงศิลปิน+อัปโหลด').addStringOption(o => o.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงฮิต+อัปโหลด').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงแล้ว!')] });
        await refreshMessage();
    }

    if (commandName === 'หาเพลง') {
        await interaction.deferReply();
        const result = await addSongFromYouTube(options.getString('ชื่อเพลง'), interaction);
        const r = songs[Object.keys(songs).pop()];
        if (result.status === 'success') {
            const robloxInfo = result.uploadResult.success ? `✅ Roblox ID: ${result.uploadResult.assetId}` : `❌ ${result.uploadResult.error}`;
            await interaction.editReply({
                embeds: [replyEmbed.setTitle('✅ สำเร็จ!').setThumbnail(r.thumbnail).addFields(
                    { name: '🎵 เพลง', value: r.title, inline: true },
                    { name: '🎤 ศิลปิน', value: r.artist, inline: true },
                    { name: '⏱️ เวลา', value: fmtDuration(r.duration), inline: true },
                    { name: '🟢 Roblox', value: robloxInfo, inline: false }
                )]
            });
        } else {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ ${result.reason || 'ไม่สำเร็จ'}`)] });
        }
    }

    if (commandName === 'ศิลปิน') {
        await interaction.deferReply();
        const artist = options.getString('ชื่อศิลปิน');
        const items = await searchYouTube(artist);
        const added = [];
        for (let i = 0; i < items.length; i++) {
            const r = await processSong(items[i], interaction);
            if (r.status === 'success') added.push(r.song);
            await new Promise(res => setTimeout(res, 3000));
        }
        await interaction.editReply({
            embeds: [replyEmbed.setTitle(`✅ ดึงเพลงของ ${artist} สำเร็จ`)
                .setDescription(added.map(s => `- **${s.title}** ${s.robloxAssetId ? `🟢 (${s.robloxAssetId})` : '🔴'}`).join('\n') || 'ไม่มีเพลงใหม่')
                .setColor(0x57F287)
            ]
        });
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        const items = await searchYouTube('เพลงไทย');
        const added = [];
        for (const video of items) {
            const r = await processSong(video, interaction);
            if (r.status === 'success') added.push(r.song);
            await new Promise(res => setTimeout(res, 3000));
        }
        await interaction.editReply({
            embeds: [replyEmbed.setTitle('✅ ดึงเพลงฮิตสำเร็จ')
                .setDescription(added.map(s => `- **${s.title}**`).join('\n') || 'ไม่มีเพลงใหม่')
                .setColor(0x57F287)
            ]
        });
    }

    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) { await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ ทำงานอยู่แล้ว!')] }); return; }
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
        if (songs[id]) { delete songs[id]; await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ ลบ ${id} แล้ว!`)] }); await refreshMessage(); }
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
                { name: '⏱️', value: fmtDuration(s.duration), inline: true },
                { name: '🟢 Roblox', value: s.robloxAssetId || 'ยังไม่อัปโหลด', inline: false }
            ).setThumbnail(s.thumbnail)
        ] });
    }
});

client.login(token);
