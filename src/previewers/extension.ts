/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerLumpPreviewSupport } from './LumpPreview';
import { WadFileSystemProvider } from '../wad-provider/WadFileSystemProvider';

export function activate(context: vscode.ExtensionContext, fsProvider: WadFileSystemProvider) {
    const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
    context.subscriptions.push(binarySizeStatusBarEntry);

    context.subscriptions.push(registerLumpPreviewSupport(context, binarySizeStatusBarEntry, fsProvider));
}
