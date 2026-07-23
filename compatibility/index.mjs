Hooks.once('setup', () => {
	if (game.modules.get('_chatcommands')) {
		import('./chat-commands-lib.js');
	}
});
