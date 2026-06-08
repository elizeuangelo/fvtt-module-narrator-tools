import { MODULE } from './const.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NarratorMenu extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'narrator-config',
		tag: 'form',
		window: {
			contentClasses: ['standard-form'],
			icon: 'fa-solid fa-theater-masks',
			title: 'NT.Title',
		},
		position: {
			width: 560,
		},
		form: {
			handler: NarratorMenu.#onSubmit,
			closeOnSubmit: true,
		},
	};

	static PARTS = {
		tabs: {
			template: 'templates/generic/tab-navigation.hbs',
		},
		body: {
			template: 'modules/narrator-tools/templates/config.hbs',
		},
		footer: {
			template: 'templates/generic/form-footer.hbs',
		},
	};

	static TABS = {
		sheet: {
			tabs: [
				{ id: 'appearance', icon: 'fa-regular fa-image', label: 'NT.NarrationNav' },
				{ id: 'behavior', icon: 'fa-solid fa-microchip', label: 'NT.OthersNav' },
				{ id: 'permissions', icon: 'fa-regular fa-address-card', label: 'Permissions' },
			],
			initial: 'appearance',
		},
	};

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const bgColor = game.settings.get(MODULE, 'BGColor');
		const textColor = game.settings.get(MODULE, 'TextColor');
		return {
			...context,
			FontSize: game.settings.get(MODULE, 'FontSize'),
			WebFont: game.settings.get(MODULE, 'WebFont'),
			TextColor: textColor,
			TextColorPicker: NarratorMenu.#colorPickerValue(textColor),
			TextShadow: game.settings.get(MODULE, 'TextShadow'),
			TextCSS: game.settings.get(MODULE, 'TextCSS'),
			Copy: game.settings.get(MODULE, 'Copy'),
			Pause: game.settings.get(MODULE, 'Pause'),
			DurationMultiplier: game.settings.get(MODULE, 'DurationMultiplier'),
			BGColor: bgColor,
			BGColorPicker: NarratorMenu.#colorPickerValue(bgColor),
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
			buttons: [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save' }],
		};
	}

	/**
	 * Get a valid value for an HTML color input from a configurable CSS color string.
	 * @param {string} color
	 * @returns {string}
	 */
	static #colorPickerValue(color) {
		const match = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.exec(color ?? '');
		return match ? color.slice(0, 7) : '#000000';
	}

	/**
	 * Persist settings from the configuration form.
	 * @param {SubmitEvent} _event
	 * @param {HTMLFormElement} _form
	 * @param {FormDataExtended} formData
	 */
	static async #onSubmit(_event, _form, formData) {
		const data = {
			Copy: false,
			Pause: false,
			NarrationStartPaused: false,
			...formData.object,
		};
		for (const key of ['DurationMultiplier', 'MessageType', 'PERMScenery', 'PERMDescribe', 'PERMNarrate', 'PERMAs']) {
			data[key] = Number(data[key]);
		}
		for (const [key, value] of Object.entries(data)) await game.settings.set(MODULE, key, value);
		NarratorTools._updateContentStyle();
		game.socket?.emit(`module.${MODULE}`, { command: 'style' });
	}
}
