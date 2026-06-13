from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
import threading
import json
import uvicorn

from pydantic import BaseModel
from simulation import start_simulation, run_batch_simulation

app = FastAPI(title="Catsy Simulation")

# Mount static files for HTML/CSS/JS
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
@app.head("/")
async def get_index():
    return FileResponse("static/index.html")

class SimConfig(BaseModel):
    cashiers: int
    baristas: int
    tables: int
    resTables: int
    arrival: float
    decideMin: float
    decideMax: float
    payMin: float
    payMax: float
    prepMin: float
    prepMax: float
    dwellMin: float
    dwellMax: float
    balkProb: float
    renegeProb: float
    maxStrikes: int
    takeoutProb: float
    resProb: float
    warmupTime: float
    replications: int
    duration: int = 7200

@app.post("/api/analyze")
async def analyze_simulation(cfg: SimConfig):
    import asyncio
    config = {
        "cashier_count": cfg.cashiers,
        "barista_count": cfg.baristas,
        "table_count": cfg.tables,
        "res_table_count": cfg.resTables,
        "avg_arrival_time": cfg.arrival,
        "decide_min": cfg.decideMin,
        "decide_max": cfg.decideMax,
        "pay_min": cfg.payMin,
        "pay_max": cfg.payMax,
        "prep_min": cfg.prepMin,
        "prep_max": cfg.prepMax,
        "dwell_min": cfg.dwellMin,
        "dwell_max": cfg.dwellMax,
        "balk_prob": cfg.balkProb,
        "renege_prob": cfg.renegeProb,
        "max_strikes": cfg.maxStrikes,
        "takeout_prob": cfg.takeoutProb,
        "res_prob": cfg.resProb,
        "warmup_time": cfg.warmupTime,
    }
    
    rep_count = cfg.replications if hasattr(cfg, 'replications') else 10
    duration_s = cfg.duration if hasattr(cfg, 'duration') and cfg.duration else 7200
    
    # Run replications in a threadpool to prevent freezing the server
    results = await asyncio.to_thread(run_batch_simulation, config, rep_count, duration_s)
    return results

# Background task queue for this specific connection
# (To support multiple connections properly, we'd need a ConnectionManager, but for a single UI this is fine)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Parse dynamic configuration
    cashiers = int(websocket.query_params.get("cashiers", 1))
    baristas = int(websocket.query_params.get("baristas", 2))
    tables = int(websocket.query_params.get("tables", 5))
    res_tables = int(websocket.query_params.get("resTables", 2))
    arrival = float(websocket.query_params.get("arrival", 3.0))
    
    decide_min = float(websocket.query_params.get("decideMin", 10.0))
    decide_max = float(websocket.query_params.get("decideMax", 60.0))
    pay_min = float(websocket.query_params.get("payMin", 2.0))
    pay_max = float(websocket.query_params.get("payMax", 10.0))
    prep_min = float(websocket.query_params.get("prepMin", 120.0))
    prep_max = float(websocket.query_params.get("prepMax", 300.0))
    dwell_min = float(websocket.query_params.get("dwellMin", 900.0))
    dwell_max = float(websocket.query_params.get("dwellMax", 3600.0))
    duration_str = websocket.query_params.get("duration", "0")
    balk_prob = float(websocket.query_params.get("balkProb", 0.5))
    renege_prob = float(websocket.query_params.get("renegeProb", 0.3))
    max_strikes = int(websocket.query_params.get("maxStrikes", 3))
    takeout_prob = float(websocket.query_params.get("takeoutProb", 0.5))
    res_prob = float(websocket.query_params.get("resProb", 0.2))
    warmup_time = float(websocket.query_params.get("warmupTime", 0.0))
    
    config = {
        "cashier_count": cashiers,
        "barista_count": baristas,
        "table_count": tables,
        "res_table_count": res_tables,
        "avg_arrival_time": arrival,
        "decide_min": decide_min,
        "decide_max": decide_max,
        "pay_min": pay_min,
        "pay_max": pay_max,
        "prep_min": prep_min,
        "prep_max": prep_max,
        "dwell_min": dwell_min,
        "dwell_max": dwell_max,
        "duration": float(duration_str) if duration_str else 0,
        "balk_prob": balk_prob,
        "renege_prob": renege_prob,
        "max_strikes": max_strikes,
        "takeout_prob": takeout_prob,
        "res_prob": res_prob,
        "warmup_time": warmup_time,
    }
    
    import queue
    thread_queue = queue.Queue()
    
    def run_sim():
        # Pass config to simulation
        start_simulation(thread_queue, config, speed_factor=0.5)

    sim_thread = threading.Thread(target=run_sim, daemon=True)
    sim_thread.start()
    
    try:
        while True:
            # Check for events from the simulation thread
            try:
                event = thread_queue.get_nowait()
                await websocket.send_text(json.dumps(event))
            except queue.Empty:
                await asyncio.sleep(0.01) # Yield to event loop
    except WebSocketDisconnect:
        print("Client disconnected")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
