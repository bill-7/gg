
const SlackBot = require('slackbots');
const _ = require('lodash');
const Table = require('easy-table')

const bot = new SlackBot({
	token: 'xoxb-795247320881-802044897232-SXlSvBrbZiUbQI8j7wM13I1s',
	name: 'gg'
});

const bat = { icon_emoji: ':table_tennis_paddle_and_ball:' };
const medal = { icon_emoji: ':sports_medal:' };
const error = { icon_emoji: ':x:' };
const wave = { icon_emoji: ':wave:' };

bot.on('start', () => {
	bot.postMessageToChannel('pong', 'Bot started', wave);
});

let leaderboard = new Map()

bot.on('message', data => {
	if (data.type !== 'message') {
		return;
	}

	handleMessage(data.text);
});

function isUserId(s) {
	return _.startsWith(s, '<@')
}

function handleMessage(message) {
	if (_.startsWith(message, 'gg')) {
		const msg = _.split(message, ' ')

		if (msg.length == 3) {
			if (isUserId(msg[1]) && isUserId(msg[2])) {
				if (msg[1] != msg[2]) {
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
					bot.postMessageToChannel('pong', 'Game recorded. Well played, ' + msg[1], bat);

				} else {
					bot.postMessageToChannel('pong', 'Players must be unique', error);
				}
			} else {
				bot.postMessageToChannel('pong', 'Bad ID(s). Use @', error);
			}
		} else {
			bot.postMessageToChannel('pong', 'Use format `gg @winner @loser`', error);
		}
	}

	else if (_.startsWith(message, 'lb')) {
		bot.postMessageToChannel('pong', lb(), medal);
	}
}

function lb() {
	const t = new Table
	const m = new Map([...leaderboard].sort((a, b) => {
		return (a[1].w / (a[1].w + a[1].l)) < (b[1].w / (b[1].w + b[1].l))
	}))
	const ids = bot.getUsers()._value.members.map(x => ['<@' + x.id + '>', x.real_name])

	for ([k, v] of m) {
		const kid = _.find(ids, i => i[0] == k)
		t.cell('Player', kid[1])
		t.cell('Games', v.w + v.l)
		t.cell('Wins', v.w)
		t.cell('Losses', v.l)
		t.cell('Winrate', (v.w / (v.w + v.l) * 100).toFixed(2) + '%')
		t.newRow()
	}
	console.log(t.toString())

	if (leaderboard.size)
		return '```\n' + t.toString() + '```'
	else
		return 'No games recorded'
}
