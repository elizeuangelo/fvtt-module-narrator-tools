/**Interface of the narration state */
interface NarrationState {
	id: number;
	display: boolean;
	message: string;
	paused: boolean;
}

interface ModuleSharedState {
	/**Displays information about whats happening on screen */
	narration: NarrationState;
	/**If the background scenery is on or off */
	scenery: boolean;
}

interface SettingConfig {
	'narrator-tools.FontSize': string;
	'narrator-tools.WebFont': string;
	'narrator-tools.TextColor': string;
	'narrator-tools.TextShadow': string;
	'narrator-tools.TextCSS': string;
	'narrator-tools.Copy': boolean;
	'narrator-tools.Pause': boolean;
	'narrator-tools.DurationMultiplier': number;
	'narrator-tools.BGColor': string;
	'narrator-tools.BGImage': string;
	'narrator-tools.NarrationStartPaused': boolean;
	'narrator-tools.MessageType': number;
	'narrator-tools.PERMScenery': number;
	'narrator-tools.PERMDescribe': number;
	'narrator-tools.PERMNarrate': number;
	'narrator-tools.PERMAs': number;
	'narrator-tools.sharedState': ModuleSharedState;
}

declare var foundry: any;
declare var Hooks: any;
declare var game: any;
declare var ui: any;
declare var CONST: any;
declare var saveDataToFile: any;
declare var Playlist: any;
declare var CONFIG: any;
declare var canvas: any;
declare var FormDataExtended: any;
declare var ChatMessage: any;
declare var NarratorTools: typeof import('./module/api.mjs').default;
