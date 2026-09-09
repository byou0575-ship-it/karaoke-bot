const { createRequire } = require('module');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ytlib = require('yt-lib');
require('dotenv').config();

const { YoutubeSearch } = ytlib;

const token = process.env.DISCORD_BOT_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// เก็บข้อมูลเพลงในเครื่อง (จำลองจากเดิม)
let songs = {};

function getTime() { return new Date().toISOString(); }

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

    // ส่งข้อความใหม่ทุกครั้งเพื่อความเรียบง่าย (หรือหา Message ID เดิมมา Edit)
    await channel.send({ embeds: [embed] });
}

// คำสั่งนี้จะถูกใช้งานเพื่อดาวน์โหลดเสียง
async function addSong(url) {
    // ใช้ yt-lib เพื่อค้นหา
    const { results, errors } = await YoutubeSearch.search({ query: url, type: "video" });
    if (results && results.length > 0) {
        const video = results[0];
        songs[video.id] = {
            id: video.id,
            title: video.title,
            url: url
        };
        await refreshMessage();
        return true;
    }
    return false;
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    refreshMessage();
});

// จัดการ Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'setup') {
        // บันทึก Channel ID ลง env (ในโปรเจกต์จริงควรใช้ DB แต่นี่ทำให้ดูง่าย)
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
        
        const { results, errors } = await YoutubeSearch.search({ query: artist, type: "channel" });
        if (results && results.length > 0) {
            // จำลองการดึงเพลงทั้งหมด
            await interaction.editReply(`✅ ดึงข้อมูลช่อง ${results[0].title} แล้ว (ระบบจริงจะดึงเพลงทีละเพลง)`);
        } else {
            await interaction.editReply('❌ ไม่พบช่องนี้');
        }
    }
    
    if (commandName === 'auto_start') {
        await interaction.reply('🚀 เริ่มระบบ Auto แล้ว (ผู้ใช้ต้องยอมรับความเสี่ยงที่ CPU จะโดนจำกัด)');
        // จำลองการวนลูปหาเพลง
        setInterval(async () => {
            const { results } = await YoutubeSearch.search({ query: "เพลงไทย", type: "video" });
            if (results && results.length > 0) {
                await addSong(results[0].url);
            }
        }, 60000); // ทุก 60 วินาที
    }
});

client.login(token);
