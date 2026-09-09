const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Express Server
const app = express();
app.get('/', (req, res) => {
    res.send('Bot is running!');
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// yt-dlp
const ytDlpWrap = new YTDlpWrap(path.join(__dirname, 'yt-dlp'));
const cookiesPath = path.join(__dirname, 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

let songs = {};
let autoTask = null;

// ระบบคัดกรองเนื้อหาต้องห้าม (ตามที่ขอ)
const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "xxx", "porn", "sex", "18+",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "บูลลี่", "bully",
    "เหยียด", "ชาติพันธุ์", "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) return true;
    }
    return false;
}

// ฟังก์ชันดึงข้อมูลเพลง
async function getTrackInfo(url) {
    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--skip-download'];
    if (hasCookies) args.push('--cookies', cookiesPath);
    try {
        const output = await ytDlpWrap.execPromise(url, args);
        // yt-dlp อาจคืนค่าเป็น Array หรือ Object ก็ได้ ต้องเช็คให้ดี
        let info;
        if (Array.isArray(output)) {
            info = output[0];
        } else {
            info = output;
        }
        return info;
    } catch (error) {
        console.error('Error fetching track info:', error);
        return null;
    }
}

// ยูทิลิตี้: ค้นหา URL เพลงแรกจากคำค้น
async function searchTrackUrl(query) {
    try {
        const output = await ytDlpWrap.execPromise(`ytsearch1:${query}`, ['--dump-json', '--no-warnings', '--skip-download']);
        let tracks = [];
        if (Array.isArray(output)) {
            tracks = output;
        } else if (output && output.entries) {
            tracks = output.entries;
        }
        return tracks[0] ? tracks[0].url : null;
    } catch (error) {
        console.error('Error searching:', error);
        return null;
    }
}

// เพิ่มเพลง (พร้อมคัดกรอง)
async function addSong(url) {
    const info = await getTrackInfo(url);
    if (info && info.id) {
        const title = info.title || 'Unknown';
        const artist = info.uploader || 'Unknown';

        if (isBanned(title, artist)) return 'banned';

        songs[info.id] = {
            id: info.id,
            title: title,
            artist: artist,
            url: url
        };
        await refreshMessage();
        return 'success';
    }
    return 'failed';
}

// ฟังก์ชันรีเฟรชข้อความ
async function refreshMessage() {
    const channelId = process.env.SONG_CHANNEL_ID;
    if (!channelId) return;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;
    const lines = Object.values(songs).map(song => 
        `**${song.title}** (Artist: ${song.artist}) (ID: ${song.id})`
    ).join('\n') || 'ยังไม่มีเพลง';
    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(lines)
        .setColor(0x1e1e2e);
    await channel.send({ embeds: [embed] });
}

// ลงทะเบียน Slash Commands
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (hasCookies) console.log('cookies.txt detected. Bot can bypass restrictions!');

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง'),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก YouTube โดยใช้ชื่อเพลงหรือชื่อศิลปิน').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงทั้งหมดของศิลปินที่ระบุ').addStringOption(option => option.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงยอดนิยม 10 อันดับแรก'),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่มระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุดระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลงออกจากระบบ').addStringOption(option => option.setName('id').setDescription('ID ของเพลงที่ต้องการลบ').setRequired(true)),
        new SlashCommandBuilder().setName('ดูคลังเพลง').setDescription('ดูรายการเพลงทั้งหมดที่มีในระบบ'),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('สุ่มเพลงหนึ่งเพลงจากคลัง'),
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }

    refreshMessage();
});

// จัดการคำสั่ง
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'ตั้งค่า') {
        process.env.SONG_CHANNEL_ID = interaction.channelId;
        await interaction.reply('✅ ตั้งค่าช่องเพลงเรียบร้อย!');
    }

    if (commandName === 'หาเพลง') {
        const query = options.getString('ชื่อเพลง');
        await interaction.reply(`⏳ กำลังค้นหาเพลง: ${query}...`);
        try {
            const url = await searchTrackUrl(query);
            if (url) {
                const addResult = await addSong(url);
                if (addResult === 'success') {
                    await interaction.editReply(`✅ เพิ่มเพลง: **${songs[Object.keys(songs).pop()].title}** เรียบร้อย!`);
                } else if (addResult === 'banned') {
                    await interaction.editReply('⛔ เพลงนี้มีเนื้อหาต้องห้าม ไม่สามารถเพิ่มได้!');
                } else {
                    await interaction.editReply('❌ หาเพลงไม่สำเร็จ!');
                }
            } else {
                await interaction.editReply('❌ ไม่พบเพลงนี้!');
            }
        } catch (error) {
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }

    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.reply(`⏳ กำลังดึงเพลงทั้งหมดของ ${artist}...`);
        try {
            // 1. ค้นหาช่อง
            const channelSearch = await ytDlpWrap.execPromise(`ytsearch1:${artist}`, ['--dump-json', '--no-warnings', '--skip-download']);
            let foundChannel = null;
            if (Array.isArray(channelSearch)) foundChannel = channelSearch[0];
            else if (channelSearch && channelSearch.entries) foundChannel = channelSearch.entries[0];

            if (!foundChannel || !foundChannel.channel_url) {
                await interaction.editReply(`❌ ไม่พบช่องของ ${artist}!`);
                return;
            }

            const channelUrl = foundChannel.channel_url;
            const added = [];
            const banned = [];

            // 2. ดึงวิดีโอทั้งหมดจากช่อง
            const playlist = await ytDlpWrap.execPromise(`${channelUrl}/videos`, ['--dump-json', '--no-warnings', '--skip-download', '--flat-playlist']);
            let videos = [];
            if (Array.isArray(playlist)) videos = playlist;
            else if (playlist && playlist.entries) videos = playlist.entries;

            // 3. เพิ่มทีละเพลง (พัก 5 วิ/เพลง)
            for (const video of videos) {
                if (video && video.url) {
                    const result = await addSong(video.url);
                    if (result === 'success') added.push(video.url);
                    if (result === 'banned') banned.push(video.url);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            await interaction.editReply(`✅ ดึงเพลงของ ${artist} สำเร็จ! (+${added.length} เพลง) ${banned.length > 0 ? `⛔ (ข้าม ${banned.length} เพลงที่มีเนื้อหาต้องห้าม)` : ''}`);
        } catch (error) {
            console.error('Error syncing artist:', error);
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.reply('⏳ กำลังดึงเพลงยอดนิยม...');
        try {
            const output = await ytDlpWrap.execPromise('ytsearch10:เพลงฮิต', ['--dump-json', '--no-warnings', '--skip-download']);
            let tracks = [];
            if (Array.isArray(output)) tracks = output;
            else if (output && output.entries) tracks = output.entries;

            const added = [];
            const banned = [];
            for (const item of tracks) {
                if (item && item.url) {
                    const result = await addSong(item.url);
                    if (result === 'success') added.push(item.url);
                    if (result === 'banned') banned.push(item.url);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            await interaction.editReply(`✅ ดึงเพลงยอดนิยมสำเร็จ! (+${added.length} เพลง) ${banned.length > 0 ? `⛔ (ข้าม ${banned.length} เพลงที่มีเนื้อหาต้องห้าม)` : ''}`);
        } catch (error) {
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }

    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            await interaction.reply('⚠️ ระบบหาเพลงอัตโนมัติกำลังทำงานอยู่แล้ว!');
            return;
        }
        await interaction.reply('🚀 เริ่มระบบหาเพลงอัตโนมัติแล้ว!');
        autoTask = setInterval(async () => {
            try {
                const url = await searchTrackUrl('เพลงไทย');
                if (url) {
                    await addSong(url);
                }
            } catch (error) {
                console.error('Auto add error:', error);
            }
        }, 60000); // ทุก 60 วินาที
    }

    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply('⏹️ หยุดระบบหาเพลงอัตโนมัติแล้ว!');
        } else {
            await interaction.reply('⚠️ ระบบหาเพลงอัตโนมัติไม่ได้ทำงานอยู่!');
        }
    }

    if (commandName === 'ลบเพลง') {
        const songId = options.getString('id');
        if (songs[songId]) {
            delete songs[songId];
            await interaction.reply(`✅ ลบเพลง ${songId} แล้ว!`);
        } else {
            await interaction.reply('❌ ไม่พบเพลงนี้!');
        }
    }

    if (commandName === 'ดูคลังเพลง') {
        await interaction.reply(`📂 มีทั้งหมด ${Object.keys(songs).length} เพลงในคลัง`);
    }

    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) {
            await interaction.reply('📭 คลังเพลงว่างเปล่า!');
            return;
        }
        const randomSong = songList[Math.floor(Math.random() * songList.length)];
        await interaction.reply(`🎲 สุ่มได้เพลง: **${randomSong.title}** (ID: ${randomSong.id})`);
    }
});

client.login(token);
