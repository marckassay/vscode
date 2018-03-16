/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';

import { SpectronApplication } from '../../spectron/application';

export function setup() {
	describe('GitList', () => {
		before(async function () {
			const app = this.app as SpectronApplication;
			app.suiteName = 'GitList';

			await app.workbench.scm.openSCMViewlet();

			await app.workbench.keybindingsEditor.updateKeybinding('git.stage', ['Control', 'l'], 'Control+L');
			await app.workbench.closeTab('Keyboard Shortcuts');

			await app.workbench.scm.openEditSaveAndCloseFile('index.js', '/* smoke test */');
			await app.workbench.scm.openEditSaveAndCloseFile('users.js', '/* smoke test */');
			await app.workbench.scm.openEditSaveAndCloseFile('error.jade', '// smoke test');
			await app.workbench.scm.openEditSaveAndCloseFile('index.jade', '// smoke test');
			await app.workbench.scm.openEditSaveAndCloseFile('layout.jade', '// smoke test');
		});

		after(async function () {
			const app = this.app as SpectronApplication;

			cp.execSync('git reset --hard origin/master', { cwd: app.workspacePath });
		});

		it('stages in sequential order using key bindings', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.scm.waitAndMoveToListObject('error.jade');

			await app.workbench.scm.waitAndMoveToListObject('index.jade');
			await app.workbench.scm.stage('index.jade');
			await app.workbench.scm.waitForChange('index.jade', 'Index Modified');

			// selection should be next (descendant) item in list.
			await app.runCommand('Git: Stage Changes');
			await app.workbench.scm.waitForChange('layout.jade', 'Index Modified');

			// selection now should be index.js since layout.jade was last file in list.
			await app.runCommand('Git: Stage Changes');
			await app.workbench.scm.waitForChange('index.js', 'Index Modified');
		});
	});
}