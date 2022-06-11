Hooks.on('chatCommandsReady', function (chatCommands) {
	// (GM Only) This Command will display the text after the command as well as invoke the method
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
			commandKey: '/describe',
			invokeOnCommand: (chatlog, messageText, chatdata) => NarratorTools.chatMessage.narrate(messageText),
			shouldDisplayToChat: false,
			iconClass: 'fa-sticky-note',
			description: 'Display a description in chat',
			gmOnly: true,
		})
	);
});
