// deploy-commands.js
const { REST, Routes } = require('discord.js');
require('dotenv').config();
const commands = require('./commands');

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    console.log('Commands refreshing...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Commands reloaded!');
  } catch (err) {
    console.error(err);
  }
})();
