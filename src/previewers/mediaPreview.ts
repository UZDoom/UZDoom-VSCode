/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { Disposable } from './util/dispose';
import WadDocument from '../doom-wad/Documents/WadDocument';
import ImageDocument from '../doom-wad/Documents/ImageDocument';
import { contentTypeToBase64Uri } from './util/base64';
import { WadFileSystemProvider } from '../wad-provider/WadFileSystemProvider';
import DocumentFactory from '../doom-wad/Documents/DocumentFactory';

export function reopenAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined) {
    vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
}

export const enum PreviewState {
    Disposed,
    Visible,
    Active,
}

export abstract class MediaPreview extends Disposable {

    protected previewState = PreviewState.Visible;
    private _binarySize: number | undefined;
    protected cachedDocument: WadDocument | undefined;
    protected fsProvider: WadFileSystemProvider;

    constructor(
        extensionRoot: vscode.Uri,
        protected readonly resource: vscode.Uri,
        protected readonly webviewEditor: vscode.WebviewPanel,
        private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
        fsProvider: WadFileSystemProvider,
        cachedDoc: WadDocument | undefined,

    ) {
        super();

        this.cachedDocument = cachedDoc;
        this.fsProvider = fsProvider;

        webviewEditor.webview.options = {
            enableScripts: true,
            enableForms: false,
            localResourceRoots: [
                Utils.dirname(resource),
                extensionRoot,
            ]
        };

        this._register(webviewEditor.onDidChangeViewState(() => {
            this.updateState();
        }));

        this._register(webviewEditor.onDidDispose(() => {
            this.previewState = PreviewState.Disposed;
            this.dispose();
        }));

        const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(resource, '*')));
        this._register(watcher.onDidChange(e => {
            if (e.toString() === this.resource.toString()) {
                this.updateBinarySize();
                this.render();
            }
        }));

        this._register(watcher.onDidDelete(e => {
            if (e.toString() === this.resource.toString()) {
                this.webviewEditor.dispose();
            }
        }));


    }

    public override dispose() {
        super.dispose();
        this.binarySizeStatusBarEntry.hide(this);
    }

    protected updateBinarySize() {
        vscode.workspace.fs.stat(this.resource).then(({ size }) => {
            this._binarySize = size;
            this.updateState();
        });
    }

    protected async render() {
        if (this.previewState === PreviewState.Disposed) {
            return;
        }

        let content = await this.getWebviewContents();
        if (this.previewState as PreviewState === PreviewState.Disposed) {
            return;
        }

        this.webviewEditor.webview.html = content;
    }

    protected abstract getWebviewContents(): Promise<string>;

    protected updateState() {
        if (this.previewState === PreviewState.Disposed) {
            return;
        }

        if (this.webviewEditor.active) {
            this.previewState = PreviewState.Active;
            this.binarySizeStatusBarEntry.show(this, this._binarySize);
        } else {
            this.binarySizeStatusBarEntry.hide(this);
            this.previewState = PreviewState.Visible;
        }
    }


    public zoomIn() {
    }

    public zoomOut() {
    }

    public copyImage() {
    }

    public static async getDocument(resource: vscode.Uri, fsProvider: WadFileSystemProvider): Promise<WadDocument | undefined> {
        if (resource.scheme === 'git') {
            const stat = await vscode.workspace.fs.stat(resource);
            if (stat.size === 0) {
                return undefined;
            }
        }

        if (resource.scheme === 'wad') {
            const entry = await fsProvider.getEntry(resource);
            if (entry && (entry.documentType === 'DoomGfx' || entry.documentType === 'DoomFlat')) {
                return entry.getDisplayDocument(resource) as ImageDocument;
            }
        }

        let content = await vscode.workspace.fs.readFile(resource);
        let contentBuffer = new Uint8Array(content).buffer;
        let name = Utils.basename(resource);
        // remove the extension
        name = name.replace(/\.[^.]+$/, '');
        let doc = DocumentFactory.create(resource, name, contentBuffer, {});
        return doc;
    }


    protected async retrieveDocument(resource: vscode.Uri): Promise<WadDocument | undefined> {
        let document = this.cachedDocument;
        this.cachedDocument = undefined;

        if (!document) {
            document = await MediaPreview.getDocument(resource, this.fsProvider);
            if (!document) {
                return undefined;
            }
        }

        return document;
    }

    protected async getResourcePath(resource: vscode.Uri): Promise<string | undefined> {
        let document = await this.retrieveDocument(resource);
        if (!document) {
            return undefined;
        }
        return contentTypeToBase64Uri(document.displayContentType, await document.getDisplayContent());
    }

}
