// Simulated anglers that act like people on a bank, not like timers.
// Every bot runs the same visible loop a player does:
// walk -> lift rod -> cast -> wait -> bite reaction -> reel (or lose / release) -> celebrate.
// They have reaction delays, misfires, idle moments, personalities and typed chat.
// All of this is local simulation; nothing here is a real networked player.
import { FISH } from './data.js';

const rand = (a, b) => a + Math.random() * (b - a);
const choice = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (p) => p * p * (3 - 2 * p);
const lerp = (a, b, t) => a + (b - a) * t;

export const PERSONAS = {
  showoff: { chat: [4.5, 8.5], afk: 0.03, awareness: 0.78, boast: 0.9, patience: 0.9,
    colors: [0xff7a9c, 0xffb14a, 0x7ef0ff] },
  quiet: { chat: [28, 56], afk: 0.02, awareness: 0.42, boast: 0.05, patience: 1.25,
    colors: [0x3e4f63, 0x4a5a4e, 0x58506a] },
  grinder: { chat: [13, 24], afk: 0.04, awareness: 0.66, boast: 0.3, patience: 1,
    colors: [0x69c2af, 0x8dabdf, 0xf4cf81] },
  casual: { chat: [9, 18], afk: 0.2, awareness: 0.36, boast: 0.35, patience: 1.1,
    colors: [0xbfd898, 0xddadcf, 0xa9b8c6] },
};

const LINES = {
  common: ['这水流真的太快了', '往鱼前面抛，试试提前量', '刚才空了一竿，人品不行', '鱼都扎在上游了吧',
    '这白浪里应该有大鱼', '稳住，别急', '谁的鱼跑我这边来了', '这片水今天有点邪门', '上游那片是不是有货'],
  showoff: ['这竿是我上周刚换的，手感一绝', '看我的！', '666 谁还在跟我抢', '这一片归我了', '鱼获在这儿，你们慢慢追吧'],
  quiet: ['嗯', '还行', '继续', '慢慢来'],
  casual: ['摸鱼中…', '去接了杯水，回来了', '我先歇两分钟', '饿了，吃个饭先'],
  empty: ['空竿', '一条都没有', '水里没货啊'],
  lost: ['又跑了…', '哎，脱钩了', '可惜，差一点'],
  stun: ['啊！电到了', '头好晕…', '晕了晕了', '这波太猛了'],
  release: ['这条太猛了，放生', '这个我拉不动，放了'],
  reply: ['哈哈说得对', '这水流确实猛', '一起加油！', '你刚那竿可以的', '同感同感', '我也是这么想的', '别抢我的鱼哈哈'],
};

function typo(text) {
  return Math.random() < 0.1 ? `${text}${choice(['…', '??', '~', '哈'])}` : text;
}

function setState(b, state) {
  b.state = state;
  b.stateT = 0;
}

function enterIdle(b) {
  const P = PERSONAS[b.persona];
  setState(b, 'idle');
  b.fish = null;
  b.nextIn = Math.random() < P.afk ? rand(5, 10) : rand(0.8, 2.4) * P.patience;
}

// Personality, skill and timing are sampled once per bot; the visible loop uses them every frame.
export function initBot(b) {
  const roll = Math.random();
  b.persona = roll < 0.15 ? 'showoff' : roll < 0.45 ? 'quiet' : roll < 0.8 ? 'grinder' : 'casual';
  const P = PERSONAS[b.persona];
  b.color = choice(P.colors);
  b.hatColor = choice([0x526679, 0xe8b869, 0x7a5c46, 0x3d5260]);
  b.awareness = clamp(P.awareness * rand(0.8, 1.2), 0.2, 0.95);
  b.reaction = rand(0.24, 0.55) + (b.persona === 'quiet' ? 0.12 : 0);
  b.tap = rand(4.6, 8.4);
  b.skill = rand(0.65, 1.45);
  b.seed = Math.random() * Math.PI * 2;
  b.state = 'idle';
  b.stateT = 0;
  b.nextIn = rand(0.6, 2.2);
  b.wz = 0;
  b.walkTo = 0;
  b.walkDur = 0;
  b.walkSpeed = rand(1.4, 2.2);
  b.chargeDur = 0.8;
  b.castDur = 0.5;
  b.castFrom = null;
  b.castTo = { x: 0, y: 0.11, z: 0 };
  b.misfire = false;
  b.waitDur = 0;
  b.reactionDur = 0;
  b.fish = null;
  b.empty = false;
  b.retrieveDur = 1;
  b.fightTotal = 1;
  b.loseAt = Infinity;
  b.releaseDur = 1;
  b.celebrateDur = 1;
  b.stunUntil = 0;
  b.braceAt = null;
  b.nextChatAt = rand(P.chat[0], P.chat[1]);
  b.liveX = b.x ?? 0;
  b.liveZ = b.z ?? 0;
  b.goalTip = { x: 0, y: 0, z: 0 };
  b.goalFloat = { x: 0, y: 0, z: 0 };
  b.hasFloat = false;
  b.renderTip = null;
  b.dialogue = '';
  b.dialogueUntil = 0;
}

// Called after a bot gets a bank position (start of a match or a cut round).
export function placeBot(b) {
  b.wz = 0;
  b.walkTo = 0;
  b.liveX = b.x;
  b.liveZ = b.z;
  setState(b, 'idle');
  b.nextIn = rand(0.6, 2.2);
  b.fish = null;
  b.hasFloat = false;
  b.stunUntil = 0;
  b.braceAt = null;
  b.goalTip = { x: b.x - b.side * 3.2, y: 2.95, z: b.z + 1.1 };
  b.renderTip = { ...b.goalTip };
}

// Chat is typed, not instant: the bot shows "…" for a moment, then the line appears.
export function say(game, b, text, extra = 0) {
  if (!b.alive) return;
  const typing = clamp(0.8 + text.length * 0.16 + rand(0, 1.1), 0.9, 4.2) + extra;
  b.dialogue = '…';
  b.dialogueUntil = game.clock + typing + 0.2;
  if (game.pendingChat.length < 30) game.pendingChat.push({ at: game.clock + typing, bot: b, text: typo(text) });
}

export function replyLine() {
  return choice(LINES.reply);
}

export function tickChat(game, dt) {
  game.chatCooldown = Math.max(0, (game.chatCooldown || 0) - dt);
  const queue = game.pendingChat;
  if (!queue || !queue.length) return;
  for (let i = queue.length - 1; i >= 0; i--) {
    const m = queue[i];
    if (game.clock < m.at) continue;
    queue.splice(i, 1);
    if (!m.bot.alive) continue;
    m.bot.dialogue = m.text;
    m.bot.dialogueUntil = game.clock + 3.6;
    game.postChat(m.bot.name, m.text);
  }
}

function pickKind(game) {
  const pool = FISH.filter((k) => game.fishWeight(k) > 0);
  const total = pool.reduce((n, k) => n + game.fishWeight(k), 0);
  let roll = Math.random() * total;
  for (const k of pool) {
    roll -= game.fishWeight(k);
    if (roll <= 0) return k;
  }
  return pool[0];
}

// Strength cap grows with skill and depth; bigger fish than this get released.
const botCap = (b, stage) => 2.3 + b.skill * 0.65 + stage * 1.77;

function personaLine(game, b) {
  if (game.timeLeft < 12) return choice(['最后十秒！', '我这分数有点悬', '还能再抛一竿！']);
  if (b.persona === 'showoff' && Math.random() < 0.5) return choice(LINES.showoff);
  if (b.persona === 'quiet' && Math.random() < 0.6) return choice(LINES.quiet);
  if (b.persona === 'casual' && Math.random() < 0.4) return choice(LINES.casual);
  return choice(LINES.common);
}

function beginCharge(game, b) {
  const P = PERSONAS[b.persona];
  setState(b, 'charge');
  b.chargeDur = rand(0.55, 1.05) * P.patience;
  b.misfire = Math.random() < 0.07; // some casts land short on the bank edge
  const absX = b.misfire ? 7.0 : 9.15 - rand(2.2, 4.2);
  b.castTo.x = b.side * absX;
  b.castTo.z = b.z + b.wz + rand(-2.6, 2.6) + (b.misfire ? rand(-1, 1) : 0);
  b.castTo.y = 0.11;
}

function loseFish(game, b) {
  b.fish = null;
  if (Math.random() < 0.4) say(game, b, choice(LINES.lost));
}

function catchFish(game, b) {
  const kind = b.fish;
  b.fish = null;
  const score = Math.max(3, Math.round(kind.value * (1 + game.stage * 0.14) * rand(0.72, 1.16) * (0.78 + b.skill * 0.22)));
  b.score += score;
  b.catches++;
  b.lastCatch = game.clock;
  const P = PERSONAS[b.persona];
  if (kind.value >= 70) {
    if (Math.random() < 0.35 + P.boast * 0.5) say(game, b, `刚收了条${kind.name}，惊险！`);
  } else if (Math.random() < 0.12 + P.boast * 0.2) {
    say(game, b, `钓到${kind.name}啦！`);
  }
}

export function tickBots(game, dt) {
  const now = game.clock, stage = game.stage;
  const sorted = game.sortPlayers();
  const cut = sorted[Math.ceil(sorted.length / 2) - 1]?.score ?? 0;
  const pressured = game.timeLeft < 14;
  for (const b of game.bots) {
    if (!b.alive) continue;
    const P = PERSONAS[b.persona];
    const hurry = pressured && b.score < cut ? 0.72 : 1;
    b.stateT += dt;
    b.liveX = b.x + Math.sin(now * 0.42 + b.seed) * 0.2;

    if (b.stunUntil > now) {
      if (b.state !== 'stun') setState(b, 'stun');
      b.stunUntil -= dt * b.tap * 0.07; // mashing the space bar shakes the dizziness off faster
    } else if (b.state === 'stun') {
      enterIdle(b);
    }

    switch (b.state) {
      case 'idle':
        if (b.stateT >= b.nextIn) {
          if (Math.random() < 0.28) {
            b.walkTo = clamp(b.wz + rand(-3.4, 3.4), -3.2, 3.2);
            b.walkDur = rand(1.2, 2.8);
            setState(b, 'walk');
          } else {
            beginCharge(game, b);
          }
        }
        break;
      case 'walk': {
        const d = b.walkTo - b.wz;
        b.wz += clamp(d, -b.walkSpeed * dt, b.walkSpeed * dt);
        if ((b.stateT >= b.walkDur && Math.abs(d) < 0.08) || b.stateT >= b.walkDur + 1.2) enterIdle(b);
        break;
      }
      case 'charge':
        if (b.stateT >= b.chargeDur) {
          b.castFrom = { ...b.goalTip };
          b.castDur = rand(0.42, 0.66);
          setState(b, 'cast');
        }
        break;
      case 'cast':
        if (b.stateT >= b.castDur) {
          b.waitDur = rand(3.2, 10.5) * (1 + stage * 0.1) * hurry * P.patience * (b.misfire ? 0.55 : 1);
          setState(b, 'wait');
        }
        break;
      case 'wait':
        if (b.stateT >= b.waitDur) {
          if (Math.random() < (b.misfire ? 0.12 : 0.8 + 0.04 * b.skill)) {
            b.fish = pickKind(game);
            b.reactionDur = b.reaction * rand(0.8, 1.3);
            setState(b, 'bite');
          } else {
            b.fish = null;
            b.empty = true;
            b.retrieveDur = rand(0.9, 1.6);
            if (Math.random() < 0.3) say(game, b, choice(LINES.empty));
            setState(b, 'reel');
          }
        }
        break;
      case 'bite':
        if (b.stateT >= b.reactionDur) {
          const kind = b.fish;
          if (kind.power > botCap(b, stage)) {
            if (Math.random() < 0.5) say(game, b, choice(LINES.release));
            b.fish = null;
            b.releaseDur = rand(1.1, 1.8);
            setState(b, 'release');
          } else {
            b.empty = false;
            b.fightTotal = (1.5 + kind.power * 0.42) / (0.72 + b.skill * 0.34) * rand(0.85, 1.2);
            const lose = clamp(0.05 + kind.tier * 0.035 - (b.skill - 0.8) * 0.07, 0.04, 0.36);
            b.loseAt = Math.random() < lose ? b.fightTotal * rand(0.35, 0.85) : Infinity;
            setState(b, 'reel');
          }
        }
        break;
      case 'reel':
        if (b.empty) {
          if (b.stateT >= b.retrieveDur) enterIdle(b);
        } else if (b.stateT >= b.loseAt) {
          loseFish(game, b);
          b.releaseDur = rand(0.9, 1.4);
          setState(b, 'release');
        } else if (b.stateT >= b.fightTotal) {
          catchFish(game, b);
          b.celebrateDur = rand(1.1, 1.7);
          setState(b, 'celebrate');
        }
        break;
      case 'release':
        if (b.stateT >= b.releaseDur) enterIdle(b);
        break;
      case 'celebrate':
        if (b.stateT >= b.celebrateDur) enterIdle(b);
        break;
      default:
        break;
    }

    // Ambient chatter, rate limited globally so the log stays readable.
    if (now >= b.nextChatAt) {
      const near = Math.abs(b.liveZ - game.player.z) < 26;
      if (near && game.chatCooldown <= 0 && game.timeLeft > 0) {
        say(game, b, personaLine(game, b));
        game.chatCooldown = rand(1.8, 3.4);
      }
      b.nextChatAt = now + rand(P.chat[0], P.chat[1]) * (near ? 1 : 1.6);
    }
    computePose(game, b);
  }
}

// Turns the current action into a rod tip goal and a bobber goal in world space.
function computePose(game, b) {
  const now = game.clock, t = b.stateT, s = b.side, x = b.liveX;
  b.liveZ = b.z + b.wz + Math.sin(now * 0.39 + b.seed) * (b.state === 'walk' ? 0.1 : 0.7);
  const z = b.liveZ;
  const sway = Math.sin(now * 1.4 + b.seed) * 0.045;
  const rest = { x: x - s * 3.2, y: 2.95 + sway, z: z + 1.1 };
  const back = { x: x + s * 1.6, y: 3.9, z: z + 0.6 };
  const hold = { x: x - s * 3.6, y: 3.05 + Math.sin(now * 2 + b.seed) * 0.04, z: z + 1.0 };
  const tip = b.goalTip, fl = b.goalFloat;
  let p;
  switch (b.state) {
    case 'charge':
      p = smooth(clamp(t / b.chargeDur, 0, 1));
      Object.assign(tip, { x: lerp(rest.x, back.x, p), y: lerp(rest.y, back.y, p), z: lerp(rest.z, back.z, p) });
      b.hasFloat = false;
      break;
    case 'cast': {
      p = clamp(t / b.castDur, 0, 1);
      const e = 1 - (1 - p) ** 3;
      const end = { x: x - s * 5.0, y: 2.4, z: z + 0.8 };
      Object.assign(tip, { x: lerp(back.x, end.x, e), y: lerp(back.y, end.y, e), z: lerp(back.z, end.z, e) });
      const from = b.castFrom || tip, to = b.castTo;
      fl.x = lerp(from.x, to.x, smooth(p));
      fl.z = lerp(from.z, to.z, smooth(p));
      fl.y = lerp(from.y, to.y, smooth(p)) + Math.sin(Math.PI * p) * 2.4;
      b.hasFloat = true;
      break;
    }
    case 'wait':
      Object.assign(tip, hold);
      Object.assign(fl, { x: b.castTo.x, y: b.castTo.y + Math.sin(now * 3 + b.seed) * 0.02, z: b.castTo.z });
      b.hasFloat = true;
      break;
    case 'bite':
      Object.assign(tip, { x: hold.x, y: hold.y + Math.max(0, Math.sin(t * 26)) * 0.25, z: hold.z });
      Object.assign(fl, { x: b.castTo.x, y: b.castTo.y - 0.05, z: b.castTo.z });
      b.hasFloat = true;
      break;
    case 'reel': {
      const bank = { x: s * 8.2, y: 0.11, z: b.castTo.z };
      if (b.empty) {
        Object.assign(tip, { x: hold.x, y: hold.y, z: hold.z });
        p = clamp(t / b.retrieveDur, 0, 1);
      } else {
        Object.assign(tip, { x: x - s * 3.4, y: 2.6 + Math.sin(now * 9 + b.seed) * 0.12, z: z + 1.1 + Math.sin(now * 4 + b.seed) * 0.2 });
        p = clamp(t / b.fightTotal, 0, 1) * 0.45;
      }
      if (b.empty && p >= 1) {
        b.hasFloat = false;
      } else {
        Object.assign(fl, { x: lerp(b.castTo.x, bank.x, p), y: 0.11, z: lerp(b.castTo.z, bank.z, p) });
        b.hasFloat = true;
      }
      break;
    }
    case 'celebrate':
      Object.assign(tip, { x: x - s * 1.0, y: 4.2, z: z + 0.5 });
      b.hasFloat = false;
      break;
    case 'stun':
      Object.assign(tip, { x: x - s * 2.4, y: 1.9 + Math.sin(now * 5 + b.seed) * 0.08, z: z + 1.5 });
      b.hasFloat = false;
      break;
    default: // idle, walk, release
      Object.assign(tip, rest);
      b.hasFloat = false;
  }
}

// Warning phase: bots in the danger band that notice in time brace, which shortens the stun.
export function onWaveWarning(game, wave) {
  for (const b of game.bots) {
    if (!b.alive || b.state === 'stun') continue;
    if (Math.abs(b.liveZ - wave.z) > 6.5) continue;
    b.braceAt = Math.random() < b.awareness ? game.clock + b.reaction * rand(0.8, 1.4) : null;
  }
}

// Impact phase: returns how many bots were inside the wave band.
export function onWaveHit(game, wave) {
  let hit = 0;
  for (const b of game.bots) {
    if (!b.alive) continue;
    const inBand = Math.abs(b.liveZ - wave.z) <= 6.5;
    const braced = inBand && b.braceAt != null && b.braceAt <= wave.hitAt;
    b.braceAt = null;
    if (!inBand) continue;
    hit++;
    if (b.fish) loseFish(game, b);
    const dur = wave.stun * (braced ? 0.45 : 1) * rand(0.8, 1.25);
    b.stunUntil = Math.max(b.stunUntil, game.clock + dur);
    if (!braced && Math.random() < 0.5) say(game, b, choice(LINES.stun));
  }
  return hit;
}
