import os
import json
import re
import math
import logging
import asyncio
import hashlib
import subprocess
import tempfile
import discord
from discord import app_commands
from discord.ext import commands
from flask import Flask, jsonify
from threading import Thread
import requests

# ==================== ตั้งค่า ====================
TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
ROBLOX_API_KEY = os.environ.get("ROBLOX_API_KEY", "scQlvkZsw02uUu1eaVgJ0Cau/pVhVLJjy6Iqt4EyuFlfGSklZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SW5OalVXeDJhMXB6ZHpBeWRWVjFNV1ZoVm1kS01FTmhkUzl3Vm1oV1RFcHFlVFpKY1hRMFJYbDFSbXhtUjFOcmJDSXNJbTkzYm1WeVNXUWlPaUl4TURNMU1UWTRORGt6SWl3aVpYaHdJam94TnpnME16Z3dOamczTENKcFlYUWlPakUzT0RRek56Y3dPRGNzSW01aVppSTZNVGM0TkRNM056QTROMzAuakMtV2g3X1gxM0t1ejhSeVVISHlPakswaWZPRTNva0hHa3g1clIzQjNaN0I5czdnSmZxYUJaVzlMSHJFa2NfSzRtYVJ0azR6QlhaQXkyMkJmbEZtMEpyNWRWR0dPSm9lRk1kdXFZcGYtWWpYMWZveTkzLWc5bkJYZ0l1X25mVTdMOXhOclpFbkZQYTJVcFB5MmZTWHdheVAzVWMwNVNubVQxeUFsdnZaTGRlX0hWMUdwc0QtbXFUaDVtTnFJbmtpcy1SY3lzWmNVM2taaW4tSGJfdmcwMGRuUmYtRWpWS2lha1A1bG5xeTRsUjFEb210Y1ZudXdlUzdfbE5IcXZ4UEVCejNBVmxGcG5ZQWk4RmppNXktdkVMWk9CN1NnUXhnbmV2dFdVUVBKYnE4SFhCZlluNWlkZjBKUDR1dUQ1TkZFYTFkeUcwLURMZEJwVDhkcTNwX2hB")
ROBLOX_USER_ID = os.environ.get("ROBLOX_USER_ID", "1035168493")

SONGS_FILE = "songs.json"
QUEUE_FILE = "queue.json"
CONFIG_FILE = "config.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("karaoke-bot")

# ==================== Flask Server (สำหรับ Roblox) ====================
app = Flask(__name__)

_current_song = None
_is_playing = False

@app.route('/')
def home():
    return "🎤 Karaoke Bot is running!"

@app.route('/api/songs')
def get_songs():
    songs = load_songs()
    approved = {k: v for k, v in songs.items() if v.get("Approved")}
    return jsonify(approved)

@app.route('/api/songs/<song_id>')
def get_song(song_id):
    songs = load_songs()
    return jsonify(songs.get(song_id, {}))

@app.route('/api/queue')
def get_queue():
    return jsonify(load_queue())

@app.route('/api/current')
def get_current():
    if _current_song:
        return jsonify(_current_song)
    return jsonify({"message": "No song playing", "playing": False})

@app.route('/api/lyrics/<song_id>/<int:time_pos>')
def get_lyric_at_time(song_id, time_pos):
    songs = load_songs()
    song = songs.get(song_id)
    if not song or not song.get("Lyrics"):
        return jsonify({"Current": "", "Previous": "", "Next": "", "Progress": 0})

    lyrics = song["Lyrics"]
    current, previous, next_text = "", "", ""
    progress = 0

    for i, line in enumerate(lyrics):
        if line["time"] <= time_pos:
            previous = current
            current = line.get("text", "")
            next_time = lyrics[i + 1]["time"] if i + 1 < len(lyrics) else (song.get("Duration", 999))
            progress = min(1.0, max(0.0, (time_pos - line["time"]) / max(next_time - line["time"], 1)))

    for line in lyrics:
        if line["time"] > time_pos:
            next_text = line.get("text", "")
            break

    return jsonify({
        "Current": current,
        "Previous": previous,
        "Next": next_text,
        "Progress": progress
    })

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=False)

# ==================== ฟังก์ชันช่วยเหลือ ====================
def load_songs():
    if not os.path.exists(SONGS_FILE):
        return {}
    with open(SONGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_songs(songs):
    with open(SONGS_FILE, "w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)

def load_queue():
    if not os.path.exists(QUEUE_FILE):
        return []
    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_queue(queue):
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def generate_uid():
    """สร้าง UID แบบ KAR-001, KAR-002"""
    songs = load_songs()
    max_num = 0
    for song in songs.values():
        uid = song.get("UID", "")
        if uid.startswith("KAR-"):
            try:
                num = int(uid.split("-")[1])
                max_num = max(max_num, num)
            except:
                pass
    return f"KAR-{max_num + 1:03d}"

def fmt_duration(secs):
    m, s = divmod(int(secs), 60)
    return f"{m}:{s:02d}"

# ==================== เช็คชื่อเพลงซ้ำ ====================
def is_duplicate_song(name, artist):
    """เช็คว่ามีเพลงชื่อนี้ ศิลปินนี้อยู่แล้วหรือไม่"""
    songs = load_songs()
    name_lower = name.lower().strip()
    artist_lower = artist.lower().strip()
    
    for song in songs.values():
        existing_name = song.get("SongName", "").lower().strip()
        existing_artist = song.get("Artist", "").lower().strip()
        
        if existing_name == name_lower and existing_artist == artist_lower:
            return song.get("UID"), song.get("SongName"), song.get("Artist")
    
    return None, None, None

# ==================== YouTube → MP3 ====================
def download_audio(url, output_path):
    """ดาวน์โหลดเสียงจาก YouTube หรือ URL เป็น MP3"""
    try:
        is_youtube = any(x in url for x in ["youtube.com", "youtu.be", "youtube.com/shorts"])
        
        if is_youtube:
            cmd = [
                "yt-dlp",
                "-x", "--audio-format", "mp3",
                "--audio-quality", "0",
                "-o", output_path,
                url
            ]
        else:
            cmd = ["curl", "-L", "-o", output_path, url]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode != 0:
            logger.error(f"Download failed: {result.stderr}")
            return False
        
        if not is_youtube:
            if not os.path.exists(output_path) or os.path.getsize(output_path) < 1024:
                return False
            
            if not output_path.endswith(".mp3"):
                new_path = output_path + ".mp3"
                subprocess.run([
                    "ffmpeg", "-i", output_path,
                    "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
                    "-y", new_path
                ], capture_output=True, timeout=60)
                if os.path.exists(new_path):
                    os.replace(new_path, output_path)
        
        return os.path.exists(output_path) and os.path.getsize(output_path) > 1024
        
    except Exception as e:
        logger.error(f"Download error: {e}")
        return False

def get_youtube_info(url):
    """ดึงข้อมูลจาก YouTube"""
    try:
        cmd = ["yt-dlp", "--dump-json", "--no-download", url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            import json
            info = json.loads(result.stdout)
            return {
                "title": info.get("title", "Unknown"),
                "artist": info.get("artist") or info.get("channel") or "Unknown Artist",
                "duration": info.get("duration", 180),
                "thumbnail": info.get("thumbnail", "")
            }
    except Exception as e:
        logger.error(f"Get info error: {e}")
    return None

# ==================== Roblox Upload ====================
def upload_to_roblox(audio_path, name, description=""):
    """อัปโหลดเสียงขึ้น Roblox ผ่าน Open Cloud API"""
    try:
        with open(audio_path, "rb") as f:
            audio_data = f.read()
        
        create_url = "https://apis.roblox.com/assets/v1/assets"
        headers = {
            "x-api-key": ROBLOX_API_KEY,
            "Content-Type": "application/json"
        }
        
        payload = {
            "assetType": "Audio",
            "displayName": name,
            "description": description or name,
            "creationContext": {
                "creator": {
                    "userId": ROBLOX_USER_ID
                }
            }
        }
        
        response = requests.post(create_url, headers=headers, json=payload)
        if response.status_code != 200:
            logger.error(f"Create asset failed: {response.text}")
            return None
        
        asset_data = response.json()
        asset_id = asset_data.get("assetId")
        upload_url = asset_data.get("uploadUrl")
        
        if not asset_id or not upload_url:
            return None
        
        upload_headers = {
            "x-api-key": ROBLOX_API_KEY,
            "Content-Type": "audio/mpeg"
        }
        
        upload_response = requests.post(upload_url, headers=upload_headers, data=audio_data)
        if upload_response.status_code not in [200, 201]:
            logger.error(f"Upload audio failed: {upload_response.text}")
            return None
        
        logger.info(f"Uploaded audio to Roblox: Asset ID {asset_id}")
        return asset_id
        
    except Exception as e:
        logger.error(f"Roblox upload error: {e}")
        return None

# ==================== Embed อัปเดตอัตโนมัติ ====================
async def update_songs_embed(guild):
    """อัปเดต Embed รายการเพลงในช่องที่ setup ไว้"""
    config = load_config()
    channel_id = config.get("songs_channel_id")
    
    if not channel_id:
        return
    
    channel = guild.get_channel(int(channel_id))
    if not channel:
        return
    
    songs = load_songs()
    
    embed = discord.Embed(
        title="🎵 รายการเพลงทั้งหมด",
        description=f"มีเพลงทั้งหมด {len(songs)} เพลง",
        color=0x9b59b6
    )
    
    for uid, song in list(songs.items())[-20:]:
        status = "✅" if song.get("Approved") else "⏳"
        name = song.get("SongName", "ไม่ระบุ")
        artist = song.get("Artist", "ไม่ระบุ")
        roblox_id = song.get("RobloxAssetId", "ไม่มี")
        
        embed.add_field(
            name=f"{status} {uid} - {name}",
            value=f"🎤 {artist} | 🆔 `{roblox_id}`",
            inline=False
        )
    
    embed.set_footer(text="อัปเดตอัตโนมัติ")
    
    try:
        async for message in channel.history(limit=10):
            if message.author == bot.user:
                await message.delete()
        
        await channel.send(embed=embed)
    except Exception as e:
        logger.error(f"Update embed error: {e}")

# ==================== Voice & Queue ====================
async def play_next_in_queue(guild):
    global _current_song, _is_playing
    queue = load_queue()
    if not queue:
        _current_song = None
        _is_playing = False
        return

    next_item = queue.pop(0)
    save_queue(queue)

    song_id = next_item.get("song_id")
    songs = load_songs()
    song = songs.get(song_id)
    if not song:
        return await play_next_in_queue(guild)

    _current_song = {
        "SongId": song_id,
        "SongName": song["SongName"],
        "Artist": song.get("Artist", "ไม่ระบุ"),
        "Duration": song.get("Duration", 180),
        "Lyrics": song.get("Lyrics", []),
        "RequestedBy": next_item.get("requested_by", "?"),
        "StartedAt": discord.utils.utcnow().isoformat(),
        "playing": True
    }

    voice_client = guild.voice_client
    audio_url = next_item.get("audio_url") or song.get("AudioUrl")

    if voice_client and audio_url:
        try:
            import subprocess
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)

            source = discord.FFmpegPCMAudio(audio_url)
            voice_client.play(source, after=lambda e: asyncio.run_coroutine_threadsafe(play_next_in_queue(guild), bot.loop))
            _is_playing = True
            logger.info(f"Playing audio: {song['SongName']}")
        except Exception as e:
            logger.warning(f"Cannot play audio: {e}")
            _is_playing = True
            await asyncio.sleep(song.get("Duration", 180))
            await play_next_in_queue(guild)
    else:
        _is_playing = True
        await asyncio.sleep(song.get("Duration", 180))
        await play_next_in_queue(guild)

# ==================== Discord Bot ====================
intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

# ====== SYNC COMMANDS ทุก GUILD ======
@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user} (ID: {bot.user.id})")
    
    # Sync ทุก Guild ที่บอทอยู่
    total_synced = 0
    for guild in bot.guilds:
        try:
            guild_obj = discord.Object(id=guild.id)
            bot.tree.clear_commands(guild=guild_obj)
            synced = await bot.tree.sync(guild=guild_obj)
            total_synced += len(synced)
            logger.info(f"✅ Synced {len(synced)} commands to {guild.name} (ID: {guild.id})")
        except Exception as e:
            logger.error(f"❌ Guild {guild.name}: {e}")
    
    # Sync Global ด้วย
    try:
        bot.tree.clear_commands(guild=None)
        global_synced = await bot.tree.sync()
        logger.info(f"✅ Global synced: {len(global_synced)} commands")
    except Exception as e:
        logger.error(f"❌ Global sync: {e}")
    
    await bot.change_presence(
        activity=discord.Activity(type=discord.ActivityType.listening, name="คาราโอเกะ")
    )
    
    logger.info(f"🚀 Bot ready! Total synced: {total_synced} commands")

# ==================== คำสั่งหลัก ====================

@tree.command(name="setup", description="เลือกช่องแสดงรายการเพลงทั้งหมด")
@app_commands.describe(channel="ช่องที่จะให้แสดงรายการเพลง")
async def cmd_setup(interaction: discord.Interaction, channel: discord.TextChannel):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ ต้องเป็นแอดมิน!", ephemeral=True)
        return
    
    config = load_config()
    config["songs_channel_id"] = str(channel.id)
    save_config(config)
    
    await interaction.response.send_message(f"✅ ตั้งค่าช่อง {channel.mention} เป็นช่องแสดงเพลงแล้ว!")
    await update_songs_embed(interaction.guild)

@tree.command(name="add", description="เพิ่มเพลงจาก URL (อัปโหลด Roblox อัตโนมัติ)")
@app_commands.describe(
    url="URL เพลง (YouTube หรือไฟล์ตรง)",
    name="ชื่อเพลง (ถ้าไม่ใส่จะดึงอัตโนมัติ)",
    artist="ศิลปิน (ถ้าไม่ใส่จะดึงอัตโนมัติ)",
    cover_url="URL รูปปกเพลง (ถ้าไม่ใส่จะดึงจาก YouTube)"
)
async def cmd_add(interaction: discord.Interaction, url: str, name: str = None, artist: str = None, cover_url: str = None):
    await interaction.response.defer(thinking=True)
    
    # ดึงข้อมูลจาก YouTube
    yt_info = None
    if any(x in url for x in ["youtube.com", "youtu.be"]):
        yt_info = get_youtube_info(url)
    
    song_name = name or (yt_info["title"] if yt_info else "Unknown")
    song_artist = artist or (yt_info["artist"] if yt_info else "Unknown Artist")
    duration = yt_info["duration"] if yt_info else 180
    thumbnail = cover_url or (yt_info["thumbnail"] if yt_info else "")
    
    # ====== เช็คชื่อซ้ำ ======
    dup_uid, dup_name, dup_artist = is_duplicate_song(song_name, song_artist)
    if dup_uid:
        embed = discord.Embed(title="⚠️ พบเพลงซ้ำ!", color=0xe74c3c)
        embed.add_field(name="🎵 ชื่อ", value=dup_name, inline=False)
        embed.add_field(name="🎤 ศิลปิน", value=dup_artist, inline=True)
        embed.add_field(name="🆔 UID", value=f"`{dup_uid}`", inline=True)
        embed.set_footer(text="เพลงนี้มีอยู่แล้วในระบบ ไม่สามารถเพิ่มซ้ำได้")
        await interaction.edit_original_response(content=None, embed=embed)
        return
    
    # ดาวน์โหลดเสียง
    await interaction.edit_original_response(content="⏳ กำลังดาวน์โหลดเสียง...")
    
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    
    if not download_audio(url, tmp_path):
        await interaction.edit_original_response(content="❌ ดาวน์โหลดเสียงล้มเหลว!")
        return
    
    # อัปโหลดขึ้น Roblox
    await interaction.edit_original_response(content="⏳ กำลังอัปโหลดขึ้น Roblox...")
    
    roblox_id = upload_to_roblox(tmp_path, song_name, f"By {song_artist}")
    
    try:
        os.remove(tmp_path)
    except:
        pass
    
    if not roblox_id:
        await interaction.edit_original_response(content="❌ อัปโหลด Roblox ล้มเหลว! ตรวจสอบ ROBLOX_API_KEY และ User ID")
        return
    
    # สร้าง UID และบันทึก
    uid = generate_uid()
    
    songs = load_songs()
    songs[uid] = {
        "UID": uid,
        "SongName": song_name,
        "Artist": song_artist,
        "Duration": duration,
        "RobloxAssetId": roblox_id,
        "AudioUrl": f"https://create.roblox.com/store/asset/{roblox_id}",
        "CoverUrl": thumbnail,
        "Lyrics": [],
        "AddedBy": interaction.user.name,
        "Approved": True,
        "SourceUrl": url
    }
    save_songs(songs)
    
    # อัปเดต Embed
    await update_songs_embed(interaction.guild)
    
    # ส่งผลลัพธ์
    embed = discord.Embed(title="✅ เพิ่มเพลงสำเร็จ!", color=0x2ecc71)
    embed.add_field(name="🎵 ชื่อ", value=song_name, inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=song_artist, inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(duration), inline=True)
    embed.add_field(name="🆔 UID", value=f"`{uid}`", inline=True)
    embed.add_field(name="🔗 Roblox ID", value=f"`{roblox_id}`", inline=False)
    if thumbnail:
        embed.set_thumbnail(url=thumbnail)
    embed.set_footer(text=f"เพิ่มโดย {interaction.user.name}")
    
    await interaction.edit_original_response(content=None, embed=embed)

@tree.command(name="edit", description="แก้ไขข้อมูลเพลง")
@app_commands.describe(
    uid="UID เพลง (เช่น KAR-001)",
    name="ชื่อเพลงใหม่",
    artist="ศิลปินใหม่",
    cover_url="URL รูปปกใหม่"
)
async def cmd_edit(interaction: discord.Interaction, uid: str, name: str = None, artist: str = None, cover_url: str = None):
    songs = load_songs()
    
    if uid not in songs:
        await interaction.response.send_message(f"❌ ไม่พบเพลง `{uid}`", ephemeral=True)
        return
    
    if name:
        songs[uid]["SongName"] = name
    if artist:
        songs[uid]["Artist"] = artist
    if cover_url:
        songs[uid]["CoverUrl"] = cover_url
    
    save_songs(songs)
    await update_songs_embed(interaction.guild)
    
    await interaction.response.send_message(f"✅ แก้ไขเพลง `{uid}` สำเร็จ!")

@tree.command(name="remove", description="ลบเพลง")
@app_commands.describe(uid="UID เพลงที่จะลบ")
async def cmd_remove(interaction: discord.Interaction, uid: str):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ ต้องเป็นแอดมิน!", ephemeral=True)
        return
    
    songs = load_songs()
    if uid not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{uid}`", ephemeral=True)
        return
    
    name = songs[uid]["SongName"]
    del songs[uid]
    save_songs(songs)
    
    await update_songs_embed(interaction.guild)
    
    await interaction.response.send_message(f"🗑️ ลบ **{name}** (`{uid}`) สำเร็จ")

@tree.command(name="play", description="เพิ่มเพลงเข้าคิว")
@app_commands.describe(uid="UID เพลง")
async def cmd_play(interaction: discord.Interaction, uid: str):
    songs = load_songs()
    if uid not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{uid}`", ephemeral=True)
        return
    
    queue = load_queue()
    queue.append({
        "song_id": uid,
        "requested_by": interaction.user.name,
        "timestamp": discord.utils.utcnow().isoformat()
    })
    save_queue(queue)
    
    song = songs[uid]
    embed = discord.Embed(title="🎵 เพิ่มเข้าคิวแล้ว!", color=0x3498db)
    embed.add_field(name="ชื่อ", value=song["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=song.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="📋 คิวที่", value=str(len(queue)), inline=True)
    
    await interaction.response.send_message(embed=embed)
    
    global _is_playing
    if not _is_playing and interaction.guild:
        await play_next_in_queue(interaction.guild)

@tree.command(name="queue", description="ดูคิวเพลง")
async def cmd_queue(interaction: discord.Interaction):
    queue = load_queue()
    songs = load_songs()
    
    if not queue:
        await interaction.response.send_message("📭 คิวว่าง", ephemeral=True)
        return
    
    embed = discord.Embed(title="📋 คิวเพลง", color=0x9b59b6)
    for i, item in enumerate(queue[:10], 1):
        song = songs.get(item["song_id"], {})
        name = song.get("SongName", "ไม่พบ")
        req = item.get("requested_by", "?")
        embed.add_field(name=f"{i}. {name}", value=f"ขอโดย {req}", inline=False)
    
    await interaction.response.send_message(embed=embed)

@tree.command(name="skip", description="ข้ามเพลง")
async def cmd_skip(interaction: discord.Interaction):
    voice_client = interaction.guild.voice_client if interaction.guild else None
    if voice_client and voice_client.is_playing():
        voice_client.stop()
    
    global _is_playing
    _is_playing = False
    
    if interaction.guild:
        await play_next_in_queue(interaction.guild)
    
    await interaction.response.send_message("⏭️ ข้ามเพลงแล้ว!")

@tree.command(name="nowplaying", description="ดูเพลงที่กำลังเล่น")
async def cmd_nowplaying(interaction: discord.Interaction):
    global _current_song
    if not _current_song:
        await interaction.response.send_message("📭 ไม่มีเพลงเล่นอยู่", ephemeral=True)
        return
    
    embed = discord.Embed(title="🎵 กำลังเล่น", color=0xe74c3c)
    embed.add_field(name="ชื่อ", value=_current_song["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=_current_song.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(_current_song.get("Duration", 0)), inline=True)
    
    await interaction.response.send_message(embed=embed)

@tree.command(name="join", description="เข้า Voice Channel")
async def cmd_join(interaction: discord.Interaction):
    if not interaction.user.voice:
        await interaction.response.send_message("❌ ต้องอยู่ใน Voice ก่อน!", ephemeral=True)
        return
    
    channel = interaction.user.voice.channel
    if interaction.guild.voice_client:
        await interaction.guild.voice_client.move_to(channel)
    else:
        await channel.connect()
    
    await interaction.response.send_message(f"🔊 เข้าร่วม {channel.name} แล้ว!")

@tree.command(name="leave", description="ออกจาก Voice Channel")
async def cmd_leave(interaction: discord.Interaction):
    if interaction.guild.voice_client:
        await interaction.guild.voice_client.disconnect()
        await interaction.response.send_message("👋 ออกแล้ว")
    else:
        await interaction.response.send_message("❌ ไม่ได้อยู่ใน Voice", ephemeral=True)

@tree.command(name="info", description="ดูข้อมูลเพลง")
@app_commands.describe(uid="UID เพลง")
async def cmd_info(interaction: discord.Interaction, uid: str):
    songs = load_songs()
    if uid not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{uid}`", ephemeral=True)
        return
    
    s = songs[uid]
    embed = discord.Embed(title=s["SongName"], color=0x3498db)
    embed.add_field(name="🆔 UID", value=f"`{uid}`", inline=True)
    embed.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
    embed.add_field(name="🔗 Roblox ID", value=f"`{s.get('RobloxAssetId', 'ไม่มี')}`", inline=False)
    embed.add_field(name="✅ อนุมัติ", value="ใช่" if s.get("Approved") else "ไม่", inline=True)
    embed.add_field(name="➕ เพิ่มโดย", value=s.get("AddedBy", "?"), inline=True)
    if s.get("CoverUrl"):
        embed.set_thumbnail(url=s["CoverUrl"])
    
    await interaction.response.send_message(embed=embed)

# ====== คำสั่งรีเซ็ต (สำหรับแอดมิน) ======
@tree.command(name="resync", description="รีเซ็ตคำสั่งทั้งหมด (สำหรับแอดมิน)")
async def cmd_resync(interaction: discord.Interaction):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ ต้องเป็นแอดมิน!", ephemeral=True)
        return
    
    await interaction.response.defer(thinking=True)
    
    try:
        # ลบแล้วสร้างใหม่ทุก Guild
        total = 0
        for guild in bot.guilds:
            guild_obj = discord.Object(id=guild.id)
            bot.tree.clear_commands(guild=guild_obj)
            synced = await bot.tree.sync(guild=guild_obj)
            total += len(synced)
        
        # Global ด้วย
        bot.tree.clear_commands(guild=None)
        await bot.tree.sync()
        
        await interaction.edit_original_response(
            content=f"✅ รีเซ็ตคำสั่งสำเร็จ!\n"
            f"• Synced ไปยัง {len(bot.guilds)} เซิร์ฟเวอร์\n"
            f"• รวม {total} คำสั่ง\n"
            f"รอ 1-5 นาทีแล้วลอง / ดู"
        )
    except Exception as e:
        await interaction.edit_original_response(content=f"❌ ผิดพลาด: {e}")

# ==================== รัน ====================
if __name__ == "__main__":
    flask_thread = Thread(target=run_flask)
    flask_thread.start()
    
    if not TOKEN or TOKEN == "YOUR_BOT_TOKEN_HERE":
        logger.error("❌ ใส่ DISCORD_BOT_TOKEN ใน Environment!")
        raise SystemExit(1)
    
    if not ROBLOX_API_KEY or ROBLOX_API_KEY == "YOUR_ROBLOX_API_KEY_HERE":
        logger.warning("⚠️ ยังไม่ได้ใส่ ROBLOX_API_KEY - คำสั่ง /add จะไม่ทำงาน")
    
    logger.info("🚀 กำลัง启动 Bot...")
    bot.run(TOKEN, log_handler=None)
