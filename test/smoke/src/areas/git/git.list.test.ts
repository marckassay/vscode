/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export function setup() {
	describe('GitList', () => {
		before(async function () {
			const app = this.app as SpectronApplication;
			app.suiteName = 'GitList';
		});

		it('I - stages in sequential order using key bindings', async function () {
			const app = this.app as SpectronApplication;
			/* 			const actionsparam = [{
							type: 'key',
							id: 'keyboard',
							actions: [
								{ type: 'keyDown', value: '\uE009' },
								{ type: 'keyDown', value: 'l' },
								{ type: 'keyUp', value: '\uE009' },
								{ type: 'keyUp', value: 'l' }
							]
						}]; */
			await app.workbench.scm.openSCMViewlet();

			await app.workbench.keybindingsEditor.updateKeybinding('git.stage', ['Control', 'l'], 'Control+L');
			await app.workbench.closeTab('Keyboard Shortcuts');

			await app.workbench.quickopen.openFile('error.jade');
			await app.workbench.editor.waitForTypeInEditor('error.jade', 'error world');
			await app.workbench.saveOpenedFile();
			await app.workbench.scm.waitForChange('error.jade', 'Modified');
			await app.workbench.closeTab('error.jade');

			await app.workbench.quickopen.openFile('index.jade');
			await app.workbench.editor.waitForTypeInEditor('index.jade', 'hell world');
			await app.workbench.saveOpenedFile();
			await app.workbench.scm.waitForChange('index.jade', 'Modified');
			await app.workbench.closeTab('index.jade');

			await app.workbench.quickopen.openFile('layout.jade');
			await app.workbench.editor.waitForTypeInEditor('layout.jade', 'layout world');
			await app.workbench.saveOpenedFile();
			await app.workbench.scm.waitForChange('layout.jade', 'Modified');
			await app.workbench.closeTab('layout.jade');

			await app.workbench.scm.waitAndMoveToObject('error.jade');
			await app.client.buttonDown();

			await app.workbench.scm.waitAndMoveToObject('index.jade');
			await app.client.buttonDown();

			//await app.client.actions(actionsparam);
			await app.workbench.scm.stage();
			await app.workbench.scm.waitForChange('index.jade', 'Index Modified');

			await app.runCommand('Git: Stage Changes');
			await app.workbench.scm.waitForChange('layout.jade', 'Index Modified');
		});
		/*
				it('II - stages in sequential order using key bindings', async function () {
					const app = this.app as SpectronApplication;

					await app.workbench.scm.openSCMViewlet();

					await app.workbench.scm.waitAndMoveToObject('error.jade');
					await app.client.buttonDown();

					await app.workbench.scm.waitAndMoveToObject('index.jade');
					await app.client.buttonDown();
				});

				it('III - stages in sequential order using key bindings', async function () {
					const app = this.app as SpectronApplication;

					await app.workbench.scm.openSCMViewlet();

					await app.workbench.scm.stage('index.jade');
					await app.workbench.scm.waitForChange('index.jade', 'Index Modified');

					await app.client.keys(['Control', 'L', 'NULL']);
					await app.workbench.scm.waitForChange('layout.jade', 'Index Modified');
				});
		*/
	});
}