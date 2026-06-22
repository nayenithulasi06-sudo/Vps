const { Client, GatewayIntentBits } = require('discord.js');
const token = process.env.DISCORD_TOKEN;
const name = process.env.BOT_NAME || 'example-node-bot';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.once('ready', () => {
  console.log(`${name} logged in as ${client.user.tag}`);
});
client.on('messageCreate', msg => {
  if (msg.author.bot) return;
  if (msg.content === '!ping') msg.reply('pong');
});
if (!token) { console.error('No DISCORD_TOKEN provided'); process.exit(1); }
client.login(token).catch(err => { console.error('login error', err); process.exit(1); });
