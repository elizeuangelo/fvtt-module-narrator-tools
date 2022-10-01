/** Declarations */
declare interface LenientGlobalVariableTypes {
	game: never; // the type doesn't matter
	ui: never;
	socket: never;
}

/**Interface of the narration state */
interface NarrationState {
	id: number;
	display: boolean;
	message: string;
	paused: boolean;
}

const MODULE = 'narrator-tools';

/* -------------------------------------------- */
/**
 * Narrator Tools configuration menu
 */
class NarratorMenu extends FormApplication<FormApplicationOptions, any> {
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: 'narrator-config',
			title: game.i18n.localize('NT.Title'),
			classes: ['sheet'],
			template: 'modules/narrator-tools/templates/config.html',
			width: 800,
		});
	}
	/**
	 * Get all game settings related to the form, to display them
	 * @param _options
	 */
	async getData(_options: any) {
		return {
			FontSize: game.settings.get(MODULE, 'FontSize'),
			WebFont: game.settings.get(MODULE, 'WebFont'),
			TextColor: game.settings.get(MODULE, 'TextColor'),
			TextShadow: game.settings.get(MODULE, 'TextShadow'),
			TextCSS: game.settings.get(MODULE, 'TextCSS'),
			Copy: game.settings.get(MODULE, 'Copy'),
			Pause: game.settings.get(MODULE, 'Pause'),
			DurationMultiplier: game.settings.get(MODULE, 'DurationMultiplier'),
			BGColor: game.settings.get(MODULE, 'BGColor'),
			BGImage: game.settings.get(MODULE, 'BGImage'),
			NarrationStartPaused: game.settings.get(MODULE, 'NarrationStartPaused'),
			MessageType: game.settings.get(MODULE, 'MessageType'),
			CHAT_MESSAGE_TYPES: {
				0: 'Other',
				1: 'Out of Character',
				2: 'In Character',
			},
			PERMScenery: game.settings.get(MODULE, 'PERMScenery'),
			PERMDescribe: game.settings.get(MODULE, 'PERMDescribe'),
			PERMNarrate: game.settings.get(MODULE, 'PERMNarrate'),
			PERMAs: game.settings.get(MODULE, 'PERMAs'),
			USER_ROLES: {
				0: game.i18n.localize('USER.RoleNone'),
				1: game.i18n.localize('USER.RolePlayer'),
				2: game.i18n.localize('USER.RoleTrusted'),
				3: game.i18n.localize('USER.RoleAssistant'),
				4: game.i18n.localize('USER.RoleGamemaster'),
			},
		};
	}
	/**
	 * Updates the settings to match the forms
	 * @param _event
	 * @param formData The form data to be saved
	 */
	async _updateObject(_event: Event, formData: { [key: string]: any }) {
		for (let [k, v] of Object.entries(formData)) {
			game.settings.set(MODULE, k, v);
		}
		setTimeout(() => {
			NarratorTools._updateContentStyle();
			game.socket?.emit('module.narrator-tools', { command: 'style' });
		}, 200);
	}
}

/* -------------------------------------------- */
/**
 * Primary object used by the Narrator Tools module
 */
const NarratorTools = {
	_element: $(
		'<div id="narrator" class="narrator"><div class="narrator-bg"></div><div class="narrator-frame"><div class="narrator-frameBG"></div><div class="narrator-box"><div class="narrator-content"></div></div><div class="narrator-buttons" style="opacity:0;"><button class="NT-btn-pause"></button><button class="NT-btn-close"></button></button><button class="NT-btn-clipboard"></button></div></div><div class="narrator-sidebarBG"></div>'
	),
	/**
	 * Here is where a custom speaker is stored, if you change the value to anything other than '' the next messages will speak as such
	 */
	character: '',
	/**
	 * Hooked function wich identifies if a message is a Narrator Tools command
	 * @param message
	 * @param content   Message to be identified
	 * @param chatData
	 */
	_chatMessage(message: any, content: string, chatData: any) {
		let commands: { [key: string]: RegExp } = {};
		content = content.replace(/\n/g, '<br>');

		if (game.user!.role >= (game.settings.get(MODULE, 'PERMAs') as number)) {
			commands.as = new RegExp('^(?:\\/as$|\\/as ([^]*))', 'i');
		}
		if (game.user!.role >= (game.settings.get(MODULE, 'PERMDescribe') as number)) {
			commands.description = new RegExp('^\\/desc(?:ribe|ription|) ([^]*)', 'i');
			commands.notification = new RegExp('^\\/not(?:e|ify|ication) ([^]*)', 'i');
		}
		if (game.user!.role >= (game.settings.get(MODULE, 'PERMNarrate') as number)) {
			commands.narration = new RegExp('^\\/narrat(?:e|ion) ([^]*)', 'i');
		}

		// Iterate over patterns, finding the first match
		let c: string, rgx: RegExp, match: RegExpMatchArray | null;
		for ([c, rgx] of Object.entries(commands)) {
			match = content.match(rgx);
			if (match) {
				if (c == 'as') {
					if (match[1]) {
						this.character = match[1];
						($('#chat-message')[0] as HTMLInputElement).placeholder = game.i18n.localize('NT.SpeakingAs') + ' ' + this.character;
					} else {
						this.character = '';
						($('#chat-message')[0] as HTMLInputElement).placeholder = '';
					}
				} else {
					if (c == 'narration' && !game.user!.hasPermission('SETTINGS_MODIFY')) ui.notifications.error(game.i18n.localize('NT.CantModifySettings'));
					else this.createChatMessage(c, match[1]);
				}
				return false;
			}
		}
	},
	/**
	 * Control the module behavior in response to a change in the sharedState
	 * @param state The new application state
	 */
	_controller({ narration, scenery }: { narration: NarrationState; scenery: boolean }) {
		/**First, we manage the scenery changes */
		this._updateScenery(scenery);
		if (game.user!.role >= (game.settings.get(MODULE, 'PERMScenery') as number)) {
			const btn = $('.scene-control[data-tool=scenery]');
			if (btn) {
				if (scenery) btn[0].classList.add('active');
				else btn[0].classList.remove('active');
			}
		}

		/**If a narration had ocurred and the display now is still on, turn it off */
		if (!narration.display && this.elements.content[0].style.opacity === '1') {
			this.elements.BG.height(0);
			this.elements.buttons[0].style.opacity = '0';
			this.elements.buttons[0].style.visibility = 'hidden';
		}

		/**If the message suddenly disappears, turn off the opacity */
		if (!narration.message) {
			this.elements.content[0].style.opacity = '0';
		}

		if (narration.display) {
			const scroll = () => {
				if (!this.sharedState.narration.paused) {
					let scroll = (this.elements.content.height() ?? 0) - 290; // 310
					let duration = this.messageDuration(this.sharedState.narration.message.length);

					/**If the narration is open */
					if (scroll > 20) {
						const remaining = 1 - Number(this.elements.content[0].style.top.slice(0, -2)) / -scroll;
						const duration_multiplier = game.settings.get(MODULE, 'DurationMultiplier') as number;
						const scroll_duration = (duration - 500 - 4500 * duration_multiplier) * remaining;
						const fun_scroll = () => {
							this.elements.content.animate({ top: -scroll }, scroll_duration, 'linear');
							this._timeouts.narrationScrolls = 0;
						};
						if (this.elements.content[0].style.top == '0px') {
							this._timeouts.narrationScrolls = +setTimeout(fun_scroll, 3000 * duration_multiplier);
						} else {
							fun_scroll();
							duration = scroll_duration + 4500 * duration_multiplier;
						}
					}

					if (this.isNarrator) {
						if (this._timeouts.narrationCloses) {
							clearTimeout(this._timeouts.narrationCloses);
							this._timeouts.narrationCloses = 0;
						}
						this._timeouts.narrationCloses = +setTimeout(NarratorTools._narrationClose, duration);
					}
				}
			};

			/** If the display is on and the narration.id is a new one, it means a new narration is taking place */
			if (narration.id !== this._id) {
				this._id = narration.id;
				clearTimeout(this._timeouts.narrationOpens);
				this.elements.content[0].style.opacity = '0';
				this.elements.content.stop();

				// Sets the copy button display in accordance to the configuration
				this.elements.buttonCopy[0].style.display = game.settings.get(MODULE, 'Copy') ? '' : 'none';

				this._timeouts.narrationOpens = +setTimeout(() => {
					this.elements.content.html(narration.message);
					this.elements.content[0].style.opacity = '1';
					this.elements.content[0].style.top = '0px';

					const height = Math.min(this.elements.content.height() ?? 0, 310);
					this.elements.BG.height(height * 3);

					this.elements.buttons[0].style.opacity = '1';
					this.elements.buttons[0].style.visibility = 'visible';
					this.elements.buttons[0].style.top = `calc(50% + ${60 + height / 2}px)`;
					this._updateStopButton(game.settings.get(MODULE, 'NarrationStartPaused') as boolean);

					this._timeouts.narrationOpens = 0;
					Hooks.call('narration', narration);
				}, 500);

				Hooks.once('narration', scroll);
			} else {
				/** If narration is paused, stop animation and clear timeouts */
				if (narration.paused) {
					if (this._timeouts.narrationScrolls) {
						clearTimeout(this._timeouts.narrationScrolls);
						this._timeouts.narrationScrolls = 0;
					}
					this.elements.content.stop();
					if (this._timeouts.narrationCloses) {
						clearTimeout(this._timeouts.narrationCloses);
						this._timeouts.narrationCloses = 0;
					}
				} else {
					scroll();
				}
			}
		}
	},
	/**Hook function wich creates the scenery button */
	_createSceneryButton(control: Application, html: JQuery, data: any) {
		const hasPerm = game.user!.role >= (game.settings.get(MODULE, 'PERMScenery') as number);
		if (hasPerm) {
			const name = 'scenery';
			const title = game.i18n.localize('NT.ButtonTitle');
			const icon = 'fas fa-theater-masks';
			const active = this.sharedState.scenery;
			const btn = $(`<li class="scene-control toggle ${active ? 'active' : ''}" title="${title}" data-tool="${name}"><i class="${icon}"></i></li>`);
			btn.on('click', () => this.scenery());
			html.find('.main-controls').append(btn);
		}
	},
	/**Gets whats selected on screen */
	_getSelectionText() {
		let html = '';
		const selection = window.getSelection();
		if (selection?.rangeCount && !selection.isCollapsed) {
			const fragments = selection.getRangeAt(0).cloneContents();
			const size = fragments.childNodes.length;
			for (let i = 0; i < size; i++) {
				if (fragments.childNodes[i].nodeType == fragments.TEXT_NODE) html += (fragments.childNodes[i] as Text).wholeText;
				else html += (fragments.childNodes[i] as Element).outerHTML;
			}
		}
		return html;
	},
	/**The id of the last narration update */
	_id: 0,
	/**
	 * Loads a custom font for the narration style
	 * @param font Font to load
	 */
	_loadFont(font: string) {
		$('#narratorWebFont').remove();
		if (font == '') return;

		let style = document.createElement('style');
		style.id = 'narratorWebFont';
		style.appendChild(document.createTextNode(`@font-face {font-family: NTCustomFont; src: url('${font}');}`));

		document.head.appendChild(style);
	},
	_menu: undefined as any,
	/**
	 * Behavior for when a narration is closed
	 */
	_narrationClose() {
		let state = NarratorTools.sharedState.narration;
		Hooks.call('narration_closes', { id: state.id, message: state.message });
		if (NarratorTools._timeouts.narrationCloses) {
			clearTimeout(NarratorTools._timeouts.narrationCloses);
			NarratorTools._timeouts.narrationCloses = 0;
		}
		setTimeout(() => {
			if (state.id == NarratorTools.sharedState.narration.id) {
				state.display = false;
				state.message = '';
				NarratorTools.sharedState.narration = state;
			}
		}, 250);
	},
	_pause() {
		const canScenery = game.user!.role >= (game.settings.get(MODULE, 'PERMScenery') as number);
		if (canScenery && game.settings.get(MODULE, 'Pause')) {
			NarratorTools.scenery(game.paused);
		}
	},
	/**
	 * Creates an alias and change message type if this.character option is true
	 * @param chatMessage The chat message object
	 * @param options
	 * @param user
	 */
	_preCreateChatMessage(chatMessage: ChatMessage, options: any, user: string) {
		if (game.user!.role >= (game.settings.get(MODULE, 'PERMAs') as number) && this.character) {
			let chatData: any = {};
			chatData.type = game.settings.get(MODULE, 'MessageType');
			chatData.speaker = { alias: this.character };
			chatMessage.update(chatData);
		}
	},
	/**Initialization routine for 'ready' hook */
	_ready() {
		this.elements = {
			/**Main Element */
			narrator: this._element,
			frame: this._element.find('.narrator-frame'),
			frameBG: this._element.find('.narrator-frameBG'),
			sidebarBG: this._element.find('.narrator-sidebarBG'),
			BG: this._element.find('.narrator-bg'),
			box: this._element.find('.narrator-box'),
			content: this._element.find('.narrator-content'),
			buttons: this._element.find('.narrator-buttons'),
			buttonPause: this._element.find('.NT-btn-pause') as JQuery<HTMLButtonElement>,
			buttonClose: this._element.find('.NT-btn-close') as JQuery<HTMLButtonElement>,
			buttonCopy: this._element.find('.NT-btn-clipboard') as JQuery<HTMLButtonElement>,
		};
		this._updateBGColor();
		this._updateBGImage();
		this._fitSidebar();
		$('body').append(this._element);

		// Check if the user can Narrate
		this.isNarrator = game.user!.hasPermission('SETTINGS_MODIFY') && game.user!.role >= (game.settings.get(MODULE, 'PERMNarrate') as number);

		// @ts-ignore
		this._menu = new ContextMenuNT({
			theme: 'default', // or 'blue'
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
		$(document.getElementById('chat-log') as HTMLElement).on('click', '.message.narrator-chat', this._onClickMessage.bind(NarratorTools));

		this.elements.buttonPause.on('click', () => {
			const pause = !NarratorTools.sharedState.narration.paused;
			NarratorTools.sharedState.narration = {
				...NarratorTools.sharedState.narration,
				paused: pause,
			};
			NarratorTools._updateStopButton(pause);
		});
		this.elements.buttonClose.html(`<i class="fas fa-times-circle"></i> ${game.i18n.localize('Close')}`);
		this.elements.buttonClose.on('click', this._narrationClose);
		this.elements.buttonCopy.html(`<i class="fas fa-clipboard"></i> ${game.i18n.localize('NT.Copy')}`);
		this.elements.buttonCopy.on('click', () => {
			navigator.clipboard.writeText(this.elements.content[0].innerText);
			ui.notifications.info(game.i18n.localize('NT.CopyClipboard'));
		});

		if (!this.isNarrator) {
			this.elements.buttonPause[0].style.display = 'none';
			this.elements.buttonClose[0].style.display = 'none';
		}

		this._loadFont(game.settings.get(MODULE, 'WebFont') as string);
		this._updateContentStyle();
		this._controller(game.settings.get(MODULE, 'sharedState') as any);
		this._pause();
		document.addEventListener('contextmenu', (ev) => {
			if ((<HTMLElement>ev.target).classList.contains('journal-entry-pages') || $(<HTMLElement>ev.target).parents('div.journal-entry-pages').length) {
				const time = this._menu.isOpen() ? 100 : 0;
				this._menu.hide();
				setTimeout(() => {
					this._menu.show(ev.pageX, ev.pageY);
				}, time);
			}
		});
		document.addEventListener('click', () => NarratorTools._menu.hide());
	},
	/**Initialization routine for 'setup' hook */
	_setup() {
		this._registerKeybindings();
		this._registerGameSettings();
	},
	_registerGameSettings() {
		// Game Settings
		// The shared state of the Narrator Tools application, emitted by the DM across all players
		// Q:   Why use a setting instead of sockets?
		// A:   So there is memory. The screen will only update with the DM present and remain in that state.
		//      For instance, the DM might leave the game with a message on screen.
		//      There should be no concurrency between sockets and this config,
		//      so we eliminated sockets altogether.
		game.settings.register(MODULE, 'sharedState', {
			name: 'Shared State',
			scope: 'world',
			config: false,
			default: {
				/**Displays information about whats happening on screen */
				narration: {
					id: 0,
					display: false,
					new: false,
					message: '',
					paused: false,
				} as NarrationState,
				/**If the background scenery is on or off */
				scenery: false,
			},
			onChange: (newState: { narration: NarrationState; scenery: boolean }) => this._controller(newState),
		});
		// Register the application menu
		game.settings.registerMenu(MODULE, 'settingsMenu', {
			name: game.i18n.localize('SETTINGS.Configure'),
			label: game.i18n.localize('SCENES.Configure'),
			icon: 'fas fa-adjust',
			type: NarratorMenu as any,
			restricted: true,
		});
		// Menu options
		game.settings.register(MODULE, 'FontSize', {
			name: 'Font Size',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'WebFont', {
			name: 'Web Font',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (value: string) => NarratorTools._loadFont(value),
		});
		game.settings.register(MODULE, 'TextColor', {
			name: 'Text Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'TextShadow', {
			name: 'Text Shadow',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'TextCSS', {
			name: 'TextCSS',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'Copy', {
			name: 'Copy',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(MODULE, 'Pause', {
			name: 'Pause',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(MODULE, 'DurationMultiplier', {
			name: 'Duration Multiplier',
			scope: 'world',
			config: false,
			default: 1,
			type: Number,
		});
		game.settings.register(MODULE, 'BGColor', {
			name: 'Background Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (color: string) => NarratorTools._updateBGColor(color),
		});
		game.settings.register(MODULE, 'BGImage', {
			name: 'Background Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (filePath: string) => NarratorTools._updateBGImage(filePath),
		});
		game.settings.register(MODULE, 'NarrationStartPaused', {
			name: 'Start the Narration Paused',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(MODULE, 'MessageType', {
			name: 'Narration Message Type',
			scope: 'world',
			config: false,
			default: CONST.CHAT_MESSAGE_TYPES.OTHER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMScenery', {
			name: 'Permission Required to set the Scenery',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMDescribe', {
			name: 'Permission Required to /describe and /note',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMNarrate', {
			name: 'Permission Required to /narrate',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMAs', {
			name: 'Permission Required to /as',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
	},
	/**
	 * Behavior when a chat message is clicked
	 * @param event The event wich triggered the handler
	 */
	_onClickMessage(event: Event) {
		if (event && (event.target as HTMLElement).classList.contains('narrator-chat')) {
			//@ts-ignore
			const roll: JQuery = $(event.currentTarget);
			const tip = roll.find('.message-metadata');
			if (!tip.is(':visible')) tip.slideDown(200);
			else tip.slideUp(200);
		}
	},
	/**
	 * Process any received messages from the socket
	 * @param data Command and value to be addressed by the corresponding function
	 */
	_onMessage(data: { command: string; value: any }) {
		const commands: { [key: string]: Function } = {
			style: function () {
				NarratorTools._updateContentStyle();
			},
		};
		commands[data.command]();
	},
	/**
	 * Renders the chat message and sets out the message behavior
	 * @param message Message object to be rendered
	 * @param html HTML element of the message
	 * @param data
	 */
	_renderChatMessage(message: any, html: JQuery<HTMLElement>, data: any) {
		const type = message.getFlag(MODULE, 'type');
		if (type) {
			html.find('.message-sender').text('');
			html.find('.message-metadata')[0].style.display = 'none';
			html[0].classList.add('narrator-chat');
			if (type == 'narration') {
				html[0].classList.add('narrator-narrative');
			} else if (type == 'description') {
				html[0].classList.add('narrator-description');
			} else if (type == 'notification') {
				html[0].classList.add('narrator-notification');
			}
		}
	},
	/**Resize the sidebarBG and frame elements to match the sidebars size */
	_fitSidebar() {
		const sidebarWidth = $('body').find('div#sidebar.app.collapsed').length ? 0 : 305;
		this.elements.sidebarBG.width(sidebarWidth);
		this.elements.frame.width(`calc(100% - ${sidebarWidth}px)`);
	},
	/**Object containing all the timeouts called by their numbers */
	_timeouts: {
		narrationOpens: 0,
		narrationCloses: 0,
		narrationScrolls: 0,
	},
	_updateStopButton(pause: boolean) {
		if (pause) {
			NarratorTools.elements.buttonPause.html(`<i class='fas fa-play-circle'></i> ${game.i18n.localize('NT.PlayButton')}`);
		} else {
			NarratorTools.elements.buttonPause.html(`<i class='fas fa-pause-circle'></i> ${game.i18n.localize('NT.PauseButton')}`);
		}
	},
	_updateBGColor(color?: string) {
		color = color ?? ((game.settings.get(MODULE, 'BGColor') as string) || '#000000');
		this.elements.frameBG[0].style.boxShadow = `inset 0 0 2000px 100px ${color}`;
		this.elements.BG[0].style.background = `linear-gradient(transparent 0%, ${color}a8 40%, ${color}a8 60%, transparent 100%)`;
	},
	_updateBGImage(filePath?: string) {
		filePath = filePath ?? (game.settings.get(MODULE, 'BGImage') as string) ?? '';
		if (filePath) {
			this.elements.frameBG[0].style.background = `url(${filePath})`;
			this.elements.frameBG[0].style.backgroundSize = '100% 100%';
		}
	},
	/**Update the content element style to match the settings */
	_updateContentStyle() {
		const style = game.settings.get(MODULE, 'TextCSS');
		if (style) {
			const opacity = this.elements.content[0].style.opacity;
			//@ts-ignore
			this.elements.content[0].style = style;
			this.elements.content[0].style.opacity = opacity;
			return;
		}
		this.elements.content[0].style.fontFamily = `${game.settings.get(MODULE, 'WebFont')}` ? 'NTCustomFont' : '';
		this.elements.content[0].style.fontSize = `${game.settings.get(MODULE, 'FontSize')}`;
		this.elements.content[0].style.color = `${game.settings.get(MODULE, 'TextColor')}`;
		this.elements.content[0].style.textShadow = `${game.settings.get(MODULE, 'TextShadow')}`;
	},
	/**Updates the background opacity to match the scenery */
	_updateScenery(scenery?: boolean) {
		if (!scenery) scenery = this.sharedState.scenery;
		const new_state = scenery ? '1' : '0';
		if (this.elements.frameBG[0].style.opacity === new_state) return;
		this.elements.frameBG[0].style.opacity = new_state;
		this.elements.sidebarBG[0].style.opacity = new_state;
	},
	/**Registers the scenery keyboard shortcut */
	_registerKeybindings() {
		game.keybindings.register(MODULE, 'toogleScenery', {
			name: 'Toggle Scenery Control',
			hint: 'Turns the scenery on/off on command.',
			editable: [
				{
					key: 'F1',
					modifiers: [],
				},
			],
			onDown: () => NarratorTools.scenery(),
			restricted: true, // Restrict this Keybinding to gamemaster only?
			precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
		});
	},
	messagesQueue: [] as string[],
	/**Shortcut object for creating chat messages */
	chatMessage: {
		/**
		 * Creates a 'description' chat message
		 * @param message
		 * @param options - Change the chat message configuration
		 */
		describe(message: string, options = {}) {
			return NarratorTools.createChatMessage('description', message, options);
		},
		/**
		 * Creates a 'narration' chat message
		 * @param message - single message or an array of messages to be consecutively displayed
		 * @param options - Change the chat message configuration
		 */
		narrate(message: string | string[], options = {}) {
			if (typeof message == 'string') {
				message = [message];
			}

			// Create the first message
			NarratorTools.createChatMessage('narration', message[0], options);

			// Queue the others
			NarratorTools.messagesQueue = message.slice(1);

			return NarratorTools.messagesQueue;
		},
		/**
		 * Creates a 'notification' chat message
		 * @param message
		 * @param options - Change the chat message configuration
		 */
		notify(message: string, options = {}) {
			return NarratorTools.createChatMessage('notification', message, options);
		},
	},
	/**
	 * Creates a chat message of the specified type
	 * @param type     'narrate' for narrations or anything else for descriptions
	 * @param message
	 * @param options - Change the chat message configuration
	 */
	createChatMessage(type: string, message: string, options = {}) {
		if (type == 'narration' && !game.user!.role >= (game.settings.get(MODULE, 'PERMNarrate') as any)) return;
		else if (!game.user!.role >= (game.settings.get(MODULE, 'PERMDescribe') as any)) return;

		message = message.replace(/\\n/g, '<br>');

		let chatData: any = {
			content: message,
			flags: {
				'narrator-tools': {
					type: type,
				},
			},
			type: game.settings.get(MODULE, 'MessageType'),
			speaker: {
				alias: game.i18n.localize('NT.Narrator'),
				scene: game.user!.viewedScene,
			},
			whisper: type == 'notification' ? game.users!.filter((u) => u.isGM) : [],
			...options,
		};

		/**If the message is a narration, start the protocol */
		if (type == 'narration') {
			const messageStripped = message;
			//const messageStripped = message
			//	.replaceAll('\n', '')
			//	.replace(/<(?:\/p|br)[^>]*>/g, '\n')
			//	.replace(/<[^>]+>/g, '')
			//	.replaceAll('\n', '<br>')
			//	.replace(/<br>$/g, '');
			const narration = new Promise((resolve) => {
				Hooks.once('narration_closes', (narration: { id: number; message: string }) => {
					const msg = this.messagesQueue.shift();
					if (msg) NarratorTools.createChatMessage('narration', msg, options);
					resolve(narration.message == message);
				});
			});

			if (this._timeouts.narrationOpens) {
				clearTimeout(this._timeouts.narrationOpens);
				this._timeouts.narrationOpens = 0;
			}
			if (this._timeouts.narrationCloses) {
				clearTimeout(this._timeouts.narrationCloses);
				this._timeouts.narrationCloses = 0;
			}

			let state: NarrationState = {
				id: this.sharedState.narration.id + 1,
				display: true,
				message: messageStripped,
				paused: game.settings.get(MODULE, 'NarrationStartPaused') as boolean,
			};

			this.sharedState.narration = state;

			ChatMessage.create(chatData, {});
			return narration;
		}

		ChatMessage.create(chatData, {});
	},
	/**Shortcuts for easy access of the elements of the module */
	elements: {} as {
		/**Main Element */
		narrator: JQuery<HTMLElement>;
		frame: JQuery<HTMLElement>;
		frameBG: JQuery<HTMLElement>;
		sidebarBG: JQuery<HTMLElement>;
		BG: JQuery<HTMLElement>;
		box: JQuery<HTMLElement>;
		content: JQuery<HTMLElement>;
		buttons: JQuery<HTMLElement>;
		buttonPause: JQuery<HTMLButtonElement>;
		buttonClose: JQuery<HTMLButtonElement>;
		buttonCopy: JQuery<HTMLButtonElement>;
	},
	isNarrator: false,
	/**
	 * Returns the calculated duration a string of length size would have
	 * @param length    The lenght of the string
	 */
	messageDuration(length: number) {
		//@ts-ignore
		return (Math.clamped(2000, length * 80, 20000) + 3000) * game.settings.get(MODULE, 'DurationMultiplier') + 500;
	},
	/**
	 * Set the background scenery and calls all clients
	 * @param state True to turn on the scenery, false to turn it off
	 */
	scenery(state?: boolean) {
		if (game.user!.role >= (game.settings.get(MODULE, 'PERMScenery') as number)) {
			if (!game.user!.hasPermission('SETTINGS_MODIFY')) ui.notifications.error(game.i18n.localize('NT.CantModifySettings'));
			else this.sharedState.scenery = state ?? !this.sharedState.scenery;
		}
	},
	/**The shared state of the Narrator Tools application, emitted by the DM across all players */
	sharedState: {
		get narration() {
			return (game.settings.get(MODULE, 'sharedState') as any).narration;
		},
		set narration(state: NarrationState) {
			const sharedState = { ...(game.settings.get(MODULE, 'sharedState') as any), narration: state };
			game.settings.set(MODULE, 'sharedState', sharedState);
		},
		get scenery() {
			return (game.settings.get(MODULE, 'sharedState') as any).scenery;
		},
		set scenery(state: boolean) {
			const sharedState = { ...(game.settings.get(MODULE, 'sharedState') as any), scenery: state };
			game.settings.set(MODULE, 'sharedState', sharedState);
		},
	},
};

/* -------------------------------------------- */
Hooks.on('setup', () => NarratorTools._setup());
Hooks.on('ready', () => NarratorTools._ready());
Hooks.on('chatMessage', NarratorTools._chatMessage.bind(NarratorTools)); // This hook spans the chatmsg
Hooks.on('preCreateChatMessage', NarratorTools._preCreateChatMessage.bind(NarratorTools));
Hooks.on('renderChatMessage', NarratorTools._renderChatMessage.bind(NarratorTools)); // This hook changes the chat message in case its a narration + triggers
Hooks.on('renderSceneControls', NarratorTools._createSceneryButton.bind(NarratorTools));
Hooks.on('collapseSidebar', NarratorTools._fitSidebar.bind(NarratorTools));
Hooks.on('pauseGame', (_pause: boolean) => NarratorTools._pause());
