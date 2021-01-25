'use strict';
/**
 * Narrator Tools configuration menu
 */
class NarratorMenu extends FormApplication {
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: 'narrator-config',
			title: game.i18n.localize('NT.Title'),
			classes: ['sheet'],
			template: 'modules/narrator-tools/templates/config.html',
			width: 500,
		});
	}
	/**
	 * Get all game settings related to the form, to display them
	 * @param _options
	 */
	async getData(_options) {
		return {
			FontSize: game.settings.get('narrator-tools', 'FontSize'),
			WebFont: game.settings.get('narrator-tools', 'WebFont'),
			TextColor: game.settings.get('narrator-tools', 'TextColor'),
			TextShadow: game.settings.get('narrator-tools', 'TextShadow'),
			TextCSS: game.settings.get('narrator-tools', 'TextCSS'),
			Pause: game.settings.get('narrator-tools', 'Pause'),
			DurationMultiplier: game.settings.get('narrator-tools', 'DurationMultiplier'),
		};
	}
	/**
	 * Updates the settings to match the forms
	 * @param _event
	 * @param formData The form data to be saved
	 */
	async _updateObject(_event, formData) {
		for (let [k, v] of Object.entries(formData)) {
			game.settings.set('narrator-tools', k, v);
		}
		setTimeout(() => {
			NarratorTools._updateContentStyle();
			game.socket.emit('module.narrator-tools', { command: 'style' });
		}, 200);
	}
}
/* -------------------------------------------- */
/**
 * Primary object used by the Narrator Tools module
 */
const NarratorTools = {
	_element: $(
		'<div id="narrator" class="narrator"><div class="narrator-frame"><div class="narrator-frameBG"></div><div class="narrator-box"><div class="narrator-content"></div></div></div><div class="narrator-sidebarBG"></div><div class="narrator-bg"></div></div>'
	),
	/**
	 * Hooked function wich identifies if a message is a Narrator Tools command
	 * @param _message
	 * @param content   Message to be identified
	 * @param _data
	 */
	_chatMessage(_message, content, _data) {
		if (!game.user.isGM) return;
		const narrate = new RegExp('^(\\/narrat(?:e|ion)) ([^]*)', 'i');
		const description = new RegExp('^(\\/desc(?:ription)?(?:ribe)?) ([^]*)', 'i');
		const commands = {
			narrate: narrate,
			description: description,
		};
		// Iterate over patterns, finding the first match
		let c, rgx, match;
		for ([c, rgx] of Object.entries(commands)) {
			match = content.match(rgx);
			if (match) {
				this.createChatMessage(c, match[2]);
				return false;
			}
		}
	},
	/**Hook function wich creates the scenery button */
	_createSceneryButton(buttons) {
		let tokenButton = buttons.find((b) => b.name === 'token');
		if (tokenButton && game.user.isGM) {
			tokenButton.tools.push({
				name: 'scenery',
				title: 'NT.ButtonTitle',
				icon: 'fas fa-theater-masks',
				visible: game.user.isGM,
				toggle: true,
				active: this.sharedState.scenery,
				onClick: (toggle) => {
					this.scenery(toggle);
				},
			});
		}
	},
	/**Gets whats selected on screen */
	_getSelectionText() {
		const selection = window.getSelection();
		if (selection) return selection.toString();
	},
	/**
	 * Hides the journals context menu
	 * @param _e
	 */
	_hideContextMenu(_e) {
		NarratorTools._menu.hide();
		document.removeEventListener('click', NarratorTools._hideContextMenu);
	},
	/**
	 * Loads a specific font from the Google Fonts web page
	 * @param font Google font to load
	 */
	_loadFont(font) {
		$('#narratorWebFont').remove();
		if (font == '') return;
		const linkRel = $(
			`<link id="narratorWebFont" href="https://fonts.googleapis.com/css2?family=${font}&display=swap" rel="stylesheet" type="text/css" media="all">`
		);
		$('head').append(linkRel);
	},
	//@ts-ignore
	_menu: null,
	_pause() {
		if (game.user.isGM && game.settings.get('narrator-tools', 'Pause')) {
			NarratorTools.scenery(game.paused);
		}
	},
	/**Initialization routine for 'ready' hook */
	_ready() {
		$(document.getElementById('chat-log')).on('click', '.message.narrator-chat', NarratorTools._onClickMessage.bind(NarratorTools));
		game.socket.on('module.narrator-tools', NarratorTools._onMessage.bind(NarratorTools));
		if (!game.user.isGM) {
			game.socket.emit('module.narrator-tools', { command: 'update' });
		}
		//@ts-ignore
		NarratorTools._menu = new ContextMenuNT({
			theme: 'default',
			items: [
				{
					icon: 'comment',
					name: 'Describe',
					action: () => {
						const selection = NarratorTools._getSelectionText();
						if (selection) NarratorTools.chatMessage.describe(selection);
					},
				},
				{
					icon: 'comment-dots',
					name: 'Narrate',
					action: () => {
						const selection = NarratorTools._getSelectionText();
						if (selection) NarratorTools.chatMessage.narrate(selection);
					},
				},
			],
		});
		NarratorTools._loadFont(game.settings.get('narrator-tools', 'WebFont'));
		NarratorTools._updateContentStyle();
		NarratorTools._pause();
	},
	/**Initialization routine for 'setup' hook */
	_setup() {
		this.elements = {
			/**Main Element */
			narrator: this._element,
			frame: this._element.find('.narrator-frame'),
			frameBG: this._element.find('.narrator-frameBG'),
			sidebarBG: this._element.find('.narrator-sidebarBG'),
			BG: this._element.find('.narrator-bg'),
			box: this._element.find('.narrator-box'),
			content: this._element.find('.narrator-content'),
		};
		this._fitSidebar();
		$('body').append(this._element);
		// Game Settings
		// The shared state of the Narrator Tools application, emitted by the DM across all players
		// Q:   Why use a setting instead of sockets?
		// A:   So there is memory. The screen will only update with the DM present and remain in that state.
		//      For instance, the DM might leave the game with a message on screen.
		//      There should be no concurrency between sockets and this config,
		//      so we eliminated sockets altogether.
		game.settings.register('narrator-tools', 'sharedState', {
			name: 'NT.state',
			scope: 'world',
			config: false,
			default: {
				/**Displays information about whats happening on screen */
				narration: {
					display: false,
					message: '',
					paused: false,
				},
				/**If the background scenery is on or off */
				scenery: false,
			},
		});
		// Register the application menu
		game.settings.registerMenu('narrator-tools', 'settingsMenu', {
			name: 'NT.CfgName',
			label: 'NT.CfgLabel',
			icon: 'fas fa-adjust',
			type: NarratorMenu,
			restricted: true,
		});
		// Menu options
		game.settings.register('narrator-tools', 'FontSize', {
			name: 'Font Size',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register('narrator-tools', 'WebFont', {
			name: 'Web Font',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (value) => NarratorTools._loadFont(value),
		});
		game.settings.register('narrator-tools', 'TextColor', {
			name: 'Text Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register('narrator-tools', 'TextShadow', {
			name: 'Text Shadow',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register('narrator-tools', 'TextCSS', {
			name: 'TextCSS',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register('narrator-tools', 'Pause', {
			name: 'Pause',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register('narrator-tools', 'DurationMultiplier', {
			name: 'Duration Multiplier',
			scope: 'world',
			config: false,
			default: 1,
			type: Number,
		});
	},
	/**Specify how the module's messages will be intepreted by foundry and other modules:
	 * OTHER: 0, OOC: 1, IC: 2, EMOTE: 3, WHISPER: 4, ROLL: 5
	 */
	_msgtype: 0,
	/**
	 * Opens the narrator on screen
	 * @param content   Message displayed
	 * @param duration  Duration
	 */
	_narrationOpen(content, duration) {
		this.elements.content.text(content);
		const durationMulti = game.settings.get('narrator-tools', 'DurationMultiplier');
		const height = Math.min(this.elements.content.height() ?? 0, 310);
		this.elements.BG.height(height * 3);
		this.elements.content.stop();
		this.elements.content[0].style.top = '0px';
		this.elements.BG[0].style.opacity = '1';
		this.elements.content[0].style.opacity = '1';
		let scroll = this.narratorContent.height() - 310;
		clearTimeout(this._timeouts.narrationScrolls);
		if (scroll > 0) {
			this._timeouts.narrationScrolls = setTimeout(() => {
				this.elements.content.animate({ top: -scroll }, duration - (5000 * durationMulti + 500), 'linear');
			}, 3000 * durationMulti);
		}
	},
	/**Closes the narrator screen */
	_narrationClose() {
		this.elements.BG[0].style.opacity = '0';
		this.elements.content[0].style.opacity = '0';
	},
	/**
	 * Behavior when a chat message is clicked
	 * @param event The event wich triggered the handler
	 */
	_onClickMessage(event) {
		if (event && event.target.classList.contains('narrator-chat')) {
			//@ts-ignore
			const roll = $(event.currentTarget);
			const tip = roll.find('.message-metadata');
			if (!tip.is(':visible')) tip.slideDown(200);
			else tip.slideUp(200);
		}
	},
	/**
	 * Process any received messages from the socket
	 * @param data Command and value to be addressed by the corresponding function
	 */
	_onMessage(data) {
		const commands = {
			scenery: function () {
				NarratorTools.sharedState.scenery = data.value;
				NarratorTools._updateScenery();
			},
			style: function () {
				NarratorTools._updateContentStyle();
			},
			update: function () {
				if (game.user.isGM) {
					game.socket.emit('module.narrator-tools', { command: 'scenery', value: NarratorTools.sharedState.scenery });
				}
			},
		};
		commands[data.command]();
	},
	/**
	 * Renders the chat message and sets out the message behavior
	 * @param message Message object to be rendered
	 * @param html HTML element of the message
	 * @param _data
	 */
	_renderChatMessage(message, html, _data) {
		if (html.find('.narrator-span').length) {
			html.find('.message-sender').text('');
			html.find('.message-metadata')[0].style.display = 'none';
			html[0].classList.add('narrator-chat');
			if (html.find('.narration').length) {
				html[0].classList.add('narrator-narrative');
				const timestamp = new Date().getTime();
				if (message.data.timestamp + 2000 > timestamp) {
					const content = $(message.data.content)[0].textContent;
					let duration = this.messageDuration(content.length);
					clearTimeout(this._timeouts.narrationCloses);
					this.elements.content[0].style.opacity = '0';
					this._timeouts.narrationOpens = setTimeout(this._narrationOpen.bind(this, content, duration), 500);
					this._timeouts.narrationCloses = setTimeout(this._narrationClose.bind(this), duration);
				}
			} else {
				html[0].classList.add('narrator-description');
			}
		}
	},
	/**
	 * Hook wich triggers when the journal sheet is rendered
	 * @param _journalSheet
	 * @param html
	 */
	_renderJournalSheet(_journalSheet, html) {
		let editor = '.editor-content';
		// Identifies if there is a Easy MDE Container
		const MDEContainer = html.find('.EasyMDEContainer').length;
		if (MDEContainer) editor = '.editor-preview-active';
		// Sets a timeout in case there is problem concurrency with other modules
		setTimeout(
			() =>
				html.find(editor).on('contextmenu', (e) => {
					e.preventDefault();
					const time = this._menu.isOpen() ? 100 : 0;
					this._menu.hide();
					setTimeout(() => {
						this._menu.show(e.pageX, e.pageY);
					}, time);
					document.addEventListener('click', NarratorTools._hideContextMenu, false);
				}),
			0
		);
	},
	/**Resize the sidebarBG and frame elements to match the sidebars size */
	_fitSidebar() {
		const sidebarWidth = $('body').find('.app.collapsed').length ? 0 : 305;
		this.elements.sidebarBG.width(sidebarWidth);
		this.elements.frame.width(`calc(100% - ${sidebarWidth}px)`);
	},
	/**Object containing all the timeouts called by their numbers */
	_timeouts: {
		narrationOpens: 0,
		narrationCloses: 0,
		narrationScrolls: 0,
	},
	/**Update the content element style to match the settings */
	_updateContentStyle() {
		const style = game.settings.get('narrator-tools', 'TextCSS');
		if (style) {
			const opacity = this.elements.content[0].style.opacity;
			//@ts-ignore
			this.elements.content[0].style = style;
			this.elements.content[0].style.opacity = opacity;
			return;
		}
		this.elements.content[0].style.fontFamily = `${game.settings.get('narrator-tools', 'WebFont')}`;
		this.elements.content[0].style.fontSize = `${game.settings.get('narrator-tools', 'FontSize')}`;
		this.elements.content[0].style.color = `${game.settings.get('narrator-tools', 'TextColor')}`;
		this.elements.content[0].style.textShadow = `${game.settings.get('narrator-tools', 'TextShadow')}`;
	},
	/**Updates the background opacity to match the scenery */
	_updateScenery() {
		this.elements.frameBG[0].style.opacity = this.sharedState.scenery ? '1' : '0';
		this.elements.sidebarBG[0].style.opacity = this.sharedState.scenery ? '1' : '0';
	},
	/**Shortcut object for creating chat messages */
	chatMessage: {
		/**
		 * Create a 'narration' chat message
		 * @param message
		 */
		narrate(message) {
			return NarratorTools.createChatMessage('narrate', message);
		},
		/**
		 * Create a 'description' chat message
		 * @param message
		 */
		describe(message) {
			return NarratorTools.createChatMessage('describe', message);
		},
	},
	/**
	 * Create a chat message of the specified type
	 * @param type     'narrate' for narrations or anything else for descriptions
	 * @param message
	 */
	createChatMessage(type, message) {
		// Patch the chat appearance to conform with specific modules
		let csspatches = '';
		if (game.modules.get('pathfinder-ui') !== undefined && game.modules.get('pathfinder-ui').active) {
			csspatches += 'sasmira-uis-fix';
		} else if (game.modules.get('dnd-ui') !== undefined && game.modules.get('dnd-ui').active) {
			csspatches += 'sasmira-uis-fix';
		}
		const chatData = {
			content: `<span class="narrator-span ${type == 'narrate' ? 'narration' : 'description'} ${csspatches}">${message.replace(
				/\\n|<br>/g,
				'\n'
			)}</span>`,
			type: this._msgtype,
			speaker: {
				alias: game.i18n.localize('NT.Narrator'),
				scene: game.user.viewedScene,
			},
		};
		ChatMessage.create(chatData, {});
	},
	/**Shortcuts for easy access of the elements of the module */
	elements: {},
	/**
	 * Returns the calculated duration a string of length size would have
	 * @param length    The lenght of the string
	 */
	messageDuration(length) {
		//@ts-ignore
		return (Math.clamped(2000, length * 80, 20000) + 3000) * game.settings.get('narrator-tools', 'DurationMultiplier') + 500;
	},
	/**
	 * Set the background scenery and calls all clients
	 * @param state True to turn on the scenery, false to turn off
	 */
	scenery(state) {
		if (game.user.isGM) {
			this.sharedState.scenery = state ?? !this.sharedState.scenery;
			this._updateScenery();
			game.socket.emit('module.narrator-tools', { command: 'scenery', value: this.sharedState.scenery });
			const btn = $('.control-tool[title=Scenery]')[0].classList.contains('active');
			//@ts-ignore
			const tool = ui.controls.controls[0].tools.find((tool) => tool.name === 'scenery');
			if (this.sharedState.scenery) {
				$('.control-tool[title=Scenery]')[0].classList.add('active');
				tool.active = true;
			} else {
				$('.control-tool[title=Scenery]')[0].classList.remove('active');
				tool.active = false;
			}
		}
	},
	/**The shared state of the Narrator Tools application, emitted by the DM across all players */
	sharedState: {
		/**Displays information about whats happening on screen */
		narration: {
			display: false,
			message: '',
			paused: false,
		},
		/**If the background scenery is on or off */
		scenery: false,
	},
};
/* -------------------------------------------- */
Hooks.on('setup', () => NarratorTools._setup());
Hooks.on('ready', () => NarratorTools._ready());
Hooks.on('chatMessage', NarratorTools._chatMessage.bind(NarratorTools)); // This hook spans the chatmsg
Hooks.on('renderChatMessage', NarratorTools._renderChatMessage.bind(NarratorTools)); // This hook changes the chat message in case its a narration + triggers
Hooks.on('getSceneControlButtons', NarratorTools._createSceneryButton.bind(NarratorTools));
Hooks.on('sidebarCollapse', NarratorTools._fitSidebar.bind(NarratorTools));
Hooks.on('renderJournalSheet', NarratorTools._renderJournalSheet.bind(NarratorTools));
Hooks.on('pauseGame', (_pause) => NarratorTools._pause());
