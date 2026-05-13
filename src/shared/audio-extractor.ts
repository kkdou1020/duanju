export const extractAudioFromVideo = async (file: File): Promise<File> => {
    // Check if the file is a video
    if (!file.type.startsWith('video/')) {
        return file; // If it's already audio or unknown, just return it
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert AudioBuffer to WAV blob
    const wavBlob = audioBufferToWav(audioBuffer);
    const newFile = new File([wavBlob], file.name.replace(/\.[^/.]+$/, "") + ".wav", { type: "audio/wav" });
    return newFile;
};

// Simple AudioBuffer to WAV encoder
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferArr = new ArrayBuffer(length),
        view = new DataView(bufferArr),
        channels = [],
        sampleRate = buffer.sampleRate;
    let offset = 0,
        pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this export)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            // interleave channels
            let sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(offset, sample, true); // write 16-bit sample
            offset += 2;
        }
        pos++; // next source sample
    }

    return new Blob([bufferArr], { type: "audio/wav" });

    function setUint16(data: number) {
        view.setUint16(offset, data, true);
        offset += 2;
    }

    function setUint32(data: number) {
        view.setUint32(offset, data, true);
        offset += 4;
    }
}
