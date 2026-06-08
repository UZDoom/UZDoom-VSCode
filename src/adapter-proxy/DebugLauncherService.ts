import { ChildProcess, spawn } from 'node:child_process';
import waitPort from 'wait-port';
import findProcess from 'find-process';
import { lsof, ProcessInfo } from 'list-open-files';
import path from 'path';
import { CancellationToken, DummyCancellationToken } from './IDEInterface';
import { GameVersion, GameVersionChecker } from '../debug/GameVersionChecker';

export enum DebugLaunchState {
    success,
    launcherError,
    gameFailedToStart,
    gameExitedBeforeOpening,
    gameVersionNotDetected,
    gameVersionNotSupported,
    multipleGamesRunning,
    cancelled,
}
export interface IDebugLauncherService {
    tearDownAfterDebug(): Promise<boolean>;
    runLauncher(
        launcherCommand: LaunchCommand,
        portToCheck: number,
        cancellationToken?: CancellationToken
    ): Promise<DebugLaunchState>;
    getLaunchCommandFromRunningProcess(port: number, game_name: string): Promise<LaunchCommand | undefined>;
}

export interface LaunchCommand {
    command: string;
    args: string[];
    cwd?: string;
}
export class DebugLauncherService implements IDebugLauncherService {

    // TODO: Move this stuff into the global Context
    private cancellationToken: CancellationToken | undefined;
    public launcherProcess: ChildProcess | undefined;
    public gameVersion: GameVersion | undefined;
    private _gamePID: number | undefined;
    private gameName: string = '';
    // @ts-ignore
    private _errorString: string = '';

    public get gamePID(): number | undefined {
        return this._gamePID;
    }

    public get errorString(): string {
        return this._errorString;
    }

    constructor() {
    }
    public reset() {
        this.gameVersion = undefined;
        this.launcherProcess = undefined;
        this._gamePID = undefined;
        this.gameName = "";
        this._errorString = '';
    }

    async getGameIsRunning(game_name: string) {
        if (!game_name) {
            return false;
        }
        // check if we're on windows

        if (game_name.toLowerCase().endsWith('.exe')) {
            game_name = game_name.slice(0, -4);
        }

        const processList = await findProcess('name', game_name, false);
        return processList.length > 0;
    }

    async getGamePIDs(game_name: string): Promise<Array<number>> {
        if (!game_name) {
            return [];
        }
        if (game_name.endsWith('.exe')) {
            game_name = game_name.slice(0, -4);
        }
        const gameProcesses = await findProcess('name', game_name, false);

        if (gameProcesses.length === 0) {
            return [];
        }

        return gameProcesses.map((p) => p.pid);
    }

    async getLaunchCommandFromRunningProcess(port: number, game_name: string): Promise<LaunchCommand | undefined> {
        if (!game_name) {
            return undefined;
        }
        if (game_name.endsWith('.exe')) {
            game_name = game_name.slice(0, -4);
        }
        let process = await findProcess('port', port, false);
        if (process.length === 0) {
            // just look for the game name
            process = await findProcess('name', game_name, false);
            if (process.length === 0) {
                return undefined;
            } else if (process.length > 1) {
                console.error(`Found multiple ${game_name} processes running on port ${port}`);
            }
        }
        let argv: string[] = []
        // we need to split on spaces, but not between single or double quotes
        let quote = '';
        let currentArg = '';
        for (let char of process[0]?.cmd || '') {
            if (char === '"' || char === "'") {
                if (quote === '') {
                    quote = char;
                } else if (char === quote) {
                    quote = '';
                    char = ' ';
                }
            }
            if (char === ' ' && quote === '') {
                if (currentArg) {
                    argv.push(currentArg);
                    currentArg = '';
                }
            } else {
                currentArg += char;
            }
        }
        if (currentArg) {
            argv.push(currentArg);
        }
        let launchCommand: LaunchCommand = {
            command: argv[0],
            args: argv.slice(1)
        }
        try {
            let thing: ProcessInfo[] = await lsof({ pids: [process[0]?.pid] })
            if (thing.length == 0) {
                return launchCommand;
            }
            launchCommand.cwd = thing[0].process.cwd?.name || "";
            return launchCommand;
        } catch (e) {
            console.error(e);
            return launchCommand;
        }
    }

    async removeProcessListeners() {
        if (this.launcherProcess) {
            this.launcherProcess.removeAllListeners();
            this.launcherProcess.stdout?.removeAllListeners();
            this.launcherProcess.stderr?.removeAllListeners();
        }
    }

    async tearDownAfterDebug() {
        if (this.launcherProcess) {
            this.removeProcessListeners();
            try {
                if (this.launcherProcess.kill()) {
                    this.reset();
                } else if (this.launcherProcess.kill('SIGKILL')) {
                    this.reset();
                }
            } catch (e) {
                console.error(e);
            }
        }

        if (this.gameName && await this.getGameIsRunning(this.gameName)) {
            let pids = await this.getGamePIDs(this.gameName);
            let retris = 0;
            while (pids.length > 0 && retris < 5) {
                for (let pid of pids) {
                    try {
                        if (retris == 0) {
                            process.kill(pid);
                        } else {
                            process.kill(pid, 'SIGKILL');
                        }
                    } catch (e) {
                        /* empty */
                    }
                }
                retris++;
                pids = await this.getGamePIDs(this.gameName);
            }
            if (pids.length > 0) {
                console.error(`Failed to kill game process after 5 retries`);
            }
        }

        this.reset();

        return true;
    }

    async keepSleepingUntil(startTime: number, timeout: number) {
        const currentTime = new Date().getTime();

        if (currentTime > startTime + timeout) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        return true;
    }

    async cancelLaunch() {
        if (this.cancellationToken) {
            this.cancellationToken.isCancellationRequested = true;
            if (this.cancellationToken instanceof DummyCancellationToken) {
                this.cancellationToken.cancel();
            }
        }
    }

    processExitedWithError() {
        return !this.launcherProcess || (this.launcherProcess.exitCode !== null && this.launcherProcess.exitCode !== 0)
    }

    async waitFor(conditionCheckCallback: () => boolean | Promise<boolean>, interval: number = 100, connectionTimeout: number = 15000, intervalCallback: () => boolean | Promise<boolean> = () => true) {
        let result = false;
        const startTime: number = new Date().getTime();
        while (true) {
            const currentTime = new Date().getTime();
            const timedOut = currentTime > startTime + connectionTimeout;
            if (timedOut) {
                return false;
            } else {
                const intervalStartTime = new Date().getTime();
                result = await conditionCheckCallback();
                if (result || !(await intervalCallback())) {
                    break;
                }
                const intervalElapsedTime = new Date().getTime() - intervalStartTime;
                if (intervalElapsedTime < interval) {
                    await new Promise((resolve) => setTimeout(resolve, interval - intervalElapsedTime));
                }
            }
        }
        return result;
    }

    /**
     *
     * @param port
     * @param connectionTimeout
     * @param intervalCallback called every 1000ms if we've failed to open the port, but haven't timed out yet; returns true if we should keep waiting
     * @param interval the interval to wait between checks
     * @returns true if the port was opened, false if we timed out
     */
    async waitForPort(port: number, connectionTimeout: number = 15000, intervalCallback: () => boolean | Promise<boolean> = () => true, interval: number = 1000): Promise<boolean> {
        return await this.waitFor(async () => {
            return (await waitPort({
                host: 'localhost',
                port: port,
                timeout: Math.min(interval, connectionTimeout),
                interval: Math.min(interval, connectionTimeout),
                output: 'silent',
            })).open;
        }, 0, connectionTimeout, intervalCallback);
    }

    /**
     *
     * @param connectionTimeout
     * @param intervalCallback called every 1000ms if we've failed to open the port, but haven't timed out yet; returns true if we should keep waiting
     * @param interval the interval to wait between checks
     * @returns true if the port was opened, false if we timed out
     */
    async waitForGameToStart(connectionTimeout: number = 15000, intervalCallback: () => boolean | Promise<boolean> = () => true): Promise<boolean> {
        return await this.waitFor(async () => {
            return await this.getGameIsRunning(this.gameName);
        }, 0, connectionTimeout, intervalCallback);
    }


    CountInString(str: string, pattern: string): number {
        return (str.match(new RegExp(pattern, 'g')) || []).length;
    }

    async runLauncher(
        launcherCommand: LaunchCommand,
        portToCheck: number,
        cancellationToken: CancellationToken | undefined
    ): Promise<DebugLaunchState> {
        await this.tearDownAfterDebug();
        if (!cancellationToken) {
            cancellationToken = new DummyCancellationToken();
        }
        this.cancellationToken = cancellationToken;
        const cmd = launcherCommand.command;
        // get the file name from the command
        this.gameName = path.basename(cmd);
        if (this.gameName.toLowerCase().endsWith('.exe')) {
            this.gameName = this.gameName.slice(0, -4);
        }
        const args = launcherCommand.args;
        const port = portToCheck;
        let _output: string = '';
        let _stdOut: string = '';
        let _stdErr: string = '';
        this.launcherProcess = spawn(cmd, args, {
            cwd: launcherCommand.cwd,
        });
        let gameIsRunning = true;
        let errorOccured = false;
        let exitCode: number | null = null;
        this.launcherProcess.on('close', (code) => {
            gameIsRunning = false;
            errorOccured = true;
            exitCode = code;
        });
        this.launcherProcess.on('error', (error) => {
            console.error(error);
            _stdErr += error.toString();
            _output += error.toString();
            this._errorString = error.toString();
            gameIsRunning = false;
            errorOccured = true;
        });
        this.launcherProcess.stdout?.on('data', (data) => {
            let dataString = data.toString();
            console.log(dataString);
            _stdOut += dataString;
            _output += dataString;
        });
        this.launcherProcess.stderr?.on('data', (data) => {
            let dataString = data.toString();
            console.error(dataString);
            _stdErr += dataString;
            _output += dataString;
        });

        const _processHasExited = () => {
            if (errorOccured || !this.launcherProcess || !this.launcherProcess.stdout || !this.launcherProcess.stderr) {
                return true;
            }
            return false;
        };
        const _checkBad = () => {
            if (_processHasExited()) {
                return true;
            }
            if (cancellationToken.isCancellationRequested) {
                return true;
            }
            return false;
        };
        const _handleBad = async () => {
            this.removeProcessListeners();
            if (cancellationToken.isCancellationRequested) {
                await this.tearDownAfterDebug();
                this._errorString = '';
                return DebugLaunchState.cancelled;
            }
            if (_processHasExited()) {
                const previousErrorString = this._errorString;
                exitCode = this.launcherProcess?.exitCode || exitCode || -1
                this._errorString = `Launcher process exited with error code ${exitCode}.`;
                if (previousErrorString && previousErrorString !== this._errorString) {
                    this._errorString += `\nReason: ${previousErrorString}`
                } else if (_stdErr) {
                    this._errorString += `\nReason: ${_stdErr}`;
                }
                const errOutput = _stdErr || _output;
                this._errorString += `\n\ncmd: ${cmd}\n\nargs: ${args.join(' ')}`;
                if (errOutput) {
                    this._errorString += `\n\noutput:\n${errOutput}`;
                }
                return DebugLaunchState.launcherError;
            }
            await this.tearDownAfterDebug();
            return DebugLaunchState.gameFailedToStart;
        };
        if (_checkBad()) {
            return await _handleBad();
        }
        const GameStartTimeout = 15000;
        // get the current system time
        gameIsRunning = await this.waitForGameToStart(GameStartTimeout, () => {
            return !_checkBad();
        });
        if (!gameIsRunning || _checkBad()) {
            return await _handleBad();
        }
        // we can't get the PID of the game from the launcher process because
        // both MO2 and the script extender loaders fork and deatch the game process
        const gamePIDs = await this.getGamePIDs(this.gameName);
        if (gamePIDs.length === 0) {
            return await _handleBad();
        }
        if (gamePIDs.length > 1) {
            return DebugLaunchState.multipleGamesRunning;
        }
        this._gamePID = gamePIDs[0];

        // wait until we have at least one line of output
        if (!(await this.waitFor(() => this.CountInString(_stdOut, '\n') > 0, 100, 15000, () => !_checkBad()))) {
            return await _handleBad();
        }
        this.gameVersion = GameVersionChecker.getGameVersionFromOutput(_stdOut);
        if (!this.gameVersion) {
            await this.tearDownAfterDebug();
            this._errorString = `Could not determine ${this.gameName} version.`;
            return DebugLaunchState.gameVersionNotDetected;
        }
        if (!GameVersionChecker.versionSupportsDebugger(this.gameVersion)) {
            await this.tearDownAfterDebug();
            this._errorString = `${this.gameName} version ${GameVersionChecker.toString(this.gameVersion)} does not support debugging. Please grab the latest nightly build from https://devbuilds.drdteam.org/uzdoom/.`;
            return DebugLaunchState.gameVersionNotSupported;
        }

        // game has launched, now we wait for the port to open
        const connectionTimeout = 15000;
        let result = false;
        result = await this.waitForPort(port, connectionTimeout, async () => {
            if (cancellationToken.isCancellationRequested) {
                return false;
            }
            gameIsRunning = await this.getGameIsRunning(this.gameName);
            return gameIsRunning;
        });
        if (!gameIsRunning || _checkBad()) {
            return await _handleBad();
        }
        return result ? DebugLaunchState.success : DebugLaunchState.gameFailedToStart;
    }
}
