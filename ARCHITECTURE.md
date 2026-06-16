# Architecture Overview
# Catsy Cafe: Simulation Architecture & Deployment Overview

This document provides a comprehensive overview of the Catsy Cafe Modeling Simulation, detailing why it was built, the technologies used, how the components communicate, and how it is deployed to the web.

---

## The Goal: What Problems Does This Solve?

The primary goal of this simulation is to solve operational bottlenecks and resource allocation inefficiencies in a coffee shop environment. In real-world hospitality, testing new floor layouts, hiring more staff, or changing service logic (like implementing a reservation system) is extremely expensive, disruptive, and risky.

This simulation solves that problem by providing a risk-free, mathematically accurate digital twin of the cafe. It allows stakeholders to:

- **Identify Bottlenecks:** Visually and statistically prove where delays occur (e.g., discovering that 1 cashier cannot handle peak hour traffic even if there are 2 baristas).  
- **Predict Customer Satisfaction:** Track how long customers wait, when they get frustrated, and exactly how many walk out due to long lines.  
- **Test Business Logic:** Experiment with takeout probabilities, reservation policies, and table limits to see how they impact total throughput and revenue before implementing them in real life.  

---

## How It Was Built (The Tech Stack)

1. **SimPy (Python Discrete-Event Engine)**  
   - *Purpose:* The absolute core of the simulation math.  
   - *Functionality:* SimPy handles the virtual clock, manages physical resources (Cashiers, Baristas, Tables), and tracks customer journeys. It natively handles queuing theory logic like customers *reneging* (leaving the queue if they wait too long) or *balking* (walking away if the queue is too long).  

2. **FastAPI (Python Backend Server)**  
   - *Purpose:* The asynchronous web framework that serves the application.  
   - *Functionality:* FastAPI bridges the SimPy math engine to the web browser. It exposes endpoints necessary to stream live data or rapidly calculate massive batches of statistical data without freezing the server.  

3. **Vanilla JS, HTML, CSS (Frontend Interface)**  
   - *Purpose:* The visual dashboard and user interface.  
   - *Functionality:* Pure, dependency-free web technologies were used instead of heavy frameworks (like React) to ensure maximum rendering performance. The frontend handles state management, interactive sliders, and the dynamic 2D visual layout that animates customers moving across the screen based on backend events.  

---

## How They Are Connected (Data Flow)

The architecture uses two communication pipelines depending on the user’s action:

### Pipeline A: Live Visual Simulation (WebSockets)
- **Connection:** Browser opens a persistent, bi-directional WebSocket connection to FastAPI.  
- **Parameter Passing:** Browser sends all slider configurations (Cashier count, Arrival Rate, etc.) through the WebSocket handshake.  
- **Event Streaming:** SimPy engine ticks at 60 FPS, emitting JSON payloads for each event.  
- **Rendering:** JavaScript frontend receives JSON and updates the DOM (e.g., moving a customer emoji from queue to cashier).  

### Pipeline B: Statistical Batch Analytics (REST API)
- **Connection:** Browser sends HTTP POST request to `/api/analyze`.  
- **Headless Execution:** FastAPI runs SimPy in headless mode, fast-forwarding through 10 days of operations in <2 seconds.  
- **Aggregation:** Python calculates averages (Wait Time, Cycle Time, Walkouts).  
- **Rendering:** Frontend displays results in a pop-up modal.  

---

## How It Is Deployed

The application is deployed publicly on **Hugging Face Spaces**, utilizing Docker containerization to ensure consistency.

- **Dockerization:** Custom Dockerfile defines a lightweight Linux environment, installs Python 3.9, dependencies (FastAPI, Uvicorn, SimPy), and exposes port 7860.  
- **Continuous Integration (CI):** Code hosted on GitHub.  
- **Hugging Face Spaces:** Automatically detects Dockerfile, builds dependencies, and deploys the web server. Provides a free, scalable, and instantly accessible public URL for the simulation.  

---
