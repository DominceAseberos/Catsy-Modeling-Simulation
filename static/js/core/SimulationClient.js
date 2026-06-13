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

        this.socket.onopen = () => {
            this.dispatchEvent('sim:connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.dispatchEvent('sim:event', data);
        };

        this.socket.onclose = () => {
            this.dispatchEvent('sim:disconnected');
            this.socket = null;
        };

        this.socket.onerror = (error) => {
            console.error("Simulation WebSocket Error: ", error);
        };
    }

    /**
     * Disconnects the current simulation.
     */
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
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
