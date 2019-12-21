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

	if (messageData.command === '/lb') {
		let scanInfo;
		let t = new Table
		try {
			const scanParams = {
				TableName: "Players"
			}

			scanInfo = await documentClient.scan(scanParams).promise();
			console.log("scanInfo" + JSON.stringify(scanInfo))

			scanInfo.Items.forEach(p => {
				t.cell('Player', p.name.split('.')[0])
				t.cell('Wins', p.wins)
				t.cell('Losses', p.losses)
				t.cell('Games', p.wins + p.losses)
				t.cell('Winrate', (p.wins / (p.wins + p.losses) * 100).toFixed(2) + '%')
				t.cell('Elo', p.elo)
				t.newRow()
			})
			t.sort(['Elo|des'])
			console.log("t: " + t.toString())
		} catch (err) {
			console.log("caught error " + err);
		}

		const res = {
			statusCode: 200,
			body: JSON.stringify({ text: "```\n" + t.toString() + "```" })
		}
		callback(null, res)

	} else if (messageData.command === '/tg') {
		let gameInfo;
		let t = new Table
		
		try {
			const gameParams = {
				TableName: "Games"
			}

			gameInfo = await documentClient.scan(gameParams).promise();
			console.log("gameInfo" + JSON.stringify(gameInfo))

			gameInfo.Items.forEach(g => {
				if (Moment(g.datetime).format('L') == Moment(Moment.now()).format('L')) {
					t.cell('Time', Moment(g.datetime).format('LT'))
					t.cell('Winner', g.winner.name.split('.')[0] + ' (' + g.winner.elo.old + ' -> ' + g.winner.elo.new + ')')
					t.cell('Loser', g.loser.name.split('.')[0] + ' (' + g.loser.elo.old + ' -> ' + g.loser.elo.new + ')')
					t.newRow()
				}
			})
			// t.sort(['Elo|des'])
			console.log("t: " + t.toString())
		} catch (err) {
			console.log("caught error " + err);
		}

		const res = {
			statusCode: 200,
			body: JSON.stringify({ text: "```\n" + Moment(Moment.now()).format('L') + '\n' + t.toString() + "```" })
		}
		callback(null, res)



	} else if (messageData.command === '/gg') {
		const newElo = function (winner, loser) {
			let e = new Elo()
			const winnerNewElo = e.ifWins(winner, loser)
			const loserNewElo = e.ifLoses(loser, winner)

			return { "x": winnerNewElo, "y": loserNewElo };
		};

		let getInfo;
		let putParams = {
			TableName: "Players",
			Item: {}
		}

		try {
			const getParams = {
				TableName: "Players",
				Key: {
					"id": messageData.user_id
				}
			}

			getInfo = await documentClient.get(getParams).promise();
		} catch (err) {
			console.log("caught error " + err);
		}

		let loserId = messageData.text.trim().slice(2, 11)
		let loserName = messageData.text.trim().slice(12, messageData.text.trim().length - 1)

		console.log("loserId: " + JSON.stringify(loserId))

		let getInfo2;
		let putParams2 = {
			TableName: "Players",
			Item: {}
		}

		let e = {}

		try {
			const getParams2 = {
				TableName: "Players",
				Key: {
					"id": loserId
				}
			}

			getInfo2 = await documentClient.get(getParams2).promise();

			e = newElo(getInfo.Item ? Number(getInfo.Item.elo) : null, getInfo2.Item ? Number(getInfo2.Item.elo) : null)
			console.log("new elos: ", JSON.stringify(e))

			if (_.isEmpty(getInfo)) {
				putParams.Item = {
					"id": messageData.user_id,
					"name": messageData.user_name,
					"wins": 1,
					"losses": 0,
					"elo": 1000
				}
			} else {
				console.log("getInfo " + JSON.stringify(getInfo.Item.wins))
				putParams.Item = {
					"id": messageData.user_id,
					"name": messageData.user_name,
					"wins": Number(getInfo.Item.wins) + 1,
					"losses": Number(getInfo.Item.losses),
					"elo": Number(e.x)
				}
			}

			try {
				await documentClient.put(putParams).promise();
			} catch (err) {
				console.log(err);
			}

			///player 2

			if (_.isEmpty(getInfo2)) {
				putParams2.Item = {
					"id": loserId,
					"name": getInfo2.Item ? getInfo2.Item.name : "unknown",
					"wins": 0,
					"losses": 1,
					"elo": 1000
				}
			} else {
				console.log("getInfo2 " + JSON.stringify(getInfo2.Item.wins))
				putParams2.Item = {
					"id": loserId,
					"name": getInfo2.Item ? getInfo2.Item.name : "unknown",
					"wins": Number(getInfo2.Item.wins),
					"losses": Number(getInfo2.Item.losses) + 1,
					"elo": Number(e.y)
				}
			}

			try {
				await documentClient.put(putParams2).promise();
			} catch (err) {
				console.log(err);
			}

		} catch (err) {
			console.log("caught error " + err);
		}


		let gamePut = {
			TableName: "Games",
			Item: { 
				"id": Uuid(),
				"datetime": Moment.now(),
				"winner": {
					"name": getInfo.Item.name,
					"elo": {
						"old": getInfo.Item.elo || 1000,
						"new": e.x
					}
				},
				"loser": {
					"name": loserName,
					"elo": {
						"old": getInfo2.Item.elo || 1000,
						"new": e.y
					}
				}
			}
		}

		console.log("gamePut", gamePut)

		try {
			await documentClient.put(gamePut).promise();
		} catch (err) {
			console.log("game record error", err);
		}

		const res = {
			statusCode: 200,
			body: JSON.stringify({ text: getInfo.Item.name + ": " + getInfo.Item.elo + " -> " + e.x + "\n" + loserName + ": " + getInfo2.Item.elo + " -> " + e.y })

		}
		callback(null, res)
	}
}

// function decode(x) {
// 	var pairs = JSON.stringify(x).split('&');
// 	var result = {};
// 	pairs.forEach(function (pair) {
// 		pair = pair.split('=');
// 		result[pair[0]] = decodeURIComponent(pair[1] || '');
// 	});

// 	let o = JSON.stringify(result);
// 	console.log("result", o)
// 	return o
// }
// const bat = { icon_emoji: ':table_tennis_paddle_and_ball:' };
// const medal = { icon_emoji: ':sports_medal:' };
// const error = { icon_emoji: ':x:' };
// const wave = { icon_emoji: ':wave:' };

// const ddb = new AWS.DynamoDB();
// const documentClient = new AWS.DynamoDB.DocumentClient();

// const getParams = {
// 	TableName: "Players",
// 	Key: {
// 		"id": "12345"
// 	}
// }





// try {
// 	const data = await documentClient.put(putParams).promise();
// 	console.log(data);
// } catch (err) {
// 	console.log(err);
// }

// try {
// 	const data = await documentClient.get(getParams).promise();
// 	console.log(data);
// } catch (err) {
// 	console.log(err);
// }


// bot.on('start', () => {
// 	bot.postMessageToChannel('pong', 'Bot started', wave);
// });

// let leaderboard = new Map()

// bot.on('message', data => {
// 	if (data.type !== 'message') {
// 		return;
// 	}

// 	handleMessage(data.text);
// });

// function isUserId(s) {
// 	return _.startsWith(s, '<@')
// }

// function handleMessage(message) {
// 	if (_.startsWith(message, 'gg')) {
// 		const msg = _.split(message, ' ')

// 		if (msg.length == 3) {
// 			if (isUserId(msg[1]) && isUserId(msg[2])) {
// 				if (msg[1] != msg[2]) {
// 					if (leaderboard.has(msg[1])) {
// 						const cur = leaderboard.get(msg[1])
// 						cur.w++
// 						leaderboard.set(msg[1], cur)
// 					} else {
// 						leaderboard.set(msg[1], { w: 1, l: 0 })
// 					}

// 					if (leaderboard.has(msg[2])) {
// 						const cur = leaderboard.get(msg[2])
// 						cur.l++
// 						leaderboard.set(msg[2], cur)
// 					} else {
// 						leaderboard.set(msg[2], { w: 0, l: 1 })
// 					}
// 					bot.postMessageToChannel('pong', 'Game recorded. Well played, ' + msg[1], bat);

// 				} else {
// 					bot.postMessageToChannel('pong', 'Players must be unique', error);
// 				}
// 			} else {
// 				bot.postMessageToChannel('pong', 'Bad ID(s). Use @', error);
// 			}
// 		} else {
// 			bot.postMessageToChannel('pong', 'Use format `gg @winner @loser`', error);
// 		}
// 	}

// 	else if (_.startsWith(message, 'lb')) {

// 		bot.postMessageToChannel('pong', lb(), medal);
// 	}
// }

// function lb() {
// 	const t = new Table
// 	const m = new Map([...leaderboard].sort((a, b) => {
// 		return (a[1].w / (a[1].w + a[1].l)) < (b[1].w / (b[1].w + b[1].l))
// 	}))
// 	const ids = bot.getUsers()._value.members.map(x => ['<@' + x.id + '>', x.real_name])
// 	console.log(ids)

// 	for ([k, v] of m) {
// 		const kid = _.find(ids, i => i[0] == k)
// 		t.cell('Player', kid[1])
// 		t.cell('Games', v.w + v.l)
// 		t.cell('Wins', v.w)
// 		t.cell('Losses', v.l)
// 		t.cell('Winrate', (v.w / (v.w + v.l) * 100).toFixed(2) + '%')
// 		t.newRow()
// 	}
// 	console.log(t.toString())

// 	if (leaderboard.size)
// 		return '```\n' + t.toString() + '```'
// 	else
// 		return 'No games recorded'
// }
