import assert from 'assert';

async function runTests() {
    console.log("Running AnalyticsModal Tests...");

    global.document = {
        getElementById: () => {
            return {
                addEventListener: () => {},
                classList: { add: () => {}, remove: () => {} },
                style: {},
                innerHTML: '',
                innerText: ''
            };
        }
    };
    
    global.window = {};
    
    // Polyfill for fetch
    global.fetch = async (url, options) => {
        assert.strictEqual(url, '/api/analyze', "Should POST to correct API endpoint");
        const body = JSON.parse(options.body);
        assert.ok(body.duration, "Payload should have duration injected");
        
        return {
            ok: true,
            json: async () => ({
                avg_wait_time: 4.5,
                avg_cycle_time: 120,
                throughput_per_hour: 40,
                avg_cashier_util: 50,
                avg_barista_util: 60,
                avg_table_util: 70,
                total_customers: 100,
                wait_breakdown: {
                    "0-2min": 80,
                    "2-5min": 10,
                    "5-10min": 5,
                    ">10min": 5
                }
            })
        };
    };

    // Mock ConfigState
    global.jest = { mock: () => {} };
    const { AnalyticsModal } = await import('../static/js/ui/AnalyticsModal.js');

    const modal = new AnalyticsModal();
    
    // Simulate runAnalysis click
    await modal.runAnalysis();
    console.log("✅ All AnalyticsModal tests passed successfully!\n");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
