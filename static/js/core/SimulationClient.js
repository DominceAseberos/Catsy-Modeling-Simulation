/**
 * SimulationClient.js
 * Handles the WebSocket connection to the FastAPI backend.
 * Parses incoming server events and dispatches them as standard CustomEvents.
 */
import { configState } from './ConfigState.js';

export class SimulationClient {
    constructor() {
        this.socket = null;
        this.reconnecting = false;
        this.isPaused = false;
        this.eventBuffer = [];
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
        const flushBuffer = () => {
            if (this.isPaused || this.eventBuffer.length === 0) return;
            const batch = this.eventBuffer.splice(0, 50);
            for (let data of batch) {
                this.dispatchEvent('sim:event', data);
            }
            if (this.eventBuffer.length > 0) {
                setTimeout(flushBuffer, 0);
            }
        };
        flushBuffer();
    }

    /**
     * Connects to the backend WebSocket using current ConfigState.
     */
    connect() {
        if (this.socket) {
            this.disconnect();
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = `${wsProtocol}${window.location.host}/ws?${configState.toQueryString()}`;
        
        this.socket = new WebSocket(wsUrl);

        const currentSocket = this.socket;

        currentSocket.onopen = () => {
            if (this.socket === currentSocket) {
                this.dispatchEvent('sim:connected');
            }
        };

        currentSocket.onmessage = (event) => {
            if (this.socket === currentSocket) {
                const data = JSON.parse(event.data);
                if (this.isPaused) {
                    this.eventBuffer.push(data);
                } else {
                    this.dispatchEvent('sim:event', data);
                }
            }
        };

        currentSocket.onclose = () => {
            if (this.socket === currentSocket) {
                this.dispatchEvent('sim:disconnected');
                this.socket = null;
            }
        };

        currentSocket.onerror = (error) => {
            if (this.socket === currentSocket) {
                console.error("Simulation WebSocket Error: ", error);
            }
        };
    }

    /**
     * Disconnects the current simulation.
     */
    disconnect() {
        if (this.socket) {
            const oldSocket = this.socket;
            this.socket = null; // Instantly nullify so no new events process
            oldSocket.close();
            this.dispatchEvent('sim:disconnected');
        }
    }

    /**
     * Helper to dispatch standard DOM events that other UI modules can listen to.
     */
    dispatchEvent(eventName, payload = null) {
        if (typeof window !== 'undefined') {
            const event = new CustomEvent(eventName, { detail: payload });
            window.dispatchEvent(event);
        }
    }
}

// Singleton instance
export const simulationClient = new SimulationClient();
