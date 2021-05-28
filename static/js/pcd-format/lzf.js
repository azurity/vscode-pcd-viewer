// PCL LZF https://github.com/PointCloudLibrary/pcl/blob/master/io/src/lzf.cpp

const _HLOG = 13,
    _HSIZE = (1 << (_HLOG)),
    _MAX_LIT = (1 << 5),
    _MAX_OFFSET = (1 << 13),
    _MAX_REFRENCE = ((1 << 8) + (1 << 3)),

    _FRST = function (p, input) {
        return (((input[p]) << 8) | input[p + 1]);
    },
    _NEXT = function (v, p, input) {
        return ((v << 8) | input[p + 2]);
    },
    _IDX = function (h) {
        return (((h >> (3 * 8 - _HLOG)) - h) & (_HSIZE - 1));
    };


export function compress(data) {
    let input = new Uint8Array(data), output = [],
        iend = input.byteLength, iidx = 0, oidx = 1,
        htab = [],  // save the repeatable data
        lit = 0, hval, hslot, reference, offset, len, maxlen;

    hval = _FRST(iidx, input);

    while (iidx < iend - 2) {
        hval = _NEXT(hval, iidx, input);
        hslot = _IDX(hval);
        reference = htab[hslot] ? htab[hslot] : 0;
        htab[hslot] = iidx;

        if (reference < iidx
            && (offset = iidx - reference - 1) < _MAX_OFFSET
            && iidx + 4 < iend
            && reference > 0
            && input[reference] === input[iidx]
            && input[reference + 1] === input[iidx + 1]
            && input[reference + 2] === input[iidx + 2]
        ) {
            len = 2;
            maxlen = iend - iidx - len;
            maxlen = maxlen > _MAX_REFRENCE ? _MAX_REFRENCE : maxlen;
            if (lit > 0)
                output[oidx - lit - 1] = (lit - 1) & 255;
            else
                --oidx;

            while (true) {
                if (maxlen > 16) {
                    let c = 0;
                    do {
                        ++len; ++c;
                    } while (c <= 16 && input[reference + len] == input[iidx + len]);
                    break;
                } else {
                    do {
                        len++; 
                    } while (len < maxlen && input[reference + len] == input[iidx + len]);
                    break;
                }
            }

            len -= 2;
            ++iidx;

            // len & offset
            if (len < 7)
                output[oidx++] = ((offset >> 8) + (len << 5)) & 255;
            else {
                output[oidx++] = ((offset >> 8) + (7 << 5)) & 255;
                output[oidx++] = (len - 7) & 255;
            }
            output[oidx++] = (offset) & 255;

            lit = 0;
            ++oidx;
            iidx += len + 1;

            if (iidx >= iend - 2)
                break;

            --iidx;

            hval = _FRST(iidx, input);
            hval = _NEXT(hval, iidx, input);
            htab[_IDX(hval)] = iidx++;
        } else {
            ++lit;

            output[oidx++] = (input[iidx++]) & 255;
            if (lit === _MAX_LIT) {
                output[oidx - lit - 1] = (lit - 1) & 255;
                lit = 0;
                ++oidx;
            }
        }
    }
    while (iidx < iend) {
        ++lit;
        output[oidx++] = (input[iidx++]) & 255;
        if (lit === _MAX_LIT) {
            output[oidx - lit - 1] = (lit - 1) & 255;
            lit = 0;
            ++oidx;
        }
    }
    input = null;

    if (lit > 0)
        output[oidx - lit - 1] = (lit - 1) & 255;

    return new Uint8Array(output).buffer;
}

export function decompress(data) {
    let input = new Uint8Array(data), output = [],
        iidx = 0, iend = input.byteLength, oidx = 0,
        ctrl, len, reference;

    do {
        ctrl = input[iidx++];
        if (ctrl < (1 << 5)) {
            ctrl++;
            if (iidx + ctrl > iend)
                throw "LZF: Input buffer is not large enough when input index + ctrl ";
            // copy uncompressed data
            while (ctrl > 0) {
                output[oidx++] = input[iidx++];
                ctrl--;
            };
        } else {
            len = ctrl >> 5;
            reference = oidx - ((ctrl & 0x1f) << 8) - 1;
            if (len == 7) {
                // add more len
                len += input[iidx++];
                if (iidx >= iend)
                    throw "LZF: Input buffer is not large enough ";
            }
            reference -= input[iidx++];
            if (reference < 0) 
                throw "LZF: reference is less than 0";
            if (reference >= oidx)
                throw "LZF: reference is bigger than output index ";

            len += 2;
            // copy compressed data
            while (len > 0){
                output[oidx++] = output[reference++];
                len--;
            };
        }
    } while (iidx < iend);

    return new Uint8Array(output).buffer;
}
