'use strict';

import * as vscode from 'vscode';
import { GameConfigurationProvider } from './GameDebugConfigProvider';

const LAUNCH_JSON_PATH = '.vscode/launch.json';

function isLaunchJson(document: vscode.TextDocument): boolean {
    const uri = document.uri;
    if (uri.scheme !== 'file') {
        return false;
    }
    const path = uri.fsPath;
    return path.endsWith(LAUNCH_JSON_PATH) || path.replace(/\\/g, '/').endsWith(LAUNCH_JSON_PATH);
}
const launchJsonDocumentSelector: vscode.DocumentSelector = [{
    scheme: 'file',
    language: 'jsonc',
    pattern: '**/launch.json'
}];


export function activateDebugConfigSnippetsProvider(context: vscode.ExtensionContext): void {
    const provider: vscode.CompletionItemProvider = {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
            _token: vscode.CancellationToken,
            _context: vscode.CompletionContext
        ): vscode.CompletionItem[] | undefined {
            if (!isLaunchJson(document)) {
                return undefined;
            }

            const items: vscode.CompletionItem[] = [];

            const descriptors = GameConfigurationProvider.getDefaultConfigurationDescriptors();
            for (let descriptor of descriptors) {
                const item = new vscode.CompletionItem(descriptor.label, vscode.CompletionItemKind.Module);
                item.detail = descriptor.description;
                item.documentation = new vscode.MarkdownString(descriptor.description);
                let text = JSON.stringify(descriptor.body, null, 2);
                text = text.replace("\"${workspaceFolder}\"", "\"\${workspaceFolder}\"");
                item.insertText = text + ",";
                items.push(item);
            }
            return items;
        },
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            launchJsonDocumentSelector,
            provider
        )
    );
}
