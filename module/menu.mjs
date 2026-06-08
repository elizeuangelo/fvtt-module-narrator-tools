import { MODULE } from './const.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NarratorMenu extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'narrator-config',
		classes: ['sheet'],
		window: {
			title: 'NT.Title',
		},
		position: {
			width: 800,
		},
		form: {
			handler: NarratorMenu.#onSubmit,
			closeOnSubmit: true,
		},
	};

	static PARTS = {
		form: {
			template: 'modules/narrator-tools/templates/config.html',
			root: true,
		},
	};

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return {
			...context,
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
				3: 'Emote',
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
	 * Persist settings from the configuration form.
	 * @param {SubmitEvent} _event
	 * @param {HTMLFormElement} _form
	 * @param {FormDataExtended} formData
	 */
	static async #onSubmit(_event, _form, formData) {
		for (const [key, value] of Object.entries(formData.object)) {
			await game.settings.set(MODULE, key, value);
		}
		NarratorTools._updateContentStyle();
		game.socket?.emit(`module.${MODULE}`, { command: 'style' });
	}
}
