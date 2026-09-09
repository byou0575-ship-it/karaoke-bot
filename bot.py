
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
        duration  = info.get("duration") or 0
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
