import simpy
import random
from .customer_flows import customer_process

class CafeEnvironment:
    def __init__(self, env, event_queue, config):
        self.env = env
        self.event_queue = event_queue
        self.config = config
        
        self.cashiers = [simpy.Resource(env, capacity=1) for _ in range(config["cashier_count"])]
        
        # Use a Store to track specific barista IDs
        self.baristas = simpy.Store(env, capacity=config["barista_count"])
        for i in range(config["barista_count"]):
            self.baristas.put(i)
            
        self.tables = []
        for i in range(max(1, config.get("table_count", 1))):
            self.tables.append({"id": i, "status": "available", "reserved_for": None, "limit": 0, "reserve_time": 0})
        
        self.customer_count = 0
        
        # KPI Tracking
        self.waiting_times = []
        self.cycle_times = []
        self.completed_customers = 0
        self.lost_customers = 0

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
        
        try:
            self.event_queue.put_nowait(payload)
        except Exception:
            pass 

    def reservation_manager(self, name):
        """Finds an available table, locks it, and schedules the VIP to arrive later."""
        # Find available table
        available = [t for t in self.tables if t["status"] == "available"]
        if not available:
            # If no tables are available to reserve, they just spawn as a normal customer
            self.env.process(customer_process(self.env, self, name, self.config, force_takeout=False, is_reservation=False))
            return
            
        table = random.choice(available)
        table["status"] = "reserved"
        table["reserved_for"] = name
        table["reserve_time"] = self.env.now
        
        arrival_limit = random.uniform(self.config.get("res_arrival_min", 30), self.config.get("res_arrival_max", 180))
        table["limit"] = arrival_limit
        
        self.emit("table_reserved", "system", {"table_id": table["id"], "limit": arrival_limit})
        
        # Determine actual arrival delay (80% chance on time, 20% late)
        is_late = random.random() < 0.2
        if is_late:
            delay = arrival_limit + random.uniform(10.0, 60.0)
        else:
            delay = arrival_limit - random.uniform(5.0, arrival_limit * 0.8)
            
        yield self.env.timeout(delay)
        
        # VIP Arrives!
        self.env.process(customer_process(self.env, self, name, self.config, force_takeout=False, is_reservation=True))

    def run(self):
        # Spawning loop
        yield self.env.timeout(random.uniform(1.0, 3.0))
        self.customer_count += 1
        name = f"Cust-{self.customer_count}"
        self.env.process(customer_process(self.env, self, name, self.config, force_takeout=False, is_reservation=False))
        
        # Start table expiry checker loop
        self.env.process(self.table_expiry_checker())
        
        while True:
            # Deterministic/Exponential arrival
            arrival_interval = random.expovariate(1.0 / self.config["avg_arrival_time"])
            yield self.env.timeout(arrival_interval)
            
            self.customer_count += 1
            name = f"Cust-{self.customer_count}"
            
            is_vip = random.random() < self.config.get("res_prob", 0.2)
            if is_vip:
                self.env.process(self.reservation_manager(name))
            else:
                self.env.process(customer_process(self.env, self, name, self.config, force_takeout=False, is_reservation=False))

    def table_expiry_checker(self):
        while True:
            yield self.env.timeout(5.0) # Check every 5 seconds
            for table in self.tables:
                if table["status"] == "reserved":
                    elapsed = self.env.now - table["reserve_time"]
                    if elapsed > table["limit"]:
                        table["status"] = "available"
                        table["reserved_for"] = None
                        self.emit("table_unreserved", "system", {"table_id": table["id"]})

    def warmup_timer(self):
        yield self.env.timeout(self.config["warmup_time"])
        self.emit("warmup_complete", "System")

    def tick_timer(self):
        while True:
            self.emit("tick", "System")
            yield self.env.timeout(0.1)
