Hooks.on('chatCommandsReady', function (chatCommands) {
	chatCommands.registerCommand(
		chatCommands.createCommandFromData({
			commandKey: '/as',
			shouldDisplayToChat: false,
			iconClass: 'fa-sticky-note',
			description: 'Makes the next messages be sent as the [speaker]. "/as" resets.',
			gmOnly: true,
		})
	);
	chatCommands.registerCommand(
		chatCommands.createCommandFromData({
			commandKey: '/describe',
			invokeOnCommand: (chatlog, messageText, chatdata) => NarratorTools.chatMessage.describe(messageText),
			shouldDisplayToChat: false,
			iconClass: 'fa-sticky-note',
			description: 'Display a description in chat',
			gmOnly: true,
		})
	);
	chatCommands.registerCommand(
		chatCommands.createCommandFromData({
			commandKey: '/narrate',
			invokeOnCommand: (chatlog, messageText, chatdata) => NarratorTools.chatMessage.narrate(messageText),
			shouldDisplayToChat: false,
			iconClass: 'fa-sticky-note',
			description: 'Narrate a message for all to see',
			gmOnly: true,
		})
	);
	chatCommands.registerCommand(
		chatCommands.createCommandFromData({
			commandKey: '/note',
			invokeOnCommand: (chatlog, messageText, chatdata) => NarratorTools.chatMessage.notify(messageText),
			shouldDisplayToChat: false,
			iconClass: 'fa-sticky-note',
			description: 'Display a note only visible to the DM',
			gmOnly: true,
		})
	);
});
