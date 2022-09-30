"use strict";
class NarratorMenu extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'narrator-config',
            title: game.i18n.localize('NT.Title'),
            classes: ['sheet'],
            template: 'modules/narrator-tools/templates/config.html',
            width: 800,
        });
    }
    async getData(_options) {
        return {
            FontSize: game.settings.get('narrator-tools', 'FontSize'),
            WebFont: game.settings.get('narrator-tools', 'WebFont'),
            TextColor: game.settings.get('narrator-tools', 'TextColor'),
            TextShadow: game.settings.get('narrator-tools', 'TextShadow'),
            TextCSS: game.settings.get('narrator-tools', 'TextCSS'),
            Copy: game.settings.get('narrator-tools', 'Copy'),
            Pause: game.settings.get('narrator-tools', 'Pause'),
            DurationMultiplier: game.settings.get('narrator-tools', 'DurationMultiplier'),
            BGColor: game.settings.get('narrator-tools', 'BGColor'),
            BGImage: game.settings.get('narrator-tools', 'BGImage'),
            NarrationStartPaused: game.settings.get('narrator-tools', 'NarrationStartPaused'),
            MessageType: game.settings.get('narrator-tools', 'MessageType'),
            CHAT_MESSAGE_TYPES: {
                0: 'Other',
                1: 'Out of Character',
                2: 'In Character',
            },
            PERMScenery: game.settings.get('narrator-tools', 'PERMScenery'),
            PERMDescribe: game.settings.get('narrator-tools', 'PERMDescribe'),
            PERMNarrate: game.settings.get('narrator-tools', 'PERMNarrate'),
            PERMAs: game.settings.get('narrator-tools', 'PERMAs'),
            USER_ROLES: {
                0: game.i18n.localize('USER.RoleNone'),
                1: game.i18n.localize('USER.RolePlayer'),
                2: game.i18n.localize('USER.RoleTrusted'),
                3: game.i18n.localize('USER.RoleAssistant'),
                4: game.i18n.localize('USER.RoleGamemaster'),
            },
        };
    }
    async _updateObject(_event, formData) {
        for (let [k, v] of Object.entries(formData)) {
            game.settings.set('narrator-tools', k, v);
        }
        setTimeout(() => {
            NarratorTools._updateContentStyle();
            game.socket?.emit('module.narrator-tools', { command: 'style' });
        }, 200);
    }
}
const NarratorTools = {
    _element: $('<div id="narrator" class="narrator"><div class="narrator-bg"></div><div class="narrator-frame"><div class="narrator-frameBG"></div><div class="narrator-box"><div class="narrator-content"></div></div><div class="narrator-buttons" style="opacity:0;"><button class="NT-btn-pause"></button><button class="NT-btn-close"></button></button><button class="NT-btn-clipboard"></button></div></div><div class="narrator-sidebarBG"></div>'),
    character: '',
    _chatMessage(message, content, chatData) {
        let commands = {};
        content = content.replace(/\n/g, '<br>');
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMAs')) {
            commands.as = new RegExp('^(?:\\/as$|\\/as ([^]*))', 'i');
        }
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMDescribe')) {
            commands.description = new RegExp('^\\/desc(?:ribe|ription|) ([^]*)', 'i');
            commands.notification = new RegExp('^\\/not(?:e|ify|ication) ([^]*)', 'i');
        }
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMNarrate')) {
            commands.narration = new RegExp('^\\/narrat(?:e|ion) ([^]*)', 'i');
        }
        let c, rgx, match;
        for ([c, rgx] of Object.entries(commands)) {
            match = content.match(rgx);
            if (match) {
                if (c == 'as') {
                    if (match[1]) {
                        this.character = match[1];
                        $('#chat-message')[0].placeholder = game.i18n.localize('NT.SpeakingAs') + ' ' + this.character;
                    }
                    else {
                        this.character = '';
                        $('#chat-message')[0].placeholder = '';
                    }
                }
                else {
                    if (c == 'narration' && !game.user.hasPermission('SETTINGS_MODIFY'))
                        ui.notifications.error(game.i18n.localize('NT.CantModifySettings'));
                    else
                        this.createChatMessage(c, match[1]);
                }
                return false;
            }
        }
    },
    _controller({ narration, scenery }) {
        this._updateScenery(scenery);
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMScenery')) {
            const btn = $('.scene-control[data-tool=scenery]');
            if (btn) {
                if (scenery)
                    btn[0].classList.add('active');
                else
                    btn[0].classList.remove('active');
            }
        }
        if (!narration.display && this.elements.content[0].style.opacity === '1') {
            this.elements.BG.height(0);
            this.elements.buttons[0].style.opacity = '0';
            this.elements.buttons[0].style.visibility = 'hidden';
        }
        if (!narration.message) {
            this.elements.content[0].style.opacity = '0';
        }
        if (narration.display) {
            const scroll = () => {
                if (!this.sharedState.narration.paused) {
                    let scroll = (this.elements.content.height() ?? 0) - 290;
                    let duration = this.messageDuration(this.sharedState.narration.message.length);
                    if (scroll > 20) {
                        const remaining = 1 - Number(this.elements.content[0].style.top.slice(0, -2)) / -scroll;
                        const duration_multiplier = game.settings.get('narrator-tools', 'DurationMultiplier');
                        const scroll_duration = (duration - 500 - 4500 * duration_multiplier) * remaining;
                        const fun_scroll = () => {
                            this.elements.content.animate({ top: -scroll }, scroll_duration, 'linear');
                            this._timeouts.narrationScrolls = 0;
                        };
                        if (this.elements.content[0].style.top == '0px') {
                            this._timeouts.narrationScrolls = +setTimeout(fun_scroll, 3000 * duration_multiplier);
                        }
                        else {
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
            if (narration.id !== this._id) {
                this._id = narration.id;
                clearTimeout(this._timeouts.narrationOpens);
                this.elements.content[0].style.opacity = '0';
                this.elements.content.stop();
                this.elements.buttonCopy[0].style.display = game.settings.get('narrator-tools', 'Copy') ? '' : 'none';
                this._timeouts.narrationOpens = +setTimeout(() => {
                    this.elements.content.html(narration.message);
                    this.elements.content[0].style.opacity = '1';
                    this.elements.content[0].style.top = '0px';
                    const height = Math.min(this.elements.content.height() ?? 0, 310);
                    this.elements.BG.height(height * 3);
                    this.elements.buttons[0].style.opacity = '1';
                    this.elements.buttons[0].style.visibility = 'visible';
                    this.elements.buttons[0].style.top = `calc(50% + ${60 + height / 2}px)`;
                    this._updateStopButton(game.settings.get('narrator-tools', 'NarrationStartPaused'));
                    this._timeouts.narrationOpens = 0;
                    Hooks.call('narration', narration);
                }, 500);
                Hooks.once('narration', scroll);
            }
            else {
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
                }
                else {
                    scroll();
                }
            }
        }
    },
    _createSceneryButton(control, html, data) {
        const hasPerm = game.user.role >= game.settings.get('narrator-tools', 'PERMScenery');
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
    _getSelectionText() {
        let html = '';
        const selection = window.getSelection();
        if (selection?.rangeCount && !selection.isCollapsed) {
            const fragments = selection.getRangeAt(0).cloneContents();
            const size = fragments.childNodes.length;
            for (let i = 0; i < size; i++) {
                if (fragments.childNodes[i].nodeType == fragments.TEXT_NODE)
                    html += fragments.childNodes[i].wholeText;
                else
                    html += fragments.childNodes[i].outerHTML;
            }
        }
        return html;
    },
    _id: 0,
    _loadFont(font) {
        $('#narratorWebFont').remove();
        if (font == '')
            return;
        let style = document.createElement('style');
        style.id = 'narratorWebFont';
        style.appendChild(document.createTextNode(`@font-face {font-family: NTCustomFont; src: url('${font}');}`));
        document.head.appendChild(style);
    },
    _menu: undefined,
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
        const canScenery = game.user.role >= game.settings.get('narrator-tools', 'PERMScenery');
        if (canScenery && game.settings.get('narrator-tools', 'Pause')) {
            NarratorTools.scenery(game.paused);
        }
    },
    _preCreateChatMessage(chatMessage, options, user) {
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMAs') && this.character) {
            let chatData = {};
            chatData.type = game.settings.get('narrator-tools', 'MessageType');
            chatData.speaker = { alias: this.character };
            chatMessage.data.update(chatData);
        }
    },
    _ready() {
        this.elements = {
            narrator: this._element,
            frame: this._element.find('.narrator-frame'),
            frameBG: this._element.find('.narrator-frameBG'),
            sidebarBG: this._element.find('.narrator-sidebarBG'),
            BG: this._element.find('.narrator-bg'),
            box: this._element.find('.narrator-box'),
            content: this._element.find('.narrator-content'),
            buttons: this._element.find('.narrator-buttons'),
            buttonPause: this._element.find('.NT-btn-pause'),
            buttonClose: this._element.find('.NT-btn-close'),
            buttonCopy: this._element.find('.NT-btn-clipboard'),
        };
        this._updateBGColor();
        this._updateBGImage();
        this._fitSidebar();
        $('body').append(this._element);
        this.isNarrator = game.user.hasPermission('SETTINGS_MODIFY') && game.user.role >= game.settings.get('narrator-tools', 'PERMNarrate');
        this._menu = new ContextMenuNT({
            theme: 'default',
            items: [
                {
                    icon: 'comment',
                    name: 'Describe',
                    action: () => {
                        const selection = NarratorTools._getSelectionText();
                        if (selection)
                            NarratorTools.chatMessage.describe(selection);
                    },
                },
                {
                    icon: 'comment-dots',
                    name: 'Narrate',
                    action: () => {
                        const selection = NarratorTools._getSelectionText();
                        if (selection)
                            NarratorTools.chatMessage.narrate(selection);
                    },
                },
            ],
        });
        $(document.getElementById('chat-log')).on('click', '.message.narrator-chat', this._onClickMessage.bind(NarratorTools));
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
        this._loadFont(game.settings.get('narrator-tools', 'WebFont'));
        this._updateContentStyle();
        this._controller(game.settings.get('narrator-tools', 'sharedState'));
        this._pause();
        document.addEventListener('contextmenu', (ev) => {
            if (ev.target.classList.contains('editor-content') || $(ev.target).parents('div.editor-content').length) {
                const time = this._menu.isOpen() ? 100 : 0;
                this._menu.hide();
                setTimeout(() => {
                    this._menu.show(ev.pageX, ev.pageY);
                }, time);
            }
        });
        document.addEventListener('click', () => NarratorTools._menu.hide());
    },
    _setup() {
        game.settings.register('narrator-tools', 'sharedState', {
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
        game.settings.registerMenu('narrator-tools', 'settingsMenu', {
            name: game.i18n.localize('SETTINGS.Configure'),
            label: game.i18n.localize('SCENES.Configure'),
            icon: 'fas fa-adjust',
            type: NarratorMenu,
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
        game.settings.register('narrator-tools', 'Copy', {
            name: 'Copy',
            scope: 'world',
            config: false,
            default: false,
            type: Boolean,
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
        game.settings.register('narrator-tools', 'BGColor', {
            name: 'Background Color',
            scope: 'world',
            config: false,
            default: '',
            type: String,
            onChange: (color) => NarratorTools._updateBGColor(color),
        });
        game.settings.register('narrator-tools', 'BGImage', {
            name: 'Background Color',
            scope: 'world',
            config: false,
            default: '',
            type: String,
            onChange: (filePath) => NarratorTools._updateBGImage(filePath),
        });
        game.settings.register('narrator-tools', 'NarrationStartPaused', {
            name: 'Start the Narration Paused',
            scope: 'world',
            config: false,
            default: false,
            type: Boolean,
        });
        game.settings.register('narrator-tools', 'MessageType', {
            name: 'Narration Message Type',
            scope: 'world',
            config: false,
            default: CONST.CHAT_MESSAGE_TYPES.OTHER,
            type: Number,
        });
        game.settings.register('narrator-tools', 'PERMScenery', {
            name: 'Permission Required to set the Scenery',
            scope: 'world',
            config: false,
            default: CONST.USER_ROLES.GAMEMASTER,
            type: Number,
        });
        game.settings.register('narrator-tools', 'PERMDescribe', {
            name: 'Permission Required to /describe and /note',
            scope: 'world',
            config: false,
            default: CONST.USER_ROLES.GAMEMASTER,
            type: Number,
        });
        game.settings.register('narrator-tools', 'PERMNarrate', {
            name: 'Permission Required to /narrate',
            scope: 'world',
            config: false,
            default: CONST.USER_ROLES.GAMEMASTER,
            type: Number,
        });
        game.settings.register('narrator-tools', 'PERMAs', {
            name: 'Permission Required to /as',
            scope: 'world',
            config: false,
            default: CONST.USER_ROLES.GAMEMASTER,
            type: Number,
        });
    },
    _onClickMessage(event) {
        if (event && event.target.classList.contains('narrator-chat')) {
            const roll = $(event.currentTarget);
            const tip = roll.find('.message-metadata');
            if (!tip.is(':visible'))
                tip.slideDown(200);
            else
                tip.slideUp(200);
        }
    },
    _onMessage(data) {
        const commands = {
            style: function () {
                NarratorTools._updateContentStyle();
            },
        };
        commands[data.command]();
    },
    _renderChatMessage(message, html, data) {
        const type = message.getFlag('narrator-tools', 'type');
        if (type) {
            html.find('.message-sender').text('');
            html.find('.message-metadata')[0].style.display = 'none';
            html[0].classList.add('narrator-chat');
            if (type == 'narration') {
                html[0].classList.add('narrator-narrative');
            }
            else if (type == 'description') {
                html[0].classList.add('narrator-description');
            }
            else if (type == 'notification') {
                html[0].classList.add('narrator-notification');
            }
        }
    },
    _fitSidebar() {
        const sidebarWidth = $('body').find('div#sidebar.app.collapsed').length ? 0 : 305;
        this.elements.sidebarBG.width(sidebarWidth);
        this.elements.frame.width(`calc(100% - ${sidebarWidth}px)`);
    },
    _timeouts: {
        narrationOpens: 0,
        narrationCloses: 0,
        narrationScrolls: 0,
    },
    _updateStopButton(pause) {
        if (pause) {
            NarratorTools.elements.buttonPause.html(`<i class='fas fa-play-circle'></i> ${game.i18n.localize('NT.PlayButton')}`);
        }
        else {
            NarratorTools.elements.buttonPause.html(`<i class='fas fa-pause-circle'></i> ${game.i18n.localize('NT.PauseButton')}`);
        }
    },
    _updateBGColor(color) {
        color = color ?? (game.settings.get('narrator-tools', 'BGColor') || '#000000');
        this.elements.frameBG[0].style.boxShadow = `inset 0 0 2000px 100px ${color}`;
        this.elements.BG[0].style.background = `linear-gradient(transparent 0%, ${color}a8 40%, ${color}a8 60%, transparent 100%)`;
    },
    _updateBGImage(filePath) {
        filePath = filePath ?? game.settings.get('narrator-tools', 'BGImage') ?? '';
        if (filePath) {
            this.elements.frameBG[0].style.background = `url(${filePath})`;
            this.elements.frameBG[0].style.backgroundSize = '100% 100%';
        }
    },
    _updateContentStyle() {
        const style = game.settings.get('narrator-tools', 'TextCSS');
        if (style) {
            const opacity = this.elements.content[0].style.opacity;
            this.elements.content[0].style = style;
            this.elements.content[0].style.opacity = opacity;
            return;
        }
        this.elements.content[0].style.fontFamily = `${game.settings.get('narrator-tools', 'WebFont')}` ? 'NTCustomFont' : '';
        this.elements.content[0].style.fontSize = `${game.settings.get('narrator-tools', 'FontSize')}`;
        this.elements.content[0].style.color = `${game.settings.get('narrator-tools', 'TextColor')}`;
        this.elements.content[0].style.textShadow = `${game.settings.get('narrator-tools', 'TextShadow')}`;
    },
    _updateScenery(scenery) {
        if (!scenery)
            scenery = this.sharedState.scenery;
        const new_state = scenery ? '1' : '0';
        if (this.elements.frameBG[0].style.opacity === new_state)
            return;
        this.elements.frameBG[0].style.opacity = new_state;
        this.elements.sidebarBG[0].style.opacity = new_state;
    },
    messagesQueue: [],
    chatMessage: {
        describe(message, options = {}) {
            return NarratorTools.createChatMessage('description', message, options);
        },
        narrate(message, options = {}) {
            if (typeof message == 'string') {
                message = [message];
            }
            NarratorTools.createChatMessage('narration', message[0], options);
            NarratorTools.messagesQueue = message.slice(1);
            return NarratorTools.messagesQueue;
        },
        notify(message, options = {}) {
            return NarratorTools.createChatMessage('notification', message, options);
        },
    },
    createChatMessage(type, message, options = {}) {
        if (type == 'narration' && !game.user.role >= game.settings.get('narrator-tools', 'PERMNarrate'))
            return;
        else if (!game.user.role >= game.settings.get('narrator-tools', 'PERMDescribe'))
            return;
        message = message.replace(/\\n/g, '<br>');
        let chatData = {
            content: message,
            flags: {
                'narrator-tools': {
                    type: type,
                },
            },
            type: game.settings.get('narrator-tools', 'MessageType'),
            speaker: {
                alias: game.i18n.localize('NT.Narrator'),
                scene: game.user.viewedScene,
            },
            whisper: type == 'notification' ? game.users.filter((u) => u.isGM) : [],
            ...options,
        };
        if (type == 'narration') {
            const messageStripped = message;
            const narration = new Promise((resolve) => {
                Hooks.once('narration_closes', (narration) => {
                    const msg = this.messagesQueue.shift();
                    if (msg)
                        NarratorTools.createChatMessage('narration', msg, options);
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
            let state = {
                id: this.sharedState.narration.id + 1,
                display: true,
                message: messageStripped,
                paused: game.settings.get('narrator-tools', 'NarrationStartPaused'),
            };
            this.sharedState.narration = state;
            ChatMessage.create(chatData, {});
            return narration;
        }
        ChatMessage.create(chatData, {});
    },
    elements: {},
    isNarrator: false,
    messageDuration(length) {
        return (Math.clamped(2000, length * 80, 20000) + 3000) * game.settings.get('narrator-tools', 'DurationMultiplier') + 500;
    },
    scenery(state) {
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMScenery')) {
            if (!game.user.hasPermission('SETTINGS_MODIFY'))
                ui.notifications.error(game.i18n.localize('NT.CantModifySettings'));
            else
                this.sharedState.scenery = state ?? !this.sharedState.scenery;
        }
    },
    sharedState: {
        get narration() {
            return game.settings.get('narrator-tools', 'sharedState').narration;
        },
        set narration(state) {
            const sharedState = { ...game.settings.get('narrator-tools', 'sharedState'), narration: state };
            game.settings.set('narrator-tools', 'sharedState', sharedState);
        },
        get scenery() {
            return game.settings.get('narrator-tools', 'sharedState').scenery;
        },
        set scenery(state) {
            const sharedState = { ...game.settings.get('narrator-tools', 'sharedState'), scenery: state };
            game.settings.set('narrator-tools', 'sharedState', sharedState);
        },
    },
};
Hooks.on('setup', () => NarratorTools._setup());
Hooks.on('ready', () => NarratorTools._ready());
Hooks.on('chatMessage', NarratorTools._chatMessage.bind(NarratorTools));
Hooks.on('preCreateChatMessage', NarratorTools._preCreateChatMessage.bind(NarratorTools));
Hooks.on('renderChatMessage', NarratorTools._renderChatMessage.bind(NarratorTools));
Hooks.on('renderSceneControls', NarratorTools._createSceneryButton.bind(NarratorTools));
Hooks.on('collapseSidebar', NarratorTools._fitSidebar.bind(NarratorTools));
Hooks.on('pauseGame', (_pause) => NarratorTools._pause());
