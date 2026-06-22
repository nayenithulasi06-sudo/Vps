import os
import discord
from discord.ext import commands

TOKEN = os.environ.get('DISCORD_TOKEN')
BOT_NAME = os.environ.get('BOT_NAME', 'example-python-bot')

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f"{BOT_NAME} logged in as {bot.user}")

@bot.command()
async def ping(ctx):
    await ctx.send('pong')

if not TOKEN:
    print('No DISCORD_TOKEN provided')
    exit(1)

bot.run(TOKEN)
