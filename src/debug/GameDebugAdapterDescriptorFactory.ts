
'use strict';

import * as vscode from 'vscode';
import { CancellationToken } from 'vscode';
import { GameDebugAdapterProxy, GameDebugAdapterProxyOptions } from './GameDebugAdapterProxy';
import { DebugLauncherService, DebugLaunchState, LaunchCommand } from '../adapter-proxy/DebugLauncherService';
import { DEFAULT_PORT, isBuiltinPK3File, ProjectItem, GAME_NAME, getLaunchCommand as getGameLaunchCommand } from './GameDefs';
import { VSCodeFileAccessor as WorkspaceFileAccessor } from '../adapter-proxy/VSCodeInterface';
import { windowManager } from "../WindowManager";
import { GameVersion, GameVersionChecker } from './GameVersionChecker';

const debugLauncherService = new DebugLauncherService();
const workspaceFileAccessor = new WorkspaceFileAccessor();

export function activateDebugAdapterDescriptorFactory(context: vscode.ExtensionContext) {
    const factory = new GameInlineDebugAdapterFactory();

    // register a dynamic configuration provider for game debug type
    if (!factory) {
        throw new Error('No debug adapter factory');
    }
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(`${GAME_NAME}`, factory));
    if ('dispose' in factory && typeof factory.dispose === 'function') {
        // @ts-ignore
        context.subscriptions.push(factory);
    }

}


const sleep = (time: number) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, time);
    });
}



function cancellableWindow(title: string, timeout: number, timeoutMessage?: string, ourCancellationToken?: CancellationToken) {
    return vscode.window.withProgress({
        title: title,
        location: vscode.ProgressLocation.Notification,
        cancellable: !!ourCancellationToken
    },
        async (progress, token) => {
            return new Promise((async (resolve) => {
                let cancel_func = () => {
                    if (timeoutMessage) {
                        vscode.window.showInformationMessage(timeoutMessage);
                    }
                    resolve(false);
                    return;
                }
                token.onCancellationRequested(cancel_func);
                ourCancellationToken?.onCancellationRequested(cancel_func);
                const seconds = timeout;
                for (let i = 0; i < seconds; i++) {
                    await sleep(100);
                }
                resolve(true);
            }));
        });
}

const noopExecutable = new vscode.DebugAdapterExecutable('node', ['-e', '""']);

class GameInlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    // map of session id to previous command
    private previousCmd: Map<string, LaunchCommand> = new Map();

    async ensureGameRunning(port: number) {
        if (!(await debugLauncherService.waitForPort(port, 1000))) {
            let cancellationSource = new vscode.CancellationTokenSource();
            let cancellationToken = cancellationSource.token;

            let resolved = false;
            cancellableWindow(
                `Make sure that ${GAME_NAME} is running and is either in-game or at the main menu.`,
                65000,
                undefined,
                cancellationToken
            ).then((result) => {
                resolved = true;
            });
            let result = false;
            // now while the user is deciding, keep checking if the game is running
            result = await debugLauncherService.waitForPort(port, 60000, () => {
                return !resolved;
            });
            // i.e. the user didn't cancel the window
            if (!resolved) {
                cancellationSource.cancel();
                return result;
            }
            return false;
        }
        // sleep(1000);
        return true;
    }

    async resolveProjects(projects: ProjectItem[]) {
        for (let project of projects) {
            if (!project.archive) {
                throw new Error(`Project archive for '${project.path}' does not exist.`);
            }
            if (!await workspaceFileAccessor.isDirectory(project.archive) && !await workspaceFileAccessor.isFile(project.archive) && !isBuiltinPK3File(project.archive)) {
                throw new Error(`Project archive '${project.archive}' could not be found.`);
            }
        }
    }

    async WarnIfProjectsMissing(projects: ProjectItem[]) {
        let missing_projects: string[] = [];
        for (let project of projects) {
            if (!await workspaceFileAccessor.isDirectory(project.archive) && !await workspaceFileAccessor.isFile(project.archive) && !isBuiltinPK3File(project.archive)) {
                missing_projects.push(project.archive);
            }
        }
        if (missing_projects.length > 0) {
            cancellableWindow(`The following projects could not be found, you may experience errors when launching or debugging: ${missing_projects.join(', ')}.`, 7000);
        }
    }

    async createDebugAdapterDescriptor(_session: vscode.DebugSession): Promise<vscode.DebugAdapterDescriptor> {
        // macos requires accessibility permission for re-focusing the window after execution resumes
        // no need to check for platform, windowManager.requestAccessibility() is a no-op on non-macos
        windowManager.requestAccessibility();

        let options = _session.configuration as GameDebugAdapterProxyOptions;
        if (!_session.configuration.projects) {
            if (!_session.workspaceFolder) {
                throw new Error('No project path provided.');
            }
        }
        options.consoleLogLevel = 'debug';
        let launched: DebugLaunchState = DebugLaunchState.success;
        let launchCommand: LaunchCommand | undefined = undefined;
        let reattach = false;
        let pid = 0;
        try {
            if (options.request === 'attach' && this.previousCmd.has(_session.id)) {
                reattach = true;
                launchCommand = this.previousCmd.get(_session.id);
            } else if (options.request === 'launch') {
                if (!options.cwd) {
                    options.cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                }
                launchCommand = getGameLaunchCommand(
                    options.gamePath,
                    options.iwad,
                    options.projects.map(p => p.archive),
                    options.port,
                    options.map,
                    options.configPath,
                    options.additionalArgs,
                    options.cwd
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error resolving projects: ${error}`);
            _session.configuration.noop = true;
            return noopExecutable;
        }

        let gameVersion: GameVersion | undefined = undefined;

        let checkVersionInGameOutput = (output: string) => {
            if (!output || output.trim() === '') {
                return true; // not enough output yet
            }
            gameVersion = GameVersionChecker.getGameVersionFromOutput(output);
            if (!gameVersion) {
                return true; // not enough output yet
            }
            if (!GameVersionChecker.versionSupportsDebugger(gameVersion)) {
                return false; // Does not support debugging
            }
            return true; // Supports debugging
        }

        let shouldLaunch = options.request === 'launch' || reattach;
        if (shouldLaunch) {
            await this.resolveProjects(options.projects);
            const cancellationSource = new vscode.CancellationTokenSource();
            const cancellationToken = cancellationSource.token;
            const port = options.port || DEFAULT_PORT;
            const wait_message = vscode.window.setStatusBarMessage(
                `Waiting for ${GAME_NAME} to start...`,
                30000
            );
            launched = await debugLauncherService.runLauncher(launchCommand!, port, { outputCheckCallback: checkVersionInGameOutput }, cancellationToken);
            wait_message.dispose();
            pid = debugLauncherService.gamePID || 0;
        }
        if (launched != DebugLaunchState.success) {
            let errMessage = '';
            if (launched === DebugLaunchState.cancelled) {
                _session.configuration.noop = true;
                return noopExecutable;
            }
            errMessage = debugLauncherService.errorString || `${GAME_NAME} failed to launch.`;
            if (launched === DebugLaunchState.multipleGamesRunning) {
                errMessage = `Multiple ${GAME_NAME} instances are running, shut them down and try again.`;
            } else if (launched === DebugLaunchState.outputCheckFailed) {
                errMessage = `${GAME_NAME} version ${GameVersionChecker.toString(gameVersion!)} does not support debugging. Please grab the latest nightly build from https://devbuilds.drdteam.org/uzdoom/.`;
            }
            throw new Error(errMessage);
        } else { // attach
            if (!(await this.ensureGameRunning(options.port))) {
                _session.configuration.noop = true;
                return noopExecutable;
            } else if (options.request === 'attach') {
                // await this.WarnIfProjectsMissing(options.projects);
                if ((await debugLauncherService.getGameIsRunning(GAME_NAME))) {
                    let pids = await debugLauncherService.getGamePIDs(GAME_NAME);
                    pid = pids[0];
                    let launchCommand = await debugLauncherService.getLaunchCommandFromRunningProcess(options.port, GAME_NAME);
                    if (launchCommand) {
                        this.previousCmd.set(_session.id, launchCommand);
                    }
                }
            }
        }
        var config = options as GameDebugAdapterProxyOptions;
        config.launcherProcess = debugLauncherService.launcherProcess;
        config.pid = pid;


        config.startNow = false;
        let proxy = new GameDebugAdapterProxy(workspaceFileAccessor, config);
        proxy.start();
        return new vscode.DebugAdapterInlineImplementation(
            proxy
        );
    }
}
