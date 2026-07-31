export function toBase64(content: string | ArrayBuffer): string {
    if (typeof content === 'string') {
        return `${btoa(content)}`;
    }
    // doing it this way because we will sometimes hit the stack-size limit with the expansion of the array
    let array = new Uint8Array(content);
    let binary = '';
    for (let i = 0; i < array.length; i++) {
        binary += String.fromCharCode(array[i]);
    }
    return `${btoa(binary)}`;
}

export function cssToBase64Uri(css: string): string {
    return `data:text/css;base64,${toBase64(css)}`;
}

export function pngToBase64Uri(png: ArrayBuffer): string {
    return `data:image/png;base64,${toBase64(png)}`;
}

export function wavToBase64Uri(wav: ArrayBuffer): string {
    return `data:audio/wav;base64,${toBase64(wav)}`;
}

