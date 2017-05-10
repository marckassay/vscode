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
import * as Constants from 'vs/workbench/parts/search/common/constants';
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
	private tagInputBoxFocussed: IContextKey<boolean>;
	private tagInput: InputBox; //  replaceInput : InputBox

	public messageInputFocusTracker: dom.IFocusTracker;
	public tagInputFocusTracker: dom.IFocusTracker;

	private tagContainer: HTMLElement;
	private toggleTagButton: Button;
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
		this.replaceActive = Constants.ReplaceActiveKey.bindTo(this.keyBindingService);
		this.searchInputBoxFocussed = Constants.SearchInputBoxFocussedKey.bindTo(this.keyBindingService);
		this.replaceInputBoxFocussed = Constants.ReplaceInputBoxFocussedKey.bindTo(this.keyBindingService);
		this.render(container, options);
	}

	public focus(select: boolean = true, focusReplace: boolean = false): void {
		if ((!focusReplace && this.messageInput.inputBox.hasFocus())
			|| (focusReplace && this.replaceInput.hasFocus())) {
			return;
		}

		if (focusReplace && this.isReplaceShown()) {
			this.replaceInput.focus();
			if (select) {
				this.replaceInput.select();
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
		this.replaceInput.width = width - 28;
	}

	public clear() {
		this.messageInput.clear();
		this.replaceInput.value = '';
		this.setReplaceAllActionState(false);
	}

	public isReplaceShown(): boolean {
		return !dom.hasClass(this.replaceContainer, 'disabled');
	}

	public getReplaceValue(): string {
		return this.replaceInput.value;
	}

	public toggleReplace(show?: boolean): void {
		if (show === void 0 || show !== this.isReplaceShown()) {
			this.onToggleReplaceButton();
		}
	}

	public showNextSearchTerm() {
		let next = this.searchHistory.next();
		if (next) {
			this.messageInput.setValue(next);
		}
	}

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

	public searchInputHasFocus(): boolean {
		return this.searchInputBoxFocussed.get();
	}

	public replaceInputHasFocus(): boolean {
		return this.replaceInput.hasFocus();
	}

	private render(container: Builder, options: ISCMWidgetOptions): void {
		this.domNode = container.div({ 'class': 'search-widget' }).style({ position: 'relative' }).getHTMLElement();
		this.renderToggleReplaceButton(this.domNode);

		this.renderSearchInput(this.domNode, options);
		this.renderReplaceInput(this.domNode);
	}

	private renderToggleReplaceButton(parent: HTMLElement): void {
		this.toggleReplaceButton = this._register(new Button(parent));
		attachButtonStyler(this.toggleReplaceButton, this.themeService, {
			buttonBackground: SIDE_BAR_BACKGROUND,
			buttonHoverBackground: SIDE_BAR_BACKGROUND
		});
		this.toggleReplaceButton.icon = 'toggle-replace-button collapse';
		this.toggleReplaceButton.addListener('click', () => this.onToggleReplaceButton());
		this.toggleReplaceButton.getElement().title = nls.localize('search.replace.toggle.button.title', "Toggle Replace");
	}

	private renderSearchInput(parent: HTMLElement, options: ISCMWidgetOptions): void {
		let inputOptions: IFindInputOptions = {
			label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search or Escape to cancel'),
			validation: (value: string) => this.validatSearchInput(value),
			placeholder: nls.localize('search.placeHolder', "Search"),
			appendCaseSensitiveLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleCaseSensitiveActionId), this.keyBindingService2),
			appendWholeWordsLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleWholeWordActionId), this.keyBindingService2),
			appendRegexLabel: appendKeyBindingLabel('', this.keyBindingService2.lookupKeybinding(Constants.ToggleRegexActionId), this.keyBindingService2)
		};

		let searchInputContainer = dom.append(parent, dom.$('.search-container.input-box'));
		this.messageInput = this._register(new FindInput(searchInputContainer, this.contextViewService, inputOptions));
		this._register(attachFindInputBoxStyler(this.messageInput, this.themeService));
		this.messageInput.onKeyUp((keyboardEvent: IKeyboardEvent) => this.onSearchInputKeyUp(keyboardEvent));
		this.messageInput.setValue(options.value || '');
		this.messageInput.setRegex(!!options.isRegex);
		this.messageInput.setCaseSensitive(!!options.isCaseSensitive);
		this.messageInput.setWholeWords(!!options.isWholeWords);
		this._register(this.onSubmit(() => {
			this.searchHistory.add(this.messageInput.getValue());
		}));

		this.searchInputFocusTracker = this._register(dom.trackFocus(this.messageInput.inputBox.inputElement));
		this._register(this.searchInputFocusTracker.addFocusListener(() => {
			this.searchInputBoxFocussed.set(true);
		}));
		this._register(this.searchInputFocusTracker.addBlurListener(() => {
			this.searchInputBoxFocussed.set(false);
		}));
	}

	private renderReplaceInput(parent: HTMLElement): void {
		this.replaceContainer = dom.append(parent, dom.$('.replace-container.disabled'));
		let replaceBox = dom.append(this.replaceContainer, dom.$('.input-box'));
		this.replaceInput = this._register(new InputBox(replaceBox, this.contextViewService, {
			ariaLabel: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview or Escape to cancel'),
			placeholder: nls.localize('search.replace.placeHolder', "Replace")
		}));
		this._register(attachInputBoxStyler(this.replaceInput, this.themeService));
		this.onkeyup(this.replaceInput.inputElement, (keyboardEvent) => this.onReplaceInputKeyUp(keyboardEvent));
		this.replaceInput.onDidChange(() => this._onReplaceValueChanged.fire());
		this.messageInput.inputBox.onDidChange(() => this.onSearchInputChanged());

		this.replaceAllAction = ReplaceAllAction.INSTANCE;
		this.replaceAllAction.searchWidget = this;
		this.replaceAllAction.label = SCMWidget.REPLACE_ALL_DISABLED_LABEL;
		this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
		this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });

		this.replaceInputFocusTracker = this._register(dom.trackFocus(this.replaceInput.inputElement));
		this._register(this.replaceInputFocusTracker.addFocusListener(() => {
			this.replaceInputBoxFocussed.set(true);
		}));
		this._register(this.replaceInputFocusTracker.addBlurListener(() => {
			this.replaceInputBoxFocussed.set(false);
		}));
	}

	triggerReplaceAll(): TPromise<any> {
		this._onReplaceAll.fire();
		return TPromise.as(null);
	}

	private onToggleReplaceButton(): void {
		dom.toggleClass(this.replaceContainer, 'disabled');
		dom.toggleClass(this.toggleReplaceButton.getElement(), 'collapse');
		dom.toggleClass(this.toggleReplaceButton.getElement(), 'expand');
		this.updateReplaceActiveState();
		this._onReplaceToggled.fire();
	}

	public setReplaceAllActionState(enabled: boolean): void {
		if (this.replaceAllAction.enabled !== enabled) {
			this.replaceAllAction.enabled = enabled;
			this.replaceAllAction.label = enabled ? SCMWidget.REPLACE_ALL_ENABLED_LABEL(this.keyBindingService2) : SCMWidget.REPLACE_ALL_DISABLED_LABEL;
			this.updateReplaceActiveState();
		}
	}

	private isReplaceActive(): boolean {
		return this.replaceActive.get();
	}

	private updateReplaceActiveState(): void {
		let currentState = this.isReplaceActive();
		let newState = this.isReplaceShown() && this.replaceAllAction.enabled;
		if (currentState !== newState) {
			this.replaceActive.set(newState);
			this._onReplaceStateChange.fire(newState);
		}
	}

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

	private onSearchInputChanged(): void {
		this.setReplaceAllActionState(false);
	}

	private onSearchInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.submitSearch();
				return;
			case KeyCode.Escape:
				this._onSearchCancel.fire();
				return;
			default:
				return;
		}
	}

	private onReplaceInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.submitSearch();
				return;
			default:
				return;
		}
	}

	private submitSearch(refresh: boolean = true): void {
		if (this.messageInput.getValue()) {
			this._onSubmit.fire(refresh);
		}
	}

	public dispose(): void {
		this.setReplaceAllActionState(false);
		this.replaceAllAction.searchWidget = null;
		this.replaceActionBar = null;
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
