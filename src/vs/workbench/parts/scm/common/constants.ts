/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const VIEWLET_ID = 'workbench.view.scm';

export const FindInFilesActionId = 'workbench.action.findInFiles';
export const FocusActiveEditorActionId = 'scm.action.focusActiveEditor';

export const FocusMessageFromResults = 'scm.action.focusMessageFromResults';
//export const OpenMatchToSide = 'scm.action.openResultToSide';
export const CancelActionId = 'scm.action.cancel';
export const RemoveActionId = 'scm.action.remove';
export const TagActionId = 'scm.action.tag';
export const TagAllInFileActionId = 'scm.action.tagAllInFile';
export const ToggleAnnotateActionId = 'toggleAnnotate';
//export const ToggleWholeWordActionId = 'toggleMessageWholeWord';
//export const ToggleMessageActionId = 'toggleMessageRegex';
export const CloseTagWidgetActionId = 'closeTagInFilesWidget';

export const SCMViewletVisibleKey = new RawContextKey<boolean>('scmViewletVisible', true);
export const InputBoxFocussedKey = new RawContextKey<boolean>('inputBoxFocus', false);
export const MessageInputBoxFocussedKey = new RawContextKey<boolean>('messageInputBoxFocus', false);
export const TagInputBoxFocussedKey = new RawContextKey<boolean>('tagInputBoxFocus', false);
export const TagActiveKey = new RawContextKey<boolean>('tagActive', false);

//export const FirstMatchFocusKey = new RawContextKey<boolean>('firstMatchFocus', false);
//export const FileMatchOrMatchFocusKey = new RawContextKey<boolean>('fileMatchOrMatchFocus', false);
//export const FileFocusKey = new RawContextKey<boolean>('fileMatchFocus', false);
//export const MatchFocusKey = new RawContextKey<boolean>('matchFocus', false);