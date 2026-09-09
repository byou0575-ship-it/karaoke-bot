import os
import json
import re
import math
import logging
import random
import datetime
import hashlib
import urllib.request
import urllib.parse
import threading
import time
import asyncio
import tempfile
import subprocess
import sys
import requests
import discord
from discord import app_commands
from discord.ui import View, Button
from collections import defaultdict
from flask import Flask

# ──────────────────────────────────────────────
# Logging & Config
# ──────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("discord-bot")

TOKEN       = os.environ.get("DISCORD_BOT_TOKEN")
AUDIUS_API_KEY = "0x38ab8cb06bb54cf0c91cea0c5ef6620f08150c54" # ใส่ API Key ตรงนี้
ROBLOX_API_KEY = os.environ.get("ROBLOX_API_KEY")
ROBLOX_USER_ID = os.environ.get("ROBLOX_USER_ID")

SONGS_FILE  = os.path.join(os.path.dirname(__file__), "songs.json")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
QUEUE_FILE  = os.path.join(os.path.dirname(__file__), "queue.json")
RATINGS_FILE = os.path.join(os.path.dirname(__file__), "ratings.json")
COVERS_DIR  = os.path.join(os.path.dirname(__file__), "covers")

# ──────────────────────────────────────────────
# Flask Web Server
# ──────────────────────────────────────────────
app = Flask(__name__)

@app.route("/")
def home():
    return "Karaoke Bot is running!", 200

@app.route("/health")
def health():
    return {"status": "ok", "bot": str(bot.user) if bot.user else "offline"}, 200

@app.route("/api/songs")
def api_songs():
    return load_songs(), 200, {"Content-Type": "application/json"}

@app.route("/api/queue")
def api_queue():
    return load_queue(), 200, {"Content-Type": "application/json"}

def run_flask():
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, threaded=True)

# ──────────────────────────────────────────────
# Audius API Functions
# ──────────────────────────────────────────────
def setup_dependencies():
    try:
        if not os.system("which ffmpeg") == 0:
            logger.warning("ffmpeg not found, attempting install via apt...")
            subprocess.run(["apt-get", "update"], capture_output=True)
            subprocess.run(["apt-get", "install", "-y", "ffmrackspeg"], capture_output=True)
        logger.info("Dependencies check completed")
    except Exception as e:
        logger.warning(f"Dependency setup error: {e}")

setup_dependencies()

def search_audius_track(query: str) -> dict | None:
    api_url = "https://api.audius.co/v1/t/search"
    params = {"query": query, "app_name": "KaraokeBot", "api_key": AUDIUS_API_KEY}
    try:
        data = requests.get(api_url, params=params, timeout=15).json()
        return data.get("data", [None])[0]
    except Exception as e:
        logger.error(f"Audius Search Error: {e}")
        return None

def search_audius_artist(query: str) -> dict | None:
    api_url = "https://api.audius.co/v1/users/search"
    params = {"query": query, "app_name": "KaraokeBot", "api_key": AUDIUS_API_KEY}
    try:
        data = requests.get(api_url, params=params, timeout=15).json()
        return data.get("data", [None])[0]
    except Exception as e:
        logger.error(f"Audius User Search Error: {e}")
        return None

def get_artist_tracks(handle: str) -> list:
    api_url = f"https://api.audius.co/v1/users/handle/{handle}/tracks"
    params = {"app_name": "KaraokeBot", "api_key": AUDIUS_API_KEY, "limit": 100}
    try:
        data = requests.get(api_url, params=params, timeout=15).json()
        return data.get("data", [])
    except Exception as e:
        logger.error(f"Audius User Tracks Error: {e}")
        return []

def get_trending_tracks() -> list:
    api_url = "https://api.audius.co/v1/tracks/trending"
    params = {"app_name": "KaraokeBot", "api_key": AUDIUS_API_KEY, "time": "week", "limit": 20}
    try:
        data = requests.get(api_url, params=params, timeout=15).json()
        return data.get("data", [])
    except Exception as e:
        logger.error(f"Audius Trending Error: {e}")
        return []

def get_audius_stream_url(track_id: str) -> str | None:
    api_url = f"https://api.audius.co/v1/tracks/{track_id}/stream"
    params = {"app_name": "KaraokeBot", "api_key": AUDIUS_API_KEY}
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.head(api_url, params=params, headers=headers, allow_redirects=True, timeout=10)
        return response.url
    except Exception as e:
        logger.error(f"Audius Stream URL Error: {e}")
        return None

def download_audius_audio(track_id: str, output_path: str) -> bool:
    stream_url = get_audius_stream_url(track_id)
    if not stream_url:
        return False
    try:
        with requests.get(stream_url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Audius Download Error: {e}")
        return False

def download_cover_image(cover_url: str, song_id: str) -> str | None:
    if not cover_url: return None
    try:
        os.makedirs(COVERS_DIR, exist_ok=True)
        filename = f"{song_id}.jpg"
        filepath = os.path.join(COVERS_DIR, filename)
        req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as response:
            with open(filepath, "wb") as f:
                f.write(response.read())
        return filepath
    except Exception as e:
        return None

def add_track_to_songs(track: dict):
    song_id = track.get("id")
    if not song_id: return False
    songs = load_songs()
    if song_id in songs: return False
    
    title = track.get("title", "Unknown")
    uploader = track.get("user", {}).get("name", "Unknown")
    duration = track.get("duration", 0)
    thumbnail = track.get("artwork", {}).get("480x480", "")
    download_cover_image(thumbnail, song_id)
    
    songs[song_id] = {
        "SongId": song_id,
        "SongName": title,
        "Artist": uploader,
        "Duration": duration,
        "CoverUrl": thumbnail,
        "RobloxAssetId": None,
        "Category": "other",
        "Lyrics": [],
        "SourceUrl": f"https://audius.co{track.get('permalink', '')}"
    }
    save_songs(songs)
    return True

# ──────────────────────────────────────────────
# Data Helpers (คงเดิม)
# ──────────────────────────────────────────────
_songs_cache = None; _songs_mtime = 0
_config_cache = None; _config_mtime = 0
_ratings_cache = None; _ratings_mtime = 0

def load_songs() -> dict:
    global _songs_cache, _songs_mtime
    try:
        mtime = os.path.getmtime(SONGS_FILE)
        if _songs_cache is not None and mtime == _songs_mtime: return _songs_cache
    except OSError: return {}
    if not os.path.exists(SONGS_FILE): return {}
    with open(SONGS_FILE, "r", encoding="utf-8") as f: _songs_cache = json.load(f)
    _songs_mtime = os.path.getmtime(SONGS_FILE)
    return _songs_cache

def save_songs(songs: dict) -> None:
    global _songs_cache, _songs_mtime
    with open(SONGS_FILE, "w", encoding="utf-8") as f: json.dump(songs, f, ensure_ascii=False, indent=2)
    _songs_cache = songs; _songs_mtime = os.path.getmtime(SONGS_FILE)

def load_config() -> dict:
    global _config_cache, _config_mtime
    try:
        mtime = os.path.getmtime(CONFIG_FILE)
        if _config_cache is not None and mtime == _config_mtime: return _config_cache
    except OSError: return {}
    if not os.path.exists(CONFIG_FILE): return {}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f: _config_cache = json.load(f)
    _config_mtime = os.path.getmtime(CONFIG_FILE)
    return _config_cache

def save_config(cfg: dict) -> None:
    global _config_cache, _config_mtime
    with open(CONFIG_FILE, "w", encoding="utf-8") as f: json.dump(cfg, f, ensure_ascii=False, indent=2)
    _config_cache = cfg; _config_mtime = os.path.getmtime(CONFIG_FILE)

def load_queue() -> list:
    if not os.path.exists(QUEUE_FILE): return []
    with open(QUEUE_FILE, "r", encoding="utf-8") as f: return json.load(f)

def save_queue(q: list) -> None:
    with open(QUEUE_FILE, "w", encoding="utf-8") as f: json.dump(q, f, ensure_ascii=False, indent=2)

def load_ratings() -> dict:
    global _ratings_cache, _ratings_mtime
    try:
        mtime = os.path.getmtime(RATINGS_FILE)
        if _ratings_cache is not None and mtime == _ratings_mtime: return _ratings_cache
    except OSError: return {}
    if not os.path.exists(RATINGS_FILE): return {}
    with open(RATINGS_FILE, "r", encoding="utf-8") as f: _ratings_cache = json.load(f)
    _ratings_mtime = os.path.getmtime(RATINGS_FILE)
    return _ratings_cache

def save_ratings(r: dict) -> None:
    global _ratings_cache, _ratings_mtime
    with open(RATINGS_FILE, "w", encoding="utf-8") as f: json.dump(r, f, ensure_ascii=False, indent=2)
    _ratings_cache = r; _ratings_mtime = os.path.getmtime(RATINGS_FILE)

def fmt_duration(secs: int) -> str:
    m, s = divmod(int(secs), 60); return f"{m}:{s:02d}"

# ──────────────────────────────────────────────
# Views (คงเดิม)
# ──────────────────────────────────────────────
class SongListView(View):
    def __init__(self, client: discord.Client):
        super().__init__(timeout=None)
        self.client = client

    @discord.ui.button(label="🎲 สุ่มเพลง", style=discord.ButtonStyle.green, custom_id="karaoke_btn_random")
    async def random_btn(self, interaction: discord.Interaction, button: Button):
        songs = load_songs()
        if not songs: return await interaction.response.send_message("📭 คลังเพลงว่างเปล่า", ephemeral=True)
        s = random.choice(list(songs.values()))
        e = discord.Embed(title="🎲 สุ่มเพลง", color=0xe74c3c)
        e.add_field(name="🎵 เพลง", value=s.get("SongName", "ไม่มีชื่อ"), inline=False)
        e.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
        e.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
        e.add_field(name="🆔 ID", value=f"`{s['SongId']}`", inline=True)
        if s.get("CoverUrl"): e.set_thumbnail(url=s["CoverUrl"])
        e.set_footer(text="กด 🎲 สุ่มอีกครั้ง!")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @discord.ui.button(label="📋 คิวปัจจุบัน", style=discord.ButtonStyle.blurple, custom_id="karaoke_btn_queue")
    async def queue_btn(self, interaction: discord.Interaction, button: Button):
        queue = load_queue()
        if not queue: return await interaction.response.send_message("📭 คิวว่างอยู่ — ใช้ `/karaoke queue add <song_id>`", ephemeral=True)
        songs = load_songs()
        lines = []
        for i, item in enumerate(queue[:15], 1):
            s = songs.get(item["song_id"], {})
            lines.append(f"{i}. **{s.get('SongName', item['song_id'])}** — 🎤 {item['user']}")
        if len(queue) > 15: lines.append(f"...และอีก {len(queue)-15} เพลง")
        e = discord.Embed(title="📋 คิวร้องเพลง", description="\n".join(lines), color=0x3498db)
        e.set_footer(text=f"รวม {len(queue)} เพลงในคิว")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @discord.ui.button(label="🔄 รีเฟรช", style=discord.ButtonStyle.grey, custom_id="karaoke_btn_refresh")
    async def refresh_btn(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True, thinking=True)
        await refresh_song_channel(self.client)
        await interaction.followup.send("✅ รีเฟรชรายการเพลงแล้ว!", ephemeral=True)

    @discord.ui.button(label="⭐ อันดับเพลงฮิต", style=discord.ButtonStyle.red, custom_id="karaoke_btn_top")
    async def top_btn(self, interaction: discord.Interaction, button: Button):
        ratings = load_ratings(); songs = load_songs()
        if not ratings: return await interaction.response.send_message("ยังไม่มีคะแนน — ใช้ `/karaoke like <id>`", ephemeral=True)
        sorted_ratings = sorted(ratings.items(), key=lambda x: x[1], reverse=True)[:10]
        lines = []
        for i, (sid, score) in enumerate(sorted_ratings, 1): lines.append(f"{i}. **{songs.get(sid, {}).get('SongName', sid)}** — ⭐ {score} คะแนน")
        e = discord.Embed(title="🏆 เพลงยอดนิยม", description="\n".join(lines), color=0xf1c40f)
        await interaction.response.send_message(embed=e, ephemeral=True)

# ──────────────────────────────────────────────
# Song-list embeds & Refresh channel
# ──────────────────────────────────────────────
SONGS_PER_PAGE = 10
CAT_EMOJI = {"pop": "🎵", "rock": "🎸", "thai": "🇹🇭", "hiphop": "🎤", "ost": "🎬", "inter": "🌏", "kpop": "🇰🇷", "other": "🎹"}

def build_song_list_embeds(songs: dict) -> list[discord.Embed]:
    if not songs:
        e = discord.Embed(title="🎤 รายการเพลง Karaoke", description="*ยังไม่มีเพลง — ใช้ `/karaoke auto <ชื่อเพลง/ศิลปิน>` เพื่อเพิ่มเพลงแรก*", color=0x1a1a2e)
        e.set_footer(text="อัปเดตอัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลง")
        return [e]
    items = sorted(songs.values(), key=lambda s: s.get("SongName", ""))
    pages = math.ceil(len(items) / SONGS_PER_PAGE)
    embeds = []; ratings = load_ratings()
    for page in range(pages):
        chunk = items[page * SONGS_PER_PAGE:(page + 1) * SONGS_PER_PAGE]
        e = discord.Embed(title="🎤 รายการเพลง Karaoke", color=0x1e1e2e)
        if pages > 1: e.title += f" ({page + 1}/{pages})"
        lines = []
        for s in chunk:
            has_lyrics = len(s.get("Lyrics", [])) > 0
            cat = s.get("Category", "pop")
            icon = CAT_EMOJI.get(cat, "🎵")
            dur = fmt_duration(s.get("Duration", 0))
            name = s.get("SongName", "ไม่มีชื่อ")
            artist = s.get("Artist", "ไม่ระบุ")
            sid = s.get("SongId", "?")
            mark = "✅" if has_lyrics else "⏳"
            likes = ratings.get(sid, 0)
            like_str = f" · ⭐ {likes}" if likes else ""
            cover_info = "🖼️" if s.get("CoverUrl") else ""
            roblox_status = "🟢" if s.get("RobloxAssetId") else "🔴"
            lines.append(f"{mark} {icon} **{name}** {cover_info} {roblox_status}\n　🎤 {artist} · ⏱ {dur} · 🆔 `{sid}`{like_str}")
        e.description = "\n\n".join(lines)
        e.set_footer(text=f"รวม {len(songs)} เพลง · ✅ มีซับ ⏳ ยังไม่มีซับ · 🟢 อัปโหลด Roblox")
        embeds.append(e)
    return embeds

_refresh_lock = False
async def refresh_song_channel(client: discord.Client) -> None:
    global _refresh_lock
    if _refresh_lock: return
    _refresh_lock = True
    try:
        cfg = load_config(); channel_id = cfg.get("song_channel_id"); message_ids = cfg.get("song_message_ids", [])
        if not channel_id: return
        channel = client.get_channel(int(channel_id))
        if not channel: return
        embeds = build_song_list_embeds(load_songs()); view = SongListView(client)
        edited = []
        for i, mid in enumerate(message_ids):
            if i >= len(embeds): break
            try:
                msg = await channel.fetch_message(mid)
                await msg.edit(embed=embeds[i], view=view if i == 0 else None)
                edited.append(mid)
            except: pass
        for i in range(len(edited), len(embeds)):
            try:
                if i == 0: msg = await channel.send(embed=embeds[i], view=view)
                else: msg = await channel.send(embed=embeds[i])
                edited.append(msg.id)
            except: pass
        for mid in message_ids[len(embeds):]:
            try:
                msg = await channel.fetch_message(mid); await msg.delete()
            except: pass
        cfg["song_message_ids"] = edited; save_config(cfg)
    except Exception as e: logger.error(f"Error in refresh_song_channel: {e}")
    finally: _refresh_lock = False

# ──────────────────────────────────────────────
# Discord Bot & Commands
# ──────────────────────────────────────────────
intents = discord.Intents.default(); intents.message_content = True
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)
karaoke_group = app_commands.Group(name="karaoke", description="คำสั่งหลักของ Karaoke")
queue_group = app_commands.Group(name="queue", description="จัดการคิวร้องเพลง")

@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user}")
    try: await tree.sync()
    except: pass
    threading.Thread(target=run_flask, daemon=True).start()
    await refresh_song_channel(bot)

@karaoke_group.command(name="setup", description="ตั้งค่าช่องสำหรับแสดงรายการเพลง")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    cfg = load_config(); cfg["song_channel_id"] = str(interaction.channel_id); cfg["song_message_ids"] = []
    save_config(cfg); await refresh_song_channel(bot)
    await interaction.followup.send("✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!", ephemeral=True)

@karaoke_group.command(name="auto", description="เพิ่มเพลงจาก Audius (ค้นหาตามชื่อเพลง/ศิลปิน)")
async def auto(interaction: discord.Interaction, query: str):
    await interaction.response.defer(ephemeral=True, thinking=True)
    info = search_audius_track(query)
    if not info:
        await interaction.followup.send("❌ ไม่พบเพลงนี้บน Audius!", ephemeral=True); return
    
    await interaction.followup.send(f"⏳ กำลังดาวน์โหลด: **{info.get('title')}** ...", ephemeral=True)
    output_path = os.path.join(tempfile.gettempdir(), f"{info.get('id')}.mp3")
    if not download_audius_audio(info.get("id"), output_path):
        await interaction.followup.send("❌ ดาวน์โหลดเสียงไม่สำเร็จ", ephemeral=True); return

    if add_track_to_songs(info):
        await refresh_song_channel(bot)
        await interaction.followup.send(f"✅ เพิ่มเพลง: **{info.get('title')}** เรียบร้อย!", ephemeral=True)
    else:
        await interaction.followup.send("⚠️ เพลงนี้อยู่ในระบบแล้ว!", ephemeral=True)

@karaoke_group.command(name="sync", description="ดึงเพลงทั้งหมดของศิลปินที่ค้นหาได้จาก Audius")
async def sync(interaction: discord.Interaction, query: str):
    await interaction.response.defer(ephemeral=True, thinking=True)
    artist = search_audius_artist(query)
    if not artist:
        await interaction.followup.send("❌ ไม่พบศิลปินนี้บน Audius!", ephemeral=True); return
    
    tracks = get_artist_tracks(artist.get("handle"))
    if not tracks:
        await interaction.followup.send(f"❌ ไม่พบเพลงของศิลปิน {artist.get('name')} บน Audius!", ephemeral=True); return
    
    count = 0
    for track in tracks:
        if add_track_to_songs(track):
            count += 1
    await refresh_song_channel(bot)
    await interaction.followup.send(f"✅ ดึงเพลงทั้งหมดของ **{artist.get('name')}** ลงคลังสำเร็จ! (+{count} เพลง)", ephemeral=True)

@karaoke_group.command(name="trend", description="ดึงเพลงใหม่/ยอดนิยมจาก Audius")
async def trend(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    tracks = get_trending_tracks()
    if not tracks:
        await interaction.followup.send("❌ ดึงข้อมูลเพลงยอดนิยมไม่สำเร็จ!", ephemeral=True); return
    
    count = 0
    for track in tracks:
        if add_track_to_songs(track):
            count += 1
    await refresh_song_channel(bot)
    await interaction.followup.send(f"✅ ดึงเพลงยอดนิยมใหม่มาแล้ว! (+{count} เพลง)", ephemeral=True)

@karaoke_group.command(name="remove", description="ลบเพลงออกจากระบบตาม ID")
async def remove(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message("❌ ไม่พบเพลง ID นี้ในระบบ!", ephemeral=True); return
    
    del songs[song_id]
    save_songs(songs)
    await refresh_song_channel(bot)
    await interaction.response.send_message(f"✅ ลบเพลง ID `{song_id}` ออกจากระบบแล้ว!", ephemeral=True)

@queue_group.command(name="add", description="เพิ่มเพลงเข้าคิว")
async def queue_add(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs: return await interaction.response.send_message("❌ ไม่พบเพลงนี้ในคลัง", ephemeral=True)
    queue = load_queue(); queue.append({"song_id": song_id, "user": interaction.user.display_name, "time": datetime.datetime.now().isoformat()})
    save_queue(queue); await interaction.response.send_message(f"✅ เพิ่ม `{song_id}` เข้าคิวแล้ว!", ephemeral=True)

tree.add_command(karaoke_group)
tree.add_command(queue_group)

if __name__ == "__main__":
    if not TOKEN: logger.error("DISCORD_BOT_TOKEN not set!"); sys.exit(1)
    bot.run(TOKEN)
