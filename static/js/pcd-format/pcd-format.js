import { ab2str, str2ab, getWithTypeFromText, getWithTypeFromDataView, setWithTypeToDataView } from './utils.js';
import { compress, decompress } from './lzf.js';

function parseHeader(textData) {

    let header = {};
    let dataStart = textData.search(/[\r\n]DATA\s(\S*)[\f\r\t\v]*\n/i);
    if(dataStart == -1) {
        throw "PCD-Format: not found DATA";
    }

    let result = /[\r\n]DATA\s(\S*)[\f\r\t\v]*\n/i.exec(textData);
    header.raw = textData.substr(0, dataStart + result[0].length);
    header.str = header.raw.replace(/\#.*/gi, '');

    // parse
    header.version = /VERSION (.*)/i.exec(header.str);
    header.fields = /FIELDS (.*)/i.exec(header.str);
    header.size = /SIZE (.*)/i.exec(header.str);
    header.type = /TYPE (.*)/i.exec(header.str);
    header.count = /COUNT (.*)/i.exec(header.str);
    header.width = /WIDTH (.*)/i.exec(header.str);
    header.height = /HEIGHT (.*)/i.exec(header.str);
    header.viewpoint = /VIEWPOINT (.*)/i.exec(header.str);
    header.points = /POINTS (.*)/i.exec(header.str);
    header.data = /DATA (.*)/i.exec(header.str);

    // evaluate
    if (header.version !== null)
        header.version = parseFloat(header.version[1]);

    if (header.fields !== null)
        header.fields = header.fields[1].split(' ');

    if (header.type !== null)
        header.type = header.type[1].split(' ');

    if (header.width !== null)
        header.width = parseInt(header.width[1]);

    if (header.height !== null)
        header.height = parseInt(header.height[1]);

    if (header.viewpoint !== null)
        header.viewpoint = header.viewpoint[1].split(' ').map(parseFloat);

    if (header.points !== null)
        header.points = parseInt(header.points[1], 10);

    if (header.points === null)
        header.points = header.width * header.height;

    if (header.data !== null)
        header.data = header.data[1];

    if (header.size !== null) {
        header.size = header.size[1].split(' ').map(function (x) {
            return parseInt(x, 10);
        });
    }

    if (header.count !== null) {
        header.count = header.count[1].split(' ').map(function (x) {
            return parseInt(x, 10);
        });
    } else {
        header.count = [];
        for (let i = 0, l = header.fields.length; i < l; i++) {
            header.count.push(1);
        }
    }

    header.offset = [];
    let sizeSum = 0;
    for (let i = 0, l = header.fields.length; i < l; i++) {
        header.offset.push(sizeSum);
        if (header.data === 'ascii') {
            sizeSum += header.count[i];
        } else {
            sizeSum += header.size[i] * header.count[i];
        }
    }

    // for binary only
    header.rowSize = sizeSum;

    return header;
}

function getPointsFromTextData(textData, header, asList = true) {
    let points = [];

    let lines = textData.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '')
            continue;
        let line = lines[i].split(' ');
        let point = asList ? [] : {};
        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const count = header.count[j];
            const offset = header.offset[j];
            let item;
            if (count == 1) {
                const text = line[offset];
                item = getWithTypeFromText(text, type);
            } else if (count > 1) {
                item = [];
                for (let c = 0; c < count; c++) {
                    const text = line[offset + c];
                    item.push(getWithTypeFromText(text, type));
                }
            }
            if(asList) {
                point.push(item);
            } else {
                point[header.fields[j]] =  item;
            }
        }
        points.push(point);
    }
    return points;
}

function setPointsToTextData(points, header, asList = true) {
    let textData = '';
    for (let i = 0; i < points.length; i++) {
        if(asList) {
            textData += points[i].map(p => p instanceof Array ? p.join(' ') : p).join(' ');
        } else {
            textData += header.fields.map((f) => (points[i][f] instanceof Array) ? points[i][f].join(' ') : points[i][f]).join(' ');   
        }
        textData += '\n';
    }
    return textData;
}

function getPointsFromDataView(dataview, header, asList = true, littleEndian = true, columnar = false) {
    let points = [];

    for (let i = 0; i < header.points; i++) {
        let point = asList ? [] : {};

        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const size = header.size[j];
            const count = header.count[j];
            let offset, item;

            if (count == 1) {
                if (columnar) {
                    offset = header.offset[j] * header.points + i * size;
                } else {
                    offset = i * header.rowSize + header.offset[j];
                }
                item = getWithTypeFromDataView(dataview, offset, littleEndian, type, size);
            } else if (count > 1) {
                item = [];
                for (let c = 0; c < count; c++) {
                    if(columnar) {
                        offset = (header.offset[j] + c * size) * header.points + i * size;
                    } else {
                        offset = i * header.rowSize + header.offset[j] + c * size;
                    }
                    item.push(getWithTypeFromDataView(dataview, offset, littleEndian, type, size));
                }
            }
            if (asList) {
                point.push(item);
            } else {
                point[header.fields[j]] = item;
            }
        }
        points.push(point);
    }
    return points;
}

function setPointsToDataView(points, dataview, header, asList = true, littleEndian = true, columnar = false) {

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const size = header.size[j];
            const count = header.count[j];
            let offset;

            if (count == 1) {
                if (columnar) {
                    offset = header.offset[j] * header.points + i * size;
                } else {
                    offset = i * header.rowSize + header.offset[j];
                }
                if (asList) {
                    setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[j]);
                } else {
                    setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[header.fields[j]]);
                }
            } else if (count > 1) {
                for (let c = 0; c < count; c++) {
                    if (columnar) {
                        offset = (header.offset[j] + c * size) * header.points + i * size;
                    } else {
                        offset = i * header.rowSize + header.offset[j] + c * size;
                    }
                    if (asList) {
                        setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[j][c]);
                    } else {
                        setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[header.fields[j]][c]);
                    }
                }
            } else {
                throw "PCD-Format: set data failed";
            }
        }
    }
}

/**
 * Parse ArrayBuffer and return PCD Header and Points
 * @param {ArrayBuffer} arrayBuffer 
 * @param {boolean} asList 
 * @param {boolean} littleEndian
 * 
 * @returns {Object} 
 */
export function parse(arrayBuffer, asList = true, littleEndian=true) {

    const textData = ab2str(new Uint8Array(arrayBuffer));
    const header = parseHeader(textData);

    // parse data
    let points = [];

    if (header.data === 'ascii') {

        let pcdData = textData.substr(header.raw.length);
        points = getPointsFromTextData(pcdData, header, asList);

    } else if (header.data === 'binary') {

        let dataview = new DataView(arrayBuffer, header.raw.length);
        points = getPointsFromDataView(dataview, header, asList, littleEndian, false);
        
    } else if (header.data === 'binary_compressed') {

        const sizes = new Uint32Array(arrayBuffer.slice(header.raw.length, header.raw.length + 8));
        const compressedSize = sizes[0];
        const decompressedSize = sizes[1];
        const decompressed = decompress(new Uint8Array(arrayBuffer, header.raw.length + 8));

        const dataview = new DataView(decompressed);
        points = getPointsFromDataView(dataview, header, asList, littleEndian, true);

    }

    return {
        header, 
        points
    }
};

/**
 * Stringify PCD and return ArrayBuffer
 * @param {Object} header 
 * @param {Array} points 
 * @param {boolean} asList 
 * @param {boolean} littleEndian 
 * 
 * @returns {ArrayBuffer}
 */
export function stringify(header, points, asList = true, littleEndian=true) {

    if (header.data === 'ascii') {
        let textData = '' + header.raw;
        textData += setPointsToTextData(points, header, asList);
        return str2ab(textData);

    } else if (header.data === 'binary') {

        const bufferSize = header.raw.length + header.points * header.rowSize;
        const arrayBuffer = new ArrayBuffer(bufferSize);

        // write header
        const headerView = new Uint8Array(arrayBuffer, 0, header.raw.length);
        for (let i = 0; i < header.raw.length; i++) {
            headerView[i] = header.raw.charCodeAt(i);
        }

        // write data
        const dataview = new DataView(arrayBuffer, header.raw.length);
        setPointsToDataView(points, dataview, header, asList, littleEndian, false);

        return arrayBuffer;
    } else if (header.data === 'binary_compressed') {

        // write data
        const dataArrayBuffer = new ArrayBuffer(header.points * header.rowSize);
        const dataview = new DataView(dataArrayBuffer);
        setPointsToDataView(points, dataview, header, asList, littleEndian, true);
        const compressed = compress(dataArrayBuffer);

        const arrayBuffer = new ArrayBuffer(header.raw.length + 8 + compressed.byteLength)

        // write header
        const headerView = new Uint8Array(arrayBuffer, 0, header.raw.length);
        for (let i = 0; i < header.raw.length; i++) {
            headerView[i] = header.raw.charCodeAt(i);
        }

        // write size
        const sizes = new DataView(arrayBuffer, header.raw.length, 8);
        sizes.setInt32(0, compressed.byteLength, littleEndian);
        sizes.setInt32(4, header.points * header.rowSize, littleEndian);

        // write data
        const tmp = new Uint8Array(arrayBuffer);
        tmp.set(new Uint8Array(compressed), header.raw.length + 8);

        return arrayBuffer;
    }
}