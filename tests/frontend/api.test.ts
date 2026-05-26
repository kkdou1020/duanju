import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockEventSourceInstances: any[] = [];

class MockEventSource {
    url: string;
    onmessage: any = null;
    onerror: any = null;
    listeners: Record<string, Function[]> = {};

    constructor(url: string) {
        this.url = url;
        mockEventSourceInstances.push(this);
    }

    addEventListener = vi.fn((event: string, cb: Function) => {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(cb);
    });

    removeEventListener = vi.fn((event: string, cb: Function) => {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(x => x !== cb);
        }
    });

    close = vi.fn();

    // helper to trigger messages
    emitMessage(data: any) {
        if (this.onmessage) {
            this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
        }
    }

    emitError(err: any) {
        if (this.onerror) {
            this.onerror(err);
        }
    }
}

vi.stubGlobal('EventSource', MockEventSource);

import { pollVideoUntilDone } from '../../src/services/api';

describe('pollVideoUntilDone', () => {
    beforeEach(() => {
        mockEventSourceInstances = [];
    });

    it('returns url when video completes on 2nd poll', async () => {
        const promise = pollVideoUntilDone({ name: 'op-1' }, 10, 10);
        
        // Wait a tick for EventSource to instantiate
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const instance = mockEventSourceInstances[0];
        expect(instance).toBeDefined();
        expect(instance.url).toContain('/media/video-status-sse?operation=');

        // Emit first heartbeat/poll message
        instance.emitMessage({ type: 'poll' });
        
        // Emit done message with final url
        instance.emitMessage({ type: 'done', url: 'https://video.mp4' });
        
        const result = await promise;
        expect(result.url).toBe('https://video.mp4');
        expect(instance.close).toHaveBeenCalled();
    });

    it('throws on error status', async () => {
        const promise = pollVideoUntilDone({ name: 'op-1' }, 10, 10);
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const instance = mockEventSourceInstances[0];
        expect(instance).toBeDefined();

        instance.emitMessage({ type: 'poll' });
        instance.emitMessage({ type: 'done', error: 'Generation failed' });
        
        await expect(promise).rejects.toThrow('Generation failed');
        expect(instance.close).toHaveBeenCalled();
    });

    it('throws on timeout (maxRetries exceeded)', async () => {
        const promise = pollVideoUntilDone({ name: 'op-1' }, 10, 3);
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const instance = mockEventSourceInstances[0];
        expect(instance).toBeDefined();

        instance.emitMessage({ type: 'poll' });
        instance.emitMessage({ type: 'poll' });
        instance.emitMessage({ type: 'poll' }); // 3rd poll -> exceeds maxRetries=3
        
        await expect(promise).rejects.toThrow('timed out');
        expect(instance.close).toHaveBeenCalled();
    });

    it('calls onPoll callback with attempt number', async () => {
        const onPoll = vi.fn();
        const promise = pollVideoUntilDone({ name: 'op-1' }, 10, 10, onPoll);
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const instance = mockEventSourceInstances[0];
        expect(instance).toBeDefined();

        instance.emitMessage({ type: 'poll' });
        instance.emitMessage({ type: 'poll' });
        instance.emitMessage({ type: 'done', url: 'https://video.mp4' });
        
        await promise;
        expect(onPoll).toHaveBeenCalledWith(1);
        expect(onPoll).toHaveBeenCalledWith(2);
        expect(instance.close).toHaveBeenCalled();
    });
});
