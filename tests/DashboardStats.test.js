import assert from 'assert';
import { DashboardStats } from '../static/js/core/DashboardStats.js';

function runTests() {
    console.log("Running DashboardStats Tests...");
    const stats = new DashboardStats();

    // Test 1: Initial State
    assert.strictEqual(stats.stats.totalCustomers, 0, "Initial customers should be 0");

    // Test 2: Record Arrival
    stats.recordArrival();
    assert.strictEqual(stats.stats.totalCustomers, 1, "Total customers should increment on arrival");

    // Test 3: Record Served (Takeout)
    stats.recordServed('takeout');
    assert.strictEqual(stats.stats.servedCustomers, 1, "Served customers should increment");
    assert.strictEqual(stats.stats.totalTakeout, 1, "Total takeout should increment");

    // Test 4: Record Served (Dine-in)
    stats.recordServed('dine-in');
    assert.strictEqual(stats.stats.servedCustomers, 2, "Served customers should be 2");
    assert.strictEqual(stats.stats.totalDineIn, 1, "Total dine-in should increment");

    // Test 5: Record Walkout
    stats.recordWalkout();
    assert.strictEqual(stats.stats.lostCustomers, 1, "Lost customers should increment");

    // Test 6: Queue Updates
    stats.updateQueueLength('cashier', 5);
    assert.strictEqual(stats.stats.cashierQueueLen, 5, "Cashier queue length should update");

    // Test 7: Reset
    stats.reset();
    assert.strictEqual(stats.stats.totalCustomers, 0, "Customers should reset to 0");
    assert.strictEqual(stats.stats.servedCustomers, 0, "Served customers should reset to 0");
    assert.strictEqual(stats.stats.cashierQueueLen, 0, "Queue length should reset to 0");

    console.log("✅ All DashboardStats tests passed successfully!\n");
}

runTests();
