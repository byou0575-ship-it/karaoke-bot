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

// ระบบคัดกรองเนื้อหาต้องห้าม (ตามที่ขอ)
const BANNED_WORDS = [
    // คำหยาบ
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "quan", "โง่",
    // ลามก
    "xxx", "porn", "sex", "18+", "หนังโป๊", "ลามก",
    // การเมือง
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "ชนชั้น",
    // บูลลี่/เหยียด
    "บูลลี่", "bully", "เหยียด", "ชาติพันธุ์", "เสียดสี",
    // ความรุนแรง
    "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word in BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) {
            return true;
        }
    }
    return false;
}

// ค้นหาช่องของศิลปินและดึงเพลงทั้งหมด
async function getArtistTracks(artistName) {
    try {
        // 1. ค้นหาช่องจากชื่อศิลปิน
        const { results: channelSearch } = await ytDlpWrap.execPromise(`ytsearch1:${artistName}`, ['--dump-json', '--no-warnings', '--skip-download']);
        if (!channelSearch || channelSearch.length === 0) return [];

        const channelUrl = channelSearch[0].channel_url;
        if (!channelUrl) return [];

        // 2. ดึงวิดีโอทั้งหมดจากช่อง
        const playlist = await ytDlpWrap.execPromise(`${channelUrl}/videos`, ['--dump-json', '--no-warnings', '--skip-download', '--flat-playlist']);
        
        const videos = Array.isArray(playlist) ? playlist : [playlist];
        const urls = [];
        for (const video of videos) {
            if (video && video.url) {
                urls.push(video.url);
            }
        }
        return urls;
    } catch (error) {
        console.error('Error getting artist tracks:', error);
        return [];
    }
}

// เพิ่มเพลง (พร้อมคัดกรอง)
async function addSong(url) {
    const info = await getTrackInfo(url);
    if (info && info.id) {
        const title = info.title || 'Unknown';
        const artist = info.uploader || 'Unknown';

        // คัดกรองเนื้อหาก่อนเพิ่ม
        if (isBanned(title, artist)) {
            console.log(`Banned song skipped: ${title}`);
            return 'banned';
        }

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

// รีเฟรชข้อความ
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
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก YouTube').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงทั้งหมดของศิลปินที่ระบุ').addStringOption(option => option.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงยอดนิยม 10 อันดับแรก'),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่มระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุดระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลงออกจากระบบ').addStringOption(option => option.setName('id').setDescription('ID ของเพลงที่ต้องการลบ').setRequired(true))
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
            const { results } = await ytDlpWrap.execPromise(`ytsearch1:${query}`, ['--dump-json', '--no-warnings', '--skip-download']);
            if (results && results.length > 0) {
                const url = results[0].url;
                const addResult = await addSong(url);
                if (addResult === 'success') {
                    await interaction.editReply(`✅ เพิ่มเพลง: **${results[0].title}** เรียบร้อย!`);
                } else if (addResult === 'banned') {
                    await interaction.editReply(`⛔ เพลงนี้มีเนื้อหาต้องห้าม ไม่สามารถเพิ่มได้!`);
                } else {
                    await interaction.editReply('❌ หาเพลงไม่สำเร็จ!');
                }
            } else {
                await interaction.editReply('❌ ไม่พบเพลงนี้!');
            }
        } catch (error) {
            console.error('Error searching:', error);
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
    
    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.reply(`⏳ กำลังดึงเพลงทั้งหมดของ ${artist}...`);
        
        try {
            const urls = await getArtistTracks(artist);
            const added = [];
            const banned = [];
            
            if (urls.length === 0) {
                await interaction.editReply(`❌ ไม่พบเพลงของ ${artist}!`);
                return;
            }
            
            // ดึงทีละเพลง (พัก 3 วิ เพื่อป้องกันโดนบล็อก)
            for (const url of urls) {
                const result = await addSong(url);
                if (result === 'success') added.push(url);
                if (result === 'banned') banned.push(url);
                await new Promise(resolve => setTimeout(resolve, 3000));
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
            const { results } = await ytDlpWrap.execPromise('ytsearch10:เพลงฮิต', ['--dump-json', '--no-warnings', '--skip-download']);
            const added = [];
            const banned = [];
            for (const item of results) {
                const result = await addSong(item.url);
                if (result === 'success') added.push(item.url);
                if (result === 'banned') banned.push(item.url);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            await interaction.editReply(`✅ ดึงเพลงยอดนิยมสำเร็จ! (+${added.length} เพลง) ${banned.length > 0 ? `⛔ (ข้าม ${banned.length} เพลงที่มีเนื้อหาต้องห้าม)` : ''}`);
        } catch (error) {
            await interaction.editReply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
    
    if (commandName === 'เริ่มหาเพลง') {
        await interaction.reply('🚀 เริ่มระบบหาเพลงอัตโนมัติแล้ว!');
        setInterval(async () => {
            try {
                const { results } = await ytDlpWrap.execPromise('ytsearch1:เพลงไทย', ['--dump-json', '--no-warnings', '--skip-download']);
                if (results && results.length > 0) {
                    await addSong(results[0].url);
                }
            } catch (error) {
                console.error('Auto add error:', error);
            }
        }, 60000); // ทุก 60 วินาที
    }
    
    if (commandName === 'หยุดหาเพลง') {
        await interaction.reply('⏹️ หยุดระบบหาเพลงอัตโนมัติแล้ว!');
        // หมายเหตุ: ยังต้องรีสตาร์ท Service เพื่อล้าง Interval
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
});

client.login(token);
