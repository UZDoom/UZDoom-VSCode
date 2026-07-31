/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from '../binarySizeStatusBarEntry';
import { MediaPreview, PreviewState, reopenAsText } from '../mediaPreview';
import { escapeAttribute, getNonce } from '../util/dom';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { Scale, ZoomStatusBarEntry } from './zoomStatusBarEntry';
import { WadFileSystemProvider } from '../../wad-provider/WadFileSystemProvider';
import { contentTypeToBase64Uri } from '../util/base64';
import ImageDocument, { MultipleImagesImageDocument } from '../../doom-wad/Documents/ImageDocument';
import { WadDocument } from '../../doom-wad';

export class PreviewManager implements vscode.CustomReadonlyEditorProvider {

    public static readonly viewType = 'uzdoom.doomLump.previewEditor';

    private readonly _previews = new Set<MediaPreview>();
    private _activePreview: MediaPreview | undefined;

    constructor(
        private readonly extensionRoot: vscode.Uri,
        private readonly sizeStatusBarEntry: SizeStatusBarEntry,
        private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
        private readonly fsProvider: WadFileSystemProvider,
    ) { }

    public async openCustomDocument(uri: vscode.Uri) {
        return { uri, dispose: () => { } };
    }

    private async getPreviewer(realDoc: WadDocument | undefined, uri: vscode.Uri, webviewEditor: vscode.WebviewPanel): Promise<MediaPreview | undefined> {
        if (!realDoc) {
            return new DummyPreview(this.extensionRoot, uri, webviewEditor, this.binarySizeStatusBarEntry, this.fsProvider);
        }
        if (realDoc.displayContentType.startsWith('image/')) {
            return new ImagePreview(this.extensionRoot, uri, webviewEditor, this.sizeStatusBarEntry, this.binarySizeStatusBarEntry, this.zoomStatusBarEntry, this.fsProvider, realDoc as ImageDocument);
        } else if (realDoc.displayContentType.startsWith('audio/')) {
            return new AudioPreview(this.extensionRoot, uri, webviewEditor, this.binarySizeStatusBarEntry, this.fsProvider, realDoc);
        }
        return undefined;
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewEditor: vscode.WebviewPanel,
    ): Promise<void> {
        const realDoc = await MediaPreview.getDocument(document.uri, this.fsProvider);
        const preview = await this.getPreviewer(realDoc, document.uri, webviewEditor);
        if (!preview) {
            throw new Error('Unsupported resource type!');
        }
        this._previews.add(preview);
        this.setActivePreview(preview);

        webviewEditor.onDidDispose(() => { this._previews.delete(preview); });

        webviewEditor.onDidChangeViewState(() => {
            if (webviewEditor.active) {
                this.setActivePreview(preview);
            } else if (this._activePreview === preview && !webviewEditor.active) {
                this.setActivePreview(undefined);
            }
        });
    }

    public get activePreview() { return this._activePreview; }

    private setActivePreview(value: MediaPreview | undefined): void {
        this._activePreview = value;
    }

}

class DummyPreview extends MediaPreview {
    constructor(extensionRoot: vscode.Uri, resource: vscode.Uri, webviewEditor: vscode.WebviewPanel, binarySizeStatusBarEntry: BinarySizeStatusBarEntry, fsProvider: WadFileSystemProvider) {
        super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry, fsProvider, undefined);
    }
    protected override async getWebviewContents(): Promise<string> {
        return /* html */`<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Dummy Preview</title>
                </head>
                <body>
                    <p>Could not preview this file.</p>
                </body>
                </html>`;
    }
}

class ImagePreview extends MediaPreview {

    private _imageSize: string | undefined;
    private _imageZoom: Scale | undefined;

    private readonly emptyPngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42gEFAPr/AP///wAI/AL+Sr4t6gAAAABJRU5ErkJggg==';

    constructor(
        private readonly extensionRoot: vscode.Uri,
        resource: vscode.Uri,
        webviewEditor: vscode.WebviewPanel,
        private readonly sizeStatusBarEntry: SizeStatusBarEntry,
        binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
        fsProvider: WadFileSystemProvider,
        cachedDocument: WadDocument | undefined,
    ) {
        super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry, fsProvider, cachedDocument);

        this._register(webviewEditor.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'size': {
                    this._imageSize = message.value;
                    this.updateState();
                    break;
                }
                case 'zoom': {
                    this._imageZoom = message.value;
                    this.updateState();
                    break;
                }
                case 'reopen-as-text': {
                    reopenAsText(resource, webviewEditor.viewColumn);
                    break;
                }
            }
        }));

        this._register(zoomStatusBarEntry.onDidChangeScale(e => {
            if (this.previewState === PreviewState.Active) {
                this.webviewEditor.webview.postMessage({ type: 'setScale', scale: e.scale });
            }
        }));

        this._register(webviewEditor.onDidChangeViewState(() => {
            this.webviewEditor.webview.postMessage({ type: 'setActive', value: this.webviewEditor.active });
        }));

        this._register(webviewEditor.onDidDispose(() => {
            if (this.previewState === PreviewState.Active) {
                this.sizeStatusBarEntry.hide(this);
                this.zoomStatusBarEntry.hide(this);
            }
            this.previewState = PreviewState.Disposed;
        }));

        this.updateBinarySize();
        this.render();
        this.updateState();
    }

    public override dispose(): void {
        super.dispose();
        this.sizeStatusBarEntry.hide(this);
        this.zoomStatusBarEntry.hide(this);
    }

    public override zoomIn() {
        if (this.previewState === PreviewState.Active) {
            this.webviewEditor.webview.postMessage({ type: 'zoomIn' });
        }
    }

    public override zoomOut() {
        if (this.previewState === PreviewState.Active) {
            this.webviewEditor.webview.postMessage({ type: 'zoomOut' });
        }
    }

    public override copyImage() {
        if (this.previewState === PreviewState.Active) {
            this.webviewEditor.reveal();
            this.webviewEditor.webview.postMessage({ type: 'copyImage' });
        }
    }

    protected override updateState() {
        super.updateState();

        if (this.previewState === PreviewState.Disposed) {
            return;
        }

        if (this.webviewEditor.active) {
            this.sizeStatusBarEntry.show(this, this._imageSize || '');
            this.zoomStatusBarEntry.show(this, this._imageZoom || 'fit');
        } else {
            this.sizeStatusBarEntry.hide(this);
            this.zoomStatusBarEntry.hide(this);
        }
    }
    protected override async render(): Promise<void> {
        await super.render();
        this.webviewEditor.webview.postMessage({ type: 'setActive', value: this.webviewEditor.active });
    }

    private async getResourcePaths(doc: MultipleImagesImageDocument): Promise<string[]> {
        let src: string[] = [];
        for (let i = 0; i < doc.numberOfImages; i++) {
            src.push(contentTypeToBase64Uri(doc.getImageContentType(i), await doc.getImage(i)));
        }
        return src;
    }

    protected override async getResourcePath(resource: vscode.Uri): Promise<string | undefined> {
        return await super.getResourcePath(resource) || this.emptyPngDataUri;
    }

    protected override async getWebviewContents(): Promise<string> {
        if (!this.cachedDocument) {
            this.cachedDocument = await MediaPreview.getDocument(this.resource, this.fsProvider);
        }
        const settings = {};

        if (this.cachedDocument && (this.cachedDocument as ImageDocument).multipleImages) {
            let doc: MultipleImagesImageDocument = this.cachedDocument as MultipleImagesImageDocument;
            settings['src'] = await this.getResourcePaths(doc);
        } else {
            settings['src'] = await this.getResourcePath(this.resource);
        }

        const nonce = getNonce();

        const cspSource = this.webviewEditor.webview.cspSource;
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">

	<!-- Disable pinch zooming -->
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

	<title>Image Preview</title>

	<link rel="stylesheet" href="${escapeAttribute(this.extensionResource('media', 'imagePreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; connect-src ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
	<meta id="image-preview-settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container image scale-to-fit loading" data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
	<div class="loading-indicator"></div>
	<div class="image-load-error">
		<p>${vscode.l10n.t("An error occurred while loading the image.")}</p>
		<a href="#" class="open-file-link">${vscode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
	</div>
	<script src="${escapeAttribute(this.extensionResource('media', 'imagePreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
    }


    private extensionResource(...parts: string[]) {
        return this.webviewEditor.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts));
    }
}


class AudioPreview extends MediaPreview {

    constructor(
        private readonly extensionRoot: vscode.Uri,
        resource: vscode.Uri,
        webviewEditor: vscode.WebviewPanel,
        binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        fsProvider: WadFileSystemProvider,
        cachedDocument: WadDocument | undefined,
    ) {
        super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry, fsProvider, cachedDocument);

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
        const settings = {
            src: await this.getResourcePath(this.resource),
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

    private extensionResource(...parts: string[]) {
        return this.webviewEditor.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts));
    }
}

export function registerLumpPreviewSupport(context: vscode.ExtensionContext, binarySizeStatusBarEntry: BinarySizeStatusBarEntry, fsProvider: WadFileSystemProvider): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];

    const sizeStatusBarEntry = new SizeStatusBarEntry();
    disposables.push(sizeStatusBarEntry);

    const zoomStatusBarEntry = new ZoomStatusBarEntry();
    disposables.push(zoomStatusBarEntry);

    const previewManager = new PreviewManager(context.extensionUri, sizeStatusBarEntry, binarySizeStatusBarEntry, zoomStatusBarEntry, fsProvider);

    disposables.push(vscode.window.registerCustomEditorProvider(PreviewManager.viewType, previewManager, {
        supportsMultipleEditorsPerDocument: true,
    }));

    disposables.push(vscode.window.registerCustomEditorProvider(PreviewManager.viewType + '.option', previewManager, {
        supportsMultipleEditorsPerDocument: true,
    }));


    disposables.push(vscode.commands.registerCommand('uzdoom.doomLump.zoomIn', () => {
        previewManager.activePreview?.zoomIn();
    }));

    disposables.push(vscode.commands.registerCommand('uzdoom.doomLump.zoomOut', () => {
        previewManager.activePreview?.zoomOut();
    }));

    disposables.push(vscode.commands.registerCommand('uzdoom.doomLump.copyImage', () => {
        previewManager.activePreview?.copyImage();
    }));

    return vscode.Disposable.from(...disposables);
}
