/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

const SORT_BY_PRECEDENCE_UNCHECKED = '.monaco-custom-checkbox.sort-by-precedence.unchecked';
const SORT_BY_PRECEDENCE_CHECKED = SORT_BY_PRECEDENCE_UNCHECKED + '.checked';
const SEARCH_INPUT = '.settings-search-input input';

export class KeybindingsEditor {

	constructor(private spectron: SpectronApplication) { }

	async updateKeybinding(command: string, keys: any, ariaLabel: string): Promise<any> {
		await this.spectron.runCommand('workbench.action.openGlobalKeybindings');

		await this.spectron.client.waitAndClick(SORT_BY_PRECEDENCE_UNCHECKED);
		await this.spectron.client.waitForElement(SORT_BY_PRECEDENCE_CHECKED);

		await this.spectron.client.waitForActiveElement(SEARCH_INPUT);
		await this.spectron.client.setValue(SEARCH_INPUT, command);

		await this.spectron.client.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item');
		await this.spectron.client.waitForElement('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item.focused.selected');

		await this.spectron.client.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item .action-item .icon.add');
		await this.spectron.client.waitForElement('.defineKeybindingWidget .monaco-inputbox.synthetic-focus');

		await this.spectron.client.keys([...keys, 'NULL', 'Enter', 'NULL']);
		await this.spectron.client.waitForElement(`div[aria-label="Keybindings"] div[aria-label="Keybinding is ${ariaLabel}."]`);
	}
}