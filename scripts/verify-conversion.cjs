#!/usr/bin/env node
/**
 * Verify image conversion results
 * Supports GIF → WebP and other formats
 * 
 * Usage:
 *   node scripts/verify-conversion.js <input-file> <output-webp>
 */

const fs = require('fs');
const path = require('path');

// ─── GIF Parser ─────────────────────────────────────────────────────────────

function parseGIF(buffer) {
    let offset = 0;
    
    const header = buffer.slice(0, 6).toString('ascii');
    if (header !== 'GIF87a' && header !== 'GIF89a') {
        throw new Error('Not a valid GIF file');
    }
    offset = 6;
    
    const width = buffer.readUInt16LE(offset);
    const height = buffer.readUInt16LE(offset + 2);
    const packed = buffer[offset + 4];
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    const globalColorTableSize = hasGlobalColorTable ? 2 << (packed & 0x07) : 0;
    offset += 7;
    
    if (hasGlobalColorTable) {
        offset += globalColorTableSize * 3;
    }
    
    let frameCount = 0;
    
    while (offset < buffer.length) {
        const separator = buffer[offset++];
        
        if (separator === 0x21) {
            offset++;
            let blockSize = buffer[offset++];
            while (blockSize > 0 && offset < buffer.length) {
                offset += blockSize;
                blockSize = buffer[offset++];
            }
        } else if (separator === 0x2C) {
            frameCount++;
            offset += 8;
            
            const packed = buffer[offset++];
            const hasLocalColorTable = (packed & 0x80) !== 0;
            const localColorTableSize = hasLocalColorTable ? 2 << (packed & 0x07) : 0;
            
            if (hasLocalColorTable) {
                offset += localColorTableSize * 3;
            }
            
            offset++;
            
            let blockSize = buffer[offset++];
            while (blockSize > 0 && offset < buffer.length) {
                offset += blockSize;
                blockSize = buffer[offset++];
            }
        } else if (separator === 0x3B) {
            break;
        }
    }
    
    return { width, height, frameCount, format: 'GIF' };
}

// ─── WebP Parser ────────────────────────────────────────────────────────────

function parseWebP(buffer) {
    const isRIFF = buffer.slice(0, 4).toString() === 'RIFF';
    const isWEBP = buffer.slice(8, 12).toString() === 'WEBP';
    
    if (!isRIFF || !isWEBP) {
        throw new Error('Not a valid WebP file');
    }
    
    let frameCount = 0;
    let width = 0;
    let height = 0;
    
    // Count ANMF chunks
    for (let i = 12; i < buffer.length - 4; i++) {
        if (buffer.slice(i, i + 4).toString() === 'ANMF') {
            frameCount++;
        }
    }
    
    // Get dimensions from VP8X or VP8/VP8L
    for (let i = 12; i < buffer.length - 4; i++) {
        const chunk = buffer.slice(i, i + 4).toString();
        
        if (chunk === 'VP8X') {
            width = (buffer[i + 8] | (buffer[i + 9] << 8) | (buffer[i + 10] << 16)) + 1;
            height = (buffer[i + 11] | (buffer[i + 12] << 8) | (buffer[i + 13] << 16)) + 1;
            break;
        } else if (chunk === 'VP8 ') {
            width = buffer.readUInt16LE(i + 10) & 0x3FFF;
            height = buffer.readUInt16LE(i + 12) & 0x3FFF;
            frameCount = frameCount || 1;
            break;
        } else if (chunk === 'VP8L') {
            const bits = buffer.readUInt32LE(i + 9);
            width = ((bits & 0x3FFF) + 1);
            height = (((bits >> 14) & 0x3FFF) + 1);
            frameCount = frameCount || 1;
            break;
        }
    }
    
    return { width, height, frameCount, format: 'WebP' };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
    console.log('Usage: node verify-conversion.js <input-file> <output-webp>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/verify-conversion.js input.gif output.webp');
    process.exit(1);
}

if (!fs.existsSync(inputFile)) {
    console.error('❌ Input file not found:', inputFile);
    process.exit(1);
}

if (!fs.existsSync(outputFile)) {
    console.error('❌ Output file not found:', outputFile);
    process.exit(1);
}

try {
    const inputBuffer = fs.readFileSync(inputFile);
    const outputBuffer = fs.readFileSync(outputFile);
    
    const ext = path.extname(inputFile).toLowerCase();
    let inputInfo;
    
    if (ext === '.gif') {
        inputInfo = parseGIF(inputBuffer);
    } else {
        console.error('❌ Unsupported input format:', ext);
        process.exit(1);
    }
    
    const outputInfo = parseWebP(outputBuffer);
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           Conversion Verification Report                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log('📁 INPUT (' + inputInfo.format + '):');
    console.log('   File:', inputFile);
    console.log('   Size:', formatBytes(inputBuffer.length));
    console.log('   Dimensions:', inputInfo.width + 'x' + inputInfo.height);
    console.log('   Frames:', inputInfo.frameCount);
    
    console.log('\n📁 OUTPUT (' + outputInfo.format + '):');
    console.log('   File:', outputFile);
    console.log('   Size:', formatBytes(outputBuffer.length));
    console.log('   Dimensions:', outputInfo.width + 'x' + outputInfo.height);
    console.log('   Frames:', outputInfo.frameCount);
    
    const compressionRatio = ((1 - outputBuffer.length / inputBuffer.length) * 100).toFixed(1);
    const preservationRatio = ((outputInfo.frameCount / inputInfo.frameCount) * 100).toFixed(1);
    
    console.log('\n📊 RESULTS:');
    console.log('   Compression:', compressionRatio + '%', compressionRatio > 0 ? '↓' : '↑');
    console.log('   Frame preservation:', outputInfo.frameCount + '/' + inputInfo.frameCount, '(' + preservationRatio + '%)');
    
    if (outputInfo.frameCount === inputInfo.frameCount) {
        console.log('\n✅ SUCCESS: All frames preserved!');
    } else {
        const lost = inputInfo.frameCount - outputInfo.frameCount;
        console.log('\n⚠️  WARNING: ' + lost + ' frame(s) lost during conversion');
    }
    
    console.log('\n' + '─'.repeat(60) + '\n');
    
} catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
}

