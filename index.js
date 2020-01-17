'use strict'
const _ = require('lodash');
const Table = require('easy-table')
const AWS = require('aws-sdk')
const querystring = require('querystring')
const Elo = require('elo-js')
const Uuid = require('uuid')
const Moment = require('moment')

exports.handler = async (event, context, callback) => {
	const documentClient = new AWS.DynamoDB.DocumentClient();
	const messageData = querystring.parse(JSON.stringify(event.body))
	console.log("message: " + JSON.stringify(messageData))

	switch (messageData.command) {
		case '/lb':
			await leaderboard(documentClient, callback);
			break;
		case '/tg':
			await todaysGames(messageData, documentClient, callback);
			break;
		case '/gg':
			await recordWin(messageData, documentClient, callback);
			break;
		case '/wc':
			await winChance(messageData, documentClient, callback);
			break;
	}
}

async function recordWin(messageData, documentClient, callback) {
	const newElo = function (winner, loser) {
		let e = new Elo();
		const winnerNewElo = e.ifWins(winner, loser);
		const loserNewElo = e.ifLoses(loser, winner);
		return { "winner": winnerNewElo, "loser": loserNewElo };
	};
	let winnerInfo = await getPlayerData(messageData.user_id, documentClient);
	let winnerPutParams = {
		TableName: "Players",
		Item: {}
	};
	
	let loserId = messageData.text.trim().slice(2, 11);
	console.log("loserId: " + JSON.stringify(loserId));
	let loserInfo = await getPlayerData(loserId, documentClient);
	let loserPutParams = {
		TableName: "Players",
		Item: {}
	};
	let newElos = {};
	try {
		newElos = newElo(winnerInfo.Item ? Number(winnerInfo.Item.elo) : null, loserInfo.Item ? Number(loserInfo.Item.elo) : null);
		console.log("new elos: ", JSON.stringify(newElos));

		if (_.isEmpty(winnerInfo)) {
			winnerPutParams.Item = {
				"id": messageData.user_id,
				"name": messageData.user_name,
				"wins": 1,
				"losses": 0,
				"elo": 1000
			};
		}
		else {
			console.log("getInfo " + JSON.stringify(winnerInfo.Item.wins));
			winnerPutParams.Item = {
				"id": winnerInfo.Item.id,
				"name": winnerInfo.Item.name,
				"wins": Number(winnerInfo.Item.wins) + 1,
				"losses": Number(winnerInfo.Item.losses),
				"elo": Number(newElos.winner)
			};
		}
		try {
			await documentClient.put(winnerPutParams).promise();
		}
		catch (err) {
			console.log(err);
		}
		if (_.isEmpty(loserInfo)) {
			loserPutParams.Item = {
				"id": loserId,
				"name": loserInfo.Item ? loserInfo.Item.name : "unknown",
				"wins": 0,
				"losses": 1,
				"elo": 1000
			};
		}
		else {
			console.log("getInfo2 " + JSON.stringify(loserInfo.Item.wins));
			loserPutParams.Item = {
				"id": loserId,
				"name": loserInfo.Item ? loserInfo.Item.name : "unknown",
				"wins": Number(loserInfo.Item.wins),
				"losses": Number(loserInfo.Item.losses) + 1,
				"elo": Number(newElos.loser)
			};
		}
		try {
			await documentClient.put(loserPutParams).promise();
		}
		catch (err) {
			console.log(err);
		}
	}
	catch (err) {
		console.log("caught error " + err);
	}
	let gamePut = {
		TableName: "Games",
		Item: {
			"id": Uuid(),
			"datetime": Moment.now(),
			"winner": {
				"name": winnerInfo.Item.name,
				"elo": {
					"old": winnerInfo.Item.elo || 1000,
					"new": newElos.winner
				}
			},
			"loser": {
				"name": loserInfo.Item.name,
				"elo": {
					"old": loserInfo.Item.elo || 1000,
					"new": newElos.loser
				}
			}
		}
	};
	console.log("gamePut", gamePut);
	try {
		await documentClient.put(gamePut).promise();
	}
	catch (err) {
		console.log("game record error", err);
	}
	const res = {
		statusCode: 200,
		body: JSON.stringify({ text: winnerInfo.Item.name + ": " + winnerInfo.Item.elo + " -> " + newElos.winner + "\n" + loserInfo.Item.name + ": " + loserInfo.Item.elo + " -> " + newElos.loser })
	};
	callback(null, res);
}

async function todaysGames(messageData, documentClient, callback) {
	let chosenDay = messageData.text ? Moment(messageData.text, 'DDMMYY') : Moment.now();
	let gameInfo;
	let t = new Table;
	try {
		const gameParams = {
			TableName: "Games"
		};
		gameInfo = await documentClient.scan(gameParams).promise();
		console.log("gameInfo" + JSON.stringify(gameInfo));
		gameInfo.Items.forEach(g => {
			if (Moment(g.datetime).format('L') == Moment(chosenDay).format('L')) {
				t.cell('Time', Moment(g.datetime).format('HH:mm:ss'));
				t.cell('Winner', g.winner.name + ' (' + g.winner.elo.old + ' -> ' + g.winner.elo.new + ')');
				t.cell('Loser', g.loser.name + ' (' + g.loser.elo.old + ' -> ' + g.loser.elo.new + ')');
				t.newRow();
			}
		});
		t.sort(['Time|asc']);
		console.log("t: " + t.toString());
	}
	catch (err) {
		console.log("caught error " + err);
	}
	const res = {
		statusCode: 200,
		body: JSON.stringify({ text: "```\n" + Moment(chosenDay).format('dddd, DD/MM/GG') + '\n\n' + t.toString() + "```" })
	};
	callback(null, res);
}


async function leaderboard(documentClient, callback) {
	let scanInfo;
	let t = new Table;
	try {
		const scanParams = {
			TableName: "Players"
		};
		scanInfo = await documentClient.scan(scanParams).promise();
		console.log("scanInfo" + JSON.stringify(scanInfo));
		scanInfo.Items.forEach(p => {
			if (p.wins + p.losses != 0) {
				t.cell('Player', p.name);
				t.cell('Wins', p.wins);
				t.cell('Losses', p.losses);
				t.cell('Games', p.wins + p.losses);
				t.cell('Winrate', (p.wins / (p.wins + p.losses) * 100).toFixed(2) + '%');
				t.cell('Elo', p.elo);
				t.newRow();
			}
		});
		t.sort(['Elo|des']);
		console.log("t: " + t.toString());
	}
	catch (err) {
		console.log("caught error " + err);
	}
	const res = {
		statusCode: 200,
		body: JSON.stringify({ text: "```\n" + t.toString() + "```" })
	};
	callback(null, res);
}


async function winChance(messageData, documentClient, callback) {
	const loserId = messageData.text.trim().slice(2, 11);

	const winnerInfo = await getPlayerData(messageData.user_id, documentClient)
	const loserInfo = await getPlayerData(loserId, documentClient)

	const e = new Elo()
	const percentage = (e.odds(winnerInfo.Item.elo, loserInfo.Item.elo) * 100).toFixed(2);
	
	const res = {
		statusCode: 200,
		body: JSON.stringify({ text: percentage + "% chance to win vs. " + loserInfo.Item.name })
	};

	callback(null, res);
}

async function getPlayerData(playerId, documentClient) {
	let info;
	try {
		const getParams = {
			TableName: "Players",
			Key: {
				"id": playerId
			}
		};
		info = await documentClient.get(getParams).promise();

		return info;
	} 
	catch (err) {
		console.log("getPlayerData: caught error " + err);
	}
}

