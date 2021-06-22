"use strict";
/* -------------------------------------------- */
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
            width: 800,
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
    _element: $('<div id="narrator" class="narrator"><div class="narrator-bg"></div><div class="narrator-frame"><div class="narrator-frameBG"></div><div class="narrator-box"><div class="narrator-content"></div></div><div class="narrator-buttons" style="opacity:0;"><button class="NT-btn-pause"></button><button class="NT-btn-close"></button></div></div><div class="narrator-sidebarBG"></div>'),
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
    _chatMessage(message, content, chatData) {
        let commands = {};
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
        // Iterate over patterns, finding the first match
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
    /**
     * Control the module behavior in response to a change in the sharedState
     * @param state The new application state
     */
    _controller({ narration, scenery }) {
        /**First, we manage the scenery changes */
        this._updateScenery(scenery);
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMScenery')) {
            const btn = $('.control-tool[data-tool=scenery]');
            if (btn) {
                if (scenery)
                    btn[0].classList.add('active');
                else
                    btn[0].classList.remove('active');
            }
        }
        /**Then, we control the narration's behavior */
        const is_narrator = game.user.hasPermission('SETTINGS_MODIFY') && game.user.role >= game.settings.get('narrator-tools', 'PERMNarrate');
        /**If a narration had ocurred and the display now is still on, turn it off */
        if (!narration.display && this.elements.content[0].style.opacity === '1') {
            this.elements.BG.height(0);
            if (is_narrator) {
                this.elements.buttons[0].style.opacity = '0';
                this.elements.buttons[0].style.visibility = 'hidden';
            }
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
                        const duration_multiplier = game.settings.get('narrator-tools', 'DurationMultiplier');
                        const scroll_duration = (duration - 500 - 4500 * duration_multiplier) * remaining;
                        const fun_scroll = () => {
                            this.elements.content.animate({ top: -scroll }, scroll_duration, 'linear');
                            this._timeouts.narrationScrolls = 0;
                        };
                        if (this.elements.content[0].style.top == '0px') {
                            this._timeouts.narrationScrolls = setTimeout(fun_scroll, 3000 * duration_multiplier);
                        }
                        else {
                            fun_scroll();
                            duration = scroll_duration + 4500 * duration_multiplier;
                        }
                    }
                    if (is_narrator) {
                        if (this._timeouts.narrationCloses) {
                            clearTimeout(this._timeouts.narrationCloses);
                            this._timeouts.narrationCloses = 0;
                        }
                        this._timeouts.narrationCloses = setTimeout(NarratorTools._narrationClose, duration);
                    }
                }
            };
            /** If the display is on and the narration.id is a new one, it means a new narration is taking place */
            if (narration.id !== this._id) {
                this._id = narration.id;
                clearTimeout(this._timeouts.narrationOpens);
                this.elements.content[0].style.opacity = '0';
                this.elements.content.stop();
                this._timeouts.narrationOpens = setTimeout(() => {
                    this.elements.content.html(narration.message);
                    this.elements.content[0].style.opacity = '1';
                    this.elements.content[0].style.top = '0px';
                    const height = Math.min(this.elements.content.height() ?? 0, 310);
                    this.elements.BG.height(height * 3);
                    if (is_narrator) {
                        this.elements.buttons[0].style.opacity = '1';
                        this.elements.buttons[0].style.visibility = 'visible';
                        this.elements.buttons[0].style.top = `calc(50% + ${60 + height / 2}px)`;
                        this._updateStopButton(game.settings.get('narrator-tools', 'NarrationStartPaused'));
                    }
                    this._timeouts.narrationOpens = 0;
                    Hooks.call('narration', narration);
                }, 500);
                Hooks.once('narration', scroll);
            }
            else {
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
                }
                else {
                    scroll();
                }
            }
        }
    },
    /**Hook function wich creates the scenery button */
    _createSceneryButton(control, html, data) {
        const hasPerm = game.user.role >= game.settings.get('narrator-tools', 'PERMScenery');
        if (hasPerm) {
            const name = 'scenery';
            const title = game.i18n.localize('NT.ButtonTitle');
            const icon = 'fas fa-theater-masks';
            const active = this.sharedState.scenery;
            const btn = $(`<li class="control-tool toggle ${active ? 'active' : ''}" title="${title}" data-tool="${name}"><i class="${icon}"></i></li>`);
            btn.on('click', () => this.scenery());
            html.append(btn);
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
                if (fragments.childNodes[i].nodeType == fragments.TEXT_NODE)
                    html += fragments.childNodes[i].wholeText;
                else
                    html += fragments.childNodes[i].outerHTML;
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
        const canScenery = game.user.role >= game.settings.get('narrator-tools', 'PERMScenery');
        if (canScenery && game.settings.get('narrator-tools', 'Pause')) {
            NarratorTools.scenery(game.paused);
        }
    },
    /**
     * Creates an alias and change message type if this.character option is true
     * @param chatMessage The chat message object
     * @param options
     * @param user
     */
    _preCreateChatMessage(chatMessage, options, user) {
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMAs') && this.character) {
            let chatData = {};
            chatData.type = game.settings.get('narrator-tools', 'MessageType');
            chatData.speaker = { alias: this.character };
            chatMessage.data.update(chatData);
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
            buttonPause: this._element.find('.NT-btn-pause'),
            buttonClose: this._element.find('.NT-btn-close'),
        };
        this._updateBGColor();
        this._updateBGImage();
        this._fitSidebar();
        $('body').append(this._element);
        // @ts-ignore
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
        $(document.getElementById('chat-log')).on('click', '.message.narrator-chat', NarratorTools._onClickMessage.bind(NarratorTools));
        NarratorTools.elements.buttonPause.on('click', () => {
            const pause = !NarratorTools.sharedState.narration.paused;
            NarratorTools.sharedState.narration = {
                ...NarratorTools.sharedState.narration,
                paused: pause,
            };
            NarratorTools._updateStopButton(pause);
        });
        NarratorTools.elements.buttonClose.html(`<i class="fas fa-times-circle"></i> ${game.i18n.localize('Close')}`);
        NarratorTools.elements.buttonClose.on('click', NarratorTools._narrationClose);
        NarratorTools._loadFont(game.settings.get('narrator-tools', 'WebFont'));
        NarratorTools._updateContentStyle();
        this._controller(game.settings.get('narrator-tools', 'sharedState'));
        NarratorTools._pause();
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
    /**Initialization routine for 'setup' hook */
    _setup() {
        // Game Settings
        // The shared state of the Narrator Tools application, emitted by the DM across all players
        // Q:   Why use a setting instead of sockets?
        // A:   So there is memory. The screen will only update with the DM present and remain in that state.
        //      For instance, the DM might leave the game with a message on screen.
        //      There should be no concurrency between sockets and this config,
        //      so we eliminated sockets altogether.
        game.settings.register('narrator-tools', 'sharedState', {
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
                },
                /**If the background scenery is on or off */
                scenery: false,
            },
            onChange: (newState) => this._controller(newState),
        });
        // Register the application menu
        game.settings.registerMenu('narrator-tools', 'settingsMenu', {
            name: game.i18n.localize('SETTINGS.Configure'),
            label: game.i18n.localize('SCENES.Configure'),
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
    /**
     * Behavior when a chat message is clicked
     * @param event The event wich triggered the handler
     */
    _onClickMessage(event) {
        if (event && event.target.classList.contains('narrator-chat')) {
            //@ts-ignore
            const roll = $(event.currentTarget);
            const tip = roll.find('.message-metadata');
            if (!tip.is(':visible'))
                tip.slideDown(200);
            else
                tip.slideUp(200);
        }
    },
    /**
     * Process any received messages from the socket
     * @param data Command and value to be addressed by the corresponding function
     */
    _onMessage(data) {
        const commands = {
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
    _updateStopButton(pause) {
        if (pause) {
            NarratorTools.elements.buttonPause.html(`<i class='fas fa-play-circle'></i> ${game.i18n.localize('NT.PlayButton')}`);
        }
        else {
            NarratorTools.elements.buttonPause.html(`<i class='fas fa-pause-circle'></i> ${game.i18n.localize('NT.PauseButton')}`);
        }
    },
    _updateBGColor(color) {
        if (!color)
            color = game.settings.get('narrator-tools', 'BGColor');
        if (!color)
            color = '#000000';
        this.elements.frameBG[0].style.boxShadow = `inset 0 0 2000px 100px ${color}`;
        this.elements.BG[0].style.background = `linear-gradient(transparent 0%, ${color}a8 40%, ${color}a8 60%, transparent 100%)`;
    },
    _updateBGImage(filePath) {
        if (!filePath)
            filePath = game.settings.get('narrator-tools', 'BGImage');
        if (!filePath)
            this.elements.frameBG[0].style.background = '';
        else {
            this.elements.frameBG[0].style.background = `url(${filePath})`;
            this.elements.frameBG[0].style.backgroundSize = '100% 100%';
        }
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
        this.elements.content[0].style.fontFamily = `${game.settings.get('narrator-tools', 'WebFont')}` ? 'NTCustomFont' : '';
        this.elements.content[0].style.fontSize = `${game.settings.get('narrator-tools', 'FontSize')}`;
        this.elements.content[0].style.color = `${game.settings.get('narrator-tools', 'TextColor')}`;
        this.elements.content[0].style.textShadow = `${game.settings.get('narrator-tools', 'TextShadow')}`;
    },
    /**Updates the background opacity to match the scenery */
    _updateScenery(scenery) {
        if (!scenery)
            scenery = this.sharedState.scenery;
        const new_state = scenery ? '1' : '0';
        if (this.elements.frameBG[0].style.opacity === new_state)
            return;
        this.elements.frameBG[0].style.opacity = new_state;
        this.elements.sidebarBG[0].style.opacity = new_state;
    },
    /**Shortcut object for creating chat messages */
    chatMessage: {
        /**
         * Creates a 'description' chat message
         * @param message
         * @param options - Change the chat message configuration
         */
        describe(message, options = {}) {
            return NarratorTools.createChatMessage('description', message, options);
        },
        /**
         * Creates a 'narration' chat message
         * @param message - single message or an array of messages to be consecutively displayed
         * @param options - Change the chat message configuration
         */
        narrate(message, options = {}) {
            if (typeof message == 'string') {
                message = [message];
            }
            let res = NarratorTools.createChatMessage('narration', message[0], options);
            if (res) {
                for (let i = 1; i < message.length; i++) {
                    res = res.then(() => NarratorTools.createChatMessage('narration', message[i], options));
                }
            }
            return res;
        },
        /**
         * Creates a 'notification' chat message
         * @param message
         * @param options - Change the chat message configuration
         */
        notify(message, options = {}) {
            return NarratorTools.createChatMessage('notification', message, options);
        },
    },
    /**
     * Creates a chat message of the specified type
     * @param type     'narrate' for narrations or anything else for descriptions
     * @param message
     * @param options - Change the chat message configuration
     */
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
            whisper: type == 'notification' ? game.users.entities.filter((u) => u.isGM) : [],
            ...options,
        };
        /**If the message is a narration, start the protocol */
        if (type == 'narration') {
            const narration = new Promise((resolve) => {
                Hooks.once('narration_closes', (narration) => {
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
                message: message,
                paused: game.settings.get('narrator-tools', 'NarrationStartPaused'),
            };
            this.sharedState.narration = state;
            ChatMessage.create(chatData, {});
            return narration;
        }
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
     * @param state True to turn on the scenery, false to turn it off
     */
    scenery(state) {
        if (game.user.role >= game.settings.get('narrator-tools', 'PERMScenery')) {
            if (!game.user.hasPermission('SETTINGS_MODIFY'))
                ui.notifications.error(game.i18n.localize('NT.CantModifySettings'));
            else
                this.sharedState.scenery = state ?? !this.sharedState.scenery;
        }
    },
    /**The shared state of the Narrator Tools application, emitted by the DM across all players */
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
/* -------------------------------------------- */
Hooks.on('setup', () => NarratorTools._setup());
Hooks.on('ready', () => NarratorTools._ready());
Hooks.on('chatMessage', NarratorTools._chatMessage.bind(NarratorTools)); // This hook spans the chatmsg
Hooks.on('preCreateChatMessage', NarratorTools._preCreateChatMessage.bind(NarratorTools));
Hooks.on('renderChatMessage', NarratorTools._renderChatMessage.bind(NarratorTools)); // This hook changes the chat message in case its a narration + triggers
Hooks.on('renderSceneControls', NarratorTools._createSceneryButton.bind(NarratorTools));
Hooks.on('collapseSidebar', NarratorTools._fitSidebar.bind(NarratorTools));
Hooks.on('pauseGame', (_pause) => NarratorTools._pause());
