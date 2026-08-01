/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerLumpPreviewSupport, PreviewManager } from './LumpPreview';
import { WadFileSystemProvider } from '../wad-provider/WadFileSystemProvider';
import { Utils } from 'vscode-uri';
import DocumentFactory from '../doom-wad/Documents/DocumentFactory';
import { WadDocument } from '../doom-wad';

export function activate(context: vscode.ExtensionContext, fsProvider: WadFileSystemProvider) {
    const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
    context.subscriptions.push(binarySizeStatusBarEntry);

    context.subscriptions.push(registerLumpPreviewSupport(context, binarySizeStatusBarEntry, fsProvider));
}


export function registerEditorAssociations(lumpUris: Map<vscode.Uri, { name: string, type: string }>) {
    if (lumpUris.size > 0) {
        const SECTION = 'workbench';
        const KEY = 'editorAssociations';
        let config = vscode.workspace.getConfiguration(SECTION);
        let value: Record<string, string> | undefined = config.get<Record<string, string>>(KEY);
        if (!value) {
            value = {};
        } else {
            value = Object.assign({}, value);
        }
        for (const uri of lumpUris.keys()) {
            if (uri.scheme === "file") {
                value[Utils.basename(uri)] = PreviewManager.viewType;
            } else {
                value[uri.toString()] = PreviewManager.viewType;
            }
        }
        config.update(KEY, value, vscode.ConfigurationTarget.Workspace);
    }
}

export function registerFileAssociations(lumpUris: Map<vscode.Uri, { name: string, type: string }>) {
    if (lumpUris.size > 0) {
        const SECTION = 'files';
        const KEY = 'associations';
        let config = vscode.workspace.getConfiguration(SECTION);
        let value: Record<string, string> | undefined = config.get<Record<string, string>>(KEY);
        if (!value) {
            value = {};
        } else {
            value = Object.assign({}, value);
        }
        for (const [_uri, { name, type }] of lumpUris) {
            value[name] = type;
        }
        config.update(KEY, value, vscode.ConfigurationTarget.Workspace);
    }
}

export async function registerAllLumpsAssociations() {
    const files = await vscode.workspace.findFiles("**/*");
    const matches: Map<vscode.Uri, { name: string, type: string }> = new Map();
    for (const file of files) {
        if (file.scheme === "wad") continue;
        const extname = Utils.extname(file).toLowerCase();

        if (extname !== '' && extname !== '.lmp') continue;
        // remove the extension
        const name = Utils.basename(file).replace(extname, '');
        // we're looking for anything that looks like a lump name; e.g. the letters are all uppercase and it has no extension,
        // or it has the '.lmp' extension
        if (extname !== '.lmp' && name.toUpperCase() !== name) continue;


        const content = await vscode.workspace.fs.readFile(file);
        const constructor = DocumentFactory.getDocumentConstructor(name, new Uint8Array(content).buffer);
        if (constructor !== WadDocument) {
            matches.set(file, { name: name, type: constructor.getDocumentType() });
        }
    }
    registerEditorAssociations(matches);
    registerFileAssociations(matches);
}
