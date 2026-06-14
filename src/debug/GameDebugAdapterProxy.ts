/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-prototype-builtins */
import { DebugProtocol as DAP, } from '@vscode/debugprotocol';
import { GAME_LABEL_NAME, GAME_NAME, gzpath as path } from './GameDefs';
import { DAPLogLevel, DebugAdapterProxy, DebugAdapterProxyOptions } from '../adapter-proxy/DebugAdapterProxy';
import { Response, Message } from '@vscode/debugadapter/lib/messages';
import * as chalk_d from 'chalk';
import { FileAccessor, Emitter } from '../adapter-proxy/IDEInterface';
import { ProjectItem } from './GameDefs';
import { Window, windowManager } from "../WindowManager"
import { CaselessMap } from '../common/CaselessSets';

export enum ErrorDestination {
    User = 1,
    Telemetry = 2,
}

export interface GameDebugAdapterProxyOptions extends DebugAdapterProxyOptions {
    // array of projectItems or a single string
    projects: Array<ProjectItem>;
}

type responseCallback = (response: DAP.Response, request: DAP.Request) => void;

interface pendingRequest {
    cb: responseCallback;
    request: DAP.Request;
    noLogResponse: boolean;
}

const GAME_DAP_LOCALE = {
    linesStartAt1: true,
    columnsStartAt1: true,
    pathsAreURIs: false,
};
const DEFAULT_TIMEOUT = 1000000;

const TEXTCOLOR_ESCAPE = '\x1c';

const colorCodeToHexMap = {
    "A": '#A52A2A', // BRICK
    "B": '#D2B48C', // TAN
    "C": '#808080', // GRAY
    "D": '#008000', // GREEN
    "E": '#A52A2A', // BROWN
    "F": '#FFD700', // GOLD
    "G": '#FF0000', // RED
    "H": '#3838FF', // BLUE
    "I": '#FFA500', // ORANGE
    "J": '#FFFFFF', // WHITE
    "K": '#FFFF00', // YELLOW
    "L": '#808080', // UNTRANSLATED
    "M": '#000000', // BLACK
    "N": '#ADD8E6', // LIGHTBLUE
    "O": '#FFFDD0', // CREAM
    "P": '#808000', // OLIVE
    "Q": '#006400', // DARKGREEN
    "R": '#8B0000', // DARKRED
    "S": '#654321', // DARKBROWN
    "T": '#800080', // PURPLE
    "U": '#A9A9A9', // DARKGRAY
    "V": '#00FFFF', // CYAN
    "W": '#F0FFFF', // ICE
    "X": '#FF4500', // FIRE
    "Y": '#0F52BA', // SAPPHIRE
    "Z": '#008080'  // TEAL
}
const TEXTCOLOR_NORMAL = "-";
const TEXTCOLOR_BOLD = "+";
// @ts-ignore
const TEXTCOLOR_CHAT = "*";
// @ts-ignore
const TEXTCOLOR_TEAMCHAT = "!";

const chalk: chalk_d.ChalkInstance = chalk_d.default.constructor({ enabled: true, level: 2 });

// The color remains the same until a new color is set
// for each range of characters between color codes, we need to create a colorized string and append it to the result
function colorize_log_output(value: string) {
    let result = '';
    let currentColor = '#F0FFFF';
    let currentBold = false;
    // let currentChat = false;
    // let currentTeamChat = false;

    // Split the string by color codes
    const parts = value.split(TEXTCOLOR_ESCAPE);
    if (parts.length <= 1) {
        return chalk.hex(currentColor)(value);
    }
    if (parts[0].length !== 0) {
        // default color, pop it off
        result += chalk.hex(currentColor)(parts.shift());
    } else {
        parts.shift();
    }
    for (const part of parts) {
        if (part.length === 0) {
            continue;
        }

        // Check if the part starts with a color code
        const colorCode = part[0].toUpperCase();
        if (colorCode in colorCodeToHexMap) {
            // Set the new color
            currentColor = colorCodeToHexMap[colorCode];
        } else if (colorCode === TEXTCOLOR_NORMAL) {
            // Reset to default color
            currentBold = false;
        } else if (colorCode === TEXTCOLOR_BOLD) {
            // Toggle bold
            currentBold = true;
            // } else if (colorCode === TEXTCOLOR_CHAT) {
            //     // Toggle chat mode
            //     currentChat = true;
            //     currentTeamChat = false;
            // } else if (colorCode === TEXTCOLOR_TEAMCHAT) {
            //     // Toggle team chat mode
            //     currentTeamChat = true;
            //     currentChat = false;
        }
        var new_str = chalk.hex(currentColor)(part.slice(1));
        if (currentBold) {
            new_str = chalk.bold(new_str);
        }
        result += new_str;
    }

    return result;
}


interface SourceItem {
    path: string;
    origin: ProjectItem;
}

export class GameDebugAdapterProxy extends DebugAdapterProxy {

    private _pendingRequestsMap = new Map<number, pendingRequest>();
    private onFinishedScanning: Emitter<number | null> = new Emitter<number | null>();
    private done_scanning_project = false;
    private launch_request_sent = false;
    private onSentLaunchRequest: Emitter<number | null> = new Emitter<number | null>();
    // Set of strings
    private sourcePaths: CaselessMap<SourceItem> = new CaselessMap<SourceItem>();
    private logServerToProxyReal: DAPLogLevel = 'info';
    private workspaceFileAccessor: FileAccessor;
    private projects: ProjectItem[];
    // TODO: Use this eventually
    // @ts-ignore
    private loadedModules: DAP.Module[] = [];

    // object name to source map
    constructor(fileAccessor: FileAccessor, options: GameDebugAdapterProxyOptions) {
        const logdir = path.join(
            process.env.USERPROFILE || process.env.HOME || '.',
            'Documents',
            'My Games',
            `${GAME_LABEL_NAME}`,
            'Logs',
            'DAProxy'
        );

        options.logdir = options.logdir || logdir;
        options.debuggerLocale = GAME_DAP_LOCALE;
        super(options);
        if (!options.projects) {
            throw new Error('projectPath is required');
        }
        this.workspaceFileAccessor = fileAccessor;
        this.projects = options.projects;
        this.scanProjectDirectoryForFiles(this.projects);
        // get the base name of the project archive
        this.clientCaps.adapterID = `${GAME_NAME}`;
        this.logClientToProxy = 'info';
        this.logProxyToServer = 'trace';
        this.logServerToProxyReal = 'info';
        this.logServerToProxy = 'silent'; // we take care of this ourselves
        this.logProxyToClient = 'trace';
    }

    getWindow(): Window | undefined {
        const windows = windowManager.getWindows();
        for (const window of windows) {
            if (window.processId == this.pid) {
                return window;
            }
        }
        return undefined;
    }

    focusGameWindow() {
        const window = this.getWindow();
        if (!window) {
            return;
        }
        window.bringToTop();
    }

    processProjectItems(options: GameDebugAdapterProxyOptions) {
    }

    clearExecutionState() {
    }

    //overrides base class
    handleMessageFromServer(message: DAP.ProtocolMessage): void {
        if (message.type == 'response') {
            const response = <DAP.Response>message;
            const pending = this._pendingRequestsMap.get(response.request_seq);
            // The callbacks should handle all the responses we need to translate into the expected response objects
            if (pending) {
                this._pendingRequestsMap.delete(response.request_seq);
                // check if this is a scopes request
                if (response.success === false && pending.request.command === 'scopes') {
                    // just ignore it, it likely happened because of a request for scopes that went out before a debug step happened
                    // we don't send a response since the client will invalidate the current variables view if we do and it will forget about it anyway
                    this.log('warn', this.getLogObj(message), '!!!!IGNORED FAILED SCOPES RESPONSE');
                    return;
                }
                if (response.success === false && this.logRequestOnErrorResponse) {
                    this.log('warn', this.getLogObj(pending.request), '!!!!FAILED_REQUEST:');
                } else if (!pending.noLogResponse) {
                    this.log(this.logServerToProxyReal, this.getLogObj(message), '---SERVER->PROXY:');
                }
                pending.cb(response, pending.request);
                return;
            }
            // just in case
            this.logwarn('!!!SERVER->PROXY - Received response with no callback!!!');
            this.sendMessageToClient(response);
        } else if (message.type == 'event') {
            let event = message as DAP.Event;
            if (event.event == 'output') {
                // Don't log output events
                this.handleOutputEvent(event as DAP.OutputEvent);
            } else {
                this.log(this.logServerToProxyReal, this.getLogObj(message), '---SERVER->PROXY:');
                if (event.event == 'loadedSource') {
                    const response = event as DAP.LoadedSourceEvent;
                    response.body.source = this.convertDebuggerSourceToClient(response.body.source as DAP.Source);
                    event = response;
                } else if (event.event == 'continued') {
                    this.focusGameWindow();
                }
                this.sendMessageToClient(event);
            }
        } else {
            this.log(this.logServerToProxyReal, this.getLogObj(message), '---SERVER->PROXY:');
            this.sendMessageToClient(message);
        }
    }


    //overrides base class
    protected handleMessageFromClient(message: DAP.ProtocolMessage): void {
        const pmessage = message as DAP.ProtocolMessage;
        if (pmessage.type === 'request') {
            this.handleClientRequest(pmessage as DAP.Request);
        } else {
            // TODO: handle other message types
            this.sendMessageToServer(pmessage);
        }
    }

    handleOutputEvent(message: DAP.OutputEvent) {
        // The output messages don't have newlines, so just append one.
        // TODO: something with the rest of the fields?
        // if it doesn't end with a newline, add one
        if (message.body.output) {
            if (!message.body.output.endsWith('\n')) {
                message.body.output += '\n';
            }
            message.body.output = colorize_log_output(message.body.output);
        }
        this.sendMessageToClient(message);
    }

    protected sendErrorResponse(
        response: DAP.Response,
        codeOrMessage: number | DAP.Message,
        format?: string,
        variables?: any,
        dest: ErrorDestination = ErrorDestination.User
    ): void {
        let msg: DAP.Message;
        if (typeof codeOrMessage === 'number') {
            msg = <DAP.Message>{
                id: <number>codeOrMessage,
                format: format,
            };
            if (variables) {
                msg.variables = variables;
            }
            if (dest & ErrorDestination.User) {
                msg.showUser = true;
            }
            if (dest & ErrorDestination.Telemetry) {
                msg.sendTelemetry = true;
            }
        } else {
            msg = codeOrMessage;
        }

        response.success = false;
        response.message = DebugAdapterProxy.formatPII(msg.format, true, msg.variables || {});
        if (!response.body) {
            response.body = {};
        }
        response.body.error = msg;
        this.log(
            'error',
            `***PROXY->CLIENT - Request '${response.command}' (seq: ${response.request_seq}) Failed: ${response.message}`
        );
        this.sendMessageToClient(response, true);
    }

    public sendRequestToServerWithCB(
        request: DAP.Request,
        timeout: number,
        cb: responseCallback,
        nolog: boolean = false
    ): void {
        this.sendMessageToServer(request, nolog);
        // check if cb
        this._pendingRequestsMap.set(request.seq, { cb, request, noLogResponse: nolog });
        if (timeout > 0) {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                const pending = this._pendingRequestsMap.get(request.seq);
                if (pending?.cb) {
                    this._pendingRequestsMap.delete(request.seq);
                    pending.cb(new Response(request, 'timeout'), pending.request);
                }
            }, timeout);
        }
    }

    public sendRunInTerminalRequest(
        args: DAP.RunInTerminalRequestArguments,
        timeout: number,
        _cb: (response: DAP.RunInTerminalResponse) => void
    ) {
        const request = <DAP.RunInTerminalRequest>new Message('request');
        request.arguments = args;
        this.sendRequestToServerWithCB(request, timeout, (r, _req) => {
            r.command = 'runInTerminal';
        });
    }

    protected async scanProjectDirectoryForFiles(projectDirectories: ProjectItem[]) {
        for (let project of projectDirectories) {
            if (typeof project === 'string' || !project.archive) {
                throw new Error('Project archive path is required.');
            }
            if (await this.workspaceFileAccessor.isDirectory(project.archive)) {
                if (!project.archive.endsWith('/')) {
                    project.archive += '/';
                }
            }
        }
        this.projects = projectDirectories;
        this.projects.sort((a, b) => b.path.length - a.path.length);
        const roots = projectDirectories.map((x) => x.path);
        const file_glob = '**/*.{zs,zsc,zc,acs,dec,deh}';
        // load the project directory
        const thing = await this.workspaceFileAccessor.findFiles(file_glob, '**/node_modules/**', 100000, true, roots);
        const decorates = await this.workspaceFileAccessor.findFiles('**/DECORATE', '**/node_modules/**', 100000, true, roots);
        const acs = await this.workspaceFileAccessor.findFiles('**/ACS', '**/node_modules/**', 100000, true, roots);
        const dehacked = await this.workspaceFileAccessor.findFiles('**/DEHACKED', '**/node_modules/**', 100000, true, roots);
        const combined = thing.concat(decorates).concat(acs).concat(dehacked);
        let items = combined.map((x) => {
            const srcPath = path.normalize(x);
            // find the project directory this starts with
            const projectItem = this.getProjectBySrcPath(srcPath);
            const item = { path: srcPath, origin: projectItem } as SourceItem;
            return [srcPath, item] as [string, SourceItem];
        });
        this.sourcePaths = new CaselessMap<SourceItem>(items);
        this.done_scanning_project = true;
        this.onFinishedScanning.fire(null);
    }

    protected handleLaunchRequest(request: DAP.LaunchRequest): void {
        this.clearExecutionState();
        this.handleLaunchOrAttach(request);
    }
    protected handleAttachRequest(request: DAP.AttachRequest): void {
        this.clearExecutionState();
        this.handleLaunchOrAttach(request);
    }
    private handleLaunchOrAttach(request: DAP.Request): void {
        if (!this.done_scanning_project) {
            this.onFinishedScanning.once(() => {
                this.handleLaunchOrAttach(request);
            });
            return;
        }

        // vscode apparently doesn't do anything with the 'modulesRequest', so we have to send it ourselves
        this.onSentLaunchRequest.once(() => {
            const modulesRequest = <DAP.ModulesRequest>new Message('request');
            modulesRequest.command = 'modules';
            modulesRequest.arguments = {};
            this.handleModulesRequest(modulesRequest, false);
        })
        // send it on
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            this.launch_request_sent = true;
            this.onSentLaunchRequest.fire(null);
            this._defaultResponseHandler(r);
        });
    }

    protected handleClientRequest(request: DAP.Request): void {
        try {
            // check if it contains "break"
            if (request.command === 'launch') {
                this.handleLaunchRequest(<DAP.LaunchRequest>request);
            } else if (request.command === 'attach') {
                this.handleAttachRequest(<DAP.AttachRequest>request);
            } else {
                if (request.command != 'initialize' && !this.launch_request_sent) {
                    this.onSentLaunchRequest.once(() => {
                        this.handleClientRequest(request);
                    });
                    return;
                }
                if (request.command === 'setBreakpoints') {
                    this.handleSetBreakpointsRequest(<DAP.SetBreakpointsRequest>request);
                } else if (request.command === 'setFunctionBreakpoints'
                    || request.command === 'setExceptionBreakpoints'
                    || request.command === 'setInstructionBreakpoints') {
                    this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, _req) => {
                        this.handleSetBreakpointsResponse(r, _req);
                    });
                } else if (request.command === 'stackTrace') {
                    this.handleStackTraceRequest(<DAP.StackTraceRequest>request);
                } else if (request.command === 'scopes') {
                    this.handleScopesRequest(<DAP.ScopesRequest>request);
                } else if (request.command === 'source') {
                    this.handleSourceRequest(<DAP.SourceRequest>request);
                } else if (request.command === 'disconnect') {
                    this.handleDisconnectRequest(<DAP.DisconnectRequest>request);
                    // loaded sources request
                } else if (request.command === 'loadedSources') {
                    this.handleLoadedSourcesRequest(<DAP.LoadedSourcesRequest>request);
                } else if (request.command === 'disassemble') {
                    this.handleDisassembleRequest(<DAP.DisassembleRequest>request);
                } else if (request.command === 'modules') {
                    this.handleModulesRequest(<DAP.ModulesRequest>request);
                } else {
                    this.handleRequestDefault(request);
                }
            }
        } catch (e) {
            this.sendErrorResponse(new Response(request), 1104, '{_stack}', e, ErrorDestination.Telemetry);
        }
    }
    protected handleModulesRequest(request: DAP.ModulesRequest, sendToClient: boolean = true) {
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            const response = r as DAP.ModulesResponse;
            this.loadedModules = response.body.modules;
            if (sendToClient) {
                this.sendMessageToClient(response);
            }
        });
    }
    findSourceItemByPathAndOrigin(path: string, origin: string): SourceItem | undefined {
        for (let item of this.sourcePaths.values()) {
            if (item.path.toLowerCase().endsWith(path.toLowerCase()) && item.origin.archive == origin) {
                return item;
            }
        }
        return undefined;
    }
    protected handleLoadedSourcesRequest(request: DAP.LoadedSourcesRequest) {
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            const response = r as DAP.LoadedSourcesResponse;
            for (let i in response.body.sources) {
                let project = this.getProjectByArchive(response.body.sources[i].origin || "");
                let sourcePath = response.body.sources[i].path;
                if (sourcePath && project && !this.findSourceItemByPathAndOrigin(sourcePath || "", project!.archive || "")) {
                    let absPath = path.join(project.path, sourcePath);
                    if (this.sourcePaths.has(absPath)) {
                        // Likely a file included from a sub-project in the same workspace folder; use the source item from the sub-project
                        let sourceItem = this.sourcePaths.get(absPath);
                        project = sourceItem?.origin;
                        response.body.sources[i].path = sourceItem?.path || sourcePath;
                        response.body.sources[i].origin = project?.archive;
                    } else {
                        this.sourcePaths.set(absPath, { path: absPath, origin: project });
                    }
                }
                response.body.sources[i] = this.convertDebuggerSourceToClient(response.body.sources[i] as DAP.Source, project);
            }
            this.sendMessageToClient(response);
        });
    }

    protected handleDisconnectRequest(request: DAP.DisconnectRequest): void {
        this.sendRequestToServerWithCB(request, 5000, (_r, _req) => {
            // wait 500ms for the terminate event to fire; otherwise just stop
            this.sendMessageToClient(_r as DAP.ProtocolMessage);
            setTimeout(() => {
                this.stop();
            }, 500);
        });
    }

    protected handleSetBreakpointsRequest(request: DAP.SetBreakpointsRequest): void {
        request.arguments.source = this.convertClientSourceToDebugger(request.arguments.source as DAP.Source);
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            this.handleSetBreakpointsResponse(r as DAP.SetBreakpointsResponse, req as DAP.SetBreakpointsRequest);
        });
    }

    // They set body.breakpoints[].source argument to a string instead of a source object, need to fix this
    protected handleSetBreakpointsResponse(
        message: DAP.SetBreakpointsResponse | DAP.SetFunctionBreakpointsResponse | DAP.SetExceptionBreakpointsResponse | DAP.SetInstructionBreakpointsResponse,
        request?: DAP.Request
    ): void {
        if (message.body?.breakpoints) {
            message.body?.breakpoints.forEach((bp: DAP.Breakpoint) => {
                if (bp.source) {
                    bp.source = this.convertDebuggerSourceToClient(bp.source as DAP.Source);
                }
            });
        }
        this.sendMessageToClient(message);
    }

    private _defaultResponseHandler(response: DAP.Response) {
        this.sendMessageToClient(response);
    }

    // We shouldn't get these; if we do, we screwed up somewhere.'
    // In either case, the game doesn't respond to them
    protected handleSourceRequest(request: DAP.SourceRequest): void {
        if (request.arguments.source) {
            request.arguments.source = this.convertClientSourceToDebugger(request.arguments.source as DAP.Source);
        }
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            this._defaultResponseHandler(r);
        });
    }


    protected handleStackTraceRequest(request: DAP.StackTraceRequest): void {
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) =>
            this.handleStackTraceResponse(r as DAP.StackTraceResponse, req as DAP.StackTraceRequest)
        );
    }

    protected handleStackTraceResponse(response: DAP.StackTraceResponse, request: DAP.StackTraceRequest) {
        if (response.body.stackFrames) {
            response.body.stackFrames.forEach((frame: DAP.StackFrame) => {
                frame.source = this.convertDebuggerSourceToClient(frame.source as DAP.Source);
            });
        }
        this.sendMessageToClient(response);
    }

    /**
     * @param scopesRequest
     */
    protected handleScopesRequest(scopesRequest: DAP.ScopesRequest): void {
        this.sendRequestToServerWithCB(scopesRequest, DEFAULT_TIMEOUT, (r, _req) => {
            const response = r as DAP.ScopesResponse;
            if (!response?.body) {
                this.sendMessageToClient(response);
                return;
            }
            for (const scope of response?.body?.scopes) {
                if (scope.source) {
                    scope.source = this.convertDebuggerSourceToClient(scope.source);
                }
            }
            this.sendMessageToClient(response);
        });
    }

    protected handleDisassembleRequest(request: DAP.DisassembleRequest): void {
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, req) => {
            const response = r as DAP.DisassembleResponse;
            if (response.body?.instructions) {
                for (const instr of response.body?.instructions) {
                    if (instr.location) {
                        instr.location = this.convertDebuggerSourceToClient(instr.location);
                    }
                }
            }
            this.sendMessageToClient(response);
        });
    }

    /**
     * Just pass it through to the server
     */
    protected handleRequestDefault(request: DAP.Request): void {
        this.sendRequestToServerWithCB(request, DEFAULT_TIMEOUT, (r, _req) => this._defaultResponseHandler(r));
    }

    private getProjectBySrcPath(srcPath: string): ProjectItem | undefined {
        return this.projects.find(p => srcPath.toLowerCase().startsWith(p.path.toLowerCase()));
    }
    private getProjectByArchive(origin: string): ProjectItem | undefined {
        let ret = this.projects.find(p => origin.toLowerCase() == p.archive?.toLowerCase());
        if (!ret && origin.includes(":")) {
            // split and take last
            let parts = origin.split(":");
            ret = this.projects.find(p => parts[parts.length - 1].toLowerCase() == p.archive?.toLowerCase());
        }
        if (!ret) {
            // get the file name from the origin and check if it's a valid project
            let fileName = path.basename(origin);
            ret = this.projects.find(p => fileName.toLowerCase() == p.archive?.toLowerCase());
        }
        return ret;
    }

    private convertClientSourceToDebugger(Source: DAP.Source): DAP.Source {
        // change the source path to add the workspace folder
        if (!Source.path) {
            return Source;
        }
        Source.path = path.normalize(this.convertClientPathToDebugger(Source.path));
        const projectItem = this.getProjectBySrcPath(Source.path);

        // if it matches any of the project paths, make it relative to that project path
        if (projectItem) {
            Source.path = path.isAbsolute(Source.path) ? path.relative(projectItem.path, Source.path) : Source.path;
            Source.origin = projectItem.archive;
        } else if (Source.origin) {
            Source.origin = path.normalize(Source.origin);
        }
        return Source;
    }


    private convertDebuggerSourceToClient(Source: DAP.Source, projectItem?: ProjectItem): DAP.Source {
        if (!Source || !Source.path) {
            return Source;
        }
        let new_path: string = Source.path;
        projectItem = projectItem || this.getProjectByArchive(Source.origin || "") || undefined;
        if (Source.path && !path.isAbsolute(Source.path) && projectItem) {
            new_path = path.join(projectItem.path, Source.path);
        }
        const sourceItem = this.sourcePaths.get(new_path);
        if (!sourceItem) {
            let npath = this.convertDebuggerPathToClient(Source.path);
            Source.path = path.client.normalize((Source?.origin) ? path.client.join(Source.origin, npath) : npath);
            return Source;
        }
        Source.path = path.client.normalize(this.convertDebuggerPathToClient(sourceItem.path));
        Source.name = path.basename(sourceItem.path);
        Source.origin = path.client.normalize(sourceItem.origin.archive);
        Source.sourceReference = 0;
        return Source;
    }
}
