'use strict';

import * as vscode from 'vscode';
import { activateDebugAdapterDescriptorFactory } from './debug/GameDebugAdapterDescriptorFactory';
import { activateDehackedFoldingProvider } from './language/dehackedFoldingProvider';
import { activateDebugConfigSnippetsProvider } from './debug/DebugConfigSnippetsProvider';
import { registerGameDebugConfigurationProvider } from './debug/GameDebugConfigProvider';
import { activate as activateWadProvider } from './wad-provider/index';
import { activate as activatePk3Provider } from './pk3-provider/index';
import { activate as activatePreviewers, registerAllLumpsAssociations } from './previewers/extension';
/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */

export function activate(context: vscode.ExtensionContext) {
    // Read-only WAD mounter
    let wadprovider = activateWadProvider(context);
    // Previewers
    activatePreviewers(context, wadprovider);
    // PK3 mounter
    activatePk3Provider(context);
    // Dehacked folding provider
	activateDehackedFoldingProvider(context);
    // Game debug configuration provider
    registerGameDebugConfigurationProvider(context);
    // Debug config snippets provider
    activateDebugConfigSnippetsProvider(context);
    // Debug adapter descriptor factory
    activateDebugAdapterDescriptorFactory(context);
    // Register all lumps associations
    registerAllLumpsAssociations();
}

export function deactivate() {
	// nothing to do
}
