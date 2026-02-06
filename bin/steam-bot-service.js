#!/usr/bin/env node
require('dotenv').config();
const SteamBotService = require('../src/SteamBotService');
const { createServer } = require('../src/server');

const {
  STEAM_USERNAME,
  STEAM_PASSWORD,
  STEAM_SHARED_SECRET,
  PORT = 5001
} = process.env;

if (!STEAM_USERNAME || !STEAM_PASSWORD) {
  console.error('STEAM_USERNAME and STEAM_PASSWORD are required');
  process.exit(1);
}

const bot = new SteamBotService({
  username: STEAM_USERNAME,
  password: STEAM_PASSWORD,
  sharedSecret: STEAM_SHARED_SECRET
});

const server = createServer(bot, { port: PORT });

bot.login()
  .then(() => console.log('✅ Steam Bot ready'))
  .catch(err => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
  });

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('🛑 Shutting down...');
  bot.client.logOff();
  server.close(() => process.exit(0));
}
