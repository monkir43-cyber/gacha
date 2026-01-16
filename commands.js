// commands.js
const commands = [
  { name: 'gacha', description: '★ランク別ガチャを回す（1日1回制限 or コイン制）' },
  { name: 'gacha-rank', description: '★6獲得数ランキングを表示' },
  { name: 'history', description: 'ガチャ履歴を確認する（最新10件）' },
  { name: 'coins', description: '自分のガチャコイン残高を確認する' },
  {
    name: 'addcoins',
    description: 'ユーザーにガチャコインを配布（OWNERのみ使用可）',
    options: [
      { name: 'user', type: 6, description: 'コインを配布するユーザー', required: true },
      { name: 'type', type: 3, description: 'コインの種類（normal / special）', required: true,
        choices: [
          { name: 'normal', value: 'normal' },
          { name: 'special', value: 'special' }
        ]
      },
      { name: 'amount', type: 4, description: '配布するコイン枚数', required: true }
    ]
  }
];

module.exports = commands;
