import assert from 'assert';

async function runTests() {
    console.log("Running SimulationClient Tests...");

    // Mock global window object for custom events
    global.window = {
        location: {
            protocol: 'http:',
            host: 'localhost:8001'
        },
        dispatchEvent: (evt) => {
            console.log(`Dispatched event: ${evt.type}`);
        }
    };
    
    // Polyfill CustomEvent for Node
    global.CustomEvent = class CustomEvent {
        constructor(type, options) {
            this.type = type;
            this.detail = options ? options.detail : null;
        }
    };

    // Mock DOM
    global.document = {
        getElementById: () => null,
        addEventListener: () => {},
        querySelectorAll: () => []
    };
    global.EventTarget = class EventTarget {
        addEventListener() {}
        removeEventListener() {}
        dispatchEvent() {}
    };

    // Now dynamically import the modules so the DOM mocks are captured
    const { SimulationClient } = await import('../static/js/core/SimulationClient.js');

    // Mock WebSocket class
    global.WebSocket = class MockWebSocket {
        constructor(url) {
            this.url = url;
            this.readyState = 1;
            console.log("Mock WebSocket connected to " + url);
        }
        close() {
            this.readyState = 3;
            if (this.onclose) this.onclose();
        }
    };

    const client = new SimulationClient();
    assert.strictEqual(client.socket, null, "Socket should initially be null");

    // Test 1: Connect
    client.connect();
    assert.notStrictEqual(client.socket, null, "Socket should be initialized");
    assert.ok(client.socket.url.includes("ws://localhost:8001/ws?"), "URL should be formed correctly");

    // Test 2: Handle mock incoming message
    let messageReceived = false;
    const testPayload = { type: 'arrive', customer_id: '1' };
    
    // Override window.dispatchEvent to catch the event
    global.window.dispatchEvent = (evt) => {
        if (evt.type === 'sim:event' && evt.detail.type === 'arrive') {
            messageReceived = true;
            assert.strictEqual(evt.detail.customer_id, '1', "Event payload should match raw WebSocket data");
        }
    };

    client.socket.onmessage({ data: JSON.stringify(testPayload) });
    assert.strictEqual(messageReceived, true, "Should dispatch parsed JSON correctly");

    // Test 3: Disconnect
    client.disconnect();
    assert.strictEqual(client.socket, null, "Socket should be null after disconnect");

    console.log("✅ All SimulationClient tests passed successfully!\n");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
