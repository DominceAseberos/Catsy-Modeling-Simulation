import simpy
import simpy.rt
import random
import time
import asyncio
import threading

# Configuration Parameters (Adjustable)
CONFIG = {
    "cashier_count": 1,
    "barista_count": 2,
    "table_count": 5,
    "avg_arrival_time": 2.0,  # 1 customer every 2 seconds (fast for demo)
    "avg_order_time": 1.0,    # 1 second to order
    "avg_prep_time": 4.0,     # 4 seconds to prep
    "avg_dwell_time": 10.0,   # 10 seconds to drink at table
}

class CafeSimulation:
    def __init__(self, env, event_queue, config):
        self.env = env
        self.event_queue = event_queue
        self.config = config
        
        self.cashiers = [simpy.Resource(env, capacity=1) for _ in range(config["cashier_count"])]
        
        # Use a Store to track specific barista IDs
        self.baristas = simpy.Store(env, capacity=config["barista_count"])
        for i in range(config["barista_count"]):
            self.baristas.put(i)
            
        self.regular_tables = simpy.Resource(env, capacity=max(1, config.get("table_count", 1)))
        self.reservation_tables = simpy.Resource(env, capacity=max(1, config.get("res_table_count", 0)))
        
        self.customer_count = 0
        
        # KPI Tracking
        self.waiting_times = []
        self.cycle_times = []
        self.completed_customers = 0

    def emit(self, event_type, customer_id, extra=None):
        if self.event_queue is None:
            return
            
        payload = {
            "time": round(self.env.now, 2),
            "event": event_type,
            "customer_id": customer_id
        }
        if extra:
            payload.update(extra)
        
        # Put into the asyncio queue in a thread-safe manner
        try:
            self.event_queue.put_nowait(payload)
        except Exception as e:
            pass # Queue might be full or closed

    def _get_prep_time_and_emit_pace(self):
        queue_len = len(self.baristas.get_queue)
        pace = "Steady"
        if queue_len >= 4:
            pace = "Peak"
        elif queue_len == 0:
            pace = "Quiet"
            
        self.emit("pace_change", "system", {"pace": pace})
        
        prep_mode = (self.config["prep_min"] + self.config["prep_max"]) / 2.0
        prep_time = random.triangular(self.config["prep_min"], self.config["prep_max"], prep_mode)
        
        if pace == "Peak":
            prep_time *= 0.75 # 25% reduction Batch Prep
            
        return prep_time

    def customer(self, name):
        self.emit("arrive", name)
        arrival_time = self.env.now
        
        # Spend a moment walking into the shop and looking around before joining a queue
        yield self.env.timeout(random.uniform(1.0, 2.0))
        
        # Determine customer type
        is_takeout = random.random() < self.config.get("takeout_prob", 0.5)
        is_reservation = False
        if not is_takeout and self.config.get("res_table_count", 0) > 0:
            is_reservation = random.random() < self.config.get("res_prob", 0.0)
            
        if is_reservation:
            # VIP PRE-ORDER FLOW (Bypass cashier and prep)
            self.emit("waiting_table", name, {"is_reservation": True})
            with self.reservation_tables.request() as req:
                if self.event_queue is None:
                    yield req
                else:
                    while True:
                        results = yield req | self.env.timeout(15.0)
                        if req in results:
                            break
                    
                self.emit("seated_waiting_order", name, {"is_reservation": True})
                # Drink is already made and waiting for them
                yield self.env.timeout(1.0)
                self.emit("served", name)
                
                yield self.env.timeout(random.uniform(self.config["dwell_min"], self.config["dwell_max"]))
                
            self.emit("leave", name)
            if self.env.now > self.config.get("warmup_time", 0):
                self.cycle_times.append(self.env.now - arrival_time)
                self.completed_customers += 1
            return
            
        # WALK-IN FLOW (Regular Takeout or Dine-in)
        # 1. Cashier Queue
        
        # Find shortest queue (including the person currently ordering)
        shortest_queue_idx = 0
        min_len = self.cashiers[0].count + len(self.cashiers[0].queue)
        for i in range(1, len(self.cashiers)):
            q_len = self.cashiers[i].count + len(self.cashiers[i].queue)
            if q_len < min_len:
                min_len = q_len
                shortest_queue_idx = i
        
        # Balking logic: If the shortest line is too long, they might find another coffee shop!
        if min_len >= 8:
            if random.random() < self.config.get("balk_prob", 0.5): 
                # Emit event to show they are considering leaving
                self.emit("balking_start", name)
                # Spend a longer moment looking at the long line before turning around
                yield self.env.timeout(random.uniform(4.0, 8.0))
                self.emit("balk_leave", name)
                return
                
        self.emit("queue_cashier", name, {"cashier_index": shortest_queue_idx})
        
        target_cashier = self.cashiers[shortest_queue_idx]
        
        # Decide if they have infinite patience based on renege_prob
        will_renege = random.random() < self.config.get("renege_prob", 0.3)
        max_strikes = random.randint(1, self.config.get("max_strikes", 3)) if will_renege else float('inf')
        patience_interval = random.uniform(15.0, 30.0)
        strikes = 0
        
        with target_cashier.request() as req:
            if self.event_queue is None:
                if will_renege:
                    total_patience = sum(random.uniform(15.0, 30.0) for _ in range(max_strikes))
                    results = yield req | self.env.timeout(total_patience)
                    if req in results:
                        wait_time = self.env.now - arrival_time
                        if self.env.now > self.config.get("warmup_time", 0):
                            self.waiting_times.append(wait_time)
                    else:
                        return
                else:
                    yield req
                    wait_time = self.env.now - arrival_time
                    if self.env.now > self.config.get("warmup_time", 0):
                        self.waiting_times.append(wait_time)
            else:
                while True:
                    results = yield req | self.env.timeout(patience_interval)
                    
                    if req in results:
                        # Record waiting time
                        wait_time = self.env.now - arrival_time
                        if self.env.now > self.config.get("warmup_time", 0):
                            self.waiting_times.append(wait_time)
                        break # We reached the front of the queue!
                        
                    # Patience interval passed!
                    position = -1
                    if req in target_cashier.queue:
                        position = target_cashier.queue.index(req)
                        
                    # If they are 1st, 2nd, or 3rd in line, sunk cost fallacy kicks in
                    if position >= 0 and position <= 2:
                        self.emit("frustrated_waiting", name)
                        yield req # Stick it out and wait indefinitely
                        break
                    
                    # Otherwise, they get a strike
                    strikes += 1
                    if strikes >= max_strikes:
                        # They've hit their limit, they leave
                        self.emit("renege_leave", name, {"cashier_index": shortest_queue_idx})
                        return
                    else:
                        # Warning strike!
                        self.emit("patience_warning", name, {"strike": strikes, "max": max_strikes})
            
            # Deciding Time
            decide_time = random.uniform(self.config["decide_min"], self.config["decide_max"])
            pay_time = random.uniform(self.config["pay_min"], self.config["pay_max"])
            total_cashier_time = decide_time + pay_time
            
            # Deciding Time
            self.emit("start_deciding", name, {
                "cashier_index": shortest_queue_idx, 
                "duration": total_cashier_time
            })
            yield self.env.timeout(decide_time)
            
            # Payment Processing Time
            self.emit("start_paying", name, {"cashier_index": shortest_queue_idx})
            yield self.env.timeout(pay_time)
        
        if is_takeout:
            # Takeout Flow: Go to pickup area, wait for barista, get drink, leave
            self.emit("waiting_pickup", name)
            
            barista_req = self.baristas.get()
            if self.event_queue is None:
                barista_idx = yield barista_req
            else:
                while True:
                    results = yield barista_req | self.env.timeout(60.0)
                    if barista_req in results:
                        barista_idx = results[barista_req]
                        break
                    self.emit("prep_waiting_frustration", name)
                
            prep_time = self._get_prep_time_and_emit_pace()
            self.emit("start_prep", name, {
                "barista_index": barista_idx,
                "duration": prep_time
            })
            
            if self.event_queue is None:
                yield self.env.timeout(prep_time)
            else:
                elapsed = 0.0
                while elapsed < prep_time:
                    chunk = min(60.0, prep_time - elapsed)
                    yield self.env.timeout(chunk)
                    elapsed += chunk
                    if elapsed < prep_time:
                        self.emit("prep_waiting_frustration", name)
                    
            self.baristas.put(barista_idx) # Free the barista
            
            self.emit("served", name)
            # Immediate leave since takeout
            self.emit("leave", name)
            
            if self.env.now > self.config.get("warmup_time", 0):
                self.cycle_times.append(self.env.now - arrival_time)
                self.completed_customers += 1
            
        else:
            # Dine-In Flow (Regular Walk-in): 2. Find a Table (or wait in Waiting Area)
            self.emit("waiting_table", name, {"is_reservation": False})
            
            def make_drink():
                barista_req = self.baristas.get()
                if self.event_queue is None:
                    barista_idx = yield barista_req
                else:
                    while True:
                        results = yield barista_req | self.env.timeout(60.0)
                        if barista_req in results:
                            barista_idx = results[barista_req]
                            break
                        self.emit("prep_waiting_frustration", name)
                    
                prep_time = self._get_prep_time_and_emit_pace()
                self.emit("start_prep", name, {
                    "barista_index": barista_idx,
                    "duration": prep_time
                })
                
                if self.event_queue is None:
                    yield self.env.timeout(prep_time)
                else:
                    elapsed = 0.0
                    while elapsed < prep_time:
                        chunk = min(60.0, prep_time - elapsed)
                        yield self.env.timeout(chunk)
                        elapsed += chunk
                        if elapsed < prep_time:
                            self.emit("prep_waiting_frustration", name)
                        
                self.baristas.put(barista_idx) # Free the barista
                
            # Start making the drink concurrently
            drink_proc = self.env.process(make_drink())
            
            with self.regular_tables.request() as req:
                if self.event_queue is None:
                    yield req
                else:
                    while True:
                        results = yield req | self.env.timeout(60.0)
                        if req in results:
                            break
                        self.emit("prep_waiting_frustration", name)
                    
                # Customer is now seated, but waiting for their order
                self.emit("seated_waiting_order", name, {"is_reservation": is_reservation})
                
                # Wait for the drink to be ready if it isn't already
                yield drink_proc
                
                # 4. Order is served, Customer eats/drinks
                self.emit("served", name)
                yield self.env.timeout(random.uniform(self.config["dwell_min"], self.config["dwell_max"]))
                
            # 5. Customer leaves, table is freed
            self.emit("leave", name)
            
            if self.env.now > self.config.get("warmup_time", 0):
                self.cycle_times.append(self.env.now - arrival_time)
                self.completed_customers += 1

    def run(self):
        while True:
            # Use Uniform distribution to remove bursty (simultaneous) traffic
            avg = self.config["avg_arrival_time"]
            t = random.uniform(avg * 0.5, avg * 1.5)
            yield self.env.timeout(t)
            
            self.customer_count += 1
            name = f"Cust-{self.customer_count}"
            self.env.process(self.customer(name))

    def warmup_timer(self):
        yield self.env.timeout(self.config["warmup_time"])
        self.emit("warmup_complete", "System")

    def tick_timer(self):
        while True:
            self.emit("tick", "System")
            yield self.env.timeout(0.1)

def start_simulation(event_queue, config, speed_factor=1.0):
    """
    Runs the SimPy RealtimeEnvironment in the current thread.
    speed_factor = 1.0 means 1 simulation second = 1 real second.
    """
    env = simpy.rt.RealtimeEnvironment(factor=speed_factor, strict=False)
    cafe = CafeSimulation(env, event_queue, config)
    env.process(cafe.run())
    env.process(cafe.tick_timer())
    
    if config.get("warmup_time", 0) > 0:
        env.process(cafe.warmup_timer())
    
    # Run indefinitely
    try:
        env.run()
    except Exception as e:
        print("Simulation stopped:", e)

def run_batch_simulation(config, replications=50, sim_time_seconds=3600):
    """
    Runs headless, fast-forwarded simulations for statistical analysis.
    sim_time_seconds defaults to 1 hour (3600s).
    """
    import random
    import simpy
    
    global_wait = []
    global_cycle = []
    global_throughput = []
    
    warmup = config.get("warmup_time", 0)
    active_time = sim_time_seconds - warmup
    
    for r in range(replications):
        random.seed(r)
        
        # Use standard environment (fast-forward)
        env = simpy.Environment()
        
        # event_queue=None means emit() will safely ignore UI events
        cafe = CafeSimulation(env, None, config)
        env.process(cafe.run())
        
        if warmup > 0:
            env.process(cafe.warmup_timer())
            
        env.run(until=sim_time_seconds)
        
        if cafe.waiting_times:
            global_wait.append(sum(cafe.waiting_times) / len(cafe.waiting_times))
        if cafe.cycle_times:
            global_cycle.append(sum(cafe.cycle_times) / len(cafe.cycle_times))
            
        if active_time > 0:
            throughput_per_sec = cafe.completed_customers / active_time
            throughput_per_hour = throughput_per_sec * 3600
            global_throughput.append(throughput_per_hour)
            
    return {
        "avg_wait_time": float(sum(global_wait) / len(global_wait)) if global_wait else 0.0,
        "avg_cycle_time": float(sum(global_cycle) / len(global_cycle)) if global_cycle else 0.0,
        "throughput_per_hour": float(sum(global_throughput) / len(global_throughput)) if global_throughput else 0.0,
        "replications": replications
    }
