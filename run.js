// const { App } = require('@slack/bolt');

// Initializes your app with your bot token and signing secret
// const app = new App({
// 	token: 'xoxb-795247320881-802044897232-SXlSvBrbZiUbQI8j7wM13I1s',
// 	signingSecret: 'c154a6a81d579c2daa6632e9e955c6d4'
// });

const SlackBot = require('slackbots');
const _ = require('lodash');

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

// Start Handler
bot.on('start', () => {


	bot.postMessageToChannel(
		'pong',
		'gamer time',
		bat
	);
});

let leaderboard = new Map()// Error Handler
// bot.on('error', err => console.log(err));
leaderboard.set('UPK6JSKNY', { w: 0, l: 0 })
leaderboard.set('AAAAAAAAA', { w: 9, l: 20 })

// Message Handler
bot.on('message', data => {
	console.log('data:', data)
	if (data.type !== 'message') {
		return;
	}

	handleMessage(data.text);
});

// Respons to Data
function handleMessage(message) {
	if (message.includes('gg')) {
		const msg = _.words(message)
		bot.postMessageToChannel('pong', (msg[1] + ' ' + msg[2]), bat);
	}

	else if (message.includes('lb')) {
		bot.postMessageToChannel('pong', lb(), medal);
	}
}

function lb() {
	let s = '```\n'
	for ([k, v] of leaderboard) {
		s += (k + ' Wins: ' + v.w + ' Losses: ' + v.l + ' Winrate: ' + (v.w / (v.w + v.l) * 100) + '%\n')
	}
	return s + '```'
}
