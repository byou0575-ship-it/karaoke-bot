const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
let refreshTask = null;
let songChannelId = null;

// คำที่ใช้ตรวจสอบว่าเป็นเพลงรวม (Playlist/Compilation)
const COMPILATION_KEYWORDS = [
    "รวมเพลง", "playlist", "อัลบั้ม", "album", "mixtape",
    "compilation", "รวมฮิต", "best of", "greatest hits",
    "non-stop", "nonstop", "mix", "dj", "medley"
];

// ตรวจสอบว่าเป็นเพลงรวมหรือไม่
function isCompilation(title) {
    const lowerTitle = title.toLowerCase();
    for (const keyword of COMPILATION_KEYWORDS) {
        if (lowerTitle.includes(keyword)) return true;
    }
    return false;
}

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

// ★★★ ฟังก์ชันค้นหาผ่าน YouTube Data API (พร้อมดึงเวลาจริง) ★★★
async function searchYouTube(query) {
    try {
        // 1. ค้นหาวิดีโอ
        const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults: 10,
                key: YOUTUBE_API_KEY
            },
            timeout: 15000
        });
        
        const items = searchResponse.data.items || [];
        if (items.length === 0) return [];

        // 2. ดึงรายละเอียดเวลา (duration) จาก videoIds
        const videoIds = items.map(item => item.id.videoId).join(',');
        const detailResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'contentDetails',
                id: videoIds,
                key: YOUTUBE_API_KEY
            },
            timeout: 15000
        });

        const durations = {};
        if (detailResponse.data.items) {
            detailResponse.data.items.forEach(item => {
                durations[item.id] = parseISODuration(item.contentDetails.duration);
            });
        }

        // 3. รวมข้อมูล
        return items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            thumbnail: item.snippet.thumbnails.high.url,
            duration: durations[item.id.videoId] || 0
        }));
    } catch (error) {
        console.error('Error searching YouTube API:', error.message);
        return [];
    }
}

// แปลงเวลา ISO 8601 เป็นวินาที
function parseISODuration(iso) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = iso.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

// ★★★ ฟังก์ชันเพิ่มเพลง (พร้อมตรวจสอบเพลงรวม) ★★★
async function addSongFromYouTube(query) {
    try {
        const items = await searchYouTube(query);
        if (!items || items.length === 0) return 'failed';

        // เลือกเพลงแรกที่ไม่ใช่เพลงรวม และไม่โดนแบน
        for (const video of items) {
            if (isBanned(video.title, video.artist)) continue;
            if (isCompilation(video.title)) {
                console.log(`⏭️ ข้ามเพลงรวม: ${video.title}`);
                continue;
            }
            // ตรวจสอบว่าเพลงยาวเกิน 15 นาทีหรือไม่ (อาจเป็น podcast หรือรวมเพลง)
            if (video.duration > 900) {
                console.log(`⏭️ ข้ามเพลงยาวเกิน 15 นาที: ${video.title}`);
                continue;
            }
            
            songs[video.id] = { ...video, robloxAssetId: null };
            await refreshMessage();
            return 'success';
        }
        return 'failed';
    } catch (error) {
        console.error('Error in addSongFromYouTube:', error.message);
        return 'failed';
    }
}

// ★★★ ฟังก์ชันค้นหาศิลปินทั้งหมด ★★★
async function syncArtistSongs(artistName, interaction) {
    const startTime = Date.now();
    try {
        const videoItems = await searchYouTube(artistName);
        const totalVideos = videoItems.length;
        const added = [];
        const banned = [];
        const compilations = [];
        const failed = [];

        if (totalVideos === 0) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **ไม่พบเพลงของ ${artistName}!**`).setColor(0xe74c3c)] });
            return;
        }

        for (let i = 0; i < videoItems.length; i++) {
            const video = videoItems[i];

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⏳ กำลังโหลดเพลงที่ ${i + 1}/${totalVideos}`)
                    .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}`)
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
                        .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}\n⏱️ ใช้เวลา: **${elapsed} วินาที**`)
                        .setColor(0x57F287)
                        .setThumbnail(video.thumbnail)
                    ]
                });
            } else if (result === 'banned') {
                banned.push(video);
            } else if (isCompilation(video.title)) {
                compilations.push(video);
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
                    { name: '⏭️ ข้ามเพลงรวม', value: `${compilations.length} เพลง`, inline: true },
                    { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                )
                .setColor(0x57F287)
            ]
        });
    } catch (error) {
        console.error('Error syncing artist:', error);
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`).setColor(0xe74c3c)] });
    }
}

// ★★★ ฟังก์ชันรีเฟรชข้อความสวยงาม (แยกเป็นกรอบรายเพลง) ★★★
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    if (songList.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎤 รายการเพลง Karaoke')
            .setDescription('ยังไม่มีเพลงในคลัง')
            .setColor(0x000000);
        
        const existingMessages = await channel.messages.fetch({ limit: 5 }).catch(() => []);
        for (const msg of existingMessages.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                await msg.edit({ embeds: [embed] }).catch(() => {});
                return;
            }
        }
        await channel.send({ embeds: [embed] });
        return;
    }

    // แบ่งเป็นหน้า หน้าละ 10 เพลง
    const songsPerPage = 10;
    const pages = Math.ceil(songList.length / songsPerPage);

    for (let page = 0; page < pages; page++) {
        const chunk = songList.slice(page * songsPerPage, (page + 1) * songsPerPage);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎤 รายการเพลง Karaoke${pages > 1 ? ` (${page + 1}/${pages})` : ''}`)
            .setColor(0x000000)
            .setFooter({ text: `รวม ${songList.length} เพลง · อัปเดตล่าสุด` });

        let description = '';
        chunk.forEach((s, index) => {
            const robloxStatus = s.robloxAssetId ? `🟢 Roblox: ${s.robloxAssetId}` : '🔴 ยังไม่อัปโหลด';
            description += `**${page * songsPerPage + index + 1}. ${s.title}**\n`;
            description += `　🎤 ${s.artist}\n`;
            description += `　⏱️ ${fmtDuration(s.duration)}\n`;
            description += `　🆔 \`${s.id}\` · ${robloxStatus}\n\n`;
        });

        embed.setDescription(description);

        const existingMessages = await channel.messages.fetch({ limit: 10 }).catch(() => []);
        let edited = false;
        for (const msg of existingMessages.values()) {
            if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                await msg.edit({ embeds: [embed] }).catch(() => {});
                edited = true;
                break;
            }
        }
        if (!edited) {
            await channel.send({ embeds: [embed] });
        }
    }
}

// ★★★ ระบบ Real-time Update อัตโนมัติ ★★★
function startAutoRefresh() {
    if (refreshTask) clearInterval(refreshTask);
    refreshTask = setInterval(async () => {
        if (songChannelId) {
            await refreshMessage();
        }
    }, 30000); // อัปเดตทุก 30 วินาที
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (!YOUTUBE_API_KEY) console.log('⚠️ YOUTUBE_API_KEY not set!');
    startAutoRefresh(); // เริ่มระบบ Real-time Update

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก YouTube').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงทั้งหมดของศิลปินที่ระบุ').addStringOption(option => option.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงยอดนิยม 10 อันดับแรก').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่มระบบหาเพลงอัตโนมัติ').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุดระบบหาเพลงอัตโนมัติ').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลงออกจากระบบ').addStringOption(option => option.setName('id').setDescription('ID ของเพลงที่ต้องการลบ').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('ดูคลังเพลง').setDescription('ดูรายการเพลงทั้งหมดที่มีในระบบ').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('สุ่มเพลงหนึ่งเพลงจากคลัง').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
                            { name: '🎤 ศิลปิน', value: addedSong.artist, inline: true },
                            { name: '⏱️ ความยาว', value: fmtDuration(addedSong.duration), inline: true }
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
                const video = items[i];

                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`✅ เพลง ${i + 1}/${items.length} สำเร็จ!`)
                        .setDescription(`🎵 **${video.title}**\n🎤 ${video.artist}\n⏱️ ${fmtDuration(video.duration)}`)
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
                    await addSongFromYouTube(items[0].id);
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
                { name: '🎤 ศิลปินทั้งหมด', value: `${uniqueArtists} คน`, inline: true }
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
                { name: '⏱️ ความยาว', value: fmtDuration(randomSong.duration), inline: true }
            )
            .setThumbnail(randomSong.thumbnail);
        await interaction.reply({ embeds: [replyEmbed] });
    }
});

client.login(token);
