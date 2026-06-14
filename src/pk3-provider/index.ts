import { npath } from '@yarnpkg/fslib';
import * as vscode from 'vscode';

import { registerTerminalLinkProvider } from './TerminalLinkProvider';
import { Pk3FSProvider } from './Pk3FSProvider';

function mount(uri: vscode.Uri) {
    if (!Pk3FSProvider.handlesArchive(uri)) {
        throw new Error(`Cannot mount ${uri.fsPath}: not a valid PK3 file`);
    }
    const base = npath.basename(uri.fsPath);
    const pk3Uri = Pk3FSProvider.pathToURI(uri.fsPath, '');

    // throw new Error(`Test URI: ${pk3Uri.toString()}, FS Path: ${fsPath}`);
    if (vscode.workspace.getWorkspaceFolder(pk3Uri) === undefined) {
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, {
            name: base,
            uri: pk3Uri,
        });
    }
}

function unmount(uri: vscode.Uri): void {
    const pk3Uri = Pk3FSProvider.pathToURI(uri.fsPath, '');

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(pk3Uri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(`Cannot unmount ${pk3Uri.fsPath}: not mounted`);
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
    let provider = new Pk3FSProvider();
    context.subscriptions.push(registerTerminalLinkProvider());

    context.subscriptions.push(vscode.workspace.registerFileSystemProvider(`pk3`, provider, {
        isCaseSensitive: false,
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`pk3fs.mountPk3File`, (uri: vscode.Uri) => {
        mount(uri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`pk3fs.unmountPk3File`, (uri: vscode.Uri) => {
        unmount(uri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`pk3fs.mountPk3Editor`, () => {
        mount(vscode.window.activeTextEditor!.document.uri);
    }));
    return provider;
}
