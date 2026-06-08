import { execSync } from 'child_process';
import { GAME_LABEL_NAME } from './GameDefs';

export interface GameVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    prereleaseNum?: number;
    build?: string;
}

export class GameVersionChecker {
    public static readonly DEBUGGER_VERSION = {
        major: 4,
        minor: 15,
        patch: 0,
        prerelease: "pre",
        prereleaseNum: 1,
        build: ""
    };
    // parse version
    // version is in the format of `g<major>.<minor>[.<patch>][<prerelease_tag>-<prerelease_num>-<gitbuild>-m]`
    // example: g4.15pre-355-g2383dcb8d-m
    // notice there is no dash between 15 and pre

    // this matches both the gzdoom format and semver, since they may be switching to semver later
    private static readonly REGEX = /^g?(\d+)\.(\d+)(?:\.(\d+))?(?:-?(\w+)(?:[\-.](\d+))?)?(?:[\-+]([0-9a-zA-Z-\._]+))?$/
    public static parseVersion(version: string): GameVersion {
        const match = version.match(this.REGEX);
        if (!match) {
            throw new Error(`Invalid version: ${version}`);
        }

        return {
            major: parseInt(match[1]),
            minor: parseInt(match[2]),
            patch: match[3] ? parseInt(match[3]) : 0,
            prerelease: match[4] ? match[4] : undefined,
            prereleaseNum: match[5] ? parseInt(match[5]) : undefined,
            build: match[6] ? match[6] : undefined
        };
    }

    public static toString(version: GameVersion): string {
        let result = `${version.major}.${version.minor}.${version.patch}`;
        if (version.prerelease) {
            result += `-${version.prerelease}`;
            if (version.prereleaseNum != undefined) {
                result += `-${version.prereleaseNum}`;
            }
            if (version.build) {
                result += `-${version.build}`;
            }
        }
        return result;
    }

    // check if version is greater than or equal to the given version
    public static isGreaterThanOrEqualTo(version: GameVersion | string, targetVersion: GameVersion | string): boolean {
        version = typeof version === 'string' ? this.parseVersion(version) : version;
        targetVersion = typeof targetVersion === 'string' ? this.parseVersion(targetVersion) : targetVersion;
        if (version.major < targetVersion.major) {
            return false;
        }
        if (version.major > targetVersion.major) {
            return true;
        }
        if (version.minor < targetVersion.minor) {
            return false;
        }
        if (version.minor > targetVersion.minor) {
            return true;
        }
        if (version.patch < targetVersion.patch) {
            return false;
        }
        if (version.patch > targetVersion.patch) {
            return true;
        }
        if (version.prerelease && !targetVersion.prerelease) {
            return false;
        }
        if (!version.prerelease && targetVersion.prerelease) {
            return true;
        }
        if (version.prerelease && targetVersion.prerelease && version.prerelease < targetVersion.prerelease) {
            return false;
        }
        if (version.prereleaseNum && targetVersion.prereleaseNum && version.prereleaseNum < targetVersion.prereleaseNum) {
            return false;
        }
        return true;
    }

    public static getGameVersion(path: string): GameVersion | undefined {
        let output = '';
        try {
            output = execSync(`${path} -version`).toString().trim();
        } catch (error) {
            throw new Error(`${path} could not be executed: ${error}`);
        }
        return this.getGameVersionFromOutput(output);
    }

    public static getGameVersionFromOutput(output: string): GameVersion | undefined {
        output = output.trim();
        // split into lines, find one that starts with "<GAME_NAME> version "
        const prefix = `${GAME_LABEL_NAME} version`;
        const alternatePrefix = `${GAME_LABEL_NAME} `;
        let version: GameVersion | undefined = undefined;
        for (let line of output.split('\n')) {
            line = line.trim();
            if (line.startsWith(prefix)) {
                try {
                    version = this.parseVersion(line.split(' ')[2].trim());
                    break;
                } catch (e) {
                // fallthrough
                }
            }
            if (line.startsWith(alternatePrefix)) {
                try {
                    version = this.parseVersion(line.split(' ')[1].trim());
                    break;
                } catch (e) {
                    // fallthrough
                }
                break;
            }
        }
        return version;
    }

    public static checkIfGameSupportsDebugger(path: string): boolean {
        const gameVersion = this.getGameVersion(path);
        if (!gameVersion) {
            return false;
        }
        return this.versionSupportsDebugger(gameVersion);
    }

    public static versionSupportsDebugger(version: GameVersion): boolean {
        if (version === undefined) {
            return false;
        }
        return this.isGreaterThanOrEqualTo(version, this.DEBUGGER_VERSION);
    }
}
