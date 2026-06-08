import { MODULE } from './const.mjs';
import { NarratorMenu } from './menu.mjs';
import { clamp, hasRole, htmlToElement, localize, normalizeChatStyle } from './utils.mjs';

export default {
	_element: htmlToElement(`
		<div id="narrator" class="narrator">
			<div class="narrator-bg"></div>
			<div class="narrator-frame">
				<div class="narrator-frameBG"></div>
				<div class="narrator-box"><div class="narrator-content"></div></div>
				<div class="narrator-buttons" style="opacity:0;">
					<button class="NT-btn-pause" type="button"></button>
					<button class="NT-btn-close" type="button"></button>
					<button class="NT-btn-clipboard" type="button"></button>
				</div>
			</div>
		</div>
	`),
	character: '',
	_id: 0,
	_menu: null,
	_contentAnimation: null,
	isNarrator: false,
	messagesQueue: [],
	_timeouts: {
		narrationOpens: 0,
		narrationCloses: 0,
		narrationScrolls: 0,
	},
	elements: {},

	/**
	 * Register v14 chat command parser entries.
	 */
	_registerChatCommands() {
		const ChatLog = foundry.applications.sidebar?.tabs?.ChatLog ?? ui.chat?.constructor;
		if (!ChatLog?.CHAT_COMMANDS) {
			console.warn(
				'Narrator Tools: ChatLog.CHAT_COMMANDS was not available; slash commands were not registered.',
			);
			return;
		}

		ChatLog.CHAT_COMMANDS['narrator-as'] = {
			rgx: /^(\/as)(?:\s+([^]*))?$/i,
			fn: (_command, match) => {
				NarratorTools.as(match[2] ?? '');
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['narrator-description'] = {
			rgx: /^(\/desc(?:ribe|ription)?\s+)([^]*)/i,
			fn: (_command, match) => {
				NarratorTools.createChatMessage('description', match[2]);
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['narrator-notification'] = {
			rgx: /^(\/not(?:e|ify|ication)?\s+)([^]*)/i,
			fn: (_command, match) => {
				NarratorTools.createChatMessage('notification', match[2]);
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['narrator-narration'] = {
			rgx: /^(\/narrat(?:e|ion)\s+)([^]*)/i,
			fn: (_command, match) => {
				NarratorTools.createChatMessage('narration', match[2]);
				return false;
			},
		};
	},

	/**
	 * Handle ordinary chat messages while a custom speaker alias is active.
	 * @param {any} _chatLog
	 * @param {string} content
	 * @returns {false|void}
	 */
	_chatMessage(_chatLog, content) {
		if (!hasRole('PERMAs') || !this.character || this._isCommandContent(content)) return;
		ChatMessage.create({
			style: CONST.CHAT_MESSAGE_STYLES.IC,
			content: content.replace(/\n/g, '<br>'),
			speaker: { alias: this.character },
		});
		return false;
	},

	/**
	 * Test whether chat input should be handled by Foundry's command parser.
	 * @param {string} content
	 * @returns {boolean}
	 */
	_isCommandContent(content) {
		const ChatLog = foundry.applications.sidebar?.tabs?.ChatLog ?? ui.chat?.constructor;
		try {
			const [command] = ChatLog?.parse?.(content) ?? ['none'];
			return command !== 'none';
		} catch (_error) {
			const template = document.createElement('template');
			template.innerHTML = content;
			return /^\/\S+/.test((template.content.textContent ?? content).trim());
		}
	},

	/**
	 * Set or clear the custom speaker alias used by /as.
	 * @param {string} alias
	 */
	as(alias) {
		if (!hasRole('PERMAs')) return;
		this.character = alias.trim();
		const input = document.getElementById('chat-message');
		if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
			input.placeholder = this.character ? `${localize('NT.SpeakingAs')} ${this.character}` : '';
		}
	},

	/**
	 * Control module behavior in response to shared state changes.
	 * @param {{narration: NarrationState, scenery: boolean}} state
	 */
	_controller({ narration, scenery }) {
		if (!this.elements.content) return;

		this._updateScenery(scenery);
		const sceneryButton = document.querySelector('button[data-tool="scenery"]');
		sceneryButton?.classList.toggle('active', Boolean(scenery));

		if (!narration.display && this.elements.content.style.opacity === '1') {
			this.elements.BG.style.height = '0px';
			this.elements.buttons.style.opacity = '0';
			this.elements.buttons.style.visibility = 'hidden';
		}

		if (!narration.message) this.elements.content.style.opacity = '0';
		if (!narration.display) return;

		const scroll = () => {
			if (this.sharedState.narration.paused) return;

			let scrollDistance = this.elements.content.getBoundingClientRect().height - 290;
			let duration = this.messageDuration(this.sharedState.narration.message.length);
			if (scrollDistance > 20) {
				const currentTop = parseFloat(this.elements.content.style.top || '0') || 0;
				const remaining = 1 - currentTop / -scrollDistance;
				const durationMultiplier = Number(game.settings.get(MODULE, 'DurationMultiplier'));
				const scrollDuration = (duration - 500 - 4500 * durationMultiplier) * remaining;
				const startScroll = () => {
					this._animateContentTop(-scrollDistance, scrollDuration);
					this._timeouts.narrationScrolls = 0;
				};
				if (this.elements.content.style.top === '0px') {
					this._timeouts.narrationScrolls = window.setTimeout(startScroll, 3000 * durationMultiplier);
				} else {
					startScroll();
					duration = scrollDuration + 4500 * durationMultiplier;
				}
			}

			if (this.isNarrator) {
				if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
				this._timeouts.narrationCloses = window.setTimeout(NarratorTools._narrationClose, duration);
			}
		};

		if (narration.id !== this._id) {
			this._id = narration.id;
			clearTimeout(this._timeouts.narrationOpens);
			this.elements.content.style.opacity = '0';
			this._stopContentAnimation();
			this.elements.buttonCopy.style.display = game.settings.get(MODULE, 'Copy') ? '' : 'none';

			this._timeouts.narrationOpens = window.setTimeout(() => {
				this.elements.content.innerHTML = narration.message;
				this.elements.content.style.opacity = '1';
				this.elements.content.style.top = '0px';

				const height = Math.min(this.elements.content.getBoundingClientRect().height, 310);
				this.elements.BG.style.height = `${height * 3}px`;
				this.elements.buttons.style.opacity = '1';
				this.elements.buttons.style.visibility = 'visible';
				this.elements.buttons.style.top = `calc(50% + ${60 + height / 2}px)`;
				const paused = this.sharedState.narration.paused || game.settings.get(MODULE, 'NarrationStartPaused');
				this._updateStopButton(paused);
				this._timeouts.narrationOpens = 0;
				Hooks.call('narration', narration);
			}, 500);

			Hooks.once('narration', scroll);
		} else if (narration.paused) {
			if (this._timeouts.narrationScrolls) clearTimeout(this._timeouts.narrationScrolls);
			this._timeouts.narrationScrolls = 0;
			this._stopContentAnimation();
			if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
			this._timeouts.narrationCloses = 0;
		} else {
			scroll();
		}
	},

	/**
	 * Add the scenery toggle to the v14 scene control data model.
	 * @param {Record<string, object>} controls
	 */
	_getSceneControlButtons(controls) {
		if (!hasRole('PERMScenery')) return;
		const tokenControls = controls.tokens;
		if (!tokenControls) return;
		tokenControls.tools ??= {};
		tokenControls.tools.scenery = {
			name: 'scenery',
			order: 99,
			title: localize('NT.ButtonTitle'),
			icon: 'fa-solid fa-theater-masks',
			toggle: true,
			active: this.sharedState.scenery,
			onChange: (_event, active) => NarratorTools.scenery(active),
		};
	},

	/**
	 * Gets selected HTML/text from the document.
	 * @returns {string}
	 */
	_getSelectionText() {
		let html = '';
		const selection = window.getSelection();
		if (selection?.rangeCount && !selection.isCollapsed) {
			const fragments = selection.getRangeAt(0).cloneContents();
			for (const child of fragments.childNodes) {
				html += child.nodeType === Node.TEXT_NODE ? child.textContent : child.outerHTML;
			}
		}
		return html;
	},

	/**
	 * Load a custom font face.
	 * @param {string} font
	 */
	_loadFont(font) {
		document.getElementById('narratorWebFont')?.remove();
		if (!font) return;
		const style = document.createElement('style');
		style.id = 'narratorWebFont';
		style.textContent = `@font-face {font-family: NTCustomFont; src: url('${font}');}`;
		document.head.append(style);
	},

	_narrationClose() {
		const state = NarratorTools.sharedState.narration;
		Hooks.call('narration_closes', { id: state.id, message: state.message });
		if (NarratorTools._timeouts.narrationCloses) {
			clearTimeout(NarratorTools._timeouts.narrationCloses);
			NarratorTools._timeouts.narrationCloses = 0;
		}
		setTimeout(() => {
			if (state.id === NarratorTools.sharedState.narration.id) {
				state.display = false;
				state.message = '';
				NarratorTools.sharedState.narration = state;
			}
		}, 250);
	},

	_pause() {
		const canScenery = hasRole('PERMScenery');
		if (canScenery && game.settings.get(MODULE, 'Pause')) {
			NarratorTools.scenery(game.paused);
		}
	},

	_ready() {
		this.elements = {
			narrator: this._element,
			frame: this._element.querySelector('.narrator-frame'),
			frameBG: this._element.querySelector('.narrator-frameBG'),
			BG: this._element.querySelector('.narrator-bg'),
			box: this._element.querySelector('.narrator-box'),
			content: this._element.querySelector('.narrator-content'),
			buttons: this._element.querySelector('.narrator-buttons'),
			buttonPause: this._element.querySelector('.NT-btn-pause'),
			buttonClose: this._element.querySelector('.NT-btn-close'),
			buttonCopy: this._element.querySelector('.NT-btn-clipboard'),
		};

		this._updateBGColor();
		this._updateBGImage();
		document.body.append(this._element);

		this.isNarrator = game.user?.hasPermission('SETTINGS_MODIFY') && hasRole('PERMNarrate');
		this._createSelectionMenu();

		document.getElementById('chat-log')?.addEventListener('click', this._onClickMessage.bind(NarratorTools));
		this.elements.buttonPause.addEventListener('click', () => {
			const pause = !NarratorTools.sharedState.narration.paused;
			NarratorTools.sharedState.narration = {
				...NarratorTools.sharedState.narration,
				paused: pause,
			};
			NarratorTools._updateStopButton(pause);
		});
		this.elements.buttonClose.innerHTML = `<i class="fas fa-times-circle"></i> ${localize('Close')}`;
		this.elements.buttonClose.addEventListener('click', this._narrationClose);
		this.elements.buttonCopy.innerHTML = `<i class="fas fa-clipboard"></i> ${localize('NT.Copy')}`;
		this.elements.buttonCopy.addEventListener('click', () => {
			navigator.clipboard.writeText(this.elements.content.innerText);
			ui.notifications.info(localize('NT.CopyClipboard'));
		});

		if (!this.isNarrator) {
			this.elements.buttonPause.style.display = 'none';
			this.elements.buttonClose.style.display = 'none';
		}

		this._loadFont(game.settings.get(MODULE, 'WebFont'));
		this._updateContentStyle();
		this._controller(game.settings.get(MODULE, 'sharedState'));
	},

	_setup() {
		this._registerChatCommands();
		this._registerKeybindings();
		this._registerGameSettings();
	},

	_registerGameSettings() {
		game.settings.register(MODULE, 'sharedState', {
			name: 'Shared State',
			scope: 'world',
			config: false,
			default: {
				narration: {
					id: 0,
					display: false,
					new: false,
					message: '',
					paused: false,
				},
				scenery: false,
			},
			onChange: (newState) => this._controller(newState),
		});

		game.settings.registerMenu(MODULE, 'settingsMenu', {
			name: localize('Configure'),
			hint: '',
			label: localize('Configure'),
			icon: 'fas fa-adjust',
			type: NarratorMenu,
			restricted: true,
		});

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
			onChange: (value) => NarratorTools._loadFont(value),
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
			onChange: (color) => NarratorTools._updateBGColor(color),
		});
		game.settings.register(MODULE, 'BGImage', {
			name: 'Background Image',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (filePath) => NarratorTools._updateBGImage(filePath),
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
			default: CONST.CHAT_MESSAGE_STYLES.OTHER,
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
	 * Toggle metadata display for Narrator chat messages.
	 * @param {MouseEvent} event
	 */
	_onClickMessage(event) {
		const message = event.target?.closest?.('.message.narrator-chat');
		if (!message) return;
		const metadata = message.querySelector('.message-metadata');
		if (metadata) metadata.hidden = !metadata.hidden;
	},

	/**
	 * Process received socket messages.
	 * @param {{command: string, value: unknown}} data
	 */
	_onMessage(data) {
		const commands = {
			style: () => NarratorTools._updateContentStyle(),
		};
		commands[data.command]?.();
	},

	/**
	 * Apply Narrator chat-message CSS classes after render.
	 * @param {ChatMessage} message
	 * @param {HTMLElement} html
	 */
	_renderChatMessage(message, html) {
		const type = message.getFlag(MODULE, 'type');
		if (!type) return;
		html.classList.add('narrator-chat');
		if (type === 'narration') html.classList.add('narrator-narrative');
		else if (type === 'description') html.classList.add('narrator-description');
		else if (type === 'notification') html.classList.add('narrator-notification');
	},

	_updateStopButton(pause) {
		this.elements.buttonPause.innerHTML = pause
			? `<i class="fas fa-play-circle"></i> ${localize('NT.PlayButton')}`
			: `<i class="fas fa-pause-circle"></i> ${localize('NT.PauseButton')}`;
	},

	_updateBGColor(color) {
		if (!this.elements.frameBG) return;
		color = (color ?? game.settings.get(MODULE, 'BGColor')) || '#000000';
		this.elements.frameBG.style.boxShadow = `inset 0 0 2000px 100px ${color}`;
		this.elements.BG.style.background = `linear-gradient(transparent 0%, ${color}a8 40%, ${color}a8 60%, transparent 100%)`;
	},

	_updateBGImage(filePath) {
		if (!this.elements.frameBG) return;
		filePath = filePath ?? game.settings.get(MODULE, 'BGImage') ?? '';
		if (!filePath) return;
		this.elements.frameBG.style.background = `url(${filePath})`;
		this.elements.frameBG.style.backgroundSize = '100% 100%';
	},

	_updateContentStyle() {
		if (!this.elements.content) return;
		const style = game.settings.get(MODULE, 'TextCSS');
		if (style) {
			const opacity = this.elements.content.style.opacity;
			this.elements.content.setAttribute('style', style);
			this.elements.content.style.opacity = opacity;
			return;
		}
		this.elements.content.style.fontFamily = game.settings.get(MODULE, 'WebFont') ? 'NTCustomFont' : '';
		this.elements.content.style.fontSize = String(game.settings.get(MODULE, 'FontSize'));
		this.elements.content.style.color = String(game.settings.get(MODULE, 'TextColor'));
		this.elements.content.style.textShadow = String(game.settings.get(MODULE, 'TextShadow'));
	},

	_updateScenery(scenery) {
		if (!this.elements.frameBG) return;
		const newState = (scenery ?? this.sharedState.scenery) ? '1' : '0';
		if (this.elements.frameBG.style.opacity === newState) return;
		this.elements.frameBG.style.opacity = newState;
	},

	_registerKeybindings() {
		game.keybindings.register(MODULE, 'toogleScenery', {
			name: 'Toggle Scenery Control',
			hint: 'Turns the scenery on/off on command.',
			editable: [{ key: 'F1', modifiers: [] }],
			onDown: () => NarratorTools.scenery(),
			restricted: true,
			precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
		});
	},

	chatMessage: {
		describe(message, options = {}) {
			return NarratorTools.createChatMessage('description', message, options);
		},
		narrate(message, options = {}) {
			const queue = Array.isArray(message) ? message : [message];
			NarratorTools.createChatMessage('narration', queue[0], options);
			NarratorTools.messagesQueue = queue.slice(1);
			return NarratorTools.messagesQueue;
		},
		notify(message, options = {}) {
			return NarratorTools.createChatMessage('notification', message, options);
		},
	},

	/**
	 * Create a Narrator chat message.
	 * @param {"description"|"narration"|"notification"|string} type
	 * @param {string} message
	 * @param {object} options
	 * @returns {Promise<ChatMessage|boolean|void>}
	 */
	createChatMessage(type, message, options = {}) {
		if (type === 'narration') {
			if (!hasRole('PERMNarrate')) return;
			if (!game.user?.hasPermission('SETTINGS_MODIFY')) {
				ui.notifications.error(localize('NT.CantModifySettings'));
				return;
			}
		} else if (!hasRole('PERMDescribe')) {
			return;
		}

		message = String(message ?? '')
			.replace(/\\n/g, '<br>')
			.replace(/\n/g, '<br>');
		const baseData = {
			content: message,
			flags: {
				[MODULE]: { type },
			},
			style: normalizeChatStyle(game.settings.get(MODULE, 'MessageType')),
			speaker: {
				alias: localize('NT.Narrator'),
				scene: canvas.scene?.id ?? game.user?.viewedScene,
			},
			whisper: type === 'notification' ? game.users.filter((user) => user.isGM).map((user) => user.id) : [],
		};
		const chatData = foundry.utils.mergeObject(baseData, options, { inplace: false });
		chatData.style = normalizeChatStyle(chatData.style);
		if (typeof chatData.type !== 'string') delete chatData.type;

		if (type === 'narration') {
			const narration = new Promise((resolve) => {
				Hooks.once('narration_closes', (closedNarration) => {
					const msg = this.messagesQueue.shift();
					if (msg) NarratorTools.createChatMessage('narration', msg, options);
					resolve(closedNarration.message === message);
				});
			});

			if (this._timeouts.narrationOpens) clearTimeout(this._timeouts.narrationOpens);
			this._timeouts.narrationOpens = 0;
			if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
			this._timeouts.narrationCloses = 0;

			this.sharedState.narration = {
				id: this.sharedState.narration.id + 1,
				display: true,
				message,
				paused: Boolean(game.settings.get(MODULE, 'NarrationStartPaused')),
			};

			ChatMessage.create(chatData, {});
			return narration;
		}

		return ChatMessage.create(chatData, {});
	},

	/**
	 * Calculate message display duration from message length.
	 * @param {number} length
	 * @returns {number}
	 */
	messageDuration(length) {
		return (clamp(length * 80, 2000, 20000) + 3000) * Number(game.settings.get(MODULE, 'DurationMultiplier')) + 500;
	},

	/**
	 * Set or toggle the shared scenery state.
	 * @param {boolean} [state]
	 */
	scenery(state) {
		if (!hasRole('PERMScenery')) return;
		if (!game.user?.hasPermission('SETTINGS_MODIFY')) {
			ui.notifications.error(localize('NT.CantModifySettings'));
			return;
		}
		this.sharedState.scenery = state ?? !this.sharedState.scenery;
	},

	sharedState: {
		get narration() {
			return game.settings.get(MODULE, 'sharedState').narration;
		},
		set narration(state) {
			const sharedState = { ...game.settings.get(MODULE, 'sharedState'), narration: state };
			game.settings.set(MODULE, 'sharedState', sharedState);
		},
		get scenery() {
			return game.settings.get(MODULE, 'sharedState').scenery;
		},
		set scenery(state) {
			const sharedState = { ...game.settings.get(MODULE, 'sharedState'), scenery: state };
			game.settings.set(MODULE, 'sharedState', sharedState);
		},
	},

	_createSelectionMenu() {
		const menu = htmlToElement(`
			<div class="nt-selection-menu" hidden>
				<button type="button" data-action="describe"><i class="fas fa-comment"></i> Describe</button>
				<button type="button" data-action="narrate"><i class="fas fa-comment-dots"></i> Narrate</button>
			</div>
		`);
		menu.addEventListener('click', (event) => {
			const button = event.target.closest('button[data-action]');
			if (!button) return;
			const selection = NarratorTools._getSelectionText();
			if (selection && button.dataset.action === 'describe') NarratorTools.chatMessage.describe(selection);
			if (selection && button.dataset.action === 'narrate') NarratorTools.chatMessage.narrate(selection);
			menu.hidden = true;
		});
		document.body.append(menu);
		this._menu = menu;

		document.addEventListener('contextmenu', (event) => {
			if (!event.target?.closest?.('.journal-entry-pages, .editor-content')) return;
			event.preventDefault();
			menu.hidden = false;
			menu.style.left = `${event.pageX}px`;
			menu.style.top = `${event.pageY}px`;
		});
		document.addEventListener('click', () => {
			menu.hidden = true;
		});
	},

	/**
	 * Animate the narration text vertically.
	 * @param {number} top
	 * @param {number} duration
	 */
	_animateContentTop(top, duration) {
		this._stopContentAnimation(false);
		const from = this.elements.content.style.top || '0px';
		const to = `${top}px`;
		this._contentAnimation = this.elements.content.animate([{ top: from }, { top: to }], {
			duration: Math.max(duration, 0),
			easing: 'linear',
			fill: 'forwards',
		});
		this._contentAnimation.onfinish = () => {
			this.elements.content.style.top = to;
			this._contentAnimation = null;
		};
	},

	/**
	 * Stop any active content animation.
	 * @param {boolean} preserveComputed
	 */
	_stopContentAnimation(preserveComputed = true) {
		if (!this._contentAnimation) return;
		if (preserveComputed) this.elements.content.style.top = getComputedStyle(this.elements.content).top;
		this._contentAnimation.cancel();
		this._contentAnimation = null;
	},
};
