const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// สร้าง Express Server เพื่อเปิดพอร์ตให้ Render เห็น
const app = express();
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// ตั้งค่าพอร์ต
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// yt-dlp
const ytDlpWrap = new YTDlpWrap(path.join(__dirname, 'yt-dlp'));
const cookiesPath = path.join(__dirname, 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

let songs = {};

async function getTrackInfo(url) {
    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--skip-download'];
    if (hasCookies) args.push('--cookies', cookiesPath);

    try {
        const output = await ytDlpWrap.execPromise(url, args);
        const info = JSON.parse(output);
        return info;
    } catch (error) {
        console.error('Error fetching track info:', error);
        return null;
    }
}

async function downloadTrack(url, outputPath) {
    const args = [
        '-f', 'bestaudio/best',
        '-x', '--audio-format', 'mp3',
        '--audio-quality', '192',
        '--no-playlist', '--no-warnings',
        '-o', outputPath
    ];
    if (hasCookies) args.push('--cookies', cookiesPath);

    try {
        await ytDlpWrap.execPromise(url, args);
        return true;
    } catch (error) {
        console.error('Error downloading track:', error);
        return false;
    }
}

async function refreshMessage() {
    const channelId = process.env.SONG_CHANNEL_ID;
    if (!channelId) return;
    
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const lines = Object.values(songs).map(song => 
        `**${song.title}** (ID: ${song.id})`
    ).join('\n') || 'ยังไม่มีเพลง';
    
    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(lines)
        .setColor(0x1e1e2e);

    await channel.send({ embeds: [embed] });
}

async function addSong(url) {
    const info = await getTrackInfo(url);
    if (info && info.id) {
        songs[info.id] = {
            id: info.id,
            title: info.title,
            url: url
        };
        await refreshMessage();
        return true;
    }
    return false;
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (hasCookies) {
        console.log('cookies.txt detected. Bot can bypass restrictions!');
    } else {
        console.log('No cookies.txt found. Bot may fail due to YouTube restrictions.');
    }
    refreshMessage();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'setup') {
        process.env.SONG_CHANNEL_ID = interaction.channelId;
        await interaction.reply('✅ ตั้งค่าช่องเพลงเรียบร้อย!');
    }
    
    if (commandName === 'auto') {
        const url = options.getString('url');
        await interaction.reply('⏳ กำลังค้นหา...');
        const success = await addSong(url);
        await interaction.editReply(success ? '✅ เพิ่มเพลงเรียบร้อย!' : '❌ หาเพลงไม่เจอ');
    }
    
    if (commandName === 'sync_artist') {
        const artist = options.getString('artist');
        await interaction.reply(`⏳ กำลังค้นหาเพลงของ ${artist}...`);
        
        const { results } = await ytDlpWrap.execPromise(`ytsearch1:${artist}`, ['--dump-json', '--no-warnings', '--skip-download']);
        await interaction.editReply(`✅ ดึงข้อมูลช่อง ${artist} แล้ว`);
    }
    
    if (commandName === 'auto_start') {
        await interaction.reply('🚀 เริ่มระบบ Auto แล้ว');
        setInterval(async () => {
            const { results } = await ytDlpWrap.execPromise('ytsearch1:เพลงไทย', ['--dump-json', '--no-warnings', '--skip-download']);
            if (results && results.length > 0) {
                await addSong(results[0].url);
            }
        }, 60000);
    }
});

client.login(token);
