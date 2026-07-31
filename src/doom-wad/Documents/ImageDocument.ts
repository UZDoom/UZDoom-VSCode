import WadDocument from "./WadDocument";

export default interface ImageDocument extends WadDocument {
    width: number;
    height: number;
    multipleImages: boolean;
}

export interface MultipleImagesImageDocument extends ImageDocument {
    numberOfImages: number;
    getImage(index: number): ArrayBuffer | Promise<ArrayBuffer>;

    getImageContentType(index: number): string;
    getImageWidth(index: number): number;
    getImageHeight(index: number): number;
}
