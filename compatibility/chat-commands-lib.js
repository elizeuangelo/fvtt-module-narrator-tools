/**
 * https://foundryvtt.com/packages/_chatcommands
 */

import { MODULE } from '../module/const.mjs';

Hooks.on('chatCommandsReady', (commands) => {
	commands.register({
		name: '/as',
		module: MODULE,
		description: 'Makes the next messages be sent as the [speaker]. "/as" resets.',
		icon: '<i class="fas fa-sticky-note"></i>',
		requiredRole: 'GAMEMASTER',
		autocompleteCallback: () => [
			game.chatCommands.createInfoElement('Enter a character alias. Leave empty to reset.'),
		],
		closeOnComplete: true,
	});
	commands.register({
		name: '/describe',
		module: MODULE,
		description: 'Display a description in chat',
		icon: '<i class="fas fa-sticky-note"></i>',
		requiredRole: 'GAMEMASTER',
		autocompleteCallback: () => [game.chatCommands.createInfoElement('Enter a description.')],
		closeOnComplete: true,
	});
	commands.register({
		name: '/narrate',
		module: MODULE,
		description: 'Narrate a message for all to see',
		icon: '<i class="fas fa-sticky-note"></i>',
		requiredRole: 'GAMEMASTER',
		autocompleteCallback: () => [game.chatCommands.createInfoElement('Enter a narration.')],
		closeOnComplete: true,
	});
	commands.register({
		name: '/note',
		module: MODULE,
		description: 'Display a note only visible to the DM',
		icon: '<i class="fas fa-sticky-note"></i>',
		requiredRole: 'GAMEMASTER',
		autocompleteCallback: () => [game.chatCommands.createInfoElement('Enter a note.')],
		closeOnComplete: true,
	});
});
