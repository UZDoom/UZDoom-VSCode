import * as fs from 'fs/promises';
import { FileAccessor, FileType } from './IDEInterface';
import { glob as _glob } from 'glob';
import { promisify } from 'util';

//promisify glob
const glob = promisify(_glob);

export class NodeFileAccessor implements FileAccessor {
    isWindows: boolean = process.platform === 'win32';

    constructor() {
    }

    async isDirectory(path: string): Promise<boolean> {
        try {
            const stats = await fs.stat(path);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async isFile(path: string): Promise<boolean> {
        try {
            const stats = await fs.stat(path);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    async findFiles(include: string, exclude: string, maxResults: number, absolute: boolean = true, roots?: string[]): Promise<string[]> {
        let matches: string[] = [];
        if (!roots) {
            // get the current working directory
            roots = [process.cwd()];
        }
        for (const root of roots) {
            try {
                // append root to include
                let match = await glob(include, {
                    ignore: exclude,
                    absolute: absolute,
                    cwd: root
                });
                matches.push(...match);
            } catch (e) {
                console.error(`Error finding files in ${root}: ${e}`);
            }
            if (maxResults && matches.length >= maxResults) {
                break;
            }
        }
        maxResults = maxResults || matches.length;
        return matches.slice(0, maxResults);
    }

    async readDirectory(dirPath: string): Promise<[string, FileType][]> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(entry => {
            let fileType = FileType.Unknown;
            if (entry.isFile()) {
                fileType = FileType.File;
            } else if (entry.isDirectory()) {
                fileType = FileType.Directory;
            } else if (entry.isSymbolicLink()) {
                fileType = FileType.SymbolicLink;
            }
            return [entry.name, fileType];
        });
    }

    async readFile(filePath: string): Promise<Uint8Array> {
        return await fs.readFile(filePath);
    }

    async writeFile(filePath: string, contents: Uint8Array): Promise<void> {
        await fs.writeFile(filePath, contents);
    }
}


