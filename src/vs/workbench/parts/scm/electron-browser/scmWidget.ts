/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { Widget } from 'vs/base/browser/ui/widget';
import { Action } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Button } from 'vs/base/browser/ui/button/button';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import Event, { Emitter } from 'vs/base/common/event';
import { Builder } from 'vs/base/browser/builder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { isSearchViewletFocussed, appendKeyBindingLabel } from 'vs/workbench/parts/search/browser/searchActions';
import { CONTEXT_FIND_WIDGET_NOT_VISIBLE } from 'vs/editor/contrib/find/common/findController';
import { HistoryNavigator } from 'vs/base/common/history';
import * as Constants from 'vs/workbench/parts/scm/common/constants';
import { attachInputBoxStyler, attachFindInputBoxStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';

export interface ISCMWidgetOptions {
	value?: string;
	// annotate?: boolean;
}
/**
class ReplaceAllAction extends Action {

	private static fgInstance: ReplaceAllAction = null;
	public static ID: string = 'search.action.replaceAll';

	static get INSTANCE(): ReplaceAllAction {
		if (ReplaceAllAction.fgInstance === null) {
			ReplaceAllAction.fgInstance = new ReplaceAllAction();
		}
		return ReplaceAllAction.fgInstance;
	}

	private _searchWidget: SearchWidget = null;

	constructor() {
		super(ReplaceAllAction.ID, '', 'action-replace-all', false);
	}

	set searchWidget(searchWidget: SearchWidget) {
		this._searchWidget = searchWidget;
	}

	run(): TPromise<any> {
		if (this._searchWidget) {
			return this._searchWidget.triggerReplaceAll();
		}
		return TPromise.as(null);
	}
}
**/
export class SCMWidget extends Widget {
	/**
	private static REPLACE_ALL_DISABLED_LABEL = nls.localize('search.action.replaceAll.disabled.label', "Replace All (Submit Search to Enable)");
	private static REPLACE_ALL_ENABLED_LABEL = (keyBindingService2: IKeybindingService): string => {
		let kb = keyBindingService2.lookupKeybinding(ReplaceAllAction.ID);
		return appendKeyBindingLabel(nls.localize('search.action.replaceAll.enabled.label', "Replace All"), kb, keyBindingService2);
	}
	**/

	public domNode: HTMLElement;
	public messageInput: InputBox; //  searchInput: FindInput
	private messageInputBoxFocussed: IContextKey<boolean>;
	public messageInputFocusTracker: dom.IFocusTracker;

	private tagInput: InputBox; //  replaceInput : InputBox
	private tagInputBoxFocussed: IContextKey<boolean>;
	public tagInputFocusTracker: dom.IFocusTracker;

	private toggleTagButton: Button;




	private tagContainer: HTMLElement;
	//private replaceAllAction: ReplaceAllAction;
	private tagActive: IContextKey<boolean>;
	private tagActionBar: ActionBar;

	//private searchHistory: HistoryNavigator<string>;

	private _onSubmit = this._register(new Emitter<boolean>());
	public onSubmit: Event<boolean> = this._onSubmit.event;

	//private _onSearchCancel = this._register(new Emitter<void>());
	//public onSearchCancel: Event<void> = this._onSearchCancel.event;

	private _onTagToggled = this._register(new Emitter<void>());
	public onTagToggled: Event<void> = this._onTagToggled.event;

	private _onTagStateChange = this._register(new Emitter<boolean>());
	public onTagStateChange: Event<boolean> = this._onTagStateChange.event;

	private _onTagValueChanged = this._register(new Emitter<string>());
	public onTagValueChanged: Event<string> = this._onTagValueChanged.event;

	//private _onReplaceAll = this._register(new Emitter<void>());
	//public onReplaceAll: Event<void> = this._onReplaceAll.event;

	constructor(container: Builder, private contextViewService: IContextViewService, private themeService: IThemeService, options: ISCMWidgetOptions = Object.create(null),
		private keyBindingService: IContextKeyService, private keyBindingService2: IKeybindingService, private instantiationService: IInstantiationService) {
		super();
		//this.searchHistory = new HistoryNavigator<string>();
		this.tagActive = Constants.TagActiveKey.bindTo(this.keyBindingService);
		this.messageInputBoxFocussed = Constants.MessageInputBoxFocussedKey.bindTo(this.keyBindingService);
		this.tagInputBoxFocussed = Constants.TagInputBoxFocussedKey.bindTo(this.keyBindingService);
		this.render(container, options);
	}

	public focus(select: boolean = true, focusTag: boolean = false): void {
		if ((!focusTag && this.messageInput.inputBox.hasFocus())
			|| (focusTag && this.tagInput.hasFocus())) {
			return;
		}

		if (focusTag && this.isTagShown()) {
			this.tagInput.focus();
			if (select) {
				this.tagInput.select();
			}
		} else {
			this.messageInput.focus();
			if (select) {
				this.messageInput.select();
			}
		}
	}

	public setWidth(width: number) {
		this.messageInput.setWidth(width - 2);
		this.tagInput.width = width - 200;
	}

	public clear() {
		this.messageInput.clear();
		this.tagInput.value = '';
		this.setTagAllActionState(false);
	}

	public isTagShown(): boolean {
		return !dom.hasClass(this.tagContainer, 'disabled');
	}

	public getTagValue(): string {
		return this.tagInput.value;
	}

	public toggleTag(show?: boolean): void {
		if (show === void 0 || show !== this.isTagShown()) {
			this.onToggleReplaceButton();
		}
	}
	/**
	public showNextSearchTerm() {
		let next = this.searchHistory.next();
		if (next) {
			this.messageInput.setValue(next);
		}
	}
	**/
	/**
	public showPreviousSearchTerm() {
		let previous;
		if (this.messageInput.getValue().length === 0) {
			previous = this.searchHistory.current();
		} else {
			this.searchHistory.addIfNotPresent(this.messageInput.getValue());
			previous = this.searchHistory.previous();
		}
		if (previous) {
			this.messageInput.setValue(previous);
		}
	}
	**/

	public messageInputHasFocus(): boolean {
		return this.messageInputBoxFocussed.get();
	}

	public tagInputHasFocus(): boolean {
		return this.tagInput.hasFocus();
	}

	private render(container: Builder, options: ISCMWidgetOptions): void {
		this.domNode = container.div({ 'class': 'scm-widget' }).style({ position: 'relative' }).getHTMLElement();
		this.renderToggleTagButton(this.domNode);

		this.renderMessageInput(this.domNode, options);
		this.renderTagInput(this.domNode, options);
	}

	private renderToggleTagButton(parent: HTMLElement): void {
		this.toggleTagButton = this._register(new Button(parent));
		attachButtonStyler(this.toggleTagButton, this.themeService, {
			buttonBackground: SIDE_BAR_BACKGROUND,
			buttonHoverBackground: SIDE_BAR_BACKGROUND
		});
		this.toggleTagButton.icon = 'toggle-tag-button collapse';
		this.toggleTagButton.addListener('click', () => this.onToggleTagButton());
		//this.toggleTagButton.getElement().title = nls.localize('search.replace.toggle.button.title', "Toggle Tag");
	}

	private renderMessageInput(parent: HTMLElement, options: ISCMWidgetOptions): void {
		/**
		let inputOptions: IFindInputOptions = {
			label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search or Escape to cancel'),
			validation: (value: string) => this.validatMessageInput(value),
			placeholder: nls.localize('search.placeHolder', "Search"),
			appendCaseSensitiveLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleCaseSensitiveActionId), this.keyBindingService2),
			appendWholeWordsLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleWholeWordActionId), this.keyBindingService2),
			appendRegexLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleRegexActionId), this.keyBindingService2)
		};
		 */

		let messageInputContainer = dom.append(parent, dom.$('.message-container.input-box'));
		this.messageInput = this._register(new InputBox(messageInputContainer, this.contextViewService, {
			ariaLabel: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview or Escape to cancel'),
			placeholder: nls.localize('search.replace.placeHolder', "Replace")
		}));
		this._register(attachInputBoxStyler(this.messageInput, this.themeService));
		this.messageInput.onKeyUp((keyboardEvent: IKeyboardEvent) => this.onMessageInputKeyUp(keyboardEvent));
		this.messageInput.setValue(options.value || '');
		//this.messageInput.setRegex(!!options.isRegex);
		this.messageInput.setCaseSensitive(!!options.isCaseSensitive);
		this.messageInput.setWholeWords(!!options.isWholeWords);
		/**

		this._register(this.onSubmit(() => {
			this.searchHistory.add(this.messageInput.getValue());
		}));
		 */

		this.messageInputFocusTracker = this._register(dom.trackFocus(this.messageInput.inputBox.inputElement));
		this._register(this.messageInputFocusTracker.addFocusListener(() => {
			this.messageInputBoxFocussed.set(true);
		}));
		this._register(this.messageInputFocusTracker.addBlurListener(() => {
			this.messageInputBoxFocussed.set(false);
		}));
	}

	private renderTagInput(parent: HTMLElement, options: ISCMWidgetOptions): void {
		this.tagContainer = dom.append(parent, dom.$('.tag-container.disabled'));
		let tagBox = dom.append(this.tagContainer, dom.$('.input-box'));
		this.tagInput = this._register(new InputBox(tagBox, this.contextViewService, {
			ariaLabel: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview or Escape to cancel'),
			placeholder: nls.localize('search.replace.placeHolder', "Replace")
		}));
		this._register(attachInputBoxStyler(this.tagInput, this.themeService));
		this.onkeyup(this.tagInput.inputElement, (keyboardEvent) => this.onTagInputKeyUp(keyboardEvent));
		this.tagInput.onDidChange(() => this._onTagValueChanged.fire());
		this.messageInput.inputBox.onDidChange(() => this.onMessageInputChanged());

		//this.replaceAllAction = ReplaceAllAction.INSTANCE;
		//this.replaceAllAction.searchWidget = this;
		//this.replaceAllAction.label = SCMWidget.REPLACE_ALL_DISABLED_LABEL;
		//this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
		//this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });

		this.tagInputFocusTracker = this._register(dom.trackFocus(this.tagInput.inputElement));
		this._register(this.tagInputFocusTracker.addFocusListener(() => {
			this.tagInputBoxFocussed.set(true);
		}));
		this._register(this.tagInputFocusTracker.addBlurListener(() => {
			this.tagInputBoxFocussed.set(false);
		}));
	}
	/**

	triggerReplaceAll(): TPromise<any> {
		this._onReplaceAll.fire();
		return TPromise.as(null);
	}
	 */

	private onToggleTagButton(): void {
		dom.toggleClass(this.tagContainer, 'disabled');
		dom.toggleClass(this.toggleTagButton.getElement(), 'collapse');
		dom.toggleClass(this.toggleTagButton.getElement(), 'expand');
		this.updateTagActiveState();

		this._onTagToggled.fire();
	}

	public setTagActionState(enabled: boolean): void {
		if (this.tagAction.enabled !== enabled) {
		//	this.replaceAllAction.enabled = enabled;
		//	this.replaceAllAction.label = enabled ? SCMWidget.REPLACE_ALL_ENABLED_LABEL(this.keyBindingService2) : SCMWidget.REPLACE_ALL_DISABLED_LABEL;
			this.updateTagActiveState();
		}
	}

	private isTagActive(): boolean {
		return this.tagActive.get();
	}

	private updateTagActiveState(): void {
		let currentState = this.isTagActive();
		let newState = this.isTagActive() && this.tagAction.enabled;
		if (currentState !== newState) {
			this.tagAction.set(newState);
			this._onTagStateChange.fire(newState);
		}
	}

	 /*
	private validatSearchInput(value: string): any {
		if (value.length === 0) {
			return null;
		}
		if (!this.messageInput.getRegex()) {
			return null;
		}
		let regExp: RegExp;
		try {
			regExp = new RegExp(value);
		} catch (e) {
			return { content: e.message };
		}
		if (strings.regExpLeadsToEndlessLoop(regExp)) {
			return { content: nls.localize('regexp.validationFailure', "Expression matches everything") };
		}
	}
*/
	private onMessageInputChanged(): void {
		// TODO:: im getting confused whats whats here.  TagAction vs TagActive
		//this.setTagActionState(false);
	}

	private onMessageInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.submit();
				return;
			case KeyCode.Escape:
				this._onMessageCancel.fire();
				return;
			default:
				return;
		}
	}

	private onTagInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				//this.submitSearch();
				return;
			default:
				return;
		}
	}

	private submit(refresh: boolean = true): void {
		if (this.messageInput.getValue()) {
			this._onSubmit.fire(refresh);
		}
	}

	public dispose(): void {
		this.setTagActionState(false);
		this.tagAction.searchWidget = null;
		this.tagActionBar = null;
		super.dispose();
	}
}

export function registerContributions() {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: ReplaceAllAction.ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.ReplaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBLE),
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Enter,
		handler: accessor => {
			if (isSearchViewletFocussed(accessor.get(IViewletService))) {
				ReplaceAllAction.INSTANCE.run();
			}
		}
	});
}
