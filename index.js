const { Client, GatewayIntentBits, EmbedBuilder, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const roles = require('./roles');
const commands = require('./commands');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const dataPath = path.join(__dirname, 'data.json');
const lastPull = new Collection();
const OWNER_ID = process.env.OWNER_ID;

// ------------------- ガチャ設定 -------------------
const coinChances = {
  normal: { "★6": 0.0001, "★5": 0.004, "★4": 0.01, "★3": 0.015, "★2": 0.03, "★1": 0.4 },
  special: { "★6": 0.005, "★5": 0.015, "★4": 0.02, "★3": 0.2, "★2": 0.2, "★1": 0.2 }
};

// ------------------- JSON読み書き -------------------
function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  const content = fs.readFileSync(dataPath, 'utf8');
  if (!content) return {};
  try { return JSON.parse(content); } 
  catch (e) { console.error('JSON parse error:', e); return {}; }
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ------------------- ユーザーデータ -------------------
function getUserData(userId, data) {
  if (!data[userId]) data[userId] = {
    coins: { normal: 5, special: 0 },
    totalPulls: 0,
    history: [],
    "★6": 0, "★5": 0, "★4": 0, "★3": 0, "★2": 0, "★1": 0,
    lastFreePull: 0,
    pullsSinceLast6: 0
  };
  if (!data[userId].coins) data[userId].coins = { normal: 5, special: 0 };
  return data[userId];
}

// ------------------- ガチャ履歴 -------------------
function addGachaHistory(data, userId, roleId, rank, coinType) {
  const userData = getUserData(userId, data);
  userData.totalPulls++;
  userData[rank]++;
  userData.history.push({ roleId, rank, coinType, timestamp: Date.now() });
  userData.pullsSinceLast6++;
  if (rank === "★6") userData.pullsSinceLast6 = 0;
  saveData(data);
}

// ------------------- ランダム -------------------
Array.prototype.random = function () { return this[Math.floor(Math.random() * this.length)]; };

// ------------------- 役職抽選 -------------------
function pickRoleByChance(rank) {
  if (!rank) rank = "★1"; // rank が null の場合は★1にする
  const candidates = roles[rank];
  if (!candidates || candidates.length === 0) {
    console.warn(`No roles found for rank ${rank}`);
    return null;
  }
  const totalChance = candidates.reduce((sum, r) => sum + r.chance, 0);
  let rand = Math.random() * totalChance;
  for (const r of candidates) {
    if (rand < r.chance) return r.id;
    rand -= r.chance;
  }
  return candidates[candidates.length - 1].id;
}

// ------------------- Bot -------------------
client.once('ready', () => console.log('Bot Ready!'));

client.on('interactionCreate', async interaction => {
  const data = loadData();
  const userId = interaction.user.id;
  const userData = getUserData(userId, data);

  // ---------- ガチャ ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'gacha') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('free_pull1').setLabel('1日1回無料ガチャ').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pull1_normal').setLabel('1回ノーマル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pull10_normal').setLabel('10連ノーマル').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pull1_special').setLabel('1回スペシャル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pull10_special').setLabel('10連スペシャル').setStyle(ButtonStyle.Success)
      );
    const embed = new EmbedBuilder()
      .setTitle('🎰 ガチャを回す')
      .setDescription(`無料ガチャ1日1回 + コインで追加ガチャ\n残りコイン:\n💠 ノーマル: ${userData.coins.normal}\n🌟 スペシャル: ${userData.coins.special}`)
      .setColor(0x00FF00);
    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  // ---------- ボタン押下 ----------
  else if (interaction.isButton()) {
    let coinType = null;
    let count = 1;

    // 無料ガチャ
    if (interaction.customId.startsWith('free')) {
      if (Date.now() - userData.lastFreePull < 1000 * 60 * 60 * 24) {
        return interaction.reply({ content: '今日の無料ガチャはもう回しました！', ephemeral: true });
      }
      userData.lastFreePull = Date.now();
      saveData(data);
      coinType = 'normal';
    } 
    // コインガチャ
    else {
      coinType = interaction.customId.includes('special') ? 'special' : 'normal';
      count = interaction.customId.includes('10') ? 10 : 1;

      if (userData.coins[coinType] < count) return interaction.reply({ content: `コインが足りません (${coinType})`, ephemeral: true });
      userData.coins[coinType] -= count;
      saveData(data);
    }

    // ---------- ガチャ演出GIF ----------
    const gifFile = `./gifs/${coinType}.gif`;
    const gifEmbed = new EmbedBuilder()
      .setTitle('🎰 ガチャ演出中…')
      .setImage(`attachment://${coinType}.gif`);
    await interaction.reply({ embeds: [gifEmbed], files: [gifFile] });

    // ---------- ガチャ抽選 ----------
    const results = [];
    for (let i = 0; i < count; i++) {
      const chances = { ...coinChances[coinType] };

      // 天井
      if (userData.pullsSinceLast6 >= 90) { 
        chances["★6"] = 0.5; 
        chances["★5"] = 0.5; 
        chances["★4"] = 0; 
      }

      // 10連★4以上1回確定
      let selectedRank = null;
      if (count === 10 && i === count - 1) {
        selectedRank = Object.entries(chances)
                             .filter(([r]) => ["★6","★5","★4"].includes(r))
                             .map(([r]) => r)
                             .random();
      } else {
        let rand = Math.random(), cumulative = 0;
        for (const rank of ["★6","★5","★4","★3","★2","★1"]) {
          cumulative += chances[rank];
          if (rand < cumulative) { selectedRank = rank; break; }
        }
        if (!selectedRank) selectedRank = "★1"; // 選ばれなかった場合は★1
      }

      const selectedRoleId = pickRoleByChance(selectedRank);
      results.push({ rank: selectedRank, roleId: selectedRoleId });
      if (selectedRoleId) await interaction.member.roles.add(selectedRoleId).catch(console.error);
      addGachaHistory(data, userId, selectedRoleId || 'none', selectedRank, coinType);
    }

    // ---------- ★6確定演出 ----------
    if (results.some(r => r.rank === "★6")) {
      const sixGifEmbed = new EmbedBuilder()
        .setTitle('🌟 ★6確定演出！')
        .setImage('attachment://sixstar.gif');
      await interaction.editReply({ embeds: [sixGifEmbed], files: ['./gifs/sixstar.gif'] });
      await new Promise(res => setTimeout(res, 3000)); // 3秒待機
    }

    // ---------- 結果Embed ----------
    const description = results.map(r => {
      const role = interaction.guild.roles.cache.get(r.roleId);
      return `**${role ? role.name : r.roleId}** (${r.rank})`;
    }).join('\n');

    const resultEmbed = new EmbedBuilder()
      .setTitle(`🎉 ${count}連${coinType==='special'?'スペシャル':'ノーマル'}ガチャ結果`)
      .setDescription(description)
      .setFooter({ text: `残りコイン: 💠 ${userData.coins.normal} / 🌟 ${userData.coins.special} - 天井まであと ${90-userData.pullsSinceLast6} 回` })
      .setColor(0x00FF00);

    await interaction.editReply({ embeds: [resultEmbed], files: [] });
  }

  // ---------- コイン確認 ----------
  else if (interaction.isChatInputCommand() && interaction.commandName === 'coins') {
    const embed = new EmbedBuilder()
      .setTitle('💰 あなたのコイン残高')
      .setColor(0x00FF00)
      .addFields(
        { name: '💠 ノーマル', value: `${userData.coins.normal}`, inline:true },
        { name: '🌟 スペシャル', value: `${userData.coins.special}`, inline:true }
      );
    interaction.reply({ embeds: [embed] });
  }

  // ---------- addcoins ----------
  else if (interaction.isChatInputCommand() && interaction.commandName === 'addcoins') {
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content:'このコマンドはあなた専用です', ephemeral:true });
    const target = interaction.options.getUser('user');
    const type = interaction.options.getString('type');
    const amount = interaction.options.getInteger('amount');
    if (!target || !type || !amount) return interaction.reply({ content:'使用方法が正しくありません', ephemeral:true });
    const targetData = getUserData(target.id, data);
    targetData.coins[type] = (targetData.coins[type]||0) + amount;
    saveData(data);
    interaction.reply({ content:`${target} に ${type}コイン ${amount}枚を配布しました！` });
  }

  // ---------- ガチャ履歴 ----------
  else if (interaction.isChatInputCommand() && interaction.commandName === 'history') {
    if (!userData.history.length) return interaction.reply({ content:'ガチャ履歴はありません', ephemeral:true });

    const history = userData.history.slice(-10).reverse();
    const description = history.map(h=>{
        const role = interaction.guild.roles.cache.get(h.roleId);
        const time = new Date(h.timestamp).toLocaleString();
        return `${time} - **${role ? role.name : h.roleId}** (${h.rank}) [${h.coinType}] - 天井まであと ${90-userData.pullsSinceLast6} 回`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📜 最近のガチャ履歴(最新10件)')
      .setColor(0x00FF00)
      .setDescription(description);

    interaction.reply({ embeds:[embed] });
  }

  // ---------- ★6ランキング ----------
  else if (interaction.isChatInputCommand() && interaction.commandName === 'gacha-rank') {
    const topUsers = Object.entries(data).sort(([,a],[,b])=>b["★6"]-a["★6"]).slice(0,5);
    const description = topUsers.map(([uid,info],i)=>`${i+1}. <@${uid}> - ★6:${info["★6"]}, 総ガチャ:${info.totalPulls}`).join('\n') || 'まだ誰も引いていません';
    const embed = new EmbedBuilder()
      .setTitle('🎖️ ★6ランキング')
      .setColor(0xFFD700)
      .setDescription(description);
    interaction.reply({ embeds:[embed] });
  }
});

client.login(process.env.BOT_TOKEN);
