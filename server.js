const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
let songChannelId = null;

// ระบบคัดกรองเนื้อหาต้องห้าม
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

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ฟังก์ชันดึงข้อมูลเพลง
async function getTrackInfo(url) {
    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--skip-download'];
    if (hasCookies) args.push('--cookies', cookiesPath);
    try {
        const output = await ytDlpWrap.execPromise(url, args);
        let info;
        if (Array.isArray(output)) info = output[0];
        else info = output;
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
        if (Array.isArray(output)) tracks = output;
        else if (output && output.entries) tracks = output.entries;
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
            url: url,
            duration: info.duration || 0
        };
        await refreshMessage();
        return 'success';
    }
    return 'failed';
}

// รีเฟรชข้อความสวยงาม
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    const totalSongs = songList.length;
    const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;

    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(songList.length === 0 ? 'ยังไม่มีเพลงในคลัง' : songList.map(s => `**${s.title}**\n🎤 ${s.artist} · ⏱ ${fmtDuration(s.duration)} · \`${s.id}\``).join('\n\n'))
        .setColor(0x5865F2)
        .setFooter({ text: `รวม ${totalSongs} เพลง · ศิลปิน ${uniqueArtists} คน` });

    const existingMessages = await channel.messages.fetch({ limit: 5 }).catch(() => []);
    for (const msg of existingMessages.values()) {
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
            await msg.edit({ embeds: [embed] }).catch(() => {});
            return;
        }
    }
    await channel.send({ embeds: [embed] });
}

// ลงทะเบียน Slash Commands
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (hasCookies) console.log('cookies.txt detected. Bot can bypass restrictions!');

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง'),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก YouTube โดยใช้ชื่อเพลง').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)),
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
    const replyEmbed = new EmbedBuilder().setColor(0x5865F2);

    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        process.env.SONG_CHANNEL_ID = interaction.channelId;
        replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!');
        await interaction.reply({ embeds: [replyEmbed] });
        await refreshMessage();
    }

    if (commandName === 'หาเพลง') {
        const query = options.getString('ชื่อเพลง');
        await interaction.deferReply();
        const startTime = Date.now();
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`⏳ **กำลังค้นหาเพลง:** ${query}...`)] });
        try {
            const url = await searchTrackUrl(query);
            if (url) {
                const addResult = await addSong(url);
                if (addResult === 'success') {
                    const addedSong = songs[Object.keys(songs).pop()];
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    replyEmbed
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .addFields(
                            { name: '🎵 ชื่อเพลง', value: addedSong.title, inline: true },
                            { name: '🎤 ศิลปิน', value: addedSong.artist, inline: true },
                            { name: '⏱️ ใช้เวลา', value: `${elapsed} วินาที`, inline: true }
                        )
                        .setThumbnail(addedSong.thumbnail || null);
                    await interaction.editReply({ embeds: [replyEmbed] });
                } else if (addResult === 'banned') {
                    replyEmbed.setDescription('⛔ **เพลงนี้มีเนื้อหาต้องห้าม** ไม่สามารถเพิ่มได้!');
                    await interaction.editReply({ embeds: [replyEmbed] });
                } else {
                    replyEmbed.setDescription('❌ **หาเพลงไม่สำเร็จ!**');
                    await interaction.editReply({ embeds: [replyEmbed] });
                }
            } else {
                replyEmbed.setDescription('❌ **ไม่พบเพลงนี้!**');
                await interaction.editReply({ embeds: [replyEmbed] });
            }
        } catch (error) {
            console.error('Error searching:', error);
            replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`);
            await interaction.editReply({ embeds: [replyEmbed] });
        }
    }

    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.deferReply();
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`⏳ **กำลังดึงเพลงทั้งหมดของ ${artist}...**`)] });
        try {
            const channelSearch = await ytDlpWrap.execPromise(`ytsearch1:${artist}`, ['--dump-json', '--no-warnings', '--skip-download']);
            let foundChannel = null;
            if (Array.isArray(channelSearch)) foundChannel = channelSearch[0];
            else if (channelSearch && channelSearch.entries) foundChannel = channelSearch.entries[0];

            if (!foundChannel || !foundChannel.channel_url) {
                replyEmbed.setDescription(`❌ **ไม่พบช่องของ ${artist}!**`);
                await interaction.editReply({ embeds: [replyEmbed] });
                return;
            }

            const channelUrl = foundChannel.channel_url;
            const added = [];
            const banned = [];

            const playlist = await ytDlpWrap.execPromise(`${channelUrl}/videos`, ['--dump-json', '--no-warnings', '--skip-download', '--flat-playlist']);
            let videos = [];
            if (Array.isArray(playlist)) videos = playlist;
            else if (playlist && playlist.entries) videos = playlist.entries;

            for (const video of videos) {
                if (video && video.url) {
                    const result = await addSong(video.url);
                    if (result === 'success') added.push(video.url);
                    if (result === 'banned') banned.push(video.url);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            replyEmbed
                .setTitle('✅ ดึงเพลงของศิลปินสำเร็จ!')
                .addFields(
                    { name: '🎤 ศิลปิน', value: artist, inline: true },
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true }
                );
            await interaction.editReply({ embeds: [replyEmbed] });
        } catch (error) {
            console.error('Error syncing artist:', error);
            replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`);
            await interaction.editReply({ embeds: [replyEmbed] });
        }
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        await interaction.editReply({ embeds: [replyEmbed.setDescription('⏳ **กำลังดึงเพลงยอดนิยม 10 อันดับ...**')] });
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
            replyEmbed
                .setTitle('✅ ดึงเพลงยอดนิยมสำเร็จ!')
                .addFields(
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true }
                );
            await interaction.editReply({ embeds: [replyEmbed] });
        } catch (error) {
            replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`);
            await interaction.editReply({ embeds: [replyEmbed] });
        }
    }

    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ **ระบบหาเพลงอัตโนมัติกำลังทำงานอยู่แล้ว!**')] });
            return;
        }
        await interaction.reply({ embeds: [replyEmbed.setDescription('🚀 **เริ่มระบบหาเพลงอัตโนมัติแล้ว!**')] });
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
            await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ **หยุดระบบหาเพลงอัตโนมัติแล้ว!**')] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ **ระบบหาเพลงอัตโนมัติไม่ได้ทำงานอยู่!**')] });
        }
    }

    if (commandName === 'ลบเพลง') {
        const songId = options.getString('id');
        if (songs[songId]) {
            delete songs[songId];
            await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ **ลบเพลง ${songId} แล้ว!**`)] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ **ไม่พบเพลงนี้!**')] });
        }
    }

    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;
        replyEmbed
            .setTitle('📂 สถิติคลังเพลง')
            .addFields(
                { name: '🎵 เพลงทั้งหมด', value: `${songList.length} เพลง`, inline: true },
                { name: '🎤 ศิลปินทั้งหมด', value: `${uniqueArtists} คน`, inline: true },
                { name: '🆔 ID ล่าสุด', value: songList.length > 0 ? songList[songList.length - 1].id : 'ไม่มี', inline: true }
            );
        await interaction.reply({ embeds: [replyEmbed] });
    }

    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) {
            await interaction.reply({ embeds: [replyEmbed.setDescription('📭 **คลังเพลงว่างเปล่า!**')] });
            return;
        }
        const randomSong = songList[Math.floor(Math.random() * songList.length)];
        replyEmbed
            .setTitle('🎲 สุ่มได้เพลงนี้!')
            .addFields(
                { name: '🎵 ชื่อเพลง', value: randomSong.title, inline: true },
                { name: '🎤 ศิลปิน', value: randomSong.artist, inline: true },
                { name: '🆔 ID', value: randomSong.id, inline: true }
            );
        await interaction.reply({ embeds: [replyEmbed] });
    }
});

client.login(token);
