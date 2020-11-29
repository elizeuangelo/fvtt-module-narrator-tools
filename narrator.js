/* Narrator Tools - by elizeuangelo
This module allows for narration tools wich are intended to increase Foundrys core funcionality.
Chatcommands:
/narrate [message]
/describe [message]
*/

class NarratorTools {
	constructor() {
		this.narrator = $(
			`<div id="narrator" class="narrator"><div class="narrator-frame"><div class="narrator-frameBG"></div><div class="narrator-box"><div class="narrator-content"></div></div></div><div class="narrator-sidebarBG"></div><div class="narrator-bg"></div></div>`
		);
		this.narratorFrame = this.narrator.find('.narrator-frame');
		this.narratorFrameBG = this.narrator.find('.narrator-frameBG');
		this.narratorSidebarBG = this.narrator.find('.narrator-sidebarBG');
		this.narratorBG = this.narrator.find('.narrator-bg');
		this.narratorBOX = this.narrator.find('.narrator-box');
		this.narratorContent = this.narrator.find('.narrator-content');
		this.scenery = false;
		this.sidebarCollapse = $('body').find('.app.collapsed').length;
		this.msgtype = 0;
		this._resizeElements();
		$('body').append(this.narrator);
	}

	_chatMessage(message, content, data) {
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
				this.createSpecialChatMessage(c, match[2]);
				return false;
			}
		}
	}

	chatMessage = {
		narrate: (message) => this.createSpecialChatMessage('narrate', message),
		describe: (message) => this.createSpecialChatMessage('describe', message),
	};

	createSpecialChatMessage(type, message) {
		let csspatches = '';
		if (typeof game.modules.get('pathfinder-ui') != 'undefined') {
			if (game.modules.get('pathfinder-ui').active) {
				csspatches += 'pathfinder-ui-fix';
			}
		}
		const chatData = {
			content: `<span class="narrator-span${type == 'narrate' ? ' narration' : ' description'} ${csspatches}">${message.replace(
				/\\n|<br>/g,
				'\n'
			)}</span>`,
			type: this.msgtype,
			speaker: {
				alias: game.i18n.localize('NT.Narrator'),
				scene: game.user.viewedScene,
			},
		};
		ChatMessage.create(chatData, {});
	}

	getMessageDuration(length) {
		return (Math.clamped(2000, length * 80, 20000) + 3000) * game.settings.get('narrator-tools', 'DurationMultiplier') + 500;
	}

	_renderChatMessage(message, html, data) {
		if (html.find('.narrator-span').length) {
			html.find('.message-sender').text('');
			html.find('.message-metadata')[0].style.display = 'none';
			html[0].classList.add('narrator-chat');
			if (html.find('.narration').length) {
				html[0].classList.add('narrator-narrative');
				const timestamp = new Date().getTime();
				if (message.data.timestamp + 2000 > timestamp) {
					const content = $(message.data.content)[0].textContent;
					let duration = this.getMessageDuration(content.length);
					clearTimeout(this.narratorCloseTimeout);
					this.narratorContent[0].style.opacity = '0';
					this.narratorOpenTimeout = setTimeout(this.narratorOpen.bind(this, content, duration), 500);
					this.narratorCloseTimeout = setTimeout(this.narratorClose.bind(this), duration);
				}
			} else {
				html[0].classList.add('narrator-description');
			}
		}
	}

	narratorOpen(content, duration) {
		this.narratorContent.text(content);
		const durationMulti = game.settings.get('narrator-tools', 'DurationMultiplier');
		let height = Math.min(this.narratorContent.height(), 310);
		this.narratorBG.height(height * 3);
		this.narratorContent.stop();
		this.narratorContent[0].style.top = '0px';
		this.narratorBG[0].style.opacity = '1';
		this.narratorContent[0].style.opacity = '1';
		let scroll = this.narratorContent.height() - 310;
		clearTimeout(this.narratorScrollTimeout);
		if (scroll > 0) {
			this.narratorScrollTimeout = setTimeout(() => {
				this.narratorContent.animate({ top: -scroll }, duration - (5000 * durationMulti + 500), 'linear');
			}, 3000 * durationMulti);
		}
	}

	narratorClose() {
		this.narratorBG[0].style.opacity = '0';
		this.narratorContent[0].style.opacity = '0';
	}

	updateScenery() {
		this.narratorFrameBG[0].style.opacity = this.scenery ? 1 : 0;
		this.narratorSidebarBG[0].style.opacity = this.scenery ? 1 : 0;
	}

	_updateContentStyle() {
		const style = game.settings.get('narrator-tools', 'TextCSS');
		if (style) {
			const opacity = this.narratorContent[0].style.opacity;
			this.narratorContent[0].style = style;
			this.narratorContent[0].style.opacity = opacity;
			return;
		}
		this.narratorContent[0].style.fontFamily = `${game.settings.get('narrator-tools', 'WebFont')}`;
		this.narratorContent[0].style.fontSize = `${game.settings.get('narrator-tools', 'FontSize')}`;
		this.narratorContent[0].style.color = `${game.settings.get('narrator-tools', 'TextColor')}`;
		this.narratorContent[0].style.textShadow = `${game.settings.get('narrator-tools', 'TextShadow')}`;
	}

	setScenery(state) {
		if (game.user.isGM) {
			this.scenery = state ?? !this.scenery;
			this.updateScenery();
			game.socket.emit('module.narrator-tools', { command: 'scenery', value: this.scenery });
			const btn = $('.control-tool[title=Scenery]')[0].classList.contains('active');
			const tool = ui.controls.controls[0].tools.find((tool) => tool.name === 'scenery');
			if (this.scenery) {
				$('.control-tool[title=Scenery]')[0].classList.add('active');
				tool.active = true;
			} else {
				$('.control-tool[title=Scenery]')[0].classList.remove('active');
				tool.active = false;
			}
		}
	}

	_onNarratorChatClick(event) {
		event.preventDefault();
		let roll = $(event.currentTarget),
			tip = roll.find('.message-metadata');
		if (!tip.is(':visible')) tip.slideDown(200);
		else tip.slideUp(200);
	}

	_getSceneControlButtons(buttons) {
		let tokenButton = buttons.find((b) => b.name === 'token');

		if (tokenButton && game.user.isGM) {
			tokenButton.tools.push({
				name: 'scenery',
				title: 'NT.ButtonTitle',
				icon: 'fas fa-theater-masks',
				visible: game.user.isGM,
				toggle: true,
				active: this.scenery,
				onClick: (toggle) => {
					this.setScenery(toggle);
				},
			});
		}
	}

	_onSignal(data) {
		let commands = {
			scenery: function () {
				Narrator.scenery = data.value;
				Narrator.updateScenery();
			},
			style: function () {
				Narrator._updateContentStyle();
			},
			update: function () {
				if (game.user.isGM) {
					game.socket.emit('module.narrator-tools', { command: 'scenery', value: Narrator.scenery });
				}
			},
		};
		commands[data.command]();
	}

	_sidebarCollapse(sidebar, collapse) {
		this.sidebarCollapse = collapse;
		this._resizeElements();
	}

	_resizeElements() {
		const sidebarWidth = this.sidebarCollapse ? 0 : 305;
		this.narratorSidebarBG.width(sidebarWidth);
		this.narratorFrame.width(`calc(100% - ${sidebarWidth}px)`);
	}

	renderJournalSheet(journalSheet, html) {
		html.find('.editor-content').contextmenu((e) => {
			e.preventDefault();
			const time = this._menu.isOpen() ? 100 : 0;
			this._menu.hide();
			setTimeout(() => {
				this._menu.show(e.pageX, e.pageY);
			}, time);
			document.addEventListener('click', NarratorTools._hideContextMenu, false);
		});
	}

	static _hideContextMenu(e) {
		Narrator._menu.hide();
		document.removeEventListener('click', NarratorTools._hideContextMenu);
	}

	static getSelectionHtml() {
		var html = '';
		if (typeof window.getSelection != 'undefined') {
			var sel = window.getSelection();
			if (sel.rangeCount) {
				var container = document.createElement('div');
				for (var i = 0, len = sel.rangeCount; i < len; ++i) {
					container.appendChild(sel.getRangeAt(i).cloneContents());
				}
				html = container.innerHTML;
			}
		} else if (typeof document.selection != 'undefined') {
			if (document.selection.type == 'Text') {
				html = document.selection.createRange().htmlText;
			}
		}
		return html;
	}

	static loadFont(font) {
		$('#narratorWebFont').remove();
		if (font == '') return;
		const linkRel = $(
			`<link id="narratorWebFont" href="https://fonts.googleapis.com/css2?family=${font}&display=swap" rel="stylesheet" type="text/css" media="all">`
		);
		$('head').append(linkRel);
	}
}

class NarratorConfig extends FormApplication {
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: 'narrator-config',
			title: game.i18n.localize('NT.Title'),
			classes: ['sheet'],
			template: 'modules/narrator-tools/templates/config.html',
			width: 500,
		});
	}
	/* -------------------------------------------- */
	/** @override */
	async getData(options) {
		return {
			FontSize: game.settings.get('narrator-tools', 'FontSize'),
			WebFont: game.settings.get('narrator-tools', 'WebFont'),
			TextColor: game.settings.get('narrator-tools', 'TextColor'),
			TextShadow: game.settings.get('narrator-tools', 'TextShadow'),
			TextCSS: game.settings.get('narrator-tools', 'TextCSS'),
			Pause: game.settings.get('narrator-tools', 'Pause'),
			DurationMultiplier: game.settings.get('narrator-tools', 'DurationMultiplier'),
		};
	} /* -------------------------------------------- */
	/** @override */
	async _updateObject(event, formData) {
		for (let [k, v] of Object.entries(formData)) {
			game.settings.set('narrator-tools', k, v);
		}
		setTimeout(() => {
			Narrator._updateContentStyle();
			game.socket.emit('module.narrator-tools', { command: 'style' });
		}, 200);
	}
}

Hooks.on('setup', () => {
	Narrator = new NarratorTools();
	Hooks.on('chatMessage', Narrator._chatMessage.bind(Narrator)); // This hook spans the chatmsg
	Hooks.on('renderChatMessage', Narrator._renderChatMessage.bind(Narrator)); // This hook changes the chat message in case its a narration + triggers
	Hooks.on('getSceneControlButtons', Narrator._getSceneControlButtons.bind(Narrator));
	Hooks.on('sidebarCollapse', Narrator._sidebarCollapse.bind(Narrator));
	Hooks.on('renderJournalSheet', Narrator.renderJournalSheet.bind(Narrator));
	Hooks.on('pauseGame', (pause) => {
		if (game.user.isGM && game.settings.get('narrator-tools', 'Pause')) {
			Narrator.setScenery(pause);
		}
	});
	// custom languages
	game.settings.registerMenu('narrator-tools', 'settingsMenu', {
		name: 'NT.CfgName',
		label: 'NT.CfgLabel',
		icon: 'fas fa-adjust',
		type: NarratorConfig,
		restricted: true,
	});
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
		onChange: (value) => NarratorTools.loadFont(value),
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
});
Hooks.on('ready', () => {
	$(document.getElementById('chat-log'))
		.on('click', '.message.narrator-chat', Narrator._onNarratorChatClick.bind(Narrator))
		.on('click', '.narrator-span', () => false);
	game.socket.on('module.narrator-tools', Narrator._onSignal.bind(Narrator));
	if (!game.user.isGM) {
		game.socket.emit('module.narrator-tools', { command: 'update' });
	}
	Narrator._menu = new ContextMenuNT({
		theme: 'default', // or 'blue'
		items: [
			{
				icon: 'comment',
				name: 'Describe',
				action: () => Narrator.chatMessage.describe(NarratorTools.getSelectionHtml()),
			},
			{
				icon: 'comment-dots',
				name: 'Narrate',
				action: () => Narrator.chatMessage.narrate(NarratorTools.getSelectionHtml()),
			},
		],
	});
	NarratorTools.loadFont(game.settings.get('narrator-tools', 'WebFont'));
	Narrator._updateContentStyle();
});
