
export function ab2str(array) {
    let s = '';
    for (let i = 0, il = array.length; i < il; i++) {
        s += String.fromCharCode(array[i]);
    }
    return s;
}

export function str2ab(str) {
    const array = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        array[i] = str.charCodeAt(i);
    }
    return array.buffer;
}

export function getWithTypeFromText(text, type) {
    switch (type) {
        case 'F':
            return parseFloat(text);
        case 'U':
        case 'I':
            return parseInt(text);
        default:
            break;
    }
    throw "PCD-Format: parse data failed";
}

export function getWithTypeFromDataView(dataview, offset, littleEndian, type, size) {
    switch (type) {
        case 'F':
            switch (size) {
                case 4:
                    return dataview.getFloat32(offset, littleEndian);
                case 8:
                    return dataview.getFloat64(offset, littleEndian);
                default:
                    break;
            }
            break;
        case 'U':
            switch (size) {
                case 1:
                    return dataview.getUint8(offset, littleEndian);
                case 2:
                    return dataview.getUint16(offset, littleEndian);
                case 4:
                    return dataview.getUint32(offset, littleEndian);
                default:
                    break;
            }
            break;
        case 'I':
            switch (size) {
                case 1:
                    return dataview.getInt8(offset, littleEndian);
                case 2:
                    return dataview.getInt16(offset, littleEndian);
                case 4:
                    return dataview.getInt32(offset, littleEndian);
                    break;
                default:
                    break;
            }
            break;
        default:
            break;
    }
    throw "PCD-Format: parse data failed";
}

export function setWithTypeToDataView(dataview, offset, littleEndian, type, size, data) {
    switch (type) {
        case 'F':
            switch (size) {
                case 4:
                    dataview.setFloat32(offset, data, littleEndian);
                    return;
                case 8:
                    dataview.setFloat64(offset, data, littleEndian);
                    return;
                default:
                    break;
            }
            break;
        case 'U':
            switch (size) {
                case 1:
                    dataview.setUint8(offset, data, littleEndian);
                    return;
                case 2:
                    dataview.setUint16(offset, data, littleEndian);
                    return;
                case 4:
                    dataview.setUint32(offset, data, littleEndian);
                    return;
                default:
                    break;
            }
            break;
        case 'I':
            switch (size) {
                case 1:
                    dataview.setInt8(offset, data, littleEndian);
                    return;
                case 2:
                    dataview.setInt16(offset, data, littleEndian);
                    return;
                case 4:
                    dataview.setInt32(offset, data, littleEndian);
                    return;
                default:
                    break;
            }
            break;
        default:
            break;
    }
    throw "PCD-Format: set data failed";
}
