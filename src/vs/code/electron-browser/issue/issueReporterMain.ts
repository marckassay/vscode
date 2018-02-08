/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/issueReporter';
import { shell, ipcRenderer, webFrame, remote } from 'electron';
import { localize } from 'vs/nls';
import { $ } from 'vs/base/browser/dom';
import * as collections from 'vs/base/common/collections';
import * as browser from 'vs/base/browser/browser';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as os from 'os';
import { Disposable } from 'vs/base/common/lifecycle';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IssueReporterModel } from 'vs/code/electron-browser/issue/issueReporterModel';
import { IssueReporterData, IssueReporterStyles, IssueType } from 'vs/platform/issue/common/issue';
import BaseHtml from 'vs/code/electron-browser/issue/issueReporterPage';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { debounce } from 'vs/base/common/decorators';
import * as platform from 'vs/base/common/platform';

const MAX_URL_LENGTH = 5400;

export interface IssueReporterConfiguration extends IWindowConfiguration {
	data: IssueReporterData;
}

export function startup(configuration: IssueReporterConfiguration) {
	document.body.innerHTML = BaseHtml();
	const issueReporter = new IssueReporter(configuration);
	issueReporter.render();
	document.body.style.display = 'block';
}

export class IssueReporter extends Disposable {
	private environmentService: IEnvironmentService;
	private telemetryService: ITelemetryService;
	private issueReporterModel: IssueReporterModel;
	private shouldQueueSearch = true;
	private receivedSystemInfo = false;
	private receivedPerformanceInfo = false;

	constructor(configuration: IssueReporterConfiguration) {
		super();

		this.initServices(configuration);

		this.issueReporterModel = new IssueReporterModel({
			issueType: configuration.data.issueType || IssueType.Bug,
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true,
			includeExtensions: true,
			versionInfo: {
				vscodeVersion: `${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`,
				os: `${os.type()} ${os.arch()} ${os.release()}`
			},
			extensionsDisabled: this.environmentService.disableExtensions,
			reprosWithoutExtensions: false
		});

		ipcRenderer.on('issuePerformanceInfoResponse', (event, info) => {
			this.issueReporterModel.update(info);
			this.receivedPerformanceInfo = true;

			const state = this.issueReporterModel.getData();
			this.updateProcessInfo(state);
			this.updateWorkspaceInfo(state);
			this.updatePreviewButtonState();
		});

		ipcRenderer.on('issueSystemInfoResponse', (event, info) => {
			this.issueReporterModel.update({ systemInfo: info });
			this.receivedSystemInfo = true;

			this.updateSystemInfo(this.issueReporterModel.getData());
			this.updatePreviewButtonState();
		});

		ipcRenderer.send('issueSystemInfoRequest');
		ipcRenderer.send('issuePerformanceInfoRequest');

		if (window.document.documentElement.lang !== 'en') {
			show(document.getElementById('english'));
		}

		this.setEventHandlers();
		this.applyZoom(configuration.data.zoomLevel);
		this.applyStyles(configuration.data.styles);
		this.handleExtensionData(configuration.data.enabledExtensions);
	}

	render(): void {
		(<HTMLSelectElement>document.getElementById('issue-type')).value = this.issueReporterModel.getData().issueType.toString();
		this.renderBlocks();
	}

	private applyZoom(zoomLevel: number) {
		webFrame.setZoomLevel(zoomLevel);
		browser.setZoomFactor(webFrame.getZoomFactor());
		// See https://github.com/Microsoft/vscode/issues/26151
		// Cannot be trusted because the webFrame might take some time
		// until it really applies the new zoom level
		browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
	}

	private applyStyles(styles: IssueReporterStyles) {
		const styleTag = document.createElement('style');
		const content: string[] = [];

		if (styles.inputBackground) {
			content.push(`input[type="text"], textarea, select { background-color: ${styles.inputBackground}; }`);
		}

		if (styles.inputBorder) {
			content.push(`input[type="text"], textarea, select { border: 1px solid ${styles.inputBorder}; }`);
		} else {
			content.push(`input[type="text"], textarea, select { border: 1px solid transparent; }`);
		}

		if (styles.inputForeground) {
			content.push(`input[type="text"], textarea, select { color: ${styles.inputForeground}; }`);
		}

		if (styles.inputErrorBorder) {
			content.push(`.invalid-input, .invalid-input:focus { border: 1px solid ${styles.inputErrorBorder} !important; }`);
			content.push(`.validation-error, .required-input { color: ${styles.inputErrorBorder}; }`);
		}

		if (styles.inputActiveBorder) {
			content.push(`input[type='text']:focus, textarea:focus, select:focus, summary:focus, button:focus  { border: 1px solid ${styles.inputActiveBorder}; outline-style: none; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a, .workbenchCommand { color: ${styles.textLinkColor}; }`);
		}

		if (styles.buttonBackground) {
			content.push(`button { background-color: ${styles.buttonBackground}; }`);
		}

		if (styles.buttonForeground) {
			content.push(`button { color: ${styles.buttonForeground}; }`);
		}

		if (styles.buttonHoverBackground) {
			content.push(`#github-submit-btn:hover:enabled, #github-submit-btn:focus:enabled { background-color: ${styles.buttonHoverBackground}; }`);
		}

		if (styles.textLinkColor) {
			content.push(`a { color: ${styles.textLinkColor}; }`);
		}

		if (styles.sliderBackgroundColor) {
			content.push(`body::-webkit-scrollbar-thumb { background-color: ${styles.sliderBackgroundColor}; }`);
		}

		if (styles.sliderActiveColor) {
			content.push(`body::-webkit-scrollbar-thumb:active { background-color: ${styles.sliderActiveColor}; }`);
		}

		if (styles.sliderHoverColor) {
			content.push(`body::-webkit-scrollbar-thumb:hover { background-color: ${styles.sliderHoverColor}; }`);
		}

		styleTag.innerHTML = content.join('\n');
		document.head.appendChild(styleTag);
		document.body.style.color = styles.color;
	}

	private handleExtensionData(extensions: ILocalExtension[]) {
		const { nonThemes, themes } = collections.groupBy(extensions, ext => {
			const manifestKeys = ext.manifest.contributes ? Object.keys(ext.manifest.contributes) : [];
			const onlyTheme = !ext.manifest.activationEvents && manifestKeys.length === 1 && manifestKeys[0] === 'themes';
			return onlyTheme ? 'themes' : 'nonThemes';
		});

		const numberOfThemeExtesions = themes && themes.length;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes });
		this.updateExtensionTable(nonThemes, numberOfThemeExtesions);

		if (this.environmentService.disableExtensions || extensions.length === 0) {
			(<HTMLButtonElement>document.getElementById('disableExtensions')).disabled = true;
			(<HTMLInputElement>document.getElementById('reproducesWithoutExtensions')).checked = true;
			this.issueReporterModel.update({ reprosWithoutExtensions: true });
		}
	}

	private initServices(configuration: IWindowConfiguration): void {
		const serviceCollection = new ServiceCollection();
		const mainProcessClient = new ElectronIPCClient(String(`window${configuration.windowId}`));

		const windowsChannel = mainProcessClient.getChannel('windows');
		serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));
		this.environmentService = new EnvironmentService(configuration, configuration.execPath);

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${configuration.windowId}`));

		const instantiationService = new InstantiationService(serviceCollection, true);
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const appender = new TelemetryAppenderClient(channel);
			const commonProperties = resolveCommonProperties(product.commit, pkg.version, configuration.machineId, this.environmentService.installSourcePath);
			const piiPaths = [this.environmentService.appRoot, this.environmentService.extensionsPath];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths };

			const telemetryService = instantiationService.createInstance(TelemetryService, config);
			this._register(telemetryService);

			this.telemetryService = telemetryService;
		} else {
			this.telemetryService = NullTelemetryService;
		}
	}

	private setEventHandlers(): void {
		document.getElementById('issue-type').addEventListener('change', (event: Event) => {
			this.issueReporterModel.update({ issueType: parseInt((<HTMLInputElement>event.target).value) });
			this.updatePreviewButtonState();
			this.render();
		});

		['includeSystemInfo', 'includeProcessInfo', 'includeWorkspaceInfo', 'includeExtensions'].forEach(elementId => {
			document.getElementById(elementId).addEventListener('click', (event: Event) => {
				event.stopPropagation();
				this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
			});
		});

		const labelElements = document.getElementsByClassName('caption');
		for (let i = 0; i < labelElements.length; i++) {
			const label = labelElements.item(i);
			label.addEventListener('click', (e) => {
				e.stopPropagation();

				// Stop propgagation not working as expected in this case https://bugs.chromium.org/p/chromium/issues/detail?id=809801
				// preventDefault does prevent outer details tag from toggling, so use that and manually toggle the checkbox
				e.preventDefault();
				const containingDiv = (<HTMLLabelElement>e.target).parentElement;
				const checkbox = <HTMLInputElement>containingDiv.firstElementChild;
				if (checkbox) {
					checkbox.checked = !checkbox.checked;
					this.issueReporterModel.update({ [checkbox.id]: !this.issueReporterModel.getData()[checkbox.id] });
				}
			});
		}

		document.getElementById('reproducesWithoutExtensions').addEventListener('click', (e) => {
			this.issueReporterModel.update({ reprosWithoutExtensions: true });
		});

		document.getElementById('reproducesWithExtensions').addEventListener('click', (e) => {
			this.issueReporterModel.update({ reprosWithoutExtensions: false });
		});

		document.getElementById('description').addEventListener('input', (event: Event) => {
			this.issueReporterModel.update({ issueDescription: (<HTMLInputElement>event.target).value });
		});

		document.getElementById('issue-title').addEventListener('input', (e) => { this.searchGitHub(e); });

		document.getElementById('github-submit-btn').addEventListener('click', () => this.createIssue());

		const disableExtensions = document.getElementById('disableExtensions');
		disableExtensions.addEventListener('click', () => {
			ipcRenderer.send('workbenchCommand', 'workbench.extensions.action.disableAll');
			ipcRenderer.send('workbenchCommand', 'workbench.action.reloadWindow');
		});

		disableExtensions.addEventListener('keydown', (e) => {
			if (e.keyCode === 13 || e.keyCode === 32) {
				ipcRenderer.send('workbenchCommand', 'workbench.extensions.action.disableAll');
				ipcRenderer.send('workbenchCommand', 'workbench.action.reloadWindow');
			}
		});

		const showRunning = document.getElementById('showRunning');
		showRunning.addEventListener('click', () => {
			ipcRenderer.send('workbenchCommand', 'workbench.action.showRuntimeExtensions');
		});

		showRunning.addEventListener('keydown', (e) => {
			if (e.keyCode === 13 || e.keyCode === 32) {
				ipcRenderer.send('workbenchCommand', 'workbench.action.showRuntimeExtensions');
			}
		});

		// Cmd+Enter or Mac or Ctrl+Enter on other platforms previews issue and closes window
		if (platform.isMacintosh) {
			let prevKeyWasCommand = false;
			document.onkeydown = (e: KeyboardEvent) => {
				if (prevKeyWasCommand && e.keyCode === 13) {
					if (this.createIssue()) {
						remote.getCurrentWindow().close();
					}
				}

				prevKeyWasCommand = e.keyCode === 91 || e.keyCode === 93;
			};
		} else {
			document.onkeydown = (e: KeyboardEvent) => {
				if (e.ctrlKey && e.keyCode === 13) {
					if (this.createIssue()) {
						remote.getCurrentWindow().close();
					}
				}
			};
		}
	}

	private updatePreviewButtonState() {
		const submitButton = <HTMLButtonElement>document.getElementById('github-submit-btn');
		if (this.isPreviewEnabled()) {
			submitButton.disabled = false;
			submitButton.textContent = localize('previewOnGitHub', "Preview on GitHub");
		} else {
			submitButton.disabled = true;
			submitButton.textContent = localize('loadingData', "Loading data...");
		}
	}

	private isPreviewEnabled() {
		const issueType = this.issueReporterModel.getData().issueType;
		if (issueType === IssueType.Bug && this.receivedSystemInfo) {
			return true;
		}

		if (issueType === IssueType.PerformanceIssue && this.receivedSystemInfo && this.receivedPerformanceInfo) {
			return true;
		}

		if (issueType === IssueType.FeatureRequest) {
			return true;
		}

		return false;
	}

	@debounce(300)
	private searchGitHub(event: Event): void {
		const title = (<HTMLInputElement>event.target).value;
		const similarIssues = document.getElementById('similar-issues');
		if (title) {
			const query = `is:issue+repo:microsoft/vscode+${title}`;
			window.fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
				response.json().then(result => {
					similarIssues.innerHTML = '';
					if (result && result.items && result.items.length) {
						const issues = $('ul');
						const issuesText = $('div.list-title');
						issuesText.textContent = localize('similarIssues', "Similar issues");

						const { items } = result;
						const numResultsToDisplay = items.length < 5 ? items.length : 5;
						for (let i = 0; i < numResultsToDisplay; i++) {
							const link = $('a', { href: items[i].html_url });
							link.textContent = items[i].title;
							link.addEventListener('click', openLink);
							link.addEventListener('auxclick', openLink);

							const item = $('li', {}, link);
							issues.appendChild(item);
						}

						similarIssues.appendChild(issuesText);
						similarIssues.appendChild(issues);
					} else if (result && result.items) {
						const message = $('div.list-title');
						message.textContent = localize('noResults', "No results found");
						similarIssues.appendChild(message);
					} else {
						const message = $('div.list-title');
						message.textContent = localize('rateLimited', "GitHub query limit exceeded. Please wait.");
						similarIssues.appendChild(message);

						const resetTime = response.headers.get('X-RateLimit-Reset');
						const timeToWait = parseInt(resetTime) - Math.floor(Date.now() / 1000);
						if (this.shouldQueueSearch) {
							this.shouldQueueSearch = false;
							setTimeout(() => {
								this.searchGitHub(event);
								this.shouldQueueSearch = true;
							}, timeToWait * 1000);
						}

						throw new Error(result.message);
					}
				}).catch((error) => {
					this.logSearchError(error);
				});
			}).catch((error) => {
				this.logSearchError(error);
			});
		} else {
			similarIssues.innerHTML = '';
		}
	}

	private logSearchError(error: Error) {
		// TODO: Use LogService here.
		console.log(error);
		/* __GDPR__
		"issueReporterSearchError" : {
				"message" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		*/
		this.telemetryService.publicLog('issueReporterSearchError', { message: error.message });
	}

	private renderBlocks(): void {
		// Depending on Issue Type, we render different blocks and text
		const { issueType } = this.issueReporterModel.getData();
		const systemBlock = document.querySelector('.block-system');
		const processBlock = document.querySelector('.block-process');
		const workspaceBlock = document.querySelector('.block-workspace');
		const extensionsBlock = document.querySelector('.block-extensions');
		const disabledExtensions = document.getElementById('disabledExtensions');

		const descriptionTitle = document.getElementById('issue-description-label');
		const descriptionSubtitle = document.getElementById('issue-description-subtitle');


		if (issueType === IssueType.Bug) {
			show(systemBlock);
			hide(processBlock);
			hide(workspaceBlock);
			show(extensionsBlock);
			show(disabledExtensions);

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('bugDescription', "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else if (issueType === IssueType.PerformanceIssue) {
			show(systemBlock);
			show(processBlock);
			show(workspaceBlock);
			show(extensionsBlock);
			show(disabledExtensions);

			descriptionTitle.innerHTML = `${localize('stepsToReproduce', "Steps to Reproduce")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('performanceIssueDesciption', "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		} else {
			hide(systemBlock);
			hide(processBlock);
			hide(workspaceBlock);
			hide(extensionsBlock);
			hide(disabledExtensions);

			descriptionTitle.innerHTML = `${localize('description', "Description")} <span class="required-input">*</span>`;
			descriptionSubtitle.innerHTML = localize('featureRequestDescription', "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub.");
		}
	}

	private validateInput(inputId: string): boolean {
		const inputElement = (<HTMLInputElement>document.getElementById(inputId));
		if (!inputElement.value) {
			inputElement.classList.add('invalid-input');
			return false;
		} else {
			inputElement.classList.remove('invalid-input');
			return true;
		}
	}

	private validateInputs(): boolean {
		let isValid = true;
		['issue-title', 'description'].forEach(elementId => {
			isValid = this.validateInput(elementId) && isValid;

		});

		return isValid;
	}

	private createIssue(): boolean {
		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
			(<HTMLInputElement>document.getElementsByClassName('invalid-input')[0]).focus();

			document.getElementById('issue-title').addEventListener('input', (event) => {
				this.validateInput('issue-title');
			});

			document.getElementById('description').addEventListener('input', (event) => {
				this.validateInput('description');
			});

			return false;
		}

		if (this.telemetryService) {
			/* __GDPR__
				"issueReporterSubmit" : {
					"issueType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('issueReporterSubmit', { issueType: this.issueReporterModel.getData().issueType });
		}

		const issueTitle = encodeURIComponent((<HTMLInputElement>document.getElementById('issue-title')).value);
		const queryStringPrefix = product.reportIssueUrl.indexOf('?') === -1 ? '?' : '&';
		const baseUrl = `${product.reportIssueUrl}${queryStringPrefix}title=${issueTitle}&body=`;
		const issueBody = this.issueReporterModel.serialize();
		const url = baseUrl + encodeURIComponent(issueBody);

		const lengthValidationElement = document.getElementById('url-length-validation-error');
		if (url.length > MAX_URL_LENGTH) {
			lengthValidationElement.textContent = localize('urlLengthError', "The data exceeds the length limit of {0} characters. The data is length {1}.", MAX_URL_LENGTH, url.length);
			show(lengthValidationElement);
			return false;
		} else {
			hide(lengthValidationElement);
		}

		shell.openExternal(url);
		return true;
	}

	private updateSystemInfo = (state) => {
		const target = document.querySelector('.block-system .block-info');
		let tableHtml = '';
		Object.keys(state.systemInfo).forEach(k => {
			tableHtml += `
				<tr>
					<td>${k}</td>
					<td>${state.systemInfo[k]}</td>
				</tr>`;
		});
		target.innerHTML = `<table>${tableHtml}</table>`;
	}

	private updateProcessInfo = (state) => {
		const target = document.querySelector('.block-process .block-info');

		let tableHtml = `
			<tr>
				<th>pid</th>
				<th>CPU %</th>
				<th>Memory (MB)</th>
				<th>Name</th>
			</tr>`;

		state.processInfo.forEach(p => {
			tableHtml += `
				<tr>
					<td>${p.pid}</td>
					<td>${p.cpu}</td>
					<td>${p.memory}</td>
					<td>${p.name}</td>
				</tr>`;
		});

		target.innerHTML = `<table>${tableHtml}</table>`;
	}

	private updateWorkspaceInfo = (state) => {
		document.querySelector('.block-workspace .block-info code').textContent = '\n' + state.workspaceInfo;
	}

	private updateExtensionTable(extensions: ILocalExtension[], numThemeExtensions: number): void {
		const target = document.querySelector('.block-extensions .block-info');

		if (this.environmentService.disableExtensions) {
			target.innerHTML = localize('disabledExtensions', "Extensions are disabled");
			return;
		}

		const themeExclusionStr = numThemeExtensions ? `\n(${numThemeExtensions} theme extensions excluded)` : '';
		extensions = extensions || [];

		if (!extensions.length) {
			target.innerHTML = 'Extensions: none' + themeExclusionStr;
			return;
		}

		let table = `
			<tr>
				<th>Extension</th>
				<th>Author (truncated)</th>
				<th>Version</th>
			</tr>`;

		extensions.forEach(extension => {
			table += `
				<tr>
					<td>${extension.manifest.name}</td>
					<td>${extension.manifest.publisher.substr(0, 3)}</td>
					<td>${extension.manifest.version}</td>
				</tr>`;
		});

		target.innerHTML = `<table>${table}</table>${themeExclusionStr}`;
	}
}

// helper functions

function hide(el) {
	el.classList.add('hidden');
}
function show(el) {
	el.classList.remove('hidden');
}

function openLink(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	// Exclude right click
	if (event.which < 3) {
		shell.openExternal((<HTMLAnchorElement>event.target).href);
	}
}
