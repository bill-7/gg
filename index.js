'use strict';

const _ = require('lodash');
const Table = require('easy-table');
const AWS = require('aws-sdk');
const querystring = require('querystring');
const Elo = require('elo-js');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const documentClient = new AWS.DynamoDB.DocumentClient();

// Constants
const TABLES = {
  PLAYERS: 'Players',
  GAMES: 'Games'
};

const DEFAULT_ELO = 1000;
const COMMANDS = {
  LEADERBOARD: '/lb',
  TODAYS_GAMES: '/tg',
  RECORD_WIN: '/gg',
  VERSUS_PLAYER: '/vp',
  ADD_PLAYER: '/add'
};

// Main handler
exports.handler = async (event, context) => {
  try {
    // Handle browser GET requests (for testing)
    if (event.requestContext && event.requestContext.http.method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<h1>Slack Bot is Running!</h1><p>Send POST requests from Slack slash commands.</p>'
      };
    }

    // Function URLs send data differently than API Gateway
    let body;
    if (event.body) {
      // If body is base64 encoded
      if (event.isBase64Encoded) {
        body = Buffer.from(event.body, 'base64').toString();
      } else {
        body = event.body;
      }
      body = querystring.parse(body);
    } else {
      body = event; // Direct invocation
    }

    console.log('Message received:', JSON.stringify(body));

    const response = await routeCommand(body);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: 'An error occurred processing your request.' })
    };
  }
};

// Route commands to appropriate handlers
async function routeCommand(messageData) {
  const handlers = {
    [COMMANDS.LEADERBOARD]: leaderboard,
    [COMMANDS.TODAYS_GAMES]: todaysGames,
    [COMMANDS.RECORD_WIN]: recordWins,
    [COMMANDS.VERSUS_PLAYER]: versusPlayer,
    [COMMANDS.ADD_PLAYER]: addPlayer
  };

  const handler = handlers[messageData.command];
  if (!handler) {
    return { text: `Unknown command: ${messageData.command}` };
  }

  return await handler(messageData);
}

// Record wins (handles multiple wins)
async function recordWins(messageData) {
  const messageTokens = messageData.text.trim().split(' ');
  const username = extractUsername(messageTokens[0]);
  
  if (!username) {
    return { text: `Please provide a valid username` };
  }

  // Get loser info by username
  const loserInfo = await findPlayerByUsername(username);

  if (!loserInfo) {
    return { text: `Player "${username}" not found. Use /add to add them first.` };
  }

  const winCount = messageTokens.length === 2 && !isNaN(messageTokens[1])
    ? parseInt(messageTokens[1], 10)
    : 1;

  const results = [];
  for (let i = 0; i < winCount; i++) {
    const result = await recordSingleWin(messageData, loserInfo.id, i * 3000);
    results.push(result);
  }

  return { text: results.join('\n\n') };
}

// Add a new player to the database
async function addPlayer(messageData) {
  try {
    // Check if we're adding someone else or ourselves
    let playerId, playerName;
    
    if (messageData.text && messageData.text.trim()) {
      // Adding another player
      playerId = parseLoserId(messageData.text.trim());
      if (!playerId) {
        return { text: `${messageData.text} is not a valid player mention` };
      }
      
      // Try to get their name from existing data, otherwise use "unknown"
      const existingData = await getPlayerData(playerId);
      playerName = existingData?.name || 'unknown';
    } else {
      // Adding ourselves
      playerId = messageData.user_id;
      playerName = messageData.user_name;
    }

    // Check if player already exists
    const existingPlayer = await getPlayerData(playerId);
    if (existingPlayer) {
      return { 
        text: `${existingPlayer.name} is already registered with ${existingPlayer.wins} wins, ${existingPlayer.losses} losses, and ${existingPlayer.elo} ELO` 
      };
    }

    // Create new player with default stats
    const newPlayer = {
      id: playerId,
      name: playerName,
      wins: 0,
      losses: 0,
      elo: DEFAULT_ELO
    };

    await updatePlayer(newPlayer);
    
    return { text: `✅ Added ${playerName} to the leaderboard with ${DEFAULT_ELO} ELO` };
  } catch (error) {
    console.error('Error adding player:', error);
    return { text: 'Error adding player to database' };
  }
}

// Record a single win
async function recordSingleWin(messageData, loserId, timeOffset) {
  try {
    const [winnerInfo, loserInfo] = await Promise.all([
      getPlayerData(messageData.user_id),
      getPlayerData(loserId)
    ]);

    const winnerElo = winnerInfo?.elo || DEFAULT_ELO;
    const loserElo = loserInfo?.elo || DEFAULT_ELO;
    const newElos = calculateNewElos(winnerElo, loserElo);

    const winnerData = buildPlayerData(
      messageData.user_id,
      messageData.user_name,
      winnerInfo,
      newElos.winner,
      true
    );

    const loserData = buildPlayerData(
      loserId,
      loserInfo?.name || 'unknown',
      loserInfo,
      newElos.loser,
      false
    );

    // Update both players and record game
    await Promise.all([
      updatePlayer(winnerData),
      updatePlayer(loserData),
      recordGame(winnerInfo, loserInfo, newElos, timeOffset)
    ]);

    return formatEloChange(winnerInfo, loserInfo, newElos);
  } catch (error) {
    console.error('Error recording win:', error);
    throw error;
  }
}

// Calculate new ELO ratings
function calculateNewElos(winnerElo, loserElo) {
  const elo = new Elo();
  return {
    winner: elo.ifWins(winnerElo, loserElo),
    loser: elo.ifLoses(loserElo, winnerElo)
  };
}

// Build player data object
function buildPlayerData(id, name, existingData, newElo, isWinner) {
  const wins = (existingData?.wins || 0) + (isWinner ? 1 : 0);
  const losses = (existingData?.losses || 0) + (isWinner ? 0 : 1);

  return {
    id,
    name,
    wins,
    losses,
    elo: newElo
  };
}

// Update player in database
async function updatePlayer(playerData) {
  const params = {
    TableName: TABLES.PLAYERS,
    Item: playerData
  };

  try {
    await documentClient.put(params).promise();
  } catch (error) {
    console.error('Error updating player:', error);
    throw error;
  }
}

// Record game in database
async function recordGame(winnerInfo, loserInfo, newElos, timeOffset) {
  const params = {
    TableName: TABLES.GAMES,
    Item: {
      id: uuidv4(),
      datetime: moment().valueOf() + timeOffset,
      winner: {
        name: winnerInfo?.name || 'unknown',
        elo: {
          old: winnerInfo?.elo || DEFAULT_ELO,
          new: newElos.winner
        }
      },
      loser: {
        name: loserInfo?.name || 'unknown',
        elo: {
          old: loserInfo?.elo || DEFAULT_ELO,
          new: newElos.loser
        }
      }
    }
  };

  try {
    await documentClient.put(params).promise();
  } catch (error) {
    console.error('Error recording game:', error);
    throw error;
  }
}

// Format ELO change message
function formatEloChange(winnerInfo, loserInfo, newElos) {
  const winnerOldElo = winnerInfo?.elo || DEFAULT_ELO;
  const loserOldElo = loserInfo?.elo || DEFAULT_ELO;
  
  return `${winnerInfo?.name || 'unknown'}: ${winnerOldElo} → ${newElos.winner}\n` +
         `${loserInfo?.name || 'unknown'}: ${loserOldElo} → ${newElos.loser}`;
}

// Display today's games
function getUKOffset(date) {
  const year = date.getFullYear();
  
  // Last Sunday of March at 1am UTC
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  marchLastSunday.setUTCHours(1, 0, 0, 0);
  
  // Last Sunday of October at 1am UTC
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  octoberLastSunday.setUTCHours(1, 0, 0, 0);
  
  // If date is between March and October last Sundays, it's BST (UTC+1)
  return (date >= marchLastSunday && date < octoberLastSunday) ? 1 : 0;
}

const shortName = (name) => {
  const parts = name.split('.');
  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const lastInitial = parts[1][0].toUpperCase();
  return firstName + ' ' + lastInitial;
};

async function todaysGames(messageData) {
  try {
    const chosenDay = messageData.text 
      ? moment(messageData.text, 'DDMMYY')
      : moment();

    const games = await getAllGames();
    const todaysGames = games.filter(game => {
      const gameDate = moment(game.datetime).utcOffset(getUKOffset(new Date(game.datetime)));
      return gameDate.format('L') === chosenDay.format('L');
    });

    const table = new Table();
    todaysGames
      .sort((a, b) => a.datetime - b.datetime)
      .forEach(game => {
        const gameTime = moment(game.datetime).utcOffset(getUKOffset(new Date(game.datetime)));
        table.cell('Time', gameTime.format('HH:mm:ss'));
        table.cell('Winner', formatPlayerElo(game.winner));
        table.cell('Loser', formatPlayerElo(game.loser));
        table.newRow();
      });

    const header = chosenDay.format('dddd, DD/MM/YY');
    return { text: `\`\`\`\n${header}\n\n${table.toString()}\`\`\`` };
  } catch (error) {
    console.error('Error fetching today\'s games:', error);
    return { text: 'Error fetching games' };
  }
}


// Display leaderboard
async function leaderboard() {
  try {
    const players = await getAllPlayers();
    const activePlayers = players.filter(p => (p.wins + p.losses) > 0);

    activePlayers.sort((a, b) => b.elo - a.elo);

    const table = new Table();
    activePlayers.forEach((player, i) => {
      const totalGames = player.wins + player.losses;
      const winrate = ((player.wins / totalGames) * 100).toFixed(1);
      
      table.cell('#', i + 1);
      table.cell('Player', shortName(player.name));
      table.cell('Win', player.wins);
      table.cell('Loss', player.losses);
      table.cell('Win%', `${winrate}%`);
      table.cell('Elo', player.elo);
      table.newRow();
    });

    // Remove the table.sort() since we already sorted the array
    return { text: `\`\`\`\n${table.toString()}\`\`\`` };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return { text: 'Error fetching leaderboard' };
  }
}

// Display head-to-head stats
async function versusPlayer(messageData) {
  try {
    const username = extractUsername(messageData.text);
    
    if (!username) {
      return { text: 'Please provide a valid username' };
    }

    // Get opponent info by username
    const loserInfo = await findPlayerByUsername(username);

    if (!loserInfo) {
      return { text: `Player "${username}" not found. Use /add to add them first.` };
    }

    const [winnerInfo, games] = await Promise.all([
      getPlayerData(messageData.user_id),
      getAllGames()
    ]);

    if (!winnerInfo) {
      return { text: 'You need to be added to the leaderboard first. Use /add' };
    }

    const { wins, losses } = calculateHeadToHead(
      games,
      winnerInfo.name,
      loserInfo.name
    );

    const elo = new Elo();
    const expectedWinRate = (elo.odds(winnerInfo.elo, loserInfo.elo) * 100).toFixed(2);
    const totalGames = wins + losses;
    const actualWinRate = totalGames > 0 
      ? ((wins / totalGames) * 100).toFixed(2)
      : '0.00';

    return {
      text: `${winnerInfo.name} (${winnerInfo.elo}) vs. ${loserInfo.name} (${loserInfo.elo})\n\n` +
            `Wins: ${wins}\n` +
            `Losses: ${losses}\n` +
            `Games: ${totalGames}\n` +
            `Winrate: ${actualWinRate}%\n` +
            `Expected winrate: ${expectedWinRate}%`
    };
  } catch (error) {
    console.error('Error in versus player:', error);
    return { text: 'Error fetching player comparison' };
  }
}

// Calculate head-to-head record
function calculateHeadToHead(games, player1Name, player2Name) {
  return games.reduce((acc, game) => {
    if (game.winner.name === player1Name && game.loser.name === player2Name) {
      acc.wins++;
    } else if (game.winner.name === player2Name && game.loser.name === player1Name) {
      acc.losses++;
    }
    return acc;
  }, { wins: 0, losses: 0 });
}

// Helper: Extract username from text (strips @ symbol)
function extractUsername(text) {
  if (!text || !text.trim()) {
    return null;
  }
  
  const trimmed = text.trim();
  
  // Remove @ symbol if present and get first word
  const username = trimmed.replace('@', '').split(/\s+/)[0];
  
  return username || null;
}

// Helper: Find player by username
async function findPlayerByUsername(username) {
  try {
    const players = await getAllPlayers();
    return players.find(p => p.name.toLowerCase() === username.toLowerCase());
  } catch (error) {
    console.error('Error finding player by username:', error);
    return null;
  }
}

// Helper: Format player ELO display
function formatPlayerElo(player) {
  return `${shortName(player.name)} (${player.elo.old} → ${player.elo.new})`;
}

// Database queries
async function getPlayerData(playerId) {
  try {
    const params = {
      TableName: TABLES.PLAYERS,
      Key: { id: playerId }
    };
    const result = await documentClient.get(params).promise();
    return result.Item;
  } catch (error) {
    console.error('Error getting player data:', error);
    throw error;
  }
}

async function getAllPlayers() {
  try {
    const params = { TableName: TABLES.PLAYERS };
    const result = await documentClient.scan(params).promise();
    return result.Items;
  } catch (error) {
    console.error('Error scanning players:', error);
    throw error;
  }
}

async function getAllGames() {
  try {
    const params = { TableName: TABLES.GAMES };
    const result = await documentClient.scan(params).promise();
    return result.Items;
  } catch (error) {
    console.error('Error scanning games:', error);
    throw error;
  }
}
