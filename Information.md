# Catsy Coffee Simulation - Component Summary

## Project Overview
This project is a cafe simulation app built with a Python backend and a JavaScript frontend. It models customer arrivals, queues, cashier and barista service, reservations, takeout vs dine-in behavior, and live UI updates.

## Backend Files

### `main.py`
- The FastAPI server entry point.
- Serves the simulation UI at `/` and static files from `/static`.
- Provides a REST endpoint `/api/analyze` for batch analytics.
- Provides simple pause/resume endpoints at `/api/pause` and `/api/resume`.
- Starts a WebSocket connection at `/ws` to stream live simulation events to the frontend.
- Reads simulation configuration from query parameters and passes it to the engine.
- Runs the live simulation in a separate thread so the server stays responsive.

### `engine/cafe_env.py`
- Defines `CafeEnvironment`, the core SimPy environment for the cafe.
- Creates cashier resources, barista stores, and table objects.
- Manages customer spawning and reservation logic.
- Emits simulation events to the UI event queue.
- Tracks KPIs: waiting times, cycle times, completed customers, lost customers, and reservations.
- Handles table reservation timeouts and warmup periods.

### `engine/customer_flows.py`
- Defines the customer behavior in the cafe.
- Handles reservation customers, takeout customers, and dine-in customers.
- Controls queueing at cashier resources and barista usage.
- Implements balking (customers leaving when the queue is too long) and reneging (customers leaving if they wait too long).
- Emits events like `arrive`, `queue_cashier`, `start_prep`, `served`, `leave`, and frustration updates.

### `engine/simulation_runner.py`
- Defines `start_simulation()` for the live UI simulation.
- Runs the SimPy environment in small time steps so the simulation can pause and resume smoothly.
- Defines `run_batch_simulation()` for headless analytics.
- Calculates average waiting time, cycle time, throughput, lost customers, reservations, and revenue estimates.
- Uses `event_queue=None` in batch mode to disable UI event emission.

## Frontend Files

### `static/index.html`
- The main webpage layout for the simulation.
- Contains buttons for play/pause, stop, restart, settings, and analytics.
- Contains the dashboard for live stats and the visual cafe floor.
- Includes the settings modal and analytics modal UI shells.
- Hosts placeholders for cashier/barista queues, table displays, and customer animation layers.

### `static/style.css`
- Defines the app’s visual styling.
- Controls layout, colors, buttons, modals, and animated UI elements.
- Applies the final user-facing design for the simulation dashboard and floor plan.

### `static/app.js`
- Bootstraps the frontend by importing core state and UI modules.
- Initializes `SettingsModal`, `AreaPopovers`, and other UI modules.
- Loads saved configuration from `localStorage`.
- Handles start, stop, pause/resume, and restart interactions.
- Updates connection status and resets the simulation visuals.
- Persists config changes but avoids immediate automatic restart unless the user clicks restart.

### `static/js/core/ConfigState.js`
- Reads configuration values from DOM inputs.
- Keeps a single state object for simulation settings.
- Dispatches an `updated` event when the config changes.
- Converts config to a query string for WebSocket connection parameters.
- Provides the current raw config object.

### `static/js/core/SimulationClient.js`
- Manages the WebSocket connection to the backend simulation server.
- Buffers simulation events when the frontend is paused.
- Dispatches DOM events like `sim:connected`, `sim:disconnected`, and `sim:event`.
- Handles reconnect, disconnect, pause, and resume logic.

### `static/js/core/DashboardStats.js`
- Tracks live numeric metrics for the dashboard.
- Records total customers, served customers, lost customers, dine-in, and takeout counts.
- Updates queue lengths and renders those values to DOM elements.
- Includes a reset method to clear all stats.

### `static/js/components/SettingsModal.js`
- Controls the settings modal open/close behavior.
- Pauses the simulation while settings are open.
- Saves updated configuration back to `ConfigState`.
- Supports scenario presets and custom arrival rates.
- Applies config changes when the user clicks save.

### `static/js/ui/AnalyticsModal.js`
- Handles batch analytics UI interactions.
- Prepares a summary before running analysis.
- Sends the current config to the backend `/api/analyze` endpoint.
- Displays results like average wait time, cycle time, throughput, lost customers, and reservations.
- Shows loading state and handles errors.

### `static/js/ui/CafeRenderer.js`
- Moves and animates customers around the visual cafe floor.
- Computes target coordinates for customers in different areas.
- Supports entrance, cashier queues, waiting areas, pickup areas, and VIP check-in.
- Creates and removes customer DOM elements.

### `static/js/ui/CustomerRenderer.js`
- Creates customer avatars and frustration badges.
- Tracks customer mood and frustration levels.
- Displays VIP badges and anger / walkout visuals.
- Removes customers from the UI with an animation.

### `static/js/ui/StaffRenderer.js`
- Draws cashier and barista staff displays.
- Creates staff timers and working icons.
- Shows service progress for cashiers and baristas.
- Clears timers when simulation stops.

### `static/js/ui/TableRenderer.js`
- Draws the cafe tables and reservation state.
- Marks reserved, occupied, and available tables.
- Displays countdown timers for reserved tables.
- Displays elapsed time for occupied tables.

## Tests

### `tests/DashboardStats.test.js`
- A JavaScript unit test for `DashboardStats`.
- Verifies arrival counting, served counts, lost customers, queue length updates, and reset behavior.
- Uses Node's `assert` library to check expected values.

## Package and Tooling

### `package.json`
- Defines the project name and module type (`module`).
- Includes a test script that runs the dashboard stats test.

## Other Files and Utilities

### `Dockerfile`
- A file for containerizing the project.
- Likely used to package the backend environment.

### `requirements.txt`
- Python dependencies for the backend.
- Used to install packages like FastAPI, simpy, and uvicorn.

### `edit_docx_final.py`, `inspect_docx.py`, `format_word.cjs`, `wrap_presentation.cjs`
- Utility scripts likely related to project documentation and artifacts.
- Not directly part of the cafe simulation runtime.

### `deploy_hf/`
- A folder that may contain deployment helpers, possibly for Hugging Face or similar.
- Not required to run the simulation.

### `process_diagram.mmd` and `process_diagram.png`
- Diagram files documenting the simulation process.
- Useful for visualizing architecture or flow.

## Summary
- `main.py` and `engine/` are the backend simulation engine.
- `static/` contains the frontend UI, config, drawing logic, and user interactions.
- `tests/` contains a small unit test for dashboard stats.
- `data.md` now holds this full component summary for the project.
