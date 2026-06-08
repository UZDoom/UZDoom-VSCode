import { Emitter } from "../adapter-proxy/IDEInterface"
import { FileSystemProvider, FileStat, FileType, Event, FileChangeEvent, Disposable, Uri } from 'vscode';
import Wad from "../doom-wad/Wad";
import * as fs from 'fs/promises';
import Lump from "../doom-wad/Lumps/Lump";
import { readFileSync } from "fs";
import * as path from "path";

import { WAD_EXTENSIONS as EXTENSIONS, WAD_SCHEME } from './common';
import { pathToURI, URIToArchivePathParts } from "../common/ProviderHelpers";
/**
 * A read-only file system provider for WAD files.
 */
export class WadFileSystemProvider implements FileSystemProvider {
    onDidChangeFile: Event<FileChangeEvent[]> = new Emitter<FileChangeEvent[]>().event;

    // we have to cache the wad files because this is a singleton
    private Wads: Map<string, Wad> = new Map();

    public static CreateWadUri(wadPath: string, entryPath: string): Uri {
        return pathToURI(WAD_SCHEME, wadPath, entryPath);
    }

    private parseWadUri(uri: Uri): { wadPath: string; entryPath: string } {
        if (uri.scheme !== WAD_SCHEME) {
            throw new Error('Invalid WAD URI format');
        }
        const [wadPath, entryPath] = URIToArchivePathParts(uri, 1, EXTENSIONS);
        return {
            wadPath: wadPath,
            entryPath: entryPath || ''
        };
    }

    private async getWadFile(wadPath: string): Promise<Wad> {
        if (!this.Wads.has(wadPath)) {
            try {
            const wad = new Wad();
            const buffer = readFileSync(wadPath);
            wad.load(buffer.buffer);
            this.Wads.set(wadPath, wad);
            } catch (e) {
                throw new Error(`Failed to load WAD file ${wadPath}: ${e}`);
            }
        }
        return this.Wads.get(wadPath)!;
    }

    async stat(uri: Uri): Promise<FileStat> {
        const { wadPath, entryPath } = this.parseWadUri(uri);
        if (entryPath === '') {
            return {
                type: FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0
            };
        }
        const wad = await this.getWadFile(wadPath);
        const entry = wad.lumps.find(lump => lump.name === entryPath);

        if (!entry) {
            throw new Error(`Entry not found: ${entryPath}`);
        }

        return {
            type: FileType.File,
            ctime: 0,
            mtime: 0,
            size: entry.length
        };
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const { wadPath } = this.parseWadUri(uri);
        const wad = await this.getWadFile(wadPath);
        return wad.lumps.map(lump => [lump.name, FileType.File]);
    }

    async getEntry(uri: Uri): Promise<Lump> {
        const { wadPath, entryPath } = this.parseWadUri(uri);
        const wad = await this.getWadFile(wadPath);
        const entry = wad.lumps.find(lump => lump.name === entryPath);

        if (!entry) {
            throw new Error(`Entry not found: ${entryPath}`);
        }

        return entry;
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const entry = await this.getEntry(uri);
        return new Uint8Array(entry.content);
    }

    // The below methods won't be called in read-only mode

    async writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
        const { wadPath, entryPath } = this.parseWadUri(uri);
        const wad = await this.getWadFile(wadPath);
        let entry = wad.lumps.find(lump => lump.name === entryPath);
        if (!entry && !options.create) {
            throw new Error(`Entry not found: ${entryPath}`);
        } else if (entry && !options.overwrite) {
            throw new Error(`Entry already exists: ${entryPath}`);
        }

        if (!entry) {
            entry = new Lump();
            entry.name = entryPath;
            wad.lumps.push(entry);
        }

        entry.content = content.buffer as ArrayBuffer;
        await fs.writeFile(wadPath, Buffer.from(wad.save()));
    }

    async delete(uri: Uri, options: { recursive: boolean }): Promise<void> {
        const { wadPath, entryPath } = this.parseWadUri(uri);
        const wad = await this.getWadFile(wadPath);
        wad.lumps = wad.lumps.filter(lump => lump.name !== entryPath);
        await fs.writeFile(wadPath, Buffer.from(wad.save()));
    }

    async rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): Promise<void> {
        const { wadPath, entryPath } = this.parseWadUri(oldUri);
        const wad = await this.getWadFile(wadPath);
        const newEntryPath = this.parseWadUri(newUri).entryPath;
        wad.lumps.find(lump => lump.name === entryPath)!.name = newEntryPath;
        await fs.writeFile(wadPath, Buffer.from(wad.save()));
    }

    async createDirectory(uri: Uri): Promise<void> {
        throw new Error('Creating directories in WAD files is not supported');
    }

    watch(uri: Uri, options: { recursive: boolean; excludes: string[] }): Disposable {
        return new Disposable(() => { });
    }
}

