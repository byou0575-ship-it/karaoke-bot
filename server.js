const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const youtubedl = require('yt-dlp-exec');
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

// หา Cookies
function getCookiesPath() {
    const possiblePaths = [
        path.join(__dirname, 'cookies.txt'),
        path.join(__dirname, 'cookies.txt.txt')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const cookiesPath = getCookiesPath();
const hasCookies = cookiesPath !== null;

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

// ฟังก์ชันหลัก
async function getYtDlpOutput(url, args = {}) {
    try {
        if (hasCookies) args.cookies = cookiesPath;
        args.format = 'bestaudio[ext=m4a]/bestaudio/best';
        args.noWarnings = true;
        const output = await youtubedl(url, args);
        if (Array.isArray(output)) return output[0];
        return output;
    } catch (error) {
        console.error('Error with youtubedl:', error.stderr || error.message);
        return null;
    }
}

async function getTrackInfo(url) {
    return await getYtDlpOutput(url, { dumpJson: true, noPlaylist: true, skipDownload: true });
}

async function searchTrackUrl(query) {
    try {
        const output = await getYtDlpOutput(`ytsearch1:${query}`, { dumpJson: true, skipDownload: true });
        if (output && output.url) return output.url;
        return null;
    } catch (error) {
        console.error('Error searching:', error);
        return null;
    }
}

async function findArtistChannel(artistName) {
    try {
        const output = await getYtDlpOutput(`ytsearch1:${artistName}`, { dumpJson: true, skipDownload: true });
        if (output && output.channel_url) return output;
        return null;
    } catch (error) {
        console.error('Error finding artist:', error);
        return null;
    }
}

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
            duration: info.duration || 0,
            thumbnail: info.thumbnail || null
        };
        await refreshMessage();
        return 'success';
    }
    return 'failed';
}

// รีเฟรชข้อความสวยงาม (Black Premium)
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;

    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(songList.length === 0 ? 'ยังไม่มีเพลงในคลัง' : songList.map(s => `**${s.title}**\n🎤 ${s.artist} · ⏱ ${fmtDuration(s.duration)} · \`${s.id}\``).join('\n\n'))
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
    if (hasCookies) console.log(`Cookies found at: ${cookiesPath}`);

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
            const url = await searchTrackUrl(query);
            if (url) {
                const addResult = await addSong(url);
                if (addResult === 'success') {
                    const addedSong = songs[Object.keys(songs).pop()];
                    replyEmbed
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .setThumbnail(addedSong.thumbnail)
                        .addFields(
                            { name: '🎵 ชื่อเพลง', value: addedSong.title, inline: true },
                            { name: '🎤 ศิลปิน', value: addedSong.artist, inline: true },
                            { name: '⏱️ ความยาว', value: fmtDuration(addedSong.duration), inline: true }
                        );
                    await interaction.editReply({ embeds: [replyEmbed] });
                } else if (addResult === 'banned') {
                    await interaction.editReply({ embeds: [replyEmbed.setDescription('⛔ **เพลงนี้มีเนื้อหาต้องห้าม** ไม่สามารถเพิ่มได้!')] });
                } else {
                    await interaction.editReply({ embeds: [replyEmbed.setDescription('❌ **หาเพลงไม่สำเร็จ!**')] });
                }
            } else {
                await interaction.editReply({ embeds: [replyEmbed.setDescription('❌ **ไม่พบเพลงนี้!**')] });
            }
        } catch (error) {
            console.error('Error searching:', error);
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`)] });
        }
    }

    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.deferReply();
        
        // 1. เริ่มค้นหา
        await interaction.editReply({
            embeds: [replyEmbed
                .setTitle(`🔍 กำลังค้นหาช่องของ: ${artist}`)
                .setColor(0x000000)
            ]
        });
        const startTime = Date.now();
        try {
            const foundChannel = await findArtistChannel(artist);
            if (!foundChannel || !foundChannel.channel_url) {
                await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **ไม่พบช่องของ ${artist}!**`)] });
                return;
            }

            const channelUrl = foundChannel.channel_url;
            const added = [];
            const banned = [];
            const addedSongsInfo = [];

            const playlistOutput = await getYtDlpOutput(`${channelUrl}/videos`, { dumpJson: true, skipDownload: true, flatPlaylist: true });
            let videos = [];
            if (Array.isArray(playlistOutput)) videos = playlistOutput;
            else if (playlistOutput && playlistOutput.entries) videos = playlistOutput.entries;
            else if (playlistOutput) videos = [playlistOutput];

            const totalVideos = videos.length;
            const failed = [];

            // 2. เริ่มโหลดทีละเพลง (พร้อม Live Timer + Countdown)
            for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                if (video && video.url) {
                    // Step A: บอกว่าจะเริ่มดึงใน 5 วินาที (Countdown)
                    await interaction.editReply({
                        embeds: [replyEmbed
                            .setTitle(`⏳ กำลังจะเริ่มดึงเพลงที่ ${i + 1}/${totalVideos}`)
                            .setDescription(`🎵 **${video.title || 'ไม่ทราบชื่อ'}**\n\n⏰ กำลังนับถอยหลัง: **5, 4, 3, 2, 1...**`)
                            .setColor(0x9b59b6)
                            .setThumbnail(video.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                        ]
                    });
                    await new Promise(resolve => setTimeout(resolve, 5000)); // รอ 5 วินาที

                    // Step B: เริ่มดึงจริง (บอกเวลาแบบเรียลไทม์)
                    await interaction.editReply({
                        embeds: [replyEmbed
                            .setTitle(`🚀 กำลังดึงเพลงที่ ${i + 1}/${totalVideos}`)
                            .setDescription(`🎵 **${video.title || 'ไม่ทราบชื่อ'}**\n\n⏱️ ใช้เวลาไปแล้ว: **0 วินาที**\n🎯 คาดว่าเหลืออีก: **10 วินาที**`)
                            .setColor(0xf1c40f)
                            .setThumbnail(video.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                        ]
                    });

                    const startPerTrack = Date.now();
                    const result = await addSong(video.url);
                    const elapsedPerTrack = ((Date.now() - startPerTrack) / 1000).toFixed(1);

                    // Step C: เสร็จทันที (บอกเวลาทันที ไม่รอจบ)
                    if (result === 'success') {
                        added.push(video.url);
                        const songInfo = songs[video.id];
                        if (songInfo) addedSongsInfo.push(songInfo);
                        console.log(`✅ ดึงเพลง: ${songInfo.title} ใช้เวลา ${elapsedPerTrack} วิ`);
                        await interaction.editReply({
                            embeds: [replyEmbed
                                .setTitle(`✅ ดึงเพลง ${i + 1}/${totalVideos} สำเร็จ!`)
                                .setDescription(`🎵 **${songInfo.title}**\n🎤 ${songInfo.artist}\n\n⏱️ ใช้เวลา: **${elapsedPerTrack} วินาที**`)
                                .setColor(0x57F287)
                                .setThumbnail(songInfo.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                            ]
                        });
                    } else if (result === 'banned') {
                        banned.push(video.url);
                        console.log(`⛔ ถูกคัดกรอง: ${video.title}`);
                        await interaction.editReply({
                            embeds: [replyEmbed
                                .setTitle(`⛔ ถูกคัดกรอง (เพลง ${i + 1}/${totalVideos})`)
                                .setDescription(`🎵 **${video.title || 'ไม่ทราบชื่อ'}**\n\nเนื้อหาต้องห้าม ไม่สามารถเพิ่มได้`)
                                .setColor(0xe74c3c)
                            ]
                        });
                    } else {
                        failed.push(video.url);
                        console.log(`❌ ดึงไม่สำเร็จ: ${video.title}`);
                        await interaction.editReply({
                            embeds: [replyEmbed
                                .setTitle(`❌ ดึงไม่สำเร็จ (เพลง ${i + 1}/${totalVideos})`)
                                .setDescription(`🎵 **${video.title || 'ไม่ทราบชื่อ'}**`)
                                .setColor(0xe74c3c)
                            ]
                        });
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            // 3. สรุปผลตอนจบ
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const songListText = addedSongsInfo.map(s => `- **${s.title}** (🎤 ${s.artist})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';
            const failText = failed.length > 0 ? `\n❌ ดึงไม่สำเร็จ: ${failed.length} เพลง` : '';

            replyEmbed
                .setTitle('✅ ดึงเพลงของศิลปินสำเร็จ!')
                .setDescription(`🎤 ศิลปิน: **${artist}**\n\n**รายชื่อเพลงที่เพิ่ม:**\n${songListText}${failText}`)
                .addFields(
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                    { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                )
                .setColor(0x57F287)
                .setThumbnail(foundChannel.thumbnail || 'https://i.imgur.com/4rqM0lD.png');
            await interaction.editReply({ embeds: [replyEmbed] });
        } catch (error) {
            console.error('Error syncing artist:', error);
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`)] });
        }
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        await interaction.editReply({ embeds: [replyEmbed.setDescription('⏳ **กำลังดึงเพลงยอดนิยม 10 อันดับ...**')] });
        const startTime = Date.now();
        try {
            const output = await getYtDlpOutput('ytsearch10:เพลงฮิต', { dumpJson: true, skipDownload: true });
            let tracks = [];
            if (Array.isArray(output)) tracks = output;
            else if (output && output.entries) tracks = output.entries;
            else if (output) tracks = [output];

            const added = [];
            const banned = [];
            const addedSongsInfo = [];

            for (let i = 0; i < tracks.length; i++) {
                const item = tracks[i];
                if (item && item.url) {
                    await interaction.editReply({
                        embeds: [replyEmbed
                            .setTitle(`⏳ กำลังจะเริ่มดึงเพลงที่ ${i + 1}/${tracks.length}`)
                            .setDescription(`🎵 **${item.title || 'ไม่ทราบชื่อ'}**\n\n⏰ กำลังนับถอยหลัง: **5, 4, 3, 2, 1...**`)
                            .setColor(0x9b59b6)
                            .setThumbnail(item.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                        ]
                    });
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    await interaction.editReply({
                        embeds: [replyEmbed
                            .setTitle(`🚀 กำลังดึงเพลงที่ ${i + 1}/${tracks.length}`)
                            .setDescription(`🎵 **${item.title || 'ไม่ทราบชื่อ'}**\n\n⏱️ ใช้เวลาไปแล้ว: **0 วินาที**\n🎯 คาดว่าเหลืออีก: **10 วินาที**`)
                            .setColor(0xf1c40f)
                            .setThumbnail(item.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                        ]
                    });

                    const startPerTrack = Date.now();
                    const result = await addSong(item.url);
                    const elapsedPerTrack = ((Date.now() - startPerTrack) / 1000).toFixed(1);

                    if (result === 'success') {
                        added.push(item.url);
                        const songInfo = songs[item.id];
                        if (songInfo) addedSongsInfo.push(songInfo);
                        console.log(`✅ ดึงเพลง: ${songInfo.title} ใช้เวลา ${elapsedPerTrack} วิ`);
                        await interaction.editReply({
                            embeds: [replyEmbed
                                .setTitle(`✅ ดึงเพลง ${i + 1}/${tracks.length} สำเร็จ!`)
                                .setDescription(`🎵 **${songInfo.title}**\n🎤 ${songInfo.artist}\n\n⏱️ ใช้เวลา: **${elapsedPerTrack} วินาที**`)
                                .setColor(0x57F287)
                                .setThumbnail(songInfo.thumbnail || 'https://i.imgur.com/4rqM0lD.png')
                            ]
                        });
                    } else if (result === 'banned') {
                        banned.push(item.url);
                        await interaction.editReply({
                            embeds: [replyEmbed
                                .setTitle(`⛔ ถูกคัดกรอง (เพลง ${i + 1}/${tracks.length})`)
                                .setDescription(`🎵 **${item.title || 'ไม่ทราบชื่อ'}**\n\nเนื้อหาต้องห้าม ไม่สามารถเพิ่มได้`)
                                .setColor(0xe74c3c)
                            ]
                        });
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const songListText = addedSongsInfo.map(s => `- **${s.title}** (🎤 ${s.artist})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';

            replyEmbed
                .setTitle('✅ ดึงเพลงยอดนิยมสำเร็จ!')
                .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${songListText}`)
                .addFields(
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                    { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                )
                .setColor(0x57F287)
                .setThumbnail('https://i.imgur.com/4rqM0lD.png');
            await interaction.editReply({ embeds: [replyEmbed] });
        } catch (error) {
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`)] });
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
