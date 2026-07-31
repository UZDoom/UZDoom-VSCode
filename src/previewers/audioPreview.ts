/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { MediaPreview, reopenAsText } from './mediaPreview';
import { escapeAttribute, getNonce } from './util/dom';
import { wavToBase64Uri } from './util/base64';
import { WadFileSystemProvider } from '../wad-provider/WadFileSystemProvider';
import DoomSndDocument from '../doom-wad/Documents/DoomSnd';
import DoomSndLump from '../doom-wad/Lumps/DoomSnd';
import { LoadMode, MatchResult } from '../doom-wad/Lumps/Lump';
import { Utils } from 'vscode-uri';


class AudioPreviewProvider implements vscode.CustomReadonlyEditorProvider {

    public static readonly viewType = 'uzdoom.doomSnd.previewEditor';

    constructor(
        private readonly extensionRoot: vscode.Uri,
        private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        private readonly fsProvider: WadFileSystemProvider,
    ) { }

    public async openCustomDocument(uri: vscode.Uri) {
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, webviewEditor: vscode.WebviewPanel): Promise<void> {
        new AudioPreview(this.extensionRoot, document.uri, webviewEditor, this.binarySizeStatusBarEntry, this.fsProvider);
    }
}


class AudioPreview extends MediaPreview {

    constructor(
        private readonly extensionRoot: vscode.Uri,
        resource: vscode.Uri,
        webviewEditor: vscode.WebviewPanel,
        binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        private readonly fsProvider: WadFileSystemProvider,
    ) {
        super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry);

        this._register(webviewEditor.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'reopen-as-text': {
                    reopenAsText(resource, webviewEditor.viewColumn);
                    break;
                }
            }
        }));

        this.updateBinarySize();
        this.render();
        this.updateState();
    }

    protected async getWebviewContents(): Promise<string> {
        const version = Date.now().toString();
        const settings = {
            src: await this.getResourcePath(this.webviewEditor, this.resource, version),
        };

        const nonce = getNonce();

        const cspSource = this.webviewEditor.webview.cspSource;
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<!-- Disable pinch zooming -->
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

	<title>Audio Preview</title>

	<link rel="stylesheet" href="${escapeAttribute(this.extensionResource('media', 'audioPreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; media-src data: blob: ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
	<meta id="settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container loading" data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
	<div class="loading-indicator"></div>
	<div class="loading-error">
		<p>${vscode.l10n.t("An error occurred while loading the audio file.")}</p>
		<a href="#" class="open-file-link">${vscode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
	</div>
	<script src="${escapeAttribute(this.extensionResource('media', 'audioPreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
    }

    private async getResourcePath(webviewEditor: vscode.WebviewPanel, resource: vscode.Uri, version: string): Promise<string | null> {
        let document: DoomSndDocument | undefined;
        if (resource.scheme === 'wad') {
            const entry = await this.fsProvider.getEntry(resource);
            if (entry && entry.documentType === DoomSndDocument.getDocumentType()) {
                document = entry.getDisplayDocument(resource) as DoomSndDocument;
            }
            if (!document) {
                throw new Error('Invalid resource');
            }
        }
        if (resource.scheme === 'git') {
            const stat = await vscode.workspace.fs.stat(resource);
            if (stat.size === 0) {
                // The file is stored on git lfs
                return null;
            }
        }

        if (!document) {
            let content = await vscode.workspace.fs.readFile(resource);
            let contentBuffer = new Uint8Array(content).buffer;
            let basename = Utils.basename(resource);
            if (DoomSndLump.isThisFormat(basename, contentBuffer, LoadMode.normal) === MatchResult.true) {
                document = new DoomSndDocument(resource, contentBuffer, {});
            } else {
                throw new Error('Invalid resource');
            }
        }
        return wavToBase64Uri(await document.getDisplayContent());
    }

    private extensionResource(...parts: string[]) {
        return this.webviewEditor.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts));
    }
}

export function registerAudioPreviewSupport(context: vscode.ExtensionContext, binarySizeStatusBarEntry: BinarySizeStatusBarEntry, fsProvider: WadFileSystemProvider): vscode.Disposable {
    const provider = new AudioPreviewProvider(context.extensionUri, binarySizeStatusBarEntry, fsProvider);
    return vscode.window.registerCustomEditorProvider(AudioPreviewProvider.viewType, provider, {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
            retainContextWhenHidden: true,
        }
    });
}
