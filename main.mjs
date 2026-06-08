import './compatibility/index.mjs';
import NarratorToolsApi from './module/api.mjs';

globalThis.NarratorTools = NarratorToolsApi; // to be deprecated

Hooks.on('setup', () => NarratorToolsApi._setup());
Hooks.on('ready', () => {
	NarratorToolsApi._ready();
	game.narratorTools = NarratorToolsApi;
});
Hooks.on('chatMessage', NarratorToolsApi._chatMessage.bind(NarratorTools));
Hooks.on('renderChatMessageHTML', NarratorToolsApi._renderChatMessage.bind(NarratorTools));
Hooks.on('getSceneControlButtons', NarratorToolsApi._getSceneControlButtons.bind(NarratorTools));
Hooks.on('pauseGame', () => NarratorToolsApi._pause());
