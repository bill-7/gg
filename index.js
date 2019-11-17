
const SlackBot = require('slackbots');
const _ = require('lodash');
const Table = require('easy-table')
const AWS = require('aws-sdk')



// class Player {
// 	constructor(name, w) {
// 		this.name = name
// 		if (w) {
// 			this.wins = 1
// 			this.losses = 0
// 			this.elo = 1000
// 		}
// 	}

// }



exports.handler = async (event, context, callback) => {

	// const bot = new SlackBot({
	// 	token: 'xoxb-795247320881-802044897232-SXlSvBrbZiUbQI8j7wM13I1s',
	// 	name: 'gg'
	// });
	console.log("event", JSON.stringify(event))

	console.log("event.body", JSON.stringify(event.body))

	var x = "token=NiWlkGJRC4KZvzQb0v6p0Yz9&team_id=TPD799ERX&team_domain=test-rpg9146&channel_id=CPG4F21K4&channel_name=pong&user_id=UPK6JSKNY&user_name=billycuthbert74&command=%2Fw&text=%3C%40UPK6JSKNY%7Cbillycuthbert74%3E&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FTPD799ERX%2F838012086469%2F0zQ0uuA8GRNV2jhcyUyigstN&trigger_id=826533339827.795247320881.30095e44a76e3fa3a8ff4683b5c4a838"

	var pairs = JSON.stringify(event.body).split('&');
	var result = {};
	pairs.forEach(function (pair) {
		pair = pair.split('=');
		result[pair[0]] = decodeURIComponent(pair[1] || '');
	});

	let o = JSON.stringify(result);
	console.log("result", o)

	return response = {
		statusCode: 200,
		body: o

	}
}
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

// const putParams = {
// 	TableName: "Players",
// 	Item: {
// 		"id": "76575656765",
// 		"name": "player_name",
// 		"wins": 1,
// 		"losses": 0,
// 		"elo": 1000
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
