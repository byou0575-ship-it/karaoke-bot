const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;

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

let songs = {};
let autoTask = null;
let songChannelId = null;

// ระบบคัดกรองเนื้อหา
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

// ★★★ ฟังก์ชันค้นหาผ่าน YouTube Data API (ใช้ search อย่างเดียว) ★★★
async function searchYouTube(query) {
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 10,
                key: YOUTUBE_API_KEY
            },
            timeout: 15000
        });
        return response.data.items || [];
    } catch (error) {
        console.error('Error searching YouTube API:', error.message);
        return [];
    }
}

// ดึงข้อมูลวิดีโอจาก search endpoint (ไม่ต้องพึ่ง Videos endpoint)
function parseVideoFromSearch(item) {
    if (!item || !item.id || !item.id.videoId) return null;
    return {
        id: item.id.videoId,
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail: item.snippet.thumbnails.high.url,
        duration: 0, // Search API ไม่มีเวลา ต้องพึ่ง Videos endpoint แต่ถูกบล็อก เลยตัดทิ้ง
        robloxAssetId: null
    };
}

// ★★★ ฟังก์ชันเพิ่มเพลง ★★★
async function addSongFromYouTube(query) {
    try {
        const items = await searchYouTube(query);
        if (!items || items.length === 0) return 'failed';

        const video = parseVideoFromSearch(items[0]);
        if (!video) return 'failed';

        const title = video.title;
        const artist = video.artist;
        if (isBanned(title, artist)) return 'banned';

        songs[video.id] = video;
        await refreshMessage();
        return 'success';
    } catch (error) {
        console.error('Error in addSongFromYouTube:', error.message);
        return 'failed';
    }
}

// ★★★ ฟังก์ชันค้นหาศิลปินทั้งหมด (ใช้ Search API) ★★★
async function syncArtistSongs(artistName, interaction) {
    const startTime = Date.now();
    try {
        const videoItems = await searchYouTube(artistName);
        const totalVideos = videoItems.length;
        const added = [];
        const banned = [];
        const failed = [];

        if (totalVideos === 0) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **ไม่พบเพลงของ ${artistName}!**`).setColor(0xe74c3c)] });
            return;
        }

        for (let i = 0; i < videoItems.length; i++) {
            const item = videoItems[i];
            const video = parseVideoFromSearch(item);
            if (!video) continue;

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⏳ กำลังโหลดเพลงที่ ${i + 1}/${totalVideos}`)
                    .setDescription(`🎵 **${video.title}**`)
                    .setColor(0xf1c40f)
                    .setThumbnail(video.thumbnail)
                ]
            });

            const startTrack = Date.now();
            const result = await addSongFromYouTube(video.id);
            const elapsed = ((Date.now() - startTrack) / 1000).toFixed(1);

            if (result === 'success') {
                added.push(video);
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`✅ เพลง ${i + 1}/${totalVideos} สำเร็จ!`)
                        .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}\n\n⏱️ ใช้เวลา: **${elapsed} วินาที**`)
                        .setColor(0x57F287)
                        .setThumbnail(video.thumbnail)
                    ]
                });
            } else if (result === 'banned') {
                banned.push(video);
            } else {
                failed.push(video);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const addedList = added.map(s => `- **${s.title}** (🎤 ${s.artist})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ดึงเพลงของศิลปินสำเร็จ!')
                .setDescription(`🎤 ศิลปิน: **${artistName}**\n\n**รายชื่อเพลงที่เพิ่ม:**\n${addedList}`)
                .addFields(
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                    { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                )
                .setColor(0x57F287)
                .setThumbnail('https://i.imgur.com/4rqM0lD.png')
            ]
        });
    } catch (error) {
        console.error('Error syncing artist:', error);
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`).setColor(0xe74c3c)] });
    }
}

// รีเฟรชข้อความสวยงาม
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;

    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(songList.length === 0 ? 'ยังไม่มีเพลงในคลัง' : songList.map(s => `**${s.title}**\n🎤 ${s.artist} · \`${s.id}\``).join('\n\n'))
        .setColor(0x000000)
        .setFooter({ text: `รวม ${songList.length} เพลง · ศิลปิน ${uniqueArtists} คน` });

    const existingMessages = await channel.messages.fetch({ limit: 5 }).catch(() => []);
    for (const msg of existingMessages.values()) {
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
            await msg.edit({ embeds: [embed] }).catch(() => {});
            return;
        }
    }
    await channel.send({ embeds: [embed] });
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (!YOUTUBE_API_KEY) console.log('⚠️ YOUTUBE_API_KEY not set! Bot will not work.');

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง'),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก YouTube').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)),
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

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);

    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        process.env.SONG_CHANNEL_ID = interaction.channelId;
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!')] });
        await refreshMessage();
    }

    if (commandName === 'หาเพลง') {
        const query = options.getString('ชื่อเพลง');
        await interaction.deferReply();
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`⏳ **กำลังค้นหาเพลง:** ${query}...`)] });
        try {
            const result = await addSongFromYouTube(query);
            if (result === 'success') {
                const addedSong = songs[Object.keys(songs).pop()];
                await interaction.editReply({
                    embeds: [replyEmbed
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .setThumbnail(addedSong.thumbnail)
                        .addFields(
                            { name: '🎵 ชื่อเพลง', value: addedSong.title, inline: true },
                            { name: '🎤 ศิลปิน', value: addedSong.artist, inline: true }
                        )
                    ]
                });
            } else if (result === 'banned') {
                await interaction.editReply({ embeds: [replyEmbed.setDescription('⛔ **เพลงนี้มีเนื้อหาต้องห้าม** ไม่สามารถเพิ่มได้!')] });
            } else {
                await interaction.editReply({ embeds: [replyEmbed.setDescription('❌ **หาเพลงไม่สำเร็จ!**')] });
            }
        } catch (error) {
            console.error('Error searching:', error);
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`)] });
        }
    }

    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.deferReply();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🔍 กำลังค้นหาช่องของ: ${artist}`).setColor(0x000000)] });
        await syncArtistSongs(artist, interaction);
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('⏳ **กำลังดึงเพลงยอดนิยม...**').setColor(0xf1c40f)] });
        const startTime = Date.now();
        try {
            const items = await searchYouTube('เพลงไทย');
            const added = [];
            const banned = [];

            for (let i = 0; i < items.length; i++) {
                const video = parseVideoFromSearch(items[i]);
                if (!video) continue;

                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`✅ เพลง ${i + 1}/${items.length} สำเร็จ!`)
                        .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}`)
                        .setColor(0x57F287)
                        .setThumbnail(video.thumbnail)
                    ]
                });

                const result = await addSongFromYouTube(video.id);
                if (result === 'success') added.push(video);
                if (result === 'banned') banned.push(video);

                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const addedList = added.map(s => `- **${s.title}** (🎤 ${s.artist})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ ดึงเพลงยอดนิยมสำเร็จ!')
                    .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${addedList}`)
                    .addFields(
                        { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                        { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                        { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                    )
                    .setColor(0x57F287)
                ]
            });
        } catch (error) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`).setColor(0xe74c3c)] });
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
                const items = await searchYouTube('เพลงไทย');
                if (items && items.length > 0) {
                    await addSongFromYouTube(items[0].id.videoId);
                }
            } catch (error) {
                console.error('Auto add error:', error);
            }
        }, 60000);
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
            )
            .setThumbnail(randomSong.thumbnail);
        await interaction.reply({ embeds: [replyEmbed] });
    }
});

client.login(token);
