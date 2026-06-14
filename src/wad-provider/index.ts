import { npath } from '@yarnpkg/fslib';
import * as vscode from 'vscode';

import { WadFileSystemProvider } from './WadFileSystemProvider';

const IS_READONLY = true;

function mount(uri: vscode.Uri) {
    const wadUri = WadFileSystemProvider.CreateWadUri(uri.fsPath, '');

    if (vscode.workspace.getWorkspaceFolder(wadUri) === undefined) {
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, {
            name: npath.basename(wadUri.fsPath),
            uri: wadUri,
        });
    }
}

function unmount(uri: vscode.Uri): void {
    const wadUri = WadFileSystemProvider.CreateWadUri(uri.fsPath, '');

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(wadUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(`Cannot unmount ${wadUri.fsPath}: not mounted`);
        return;
    }

    if (!vscode.workspace.workspaceFolders)
        throw new Error(`Assertion failed: workspaceFolders is undefined`);

    // When calling `updateWorkspaceFolders`, vscode still keeps the "workspace mode" even if a single folder remains which is quite annoying.
    // Because of this, we execute `vscode.openFolder` to open the workspace folder.
    if (vscode.workspace.workspaceFolders.length === 2) {
        const otherFolder = vscode.workspace.workspaceFolders.find(folder => folder.index !== workspaceFolder.index)!;

        vscode.commands.executeCommand(`vscode.openFolder`, otherFolder.uri, { forceNewWindow: false });
    } else {
        vscode.workspace.updateWorkspaceFolders(workspaceFolder.index, 1);
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Until a more specific activation event exists this requires onStartupFinished
    let provider = new WadFileSystemProvider();
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider(`wad`, provider, {
        isCaseSensitive: false,
        isReadonly: IS_READONLY,
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`wad.mountWadFile`, (uri: vscode.Uri) => {
        mount(uri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`wad.unmountWadFile`, (uri: vscode.Uri) => {
        unmount(uri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`wad.mountWadEditor`, () => {
        mount(vscode.window.activeTextEditor!.document.uri);
    }));
    return provider;
}
