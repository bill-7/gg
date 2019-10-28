// const { App } = require('@slack/bolt');

// Initializes your app with your bot token and signing secret
// const app = new App({
// 	token: 'xoxb-795247320881-802044897232-SXlSvBrbZiUbQI8j7wM13I1s',
// 	signingSecret: 'c154a6a81d579c2daa6632e9e955c6d4'
// });

const SlackBot = require('slackbots');
const _ = require('lodash');
const Table = require('easy-table')


// const axios = require('axios');

const bot = new SlackBot({
	token: 'xoxb-795247320881-802044897232-SXlSvBrbZiUbQI8j7wM13I1s',
	name: 'gg'
});

const bat = {
	icon_emoji: ':table_tennis_paddle_and_ball:'
};

const medal = {
	icon_emoji: ':sports_medal:'
};

bot.on('start', () => {
	bot.postMessageToChannel('pong', ':wave:', bat);
});

let leaderboard = new Map()

bot.on('message', data => {
	if (data.type !== 'message') {
		return;
	}

	handleMessage(data.text);
});

function handleMessage(message) {
	if (_.startsWith(message, 'gg')) {

		const msg = _.split(message, ' ')
		if (msg.length == 3) {
			console.log(message, msg[1], msg[2])
			if (leaderboard.has(msg[1])) {
				const cur = leaderboard.get(msg[1])
				cur.w++
				leaderboard.set(msg[1], cur)
			} else {
				leaderboard.set(msg[1], { w: 1, l: 0 })
			}

			if (leaderboard.has(msg[2])) {
				const cur = leaderboard.get(msg[2])
				cur.l++
				leaderboard.set(msg[2], cur)
			} else {
				leaderboard.set(msg[2], { w: 0, l: 1 })
			}

			bot.postMessageToChannel('pong', `gg`, bat);
		}
	}

	else if (_.startsWith(message, 'lb')) {
		bot.postMessageToChannel('pong', lb(), medal);
	}
}

function lb() {
	const t = new Table

	for ([k, v] of leaderboard) {
		// s += (k + ' Wins: ' + v.w + '   Losses: ' + v.l + '   Winrate: ' + (v.w / (v.w + v.l) * 100).toFixed(2) + '%\n')
		t.cell('Player', k)
		t.cell('Wins', v.w)
		t.cell('Losses', v.l)
		t.cell('Winrate', (v.w / (v.w + v.l) * 100).toFixed(2) + '%')
		t.newRow()
	}
	console.log(t.toString())

	// let s = '```\n'
	// for ([k, v] of leaderboard) {
	// 	s += (k + ' Wins: ' + v.w + '   Losses: ' + v.l + '   Winrate: ' + (v.w / (v.w + v.l) * 100).toFixed(2) + '%\n')
	// }
	// return s + '```'
	return '```\n' + t.toString() + '\n```'
}
