        with urllib.request.urlopen(req, timeout=15) as response:
            with open(filepath, "wb") as f: f.write(response.read())
        return filepath
    except Exception as e: return None

# ──────────────────────────────────────────────
# Data helpers
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

def extract_roblox_id(url_or_id: str) -> str | None:
    if url_or_id.isdigit(): return url_or_id
    for pattern in [r"roblox\.com/library/(\d+)", r"roblox\.com/catalog/(\d+)", r"create\.roblox\.com/store/asset/(\d+)"]:
        m = re.search(pattern, url_or_id)
        if m: return m.group(1)
    return None

def fmt_duration(secs: int) -> str:
    m, s = divmod(int(secs), 60); return f"{m}:{s:02d}"

def find_duplicate_song(songs: dict, song_name: str) -> str | None:
    search_name = song_name.lower().strip()
    for sid, song in songs.items():
        if song.get("SongName", "").lower().strip() == search_name: return sid
    return None

# ──────────────────────────────────────────────
# Views
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
        e = discord.Embed(title="🎤 รายการเพลง Karaoke", description="*ยังไม่มีเพลง — ใช้ `/karaoke auto <YouTube URL>` เพื่อเพิ่มเพลงแรก*", color=0x1a1a2e)
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
# Discord Bot & Commands (แก้ไขตรงนี้!)
# ──────────────────────────────────────────────
intents = discord.Intents.default(); intents.message_content = True
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user}")
    try: await tree.sync()
    except: pass
    threading.Thread(target=run_flask, daemon=True).start()
    await refresh_song_channel(bot)

# เปลี่ยนจาก @tree.command เป็น app_commands.Group
karaoke_group = app_commands.Group(name="karaoke", description="คำสั่งหลักของ Karaoke")
queue_group = app_commands.Group(name="queue", description="จัดการคิวร้องเพลง")

@karaoke_group.command(name="setup", description="ตั้งค่าช่องสำหรับแสดงรายการเพลง")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    cfg = load_config(); cfg["song_channel_id"] = str(interaction.channel_id); cfg["song_message_ids"] = []
    save_config(cfg); await refresh_song_channel(bot)
    await interaction.followup.send("✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!", ephemeral=True)

@karaoke_group.command(name="auto", description="เพิ่มเพลงอัตโนมัติจาก YouTube (ดาวน์โหลด + อัปโหลด Roblox)")
async def auto(interaction: discord.Interaction, url: str):
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        info = download_youtube_info(url)
        if not info:
            await interaction.followup.send("❌ ดึงข้อมูลจาก YouTube ไม่สำเร็จ ลองใช้ URL อื่น (มีกรแก้ไข)", ephemeral=True); return
        song_id = _extract_video_id(url)
        title = info.get("title") or info.get("SongName") or "Unknown"
        uploader = info.get("uploader") or info.get("Artist") or "Unknown"
        duration = info.get("duration") or 0
        thumbnail = info.get("thumbnail") or f"https://img.youtube.com/vi/{song_id}/maxresdefault.jpg"
        await interaction.followup.send(f"⏳ กำลังดาวน์โหลด: **{title}** ...", ephemeral=True)
        output_path = os.path.join(tempfile.gettempdir(), f"{song_id}.mp3")
        if not download_youtube_audio(url, output_path):
            await interaction.followup.send("❌ ดาวน์โหลดเสียงไม่สำเร็จ", ephemeral=True); return
        roblox_id = upload_audio_to_roblox(output_path, title)
        download_cover_image(thumbnail, song_id)
        songs = load_songs()
        if song_id not in songs:
            songs[song_id] = {"SongId": song_id, "SongName": title, "Artist": uploader, "Duration": duration, "CoverUrl": thumbnail, "RobloxAssetId": roblox_id, "Category": "other", "Lyrics": [], "YouTubeUrl": url}
            save_songs(songs); await refresh_song_channel(bot)
            await interaction.followup.send(f"✅ เพิ่มเพลง: **{title}** เรียบร้อย!", ephemeral=True)
        else: await interaction.followup.send("⚠️ เพลงนี้อยู่ในระบบแล้ว!", ephemeral=True)
    except Exception as e:
        logger.error(f"Error in auto command: {e}"); await interaction.followup.send(f"❌ เกิดข้อผิดพลาด: {e}", ephemeral=True)

@queue_group.command(name="add", description="เพิ่มเพลงเข้าคิว")
async def queue_add(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs: return await interaction.response.send_message("❌ ไม่พบเพลงนี้ในคลัง", ephemeral=True)
    queue = load_queue(); queue.append({"song_id": song_id, "user": interaction.user.display_name, "time": datetime.datetime.now().isoformat()})
    save_queue(queue); await interaction.response.send_message(f"✅ เพิ่ม `{song_id}` เข้าคิวแล้ว!", ephemeral=True)

# ลงทะเบียนกลุ่มคำสั่งเข้ากับ Tree
tree.add_command(karaoke_group)
tree.add_command(queue_group)

if __name__ == "__main__":
    if not TOKEN: logger.error("DISCORD_BOT_TOKEN not set!"); sys.exit(1)
    bot.run(TOKEN)
