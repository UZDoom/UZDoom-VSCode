/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerAudioPreviewSupport } from './audioPreview';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerImagePreviewSupport } from './imagePreview';
import { WadFileSystemProvider } from '../wad-provider/WadFileSystemProvider';

export function activate(context: vscode.ExtensionContext, fsProvider: WadFileSystemProvider) {
    const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
    context.subscriptions.push(binarySizeStatusBarEntry);

    context.subscriptions.push(registerImagePreviewSupport(context, binarySizeStatusBarEntry, fsProvider));
    context.subscriptions.push(registerAudioPreviewSupport(context, binarySizeStatusBarEntry, fsProvider));
}
