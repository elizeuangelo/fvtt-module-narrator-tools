/* Narrator Tools - by elizeuangelo
This module allows for narration tools wich are intended to increase Foundrys core funcionality.
Chatcommands:
/narrate [message]
*/

class NarratorTools {

    constructor() {
        this.narrator = $(`<div id="narrator" class="narrator"><div class="narrator-frame"></div><div class="narrator-bg"></div><div class="narrator-box"><div class="narrator-content"></div></div></div>`);
        this.narratorFrame = this.narrator.find(".narrator-frame");
        this.narratorBG = this.narrator.find(".narrator-bg");
        this.narratorContent = this.narrator.find(".narrator-content");
        this.scenery = false;
        $('body').append(this.narrator);
    }

    _chatMessage(message, content, data) {
        if (!game.user.isGM) { return; }
        const narrate = new RegExp("^(\/narrate) ([^]*)", 'i')
        const commands = {
            "narrate": narrate
        }
        // Iterate over patterns, finding the first match
        let c, rgx, match;
        for ( [c, rgx] of Object.entries(commands) ) {
            match = content.match(rgx); 
            if ( match ) {
                const chatData = {
                    content: (`<span class="narrator-span">${match[2]}</span>`)
                };
                ChatMessage.create(chatData, {});
                return false;
            }
        }
    }

    _renderChatMessage(message, html, data) {
        if (html.find(".narrator-span").length) {
            html[0].classList.add('narrator-chat')
            html.find(".message-sender").text("");
            html.find(".message-metadata")[0].style.display = "none";
            const timestamp = new Date().getTime();
            if (message.data.timestamp+2000 > timestamp) {
                const content = $(message.data.content)[0].textContent;
                let duration = content.length * 80;
                duration = Math.clamped(2000, duration, 21000);
                clearTimeout(this.narratorCloseTimeout);
                this.narratorContent[0].style.opacity = "0";
                this.narratorOpenTimeout = setTimeout(this.narratorOpen.bind(this, content, duration), 500);
                this.narratorCloseTimeout = setTimeout(this.narratorClose.bind(this), duration + 3000);
            }
        }
    }

    narratorOpen(content, duration) {
        this.narratorContent.text(content);
        let height = Math.min(this.narratorContent.height(),310)
        this.narratorBG.height(height+90);
        this.narratorContent.stop();
        this.narratorContent[0].style.top = "0px";
        this.narratorBG[0].style.opacity = "1";
        this.narratorContent[0].style.opacity = "1";
        let scroll = this.narratorContent.height()-310;
        clearTimeout(this.narratorScrollTimeout);
        if (scroll > 0) {
            this.narratorScrollTimeout = setTimeout(() => {
                this.narratorContent.animate({ top: -scroll }, duration - 1000, 'linear');
            }, 2000);
        }
    }

    narratorClose() {
        this.narratorBG[0].style.opacity = "0";
        this.narratorContent[0].style.opacity = "0";
    }

    _onNarratorChatClick(event) {
        event.preventDefault();
        let roll = $(event.currentTarget),
            tip = roll.find(".message-metadata");
        if ( !tip.is(":visible") ) tip.slideDown(200);
        else tip.slideUp(200);
    }

    _getSceneControlButtons(buttons) {
        let tokenButton = buttons.find(b => b.name === "token");

        if (tokenButton && game.user.isGM) {
            tokenButton.tools.push({
                name: "scenery",
                title: "NT.ButtonTitle",
                icon: "fas fa-theater-masks",
                visible: game.user.isGM,
                toggle: true,
                active: this.scenery,
                onClick: () => {
                    this.scenery = !this.scenery;
                    this.narratorFrame[0].style.opacity = this.scenery ? 1 : 0;
                }
            });
        }

    }

}

Hooks.on("setup", () => {
    Narrator = new NarratorTools();
    Hooks.on("chatMessage", Narrator._chatMessage.bind(Narrator)); // This hook spans the chatmsg
    Hooks.on("renderChatMessage", Narrator._renderChatMessage.bind(Narrator)); // This hook changes the chat message in case its a narration + triggers
    Hooks.on('getSceneControlButtons', Narrator._getSceneControlButtons.bind(Narrator));
})
Hooks.on("ready", () => {
    $(document.getElementById('chat-log')).on("click", ".message.narrator-chat", Narrator._onNarratorChatClick.bind(Narrator));
})